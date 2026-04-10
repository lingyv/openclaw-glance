# OpenClaw 长连接插件化改造 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将当前按需连接的 SDK 形态重写为“OpenClaw 插件 + daemon 双入口同核心”，实现后台常驻长连接、双模式触发分发、同 token 严格单活。

**Architecture:** 新建共享核心 `BridgeRuntime`（连接、重连、请求、触发分发、状态机），插件入口与 daemon 入口仅承载各自运行环境适配。单活由 `ProcessLock`（锁文件 + PID 探测 + 心跳）统一保证，锁键使用 `baseWsUrl + tokenHash`。通过 TDD 先覆盖锁、运行时、双分发场景，再落地实现。

**Tech Stack:** Node.js 18+, ESM, `ws`, `node:test`, OpenClaw plugin metadata (`openclaw.plugin.json`)

---

### Task 1: 插件骨架与目录重组

**Files:**
- Create: `openclaw.plugin.json`
- Create: `bin/openclaw-bridge-daemon.js`
- Create: `src/plugin/index.js`
- Create: `src/config/runtime-config.js`
- Modify: `package.json`
- Modify: `README.md`
- Test: `tests/plugin-entry.test.js`

**Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import plugin from "../src/plugin/index.js";

test("plugin entry exposes id/register", () => {
  assert.equal(plugin.id, "glance-bridge");
  assert.equal(typeof plugin.register, "function");
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/plugin-entry.test.js`  
Expected: FAIL with module not found (`src/plugin/index.js`) or missing export.

**Step 3: Write minimal implementation**

`src/plugin/index.js`:

```js
const plugin = {
  id: "glance-bridge",
  name: "Glance Bridge Channel",
  register(api) {
    api.registerChannel?.({ plugin: { id: "glance-bridge" } });
  }
};

export default plugin;
```

`openclaw.plugin.json`:

```json
{
  "id": "glance-bridge",
  "channels": ["glance-bridge"],
  "configSchema": {
    "type": "object",
    "additionalProperties": true,
    "properties": {}
  }
}
```

`bin/openclaw-bridge-daemon.js`:

```js
#!/usr/bin/env node
console.log("openclaw-bridge daemon bootstrap");
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/plugin-entry.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add openclaw.plugin.json bin/openclaw-bridge-daemon.js src/plugin/index.js src/config/runtime-config.js package.json README.md tests/plugin-entry.test.js
git commit -m "feat: scaffold openclaw plugin and daemon entries"
```

### Task 2: 单活锁 ProcessLock（严格同 token 单活）

**Files:**
- Create: `src/runtime/lock/ProcessLock.js`
- Create: `tests/process-lock.test.js`
- Modify: `src/config/runtime-config.js`

**Step 1: Write the failing tests**

```js
test("acquire lock fails when active owner exists", async () => {
  // first lock acquire success
  // second lock same key throws E_SINGLE_ACTIVE_CONFLICT
});

test("stale lock can be reclaimed when pid dead", async () => {
  // write stale lock record with dead pid
  // new owner can acquire
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/process-lock.test.js`  
Expected: FAIL with missing module / missing behavior.

**Step 3: Write minimal implementation**

`src/runtime/lock/ProcessLock.js`:

```js
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export class SingleActiveConflictError extends Error {
  constructor(message, owner) {
    super(message);
    this.code = "E_SINGLE_ACTIVE_CONFLICT";
    this.owner = owner;
  }
}

export class ProcessLock {
  constructor({ lockDir, key, heartbeatMs = 5000, staleMs = 15000, now = () => Date.now() }) {
    this.lockDir = lockDir;
    this.key = key;
    this.heartbeatMs = heartbeatMs;
    this.staleMs = staleMs;
    this.now = now;
    this.timer = null;
  }
  // acquire/release/heartbeat with pid liveness check and stale reclaim
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/process-lock.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/runtime/lock/ProcessLock.js src/config/runtime-config.js tests/process-lock.test.js
git commit -m "feat: add strict single-active process lock"
```

### Task 3: BridgeRuntime 核心（常驻连接、请求、重连、触发）

**Files:**
- Create: `src/runtime/BridgeRuntime.js`
- Create: `tests/bridge-runtime.test.js`
- Modify: `src/OpenClawBridgeClient.js` (迁移为兼容 shim 或删除后改引用)

**Step 1: Write the failing tests**

```js
test("runtime keeps connection alive and emits connected", async () => {});
test("runtime reconnects after close and flushes queued requests", async () => {});
test("runtime dispatches watch.triggered to dispatcher", async () => {});
test("request timeout rejects pending promise", async () => {});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/bridge-runtime.test.js`  
Expected: FAIL due to missing runtime.

**Step 3: Write minimal implementation**

`src/runtime/BridgeRuntime.js`:

```js
import EventEmitter from "node:events";
import WebSocket from "ws";

export class BridgeRuntime extends EventEmitter {
  constructor({ baseWsUrl, token, dispatcher, reconnect = true, requestTimeoutMs = 10000 }) {
    super();
    this.baseWsUrl = baseWsUrl.replace(/\/$/, "");
    this.token = token;
    this.dispatcher = dispatcher;
    // state, pending map, queue, reconnect counters
  }
  async start() {}
  async stop() {}
  async request(type, payload = {}) {}
  // parse message, route request_id response and watch.triggered events
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/bridge-runtime.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/runtime/BridgeRuntime.js src/OpenClawBridgeClient.js tests/bridge-runtime.test.js
git commit -m "feat: implement shared bridge runtime with reconnect and dispatch"
```

### Task 4: 双分发器（插件模式 + daemon 模式）

**Files:**
- Create: `src/runtime/dispatchers/PluginDispatcher.js`
- Create: `src/runtime/dispatchers/DaemonDispatcher.js`
- Create: `tests/dispatchers.test.js`
- Modify: `src/plugin/index.js`
- Modify: `bin/openclaw-bridge-daemon.js`

**Step 1: Write the failing tests**

```js
test("PluginDispatcher forwards trigger to openclaw runtime", async () => {});
test("DaemonDispatcher forwards trigger to daemon handler", async () => {});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/dispatchers.test.js`  
Expected: FAIL.

**Step 3: Write minimal implementation**

`PluginDispatcher`:

```js
export class PluginDispatcher {
  constructor({ runtime }) {
    this.runtime = runtime;
  }
  async onTriggered(event) {
    await this.runtime.dispatchReply?.({
      text: event?.payload?.message || "",
      metadata: { source: "watch.triggered", event }
    });
  }
}
```

`DaemonDispatcher`:

```js
export class DaemonDispatcher {
  constructor({ onTriggered }) {
    this.onTriggeredHandler = onTriggered;
  }
  async onTriggered(event) {
    await this.onTriggeredHandler?.(event);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/dispatchers.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/runtime/dispatchers/PluginDispatcher.js src/runtime/dispatchers/DaemonDispatcher.js src/plugin/index.js bin/openclaw-bridge-daemon.js tests/dispatchers.test.js
git commit -m "feat: add plugin and daemon trigger dispatchers"
```

### Task 5: 入口组装（双入口同核心 + 单活）

**Files:**
- Modify: `src/plugin/index.js`
- Modify: `bin/openclaw-bridge-daemon.js`
- Create: `tests/plugin-daemon-lifecycle.test.js`
- Modify: `src/index.js`

**Step 1: Write the failing integration-style tests**

```js
test("plugin mode starts runtime with process lock", async () => {});
test("daemon mode rejects duplicate start with same token", async () => {});
test("both modes wire same BridgeRuntime API surface", async () => {});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/plugin-daemon-lifecycle.test.js`  
Expected: FAIL.

**Step 3: Write minimal implementation**

- 插件模式：`register(api)` 中创建 `BridgeRuntime + ProcessLock + PluginDispatcher`，并挂接 `api` 生命周期 stop hook。
- daemon 模式：解析 env 后创建 `BridgeRuntime + ProcessLock + DaemonDispatcher`，监听 `SIGINT/SIGTERM`。
- `src/index.js` 导出新入口符号，移除旧 `OpenClawPluginAdapter` 导出。

**Step 4: Run tests to verify they pass**

Run: `node --test tests/plugin-daemon-lifecycle.test.js`  
Expected: PASS.

**Step 5: Run full test suite**

Run: `npm test`  
Expected: all PASS.

**Step 6: Commit**

```bash
git add src/plugin/index.js bin/openclaw-bridge-daemon.js src/index.js tests/plugin-daemon-lifecycle.test.js
git commit -m "feat: wire plugin and daemon lifecycles to shared runtime"
```

### Task 6: 文档迁移与兼容性声明

**Files:**
- Modify: `README.md`
- Modify: `docs/openclaw-install-guide.md`
- Create: `docs/migration/adapter-to-plugin-daemon.md`

**Step 1: Write docs tests/checklist (failing state = checklist not met)**

```md
- [ ] README no longer documents old Adapter API as primary path
- [ ] install guide includes plugin + daemon startup and single-active behavior
- [ ] migration doc lists breaking changes and replacement APIs
```

**Step 2: Run validation**

Run: `rg "OpenClawPluginAdapter|submitWatchDemand" README.md docs/openclaw-install-guide.md`  
Expected: 仅在迁移说明出现，主流程不再推荐旧 API。

**Step 3: Write minimal documentation updates**

- README 首屏改为插件/daemon 双模式
- 安装指南新增“严格单活”与排障
- 迁移文档明确破坏性变更和替代调用

**Step 4: Re-run validation**

Run: `rg "OpenClawPluginAdapter|submitWatchDemand" README.md docs/openclaw-install-guide.md docs/migration/adapter-to-plugin-daemon.md`  
Expected: 命中结果符合迁移预期。

**Step 5: Commit**

```bash
git add README.md docs/openclaw-install-guide.md docs/migration/adapter-to-plugin-daemon.md
git commit -m "docs: document new plugin-daemon architecture and migration"
```

### Task 7: 发布前最终验证

**Files:**
- Modify: `package.json` (如需增加 `bin`、`files`、`exports`)
- Optional: `npm-shrinkwrap.json` / lockfile

**Step 1: Run verification**

Run: `npm test`  
Expected: PASS

Run: `node bin/openclaw-bridge-daemon.js --help`  
Expected: 输出启动参数说明并退出 0

Run: `node -e "import('./src/plugin/index.js').then(m=>console.log(!!m.default))"`  
Expected: `true`

**Step 2: Pack validation**

Run: `npm pack --dry-run`  
Expected: 包含 `openclaw.plugin.json`, `bin/*`, `src/*`, 关键文档。

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: finalize packaging for plugin and daemon distribution"
```

## Notes

- 执行中强制遵循 `@superpowers/test-driven-development`：先写失败测试，再写最小实现。
- 执行中若出现不稳定测试或行为异常，切换 `@superpowers/systematic-debugging` 定位根因后再继续。
- 每个 Task 完成后跑该 Task 相关测试并提交，避免大批量未验证修改。
