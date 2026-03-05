import { OpenClawPluginAdapter } from '../src/index.js';

const adapter = new OpenClawPluginAdapter({
  baseWsUrl: process.env.OPENCLAW_BRIDGE_WS_BASE || 'wss://glanceup-pre.100credit.cn',
  token: process.env.OPENCLAW_WS_TOKEN,
  enqueueIfDisconnected: true
});

await adapter.start();

const result = await adapter.submitWatchDemand({
  productCode: 'BTCUSDT',
  productType: 'crypto',
  condition: 'price >= threshold',
  variables: { threshold: 73300, product_name: 'Bitcoin' },
  channels: ['openclaw'],
  channelConfigs: { openclaw: {} }
});

console.log('strategy_id:', result.data?.strategy_id);
console.log('完整结果:', JSON.stringify(result, null, 2));