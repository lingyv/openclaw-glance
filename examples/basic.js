import { OpenClawBridgeClient } from '../src/index.js';

const client = new OpenClawBridgeClient({
  baseWsUrl: process.env.OPENCLAW_BRIDGE_WS_BASE || 'ws://127.0.0.1:8005',
  token: process.env.OPENCLAW_WS_TOKEN || '',
  heartbeatMs: 15000,
  requestTimeoutMs: 10000
});

client.on('connected', () => {
  console.log('[bridge] connected');
});

client.on('systemConnected', (msg) => {
  console.log('[bridge] systemConnected:', msg);
});

client.on('triggered', (msg) => {
  console.log('[bridge] watch.triggered:', JSON.stringify(msg));
});

client.on('reconnecting', (e) => {
  console.log(`[bridge] reconnecting attempt=${e.attempt}, backoff=${e.backoffMs}ms`);
});

client.on('disconnected', (e) => {
  console.log('[bridge] disconnected:', e);
});

client.on('warning', (e) => {
  console.warn('[bridge] warning:', e.message);
});

client.on('error', (e) => {
  console.error('[bridge] error:', e.message || e);
});

async function main() {
  await client.connect();

  // 示例：创建策略（按需修改）
  const createResp = await client.createWatch({
    product_code: '00700',
    product_type: 'hk_stock',
    operator_type: 'rule',
    operator_parameters: {
      condition: 'price < threshold',
      variables: { threshold: 420, product_name: '腾讯控股' },
      message_template: '{product_name} 跌破 {threshold}'
    },
    channels: ['openclaw'],
    channel_configs: { openclaw: {} }
  });

  console.log('[bridge] watch.create.result:', JSON.stringify(createResp));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
