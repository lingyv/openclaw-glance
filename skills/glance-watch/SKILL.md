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
   - `product_code`: 产品代码
   - `product_type`: 市场类型 (stock/index/hk_stock/crypto)
   - `operator_type`: 固定为 `rule`
   - `operator_parameters.condition`: 条件表达式
   - `operator_parameters.variables`: 变量值

3. **通过已安装运行时提交盯盘请求**（长连接由宿主运行时维护）
4. **用户要求“查行情/看当前价格/报价”时**，优先调用 `queryTickerData` 获取实时数据，再决定是否创建盯盘策略。
5. **用户要求“发短信/打电话/发邮件/发钉钉”时**，调用对应 `notify.*` 动作直接发送。

## 调用契约（必须遵循）

### 统一动作名

宿主需将已安装插件/包接口映射为以下动作名（建议保持一致）：

- `watch.query_ticker`
- `watch.create`
- `watch.list`
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
4. 用户是“查看策略/查看我的策略/看 active 或 paused 或 completed 策略”意图：调用 `watch.list`
5. 用户是“立即发短信/打电话/发邮件/发钉钉”意图：调用 `notify.sms` / `notify.call` / `notify.email` / `notify.dingtalk`

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
- `product_code`
- `product_type`
- `operator_type`
- `operator_parameters`

建议附加：
- `channels`（默认至少包含 `openclaw`）
- 对应渠道配置（`channel_configs.email/call/sms/dingtalk`）

固定模板（必须按此结构构造，字段名不要改）：

```javascript
{
  product_code: 'BTCUSDT',
  product_type: 'crypto',
  operator_type: 'rule', // 必须是 rule，不可改成条件表达式
  operator_parameters: {
    condition: 'change_percent <= cp_threshold',
    variables: {
      cp_threshold: -0.02,
      product_name: '比特币'
    }
  },
  channels: ['openclaw', 'dingtalk', 'sms'],
  // 注意：必须是对象，不要传 JSON 字符串
  channel_configs: {
    openclaw: {},
    dingtalk: {
      cas_id: 'jinguo.xie',
      template_id: 3,
      msg_type: 'text',
      content: '比特币跌幅超2%！当前价格 ${price}，跌幅 ${change_percent}%。建议卖出！'
    },
    sms: {
      receiver: '18616726853',
      template_id: 90010,
      content: '比特币跌幅超2%！当前价格 ${price}，建议卖出！'
    }
  }
}
```

禁止项（任何一条命中都必须先修正再调用）：
- `operator_type` 不是 `rule`（例如写成 `change_percent <=`）
- 把 `condition` 放在顶层，而不是 `operator_parameters.condition`
- 把 `channel_configs` 下的渠道配置传成 JSON 字符串
- 用户未要求某渠道，却默认附加该渠道配置

渠道参数要求（必须）：
- 只要 `channels` 包含 `email`，必须提供 `channel_configs.email.to_address/template_id/title/content`
- 只要 `channels` 包含 `call`，必须提供 `channel_configs.call.phone/customer_name/condition`
- 只要 `channels` 包含 `sms`，必须提供 `channel_configs.sms.receiver(或phone)/template_id/content`
- 只要 `channels` 包含 `dingtalk`，必须提供 `channel_configs.dingtalk.cas_id/template_id/msg_type/content`

成功判定：
- 返回 `success = true`

失败处理：
- 明确返回失败原因，不要静默重试
- 提示用户补充或修正参数
- 若是超时/网络波动导致的重试，必须使用同一组创建参数再次调用 `watch.create`（不要改字段和值），避免重复创建策略
- `request_id` 由插件运行时自动生成并在同 payload 重试时自动复用；大模型无需手动设置 `request_id`

小模型（7B）执行策略（强约束）：
1. 先用固定模板生成 payload 骨架，不要自由发挥字段名
2. 仅替换值：`product_code/product_type/operator_parameters/channels/channel_configs`
3. 发送前逐条自检“禁止项”
4. 若失败返回 `400` 且提示“未注册的算子类型”，立即把 `operator_type` 纠正为 `rule` 并重试

#### `watch.pause` / `watch.activate` / `watch.remove`

参数：
- `strategyId`（或 `strategy_id`）

成功判定：
- 返回 `success = true`

失败处理：
- 返回失败原因并提示用户确认策略 ID

#### `watch.list`

参数（可选）：
- `status`：策略状态过滤。可传 `active` / `paused` / `completed` / `failed` / `expired`；不传表示查询该用户全部策略
- `product_code`（或 `productCode`）：按标的代码过滤

成功判定：
- 返回 `success = true`
- `data.total` 为命中策略数，`data.strategies` 为策略列表

失败处理：
- 返回失败原因，不要静默重试
- 若筛选条件为空结果，明确告知“当前条件下没有策略”

安全约束（必须）：
- `watch.list` 只能查询当前连接用户自己的策略
- 不要尝试通过参数传 `user_id` / `use_id` 越权查询

#### `notify.sms` / `notify.call` / `notify.email` / `notify.dingtalk`

