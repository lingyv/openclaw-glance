import { resolveRuntimeConfig } from '../config/runtime-config.js';
import { BridgeRuntime } from '../runtime/BridgeRuntime.js';
import { DaemonDispatcher } from '../runtime/dispatchers/DaemonDispatcher.js';
import { ProcessLock } from '../runtime/lock/ProcessLock.js';

export async function startDaemon({
  env,
  config,
  onTriggered,
  createRuntime
} = {}) {
  const resolved = config || resolveRuntimeConfig({ env });
  const lock = new ProcessLock({
    lockDir: resolved.lockDir,
    key: resolved.lockKey
  });

  await lock.acquire();

  const dispatcher = new DaemonDispatcher({
    onTriggered: async (event) => {
      await onTriggered?.(event);
    }
  });

  const runtime = createRuntime
    ? createRuntime({ config: resolved, dispatcher })
    : new BridgeRuntime({
        baseWsUrl: resolved.baseWsUrl,
        token: resolved.token,
        dispatcher
      });

  try {
    await runtime.start();
  } catch (err) {
    await lock.release().catch(() => {});
    throw err;
  }

  return {
    config: resolved,
    runtime,
    stop: async () => {
      await runtime.stop?.().catch(() => {});
      await lock.release().catch(() => {});
    }
  };
}
