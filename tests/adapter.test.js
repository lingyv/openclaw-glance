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

  async close(force) {
    this.calls.push(['close', force]);
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

  async queryTickerData(payload) {
    this.calls.push(['queryTickerData', payload]);
    return { ok: true, payload };
  }

  async queryFundEstimates(payload) {
    this.calls.push(['queryFundEstimates', payload]);
    return { ok: true, payload };
  }

  async queryFinanceTable(payload) {
    this.calls.push(['queryFinanceTable', payload]);
    return { ok: true, payload };
  }

  async listWatches(payload) {
    this.calls.push(['listWatches', payload]);
    return { ok: true, payload };
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
  await adapter.stop();

  assert.ok(fake.calls.some((x) => x[0] === 'pauseWatch'));
  assert.ok(fake.calls.some((x) => x[0] === 'activateWatch'));
  assert.ok(fake.calls.some((x) => x[0] === 'deleteWatch'));
  assert.ok(fake.calls.some((x) => x[0] === 'close' && x[1] === true));
});

test('adapter supports email and call channel shortcuts', async () => {
  const fake = new FakeClient();
  const adapter = new OpenClawPluginAdapter(fake);

  await adapter.submitWatchDemand({
    productCode: 'BTCUSDT',
    productType: 'crypto',
    condition: 'price >= threshold',
    variables: { threshold: 70000 },
    emailConfig: {
      to_address: 'demo@example.com'
    },
    callConfig: {
      phone: '13800138000',
      customer_name: 'Demo'
    }
  });

  const call = fake.calls.find((item) => item[0] === 'createWatch');
  assert.ok(call, 'createWatch must be called');
  const payload = call[1];

  assert.ok(payload.channels.includes('email'));
  assert.ok(payload.channels.includes('call'));
  assert.ok(payload.channels.includes('openclaw'));
  assert.deepEqual(payload.channels[0], 'openclaw');
  assert.ok(payload.channel_configs.openclaw);
  assert.ok(payload.channel_configs.email);
  assert.ok(payload.channel_configs.call);
  assert.equal(payload.channel_configs.email.template_id, 4);
});

test('adapter supports sms channel shortcut', async () => {
  const fake = new FakeClient();
  const adapter = new OpenClawPluginAdapter(fake);

  await adapter.submitWatchDemand({
    productCode: '000001',
    productType: 'stock',
    condition: 'price <= threshold',
    variables: { threshold: 10 },
    smsConfig: {
      receiver: '13968617776',
      template_id: 90010,
      content: '测试消息1'
    }
  });

  const call = fake.calls.find((item) => item[0] === 'createWatch');
  assert.ok(call, 'createWatch must be called');
  const payload = call[1];

  assert.ok(payload.channels.includes('sms'));
  assert.ok(payload.channels.includes('openclaw'));
  assert.deepEqual(payload.channels[0], 'openclaw');
  assert.ok(payload.channel_configs.openclaw);
  assert.deepEqual(payload.channel_configs.sms, {
    receiver: '13968617776',
    template_id: 90010,
    content: '测试消息1'
  });
});

test('adapter supports dingtalk channel shortcut', async () => {
  const fake = new FakeClient();
  const adapter = new OpenClawPluginAdapter(fake);

  await adapter.submitWatchDemand({
    productCode: '00700',
    productType: 'hk_stock',
    condition: 'price >= threshold',
    variables: { threshold: 420 },
    dingtalkConfig: {
      webhook: 'https://oapi.dingtalk.com/robot/send?access_token=demo',
      atMobiles: ['13800138000']
    }
  });

  const call = fake.calls.find((item) => item[0] === 'createWatch');
  assert.ok(call, 'createWatch must be called');
  const payload = call[1];

  assert.ok(payload.channels.includes('dingtalk'));
  assert.ok(payload.channels.includes('openclaw'));
  assert.deepEqual(payload.channels[0], 'openclaw');
  assert.ok(payload.channel_configs.openclaw);
  assert.deepEqual(payload.channel_configs.dingtalk, {
    webhook: 'https://oapi.dingtalk.com/robot/send?access_token=demo',
    atMobiles: ['13800138000'],
    template_id: 3
  });
});

test('adapter auto-fills template_id defaults when omitted', async () => {
  const fake = new FakeClient();
  const adapter = new OpenClawPluginAdapter(fake);

  await adapter.submitWatchDemand({
    productCode: '000001',
    productType: 'stock',
    condition: 'price <= threshold',
    variables: { threshold: 10 },
    smsConfig: {
      receiver: '13968617776',
      content: '测试消息2'
    },
    dingtalkConfig: {
      cas_id: 'user.dingtalk',
      msg_type: 'text',
      content: '测试钉钉消息2'
    }
  });

  const call = fake.calls.find((item) => item[0] === 'createWatch');
  assert.ok(call, 'createWatch must be called');
  const payload = call[1];

  assert.equal(payload.channel_configs.sms.template_id, 90010);
  assert.equal(payload.channel_configs.dingtalk.template_id, 3);
});

