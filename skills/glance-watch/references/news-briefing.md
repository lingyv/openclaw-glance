# 快讯查询

## 工具

- `watch_fin_news`

## 何时使用

- 用户询问“有什么快讯/新闻/资讯”
- 用户给了主题词（如：央行、降息、AI、特斯拉）

## 参数

必填：
- `keyword` 或 `q`（二选一）

可选：
- `limit`
- `pub_time_start`
- `pub_time_end`

## 成功判定

- `success === true`
- `finance.table.result` 的 `data[]` 含快讯行

## 示例

```javascript
await watch_fin_news({ keyword: '央行', limit: 10 })
await watch_fin_news({
  q: '比特币',
  pub_time_start: '2026-04-10 00:00:00',
  pub_time_end: '2026-04-10 23:59:59'
})
```

## 失败处理

- 没有关键词时先追问，不要空查
- 返回失败时，直接反馈 `error` 与 `http_status`
