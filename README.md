# openclaw-plugin-node

Node 子项目：OpenClaw 插件客户端（连接 `openclaw-bridge`）。

## 功能

- 与 `openclaw-bridge` 建立 WebSocket 长连接
- 支持请求：`watch.create` / `watch.activate` / `watch.pause` / `watch.delete` / `ping`
- 订阅推送：`watch.triggered`
- 自动重连 + 心跳
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
OPENCLAW_BRIDGE_WS_BASE=ws://127.0.0.1:8005 \
OPENCLAW_USER_ID=openclaw_user_demo \
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
  baseWsUrl: 'ws://127.0.0.1:8005',
  userId: 'u1',
  token: '',
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
  baseWsUrl: 'ws://127.0.0.1:8005',
  userId: 'u1'
});

await adapter.start();
await adapter.submitWatchDemand({
  productCode: '06608',
  productType: 'hk_stock',
  condition: 'price >= threshold',
  variables: { threshold: 8.97 },
  channels: ['openclaw'],
  channelConfigs: { openclaw: {} }
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

- 该目录建议作为独立 git 仓库管理。
- 当前仓库已通过 `.gitignore` 排除 `openclaw-plugin-node/`。
- 发布时将导出 `src/` 与 `README.md`（见 `package.json` 的 `files/exports`）。
