import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

function spawnDaemon({ lockDir, token }) {
  return spawn('node', ['bin/openclaw-bridge-daemon.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      OPENCLAW_DAEMON_TEST_MODE: 'mock',
      OPENCLAW_WS_TOKEN: token,
      OPENCLAW_BASE_WS_URL: 'ws://127.0.0.1:10100',
      OPENCLAW_LOCK_DIR: lockDir
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function waitForOutput(stream, pattern, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting output: ${pattern}`));
    }, timeoutMs);
    const onData = (chunk) => {
      buffer += chunk.toString();
      if (pattern.test(buffer)) {
        cleanup();
        resolve(buffer);
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      stream.off('data', onData);
    };
    stream.on('data', onData);
  });
}

function waitForExit(child, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('child exit timeout'));
    }, timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

test('daemon process enforces strict single-active for same token', async () => {
  const lockDir = await mkdtemp(path.join(os.tmpdir(), 'daemon-proc-lock-'));
  const first = spawnDaemon({ lockDir, token: 'proc-token' });
  await waitForOutput(first.stdout, /\[glance-bridge-daemon\] connected/);

  const second = spawnDaemon({ lockDir, token: 'proc-token' });
  const secondExit = await waitForExit(second);
  assert.equal(secondExit.code, 2);

  first.kill('SIGTERM');
  const firstExit = await waitForExit(first);
  assert.equal(firstExit.code, 0);
});
