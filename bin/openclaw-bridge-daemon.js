#!/usr/bin/env node
import process from 'node:process';

import { resolveRuntimeConfig } from '../src/config/runtime-config.js';
import { startDaemon } from '../src/daemon/start-daemon.js';
import { SingleActiveConflictError } from '../src/runtime/lock/ProcessLock.js';

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

let daemon = null;
const testMode = process.env.OPENCLAW_DAEMON_TEST_MODE || '';

function createMockRuntime() {
  let keepAliveTimer = null;
  return {
    async start() {
      keepAliveTimer = setInterval(() => {}, 1000);
    },
    async stop() {
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
    }
  };
}

try {
  daemon = await startDaemon({
    config,
    onTriggered: async (event) => {
      process.stdout.write(`${JSON.stringify({ type: 'watch.triggered', event })}\n`);
    },
    createRuntime: testMode === 'mock' ? () => createMockRuntime() : undefined
  });
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
  await daemon?.stop?.().catch(() => {});
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
