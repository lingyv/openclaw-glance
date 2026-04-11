---
name: glance-watch
description: 用于监控A股、港股、比特币等金融市场行情并在条件触发时发送提醒。当用户要求盯盘、监控价格、设置提醒、需要通过邮件/电话/短信/钉钉发起通知、查询A股港股指数加密标的和行情、交易日历、新闻快讯时使用，例如"帮我盯着比特币"、监控某只股票、涨跌幅提醒、短信通知我、这个月交易日有哪些、有哪些新闻等。
---

# Glance Watch 智能盯盘（主入口）

## 能力优先级（必须遵循）

P0（最高）策略能力：
- 面向 **A股个股、港股个股、A股/港股指数、比特币** 创建/查询/暂停/恢复/删除盯盘策略。
- 仅用：`watch_create` / `watch_list` / `watch_pause` / `watch_activate` / `watch_remove`。

P1 行情能力（为策略创建提供上下文）：
- 个股/指数/比特币实时行情：`watch_query_ticker`

P2 标的解析能力（创建策略前补齐参数）：
- 先查本地 CSV（`skills/glance-watch/data/*.csv`）做名称/代码映射。
- 本地不确定再用网关基础信息检索：
  `watch_search_a_stock_basic` / `watch_search_hk_stock_basic` / `watch_search_index_basic`

P3 辅助能力：
- 交易日历：`watch_trade_calendar`
- 财经快讯：`watch_fin_news`
- 立即发送通知：`notify_sms` / `notify_call` / `notify_email` / `notify_dingtalk`

## 工具清单（工具名必须完全一致）

- 工具名统一使用下划线形式（如 `watch_query_ticker`），不要写成点号形式（如 `watch.query_ticker`）。

- `watch_query_ticker`
- `watch_search_a_stock_basic`
- `watch_search_hk_stock_basic`
- `watch_search_index_basic`
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

## 调用契约（硬约束）

### Agent 选型（先选工具再填参）

| 用户说法 | 第一步工具 | 下一步 |
|----------|------------|--------|
| 现价/涨跌/几块钱（**已有代码**） | `watch_query_ticker` | `market`+`symbol`；`market` 可用 **A股/港股/加密** 等中文别名 |
| 现价但**只有公司或指数名** | 查询`skills/glance-watch/data/*.csv`或 `watch_search_*_basic` | 从 `data[]` 取 `ts_code` 再 `watch_query_ticker` |
| **新闻/快讯** | `watch_fin_news` | 必须有关键词 `keyword` 或 `q` |
| **开不开盘/休市/交易日** | `watch_trade_calendar` | `exchange`（如 SSE/SZSE）+ `start_date`+`end_date`（单日则相同） |

### 调用顺序（与上表一致）

1. **盯盘策略任务**优先：`watch_create/watch_list/watch_pause/watch_activate/watch_remove`
2. 创建策略若缺代码或市场：先本地 CSV，再 `watch_search_*_basic`
3. 代码已明确再查实时价：`watch_query_ticker`
4. 再处理辅助任务：`watch_trade_calendar` / `watch_fin_news` / `notify_*`

### 创建策略最小必填

- `product_code`
- `product_type`（`stock/index/hk_stock/crypto`）
- `operator_type`（固定 `rule`）
- `operator_parameters.condition`
- `operator_parameters.variables`

缺任一项先追问，不猜测阈值。

### 渠道选择规则（`watch_create`）

- `channels` 至少包含 1 个渠道。
- 若用户明确表达“仅/只用某几个渠道”，严格按用户指定，不强制补 `openclaw`。
- 若用户表达“用某个渠道（如 call）”但未明确“仅限”，默认在用户指定渠道基础上补 `openclaw`。
- 未经用户要求，不额外附加除 `openclaw` 外的其他渠道。

#### “仅限渠道”判定词（小模型必用）

- 判定为“仅限”的典型说法：
  - `只用X` / `仅用X` / `只能用X` / `不要其他渠道`
  - `除了X都不要` / `就X就行` / `别发到openclaw`
- 判定为“非仅限”的典型说法：
  - `用X` / `加上X` / `再加X` / `X也发一下`
  - `帮我走X渠道`（未出现“只/仅/不要其他”）
- 歧义处理：
  - 若用户表达不清，先追问一句：`是否仅使用这些渠道，不包含 openclaw？`
  - 未得到“仅限”确认前，按“非仅限”处理（可补 `openclaw`）。

### 绝对禁止项

- `operator_type` 不是 `rule`
- 把 `condition` 放到顶层（必须在 `operator_parameters.condition`）
- 把 `channel_configs.*` 传成 JSON 字符串（必须是对象）
- 用户明确“仅/只用某几个渠道”时，仍强行附加其他渠道
- 通过 `watch_list` 传 `user_id/use_id` 越权查询
- 对基金调用 `watch_create`

### 联系人 CSV（强约束，适用于 `watch_create` 与 `notify_*`）

- 联系人真源：`~/.openclaw/workspace/memory/watch-notify-contacts.csv`
- 只要请求涉及 `call/sms/email/dingtalk`，调用前必须先查 CSV。
- 取值优先级固定：
  1. 本轮用户明确提供
  2. CSV 历史值补全
  3. 仍缺必填字段 -> 追问
- 当本轮用户提供了新联系方式，且 `watch_create` 或 `notify_*` 调用成功，必须回写 CSV。
- 禁止依赖其他联系人文件（如 json）代替该 CSV。

## 渐进式披露（按需读取）

仅在命中场景时读取对应文档，不要一次性加载全部 references。

- 盯盘策略（创建/管理）：`references/watch-contract.md`
- 直连通知（短信/电话/邮件/钉钉）：`references/channels.md`
- 实时行情（股/指/加密）：`references/quote-realtime.md`
- 标的检索 + 是否交易日：`references/symbol-search-and-calendar.md`
- 快讯：`references/news-briefing.md`
- 示例 payload：`references/examples.md`
- 重试与排错：`references/troubleshooting.md`

## 决策表（强约束）

| 用户主意图 | 必读文档（最小集合） |
|---|---|
| 创建/管理盯盘策略 | `references/watch-contract.md` |
| 查行情（股/指/加密） | `references/quote-realtime.md` |
| 名称→代码 / 交易日判断 | `references/symbol-search-and-calendar.md` |
| 快讯 | `references/news-briefing.md` |
| 立即发通知 | `references/channels.md` |
| 失败排查 | `references/troubleshooting.md` |

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
- 用户说「腾讯现在多少钱」 -> `references/quote-realtime.md`（如缺代码再读 `references/symbol-search-and-calendar.md`）
- 用户说「这只基金今天估值多少」 -> 明确告知“当前 OpenClaw 暂不提供基金能力”
- 用户说「今天 A 股开不开盘」 -> `references/symbol-search-and-calendar.md`（`watch_trade_calendar`，SSE/SZSE）
- 用户说「发短信给我」 -> `references/channels.md`
- 用户说「有什么央行快讯」 -> `references/news-briefing.md`
- 用户说「为什么没发出来」 -> `references/troubleshooting.md`
