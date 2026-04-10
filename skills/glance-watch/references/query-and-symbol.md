# 标的检索与行情查询

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

## 行情查询流程（`watch.query_ticker`）

说明：
- 对外统一动作名是 `watch.query_ticker`。
- 文档中的 `runtime.queryTickerData(...)` 仅用于说明宿主运行时内部调用形态。
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
await runtime.queryTickerData({
  market: 'hk',
  symbol: '00700',
  segment: 'stock'
})
```

成功判定：`success === true` 且 `http_status === 200`。

失败处理：读 `error` 与 `http_status` 反馈用户，不静默重试。
