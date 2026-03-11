---
name: glance-watch
description: 智能盯盘插件，用于监控A股、港股、比特币等金融市场行情并在条件触发时发送提醒。当用户要求盯盘、监控价格、设置提醒、需要通过邮件/电话/短信/钉钉发起通知时自动触发，例如"帮我盯着比特币"、监控某只股票、涨跌幅提醒、短信通知我等。
---

# Glance Watch 智能盯盘

## 快速开始

1. **前置条件**（已完成）：
   - 插件/包已安装并可用（由宿主环境预先完成）
   - 宿主已启动插件运行时（长连接由插件后台维护）

2. **用户请求盯盘时**，解析用户需求提取：
   - `productCode`: 产品代码
   - `productType`: 市场类型 (stock/index/hk_stock/crypto)
   - `condition`: 条件表达式
   - `variables`: 变量值

3. **通过已安装运行时提交盯盘请求**（长连接由宿主运行时维护）
4. **用户要求“查行情/看当前价格/报价”时**，优先调用 `queryTickerData` 获取实时数据，再决定是否创建盯盘策略。
5. **用户要求“发短信/打电话/发邮件”时**。

## 调用契约（必须遵循）

### 统一动作名

宿主需将已安装插件/包接口映射为以下动作名（建议保持一致）：

- `watch.query_ticker`
- `watch.create`
- `watch.pause`
- `watch.activate`
- `watch.remove`
- `notify.sms`
- `notify.call`
- `notify.email`
- `notify.dingtalk`

### 调用顺序

1. 用户是“查行情”意图：先调用 `watch.query_ticker`
2. 用户是“盯盘创建”意图：先补齐参数后调用 `watch.create`
3. 用户是“暂停/恢复/删除”意图：分别调用 `watch.pause` / `watch.activate` / `watch.remove`
4. 用户是“立即发短信/打电话/发邮件/发钉钉”意图：调用 `notify.sms` / `notify.call` / `notify.email` / `notify.dingtalk`

禁止跳步：创建盯盘前若缺关键字段必须先追问。

### 动作参数与成功判定

#### `watch.query_ticker`

参数：
- `stockCode`（或 `productCode`）
- `productType`
- `market`（`crypto` 可传空字符串）

成功判定：
- 返回 `code = "000000"` 或 `success = true`

失败处理：
- 返回失败原因
- 引导用户确认代码/市场后重试

#### `watch.create`

参数（最少）：
- `productCode`
- `productType`
- `condition`
- `variables`

建议附加：
- `channels`（默认至少包含 `openclaw`）
- 对应渠道配置（`emailConfig/callConfig/smsConfig`）

渠道参数要求（必须）：
- 只要 `channels` 包含 `email`，必须提供 `emailConfig` 且包含 `to_address`
- 只要 `channels` 包含 `call`，必须提供 `callConfig` 且包含 `phone`
- 只要 `channels` 包含 `sms`，必须提供 `smsConfig` 且包含 `receiver`（或 `phone`）
- 只要 `channels` 包含 `dingtalk`，必须提供 `dingtalkConfig` 且包含 `cas_id`

成功判定：
- 返回 `success = true`

失败处理：
- 明确返回失败原因，不要静默重试
- 提示用户补充或修正参数

#### `watch.pause` / `watch.activate` / `watch.remove`

参数：
- `strategyId`（或 `strategy_id`）

成功判定：
- 返回 `success = true`

失败处理：
- 返回失败原因并提示用户确认策略 ID

#### `notify.sms` / `notify.call` / `notify.email` / `notify.dingtalk`

参数：
- `notify.sms`：必须提供手机号（`receiver` 或 `phone`）
- `notify.call`：必须提供 `phone`
- `notify.email`：必须提供 `to_address`
- `notify.dingtalk`：必须提供 `cas_id`

成功判定：
- 返回 `success = true`

失败处理：
- 明确返回失败原因，不要静默重试

回执说明：
- 直连通知发送完成后，客户端会收到 `notify.sent` 事件（`overall_status/success_count/failed_count/deliveries`）

## 调用判定规则

只有在用户明确表达以下意图时调用插件：
- “帮我盯盘/监控/提醒”
- “涨到/跌到某个价格提醒我”
- “达到某个涨跌幅提醒我”

调用前必须确认：
- `productCode`（标的代码）
- `productType`（`stock/index/hk_stock/crypto`）
- `condition`（规则表达式）
- `variables`（阈值变量）

