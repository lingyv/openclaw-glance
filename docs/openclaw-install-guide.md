# OpenClaw 插件安装与使用引导

本文档面向 OpenClaw 开发者，说明如何安装并接入 `openclaw-plugin-node`。

## 1. 前置条件

- Node.js >= 20
- 已部署并可访问 `openclaw-bridge`（默认端口 `8005`）
- OpenClaw 侧可以发起 HTTP 请求到 bridge（用于申请 token）

## 2. 安装插件

### 方式A：本地目录开发接入

```bash
# 在 openclaw 项目中
npm install /path/to/openclaw-plugin-node
```

### 方式B：git 仓库接入

```bash
# 示例：替换为实际仓库地址与分支/标签
npm install git+ssh://<git-host>/<group>/openclaw-plugin-node.git#main
```

安装后在代码中引入：

```js
import { OpenClawPluginAdapter } from 'openclaw-bridge-plugin';
```

## 3. 申请 WebSocket token

先调用 bridge 接口获取 token（`user_id` 由后端自动生成）：

```http
POST http://<bridge-host>:8005/openclaw/token
```

返回示例：

```json
{
  "user_id": "openclaw_a1b2c3d4e5f6",
  "token": "<JWT_TOKEN>",
  "expire_at": "2026-04-04T12:00:00+08:00",
  "expire_seconds": 2592000,
  "token_type": "Bearer"
}
```

## 4. 在 OpenClaw 中初始化插件

```js
import { OpenClawPluginAdapter } from 'openclaw-bridge-plugin';

const bridgeBase = process.env.OPENCLAW_BRIDGE_WS_BASE || 'ws://127.0.0.1:8005';
const token = '<JWT_TOKEN>'; // 来自 /openclaw/token

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
- 收不到触发消息：确认通知链路是 `notification -> openclaw-bridge /internal/notify`，且用户在线。
- 断线后请求未发送：将 `enqueueIfDisconnected` 设为 `true`，并检查重连日志。
