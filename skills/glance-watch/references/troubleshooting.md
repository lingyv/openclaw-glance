# 重试与排障

## 统一重试原则

- 超时或网络波动时可重试。
- 重试必须使用同一组 payload（字段和值不变）。
- `request_id` 由插件运行时自动生成并在同 payload 上复用。

## 创建策略失败（`watch_create`）

处理规则：
- 明确返回失败原因，不静默重试。
- 若报“未注册的算子类型”，将 `operator_type` 修正为 `rule` 后重试。
- 若报 `UNSUPPORTED_PRODUCT_TYPE`，说明命中了基金边界（如 `fund` 或 `000006.OF`）：
  - 不再重试 `watch_create`
  - 改用 `watch_query_fund_estimates` 或 `watch_search_fund_basic`

## 通知失败（`notify_*`）

处理规则：
- 优先返回 `code/error/hint`。
- `MISSING_REQUIRED_FIELD`：仅补缺失字段后重试。
- `UNSUPPORTED_MESSAGE_TYPE`：提示 bridge 版本不支持，需升级并重启。
- `UPSTREAM_UNAVAILABLE`：提示上游不可用或超时，稍后重试。

## 离线补发识别（`watch.triggered`）

满足任一条件视为离线补发：
- `delivery_mode = "offline_replay"`
- `replayed = true`

时间语义：
- `trigger_time`：原始触发时间
- `replayed_at`：补发时间

用户文案需明确“离线期间触发，当前为补发”。

## 触发后动作

1. 解析 `market_data` 提取价格、涨跌幅。
2. 通过 `openclaw` 回当前群/私聊。
3. 附加渠道按用户要求发送。
4. 生成简洁提醒文案。
