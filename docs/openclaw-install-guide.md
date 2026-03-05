# OpenClaw 插件安装与使用引导

本文档面向 OpenClaw 开发者，说明如何安装并接入 `openclaw-plugin-node`。

## 0. 插件功能与接入流程

该插件是 OpenClaw 的“盯盘执行层”，用于把用户需求落到智能盯盘系统并回收触发结果。

核心能力：

- 与 `openclaw-bridge` 建立并维持 WebSocket 长连接
- 创建/激活/暂停/删除盯盘策略
- 在策略触发后实时接收 `watch.triggered` 消息
- 断线自动重连与请求排队，减少短暂网络抖动影响

OpenClaw 侧推荐调用流程：

1. 用户表达盯盘意图，OpenClaw 解析出 `productCode/productType/condition/variables`
2. OpenClaw 初始化插件并连接 bridge（`adapter.start()`）
3. 调用 `adapter.submitWatchDemand(...)` 创建策略
4. 注册 `adapter.onTriggered(...)`，把触发事件回调给 OpenClaw 对话/任务流
5. 用户后续操作时调用 `pause/activate/remove`

## 1. 前置条件

- Node.js >= 20
- 已部署并可访问 `openclaw-bridge`

## 2. 安装插件

### 方式A：本地目录开发接入

```bash
# 在 openclaw 项目中
npm install /path/to/openclaw-plugin-node
```

### 方式B：git 仓库接入

```bash
# 示例：替换为实际仓库地址与分支/标签
npm install git+ssh://git@github.com:lingyv/openclaw-glance.git#main
```

安装后在代码中引入：

```js
import { OpenClawPluginAdapter } from 'openclaw-bridge-plugin';
```

## 3. 申请 WebSocket token

向智能盯盘项目组申请 token

## 4. 在 OpenClaw 中初始化插件

```js
import { OpenClawPluginAdapter } from 'openclaw-bridge-plugin';

const bridgeBase = process.env.OPENCLAW_BRIDGE_WS_BASE || 'ws://glanceup-pre.100credit.cn';
const token = '<JWT_TOKEN>'; // 上面申请的token

const adapter = new OpenClawPluginAdapter({
  baseWsUrl: bridgeBase,
  token,
  enqueueIfDisconnected: true
});

await adapter.start();
```

## 5. 提交盯盘需求

### 5.1 市场类型与代码

| 市场 | `productType` | `productCode` 示例 | 行情频率 | 说明 |
|------|---------------|-------------------|----------|------|
| A股个股 | `stock` | `000001` | 约每 3 秒 | 可使用 `turnover_rate` |
| A股指数 | `index` | `000300` | 约每 3 秒 | 可使用 `turnover_rate` |
| 港股 | `hk_stock` | `00700` | 延迟约 15 分钟 | 可使用 `turnover_rate` |
| 比特币 | `crypto` | `BTCUSDT` | 约每 10 秒 | 不支持 `turnover_rate` |

### 5.2 条件表达式变量规则

- 通用变量：`price`, `volume`, `change_percent`
- A股/港股可额外使用：`turnover_rate`
- 比特币策略不要使用：`turnover_rate`
- 条件表达式示例：
  - `price >= threshold`
  - `price >= threshold and change_percent >= cp_threshold`
  - `price <= threshold and turnover_rate >= tr_threshold`（仅A股/港股）

### 5.3 创建策略示例（按市场）

#### A股个股（stock）

```js
await adapter.submitWatchDemand({
  productCode: '000001',
  productType: 'stock',
  condition: 'price >= threshold and turnover_rate >= tr_threshold',
  variables: {
    threshold: 12.5,
    tr_threshold: 0.01,
    product_name: '平安银行'
  },
  channels: ['openclaw'],
  channelConfigs: { openclaw: {} }
});
```

#### A股指数（index）

```js
await adapter.submitWatchDemand({
  productCode: '000300',
  productType: 'index',
  condition: 'price <= threshold',
  variables: {
    threshold: 3500,
    product_name: '沪深300'
  },
  channels: ['openclaw'],
  channelConfigs: { openclaw: {} }
});
```

#### 港股（hk_stock，行情延迟15分钟）

```js
await adapter.submitWatchDemand({
  productCode: '00700',
  productType: 'hk_stock',
  condition: 'price >= threshold',
  variables: {
    threshold: 430,
    product_name: '腾讯控股'
  },
  channels: ['openclaw'],
  channelConfigs: { openclaw: {} }
});
```

#### 比特币（crypto，不支持 turnover_rate）

```js
await adapter.submitWatchDemand({
  productCode: 'BTCUSDT',
  productType: 'crypto',
  condition: 'price >= threshold and change_percent >= cp_threshold',
  variables: {
    threshold: 70000,
    cp_threshold: 0.02,
    product_name: 'Bitcoin'
  },
  channels: ['openclaw'],
  channelConfigs: { openclaw: {} }
});
```

### 5.4 通用创建示例

```js
const result = await adapter.submitWatchDemand({
  productCode: '00700',
  productType: 'hk_stock',
  condition: 'price >= threshold',
  variables: { threshold: 420 },
  channels: ['openclaw'],
  channelConfigs: { openclaw: {} }
});

console.log('watch.create.result', result);
```

### 5.5 多条件策略（单产品）

```js
await adapter.submitWatchDemand({
  productCode: '000001',
  productType: 'stock',
  condition: 'price >= price_threshold and volume >= volume_threshold and change_percent >= cp_threshold',
  variables: {
    price_threshold: 12.5,
    volume_threshold: 1000000,
    cp_threshold: 0.02,
    product_name: '平安银行'
  },
  channels: ['openclaw'],
  channelConfigs: { openclaw: {} }
});
```

### 5.6 多产品 + 多条件策略（使用 symbols）

`submitWatchDemand` 是轻量封装，默认只覆盖单产品参数。  
多产品策略建议直接使用 `OpenClawBridgeClient.createWatch`，显式传 `symbols`：

```js
import { OpenClawBridgeClient } from 'openclaw-bridge-plugin';

const client = new OpenClawBridgeClient({
  baseWsUrl: process.env.OPENCLAW_BRIDGE_WS_BASE || 'ws://glanceup-pre.100credit.cn',
  token: '<JWT_TOKEN>'
});

await client.connect();

const result = await client.createWatch({
  product_code: 'BTCUSDT',
  product_type: 'crypto',
  operator_type: 'rule',
  operator_parameters: {
    condition: 'c1.price >= c1_threshold and c2.price <= c2_threshold',
    symbols: {
      c1: { product_type: 'crypto', product_code: 'BTCUSDT' },
      c2: { product_type: 'stock', product_code: '000001' }
    },
    variables: {
      c1_threshold: 70000,
      c2_threshold: 12.5
    },
    message_template: 'BTC 与 平安银行达到组合条件'
  },
  channels: ['openclaw'],
  channel_configs: { openclaw: {} }
});

console.log('multi-symbol watch.create.result', result);
```

## 6. 接收触发通知

```js
adapter.onTriggered((event) => {
  console.log('watch.triggered', event);
  // 在这里回调 OpenClaw 业务逻辑
});
```

## 7. 策略控制

```js
await adapter.pause('<strategy_id>');
await adapter.activate('<strategy_id>');
await adapter.remove('<strategy_id>');
```

## 8. 断开连接

```js
await adapter.stop();
```

## 9. 常见问题

- 连接失败 `invalid token`：token 过期或签名密钥不一致，重新申请 token。
- 断线后请求未发送：将 `enqueueIfDisconnected` 设为 `true`，并检查重连日志。
