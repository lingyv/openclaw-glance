function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function extractRoutingFromTriggeredEvent(event) {
  const payload = event?.payload || {};
  const openclaw = payload?.channel_configs?.openclaw || payload?.openclaw || {};

  return {
    channel: pickFirstString(
      payload?.channel,
      payload?.source_channel,
      openclaw?.channel,
      openclaw?.source_channel
    ),
    accountId: pickFirstString(payload?.account_id, openclaw?.account_id),
    sessionKey: pickFirstString(
      payload?.session_key,
      payload?.sessionKey,
      openclaw?.session_key,
      openclaw?.sessionKey
    ),
    conversationId: pickFirstString(
      payload?.conversation_id,
      payload?.conversationId,
      payload?.chat_id,
      payload?.chatId,
      openclaw?.conversation_id,
      openclaw?.conversationId,
      openclaw?.chat_id,
      openclaw?.chatId
    )
  };
}

export class PluginDispatcher {
  constructor({ runtime }) {
    this.runtime = runtime;
  }

  async onTriggered(event) {
    if (!this.runtime?.dispatchReply) {
      return;
    }

    const routing = extractRoutingFromTriggeredEvent(event);
    const dispatchPayload = {
      text: event?.payload?.message || '',
      metadata: {
        source: 'watch.triggered',
        event,
        routing
      }
    };

    if (routing.channel) dispatchPayload.channel = routing.channel;
    if (routing.accountId) dispatchPayload.accountId = routing.accountId;
    if (routing.sessionKey) dispatchPayload.sessionKey = routing.sessionKey;
    if (routing.conversationId) dispatchPayload.conversationId = routing.conversationId;

    await this.runtime.dispatchReply(dispatchPayload);
  }
}
