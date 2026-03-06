# OpenClaw 插件安装与使用引导

本文档面向 OpenClaw 开发者，说明如何安装并接入 `openclaw-glance-plugin`。

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

### 0.1 给大模型的执行规则（建议直接固化）

1. 只有当用户明确提出“盯盘/提醒/监控”意图时才调用插件。  
2. 创建策略前必须拿到 4 个核心字段：`productCode`、`productType`、`condition`、`variables`。  
3. 信息不完整时先追问，不要生成猜测阈值。  
4. `openclaw` 渠道必须保留；`email/call` 仅在用户明确要求时添加。  
5. 收到 `watch.create.result.success=false` 时，向用户回报失败原因，不要静默重试。  
6. 比特币（`crypto`）条件中禁止使用 `turnover_rate`。  

## 1. 前置条件

- Node.js >= 20
- 已部署并可访问 `openclaw-bridge`

## 2. 安装插件

### 方式A：通过 npm 安装

```bash
npm install openclaw-glance-plugin
```

安装后在代码中引入：

```js
import { OpenClawPluginAdapter } from 'openclaw-glance-plugin';
```

### 方式B：全局安装（推荐多实例场景，默认使用该方式全局安装）

对于需要在多个 Node 进程中复用同一个插件包的场景，建议使用全局安装：

```bash
# 全局安装到 OpenClaw 插件目录
npm install -g openclaw-glance-plugin
```

全局安装后，插件会被链接到全局 node 模块目录，可在任意位置通过包名引入：

```js
import { OpenClawPluginAdapter, getAdapter } from 'openclaw-glance-plugin';
```

**全局安装的优势：**
- 统一插件版本，便于多服务节点一致发布
- 在单个 Node 进程内可通过 `getAdapter()` 复用一个 WebSocket 连接
- 避免重复连接导致的风控问题
- 降低重复初始化成本

## 2.1 安装 Skill

该插件包含 OpenClaw Skill，可实现自然语言盯盘需求（需 OpenClaw v0.4+）。

```bash
# 默认方式：clone 仓库安装
git clone git@github.com:lingyv/glance-watch.git
cp -r glance-watch ~/.openclaw/skills/
```

可选方式（clawhub）：

```bash
npx clawhub@latest install glance-watch

# 或
pnpm dlx clawhub@latest install glance-watch

# 或
bunx clawhub@latest install glance-watch
```

安装后 OpenClaw 会自动加载 skill，用户可通过自然语言请求盯盘：
- "帮我盯着比特币，超过 73000 提醒我"
- "监控腾讯控股价格，跌到 400 以下提醒"
- "盯一下沪深300指数"

## 3. 申请 WebSocket token

在网页上申请 `OPENCLAW_WS_TOKEN`。

token 使用约束：
- 该 token 用于 WebSocket 握手鉴权（`Authorization: Bearer <TOKEN>`）
- 失效或无效时，连接会失败并返回 `invalid token`
- 需重新在网页申请新 token

## 4. 在 OpenClaw 中初始化插件

```js
import { OpenClawPluginAdapter } from 'openclaw-glance-plugin';

const bridgeBase = 'wss://glanceup-pre.100credit.cn';
const token = '<JWT_TOKEN>'; // 上面申请的token

const adapter = new OpenClawPluginAdapter({
  baseWsUrl: bridgeBase,
  token,
  enqueueIfDisconnected: true
});

await adapter.start();
```

## 5. 提交盯盘需求

### 5.-1 创建前校验清单（给大模型）

创建前建议按以下顺序校验：

1. `productCode` 是否有效（A股6位、港股5位、BTC 通常 `BTCUSDT`）。  
2. `productType` 是否在支持范围：`stock/index/hk_stock/crypto`。  
3. `condition` 是否只使用允许变量。  
4. `variables` 是否包含条件中引用的全部阈值。  
5. `channels` 是否包含 `openclaw`。  

### 5.0 通知渠道支持

插件支持以下渠道组合：

- `openclaw`：回调到 OpenClaw 长连接（必传）
- `email`：邮件通知（需 `emailConfig`）
- `call`：电话外呼（需 `callConfig`）

你可以在一次策略创建里同时使用多个渠道，但 `openclaw` 渠道必须保留。如用户没明确说明使用邮件(email)、电话/外呼(call) 通知提醒，则只需要传入`openclaw` 渠道。

#### email 渠道参数（`emailConfig`）

常用参数：
- `to_address`：收件人邮箱（必填）
- `template_id`：邮件模板 ID（必填，默认为4，不需要修改）
- `template_params`：模板变量（可选）

示例：

```js
emailConfig: {
  to_address: 'demo@example.com',
  template_id: 4,
  template_params: {
    title: '监控提醒',
    product_name: '腾讯控股',
    threshold: '430'
  }
}
```

#### call 渠道参数（`callConfig`）

常用参数：
- `phone`：手机号（必填）
- `customer_name`：客户姓名（可选）
- `condition`：外呼文案（可选，通常可不填，默认使用触发消息）
- 建议手机号使用标准 11 位手机号字符串

示例：

```js
callConfig: {
  phone: '13800138000',
  customer_name: 'Demo',
  condition: '腾讯控股价格达到430港元'
}
```

### 5.1 市场类型与代码

| 市场 | `productType` | `productCode` 示例 | 行情频率 | 说明 |
|------|---------------|-------------------|----------|------|
| A股个股 | `stock` | `000001` | 约每 3 秒 | 可使用 `turnover_rate` |
| A股指数 | `index` | `000300` | 约每 3 秒 | 可使用 `turnover_rate` |
| 港股 | `hk_stock` | `00700` | 延迟约 15 分钟 | 可使用 `turnover_rate` |
| 比特币 | `crypto` | `BTCUSDT` | 约每 10 秒 | 不支持 `turnover_rate` |

常用意图映射（给模型）：
- “A股个股/股票” -> `stock`
- “指数/沪深300/上证” -> `index`
- “港股/腾讯/美团” -> `hk_stock`
- “比特币/BTC” -> `crypto`

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

### 5.4.1 多渠道示例（OpenClaw + 邮件 + 电话）

```js
await adapter.submitWatchDemand({
  productCode: '00700',
  productType: 'hk_stock',
  condition: 'price >= threshold',
  variables: { threshold: 430, product_name: '腾讯控股' },
  channels: ['openclaw', 'email', 'call'],
  emailConfig: {
    to_address: 'demo@example.com',
    template_id: 4,
    template_params: { title: '监控提醒' }
  },
  callConfig: {
    phone: '13800138000',
    customer_name: 'Demo'
  }
});
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
import { OpenClawBridgeClient } from 'openclaw-glance-plugin';

const client = new OpenClawBridgeClient({
  baseWsUrl: 'wss://glanceup-pre.100credit.cn',
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

建议在回调中至少透传：
- `strategy_id`
- `product_code`
- `message`
- `market_data.price`

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
