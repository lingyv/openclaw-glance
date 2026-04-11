# 标的检索与交易日查询

## 适用范围

- 名称/模糊输入 -> 本地 CSV 匹配或代码：`watch_search_*_basic`
- 是否开市/交易日：`watch_trade_calendar`

## 1) 标的检索顺序（必须遵循）

1. 先查本地 CSV（`skills/glance-watch/data/*.csv`）
2. 本地未命中，再调用 `watch_search_*_basic`
3. 多候选时必须让用户确认后再创建策略

CSV 映射：
- `stock_a.csv` -> `product_type=stock`
- `stock_hk.csv` -> `product_type=hk_stock`
- `index_a.csv` -> `product_type=index`
- `index_hk.csv` -> `product_type=index`

### 本地 CSV 匹配算法（执行约束）

- 可使用 `rg`/`grep` 检索，不要求固定命令模板。
- 匹配优先级：
  1. `完整代码` 精确匹配（如 `600000.SH`、`00700.HK`）
  2. `代码` 精确匹配（如 `600000`、`00700`）
  3. `名称` 精确匹配
  4. `名称` 模糊匹配
- 命中后优先使用 `完整代码` + `市场` 来确定后续 `market/symbol`，避免仅用短代码。
- 若出现重名/重码或返回多条候选：必须先向用户确认具体标的，再执行 `watch_query_ticker` 或 `watch_create`。

## 2) 网关基础信息检索工具

- `watch_search_a_stock_basic`（A股）
- `watch_search_hk_stock_basic`（港股）
- `watch_search_index_basic`（指数）

统一规则：
- 名称检索至少给 `keyword` 或 `q`
- 成功返回 `finance.table.result`，结果在 `data[]`

示例：

```javascript
await watch_search_a_stock_basic({ keyword: '平安银行', limit: 5 })
await watch_search_hk_stock_basic({ q: '腾讯' })
await watch_search_index_basic({ keyword: '沪深300' })
```

## 3) 交易日查询：`watch_trade_calendar`

参数：
- `exchange`（A股常用 `SSE` 或 `SZSE`）
- `start_date`
- `end_date`

可兼容：
- `startDate` / `endDate`（会归一化）

成功判定：
- `success === true`
- `data[]` 可读 `is_open` 等字段

示例：

```javascript
await watch_trade_calendar({
  exchange: 'SSE',
  start_date: '2026-04-10',
  end_date: '2026-04-10'
})
```
