import { OpenClawPluginAdapter, getAdapter, getInstance } from '../src/index.js';

// 方式1：使用 getAdapter() 获取全局单例（推荐）
// 首次调用时创建实例，后续调用返回同一实例
const adapter = getAdapter({
  baseWsUrl: process.env.OPENCLAW_BRIDGE_WS_BASE || 'ws://127.0.0.1:8005',
  token: process.env.OPENCLAW_WS_TOKEN || '',
  enqueueIfDisconnected: true
});

// 监听事件
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

/*
 * 方式2：直接使用 OpenClawPluginAdapter（每次创建新实例，不推荐多场景共用）
 *
 * import { OpenClawPluginAdapter } from '../src/index.js';
 *
 * const adapter = new OpenClawPluginAdapter({
 *   baseWsUrl: 'ws://127.0.0.1:8005',
 *   token: 'your-token'
 * });
 *
 * 方式3：直接使用 OpenClawBridgeClient（高级用法）
 *
 * import { OpenClawBridgeClient, getInstance } from '../src/index.js';
 *
 * const client = getInstance({
 *   baseWsUrl: 'ws://127.0.0.1:8005',
 *   token: 'your-token'
 * });
 */