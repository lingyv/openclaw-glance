import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import plugin from '../index.js';
import { BridgeRuntime } from '../src/runtime/BridgeRuntime.js';
import {
  getActivePluginRuntime,
  startPluginRuntime,
  stopPluginRuntime
} from '../src/plugin/index.js';

test('startPluginRuntime routes watch.triggered to openclaw dispatchReply', async () => {
  const lockDir = await mkdtemp(path.join(os.tmpdir(), 'plugin-runtime-lock-'));
  let dispatched = null;

  const originalConnectOnce = BridgeRuntime.prototype._connectOnce;
  BridgeRuntime.prototype._connectOnce = async function mockConnect() {
    this.connected = true;
    this.emit('connected');
  };

  try {
    await startPluginRuntime({
      runtime: {
        dispatchReply: async (payload) => {
          dispatched = payload;
        }
      },
      pluginConfig: {
        baseWsUrl: 'ws://127.0.0.1:10080',
        token: 'unit-token-1',
        lockDir
      }
    });

    const active = getActivePluginRuntime();
    assert.ok(active, 'plugin runtime should be started');

    active._onMessage(
      JSON.stringify({
        type: 'watch.triggered',
        payload: { message: 'trigger content', strategy_id: 's-001' }
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(dispatched?.text, 'trigger content');
    assert.equal(dispatched?.metadata?.source, 'watch.triggered');
    assert.equal(dispatched?.metadata?.event?.payload?.strategy_id, 's-001');
  } finally {
    await stopPluginRuntime();
    BridgeRuntime.prototype._connectOnce = originalConnectOnce;
  }
});

test('plugin.register wires startup and onShutdown cleanup', async () => {
  const lockDir = await mkdtemp(path.join(os.tmpdir(), 'plugin-register-lock-'));
  let shutdownHook = null;
  const originalConnectOnce = BridgeRuntime.prototype._connectOnce;
  BridgeRuntime.prototype._connectOnce = async function mockConnect() {
    this.connected = true;
    this.emit('connected');
  };

  try {
    plugin.register({
      runtime: {
        dispatchReply: async () => {}
      },
      config: {
        plugins: {
          entries: {
            'openclaw-glance-plugin': {
              config: {
                baseWsUrl: 'ws://127.0.0.1:10081',
                token: 'unit-token-2',
                lockDir
              }
            }
          }
        }
      },
      onShutdown(fn) {
        shutdownHook = fn;
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(typeof shutdownHook, 'function');
    assert.ok(getActivePluginRuntime(), 'active plugin runtime should exist after register');

    await shutdownHook();
    assert.equal(getActivePluginRuntime(), null);
  } finally {
    await stopPluginRuntime();
    BridgeRuntime.prototype._connectOnce = originalConnectOnce;
  }
});
