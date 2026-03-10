# OpenClaw 插件化长连接改造设计

日期：2026-03-10  
状态：已评审（用户确认）  
范围：`openclaw-plugin-node` 仓库

## 1. 背景与目标

当前项目主要以 SDK/Adapter 形式使用，连接通常在调用时建立，空闲后可能中断，导致 `watch.triggered` 在非活跃调用窗口内无法稳定接收。  
目标是改造成 OpenClaw 插件形态并同时支持 daemon，保持后台常驻长连接。

已确认的约束：

- 支持双模式：OpenClaw 插件模式 + daemon 模式
- 两种模式都能分发 `watch.triggered`
- 同一 token 严格单活（拒绝重复实例）
- 允许不兼容现有调用方，按新架构重写

## 2. 方案选择

采用“**双入口同核心**”：

- 入口 A：OpenClaw 插件入口（框架托管生命周期）
- 入口 B：daemon 入口（独立常驻进程）
- 共享核心：`BridgeRuntime` 统一承载连接、重连、请求响应、触发分发、状态管理

不选其他方案原因：

- 仅在 Adapter 打补丁会造成生命周期分散，后续易漂移
- 拆多包在当前仓库体量下成本偏高

## 3. 架构设计

### 3.1 模块划分

- `index.ts`（插件入口）
- `openclaw.plugin.json`（插件声明）
- `bin/openclaw-bridge-daemon.js`（daemon 启动入口）
- `src/runtime/BridgeRuntime.ts`（核心运行时）
- `src/runtime/dispatchers/PluginDispatcher.ts`
- `src/runtime/dispatchers/DaemonDispatcher.ts`
- `src/runtime/lock/ProcessLock.ts`（单活锁）
- `src/config/*`（配置装载与校验）

### 3.2 生命周期

- `start(mode)`：抢占单活锁 -> 建立 WS 连接 -> 注册分发器
- `run`：心跳保活 + 自动重连 + 事件状态维护
- `stop`：停止分发 -> 关闭连接 -> 释放锁

### 3.3 严格单活策略

- 锁键：`<baseWsUrl + tokenHash>`
- 行为：若存在活跃持有者，第二实例直接失败
- 锁信息：PID、启动时间、最近心跳
- 恢复：PID 探测 + 超时回收僵尸锁

## 4. 数据流设计

### 4.1 出站请求流

调用方（插件 action / daemon API）  
-> `BridgeRuntime.request(type, payload)`  
-> WS 发送（request_id）  
-> 响应匹配与超时处理  
-> 返回结构化结果

### 4.2 入站触发流

WS 收包  
-> `BridgeRuntime` 解析 `watch.triggered`  
-> `dispatcher.onTriggered(event)`  
-> 插件模式投递 OpenClaw runtime / daemon 模式投递本地 handler

### 4.3 状态事件

统一发布：

- `connected`
- `disconnected`
- `reconnecting`
- `failed`

供插件与 daemon 共用观测与健康检查逻辑。

## 5. 错误处理与降级

### 5.1 启动期

- 锁冲突：`E_SINGLE_ACTIVE_CONFLICT`（返回占用 PID/时间）
- token 无效：`E_AUTH_INVALID_TOKEN`
- 首连超时：`E_CONNECT_TIMEOUT`

### 5.2 运行期

- 断线：指数退避重连（带抖动、上限）
- 请求超时：请求级失败并返回调用方
- 非法消息：丢弃并计数，不终止主连接

### 5.3 退出

- `SIGINT` / `SIGTERM` 优雅停机，确保释放锁
- 崩溃后由锁心跳超时 + PID 不存在机制回收

## 6. 测试与验收

### 6.1 单元测试

- `ProcessLock`：冲突、僵尸回收、并发抢占
- `BridgeRuntime`：重连、请求超时、队列冲刷、触发分发
- dispatcher：插件/daemon 两模式均可收到 `watch.triggered`

### 6.2 集成测试

- 插件模式：空闲时长连接常驻，不按需断开
- daemon 模式：同 token 二次启动被拒绝
- 断网恢复：重连成功后继续接收触发

### 6.3 验收标准

- 不再出现“仅按需连接，未触发即断开”
- 双模式均可持续接收 `watch.triggered`
- 严格单活策略稳定生效

## 7. 风险与边界

- OpenClaw 插件 SDK 版本兼容性需先校验（入口与 channel/action 接口）
- 单活锁为本机语义；跨主机多实例需要外部协调（当前不纳入范围）
- 完全重写后需要提供迁移说明，明确旧 Adapter API 不再兼容
