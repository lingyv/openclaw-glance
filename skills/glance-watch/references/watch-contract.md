# 盯盘策略（watch_*）

## 适用工具

- `watch_create`
- `watch_list`
- `watch_pause`
- `watch_activate`
- `watch_remove`

## 0. 产品边界

- 支持盯盘：`stock` / `hk_stock` / `index` / `crypto`

## 1. `watch_create`

最小参数：
- `product_code`
- `product_type`
- `operator_type`（固定 `rule`）
- `operator_parameters.condition`
- `operator_parameters.variables`

建议参数：
- `channels`（至少 1 个渠道；是否包含 `openclaw` 见下方渠道规则）
- `channel_configs`

### operator_parameters 填写说明

字段定义：
- `operator_parameters.condition`：触发条件表达式（字符串，必填）
- `operator_parameters.variables`：条件表达式里引用的变量（对象，建议必填）
- `operator_parameters.message_template`：触发提示文案模板（字符串，建议填写）
- `operator_parameters.symbols`：多标的策略的别名映射（对象，可选）

表达式支持：
- 比较：`<`, `<=`, `>`, `>=`, `==`, `!=`
- 逻辑：`and`, `or`
- 可用行情字段：`price`, `volume`, `change_percent`
- A股/港股额外可用：`turnover_rate`
- `crypto` 不要使用 `turnover_rate`

字段含义（其中 `volume` / `change_percent` / `turnover_rate` 都是日内指标）：
- `price`：最新成交价。
- `volume`：当日累计成交量（日内）。
- `change_percent`：当日涨跌幅（日内，小数表示；如 2% 写 `0.02`，-2% 写 `-0.02`）。
- `turnover_rate`：当日换手率（日内，小数表示；如 1% 写 `0.01`，仅 A股/港股可用）。

填写规则（创建策略时直接套用）：
- `condition` 只引用“行情字段 + variables 里的变量名”，不要写未定义变量。
- `variables` 键名必须和 `condition` 中引用一致（如 `threshold/tr_threshold/cp_threshold`）。
- `message_template` 推荐复用 `variables` 里的键位占位：`{product_name} ... {threshold}`。
- 文案优先放在 `message_template`，渠道内 `content/condition` 仅在用户明确要求时再覆盖。

常用模板（按市场）：
- A股/港股个股：
  `condition: "price >= threshold and turnover_rate >= tr_threshold"`
  `variables: { "threshold": 12.5, "tr_threshold": 0.01, "product_name": "平安银行" }`
- 指数：
  `condition: "price <= threshold"`
  `variables: { "threshold": 3500, "product_name": "沪深300" }`
- 加密：
  `condition: "price >= threshold and change_percent >= cp_threshold"`
  `variables: { "threshold": 70000, "cp_threshold": 0.02, "product_name": "Bitcoin" }`

渠道规则：
- 用户明确“仅/只用某几个渠道”时：严格按用户指定，可不含 `openclaw`。
- 用户只说“用某个渠道/某几个渠道”但未强调“仅限”时：默认补 `openclaw`。
- 不得擅自附加除 `openclaw` 之外的其他渠道。

OpenClaw 路由约束（当 `channels` 包含 `openclaw`）：
- `channel_configs.openclaw` 必须能定位当前会话。
- 常用字段：`channel`（或 `source_channel`）、`account_id`、`session_key`、`conversation_id`（或 `chat_id`）。
- 禁止传空对象 `openclaw: {}` 充当已配置路由。
- 若宿主提供 `context` 路由信息，优先使用宿主信息。

若 `channels` 包含 `call/sms/email/dingtalk`：
- 调用前必须读取联系人 CSV 并补齐参数
- 不可省略对应渠道必填配置

固定结构（字段名不可改）：

