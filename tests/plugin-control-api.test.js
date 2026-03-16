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
  const infoLogs = [];

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
        dispatchReply: async () => {},
        logger: {
          info: (message) => infoLogs.push(String(message))
        }
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
    assert.equal(typeof api.glanceBridge?.sendNotification, 'function');
    assert.equal(typeof api.glanceBridge?.sendSms, 'function');
    assert.equal(typeof api.glanceBridge?.sendCall, 'function');
    assert.equal(typeof api.glanceBridge?.sendEmail, 'function');
    assert.equal(typeof api.glanceBridge?.sendDingtalk, 'function');
    assert.equal(typeof api.glanceBridge?.pauseWatch, 'function');
    assert.equal(typeof api.glanceBridge?.activateWatch, 'function');
    assert.equal(typeof api.glanceBridge?.deleteWatch, 'function');

    await api.glanceBridge.queryTickerData({
      stockCode: '00700',
      market: 'HK',
      productType: 'hk_stock'
    });
    await api.glanceBridge.createWatch({ product_code: '00700', product_type: 'hk_stock' });
    await api.glanceBridge.sendNotification({ channel: 'sms', payload: { receiver: '13800138000' } });
    await api.glanceBridge.sendSms({ receiver: '13800138000', content: 'test sms' });
    await api.glanceBridge.sendCall({ phone: '13800138000', customer_name: 'demo' });
    await api.glanceBridge.sendEmail({ to_address: 'demo@example.com', subject: 'demo' });
    await api.glanceBridge.sendDingtalk({ webhook: 'https://oapi.dingtalk.com/demo', text: 'demo' });
    await api.glanceBridge.pauseWatch('s-1');
    await api.glanceBridge.activateWatch('s-1');
    await api.glanceBridge.deleteWatch('s-1');

    assert.deepEqual(tools.sort(), [
      'notify_call',
      'notify_dingtalk',
      'notify_email',
      'notify_sms',
      'watch_activate',
      'watch_create',
      'watch_pause',
      'watch_query_ticker',
      'watch_remove'
    ]);

    assert.equal(requests[0].type, 'ticker.query');
    assert.equal(requests[1].type, 'watch.create');
    assert.equal(requests[2].type, 'notify.send');
    assert.equal(requests[2].payload.channel, 'sms');
    assert.equal(requests[3].type, 'notify.send');
    assert.equal(requests[3].payload.channel, 'sms');
    assert.equal(requests[4].type, 'notify.send');
    assert.equal(requests[4].payload.channel, 'call');
    assert.equal(requests[5].type, 'notify.send');
    assert.equal(requests[5].payload.channel, 'email');
    assert.equal(requests[6].type, 'notify.send');
    assert.equal(requests[6].payload.channel, 'dingtalk');
    assert.equal(requests[7].type, 'watch.pause');
    assert.equal(requests[8].type, 'watch.activate');
    assert.equal(requests[9].type, 'watch.delete');
    assert.equal(infoLogs.some((line) => line.includes('lockDir=') && line.includes(lockDir)), true);
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

    const queryDef = toolDefs.find((x) => x.def?.name === 'watch_query_ticker');
    assert.ok(queryDef, 'watch_query_ticker tool should be registered');
    assert.equal(typeof queryDef.def.execute, 'function');
    assert.equal(queryDef.meta?.name, 'watch_query_ticker');
    const dingtalkDef = toolDefs.find((x) => x.def?.name === 'notify_dingtalk');
    assert.ok(dingtalkDef, 'notify_dingtalk tool should be registered');
    assert.equal(typeof dingtalkDef.def.execute, 'function');
    const createDef = toolDefs.find((x) => x.def?.name === 'watch_create');
    assert.ok(createDef, 'watch_create tool should be registered');

    await queryDef.def.execute('tool-call-1', {
      stockCode: '00700',
      productType: 'hk_stock',
      market: 'HK'
    });
    await dingtalkDef.def.execute('tool-call-2', {
      webhook: 'https://oapi.dingtalk.com/demo',
      text: 'demo'
    });
    await createDef.def.execute(
      'tool-call-3',
      {
        product_code: 'BTCUSDT',
        product_type: 'crypto',
        operator_type: 'rule',
        operator_parameters: {
          condition: 'price >= threshold',
          variables: { threshold: 100000 }
        }
      },
      undefined,
      {
        channelId: 'dingtalk',
        accountId: 'default',
        sessionKey: 'agent:main:dingtalk:group:cid_demo',
        conversationId: 'cid_demo'
      }
    );
    assert.equal(calls[0]?.type, 'ticker.query');
    assert.equal(calls[1]?.type, 'notify.send');
    assert.equal(calls[1]?.payload?.channel, 'dingtalk');
    assert.equal(calls[2]?.type, 'watch.create');
    assert.equal(calls[2]?.payload?.channel_configs?.openclaw?.channel, 'dingtalk');
    assert.equal(
      calls[2]?.payload?.channel_configs?.openclaw?.session_key,
      'agent:main:dingtalk:group:cid_demo'
    );
  } finally {
    await stopPluginRuntime();
    BridgeRuntime.prototype._connectOnce = originalConnectOnce;
    BridgeRuntime.prototype.request = originalRequest;
  }
});

test('notify wrappers must not allow payload to override channel', async () => {
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
    const api = {
      runtime: {
        dispatchReply: async () => {}
      },
      config: {
        plugins: {
          entries: {
            'openclaw-glance-plugin': {
              config: {
                baseWsUrl: 'ws://127.0.0.1:10094',
                token: 'unit-token-wrapper',
                lockDir
              }
            }
          }
        }
      },
      registerTool() {},
      onShutdown() {}
    };

    plugin.register(api);
    await new Promise((resolve) => setTimeout(resolve, 0));

    await api.glanceBridge.sendSms({
      channel: 'email',
      receiver: '13800138000'
    });
    assert.equal(calls[0]?.type, 'notify.send');
    assert.equal(calls[0]?.payload?.channel, 'sms');
  } finally {
    await stopPluginRuntime();
    BridgeRuntime.prototype._connectOnce = originalConnectOnce;
    BridgeRuntime.prototype.request = originalRequest;
  }
});
