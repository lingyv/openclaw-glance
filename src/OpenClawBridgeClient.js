import EventEmitter from 'node:events';
import WebSocket from 'ws';

const DEFAULT_BASE_WS_URL = 'ws://glanceup-pre.100credit.cn';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 全局单例实例
 * @type {OpenClawBridgeClient|null}
 */
let globalInstance = null;

/**
 * 获取全局单例实例
 * @param {Object} options - 创建实例的选项（仅首次创建时有效）
 * @returns {OpenClawBridgeClient} 全局单例实例
 */
export function getGlobalClient(options) {
  if (!globalInstance) {
    globalInstance = new OpenClawBridgeClient(options);
  }
  return globalInstance;
}

/**
 * 获取全局单例实例（别名，推荐使用）
 * @param {Object} options - 创建实例的选项（仅首次创建时有效）
 * @returns {OpenClawBridgeClient} 全局单例实例
 */
export function getInstance(options) {
  return getGlobalClient(options);
}

/**
 * 重置全局单例实例（主要用于测试）
 */
export function resetGlobalClient() {
  if (globalInstance) {
    globalInstance.close();
    globalInstance = null;
  }
}

export class OpenClawBridgeClient extends EventEmitter {
  constructor(options) {
    super();
    const {
      baseWsUrl = DEFAULT_BASE_WS_URL,
      token = '',
      heartbeatMs = 15000,
      requestTimeoutMs = 10000,
      waitConnectTimeoutMs = 20000,
      reconnect = true,
      reconnectBaseMs = 1000,
      reconnectMaxMs = 15000,
      enqueueIfDisconnected = true,
      maxQueueSize = 200
    } = options || {};

    if (!token) throw new Error('token is required');

    this.baseWsUrl = baseWsUrl.replace(/\/$/, '');
    this.userId = '';
    this.token = token;

    this.heartbeatMs = heartbeatMs;
    this.requestTimeoutMs = requestTimeoutMs;
    this.waitConnectTimeoutMs = waitConnectTimeoutMs;
    this.reconnect = reconnect;
    this.reconnectBaseMs = reconnectBaseMs;
    this.reconnectMaxMs = reconnectMaxMs;
    this.enqueueIfDisconnected = enqueueIfDisconnected;
    this.maxQueueSize = maxQueueSize;

    this.ws = null;
    this.connected = false;
    this.stopped = false;
    this.heartbeatTimer = null;
    this.reconnectAttempt = 0;
    this.pending = new Map();
    this.requestQueue = [];
  }

  get wsUrl() {
    const url = new URL('/openclaw/ws', this.baseWsUrl);
    return url.toString();
  }

  async connect() {
    this.stopped = false;
    await this._connectOnce();
  }

  async close() {
    this.stopped = true;
    this._clearHeartbeat();

    for (const [requestId, waiter] of this.pending.entries()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(`connection closed before response: ${requestId}`));
    }
    this.pending.clear();
    for (const queued of this.requestQueue) {
      queued.reject(new Error(`connection closed before request sent: ${queued.requestId}`));
    }
    this.requestQueue = [];