```javascript
{
  product_code: 'BTCUSDT',
  product_type: 'crypto',
  operator_type: 'rule',
  operator_parameters: {
    condition: 'change_percent <= cp_threshold',
    variables: {
      cp_threshold: -0.02,
      product_name: '比特币'
    },
    message_template: '{product_name} 跌幅达到 {cp_threshold}，当前价格 {price}'
  },
  channels: ['openclaw', 'dingtalk', 'sms'],
  channel_configs: {
    openclaw: {
      channel: 'dingtalk',
      account_id: 'default',
      session_key: 'agent:main:dingtalk:group:<conversation_id>',
      conversation_id: '<conversation_id>'
    },
    dingtalk: {
      cas_id: 'jinguo.xie',
      msg_type: 'text',
      content: '比特币跌幅超2%！当前价格 ${price}，跌幅 ${change_percent}%。建议卖出！'
    },
    sms: {
      receiver: '13800138000',
      content: '比特币跌幅超2%！当前价格 ${price}，建议卖出！'
    }
  }
}
```

参数填写指引（创建策略时）：
- `channel_configs.sms.receiver`：手机号，优先本轮用户输入，否则联系人 CSV。
- `channel_configs.sms.content`：短信正文，写清触发条件+关键行情值。
- `channel_configs.email.to_address`：收件邮箱，优先本轮输入，否则 CSV。
- `channel_configs.email.title/content`：标题写“标的 + 触发事件”，正文写“当前值 + 阈值 + 建议动作”。
- `channel_configs.call.phone/customer_name/condition`：分别为号码、称呼、电话播报文案。
- `channel_configs.dingtalk.cas_id`：钉钉接收账号；`msg_type` 用 `text` 或 `markdown`；`content` 为消息正文。

成功判定：
- `success === true`

失败处理：
- 返回失败原因，不静默重试
- 网络波动可重试，但 payload 字段和值保持一致
- 不手动传 `request_id`

禁止项：
- `operator_type` 非 `rule`
- 顶层放 `condition`
- `channel_configs.*` 传 JSON 字符串
- 用户明确“仅/只用某几个渠道”时仍强行附加渠道

## 联系人 CSV（创建策略场景必遵守）

联系人真源：`~/.openclaw/workspace/memory/watch-notify-contacts.csv`

规则：
1. `watch_create` 涉及 `call/sms/email/dingtalk` 时，调用前必须先查 CSV。
2. 补值优先级：用户本轮输入 > CSV 历史值 > 追问。
3. 调用成功后，如联系方式有新增或变化，必须回写 CSV。
4. 只认该 CSV，不读取其他联系人文件。

建议表头：

```text
channel,sender_id,sender_name,phone,email,dingtalk_cas_id,customer_name,updated_at,notes
```

查询示例：

```bash
rg -n '^sms,jinguo\.xie,' ~/.openclaw/workspace/memory/watch-notify-contacts.csv
```

回写要求：

- 已有同一 `(channel, sender_id)`：更新该行，不重复追加
- 不存在：按表头顺序追加
- `updated_at`：写 ISO-8601 时间

## 2. `watch_list`

可选参数：
- `status`：`active/paused/completed/failed/expired`
- `product_code`（或 `productCode`）

成功判定：
- `success === true`
- `data.total` 与 `data.strategies` 可读

空结果文案：
- 当 `data.total === 0` 时，明确告知“当前条件下没有策略”。

安全约束：
- 仅查询当前连接用户策略
- 禁止通过 `user_id/use_id` 越权查询

## 3. `watch_pause` / `watch_activate` / `watch_remove`

参数：
- `strategy_id`（或 `strategyId`）

成功判定：
- `success === true`

## 调用前最终检查（`watch_create`）

1. 字段名使用 snake_case：`product_code/product_type/operator_type/operator_parameters/channels/channel_configs`
2. `operator_type` 固定为 `rule`
3. `operator_parameters.condition` 与 `operator_parameters.variables` 同时存在
4. `message_template` 建议填写，且占位符与变量名一致
5. `channels` 至少一个，且与 `channel_configs` 对应
6. 渠道配置必须是对象，不能是 JSON 字符串
7. 不手动传 `request_id`

## 4. 买卖意图与条件方向

| 用户意图 | 条件方向 |
|---|---|
| 买入（逢低） | `price <= threshold` |
| 卖出（止盈/止损） | `price >= threshold` |

规则：
1. 用户明确“涨到/跌到”时按方向生成。
2. 用户只说“到了XX提醒我”时先追问买卖方向。
