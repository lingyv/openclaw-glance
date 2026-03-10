#!/usr/bin/env node
import process from 'node:process';

import { resolveRuntimeConfig } from '../src/config/runtime-config.js';
import { BridgeRuntime } from '../src/runtime/BridgeRuntime.js';
import { DaemonDispatcher } from '../src/runtime/dispatchers/DaemonDispatcher.js';
import { ProcessLock, SingleActiveConflictError } from '../src/runtime/lock/ProcessLock.js';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(`openclaw-bridge-daemon

Required env:
  OPENCLAW_WS_TOKEN

Optional env:
  OPENCLAW_BASE_WS_URL
  OPENCLAW_LOCK_DIR
`);
  process.exit(0);
}

const config = resolveRuntimeConfig();
if (!config.token) {
  console.error('[glance-bridge-daemon] OPENCLAW_WS_TOKEN is required');
  process.exit(1);
}

const dispatcher = new DaemonDispatcher({
  onTriggered: async (event) => {
    process.stdout.write(`${JSON.stringify({ type: 'watch.triggered', event })}\n`);
  }
});

const lock = new ProcessLock({
  lockDir: config.lockDir,
  key: config.lockKey
});

const runtime = new BridgeRuntime({
  baseWsUrl: config.baseWsUrl,
  token: config.token,
  dispatcher,
  lock
});

try {
  await runtime.start();
  process.stdout.write(
    `[glance-bridge-daemon] connected baseWsUrl=${config.baseWsUrl} lockKey=${config.lockKey}\n`
  );
} catch (err) {
  if (err instanceof SingleActiveConflictError) {
    process.stderr.write(
      `[glance-bridge-daemon] single-active conflict pid=${err.owner?.pid ?? 'unknown'} startedAt=${err.owner?.startedAt ?? 'unknown'}\n`
    );
    process.exit(2);
  }
  process.stderr.write(`[glance-bridge-daemon] start failed: ${err.message}\n`);
  process.exit(1);
}

const shutdown = async () => {
  await runtime.stop().catch(() => {});
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
