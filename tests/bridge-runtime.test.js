import assert from 'node:assert/strict';
import test from 'node:test';

import { BridgeRuntime } from '../src/runtime/BridgeRuntime.js';

test('runtime keeps connection alive and emits connected', async () => {
  const runtime = new BridgeRuntime({
    baseWsUrl: 'ws://127.0.0.1:9999',
    token: 't',
    dispatcher: { onTriggered: async () => {} },
    heartbeatMs: 100000
  });

  runtime._connectOnce = async () => {
    runtime.connected = true;
    runtime.emit('connected');
  };

  let connected = false;
  runtime.on('connected', () => {
    connected = true;
  });

  await runtime.start();
  assert.equal(connected, true);
  await runtime.stop();
});

test('runtime dispatches watch.triggered to dispatcher', async () => {
  let triggered = null;
  const runtime = new BridgeRuntime({
    baseWsUrl: 'ws://127.0.0.1:9999',
    token: 't',
    dispatcher: {
      onTriggered: async (evt) => {
        triggered = evt;
      }
    },
    heartbeatMs: 100000
  });

  runtime._onMessage(JSON.stringify({ type: 'watch.triggered', payload: { strategy_id: 's1' } }));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(triggered?.payload?.strategy_id, 's1');
});

test('runtime request rejects and clears pending when ws.send throws', async () => {
  const runtime = new BridgeRuntime({
    baseWsUrl: 'ws://127.0.0.1:9999',
    token: 't',
    dispatcher: { onTriggered: async () => {} },
    heartbeatMs: 100000
  });

  runtime.connected = true;
  runtime.ws = {
    readyState: 1,
    send() {
      throw new Error('send failed');
    }
  };

  await assert.rejects(runtime.request('watch.create', { product_code: '00700' }), /send failed/);
  assert.equal(runtime.pending.size, 0);
});

test('runtime reuses request_id for watch.create timeout retry', async () => {
  const runtime = new BridgeRuntime({
    baseWsUrl: 'ws://127.0.0.1:9999',
    token: 't',
    dispatcher: { onTriggered: async () => {} },
    heartbeatMs: 100000,
    requestTimeoutMs: 20
  });

  const sent = [];
  runtime.connected = true;
  runtime.ws = {
    readyState: 1,
    send(raw) {
      sent.push(JSON.parse(raw));
    }
  };

  await assert.rejects(runtime.request('watch.create', { product_code: '00700' }), /request timeout/);
  await assert.rejects(runtime.request('watch.create', { product_code: '00700' }), /request timeout/);

  assert.equal(sent.length, 2);
  assert.equal(sent[0].request_id, sent[1].request_id);
  assert.equal(sent[0].payload.request_id, sent[1].payload.request_id);
});
