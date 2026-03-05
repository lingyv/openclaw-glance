import { OpenClawPluginAdapter } from '../src/index.js';

const adapter = new OpenClawPluginAdapter({
  baseWsUrl: process.env.OPENCLAW_BRIDGE_WS_BASE || 'wss://glanceup-pre.100credit.cn',
  token: process.env.OPENCLAW_WS_TOKEN,
  enqueueIfDisconnected: true
});

adapter.onTriggered((event) => {
  console.log('TRIGGERED:', JSON.stringify(event));
  // 这里可以发送消息到飞书群
});

await adapter.start();

const resp = await adapter.submitWatchDemand({
  productCode: 'BTCUSDT',
  productType: 'crypto',
  condition: 'price >= threshold and change_percent >= cp_threshold',
  variables: { threshold: 73000, cp_threshold: 0.01, product_name: 'Bitcoin' },
  channels: ['openclaw'],
  channelConfigs: { openclaw: {} }
});

console.log('Created:', JSON.stringify(resp));