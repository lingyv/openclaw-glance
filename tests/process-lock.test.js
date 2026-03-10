import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

import { ProcessLock, SingleActiveConflictError } from '../src/runtime/lock/ProcessLock.js';

test('acquire lock fails when active owner exists', async () => {
  const lockDir = await mkdtemp(path.join(os.tmpdir(), 'glance-lock-'));
  const first = new ProcessLock({
    lockDir,
    key: 'ws-token-x',
    heartbeatMs: 60_000,
    staleMs: 60_000
  });
  await first.acquire();

  const second = new ProcessLock({
    lockDir,
    key: 'ws-token-x',
    heartbeatMs: 60_000,
    staleMs: 60_000
  });

  await assert.rejects(second.acquire(), (err) => {
    assert.equal(err instanceof SingleActiveConflictError, true);
    assert.equal(err.code, 'E_SINGLE_ACTIVE_CONFLICT');
    return true;
  });

  await first.release();
});

test('stale lock can be reclaimed when pid dead', async () => {
  const lockDir = await mkdtemp(path.join(os.tmpdir(), 'glance-lock-'));
  const key = 'ws-token-y';
  const now = Date.now();
  const lockFile = path.join(lockDir, 'ws-token-y.lock.json');
  await writeFile(
    lockFile,
    JSON.stringify({
      key,
      pid: 999_999_999,
      startedAt: now - 10_000,
      heartbeatAt: now - 120_000
    }),
    'utf8'
  );

  const owner = new ProcessLock({
    lockDir,
    key,
    heartbeatMs: 60_000,
    staleMs: 1_000
  });

  await owner.acquire();
  const raw = await readFile(lockFile, 'utf8');
  const data = JSON.parse(raw);
  assert.equal(data.pid, process.pid);
  await owner.release();
});

test('concurrent acquire should allow only one owner', async () => {
  const lockDir = await mkdtemp(path.join(os.tmpdir(), 'glance-lock-'));
  const first = new ProcessLock({
    lockDir,
    key: 'ws-token-z',
    heartbeatMs: 60_000,
    staleMs: 60_000
  });
  const second = new ProcessLock({
    lockDir,
    key: 'ws-token-z',
    heartbeatMs: 60_000,
    staleMs: 60_000
  });

  try {
    const results = await Promise.allSettled([first.acquire(), second.acquire()]);
    const successCount = results.filter((x) => x.status === 'fulfilled').length;
    const failCount = results.filter((x) => x.status === 'rejected').length;
    assert.equal(successCount, 1);
    assert.equal(failCount, 1);

    const rejected = results.find((x) => x.status === 'rejected');
    assert.equal(rejected.reason?.code, 'E_SINGLE_ACTIVE_CONFLICT');
  } finally {
    await first.release().catch(() => {});
    await second.release().catch(() => {});
  }
});

test('invalid lock content should not be force-removed by new contender', async () => {
  const lockDir = await mkdtemp(path.join(os.tmpdir(), 'glance-lock-'));
  const key = 'ws-token-invalid';
  const lockFile = path.join(lockDir, `${key}.lock.json`);
  await writeFile(lockFile, '{invalid-json', 'utf8');

  const contender = new ProcessLock({
    lockDir,
    key,
    heartbeatMs: 60_000,
    staleMs: 1_000
  });

  await assert.rejects(contender.acquire(), /invalid lock record/i);
  const stillThere = await readFile(lockFile, 'utf8');
  assert.equal(stillThere, '{invalid-json');
});
