# Watch 动作契约

## `watch.query_ticker`

参数：
- `stockCode`（或 `productCode`）
- `productType`
- `market`（`crypto` 可传空字符串）

成功判定：
- `code = "000000"` 或 `success = true`

失败处理：
- 返回失败原因
- 引导用户确认代码/市场后重试

## `watch.create`

最小参数：
- `product_code`
- `product_type`
- `operator_type`（固定 `rule`）
- `operator_parameters`（包含 `condition`、`variables`）

建议参数：
- `channels`（默认至少 `openclaw`）
- `channel_configs.*`

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
    }
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
      template_id: 3,
      msg_type: 'text',
      content: '比特币跌幅超2%！当前价格 ${price}，跌幅 ${change_percent}%。建议卖出！'
    },
    sms: {
      receiver: '13800138000',
      template_id: 90010,
      content: '比特币跌幅超2%！当前价格 ${price}，建议卖出！'
    }
  }
}
```

禁止项：
- `operator_type` 非 `rule`
- 顶层 `condition`
- `channel_configs` 渠道配置是字符串
- 用户未要求渠道却默认附加

成功判定：
- `success = true`

失败处理：
- 明确返回失败原因，不静默重试
- 超时/网络波动重试时，使用同一 payload（字段和值不变）
- `request_id` 由插件运行时自动生成并复用，大模型不手动传

## `watch.pause` / `watch.activate` / `watch.remove`

参数：
- `strategyId`（或 `strategy_id`）

成功判定：
- `success = true`

失败处理：
- 返回失败原因并提示用户确认策略 ID

## `watch.list`

可选参数：
- `status`: `active/paused/completed/failed/expired`
- `product_code`（或 `productCode`）

成功判定：
- `success = true`
- `data.total` 为命中数量
- `data.strategies` 为策略列表

失败处理：
- 返回失败原因，不静默重试
- 空结果明确告知“当前条件下没有策略”

安全约束：
- 仅可查询当前连接用户自己的策略
- 不通过 `user_id/use_id` 越权查询

## 调用前最终检查

1. `watch.create` 使用 snake_case：`product_code/product_type/operator_type/operator_parameters/channel_configs`
2. `operator_type` 固定 `rule`
3. `operator_parameters.condition` 与 `variables` 同时存在
4. `channels` 与 `channel_configs` 一一对应
5. 渠道配置是对象，不是 JSON 字符串
6. 默认不手动传 `request_id`

## 买卖意图与条件方向

| 用户意图 | 条件方向 |
|---------|---------|
| 买入（逢低） | `price <= threshold` |
| 卖出（止盈/止损） | `price >= threshold` |

判断规则：
1. 用户明确说“涨到/跌到”时，按方向直接生成条件。
2. 用户只说“到了 XX 提醒我”时，必须追问“买还是卖”。
3. 常见映射：
- `涨到/涨过/突破/冲到` -> `price >= threshold`
- `跌到/跌破/回调到/回到` -> `price <= threshold`
- `到了/到达/价格到` -> 方向不明确，需追问
