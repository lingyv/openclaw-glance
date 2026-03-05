---
name: glance-watch
description: 智能盯盘插件，用于监控A股、港股、比特币等金融市场行情并在条件触发时发送提醒。当用户要求盯盘、监控价格、设置提醒时自动触发，例如"帮我盯着比特币"、监控某只股票、涨跌幅提醒等。
---

# Glance Watch 智能盯盘

## 快速开始

1. **环境变量**（已在系统配置）:
   - `OPENCLAW_BRIDGE_WS_BASE=wss://glanceup-pre.100credit.cn`
   - `OPENCLAW_WS_TOKEN` 已配置

2. **用户请求盯盘时**，解析用户需求提取：
   - `productCode`: 产品代码
   - `productType`: 市场类型 (stock/index/hk_stock/crypto)
   - `condition`: 条件表达式
   - `variables`: 变量值

3. **创建监控脚本**并运行

## 支持的市场

| 市场 | productType | 示例 | 说明 |
|------|-------------|------|------|
| A股个股 | stock | 000001 | 每3秒行情 |
| A股指数 | index | 000300 | 每3秒行情 |
| 港股 | hk_stock | 00700 | 延迟15分钟 |
| 加密货币 | crypto | BTCUSDT | 每10秒行情 |

详细产品代码见 [references/markets.md](references/markets.md)

## 使用示例

### 比特币监控
```javascript
// 条件: 价格 >= 73000 且涨幅 >= 1%
condition: 'price >= threshold and change_percent >= cp_threshold'
variables: { threshold: 73000, cp_threshold: 0.01, product_name: 'Bitcoin' }
```

### A股监控
```javascript
// 条件: 价格 >= 12.5 且换手率 >= 1%
condition: 'price >= threshold and turnover_rate >= tr_threshold'
variables: { threshold: 12.5, tr_threshold: 0.01, product_name: '平安银行' }
```

### 港股监控
```javascript
// 条件: 价格 >= 420
condition: 'price >= threshold'
variables: { threshold: 420, product_name: '腾讯控股' }
```

## 触发后操作

当监控触发时:
1. 解析 `market_data` 获取价格、涨跌幅等信息
2. 发送提醒到用户当前对话的渠道（群聊/私聊）
3. 根据触发消息构建友好的提醒文案

## 相关资源

- 脚本: [scripts/watch-monitor.js](scripts/watch-monitor.js)
- 市场参考: [references/markets.md](references/markets.md)