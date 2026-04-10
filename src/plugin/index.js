import {
  normalizeFundBasicTableQuery,
  normalizeKeywordTableQuery,
  normalizeTickerQuery,
  normalizeTradeCalendarQuery
} from '../agentQueryNormalize.js';
import { resolveRuntimeConfig } from '../config/runtime-config.js';
import { extractOpenclawRoutingFromRecord, deriveOpenclawRouting } from '../openclawRouting.js';
import { BridgeRuntime } from '../runtime/BridgeRuntime.js';
import { PluginDispatcher } from '../runtime/dispatchers/PluginDispatcher.js';
import { ProcessLock } from '../runtime/lock/ProcessLock.js';

/** 与 BridgeRuntime FINANCE_TABLE_REQUEST_TIMEOUT_MS 一致 */
const GATEWAY_TABLE_REQUEST_TIMEOUT_MS = 90_000;
const FUND_CODE_PATTERN = /^\d{6}\.OF$/i;
const CHANNEL_TEMPLATE_DEFAULTS = Object.freeze({
  sms: 90010,
  email: 4,
  dingtalk: 3
});

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
  const channelConfigs = applyChannelTemplateDefaults({ ...(demand.channelConfigs || {}) });

  if (demand.openclawConfig) {
    if (!channels.includes('openclaw')) channels.push('openclaw');
  }
  if (demand.emailConfig) {
    channelConfigs.email = withChannelTemplateDefaults('email', demand.emailConfig);
    if (!channels.includes('email')) channels.push('email');
  }
  if (demand.callConfig) {
    channelConfigs.call = demand.callConfig;
    if (!channels.includes('call')) channels.push('call');
  }
  if (demand.smsConfig) {
    channelConfigs.sms = withChannelTemplateDefaults('sms', demand.smsConfig);
    if (!channels.includes('sms')) channels.push('sms');
  }
  if (demand.dingtalkConfig) {
    channelConfigs.dingtalk = withChannelTemplateDefaults('dingtalk', demand.dingtalkConfig);
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
  const channelConfigs = applyChannelTemplateDefaults({ ...(merged.channel_configs || {}) });
  const routing = deriveOpenclawRouting({ params: merged, context });
  merged.channel_configs = channelConfigs;

  if (Object.keys(routing).length > 0) {
    const openclawConfig = { ...(channelConfigs.openclaw || {}) };
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
  }

  return merged;
}

function withChannelTemplateDefaults(channel, config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return config;
  }
  const defaultTemplateId = CHANNEL_TEMPLATE_DEFAULTS[channel];
  if (defaultTemplateId == null || config.template_id != null) {
    return config;
  }
  return { ...config, template_id: defaultTemplateId };
}

function applyChannelTemplateDefaults(channelConfigs = {}) {
  return {
    ...channelConfigs,
    sms: withChannelTemplateDefaults('sms', channelConfigs.sms),
    email: withChannelTemplateDefaults('email', channelConfigs.email),
    dingtalk: withChannelTemplateDefaults('dingtalk', channelConfigs.dingtalk)
  };
}

function assertWatchCreateSupported(payload = {}) {
  const code = String(payload.product_code ?? payload.productCode ?? '')
    .trim()
    .toUpperCase();
  const productType = String(payload.product_type ?? payload.productType ?? '')
    .trim()
    .toLowerCase();
  if (productType === 'fund' || FUND_CODE_PATTERN.test(code)) {
    throw new Error(
      'watch_create does not support fund strategies. Supported product_type: stock, hk_stock, index, crypto. For funds use watch_query_fund_estimates or watch_search_fund_basic.'
    );
  }
}