参数：
- `notify.sms`：必须提供 `receiver`（或 `phone`）、`template_id`、`content`
- `notify.call`：必须提供 `phone`、`customer_name`、`condition`
- `notify.email`：必须提供 `to_address`、`template_id`、`title`、`content`
- `notify.dingtalk`：必须提供 `cas_id`、`template_id`、`msg_type`、`content`

固定模板（必须按此结构，不要增删字段名）：

```javascript
// notify.sms
{ receiver: '13800138000', template_id: 90010, content: '测试消息1' }

// notify.call
{ phone: '13800138000', customer_name: 'Demo', condition: '比特币跌幅超过2%' }

// notify.email
{ to_address: 'demo@example.com', template_id: 4, title: '监控提醒', content: '测试消息1' }

// notify.dingtalk
{ cas_id: 'user.dingtalk', template_id: 3, msg_type: 'text', content: '测试消息1' }
```

禁止项（任何一条命中都必须先修正再调用）：
- 把手机号写成非数字字符串（空格、`+86-`、中划线等）
- 把 `template_id` 写成字符串（应传数字）
- `msg_type` 传非 `text/markdown`
- 传入 `request_id`（通知请求由插件运行时自动生成并复用）

成功判定：
- 返回 `success = true`

失败处理：
- 明确返回失败原因，不要静默重试
- 若是超时/网络波动导致的重试，必须使用同一组通知参数再次调用（不要改字段和值）
- `request_id` 由插件运行时自动生成并在同 payload 重试时自动复用；大模型无需手动设置 `request_id`
- 若返回缺字段错误（如 `MISSING_REQUIRED_FIELD`），只补缺失字段，其他字段保持不变再重试

回执说明：
- 直连通知发送完成后，客户端会收到 `notify.sent` 事件（`overall_status/success_count/failed_count/deliveries`）

## 调用判定规则

只有在用户明确表达以下意图时调用插件：
- “帮我盯盘/监控/提醒”
- “涨到/跌到某个价格提醒我”
- “达到某个涨跌幅提醒我”

调用前必须确认：
- `product_code`（标的代码）
- `product_type`（`stock/index/hk_stock/crypto`）
- `operator_parameters.condition`（规则表达式）
- `operator_parameters.variables`（阈值变量）

缺任一项时先追问，不要猜测阈值。

### 调用前最终检查（小尺寸模型 必做）

在实际调用工具前，逐条检查：
1. `watch.create` 是否使用 `snake_case`：`product_code/product_type/operator_type/operator_parameters/channel_configs`
2. `operator_type` 是否固定为 `rule`
3. `operator_parameters.condition` 与 `operator_parameters.variables` 是否都存在
4. `channels` 是否与 `channel_configs` 一一对应（选了哪个渠道就必须有哪个配置）
5. 所有配置是否为对象而非 JSON 字符串
6. `request_id` 默认不手动传；由插件自动生成并在同 payload 重试时复用。仅当宿主框架明确要求外部指定时才传，并且重试必须保持不变

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

当不能直接确定 `product_code`/`product_type` 时，必须先在本地标的数据中检索，再和用户确认。

数据文件（CSV，字段为 `类型,代码,名称,完整代码,市场`）：
- `data/stock_a.csv`：A股个股列表（`productType=stock`）
- `data/stock_hk.csv`：港股个股列表（`productType=hk_stock`）
- `data/index_a.csv`：A股指数列表（`productType=index`）
- `data/index_hk.csv`：港股指数列表（支持指数代码和中文名称查询）

### 场景1：用户只说股票简称/名称
- 使用模糊搜索在上述 CSV 中查找名称。
- 若命中多条，必须把候选项（代码 + 名称 + 市场）发给用户确认，不要自行猜测。
- 用户确认后再创建策略。

### 场景2：不知道某个标的代码或所属市场
- 使用 `rg`（或 `grep`）在四个 CSV 中搜索标的名称或代码。
- 根据命中结果判断市场并映射 `productType`：
  - A股个股 -> `stock`
  - 港股个股 -> `hk_stock`
  - A股指数 -> `index`
  - 港股指数 -> `index`（`market=HK`）
- 若搜索结果不唯一或冲突，先向用户确认后再继续。

### 推荐检索命令

```bash
# 按名称模糊查找（推荐）
rg -n "平安银行|腾讯|沪深300|BTC" data/stock_a.csv data/stock_hk.csv data/index_a.csv
rg -n "恒生科技指数|恒生指数|HSTECH|HSI" data/index_hk.csv

# 按代码查找
rg -n "000001|00700|399001" data/stock_a.csv data/stock_hk.csv data/index_a.csv
rg -n "HSTECH|HSI|VHSI" data/index_hk.csv

# grep 兜底（无 rg 时）
grep -nE "平安银行|腾讯|沪深300|000001|00700|恒生科技指数|HSTECH" data/stock_a.csv data/stock_hk.csv data/index_a.csv data/index_hk.csv
```

## 行情查询（queryTickerData）

