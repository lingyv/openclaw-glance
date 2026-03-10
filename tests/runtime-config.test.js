import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveRuntimeConfig } from '../src/config/runtime-config.js';

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
