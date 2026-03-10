# OpenClaw 插件模式安装与使用指南

本文档只面向 **OpenClaw 插件模式**。

## 1. 前置条件

- Node.js >= 20
- OpenClaw 已安装并可运行
- 可访问 `openclaw-bridge`
- 已申请 `OPENCLAW_WS_TOKEN`

## 2. 必做：安装并启用插件（含 skill）

在 OpenClaw 扩展环境安装插件：

```bash
openclaw plugins install openclaw-glance-plugin
```

确认插件被发现：

```bash
openclaw plugins list
```

说明：
- `glance-watch` skill 已由插件在 `openclaw.plugin.json` 中声明
- 安装插件后 skill 会随插件一并可用，不需要额外单独安装

确保 `~/.openclaw/openclaw.json` 中显式允许插件加载：

```json
{
  "plugins": {
    "enabled": true,
    "allow": ["glance-bridge"]
  }
}
```

## 3. 必做：配置插件参数并重启 gateway

在 `~/.openclaw/openclaw.json` 中配置插件条目 `plugins.entries.glance-bridge.config`（示例）：

```json
{
  "plugins": {
    "entries": {
      "glance-bridge": {
        "enabled": true,
        "config": {
          "baseWsUrl": "wss://glanceup-pre.100credit.cn",
          "token": "<JWT_TOKEN>"
        }
      }
    }
  }
}
```

重启 gateway：

```bash
openclaw gateway restart
```

## 4. 运行行为说明（插件模式）

- 插件启动后会保持后台长连接，不再是按需短连
- 自动心跳 + 自动重连
- 同一 `baseWsUrl + token` 严格单活，重复实例会被拒绝
- `watch.triggered` 事件会通过插件运行时回流 OpenClaw 对话链路

## 5. 验证清单

1. `openclaw plugins list` 能看到 `glance-bridge`
2. `glance-watch` skill 已随插件加载（可执行自然语言盯盘请求）
3. 插件启动后无鉴权错误日志
4. 创建盯盘后，触发时可收到回流消息

## 6. 常见问题

### 6.1 token 无效

现象：日志包含 `invalid token` 或鉴权失败。  
处理：重新申请 token，更新 `plugins.entries.glance-bridge.config.token` 并重启 gateway。

### 6.2 单活冲突

现象：同 token 重复启动导致实例拒绝启动。  
处理：关闭旧实例后再启动，避免并行运行多个相同 token 的进程。

### 6.3 连接反复重连

现象：日志频繁出现 reconnect。  
处理：检查网络连通性，以及 `plugins.entries.glance-bridge.config.baseWsUrl` 与 token 是否匹配。
