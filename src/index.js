export { OpenClawBridgeClient, getGlobalClient, getInstance, resetGlobalClient } from './OpenClawBridgeClient.js';
export { OpenClawPluginAdapter, getGlobalAdapter, getAdapter, resetGlobalAdapter } from './OpenClawPluginAdapter.js';
export { BridgeRuntime } from './runtime/BridgeRuntime.js';
export { ProcessLock, SingleActiveConflictError } from './runtime/lock/ProcessLock.js';
export { PluginDispatcher } from './runtime/dispatchers/PluginDispatcher.js';
export { resolveRuntimeConfig } from './config/runtime-config.js';
export {
  startPluginRuntime,
  stopPluginRuntime,
  getActivePluginRuntime
} from './plugin/index.js';
