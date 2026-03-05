import assert from 'node:assert/strict';
import test from 'node:test';

import { OpenClawPluginAdapter } from '../src/OpenClawPluginAdapter.js';

class FakeClient {
  constructor() {
    this.calls = [];
  }

  async connect() {
    this.calls.push(['connect']);
  }

  async close() {
    this.calls.push(['close']);
  }

  on() {
    // ignore
  }

  async createWatch(payload) {
    this.calls.push(['createWatch', payload]);
    return { ok: true, payload };
  }

  async pauseWatch(strategyId) {
    this.calls.push(['pauseWatch', strategyId]);
    return { ok: true };
  }

  async activateWatch(strategyId) {
    this.calls.push(['activateWatch', strategyId]);
    return { ok: true };
  }

  async deleteWatch(strategyId) {
    this.calls.push(['deleteWatch', strategyId]);
    return { ok: true };
  }
}

test('adapter maps demand into bridge payload', async () => {
  const fake = new FakeClient();
  const adapter = new OpenClawPluginAdapter(fake);

  await adapter.submitWatchDemand({
    productCode: '06608',
    productType: 'hk_stock',
    condition: 'price >= threshold',
    variables: { threshold: 8.97 },
    messageTemplate: 'demo',
    channels: ['openclaw'],
    channelConfigs: { openclaw: {} }
  });

  const call = fake.calls.find((item) => item[0] === 'createWatch');
  assert.ok(call, 'createWatch must be called');

  const payload = call[1];
  assert.equal(payload.product_code, '06608');
  assert.equal(payload.product_type, 'hk_stock');
  assert.equal(payload.operator_type, 'rule');
  assert.equal(payload.operator_parameters.condition, 'price >= threshold');
  assert.deepEqual(payload.channels, ['openclaw']);
});

test('adapter control actions delegate to client', async () => {
  const fake = new FakeClient();
  const adapter = new OpenClawPluginAdapter(fake);

  await adapter.pause('s1');
  await adapter.activate('s1');
  await adapter.remove('s1');

  assert.ok(fake.calls.some((x) => x[0] === 'pauseWatch'));
  assert.ok(fake.calls.some((x) => x[0] === 'activateWatch'));
  assert.ok(fake.calls.some((x) => x[0] === 'deleteWatch'));
});
