import EventEmitter from 'node:events';
import WebSocket from 'ws';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class BridgeRuntime extends EventEmitter {
  constructor({
    baseWsUrl,
    token,
    dispatcher,
    lock,
    heartbeatMs = 15000,
    requestTimeoutMs = 10000,
    reconnect = true,
    reconnectBaseMs = 1000,
    reconnectMaxMs = 15000,
    enqueueIfDisconnected = true,
    maxQueueSize = 200
  }) {
    super();
    if (!baseWsUrl) throw new Error('baseWsUrl is required');
    if (!token) throw new Error('token is required');
    this.baseWsUrl = baseWsUrl.replace(/\/$/, '');
    this.token = token;
    this.dispatcher = dispatcher;
    this.lock = lock;

    this.heartbeatMs = heartbeatMs;
    this.requestTimeoutMs = requestTimeoutMs;
    this.reconnect = reconnect;
    this.reconnectBaseMs = reconnectBaseMs;
    this.reconnectMaxMs = reconnectMaxMs;
    this.enqueueIfDisconnected = enqueueIfDisconnected;
    this.maxQueueSize = maxQueueSize;

    this.ws = null;
    this.connected = false;
    this.stopped = false;
    this.reconnectAttempt = 0;
    this.heartbeatTimer = null;
    this.pending = new Map();
    this.requestQueue = [];
  }

  get wsUrl() {
    const url = new URL('/openclaw/ws', this.baseWsUrl);
    return url.toString();
  }

  async start() {
    this.stopped = false;
    await this.lock?.acquire();
    try {
      await this._connectOnce();
    } catch (err) {
      await this.lock?.release().catch(() => {});
      throw err;
    }
  }

  async stop() {
    this.stopped = true;
    this.connected = false;
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
    await this.lock?.release().catch(() => {});
  }

  async request(type, payload = {}) {
    const requestId = makeRequestId();
    const msg = { type, request_id: requestId, payload };
    const { promise, resolve, reject } = this._buildWaiter();

    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (!this.enqueueIfDisconnected) {
        reject(new Error('websocket not connected'));
        return promise;
      }
      if (this.requestQueue.length >= this.maxQueueSize) {
        reject(new Error(`request queue overflow (max=${this.maxQueueSize})`));
        return promise;
      }
      this.requestQueue.push({ msg, requestId, resolve, reject });
      return promise;
    }
    this._sendWithTimeout({ msg, requestId, resolve, reject });
    return promise;
  }

  _buildWaiter() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  _sendWithTimeout({ msg, requestId, resolve, reject }) {
    const timer = setTimeout(() => {
      this.pending.delete(requestId);
      reject(new Error(`request timeout: ${msg.type} (${requestId})`));
    }, this.requestTimeoutMs);

    this.pending.set(requestId, { resolve, reject, timer });
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (err) {
      clearTimeout(timer);
      this.pending.delete(requestId);
      reject(err);
    }
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
    this._startHeartbeat();
    this._flushQueue();

    ws.on('message', (raw) => {
      this._onMessage(raw.toString());
    });
    ws.on('close', (code, reason) => {
      void this._onClose(code, reason?.toString());
    });
    ws.on('error', (err) => {
      this.emit('error', err);
    });
  }

  _onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (_err) {
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
      this.dispatcher?.onTriggered?.(msg).catch((err) => this.emit('error', err));
      this.emit('triggered', msg);
      return;
    }
    this.emit('message', msg);
  }

  async _onClose(code, reason) {
    this.connected = false;
    this._clearHeartbeat();
    this.emit('disconnected', { code, reason });
    if (this.stopped || !this.reconnect) {
      return;
    }
    while (!this.stopped) {
      this.reconnectAttempt += 1;
      const backoff = Math.min(
        this.reconnectBaseMs * Math.min(this.reconnectAttempt, 10),
        this.reconnectMaxMs
      );
      this.emit('reconnecting', { attempt: this.reconnectAttempt, backoffMs: backoff });
      await sleep(backoff);
      if (this.stopped) return;
      try {
        await this._connectOnce();
        this.emit('reconnected', { attempt: this.reconnectAttempt });
        return;
      } catch (err) {
        this.emit('warning', err);
      }
    }
  }

  _startHeartbeat() {
    this._clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.connected) return;
      this.request('ping', {}).catch(() => {});
    }, this.heartbeatMs);
  }

  _clearHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  _flushQueue() {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const queued = this.requestQueue.splice(0, this.requestQueue.length);
    for (const item of queued) {
      this._sendWithTimeout(item);
    }
  }
}