test('adapter queryTickerData maps payload fields', async () => {
  const fake = new FakeClient();
  const adapter = new OpenClawPluginAdapter(fake);

  await adapter.queryTickerData({
    market: 'crypto',
    symbol: 'BTCUSDT'
  });

  const call = fake.calls.find((item) => item[0] === 'queryTickerData');
  assert.ok(call, 'queryTickerData must be called');
  const payload = call[1];
  assert.equal(payload.market, 'crypto');
  assert.equal(payload.symbol, 'BTCUSDT');
});

test('adapter queryTickerData maps Chinese market alias to gateway code', async () => {
  const fake = new FakeClient();
  const adapter = new OpenClawPluginAdapter(fake);

  await adapter.queryTickerData({ market: 'A股', symbol: '600000.SH' });
  const call = fake.calls.find((item) => item[0] === 'queryTickerData');
  assert.ok(call);
  assert.equal(call[1].market, 'a');
});

test('adapter queryTickerData rejects missing symbol', async () => {
  const fake = new FakeClient();
  const adapter = new OpenClawPluginAdapter(fake);
  await assert.rejects(() => adapter.queryTickerData({ market: 'hk' }), /market and symbol/);
});

test('adapter searchAStockBasic rejects empty keyword', async () => {
  const fake = new FakeClient();
  const adapter = new OpenClawPluginAdapter(fake);
  await assert.rejects(() => adapter.searchAStockBasic({}), /keyword or q/);
});

test('adapter queryTradeCalendar merges camelCase dates', async () => {
  const fake = new FakeClient();
  const adapter = new OpenClawPluginAdapter(fake);

  await adapter.queryTradeCalendar({
    exchange: 'SSE',
    startDate: '2026-04-01',
    endDate: '2026-04-10'
  });
  const call = fake.calls.find((item) => item[0] === 'queryFinanceTable');
  assert.ok(call);
  assert.equal(call[1].query.exchange, 'SSE');
  assert.equal(call[1].query.start_date, '2026-04-01');
  assert.equal(call[1].query.end_date, '2026-04-10');
});

test('adapter queryFundEstimates maps fund_codes and fundCodes', async () => {
  const fake = new FakeClient();
  const adapter = new OpenClawPluginAdapter(fake);

  await adapter.queryFundEstimates({ fund_codes: '000006.OF' });
  let call = fake.calls.find((item) => item[0] === 'queryFundEstimates');
  assert.ok(call);
  assert.equal(call[1].fund_codes, '000006.OF');

  fake.calls.length = 0;
  await adapter.queryFundEstimates({ fundCodes: ['000006.OF', '110011.OF'] });
  call = fake.calls.find((item) => item[0] === 'queryFundEstimates');
  assert.ok(call);
  assert.deepEqual(call[1].fund_codes, ['000006.OF', '110011.OF']);
});

test('adapter searchAStockBasic uses finance.table path', async () => {
  const fake = new FakeClient();
  const adapter = new OpenClawPluginAdapter(fake);

  await adapter.searchAStockBasic({ keyword: '招行' });
  const call = fake.calls.find((item) => item[0] === 'queryFinanceTable');
  assert.ok(call);
  assert.equal(call[1].path, '/v1/a-stock/basic/search');
  assert.equal(call[1].query.keyword, '招行');
});

test('adapter listWatches delegates to client', async () => {
  const fake = new FakeClient();
  const adapter = new OpenClawPluginAdapter(fake);

  await adapter.listWatches({ status: 'active', product_code: 'BTCUSDT' });

  const call = fake.calls.find((item) => item[0] === 'listWatches');
  assert.ok(call, 'listWatches must be called');
  assert.equal(call[1].status, 'active');
  assert.equal(call[1].product_code, 'BTCUSDT');
});

test('adapter submitWatchDemand merges openclaw session routing from demand', async () => {
  const fake = new FakeClient();
  const adapter = new OpenClawPluginAdapter(fake);

  await adapter.submitWatchDemand({
    productCode: 'BTCUSDT',
    productType: 'crypto',
    condition: 'price >= threshold',
    variables: { threshold: 70000 },
    channel: 'dingtalk',
    accountId: 'default',
    sessionKey: 'agent:main:dingtalk:group:cid_demo',
    conversationId: 'cid_demo',
    openclawConfig: { tenant: 'cn' },
    channels: ['openclaw']
  });

  const call = fake.calls.find((item) => item[0] === 'createWatch');
  assert.ok(call, 'createWatch must be called');
  const oc = call[1].channel_configs.openclaw;
  assert.equal(oc.channel, 'dingtalk');
  assert.equal(oc.account_id, 'default');
  assert.equal(oc.session_key, 'agent:main:dingtalk:group:cid_demo');
  assert.equal(oc.conversation_id, 'cid_demo');
  assert.equal(oc.tenant, 'cn');
});
