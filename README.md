# openclaw-glance

智能盯盘：OpenClaw 插件连接 `openclaw-bridge`。

安装与接入文档：

- OpenClaw 插件模式：[docs/openclaw-install-guide.md](./docs/openclaw-install-guide.md)

## 插件定位

本项目当前以 OpenClaw 插件模式运行（`index.js` + `openclaw.plugin.json`），保持长连接并接收 `watch.triggered`，并对同一 `baseWsUrl + token` 启用严格单活锁，防止重复实例。

## OpenClaw 调用时机（插件模式）

- 用户新建盯盘：调用 `submitWatchDemand` 或 `createWatch`
- 用户修改状态：调用 `activate` / `pause`
- 用户删除盯盘：调用 `remove`
- 需要接收触发消息：由插件后台运行时持续接收

## 功能

- 与 `openclaw-bridge` 建立 WebSocket 长连接
- 支持请求：`watch.create` / `watch.activate` / `watch.pause` / `watch.delete` / `ping`
- 支持渠道：`openclaw` / `email` / `call`
- 订阅推送：`watch.triggered`
- 自动重连 + 心跳
- 严格单活（同 token 只允许一个活跃进程）
- 断线请求排队（可配置），重连后自动冲刷
- 提供业务适配层 `OpenClawPluginAdapter`

## 安装

```bash
npm install
```

## 测试

```bash
npm test
```

## 运行示例

```bash
OPENCLAW_WS_TOKEN=your_ws_token \
npm start
```

运行适配层示例：

```bash
npm run start:adapter
```

## SDK 使用

```js
import { OpenClawBridgeClient } from './src/index.js';

const client = new OpenClawBridgeClient({
  baseWsUrl: 'wss://glanceup-pre.100credit.cn',
  token: '<JWT_TOKEN>',
  enqueueIfDisconnected: true
});

client.on('triggered', (msg) => {
  console.log(msg);
});

await client.connect();
const res = await client.createWatch({
  product_code: '00700',
  product_type: 'hk_stock',
  operator_type: 'rule',
  operator_parameters: {
    condition: 'price < threshold',
    variables: { threshold: 420 }
  },
  channels: ['openclaw'],
  channel_configs: { openclaw: {} }
});
```

## 适配层用法

```js
import { OpenClawPluginAdapter } from './src/index.js';

const adapter = new OpenClawPluginAdapter({
  baseWsUrl: 'wss://glanceup-pre.100credit.cn',
  token: '<JWT_TOKEN>'
});

await adapter.start();
await adapter.submitWatchDemand({
  productCode: '06608',
  productType: 'hk_stock',
  condition: 'price >= threshold',
  variables: { threshold: 8.97 },
  channels: ['openclaw', 'email', 'call'], // openclaw 必传，email/call 可选
  emailConfig: {
    to_address: 'demo@example.com',
    template_id: 4
  },
  callConfig: {
    phone: '13800138000',
    customer_name: 'Demo'
  }
});
```

## 客户端事件

- `connected`
- `disconnected`
- `reconnecting`
- `warning`
- `error`
- `queued`（请求入队）
- `queueFlushed`（重连后队列发送）
- `triggered`

## 说明

- 先获取 ws `token`，然后连接 `wss://<host>:8005/openclaw/ws`，并在握手 Header 传 `Authorization: Bearer <TOKEN>`。
- 发布时将导出 `src/` 与 `README.md`（见 `package.json` 的 `files/exports`）。
