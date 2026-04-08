# 典型示例

## 比特币监控

```javascript
operator_type: 'rule'
operator_parameters: {
  condition: 'price >= threshold and change_percent >= cp_threshold',
  variables: { threshold: 73000, cp_threshold: 0.01, product_name: 'Bitcoin' }
}
```

说明：`crypto` 不支持 `turnover_rate`。

## A 股监控

```javascript
operator_type: 'rule'
operator_parameters: {
  condition: 'price >= threshold and turnover_rate >= tr_threshold',
  variables: { threshold: 12.5, tr_threshold: 0.01, product_name: '平安银行' }
}
```

## 港股监控

```javascript
operator_type: 'rule'
operator_parameters: {
  condition: 'price >= threshold',
  variables: { threshold: 420, product_name: '腾讯控股' }
}
```

## 查询行情

```javascript
await runtime.queryTickerData({
  stockCode: '00700',
  market: 'HK',
  productType: 'hk_stock'
})
```
