# 标的检索与行情查询

## 标的检索规则（必须遵循）

当不能直接确定 `product_code` / `product_type` 时，先查本地 CSV，再让用户确认。

数据文件（字段：`类型,代码,名称,完整代码,市场`）：
- `data/stock_a.csv` -> A 股个股（`productType=stock`）
- `data/stock_hk.csv` -> 港股个股（`productType=hk_stock`）
- `data/index_a.csv` -> A 股指数（`productType=index`）
- `data/index_hk.csv` -> 港股指数（`productType=index`，查询常配 `market=HK`）

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
- 港股指数 -> `index`（`market=HK`）
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

1. 先确定标的代码、市场、`productType`。
2. 调用查询动作。
3. 成功后反馈价格/涨跌幅，失败则返回错误并让用户确认代码或市场。

示例：

```javascript
await runtime.queryTickerData({
  stockCode: '00700',
  market: 'HK',
  productType: 'hk_stock'
})
```

成功判定：
- `code = "000000"` 或 `success = true`

失败处理：
- 直接返回失败原因，不静默重试
