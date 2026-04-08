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
