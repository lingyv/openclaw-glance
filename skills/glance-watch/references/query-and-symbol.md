# 标的检索与行情查询

## OpenClaw Agent：工具路由（必读）

插件注册的**真实工具名**为下划线形式（如 `watch_query_ticker`），与宿主内部 `runtime.*` 方法名不同。

| 意图 | 工具 | 成功时如何读结果 |
|------|------|------------------|
| 实时价/涨跌幅（已有代码） | `watch_query_ticker` | `ticker.query.result`：`success===true`，价格等在 `quote`（**英文键**） |
| 只有中文名/模糊名 | 先 `watch_search_a_stock_basic` 等 | `finance.table.result`：候选在 `data[]`，取 `ts_code` 再 ticker |
| 场外基金**估值** | `watch_query_fund_estimates` | `fund.estimates.result`：`data` 按基金代码映射 |
| 基金**档案** | `watch_search_fund_basic` | `finance.table.result`：`data[]` |
| 快讯 | `watch_fin_news` | `finance.table.result`：须带 `keyword` 或 `q` |
| 是否开市 | `watch_trade_calendar` | `finance.table.result`：`exchange` + 日期区间；**A 股**常用 `SSE`/`SZSE` |

**插件侧便利行为（减少误调用）**：

- `watch_query_ticker`：`market` 支持 **A股、港股、加密** 等中文别名，会映射为 `a`/`hk`/`crypto`。
- 各 `watch_search_*` / `watch_fin_news`：`keyword` 与 `q` 等价，至少填一个；插件会统一成网关的 `keyword`。
- `watch_trade_calendar`：支持 `startDate`/`endDate`，会合并为 `start_date`/`end_date`。

## 标的检索规则（必须遵循）

当不能直接确定 `product_code` / `product_type` 时，先查本地 CSV，再让用户确认。

数据文件（字段：`类型,代码,名称,完整代码,市场`）：
- `data/stock_a.csv` -> A 股个股（`productType=stock`）
- `data/stock_hk.csv` -> 港股个股（`productType=hk_stock`）
- `data/index_a.csv` -> A 股指数（`productType=index`）
- `data/index_hk.csv` -> 港股指数（`productType=index`）

## 场景 1：用户只说名称

- 在 CSV 里按名称模糊搜索。
- 命中多条时，必须给出候选（代码 + 名称 + 市场）让用户确认。
- 不可自行猜测后直接创建策略。

## 场景 2：用户不知道代码或市场

- 用 `rg` 在 4 个 CSV 搜索名称或代码。
- 映射规则：
- A 股个股 -> `stock`
- 港股个股 -> `hk_stock`
- A 股指数 -> `index`
- 港股指数 -> `index`
- 结果不唯一时先追问。

## 推荐检索命令

```bash
# 按名称模糊查找
rg -n "平安银行|腾讯|沪深300|BTC" data/stock_a.csv data/stock_hk.csv data/index_a.csv
rg -n "恒生科技指数|恒生指数|HSTECH|HSI" data/index_hk.csv

# 按代码查找
rg -n "000001|00700|399001" data/stock_a.csv data/stock_hk.csv data/index_a.csv
rg -n "HSTECH|HSI|VHSI" data/index_hk.csv

# 无 rg 时兜底
grep -nE "平安银行|腾讯|沪深300|000001|00700|恒生科技指数|HSTECH" \
  data/stock_a.csv data/stock_hk.csv data/index_a.csv data/index_hk.csv
```

## 辅助检索（名称 → 代码、新闻、是否开市）

以下工具经 **openclaw-bridge** 白名单透传 **financial-data-gateway** 只读 `GET`，返回均为 `finance.table.result`，成功时 `success === true` 且 `data` 为行数组（字段以网关为准）。

| 工具 | 网关路径 | 典型用途 |
|------|-----------|----------|
| `watch_search_a_stock_basic` | `GET /v1/a-stock/basic/search` | A 股：`keyword` 或 `q`，可选 `limit` |
| `watch_search_hk_stock_basic` | `GET /v1/hk-stock/basic/search` | 港股：同上 |
| `watch_search_index_basic` | `GET /v1/index/basic/search` | 指数：同上 |
| `watch_search_fund_basic` | `GET /v1/fund/basic` | 基金档案：`ts_code` 或 `keyword`/`q` |
| `watch_fin_news` | `GET /v1/news` | 快讯：`keyword`/`q`；可选 `limit`、`pub_time_start`、`pub_time_end` |
| `watch_trade_calendar` | `GET /v1/trade-calendar` | 是否开市：`exchange`、`start_date`、`end_date`（可用 `startDate`/`endDate`） |

