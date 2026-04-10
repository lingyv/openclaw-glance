# 实时行情与基金估值

## 适用范围

- 股票/指数/加密实时行情：`watch_query_ticker`
- 基金当日估值：`watch_query_fund_estimates`
- 注意：基金不支持 `watch_create` 创建盯盘策略

## 1) 股票/指数/加密实时行情：`watch_query_ticker`

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

## 2) 基金估值：`watch_query_fund_estimates`

参数（二选一）：
- `fund_codes`
- `fundCodes`

值格式：
- 单只：`"000006.OF"`
- 多只：`["000006.OF", "110011.OF"]`

成功判定：
- `success === true`
- `http_status === 200`
- `data` 为基金代码映射

失败处理：
- 读取 `error` 与 `http_status` 反馈用户

示例：

```javascript
await watch_query_fund_estimates({ fund_codes: '000006.OF' })
await watch_query_fund_estimates({ fund_codes: ['000006.OF', '110011.OF'] })
```

## 3) 硬边界

- 不要用 `watch_query_ticker` 查基金当日估值
- 不要对基金调用 `watch_create`
