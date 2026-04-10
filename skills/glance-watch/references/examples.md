# 示例模板（按任务类型）

## 1) 盯盘策略（watch_*)

### 1.1 创建比特币盯盘（跌破阈值）

```javascript
await watch_create({
  product_code: 'BTCUSDT',
  product_type: 'crypto',
  operator_type: 'rule',
  operator_parameters: {
    condition: 'price <= threshold and change_percent <= cp_threshold',
    variables: { threshold: 68000, cp_threshold: -0.02, product_name: '比特币' }
  },
  channels: ['openclaw'],
  channel_configs: {
    openclaw: {
      channel: 'dingtalk',
      account_id: 'default',
      session_key: 'agent:main:dingtalk:group:cid_demo',
      conversation_id: 'cid_demo'
    }
  }
})
```

### 1.2 创建A股盯盘 + 短信通知（含联系人 CSV 补值）

```javascript
// Step 0: 先查联系人 CSV（若本轮未给手机号）
// ~/.openclaw/workspace/memory/watch-notify-contacts.csv

await watch_create({
  product_code: '600000.SH',
  product_type: 'stock',
  operator_type: 'rule',
  operator_parameters: {
    condition: 'price >= threshold and turnover_rate >= tr_threshold',
    variables: { threshold: 12.5, tr_threshold: 0.01, product_name: '浦发银行' }
  },
  channels: ['openclaw', 'sms'],
  channel_configs: {
    openclaw: {
      channel: 'dingtalk',
      account_id: 'default',
      session_key: 'agent:main:dingtalk:group:cid_demo',
      conversation_id: 'cid_demo'
    },
    sms: {
      receiver: '13800138000',
      template_id: 90010,
      content: '浦发银行触发盯盘条件，当前价 ${price}'
    }
  }
})

// Step 1: 若本轮用了新联系方式且创建成功，回写联系人 CSV
```

### 1.3 管理策略

```javascript
await watch_list({ status: 'active' })
await watch_pause({ strategy_id: 's_123' })
await watch_activate({ strategy_id: 's_123' })
await watch_remove({ strategy_id: 's_123' })
```

## 2) 直连通知（notify_*)

### 2.1 发送短信（含联系人 CSV 补值）

```javascript
// Step 0: 先查联系人 CSV，补 receiver/template_id
await notify_sms({
  receiver: '13800138000',
  template_id: 90010,
  content: '测试短信：比特币跌幅超过2%'
})

// Step 1: 若本轮有新联系方式且发送成功，回写 CSV
```

### 2.2 发送电话/邮件/钉钉

```javascript
await notify_call({
  phone: '13800138000',
  customer_name: '张三',
  condition: '比特币跌幅超过2%'
})

await notify_email({
  to_address: 'demo@example.com',
  template_id: 4,
  title: '盯盘提醒',
  content: 'BTCUSDT 触发阈值'
})

await notify_dingtalk({
  cas_id: 'user.dingtalk',
  template_id: 3,
  msg_type: 'text',
  content: '盯盘触发：BTCUSDT'
})
```

## 3) 实时行情查询

### 3.1 股票/指数/加密实时行情

```javascript
await watch_query_ticker({ market: 'a', symbol: '600000.SH', segment: 'stock' })
await watch_query_ticker({ market: 'hk', symbol: '00700', segment: 'stock' })
await watch_query_ticker({ market: 'crypto', symbol: 'BTCUSDT' })
```

### 3.2 基金当日估值（基金不支持创建盯盘）

```javascript
await watch_query_fund_estimates({ fund_codes: '000006.OF' })
await watch_query_fund_estimates({ fund_codes: ['000006.OF', '110011.OF'] })
```

## 4) 标的检索与是否交易日查询

### 4.1 名称 -> 代码

```javascript
await watch_search_a_stock_basic({ keyword: '平安银行', limit: 5 })
await watch_search_hk_stock_basic({ q: '腾讯', limit: 5 })
await watch_search_index_basic({ keyword: '沪深300', limit: 5 })
await watch_search_fund_basic({ keyword: '西部利得量化成长', limit: 5 })
```

### 4.2 是否交易日

```javascript
await watch_trade_calendar({
  exchange: 'SSE',
  start_date: '2026-04-10',
  end_date: '2026-04-10'
})
```

## 5) 快讯

```javascript
await watch_fin_news({ keyword: '央行', limit: 10 })
await watch_fin_news({
  q: '比特币',
  pub_time_start: '2026-04-10 00:00:00',
  pub_time_end: '2026-04-10 23:59:59',
  limit: 20
})
```

## 常见边界提示

- 基金（`xxxxxx.OF`）不能用 `watch_create`，只能用 `watch_query_fund_estimates` / `watch_search_fund_basic`。
- 使用 `call/sms/email/dingtalk` 时，`watch_create` 与 `notify_*` 都要先查联系人 CSV。
- `operator_type` 固定 `rule`，不要用其他值。
