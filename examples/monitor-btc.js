#!/usr/bin/env node
import { OpenClawPluginAdapter } from '../src/index.js';

const adapter = new OpenClawPluginAdapter({
  baseWsUrl: process.env.OPENCLAW_BRIDGE_WS_BASE || 'wss://glanceup-pre.100credit.cn',
  token: process.env.OPENCLAW_WS_TOKEN,
  enqueueIfDisconnected: true,
  reconnect: true
});

// 添加重连事件监听
adapter.client.on('reconnecting', (e) => console.log('🔄 重连中:', e));
adapter.client.on('reconnected', (e) => console.log('✅ 已重连:', e));
adapter.client.on('connected', () => console.log('✅ 连接成功'));
adapter.client.on('disconnected', (e) => console.log('❌ 连接断开:', e));
adapter.client.on('error', (e) => console.log('⚠️ 错误:', e.message || e));
adapter.client.on('warning', (e) => console.log('⚠️ 警告:', e.message));

let triggered = false;

adapter.onTriggered((event) => {
  const price = event.market_data?.price;
  const change = event.market_data?.change_percent;
  console.log('===== 触发提醒 =====');
  console.log('价格:', price);
  console.log('涨幅:', change + '%');
  triggered = true;
  process.exit(0);
});

console.log('连接中...');
await adapter.start();
console.log('已连接，创建监控...');

await adapter.submitWatchDemand({
  productCode: 'BTCUSDT',
  productType: 'crypto',
  condition: 'price >= threshold',
  variables: { threshold: 73300, product_name: 'Bitcoin' },
  channels: ['openclaw'],
  channelConfigs: { openclaw: {} }
});

console.log('✅ 监控已创建: BTC > 73300');
console.log('等待触发... (按 Ctrl+C 退出)');

// 保持运行
process.stdin.resume();