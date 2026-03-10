import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (_err) {
    return false;
  }
}

export class SingleActiveConflictError extends Error {
  constructor(message, owner) {
    super(message);
    this.name = 'SingleActiveConflictError';
    this.code = 'E_SINGLE_ACTIVE_CONFLICT';
    this.owner = owner;
  }
}

export class ProcessLock {
  constructor({
    lockDir = path.join(process.cwd(), '.openclaw-locks'),
    key,
    heartbeatMs = 5000,
    staleMs = 15000,
    now = () => Date.now()
  }) {
    if (!key) throw new Error('lock key is required');
    this.key = key;
    this.lockDir = lockDir;
    this.heartbeatMs = heartbeatMs;
    this.staleMs = staleMs;
    this.now = now;
    this.heartbeatTimer = null;
    this.held = false;
    this.startedAt = null;
  }

  static normalizeKey(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '_')
      .slice(0, 120);
  }

  static buildLockKey(baseWsUrl, token) {
    const tokenHash = createHash('sha256').update(String(token || '')).digest('hex').slice(0, 16);
    return ProcessLock.normalizeKey(`${baseWsUrl || ''}_${tokenHash}`);
  }

  get lockFile() {
    return path.join(this.lockDir, `${this.key}.lock.json`);
  }

  async acquire() {
    await mkdir(this.lockDir, { recursive: true });
    const maxAttempts = 4;
    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt += 1;
      this.startedAt = this.startedAt || this.now();
      try {
        await this._createLockFileExclusive();
        this.held = true;
        this._startHeartbeat();
        return;
      } catch (err) {
        if (err?.code !== 'EEXIST') {
          throw err;
        }
        const previous = await this._readLockRecord();
        if (previous && this._isRecordActive(previous)) {
          throw new SingleActiveConflictError('connection already owned by another process', previous);
        }
        await rm(this.lockFile, { force: true }).catch(() => {});
      }
    }
    throw new Error(`failed to acquire lock after ${maxAttempts} attempts`);
  }

  async release() {
    this._clearHeartbeat();
    this.held = false;
    await rm(this.lockFile, { force: true });
  }

  async _readLockRecord() {
    try {
      const raw = await readFile(this.lockFile, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      if (err?.code === 'ENOENT') {
        return null;
      }
      if (err instanceof SyntaxError) {
        const invalidError = new Error('invalid lock record');
        invalidError.code = 'E_INVALID_LOCK_RECORD';
        throw invalidError;
      }
      throw err;
    }
  }

  _isRecordActive(record) {
    const heartbeatAt = Number(record?.heartbeatAt || 0);
    const fresh = this.now() - heartbeatAt <= this.staleMs;
    const alive = isProcessAlive(Number(record?.pid));
    return Boolean(fresh && alive);
  }

  async _writeRecord() {
    const body = {
      key: this.key,
      pid: process.pid,
      startedAt: this.startedAt || this.now(),
      heartbeatAt: this.now()
    };
    await writeFile(this.lockFile, JSON.stringify(body), 'utf8');
  }

  async _createLockFileExclusive() {
    const body = JSON.stringify({
      key: this.key,
      pid: process.pid,
      startedAt: this.startedAt || this.now(),
      heartbeatAt: this.now()
    });
    const handle = await open(this.lockFile, 'wx');
    try {
      await handle.writeFile(body, 'utf8');
    } finally {
      await handle.close();
    }
  }

  _startHeartbeat() {
    this._clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.held) return;
      this._writeRecord().catch(() => {
        // ignore heartbeat write errors
      });
    }, this.heartbeatMs);
  }

  _clearHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