function buildControlApi(startupPromise) {
  return {
    async queryTickerData(query = {}) {
      const runtime = await getReadyRuntime(startupPromise);
      const payload = normalizeTickerQuery(query || {});
      if (!payload.market || !payload.symbol) {
        throw new Error(
          'queryTickerData requires market and symbol. If user gave a company/index name only, call watch_search_*_basic first to get ts_code, then map to market+symbol.'
        );
      }
      return runtime.request('ticker.query', payload);
    },
    async queryFundEstimates(query = {}) {
      const runtime = await getReadyRuntime(startupPromise);
      let fundCodes = query.fund_codes ?? query.fundCodes;
      if (fundCodes == null) {
        throw new Error('queryFundEstimates requires fund_codes (or fundCodes): string or string[]');
      }
      if (typeof fundCodes === 'string') {
        fundCodes = fundCodes.trim();
      } else if (Array.isArray(fundCodes)) {
        fundCodes = fundCodes.map((x) => String(x).trim()).filter(Boolean);
      } else {
        throw new Error('fund_codes must be a string or string[]');
      }
      return runtime.request('fund.estimates', { fund_codes: fundCodes });
    },
    async searchAStockBasic(query = {}) {
      const runtime = await getReadyRuntime(startupPromise);
      const q = normalizeKeywordTableQuery(query, 'searchAStockBasic');
      return runtime.request(
        'finance.table',
        { path: '/v1/a-stock/basic/search', query: q },
        { requestTimeoutMs: GATEWAY_TABLE_REQUEST_TIMEOUT_MS }
      );
    },
    async searchHkStockBasic(query = {}) {
      const runtime = await getReadyRuntime(startupPromise);
      const q = normalizeKeywordTableQuery(query, 'searchHkStockBasic');
      return runtime.request(
        'finance.table',
        { path: '/v1/hk-stock/basic/search', query: q },
        { requestTimeoutMs: GATEWAY_TABLE_REQUEST_TIMEOUT_MS }
      );
    },
    async searchIndexBasic(query = {}) {
      const runtime = await getReadyRuntime(startupPromise);
      const q = normalizeKeywordTableQuery(query, 'searchIndexBasic');
      return runtime.request(
        'finance.table',
        { path: '/v1/index/basic/search', query: q },
        { requestTimeoutMs: GATEWAY_TABLE_REQUEST_TIMEOUT_MS }
      );
    },
    async searchFundBasic(query = {}) {
      const runtime = await getReadyRuntime(startupPromise);
      const q = normalizeFundBasicTableQuery(query);
      return runtime.request(
        'finance.table',
        { path: '/v1/fund/basic', query: q },
        { requestTimeoutMs: GATEWAY_TABLE_REQUEST_TIMEOUT_MS }
      );
    },
    async queryFinNews(query = {}) {
      const runtime = await getReadyRuntime(startupPromise);
      const q = normalizeKeywordTableQuery(query, 'queryFinNews');
      return runtime.request(
        'finance.table',
        { path: '/v1/news', query: q },
        { requestTimeoutMs: GATEWAY_TABLE_REQUEST_TIMEOUT_MS }
      );
    },
    async queryTradeCalendar(query = {}) {
      const runtime = await getReadyRuntime(startupPromise);
      const q = normalizeTradeCalendarQuery(query);
      return runtime.request(
        'finance.table',
        { path: '/v1/trade-calendar', query: q },
        { requestTimeoutMs: GATEWAY_TABLE_REQUEST_TIMEOUT_MS }
      );
    },
    async createWatch(payload = {}, context = {}) {
      const runtime = await getReadyRuntime(startupPromise);
      const normalized = mergeOpenclawChannelConfig(payload, context);
      assertWatchCreateSupported(normalized);
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
      const payload = withChannelTemplateDefaults(ch, { ...(input.payload || {}) });
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
      assertWatchCreateSupported(normalized);
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

  const DESC_TICKER =
    '【实时行情】当前价、涨跌幅等撮合侧快照。' +
    'When: 用户已明确标的代码/简称对应的代码时用；仅说公司名时先用 watch_search_*_basic 再调本工具。' +
    'Returns: type=ticker.query.result；success=true 时读 quote（英文键 last、name、pct_change 等）。' +
    'Do NOT: 场外基金估值勿用本工具（用 watch_query_fund_estimates）。market 可用 a|hk|crypto 或「A股」「港股」「加密」等别名。';

  tryRegisterTool(
    registerTool,
    'watch_query_ticker',
    DESC_TICKER,
    {
      type: 'object',
      description:
        '实时行情。必填 market + symbol；segment 仅 A/港股指数场景建议 index 或省略。插件会将「A股」等映射为 a。',
      additionalProperties: true,
      properties: {
        market: {
          type: 'string',
          description:
            '市场：a | hk | crypto；或中文别名 A股/港股/加密/数字货币（插件会归一化）。'
        },
        symbol: {
          type: 'string',
          description:
            '标的代码：A 股如 600000.SH 或 600000；港股 00700；加密 BTCUSDT。名称请先用 search 工具解析。'
        },
        segment: {
          type: 'string',
          description: '可选。A/港股时 auto|stock|index；加密不传。'
        }
      },
      required: ['market', 'symbol']
    },
    (args) => controlApi.queryTickerData(args || {})
  );

  const DESC_FUND_EST =
    '【基金当日估值】场外开放式基金估算净值/涨跌，非股票盘口。' +
    'When: 用户问「基金今天估值、估算涨跌」且代码形如 xxxxxx.OF。' +
    'Returns: fund.estimates.result；可能较慢（~90s）。' +
    'Do NOT: 股票/指数/加密行情用 watch_query_ticker。';

  tryRegisterTool(
    registerTool,
    'watch_query_fund_estimates',
    DESC_FUND_EST,
    {
      type: 'object',
      description: '单只或多只基金代码；fund_codes 与 fundCodes 等价。',
      additionalProperties: true,
      properties: {
        fund_codes: {
          description: '单只 "000006.OF" 或字符串数组；与 fundCodes 二选一即可',
          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }]
        },
        fundCodes: {
          description: 'camelCase 别名，含义同 fund_codes',
          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }]
        }
      },
      anyOf: [{ required: ['fund_codes'] }, { required: ['fundCodes'] }]
    },
    (args) => controlApi.queryFundEstimates(args || {})
  );

  const keywordSearchSchema = {
    type: 'object',
    description:
      'keyword 与 q 等价，至少填一个（插件会合并为网关 keyword）。可选 limit（条数）。返回 finance.table.result，行在 data[]。',
    additionalProperties: true,
    properties: {
      keyword: { type: 'string', description: '搜索词：名称或代码片段，优先使用' },
      q: { type: 'string', description: '与 keyword 二选一' },
      limit: { type: 'number', description: '最大行数，默认由网关决定' }
    },
    anyOf: [{ required: ['keyword'] }, { required: ['q'] }]
  };

  tryRegisterTool(
    registerTool,
    'watch_search_a_stock_basic',
    '【A 股基础信息】按名称/代码找 ts_code、简称、行业等（日终/静态库表）。' +
      'When: 用户只说中文名或模糊代码、要映射到 600000.SH 再查 watch_query_ticker。' +
      'Returns: finance.table.result，data[] 每行含 ts_code 等字段。',
    keywordSearchSchema,
    (args) => controlApi.searchAStockBasic(args || {})
  );

  tryRegisterTool(
    registerTool,
    'watch_search_hk_stock_basic',
    '【港股基础信息】名称/拼音/代码检索港股代码。' +
      'When: 港股名称→代码后再 watch_query_ticker(market=hk)。' +
      'Returns: finance.table.result。',
    keywordSearchSchema,
    (args) => controlApi.searchHkStockBasic(args || {})
  );

  tryRegisterTool(
    registerTool,
    'watch_search_index_basic',
    '【指数基础信息】按简称/ts_code 找指数。' +
      'When: 用户说「沪深300」「恒生指数」等需解析为指数代码再 watch_query_ticker。' +
      'Returns: finance.table.result。',
    keywordSearchSchema,
    (args) => controlApi.searchIndexBasic(args || {})
  );

  tryRegisterTool(
    registerTool,
    'watch_search_fund_basic',
    '【基金档案】按 ts_code 或名称查基金元数据（非估值）。' +
      'When: 确认基金代码、或名称反查 000xxx.OF；查当日估算涨跌用 watch_query_fund_estimates。' +
      'Returns: finance.table.result。',
    {
      type: 'object',
      description: 'ts_code 精确查优先；否则 keyword 或 q 模糊查。可选 limit。',
      additionalProperties: true,
      properties: {
        ts_code: { type: 'string', description: '基金代码如 000006.OF' },
        tsCode: { type: 'string', description: 'camelCase 别名' },
        keyword: { type: 'string', description: '基金名称关键词' },
        q: { type: 'string', description: '同 keyword' },
        limit: { type: 'number' }
      },
      anyOf: [
        { required: ['ts_code'] },
        { required: ['tsCode'] },
        { required: ['keyword'] },
        { required: ['q'] }
      ]
    },
    (args) => controlApi.searchFundBasic(args || {})
  );

  tryRegisterTool(
    registerTool,
    'watch_fin_news',
    '【财经快讯】标题/摘要类新闻，非实时逐笔。' +
      'When: 用户问「有什么新闻、快讯」并给出主题词。' +
      'Returns: finance.table.result；可选 pub_time_start/pub_time_end 收窄时间。' +
      'Do NOT: 与行情混淆；无关键词时先追问。',
    {
      ...keywordSearchSchema,
      properties: {
        ...keywordSearchSchema.properties,
        pub_time_start: { type: 'string', description: '可选，发布时间下界，如 YYYY-MM-DD HH:MM:SS' },
        pub_time_end: { type: 'string', description: '可选，发布时间上界' }
      }
    },
    (args) => controlApi.queryFinNews(args || {})
  );

  tryRegisterTool(
    registerTool,
    'watch_trade_calendar',
    '【交易日历】某日是否开市、上一交易日等，无价量。' +
      'When: 「今天A股开不开盘」「五一休市吗」等；A 股常用 exchange=SSE（沪）或 SZSE（深），可各查一次或问用户。' +
      'Returns: finance.table.result，行内 is_open 等字段依网关。' +
      'Required: exchange + start_date + end_date（YYYY-MM-DD）；可用 startDate/endDate。',
    {
      type: 'object',
      description: '区间宜覆盖所问日期；单日则 start=end。',
      additionalProperties: true,
      properties: {
        exchange: {
          type: 'string',
          description: '交易所代码，如 SSE（上交所）、SZSE（深交所），与网关文档一致'
        },
        start_date: { type: 'string', description: '区间起点 YYYY-MM-DD' },
        end_date: { type: 'string', description: '区间终点 YYYY-MM-DD' },
        startDate: { type: 'string', description: 'camelCase，同 start_date' },
        endDate: { type: 'string', description: 'camelCase，同 end_date' }
      },
      required: ['exchange']
    },
    (args) => controlApi.queryTradeCalendar(args || {})
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
    'Create watch strategy for stock/hk_stock/index/crypto. Do NOT use for funds (.OF).',
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
      },
      required: ['product_code', 'product_type', 'operator_parameters']
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
