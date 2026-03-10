# Daemon 模式安装与使用指南（Claude Code / Codex）

本文档只面向 **Claude Code / Codex** 使用者的 daemon 运行方式。  
如果你要走 OpenClaw 插件加载方式，请看 [openclaw-install-guide.md](./openclaw-install-guide.md)。

## 1. 前置条件

- Node.js >= 20
- 可访问 `openclaw-bridge`
- 已申请 `OPENCLAW_WS_TOKEN`
- 已安装 Claude Code 或 Codex

## 2. 必做：安装 `glance-watch` skill

在 daemon 模式中，`glance-watch` skill 是必做步骤；不安装会显著影响自然语言盯盘体验。

```bash
git clone git@github.com:lingyv/glance-watch.git
cp -r glance-watch ~/.openclaw/skills/
```

安装后重启 Claude Code / Codex 会话，确保 skill 被加载。

## 3. 必做：安装依赖并启动 daemon

在项目目录执行：

```bash
npm install
OPENCLAW_WS_TOKEN=<JWT_TOKEN> npm run start:daemon
```

可选变量：

- `OPENCLAW_BASE_WS_URL`（默认 `wss://glanceup-pre.100credit.cn`）
- `OPENCLAW_LOCK_DIR`（单活锁目录）

## 4. 必做：在 agent 流程中使用 skill + daemon

建议在系统提示词中固定规则：

1. 用户明确提出“盯盘/提醒/监控”意图时，先由 `glance-watch` skill 产出结构化参数
2. 再通过 daemon 长连接提交策略并监听触发
3. 收到触发后回流到当前对话

## 5. 运行行为说明（daemon 模式）

- daemon 常驻连接 `openclaw-bridge`
- 自动心跳与自动重连
- 同一 `baseWsUrl + token` 严格单活
- 第二个相同 token 进程会直接失败退出

## 6. 快速验收清单

1. daemon 启动日志出现 `connected`
2. skill 可正常识别盯盘意图并生成参数
3. 创建策略成功
4. 触发时回调消息可被 agent 正常消费

## 7. 常见问题

### 7.1 单活冲突

现象：第二个 daemon 启动失败并提示冲突。  
处理：关闭旧进程后重试，或改用不同 token。

### 7.2 token 失效

现象：启动失败、日志出现鉴权错误。  
处理：重新申请 token 并重启 daemon。

### 7.3 无触发回流

排查顺序：

1. 确认策略创建成功
2. 确认 daemon 仍在线（无退出）
3. 确认 agent 侧已启用 `glance-watch` skill
