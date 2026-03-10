import { resolveRuntimeConfig } from '../config/runtime-config.js';
import { BridgeRuntime } from '../runtime/BridgeRuntime.js';
import { PluginDispatcher } from '../runtime/dispatchers/PluginDispatcher.js';
import { ProcessLock } from '../runtime/lock/ProcessLock.js';

let activeRuntime = null;

function installProcessShutdown(runtime) {
  const stop = async () => {
    if (!runtime) return;
    await runtime.stop().catch(() => {});
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

export function getActivePluginRuntime() {
  return activeRuntime;
}

export async function startPluginRuntime({ runtime, pluginConfig } = {}) {
  if (activeRuntime) {
    return activeRuntime;
  }
  const config = resolveRuntimeConfig({ pluginConfig });
  const lock = new ProcessLock({
    lockDir: config.lockDir,
    key: config.lockKey
  });
  const dispatcher = new PluginDispatcher({ runtime });
  activeRuntime = new BridgeRuntime({
    baseWsUrl: config.baseWsUrl,
    token: config.token,
    dispatcher,
    lock
  });
  await activeRuntime.start();
  return activeRuntime;
}

export async function stopPluginRuntime() {
  if (!activeRuntime) return;
  await activeRuntime.stop();
  activeRuntime = null;
}

async function getReadyRuntime(startupPromise) {
  await startupPromise;
  if (!activeRuntime) {
    throw new Error('plugin runtime is not active');
  }
  return activeRuntime;
}

function mapDemandToCreatePayload(demand = {}) {
  const channels = Array.isArray(demand.channels)
    ? demand.channels
        .filter((x) => typeof x === 'string' && x.trim())
        .map((x) => x.trim().toLowerCase())
    : [];
  const channelConfigs = { ...(demand.channelConfigs || {}) };

  if (demand.openclawConfig) {
    channelConfigs.openclaw = demand.openclawConfig;
    if (!channels.includes('openclaw')) channels.push('openclaw');
  }
  if (demand.emailConfig) {
    channelConfigs.email = demand.emailConfig;
    if (!channels.includes('email')) channels.push('email');
  }
  if (demand.callConfig) {
    channelConfigs.call = demand.callConfig;
    if (!channels.includes('call')) channels.push('call');
  }
  if (demand.smsConfig) {
    channelConfigs.sms = demand.smsConfig;
    if (!channels.includes('sms')) channels.push('sms');
  }
  if (!channels.includes('openclaw')) channels.unshift('openclaw');
  if (!channelConfigs.openclaw) channelConfigs.openclaw = {};

  return {
    product_code: demand.productCode || demand.product_code,
    product_type: demand.productType || demand.product_type || 'stock',
    operator_type: 'rule',
    operator_parameters: {
      condition: demand.condition,
      variables: demand.variables || {},
      message_template: demand.messageTemplate || demand.message_template
    },
    channels,
    channel_configs: channelConfigs
  };
}

function buildControlApi(startupPromise) {
  return {
    async queryTickerData(query = {}) {
      const runtime = await getReadyRuntime(startupPromise);
      const stockCode = query.stockCode || query.productCode || query.stock_code || '';
      const productType = query.productType || query.product_type || '';
      let market = query.market;
      if (market == null && String(productType).toLowerCase() === 'crypto') {
        market = '';
      }
      return runtime.request('ticker.query', {
        stock_code: stockCode,
        market: market == null ? '' : String(market),
        product_type: productType
      });
    },
    async createWatch(payload = {}) {
      const runtime = await getReadyRuntime(startupPromise);
      return runtime.request('watch.create', payload);
    },
    async submitWatchDemand(demand = {}) {
      const runtime = await getReadyRuntime(startupPromise);
      return runtime.request('watch.create', mapDemandToCreatePayload(demand));
    },
    async pauseWatch(strategyId) {
      const runtime = await getReadyRuntime(startupPromise);
      return runtime.request('watch.pause', { strategy_id: strategyId });
    },
    async activateWatch(strategyId) {
      const runtime = await getReadyRuntime(startupPromise);
      return runtime.request('watch.activate', { strategy_id: strategyId });
    },
    async deleteWatch(strategyId) {
      const runtime = await getReadyRuntime(startupPromise);
      return runtime.request('watch.delete', { strategy_id: strategyId });
    }
  };
}

function tryRegisterTool(registerTool, name, description, parameters, handler) {
  if (typeof registerTool !== 'function') return;
  const schema =
    parameters || {
      type: 'object',
      additionalProperties: true,
      properties: {}
    };

  const def = {
    name,
    description,
    parameters: schema,
    inputSchema: schema,
    handler,
    execute: async (_toolCallId, params) => handler(params || {})
  };
  const meta = {
    name,
    description
  };

  // OpenClaw-style: registerTool(def, meta)
  try {
    registerTool(def, meta);
    return;
  } catch (_err) {
    // try one-arg object signature
  }

  try {
    registerTool(def);
    return;
  } catch (_err) {
    // try alternate host signature: (name, handler)
  }

  try {
    registerTool(name, handler);
  } catch (_err) {
    // ignore host differences
  }
}

function registerControlTools(api, controlApi) {
  const registerTool = api?.registerTool || api?.runtime?.registerTool;

  tryRegisterTool(
    registerTool,
    'watch_query_ticker',
    'Query ticker data',
    {
      type: 'object',
      additionalProperties: true,
      properties: {
        stock_code: { type: 'string' },
        product_code: { type: 'string' },
        product_type: { type: 'string' },
        market: { type: 'string' }
      }
    },
    (args) => controlApi.queryTickerData(args || {})
  );

  tryRegisterTool(
    registerTool,
    'watch_create',
    'Create watch strategy',
    {
      type: 'object',
      additionalProperties: true,
      properties: {
        product_code: { type: 'string' },
        product_type: { type: 'string' },
        operator_type: { type: 'string' },
        operator_parameters: { type: 'object' },
        channels: { type: 'array', items: { type: 'string' } },
        channel_configs: { type: 'object' }
      }
    },
    (args) => controlApi.createWatch(args || {})
  );

  const strategySchema = {
    type: 'object',
    additionalProperties: true,
    properties: {
      strategy_id: { type: 'string' },
      strategyId: { type: 'string' }
    }
  };

  tryRegisterTool(
    registerTool,
    'watch_pause',
    'Pause watch strategy',
    strategySchema,
    (args) => controlApi.pauseWatch(args?.strategyId || args?.strategy_id)
  );

  tryRegisterTool(
    registerTool,
    'watch_activate',
    'Activate watch strategy',
    strategySchema,
    (args) => controlApi.activateWatch(args?.strategyId || args?.strategy_id)
  );

  tryRegisterTool(
    registerTool,
    'watch_remove',
    'Delete watch strategy',
    strategySchema,
    (args) => controlApi.deleteWatch(args?.strategyId || args?.strategy_id)
  );
}

const plugin = {
  id: 'glance-bridge',
  name: 'Glance Bridge Tools',
  description: 'OpenClaw tool plugin with bridge long connection runtime',
  register(api) {
    const pluginConfig =
      api?.config?.plugins?.entries?.['glance-bridge']?.config ||
      api?.config?.plugins?.entries?.glanceBridge?.config ||
      api?.config?.plugins?.['glance-bridge']?.config ||
      api?.config?.plugins?.glanceBridge?.config ||
      {};

    const startupPromise = startPluginRuntime({
      runtime: api?.runtime,
      pluginConfig
    });
    startupPromise.catch((err) => {
      api?.runtime?.logger?.error?.(`[glance-bridge] runtime start failed: ${err.message}`);
    });

    const controlApi = buildControlApi(startupPromise);
    api.glanceBridge = controlApi;
    registerControlTools(api, controlApi);

    if (typeof api?.onShutdown === 'function') {
      api.onShutdown(async () => {
        await startupPromise.catch(() => {});
        await stopPluginRuntime();
      });
    } else {
      startupPromise
        .then((runtime) => {
          installProcessShutdown(runtime);
        })
        .catch(() => {});
    }
  }
};

export default plugin;
