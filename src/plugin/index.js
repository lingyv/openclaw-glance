import { resolveRuntimeConfig } from '../config/runtime-config.js';
import { BridgeRuntime } from '../runtime/BridgeRuntime.js';
import { PluginDispatcher } from '../runtime/dispatchers/PluginDispatcher.js';
import { ProcessLock } from '../runtime/lock/ProcessLock.js';

let activeRuntime = null;

function installProcessShutdown(runtime) {
  const stop = async () => {
    if (!runtime) return;
    await runtime.stop().catch(() => {});
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

export function getActivePluginRuntime() {
  return activeRuntime;
}

export async function startPluginRuntime({ runtime, pluginConfig } = {}) {
  if (activeRuntime) {
    return activeRuntime;
  }
  const config = resolveRuntimeConfig({ pluginConfig });
  const lock = new ProcessLock({
    lockDir: config.lockDir,
    key: config.lockKey
  });
  const dispatcher = new PluginDispatcher({ runtime });
  activeRuntime = new BridgeRuntime({
    baseWsUrl: config.baseWsUrl,
    token: config.token,
    dispatcher,
    lock
  });
  await activeRuntime.start();
  return activeRuntime;
}

export async function stopPluginRuntime() {
  if (!activeRuntime) return;
  await activeRuntime.stop();
  activeRuntime = null;
}

const plugin = {
  id: 'glance-bridge',
  name: 'Glance Bridge Channel',
  description: 'OpenClaw bridge long connection plugin',
  register(api) {
    const pluginConfig =
      api?.config?.channels?.['glance-bridge'] ||
      api?.config?.channels?.glanceBridge ||
      api?.config?.glanceBridge ||
      {};

    startPluginRuntime({
      runtime: api?.runtime,
      pluginConfig
    }).catch((err) => {
      api?.runtime?.logger?.error?.(`[glance-bridge] runtime start failed: ${err.message}`);
      throw err;
    });

    if (typeof api?.onShutdown === 'function') {
      api.onShutdown(() => stopPluginRuntime());
    } else {
      installProcessShutdown(activeRuntime);
    }
  }
};

export default plugin;
