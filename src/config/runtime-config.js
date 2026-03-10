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

export function resolveRuntimeConfig({ env = process.env, pluginConfig = {} } = {}) {
  const baseWsUrl = String(
    pick(pluginConfig, ['baseWsUrl', 'base_ws_url'], pick(env, ['OPENCLAW_BASE_WS_URL'], DEFAULT_BASE_WS_URL))
  );
  const token = String(pick(pluginConfig, ['token'], pick(env, ['OPENCLAW_WS_TOKEN'], '')));
  const lockDir = String(
    pick(pluginConfig, ['lockDir', 'lock_dir'], pick(env, ['OPENCLAW_LOCK_DIR'], path.join(process.cwd(), '.openclaw-locks')))
  );
  const lockKey = ProcessLock.buildLockKey(baseWsUrl, token);
  return {
    baseWsUrl,
    token,
    lockDir,
    lockKey
  };
}
