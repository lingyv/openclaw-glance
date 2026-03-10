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
