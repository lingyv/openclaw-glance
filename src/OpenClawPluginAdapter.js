import { OpenClawBridgeClient } from './OpenClawBridgeClient.js';

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
    const payload = {
      product_code: demand.productCode,
      product_type: demand.productType || 'stock',
      operator_type: 'rule',
      operator_parameters: {
        condition: demand.condition,
        variables: demand.variables || {},
        message_template: demand.messageTemplate
      },
      channels: demand.channels || ['openclaw'],
      channel_configs: demand.channelConfigs || { openclaw: {} }
    };
    return this.client.createWatch(payload);
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
}