当用户问“现在多少钱”“最新价格”“查一下某标的行情”等问题时，执行以下流程：

1. 先根据用户输入确定标的代码与市场：
- 如果是简称/名称，先在 `data/*.csv` 里模糊搜索并向用户确认候选。
- 如果是明确代码，按代码在 `data/*.csv` 查对应 `市场`。
- 港股指数可直接用代码（如 `HSTECH`）或中文名称（如 `恒生科技指数`）查询；命中 `index_hk.csv` 时优先使用 `market=HK`。

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
- 选择 `email` 必须提供 `channel_configs.email.to_address/template_id/title/content`
- 选择 `call` 必须提供 `channel_configs.call.phone/customer_name/condition`
- 选择 `sms` 必须提供 `channel_configs.sms.receiver(或phone)/template_id/content`
- 选择 `dingtalk` 必须提供 `channel_configs.dingtalk.cas_id/template_id/msg_type/content`

### email 参数（channel_configs.email）
- `to_address`：收件人邮箱（必填，缺失不可创建/不可发送）
- `template_id`：邮件模板 ID（必填，默认为4，不需要修改）
- `title`: 收到邮件的标题（必填）
- `content`: 消息内容（必填）
示例：
```javascript
channel_configs: {
  email: {
    to_address: 'demo@example.com',
    template_id: 4,
    title: '监控提醒',
    content: '测试消息1'
  }
}
```
用户收到的是一封title为"监控提醒",内容为"测试消息1"的一封邮件

### call 参数（channel_configs.call）
- `phone`：手机号（必填，缺失不可创建/不可发送）
- `customer_name`：客户名称（必填）
- `condition`：外呼内容（必填）

示例：
```javascript
channel_configs: {
  call: {
    phone: '13800138000',
    customer_name: 'Demo',
    condition: '比特币价格突破阈值'
  }
}
```
用户收到的是一通打给手机号码为13800138000的电话，电话内容为'比特币价格突破阈值'


### sms 参数（channel_configs.sms）
- `receiver`：手机号（必填，必须是纯数字；缺失不可创建/不可发送）
- `template_id`：短信模板 ID（必填，默认 90010，不需要修改）
- `content`：短信变量内容（必填）

示例：
```javascript
channel_configs: {
  sms: {
    receiver: '13800138000',
    template_id: 90010,
    content: '测试消息1'
  }
}
```
用户收到的是一封发送给手机号码为13800138000的短信，短信内容为'测试消息1'


### 钉钉 参数（channel_configs.dingtalk）
- `cas_id`：钉钉用户ID（必填，缺失不可创建/不可发送）
- `template_id`：钉钉模板 ID（必填，默认 3，不需要修改）
- `msg_type`: 消息类型（必填）：`text`/`markdown`
- `content`：消息内容（必填）

示例：
```javascript
channel_configs: {
  dingtalk: {
    cas_id: 'user.dingtalk',
    template_id: 3,
    msg_type: 'text',
    content: '测试消息1'
  }
}
```
用户收到的是一条发送给钉钉号为user.dingtalk的单聊消息，消息内容为'测试消息1'


## 支持的市场

| 市场 | productType | 示例 | 说明 |
|------|-------------|------|------|
| A股个股 | stock | 000001 | 每3秒行情 |
| A股指数 | index | 000300 | 每3秒行情 |
| 港股指数 | index | HSTECH / 恒生科技指数 | 查询时 `market=HK` |
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
// 条件: 价格 >= 73000 且涨幅 >= 1%（放在 operator_parameters 内）
operator_type: 'rule'
operator_parameters: {
  condition: 'price >= threshold and change_percent >= cp_threshold',
  variables: { threshold: 73000, cp_threshold: 0.01, product_name: 'Bitcoin' }
}
// 注意: crypto 不支持 turnover_rate
```

### A股监控
```javascript
// 条件: 价格 >= 12.5 且换手率 >= 1%（放在 operator_parameters 内）
operator_type: 'rule'
operator_parameters: {
  condition: 'price >= threshold and turnover_rate >= tr_threshold',
  variables: { threshold: 12.5, tr_threshold: 0.01, product_name: '平安银行' }
}
```

### 港股监控
```javascript
// 条件: 价格 >= 420（放在 operator_parameters 内）
operator_type: 'rule'
operator_parameters: {
  condition: 'price >= threshold',
  variables: { threshold: 420, product_name: '腾讯控股' }
}
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

如果直连通知失败（`notify.send.result.success=false`）：
- 优先读取并返回 `code/error/hint`，不要只说“通知失败”
- 若 `code=MISSING_REQUIRED_FIELD`，直接告诉用户缺失字段并让其补齐
- 若 `code=UNSUPPORTED_MESSAGE_TYPE`，提示“bridge 版本不支持 notify.send，需要升级并重启”
- 若 `code=UPSTREAM_UNAVAILABLE`，提示“notification 服务不可用或超时，请稍后重试”

## 相关资源

- 市场参考: [references/markets.md](references/markets.md)
