import assert from 'node:assert/strict';
import test from 'node:test';

import { OpenClawBridgeClient } from '../src/OpenClawBridgeClient.js';

function buildClient(extra = {}) {
  return new OpenClawBridgeClient({
    baseWsUrl: 'ws://127.0.0.1:8005',
    token: 'test_token',
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

test('queryTickerData sends ticker.query request', async () => {
  const client = buildClient({ enqueueIfDisconnected: true });
  const sent = [];
  client.connected = true;
  client.ws = {
    readyState: 1,
    send: (raw) => sent.push(JSON.parse(raw))
  };

  const p = client.queryTickerData({ market: 'hk', symbol: '00700' });
  const req = sent[0];
  assert.equal(req.type, 'ticker.query');
  assert.equal(req.payload.market, 'hk');
  assert.equal(req.payload.symbol, '00700');

  client._onMessage(
    JSON.stringify({
      request_id: req.request_id,
      type: 'ticker.query.result',
      success: true,
      http_status: 200,
      quote: { last: 420.1 }
    })
  );
  const resp = await p;
  assert.equal(resp.success, true);
  assert.equal(resp.http_status, 200);
  await client.close();
});

test('listWatches sends watch.list request', async () => {
  const client = buildClient({ enqueueIfDisconnected: true });
  const sent = [];
  client.connected = true;
  client.ws = {
    readyState: 1,
    send: (raw) => sent.push(JSON.parse(raw))
  };

  const p = client.listWatches({ status: 'active', product_code: '00700' });
  const req = sent[0];
  assert.equal(req.type, 'watch.list');
  assert.equal(req.payload.status, 'active');
  assert.equal(req.payload.product_code, '00700');

  client._onMessage(
    JSON.stringify({
      request_id: req.request_id,
      type: 'watch.list.result',
      success: true,
      data: {
        total: 1,
        strategies: [{ strategy_id: 's1' }]
      }
    })
  );
  const resp = await p;
  assert.equal(resp.success, true);
  assert.equal(resp.data.total, 1);
  await client.close();
});

test('on close should not reconnect when stopped', async () => {
  const client = buildClient({ reconnect: true });
  client.stopped = true;
  let reconnectCalled = false;
  client._connectOnce = async () => {
    reconnectCalled = true;
  };

  await client._onClose(1000, 'manual');
  assert.equal(reconnectCalled, false);
});

test('createWatch reuses request_id for timeout retry', async () => {
  const client = buildClient({ requestTimeoutMs: 20, enqueueIfDisconnected: true });
  const sent = [];
  client.connected = true;
  client.ws = {
    readyState: 1,
    send: (raw) => sent.push(JSON.parse(raw))
  };

  await assert.rejects(client.createWatch({ product_code: '00700' }), /request timeout/);
  await assert.rejects(client.createWatch({ product_code: '00700' }), /request timeout/);

  assert.equal(sent.length, 2);
  assert.equal(sent[0].request_id, sent[1].request_id);
  assert.equal(sent[0].payload.request_id, sent[1].payload.request_id);
  await client.close();
});

test('_request reuses request_id for notify.send timeout retry', async () => {
  const client = buildClient({ requestTimeoutMs: 20, enqueueIfDisconnected: true });
  const sent = [];
  client.connected = true;
  client.ws = {
    readyState: 1,
    send: (raw) => sent.push(JSON.parse(raw))
  };

  await assert.rejects(client._request('notify.send', { channel: 'sms', content: 'hi' }), /request timeout/);
  await assert.rejects(client._request('notify.send', { channel: 'sms', content: 'hi' }), /request timeout/);

  assert.equal(sent.length, 2);
  assert.equal(sent[0].request_id, sent[1].request_id);
  assert.equal(sent[0].payload.request_id, sent[1].payload.request_id);
  await client.close();
});
