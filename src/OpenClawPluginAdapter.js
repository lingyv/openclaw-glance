import {
  normalizeFundBasicTableQuery,
  normalizeKeywordTableQuery,
  normalizeTickerQuery,
  normalizeTradeCalendarQuery
} from './agentQueryNormalize.js';
import { OpenClawBridgeClient } from './OpenClawBridgeClient.js';
import { extractOpenclawRoutingFromRecord } from './openclawRouting.js';

/**
 * 全局单例 Adapter 实例
 * @type {OpenClawPluginAdapter|null}
 */
let globalAdapterInstance = null;

/**
 * 获取全局单例 Adapter 实例
 * @param {Object} clientOrOptions - 客户端实例或配置选项
 * @returns {OpenClawPluginAdapter} 全局单例 Adapter 实例
 */
export function getGlobalAdapter(clientOrOptions) {
  if (!globalAdapterInstance) {
    globalAdapterInstance = new OpenClawPluginAdapter(clientOrOptions);
  }
  return globalAdapterInstance;
}

/**
 * 获取全局单例 Adapter 实例（别名，推荐使用）
 * @param {Object} clientOrOptions - 客户端实例或配置选项
 * @returns {OpenClawPluginAdapter} 全局单例 Adapter 实例
 */
export function getAdapter(clientOrOptions) {
  return getGlobalAdapter(clientOrOptions);
}

/**
 * 重置全局单例 Adapter（主要用于测试）
 */
export async function resetGlobalAdapter() {
  if (globalAdapterInstance) {
    await globalAdapterInstance.stop();
    globalAdapterInstance = null;
  }
}

/**
 * 面向 OpenClaw 业务层的薄适配器。
 * 负责把业务输入转换为 bridge 协议中的 watch.* 请求。
 * 支持单例模式：通过 getAdapter() 或 getGlobalAdapter() 获取全局实例
 */
export class OpenClawPluginAdapter {
  constructor(clientOrOptions) {
    const looksLikeClient =
      clientOrOptions &&
      typeof clientOrOptions === 'object' &&
      typeof clientOrOptions.createWatch === 'function' &&
      typeof clientOrOptions.pauseWatch === 'function' &&
      typeof clientOrOptions.activateWatch === 'function' &&
      typeof clientOrOptions.deleteWatch === 'function';

    if (clientOrOptions instanceof OpenClawBridgeClient || looksLikeClient) {
      this.client = clientOrOptions;
    } else {
      this.client = new OpenClawBridgeClient(clientOrOptions || {});
    }
  }

  async start() {
    await this.client.connect();
  }

  async stop() {
    await this.client.close(true);
  }

  onTriggered(handler) {
    this.client.on('triggered', handler);
  }

  /**
   * 统一创建盯盘需求接口（适配 OpenClaw 侧参数）。
   */
  async submitWatchDemand(demand) {
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

    const payload = {
      product_code: demand.productCode,
      product_type: demand.productType || 'stock',
      operator_type: 'rule',
      operator_parameters: {
        condition: demand.condition,
        variables: demand.variables || {},
        message_template: demand.messageTemplate
      },
      channels,
      channel_configs: channelConfigs
    };
    return this.client.createWatch(payload);
  }

  /**
   * 查询标的实时行情；参数为 market / symbol / segment，与网关 quote 接口一致；应答为 ticker.query.result。
   */
  async queryTickerData(query) {
    const payload = normalizeTickerQuery(query || {});
    if (!payload.market || !payload.symbol) {
      throw new Error(
        'queryTickerData requires market and symbol. If user gave a name only, use search*Basic first.'
      );
    }
    return this.client.queryTickerData(payload);
  }

  /**
   * 基金实时估值；payload.fund_codes 与网关 POST /v1/realtime/fund/estimates 一致；应答为 fund.estimates.result。
   */
  async queryFundEstimates(query) {
    let fundCodes = query?.fund_codes ?? query?.fundCodes;
    if (fundCodes == null) {
      throw new Error('queryFundEstimates requires fund_codes (or fundCodes)');
    }
    if (typeof fundCodes === 'string') {
      fundCodes = fundCodes.trim();
    } else if (Array.isArray(fundCodes)) {
      fundCodes = fundCodes.map((x) => String(x).trim()).filter(Boolean);
    } else {
      throw new Error('fund_codes must be a string or string[]');
    }
    return this.client.queryFundEstimates({ fund_codes: fundCodes });
  }

  async searchAStockBasic(query) {
    const q = normalizeKeywordTableQuery(query, 'searchAStockBasic');
    return this.client.queryFinanceTable({
      path: '/v1/a-stock/basic/search',
      query: q
    });
  }

  async searchHkStockBasic(query) {
    const q = normalizeKeywordTableQuery(query, 'searchHkStockBasic');
    return this.client.queryFinanceTable({
      path: '/v1/hk-stock/basic/search',
      query: q
    });
  }

  async searchIndexBasic(query) {
    const q = normalizeKeywordTableQuery(query, 'searchIndexBasic');
    return this.client.queryFinanceTable({
      path: '/v1/index/basic/search',
      query: q
    });
  }

  async searchFundBasic(query) {
    const q = normalizeFundBasicTableQuery(query);
    return this.client.queryFinanceTable({
      path: '/v1/fund/basic',
      query: q
    });
  }

  async queryFinNews(query) {
    const q = normalizeKeywordTableQuery(query, 'queryFinNews');
    return this.client.queryFinanceTable({
      path: '/v1/news',
      query: q
    });
  }

  async queryTradeCalendar(query) {
    const q = normalizeTradeCalendarQuery(query);
    return this.client.queryFinanceTable({
      path: '/v1/trade-calendar',
      query: q
    });
  }

  async pause(strategyId) {
    return this.client.pauseWatch(strategyId);
  }

  async activate(strategyId) {
    return this.client.activateWatch(strategyId);
  }

  async remove(strategyId) {
    return this.client.deleteWatch(strategyId);
  }

  async listWatches(params = {}) {
    return this.client.listWatches(params || {});
  }
}
