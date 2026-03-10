import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import plugin from '../index.js';
import { BridgeRuntime } from '../src/runtime/BridgeRuntime.js';
import { stopPluginRuntime } from '../src/plugin/index.js';

test('plugin register exposes control api and tool registrations', async () => {
  const lockDir = await mkdtemp(path.join(os.tmpdir(), 'plugin-control-lock-'));
  const originalConnectOnce = BridgeRuntime.prototype._connectOnce;
  const originalRequest = BridgeRuntime.prototype.request;
  const requests = [];

  BridgeRuntime.prototype._connectOnce = async function mockConnect() {
    this.connected = true;
    this.emit('connected');
  };
  BridgeRuntime.prototype.request = async function mockRequest(type, payload) {
    requests.push({ type, payload });
    return { success: true, type, payload };
  };

  try {
    const tools = [];
    const api = {
      runtime: {
        dispatchReply: async () => {}
      },
      config: {
        plugins: {
          entries: {
            'openclaw-glance-plugin': {
              config: {
                baseWsUrl: 'ws://127.0.0.1:10092',
                token: 'unit-token-ctrl',
                lockDir
              }
            }
          }
        }
      },
      registerTool(def) {
        tools.push(def?.name);
      },
      onShutdown() {}
    };

    plugin.register(api);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(typeof api.glanceBridge?.queryTickerData, 'function');
    assert.equal(typeof api.glanceBridge?.createWatch, 'function');
    assert.equal(typeof api.glanceBridge?.pauseWatch, 'function');
    assert.equal(typeof api.glanceBridge?.activateWatch, 'function');
    assert.equal(typeof api.glanceBridge?.deleteWatch, 'function');

    await api.glanceBridge.queryTickerData({
      stockCode: '00700',
      market: 'HK',
      productType: 'hk_stock'
    });
    await api.glanceBridge.createWatch({ product_code: '00700', product_type: 'hk_stock' });
    await api.glanceBridge.pauseWatch('s-1');
    await api.glanceBridge.activateWatch('s-1');
    await api.glanceBridge.deleteWatch('s-1');

    assert.deepEqual(tools.sort(), [
      'watch.activate',
      'watch.create',
      'watch.pause',
      'watch.query_ticker',
      'watch.remove'
    ]);

    assert.equal(requests[0].type, 'ticker.query');
    assert.equal(requests[1].type, 'watch.create');
    assert.equal(requests[2].type, 'watch.pause');
    assert.equal(requests[3].type, 'watch.activate');
    assert.equal(requests[4].type, 'watch.delete');
  } finally {
    await stopPluginRuntime();
    BridgeRuntime.prototype._connectOnce = originalConnectOnce;
    BridgeRuntime.prototype.request = originalRequest;
  }
});

test('plugin register supports openclaw-style registerTool execute signature', async () => {
  const lockDir = await mkdtemp(path.join(os.tmpdir(), 'plugin-control-lock-'));
  const originalConnectOnce = BridgeRuntime.prototype._connectOnce;
  const originalRequest = BridgeRuntime.prototype.request;
  const calls = [];

  BridgeRuntime.prototype._connectOnce = async function mockConnect() {
    this.connected = true;
    this.emit('connected');
  };
  BridgeRuntime.prototype.request = async function mockRequest(type, payload) {
    calls.push({ type, payload });
    return { success: true, type, payload };
  };

  try {
    const toolDefs = [];
    const api = {
      runtime: {
        dispatchReply: async () => {}
      },
      config: {
        plugins: {
          entries: {
            'openclaw-glance-plugin': {
              config: {
                baseWsUrl: 'ws://127.0.0.1:10093',
                token: 'unit-token-tool',
                lockDir
              }
            }
          }
        }
      },
      registerTool(def, meta) {
        toolDefs.push({ def, meta });
      },
      onShutdown() {}
    };

    plugin.register(api);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const queryDef = toolDefs.find((x) => x.def?.name === 'watch.query_ticker');
    assert.ok(queryDef, 'watch.query_ticker tool should be registered');
    assert.equal(typeof queryDef.def.execute, 'function');
    assert.equal(queryDef.meta?.name, 'watch.query_ticker');

    await queryDef.def.execute('tool-call-1', {
      stockCode: '00700',
      productType: 'hk_stock',
      market: 'HK'
    });
    assert.equal(calls[0]?.type, 'ticker.query');
  } finally {
    await stopPluginRuntime();
    BridgeRuntime.prototype._connectOnce = originalConnectOnce;
    BridgeRuntime.prototype.request = originalRequest;
  }
});
