import { OpenClawPluginAdapter } from '../src/index.js';

const adapter = new OpenClawPluginAdapter({
  baseWsUrl: process.env.OPENCLAW_BRIDGE_WS_BASE || 'ws://127.0.0.1:8005',
  token: process.env.OPENCLAW_WS_TOKEN || '',
  enqueueIfDisconnected: true
});

adapter.client.on('connected', () => console.log('[adapter] connected'));
adapter.client.on('queued', (e) => console.log('[adapter] queued:', e));
adapter.client.on('queueFlushed', (e) => console.log('[adapter] queueFlushed:', e));
adapter.client.on('warning', (e) => console.warn('[adapter] warning:', e.message));
adapter.client.on('error', (e) => console.error('[adapter] error:', e.message || e));

adapter.onTriggered((event) => {
  console.log('[adapter] triggered:', JSON.stringify(event));
});

async function main() {
  await adapter.start();

  const resp = await adapter.submitWatchDemand({
    productCode: '06608',
    productType: 'hk_stock',
    condition: 'price >= threshold',
    variables: { threshold: 8.97, product_name: '百融云-W' },
    messageTemplate: '{product_name} 触发价格 {threshold}',
    channels: ['openclaw'],
    channelConfigs: { openclaw: {} }
  });

  console.log('[adapter] create response:', JSON.stringify(resp));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
