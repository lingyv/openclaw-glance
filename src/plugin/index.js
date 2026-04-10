import { resolveRuntimeConfig } from '../config/runtime-config.js';
import { extractOpenclawRoutingFromRecord, deriveOpenclawRouting } from '../openclawRouting.js';
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
  runtime?.logger?.info?.(
    `[openclaw-glance-plugin] runtime config resolved: baseWsUrl=${config.baseWsUrl}, lockDir=${config.lockDir}`
  );
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
  if (demand.dingtalkConfig) {
    channelConfigs.dingtalk = demand.dingtalkConfig;
    if (!channels.includes('dingtalk')) channels.push('dingtalk');
  }
  if (!channels.includes('openclaw')) channels.unshift('openclaw');

  const existingOpenclaw =
    channelConfigs.openclaw && typeof channelConfigs.openclaw === 'object'
      ? { ...channelConfigs.openclaw }
      : {};
  const explicitOpenclaw =
    demand.openclawConfig && typeof demand.openclawConfig === 'object'
      ? { ...demand.openclawConfig }
      : {};
  channelConfigs.openclaw = {
    ...extractOpenclawRoutingFromRecord(demand),
    ...existingOpenclaw,
    ...explicitOpenclaw
  };

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

function mergeOpenclawChannelConfig(payload = {}, context = {}) {
  const merged = { ...(payload || {}) };
  const channelConfigs = { ...(merged.channel_configs || {}) };
  const openclawConfig = { ...(channelConfigs.openclaw || {}) };
  const routing = deriveOpenclawRouting({ params: merged, context });

  if (Object.keys(routing).length === 0) {
    return merged;
  }

  channelConfigs.openclaw = {
    ...openclawConfig,
    ...routing
  };

  const channels = Array.isArray(merged.channels)
    ? merged.channels
        .filter((x) => typeof x === 'string' && x.trim())
        .map((x) => x.trim().toLowerCase())
    : [];
  if (!channels.includes('openclaw')) channels.unshift('openclaw');

  merged.channels = channels;
  merged.channel_configs = channelConfigs;
  return merged;
}

function buildControlApi(startupPromise) {
  return {
    async queryTickerData(query = {}) {
      const runtime = await getReadyRuntime(startupPromise);
      const market = query.market == null ? '' : String(query.market).trim();
      const symbol = query.symbol == null ? '' : String(query.symbol).trim();
      const payload = { market, symbol };
      if (query.segment != null && String(query.segment).trim() !== '') {
        payload.segment = String(query.segment).trim();
      }
      return runtime.request('ticker.query', payload);
    },
    async createWatch(payload = {}, context = {}) {
      const runtime = await getReadyRuntime(startupPromise);
      const normalized = mergeOpenclawChannelConfig(payload, context);
      return runtime.request('watch.create', normalized);
    },
    async sendNotification(input = {}) {
      const runtime = await getReadyRuntime(startupPromise);
      const ch = String(input.channel ?? '')
        .trim()
        .toLowerCase();
      const allowed = new Set(['sms', 'email', 'call', 'dingtalk']);
      if (!ch || !allowed.has(ch)) {
        throw new Error(
          'notify.send requires input.channel to be one of: sms, email, call, dingtalk'
        );
      }
      const payload = { ...(input.payload || {}) };
      return runtime.request('notify.send', {
        ...payload,
        channel: ch
      });
    },
    async sendSms(payload = {}) {
      return this.sendNotification({ channel: 'sms', payload });
    },
    async sendCall(payload = {}) {
      return this.sendNotification({ channel: 'call', payload });
    },
    async sendEmail(payload = {}) {
      return this.sendNotification({ channel: 'email', payload });
    },
    async sendDingtalk(payload = {}) {
      return this.sendNotification({ channel: 'dingtalk', payload });
    },
    async submitWatchDemand(demand = {}, context = {}) {
      const runtime = await getReadyRuntime(startupPromise);
      const payload = mapDemandToCreatePayload(demand);
      const normalized = mergeOpenclawChannelConfig(payload, context);
      return runtime.request('watch.create', normalized);
    },
    async pauseWatch(strategyId) {
      const runtime = await getReadyRuntime(startupPromise);
      return runtime.request('watch.pause', { strategy_id: strategyId });
    },
    async listWatches(payload = {}) {
      const runtime = await getReadyRuntime(startupPromise);
      return runtime.request('watch.list', payload || {});
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
    execute: async (_toolCallId, params, _onUpdate, context) =>
      handler(params || {}, { context: context || {} })
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
    'Query realtime quote: market (a|hk|crypto), symbol, optional segment (auto|stock|index). Same as financial-data-gateway GET /v1/market/quote. Returns ticker.query.result with quote object (English keys).',
    {
      type: 'object',
      additionalProperties: true,
      properties: {
        market: { type: 'string' },
        symbol: { type: 'string' },
        segment: { type: 'string' }
      },
      required: ['market', 'symbol']
    },
    (args) => controlApi.queryTickerData(args || {})
  );

  tryRegisterTool(
    registerTool,
    'notify_sms',
    'Send SMS notification',
    {
      type: 'object',
      additionalProperties: true,
      properties: {}
    },
    (args) => controlApi.sendSms(args || {})
  );

  tryRegisterTool(
    registerTool,
    'notify_call',
    'Send phone call notification',
    {
      type: 'object',
      additionalProperties: true,
      properties: {}
    },
    (args) => controlApi.sendCall(args || {})
  );

  tryRegisterTool(
    registerTool,
    'notify_email',
    'Send email notification',
    {
      type: 'object',
      additionalProperties: true,
      properties: {}
    },
    (args) => controlApi.sendEmail(args || {})
  );

  tryRegisterTool(
    registerTool,
    'notify_dingtalk',
    'Send dingtalk notification',
    {
      type: 'object',
      additionalProperties: true,
      properties: {}
    },
    (args) => controlApi.sendDingtalk(args || {})
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
    (args, meta = {}) => controlApi.createWatch(args || {}, meta?.context || {})
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
    'watch_list',
    'List watch strategies for current user',
    {
      type: 'object',
      additionalProperties: true,
      properties: {
        status: { type: 'string' },
        product_code: { type: 'string' },
        productCode: { type: 'string' }
      }
    },
    (args) => controlApi.listWatches(args || {})
  );

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
  id: 'openclaw-glance-plugin',
  name: 'Glance Bridge Tools',
  description: 'OpenClaw tool plugin with bridge long connection runtime',
  register(api) {
    const pluginConfig =
      api?.config?.plugins?.entries?.['openclaw-glance-plugin']?.config ||
      api?.config?.plugins?.entries?.['glance-bridge']?.config ||
      api?.config?.plugins?.entries?.glanceBridge?.config ||
      api?.config?.plugins?.['openclaw-glance-plugin']?.config ||
      api?.config?.plugins?.['glance-bridge']?.config ||
      api?.config?.plugins?.glanceBridge?.config ||
      {};

    const startupPromise = startPluginRuntime({
      runtime: api?.runtime,
      pluginConfig
    });
    startupPromise.catch((err) => {
      api?.runtime?.logger?.error?.(`[openclaw-glance-plugin] runtime start failed: ${err.message}`);
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
