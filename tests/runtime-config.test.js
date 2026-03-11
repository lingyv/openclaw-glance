import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDefaultLockDir, resolveRuntimeConfig } from '../src/config/runtime-config.js';

test('resolveRuntimeConfig should throw when token is missing', () => {
  assert.throws(
    () =>
      resolveRuntimeConfig({
        env: {
          OPENCLAW_BASE_WS_URL: 'wss://glanceup-pre.100credit.cn'
        },
        pluginConfig: {}
      }),
    /token is required/i
  );
});

test('resolveRuntimeConfig should reject non-ws protocols', () => {
  assert.throws(
    () =>
      resolveRuntimeConfig({
        env: {
          OPENCLAW_WS_TOKEN: 'token',
          OPENCLAW_BASE_WS_URL: 'https://glanceup-pre.100credit.cn'
        },
        pluginConfig: {}
      }),
    /invalid baseWsUrl protocol/i
  );
});

test('resolveDefaultLockDir should not use root directory when cwd is /', () => {
  const lockDir = resolveDefaultLockDir({
    env: {},
    cwd: '/'
  });
  assert.notEqual(lockDir, '/.openclaw-locks');
});

test('resolveRuntimeConfig should prefer HOME default lock directory', () => {
  const config = resolveRuntimeConfig({
    env: {
      OPENCLAW_WS_TOKEN: 'token',
      OPENCLAW_BASE_WS_URL: 'wss://glanceup-pre.100credit.cn',
      HOME: '/home/test-user'
    },
    pluginConfig: {}
  });
  assert.equal(config.lockDir, '/home/test-user/.openclaw-locks');
});
