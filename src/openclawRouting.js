/**
 * openclaw-bridge 约定的会话路由字段（snake_case），用于落库与触发回推。
 * @see ticker-monitor services/openclaw_bridge/main.py _extract_openclaw_routing
 */

export function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

/**
 * 用于 senderId、路由 ID 等：非空字符串 trim，有限数字 / bigint 转字符串。
 * （纯 pickFirstString 会忽略数字类型，导致记忆主键丢失。）
 */
export function pickFirstTrimmedScalar(...values) {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === 'string') {
      const t = value.trim();
      if (t) return t;
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === 'bigint') {
      return String(value);
    }
  }
  return undefined;
}

/**
 * 用于发送者主键：忽略数字 / bigint 0（常见占位），避免生成 `unknown:0` 等无效记忆键。
 */
export function pickFirstSenderIdentifier(...values) {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === 'string') {
      const t = value.trim();
      if (t) return t;
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value === 0) continue;
      return String(value);
    }
    if (typeof value === 'bigint') {
      if (value === 0n) continue;
      return String(value);
    }
  }
  return undefined;
}

/**
 * 从任意平面对象提取路由（支持 camelCase / snake_case），返回 bridge 使用的 snake_case。
 * @param {Record<string, unknown>} source
 * @returns {Record<string, string>}
 */
export function extractOpenclawRoutingFromRecord(source = {}) {
  if (!source || typeof source !== 'object') {
    return {};
  }
  const channel = pickFirstString(
    source.channel,
    source.source_channel,
    source.sourceChannel
  );
  const account_id = pickFirstString(source.account_id, source.accountId);
  const session_key = pickFirstString(source.session_key, source.sessionKey);
  const conversation_id = pickFirstString(
    source.conversation_id,
    source.conversationId,
    source.chat_id,
    source.chatId
  );
  const out = {};
  if (channel) out.channel = channel;
  if (account_id) out.account_id = account_id;
  if (session_key) out.session_key = session_key;
  if (conversation_id) out.conversation_id = conversation_id;
  return out;
}

/**
 * 合并 params 与宿主 context / event.metadata 上的路由字段（与插件 index 行为一致）。
 * @param {{ params?: Record<string, unknown>, context?: Record<string, unknown> }} args
 * @returns {Record<string, string>}
 */
export function mergeContextMetadata(context = {}) {
  const flat =
    context.metadata && typeof context.metadata === 'object' && !Array.isArray(context.metadata)
      ? context.metadata
      : {};
  const eventMeta =
    context.event?.metadata &&
    typeof context.event.metadata === 'object' &&
    !Array.isArray(context.event.metadata)
      ? context.event.metadata
      : {};
  return { ...flat, ...eventMeta };
}

export function unwrapSenderContextObject(context = {}) {
  const sc = context?.senderContext;
  if (sc && typeof sc === 'object' && !Array.isArray(sc)) {
    return sc;
  }
  return {};
}

export function deriveOpenclawRouting({ params = {}, context = {} } = {}) {
  const metadata = mergeContextMetadata(context);
  const sc = unwrapSenderContextObject(context);
  const routing = extractOpenclawRoutingFromRecord(params || {});

  if (!routing.channel) {
    const channel = pickFirstString(
      sc.channel,
      sc.sourceChannel,
      sc.source_channel,
      params?.source_channel,
      metadata?.channel,
      metadata?.channelId,
      context?.channel,
      context?.channelId
    );
    if (channel) routing.channel = channel;
  }
  if (!routing.account_id) {
    const account_id = pickFirstString(
      params?.account_id,
      sc.accountId,
      sc.account_id,
      context?.accountId,
      metadata?.accountId
    );
    if (account_id) routing.account_id = account_id;
  }
  if (!routing.session_key) {
    const session_key = pickFirstString(
      params?.session_key,
      params?.sessionKey,
      sc.sessionKey,
      sc.session_key,
      context?.sessionKey,
      metadata?.sessionKey
    );
    if (session_key) routing.session_key = session_key;
  }
  if (!routing.conversation_id) {
    const conversation_id = pickFirstString(
      params?.conversation_id,
      params?.conversationId,
      params?.chat_id,
      params?.chatId,
      sc.conversationId,
      sc.conversation_id,
      sc.chatId,
      sc.chat_id,
      context?.conversationId,
      metadata?.conversationId,
      metadata?.chatId,
      metadata?.groupId
    );
    if (conversation_id) routing.conversation_id = conversation_id;
  }
  return routing;
}