缺任一项时先追问，不要猜测阈值。

### 买卖意图与条件方向

用户设置价格提醒时，往往不会说"大于等于"或"小于等于"，而是说"到了XX提醒我"。此时需要判断用户的**买卖意图**来决定条件方向：

| 用户意图 | 条件方向 | 说明 |
|---------|---------|------|
| 想买入（逢低买入） | `price <= threshold` | 价格**跌到**目标价时提醒，抄底机会 |
| 想卖出（止盈/止损） | `price >= threshold` | 价格**涨到**目标价时提醒，落袋为安 |

**判断流程：**

1. 如果用户明确说了方向（如"涨到XX"、"跌到XX"），直接使用对应条件
2. 如果用户只说"到了XX提醒我"，**必须追问一句**：
   - "你是想在价格涨到XX时卖出，还是跌到XX时买入？"
   - 或者更简洁地问："这个是准备买还是卖？买的话我帮你盯跌到XX，卖的话盯涨到XX"
3. 根据用户回答设置条件：
   - 买入 → `price <= threshold`
   - 卖出 → `price >= threshold`

**常见表达映射：**
- "涨到/涨过/突破/冲到" → `price >= threshold`（卖出方向）
- "跌到/跌破/回调到/回到" → `price <= threshold`（买入方向）
- "到了/到达/价格到" → **方向不明确，需追问买还是卖**

## 标的检索规则（必须遵循）

当不能直接确定 `productCode`/`productType` 时，必须先在本地标的数据中检索，再和用户确认。

数据文件（CSV，字段为 `类型,代码,名称,完整代码,市场`）：
- `data/stock_a.csv`：A股个股列表（`productType=stock`）
- `data/stock_hk.csv`：港股个股列表（`productType=hk_stock`）
- `data/index_a.csv`：A股指数列表（`productType=index`）

### 场景1：用户只说股票简称/名称
- 使用模糊搜索在上述 CSV 中查找名称。
- 若命中多条，必须把候选项（代码 + 名称 + 市场）发给用户确认，不要自行猜测。
- 用户确认后再创建策略。

### 场景2：不知道某个标的代码或所属市场
- 使用 `rg`（或 `grep`）在三个 CSV 中搜索标的名称或代码。
- 根据命中结果判断市场并映射 `productType`：
  - A股个股 -> `stock`
  - 港股个股 -> `hk_stock`
  - A股指数 -> `index`
- 若搜索结果不唯一或冲突，先向用户确认后再继续。

### 推荐检索命令

```bash
# 按名称模糊查找（推荐）
rg -n "平安银行|腾讯|沪深300|BTC" data/stock_a.csv data/stock_hk.csv data/index_a.csv

# 按代码查找
rg -n "000001|00700|399001" data/stock_a.csv data/stock_hk.csv data/index_a.csv

# grep 兜底（无 rg 时）
grep -nE "平安银行|腾讯|沪深300|000001|00700" data/stock_a.csv data/stock_hk.csv data/index_a.csv
```

## 行情查询（queryTickerData）

当用户问“现在多少钱”“最新价格”“查一下某标的行情”等问题时，执行以下流程：

1. 先根据用户输入确定标的代码与市场：
- 如果是简称/名称，先在 `data/*.csv` 里模糊搜索并向用户确认候选。
- 如果是明确代码，按代码在 `data/*.csv` 查对应 `市场`。

2. 调用已安装插件/包暴露的查询接口（例如 `queryTickerData`）：

```javascript
await runtime.queryTickerData({
  stockCode: '00700',   // 或 productCode
  market: 'HK',         // SH/SZ/HK，crypto 可传 ''
  productType: 'hk_stock'
})
```

3. 根据返回结果给用户反馈：
- `code = "000000"`：返回行情数据（如最新价格、涨跌幅等）。
- 非 `000000`：返回失败原因，并建议用户确认代码/市场后重试。

## 渠道参数填写

`openclaw` 渠道必传，`email` / `call` / `sms` / `dingtalk` 可选。如用户没明确说明使用邮件(email)、电话/外呼(call)、短信(sms)、钉钉(dingtalk)通知提醒，则只需要传入`openclaw`渠道。

