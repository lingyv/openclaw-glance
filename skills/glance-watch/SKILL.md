---
name: glance-watch
description: 智能盯盘插件，用于监控A股、港股、比特币等金融市场行情并在条件触发时发送提醒。当用户要求盯盘、监控价格、设置提醒、需要通过邮件/电话/短信/钉钉发起通知时自动触发，例如"帮我盯着比特币"、监控某只股票、涨跌幅提醒、短信通知我等。
---

# Glance Watch 智能盯盘（主入口）

## 目标

用最小上下文完成四类任务：
- 查行情：`watch.query_ticker`（A 股 / 港股 / 加密现货）
- 查基金实时估值：`watch_query_fund_estimates`（场外基金代码如 `000006.OF`，与 `market/quote` 不同）
- 建/管策略：`watch.create` / `watch.list` / `watch.pause` / `watch.activate` / `watch.remove`
- 立即通知：`notify.sms` / `notify.call` / `notify.email` / `notify.dingtalk`

## 调用契约（硬约束）

### 统一动作名

- `watch.query_ticker`
- `watch_query_fund_estimates`
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

1. 用户问“现在多少钱/查行情”（股票、指数、加密）-> 先 `watch.query_ticker`
2. 用户问“基金估值/净值估算/今天涨跌幅”（场外基金）-> `watch_query_fund_estimates`，传 `fund_codes`（单只字符串或多只数组，如 `000006.OF`）
3. 用户要“盯盘/提醒” -> 补齐参数后 `watch.create`
4. 用户要“看我的策略” -> `watch.list`
5. 用户要“暂停/恢复/删除” -> `watch.pause` / `watch.activate` / `watch.remove`
6. 用户要“马上发通知” -> 对应 `notify.*`

### 创建策略最小必填

- `product_code`
- `product_type`（`stock/index/hk_stock/crypto`）
- `operator_type`（固定 `rule`）
- `operator_parameters.condition`
- `operator_parameters.variables`

缺任一项先追问，不猜测阈值。

### 绝对禁止项

- `operator_type` 不是 `rule`
- 把 `condition` 放到顶层（必须在 `operator_parameters.condition`）
- 把 `channel_configs.*` 传成 JSON 字符串（必须是对象）
- 用户未要求的渠道被默认附加
- 通过 `watch.list` 传 `user_id/use_id` 越权查询

## 渐进式披露（按需读取）

仅在命中场景时读取对应文档，不要一次性加载全部 references。

- `watch.create/list/pause/activate/remove` 细节与成功判定：`references/watch-contract.md`
- 标的检索、行情查询流程：`references/query-and-symbol.md`
- 渠道参数、OpenClaw 路由、联系人记忆、`notify.*` 模板：`references/channels.md`
- 示例 payload：`references/examples.md`
- 重试、错误码、离线补发：`references/troubleshooting.md`
- 市场与代码速查：`references/markets.md`

## 决策表（强约束）

先判定用户主意图，再只读取最小文档集合：

| 用户主意图 | 必读文档（最小集合） |
|---|---|
| 查行情/当前价格/报价（股/指/加密） | `references/query-and-symbol.md` |
| 基金实时估值/净值估算 | `references/query-and-symbol.md`（基金小节） |
| 创建盯盘策略（代码和市场已明确） | `references/watch-contract.md` |
| 创建盯盘策略（名称或市场不明确） | `references/watch-contract.md` + `references/query-and-symbol.md` |
| 创建盯盘 + 指定通知渠道 | `references/watch-contract.md` + `references/channels.md` |
| 管理策略（list/pause/activate/remove） | `references/watch-contract.md` |
| 立即发通知（notify.*） | `references/channels.md` |
| 失败排查/补发说明 | `references/troubleshooting.md` |
| 市场或代码速查 | `references/markets.md` |

执行规则：
1. 一次请求默认只读 1-2 个 references 文件。
2. 仅当当前文档无法回答时，再追加读取下一个文档。
3. 读取顺序遵循上表，不按“完整性”一次加载所有文档。

## 小模型执行模板（7B）

1. 先按固定字段骨架生成 payload，不自创字段名。
2. 只替换值：`product_code/product_type/operator_parameters/channels/channel_configs`。
3. 调用前逐条自检“绝对禁止项”。
4. 若报 `400` 且提示“未注册的算子类型”，把 `operator_type` 纠正为 `rule` 后重试。

## 快速分流

- 用户说“帮我盯 BTC 跌 2% 提醒” -> 读取 `references/watch-contract.md` + `references/channels.md`
- 用户说“腾讯现在多少钱” -> 读取 `references/query-and-symbol.md`
- 用户说“这只基金今天估值多少” -> 读取 `references/query-and-symbol.md`（基金估值）
- 用户说“发短信给我” -> 读取 `references/channels.md`
- 用户说“为什么没发出来” -> 读取 `references/troubleshooting.md`
