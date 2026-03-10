# PR: 插件化长连接重构（双入口同核心 + 严格单活）

## 背景

现有实现偏 SDK/按需调用模型，连接可能在未触发期间断开，无法稳定接收 `watch.triggered`。  
本 PR 将工程重构为 OpenClaw 插件形态，并同时支持 daemon 常驻模式。

## 目标

- 插件模式与 daemon 模式都可后台常驻长连接
- 两种模式都能分发 `watch.triggered`
- 同一 `baseWsUrl + token` 严格单活（重复实例拒绝启动）

## 主要变更

### 1) 双入口同核心

- 新增插件入口：`index.js` + `openclaw.plugin.json`
- 新增 daemon 入口：`bin/openclaw-bridge-daemon.js`
- 两者统一复用 `BridgeRuntime`

### 2) 共享运行时与分发器

- 新增 `src/runtime/BridgeRuntime.js`
  - 长连接生命周期（start/stop）
  - 心跳、自动重连、请求队列、请求超时
  - 统一入站消息处理与 `watch.triggered` 分发
- 新增分发器：
  - `src/runtime/dispatchers/PluginDispatcher.js`
  - `src/runtime/dispatchers/DaemonDispatcher.js`

### 3) 严格单活

- 新增 `src/runtime/lock/ProcessLock.js`
  - 锁键：`baseWsUrl + token hash`
  - 活跃占用冲突抛 `E_SINGLE_ACTIVE_CONFLICT`
  - 支持 stale 锁回收（心跳超时 + PID 探活）

### 4) daemon 启动编排

- 新增 `src/daemon/start-daemon.js`
  - 统一锁获取、runtime 启动、停止释放
  - 便于单测/集成测试注入 mock runtime

### 5) 打包与导出

- `package.json` 更新：
  - `main` 指向插件入口 `index.js`
  - 新增 `bin.openclaw-bridge-daemon`
  - 新增 `exports["./sdk"]` 保留 SDK 访问路径

## 测试与验证

已执行并通过：

- `npm test`（22/22）
- `node bin/openclaw-bridge-daemon.js --help`
- `npm pack --dry-run --cache /tmp/npm-cache`

新增覆盖：

- 插件回调链路（`watch.triggered -> runtime.dispatchReply`）
- daemon 单活（模块级）
- daemon 单活（真实子进程级，第二进程退出码 `2`）
- 锁冲突与僵尸锁回收

## 兼容性与影响

- 新增插件主入口与 daemon 启动方式
- 旧 SDK 导出仍保留（通过 `./sdk` 与 `src/index.js`）
- 若上层直接依赖旧 Adapter 生命周期行为，需要按新插件/daemon 模式迁移

## 风险点

- 单活锁为本机语义；多机部署仍需外部协调
- daemon 测试模式环境变量 `OPENCLAW_DAEMON_TEST_MODE=mock` 仅测试用途，不应在生产启用
- 插件 `register` 生命周期依赖宿主 `onShutdown` 回调是否按预期触发

## 回滚方案

1. 回滚到 `379bc0c`（重构前设计提交点）
2. 保留现有 SDK 使用方式（旧 `OpenClawBridgeClient/OpenClawPluginAdapter`）
3. 暂停加载 `openclaw.plugin.json` 与 daemon 二进制入口

## 建议评审顺序

1. `src/runtime/lock/ProcessLock.js`
2. `src/runtime/BridgeRuntime.js`
3. `src/plugin/index.js` + `src/daemon/start-daemon.js`
4. `bin/openclaw-bridge-daemon.js`
5. 新增测试文件（`tests/*runtime*`, `tests/daemon*`, `tests/process-lock*`）