但一旦用户选择了某个通知渠道，其配置参数必须完整填写：
- 选择 `email` 必须提供 `emailConfig.to_address`
- 选择 `call` 必须提供 `callConfig.phone`
- 选择 `sms` 必须提供 `smsConfig.receiver`（或 `phone`）
- 选择 `dingtalk` 必须提供 `dingtalkConfig.cas_id`

### email 参数（emailConfig）
- `to_address`：收件人邮箱（必填，缺失不可创建/不可发送）
- `template_id`：邮件模板 ID（必填，默认为4，不需要修改）
- `template_params`：模板变量
- `title`: 收到邮件的标题
- `product_name`: 产品名称 
- `content`: 消息内容
示例：
```javascript
emailConfig: {
  to_address: 'demo@example.com',
  template_id: 4,
  template_params: {
    title: '监控提醒',
    product_name: '比特币',
    content: '测试消息1'
  }
}
```
用户收到的是一封title为"监控提醒",内容为"测试消息1"的一封邮件

### call 参数（callConfig）
- `phone`：手机号（必填，缺失不可创建/不可发送）
- `customer_name`：客户名称
- `condition`：外呼内容

示例：
```javascript
callConfig: {
  phone: '13800138000',
  customer_name: 'Demo',
  condition: '比特币价格突破阈值'
}
```
用户收到的是一通打给手机号码为13800138000的电话，电话内容为'比特币价格突破阈值'


### sms 参数（smsConfig）
- `receiver`：手机号（必填，必须是纯数字；缺失不可创建/不可发送）
- `template_id`：短信模板 ID（可选，默认 90010，不需要修改）
- `content`：短信变量内容

示例：
```javascript
smsConfig: {
  receiver: '13800138000',
  template_id: 90010,
  content: '测试消息1'
}
```
用户收到的是一封发送给手机号码为13800138000的短信，短信内容为'测试消息1'


### 钉钉 参数（dingtalkConfig）
- `cas_id`：钉钉用户ID（必填，缺失不可创建/不可发送）
- `template_id`：钉钉模板 ID（可选，默认 3，不需要修改）
- `msg_type`: 消息类型：text/markdown，默认 text
- `content`：消息内容

示例：
```javascript
dingtalkConfig: {
  cas_id: 'user.dingtalk',
  template_id: 3,
  msg_type: "text",
  content: "测试消息1"
}
```
用户收到的是一条发送给钉钉号为user.dingtalk的单聊消息，消息内容为'测试消息1'


## 支持的市场

| 市场 | productType | 示例 | 说明 |
|------|-------------|------|------|
| A股个股 | stock | 000001 | 每3秒行情 |
| A股指数 | index | 000300 | 每3秒行情 |
| 港股 | hk_stock | 00700 | 延迟15分钟 |
| 加密货币 | crypto | BTCUSDT | 每10秒行情 |

意图映射建议：
- 用户提到“指数/沪深300/上证” -> `index`
- 用户提到“港股” -> `hk_stock`
- 用户提到“比特币/BTC” -> `crypto`
- 其余股票默认先按 `stock` 处理并在必要时追问确认

详细产品代码见 [references/markets.md](references/markets.md)

## 使用示例

### 比特币监控
```javascript
// 条件: 价格 >= 73000 且涨幅 >= 1%
condition: 'price >= threshold and change_percent >= cp_threshold'
variables: { threshold: 73000, cp_threshold: 0.01, product_name: 'Bitcoin' }
// 注意: crypto 不支持 turnover_rate
```

### A股监控
```javascript
// 条件: 价格 >= 12.5 且换手率 >= 1%
condition: 'price >= threshold and turnover_rate >= tr_threshold'
variables: { threshold: 12.5, tr_threshold: 0.01, product_name: '平安银行' }
```

### 港股监控
```javascript
// 条件: 价格 >= 420
condition: 'price >= threshold'
variables: { threshold: 420, product_name: '腾讯控股' }
```

## 触发后操作

当监控触发时:
1. 解析 `market_data` 获取价格、涨跌幅等信息
2. 发送提醒到用户当前对话的渠道（群聊/私聊）
3. `openclaw` 渠道必传，`email/call/sms/dingtalk` 可按需附加
4. 根据触发消息构建友好的提醒文案

如果创建失败（`watch.create.result.success=false`）：
- 明确返回失败原因给用户
- 引导用户补充或修正参数后再次创建

## 相关资源

- 市场参考: [references/markets.md](references/markets.md)
