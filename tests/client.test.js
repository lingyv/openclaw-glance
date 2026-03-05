import assert from 'node:assert/strict';
import test from 'node:test';

import { OpenClawBridgeClient } from '../src/OpenClawBridgeClient.js';

function buildClient(extra = {}) {
  return new OpenClawBridgeClient({
    baseWsUrl: 'ws://127.0.0.1:8005',
    userId: 'u_test',
    token: '',
    requestTimeoutMs: 2000,
    heartbeatMs: 100000,
    ...extra
  });
}

test('enqueue request when disconnected and flush after reconnect', async () => {
  const client = buildClient({ enqueueIfDisconnected: true });

  let sent = [];
  client.connected = true;
  client.ws = {
    readyState: 1,
    send: (raw) => sent.push(JSON.parse(raw))
  };

  const p = client.createWatch({ product_code: '00700' });
  assert.equal(client.requestQueue.length, 0, 'connected path should not queue');

  const req = sent[0];
  assert.equal(req.type, 'watch.create');
  client._onMessage(JSON.stringify({ request_id: req.request_id, type: 'watch.create.result', success: true }));
  const res = await p;
  assert.equal(res.success, true);

  await client.close();
});

test('request gets queued when disconnected and rejected on close', async () => {
  const client = buildClient({ enqueueIfDisconnected: true });

  const p = client.createWatch({ product_code: '00700' });
  assert.equal(client.requestQueue.length, 1);

  await client.close();
  await assert.rejects(p, /connection closed before request sent/);
});

test('request rejects immediately when disconnected and enqueue disabled', async () => {
  const client = buildClient({ enqueueIfDisconnected: false });
  await assert.rejects(client.ping(), /websocket not connected/);
  await client.close();
});
