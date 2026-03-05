# OpenClaw 插件安装与使用引导

本文档面向 OpenClaw 开发者，说明如何安装并接入 `openclaw-plugin-node`。

## 1. 前置条件

- Node.js >= 20
- 已部署并可访问 `openclaw-bridge`

## 2. 安装插件

### 方式A：本地目录开发接入

```bash
# 在 openclaw 项目中
npm install /path/to/openclaw-plugin-node
```

### 方式B：git 仓库接入

```bash
# 示例：替换为实际仓库地址与分支/标签
npm install git+ssh://git@github.com:lingyv/openclaw-glance.git#main
```

安装后在代码中引入：

```js
import { OpenClawPluginAdapter } from 'openclaw-bridge-plugin';
```

## 3. 申请 WebSocket token

向智能盯盘项目组申请 token

## 4. 在 OpenClaw 中初始化插件

```js
import { OpenClawPluginAdapter } from 'openclaw-bridge-plugin';

const bridgeBase = process.env.OPENCLAW_BRIDGE_WS_BASE || 'ws://glanceup-pre.100credit.cn';
const token = '<JWT_TOKEN>'; // 上面申请的token

const adapter = new OpenClawPluginAdapter({
  baseWsUrl: bridgeBase,
  token,
  enqueueIfDisconnected: true
});

await adapter.start();
```

## 5. 提交盯盘需求

```js
const result = await adapter.submitWatchDemand({
  productCode: '00700',
  productType: 'hk_stock',
  condition: 'price >= threshold',
  variables: { threshold: 420 },
  channels: ['openclaw'],
  channelConfigs: { openclaw: {} }
});

console.log('watch.create.result', result);
```

## 6. 接收触发通知

```js
adapter.onTriggered((event) => {
  console.log('watch.triggered', event);
  // 在这里回调 OpenClaw 业务逻辑
});
```

## 7. 策略控制

```js
await adapter.pause('<strategy_id>');
await adapter.activate('<strategy_id>');
await adapter.remove('<strategy_id>');
```

## 8. 断开连接

```js
await adapter.stop();
```

## 9. 常见问题

- 连接失败 `invalid token`：token 过期或签名密钥不一致，重新申请 token。
- 断线后请求未发送：将 `enqueueIfDisconnected` 设为 `true`，并检查重连日志。