流程建议：用户只说公司/基金**名称**时，先用对应 **search** 工具解析出 `ts_code` / 完整代码，再调用 `watch_query_ticker`（股/指/加密）或 `watch_query_fund_estimates`（场外基金估值）。问「今天 A 股开不开盘」用 `watch_trade_calendar`（如 `exchange=SSE` 与日期区间；深市用 `SZSE`）。

## 行情查询流程（`watch_query_ticker`）

说明：
- OpenClaw 工具名：**`watch_query_ticker`**。
- 文档中的 `runtime.queryTickerData(...)` 仅表示 SDK/宿主内部调用形态。
- **查询参数名与 financial-data-gateway `GET /v1/market/quote` 一致**（详见该仓库 `docs/实时行情接口.md`）。

### 调用参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `market` | 是 | `a` / `hk` / `crypto`（也可用网关支持的别名，如 `A股`、`港股`、`加密货币`） |
| `symbol` | 是 | 标的代码，写法随 `market` 而定（如 A 股 `600000.SH` 或 `600000`，港股 `00700`，加密 `BTCUSDT`） |
| `segment` | 否 | 仅 A 股、港股有效：`auto` / `stock` / `index`；省略等同 `auto`；加密货币不传 |

### 从 CSV 结果到行情参数（示例）

| CSV 类型 | `market` | `symbol` 示例 | `segment` 建议 |
|----------|----------|---------------|----------------|
| A 股个股 | `a` | CSV「完整代码」如 `600000.SH`，或 6 位+网关规则 | `stock` 或省略 |
| A 股指数 | `a` | `000001.SH`、`399001.SZ` 等 | `index` 或省略 |
| 港股个股 | `hk` | `00700`、`00700.HK` | `stock` 或省略 |
| 港股指数 | `hk` | `HSI`、`HSTECH` 或中文指数名（依赖网关库表） | `index` 或省略 |
| 加密货币 | `crypto` | `BTCUSDT` | 不传 |

### 返回内容（`ticker.query.result`）

成功时 `success === true`，并包含与网关一致的核心字段：

- `http_status`：HTTP 状态（成功为 `200`）
- `market`、`symbol`、`segment`、`venue`、`source`
- `quote`：统一**英文键**行情对象（如 `last`、`pct_change`、`name`、`trade_time` 等，以网关为准）

失败时 `success === false`，含 `http_status` 与 `error`（网关错误文案）。

示例：

```javascript
// 工具调用侧等价字段示例
{ "market": "港股", "symbol": "00700", "segment": "stock" }
// 或 runtime：await runtime.queryTickerData({ market: 'hk', symbol: '00700', segment: 'stock' })
```

成功判定：`success === true` 且 `http_status === 200`。

失败处理：读 `error` 与 `http_status` 反馈用户，不静默重试。

## 基金实时估值（`watch_query_fund_estimates`）

场外开放式基金**不能**用 `watch.query_ticker`。查**当日估算净值、估值涨跌幅**等应使用 **`watch_query_fund_estimates`**。

### 调用参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `fund_codes` | 是* | 单只：`"000006.OF"`；多只：`["000006.OF","110011.OF"]`。也可用 camelCase：`fundCodes` |

\* 工具 schema 中 `fund_codes` / `fundCodes` 二选一传入即可；宿主若只支持一种键名，统一用 `fund_codes`。

代码一般为 **6 位 + `.OF`**（具体以基金代码为准）。接口可能较慢（服务端可达约数十秒），调用方需容忍较长等待。

### 返回内容（`fund.estimates.result`）

- `success`、`http_status`、`error`（失败时）
- `data`：按基金代码映射的估值结构（字段以网关为准，如估算净值、涨跌幅等）

成功判定：`success === true` 且通常 `http_status === 200`（具体以 bridge 返回为准）。

```javascript
// 示例：单只
await runtime.queryFundEstimates({ fund_codes: '000006.OF' })
// 或多只
await runtime.queryFundEstimates({ fund_codes: ['000006.OF', '110011.OF'] })
```
