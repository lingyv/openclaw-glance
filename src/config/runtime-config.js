import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { ProcessLock } from '../runtime/lock/ProcessLock.js';

const DEFAULT_BASE_WS_URL = 'wss://glanceup-pre.100credit.cn';

function pick(source, keys, fallback = undefined) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return fallback;
}

export function resolveDefaultLockDir({ env = process.env, cwd = process.cwd() } = {}) {
  const xdgStateHome = pick(env, ['XDG_STATE_HOME']);
  if (xdgStateHome) {
    return path.join(String(xdgStateHome), 'openclaw-locks');
  }

  const homeDir = pick(env, ['HOME', 'USERPROFILE']);
  if (homeDir) {
    return path.join(String(homeDir), '.openclaw-locks');
  }

  const cwdRoot = path.parse(cwd).root;
  if (cwd === cwdRoot) {
    return path.join(os.tmpdir(), 'openclaw-locks');
  }

  return path.join(cwd, '.openclaw-locks');
}

export function resolveRuntimeConfig({ env = process.env, pluginConfig = {} } = {}) {
  const baseWsUrl = String(
    pick(pluginConfig, ['baseWsUrl', 'base_ws_url'], pick(env, ['OPENCLAW_BASE_WS_URL'], DEFAULT_BASE_WS_URL))
  );
  const token = String(pick(pluginConfig, ['token'], pick(env, ['OPENCLAW_WS_TOKEN'], '')));
  const lockDir = String(
    pick(pluginConfig, ['lockDir', 'lock_dir'], pick(env, ['OPENCLAW_LOCK_DIR'], resolveDefaultLockDir({ env })))
  );
  const lockKey = ProcessLock.buildLockKey(baseWsUrl, token);
  if (!token) {
    throw new Error('token is required');
  }
  try {
    const parsed = new URL(baseWsUrl);
    if (!parsed.protocol || !parsed.host) {
      throw new Error('invalid baseWsUrl');
    }
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
      throw new Error(`invalid baseWsUrl protocol: ${parsed.protocol}`);
    }
  } catch (_err) {
    if (String(_err?.message || '').toLowerCase().includes('protocol')) {
      throw _err;
    }
    throw new Error(`invalid baseWsUrl: ${baseWsUrl}`);
  }
  return {
    baseWsUrl,
    token,
    lockDir,
    lockKey
  };
}
