---
name: glance-watch
description: 智能盯盘插件，用于监控A股、港股、比特币等金融市场行情并在条件触发时发送提醒。当用户要求盯盘、监控价格、设置提醒、查行情/新闻/交易日历、按名称查代码时自动触发，例如"帮我盯着比特币"、腾讯现在多少钱、今天A股开不开盘、有什么央行新闻等。
---

# Glance Watch 智能盯盘（主入口）

## 目标

用最小上下文完成多类任务（**工具名须与下表完全一致**，勿写成 `watch.query_ticker` 带点号）：

- **实时行情**：`watch_query_ticker`（A 股 / 港股 / 加密现货）
- **基金当日估值**：`watch_query_fund_estimates`（场外 `xxxxxx.OF`，非股票盘口）
- **辅助检索（网关库表）**：`watch_search_a_stock_basic` / `watch_search_hk_stock_basic` / `watch_search_index_basic` / `watch_search_fund_basic` / `watch_fin_news` / `watch_trade_calendar`
- **建/管策略**：`watch_create` / `watch_list` / `watch_pause` / `watch_activate` / `watch_remove`
- **立即通知**：`notify_sms` / `notify_call` / `notify_email` / `notify_dingtalk`

## 调用契约（硬约束）

### 统一动作名（注册名）

- `watch_query_ticker`
- `watch_query_fund_estimates`
- `watch_search_a_stock_basic`
- `watch_search_hk_stock_basic`
- `watch_search_index_basic`
- `watch_search_fund_basic`
- `watch_fin_news`
- `watch_trade_calendar`
- `watch_create`
- `watch_list`
- `watch_pause`
- `watch_activate`
- `watch_remove`
- `notify_sms`
- `notify_call`
- `notify_email`
- `notify_dingtalk`

### Agent 选型（先选工具再填参）

| 用户说法 | 第一步工具 | 下一步 |
|----------|------------|--------|
| 现价/涨跌/几块钱（**已有代码**） | `watch_query_ticker` | `market`+`symbol`；`market` 可用 **A股/港股/加密** 等中文别名 |
| 现价但**只有公司或指数名** | 对应 `watch_search_*_basic` | 从 `data[]` 取 `ts_code` 再 `watch_query_ticker` |
| 基金**今天估值** | `watch_query_fund_estimates` | `fund_codes`；勿用 `watch_query_ticker` |
| 基金**档案/是不是这只基** | `watch_search_fund_basic` | `ts_code` 或 `keyword` |
| **新闻/快讯** | `watch_fin_news` | 必须有关键词 `keyword` 或 `q` |
| **开不开盘/休市/交易日** | `watch_trade_calendar` | `exchange`（如 SSE/SZSE）+ `start_date`+`end_date`（单日则相同） |

### 调用顺序（与上表一致）

1. **查实时价（代码已知）** → `watch_query_ticker`
2. **仅名称/模糊** → 先 `watch_search_*_basic`，再 `watch_query_ticker`
3. **基金估值** → `watch_query_fund_estimates`
4. **盯盘/提醒** → 参数齐全后 `watch_create`
5. **策略管理** → `watch_list` / `watch_pause` / `watch_activate` / `watch_remove`
6. **立即通知** → `notify_*`

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
- 通过 `watch_list` 传 `user_id/use_id` 越权查询
- 用 `watch_query_ticker` 查**场外基金估值**（应使用 `watch_query_fund_estimates`）

## 渐进式披露（按需读取）

仅在命中场景时读取对应文档，不要一次性加载全部 references。

- `watch_create` / `watch_list` / … 细节：`references/watch-contract.md`
- **工具选型、行情、辅助表、成功判定**：`references/query-and-symbol.md`
- 渠道参数、`notify.*`：`references/channels.md`
- 示例 payload：`references/examples.md`
- 重试与排错：`references/troubleshooting.md`
- 市场与代码：`references/markets.md`

## 决策表（强约束）

| 用户主意图 | 必读文档（最小集合） |
|---|---|
| 查行情 / 名称→代码 | `references/query-and-symbol.md` |
| 基金估值 / 基金档案 | `references/query-and-symbol.md` |
| 新闻 / 交易日历 | `references/query-and-symbol.md` |
| 创建盯盘（代码与市场已明确） | `references/watch-contract.md` |
| 创建盯盘（名称或市场不明确） | `references/watch-contract.md` + `references/query-and-symbol.md` |
| 创建盯盘 + 指定通知渠道 | `references/watch-contract.md` + `references/channels.md` |
| 管理策略 | `references/watch-contract.md` |
| 立即发通知 | `references/channels.md` |
| 失败排查 | `references/troubleshooting.md` |
| 市场或代码速查 | `references/markets.md` |

执行规则：
1. 一次请求默认只读 1–2 个 references 文件。
2. 仅当当前文档无法回答时，再追加读取下一个文档。
3. 读取顺序遵循上表，不按「完整性」一次加载所有文档。

## 小模型执行模板（7B）

1. 先按固定字段骨架生成 payload，不自创字段名。
2. 只替换值：`product_code/product_type/operator_parameters/channels/channel_configs`。
3. 调用前逐条自检「绝对禁止项」。
4. 若报 `400` 且提示「未注册的算子类型」，把 `operator_type` 纠正为 `rule` 后重试。

## 快速分流

- 用户说「帮我盯 BTC 跌 2% 提醒」 -> `references/watch-contract.md` + `references/channels.md`
- 用户说「腾讯现在多少钱」 -> `references/query-and-symbol.md`（名称→港股 search→ticker）
- 用户说「这只基金今天估值多少」 -> `references/query-and-symbol.md`（`watch_query_fund_estimates`）
- 用户说「今天 A 股开不开盘」 -> `references/query-and-symbol.md`（`watch_trade_calendar`，SSE/SZSE）
- 用户说「发短信给我」 -> `references/channels.md`
- 用户说「为什么没发出来」 -> `references/troubleshooting.md`