    if (this.ws) {
      try {
        this.ws.close();
      } catch (_err) {
        // ignore
      }
    }
  }

  async createWatch(payload) {
    return this._request('watch.create', payload);
  }

  async activateWatch(strategyId) {
    return this._request('watch.activate', { strategy_id: strategyId });
  }

  async pauseWatch(strategyId) {
    return this._request('watch.pause', { strategy_id: strategyId });
  }

  async deleteWatch(strategyId) {
    return this._request('watch.delete', { strategy_id: strategyId });
  }

  async ping() {
    return this._request('ping', {});
  }

  async waitUntilConnected(timeoutMs = this.waitConnectTimeoutMs) {
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return true;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`waitUntilConnected timeout (${timeoutMs}ms)`));
      }, timeoutMs);

      const onConnected = () => {
        cleanup();
        resolve(true);
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.off('connected', onConnected);
      };

      this.on('connected', onConnected);
    });
  }

  async _request(type, payload) {
    const requestId = makeRequestId();
    const msg = { type, request_id: requestId, payload: payload || {} };
    const { promise, resolve, reject } = this._buildWaiter(type, requestId);

    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (!this.enqueueIfDisconnected) {
        reject(new Error('websocket not connected'));
        return promise;
      }
      if (this.requestQueue.length >= this.maxQueueSize) {
        reject(new Error(`request queue overflow (max=${this.maxQueueSize})`));
        return promise;
      }
      this.requestQueue.push({ msg, requestId, type, resolve, reject });
      this.emit('queued', { type, requestId, queueSize: this.requestQueue.length });
      return promise;
    }

    this._sendWithTimeout({ msg, requestId, type, resolve, reject });
    return promise;
  }

  _buildWaiter(type, requestId) {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject, type, requestId };
  }

  _sendWithTimeout({ msg, requestId, type, resolve, reject }) {
    const timer = setTimeout(() => {
      this.pending.delete(requestId);
      reject(new Error(`request timeout: ${type} (${requestId})`));
    }, this.requestTimeoutMs);

    this.pending.set(requestId, { resolve, reject, timer, type });
    this.ws.send(JSON.stringify(msg));
  }

  async _connectOnce() {
    const ws = new WebSocket(this.wsUrl, {
      headers: {
        Authorization: `Bearer ${this.token}`
      }
    });

    await new Promise((resolve, reject) => {
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        ws.off('open', onOpen);
        ws.off('error', onError);
      };
      ws.on('open', onOpen);
      ws.on('error', onError);
    });

    this.ws = ws;
    this.connected = true;
    this.reconnectAttempt = 0;
    this.emit('connected');
    this._flushQueue();

    ws.on('message', (raw) => {
      this._onMessage(raw.toString());
    });

    ws.on('close', (code, reason) => {
      this._onClose(code, reason?.toString());
    });

    ws.on('error', (err) => {
      this.emit('error', err);
    });

    this._startHeartbeat();
  }

  _onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (err) {
      this.emit('warning', new Error(`invalid json from bridge: ${raw}`));
      return;
    }

    const requestId = msg.request_id;
    if (requestId && this.pending.has(requestId)) {
      const waiter = this.pending.get(requestId);
      this.pending.delete(requestId);
      clearTimeout(waiter.timer);
      waiter.resolve(msg);
      return;
    }

    if (msg.type === 'watch.triggered') {
      this.emit('triggered', msg);
      return;
    }

    if (msg.type === 'system.connected') {
      this.userId = msg.user_id || this.userId;
      this.emit('systemConnected', msg);
      return;
    }

    this.emit('message', msg);
  }

  async _onClose(code, reason) {
    this.connected = false;
    this._clearHeartbeat();
    this.emit('disconnected', { code, reason });

    if (!this.reconnect || this.stopped) {
      return;
    }

    while (!this.stopped) {
      this.reconnectAttempt += 1;
      const backoff = Math.min(
        this.reconnectBaseMs * 2 ** (this.reconnectAttempt - 1),
        this.reconnectMaxMs
      );
      this.emit('reconnecting', { attempt: this.reconnectAttempt, backoffMs: backoff });
      await sleep(backoff);
      try {
        await this._connectOnce();
        return;
      } catch (err) {
        this.emit('error', err);
      }
    }
  }

  _startHeartbeat() {
    this._clearHeartbeat();
    this.heartbeatTimer = setInterval(async () => {
      if (!this.connected) return;
      try {
        await this.ping();
      } catch (err) {
        this.emit('warning', new Error(`heartbeat failed: ${err.message}`));
      }
    }, this.heartbeatMs);
  }

  _flushQueue() {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    if (!this.requestQueue.length) {
      return;
    }
    const queued = this.requestQueue.splice(0, this.requestQueue.length);
    for (const item of queued) {
      this._sendWithTimeout(item);
    }
    this.emit('queueFlushed', { count: queued.length });
  }

  _clearHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
