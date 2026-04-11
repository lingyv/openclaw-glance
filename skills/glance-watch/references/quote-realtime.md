# 实时行情

## 适用范围

- 股票/指数/加密实时行情：`watch_query_ticker`

## 股票/指数/加密实时行情：`watch_query_ticker`

必填参数：
- `market`：`a` / `hk` / `crypto`（支持中文别名）
- `symbol`

可选参数：
- `segment`：`auto` / `stock` / `index`

成功判定：
- `success === true`
- `http_status === 200`
- 行情在 `quote`（英文键，如 `last`、`name`、`pct_change`）

失败处理：
- 读取 `error` 与 `http_status` 直接反馈，不静默重试

示例：

```javascript
await watch_query_ticker({ market: 'hk', symbol: '00700', segment: 'stock' })
await watch_query_ticker({ market: 'A股', symbol: '600000.SH' })
await watch_query_ticker({ market: 'crypto', symbol: 'BTCUSDT' })
```
