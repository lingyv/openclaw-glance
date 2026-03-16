import assert from 'node:assert/strict';
import test from 'node:test';

import { PluginDispatcher } from '../src/runtime/dispatchers/PluginDispatcher.js';

test('PluginDispatcher forwards trigger to openclaw runtime', async () => {
  let received = null;
  const dispatcher = new PluginDispatcher({
    runtime: {
      dispatchReply: async (payload) => {
        received = payload;
      }
    }
  });
  await dispatcher.onTriggered({ payload: { message: 'hello' } });
  assert.equal(received?.text, 'hello');
  assert.equal(received?.metadata?.source, 'watch.triggered');
});

test('PluginDispatcher forwards channel/session routing from openclaw payload', async () => {
  let received = null;
  const dispatcher = new PluginDispatcher({
    runtime: {
      dispatchReply: async (payload) => {
        received = payload;
      }
    }
  });

  await dispatcher.onTriggered({
    payload: {
      message: 'hello route',
      channel_configs: {
        openclaw: {
          channel: 'dingtalk',
          session_key: 'agent:main:dingtalk:group:cid_demo',
          account_id: 'default',
          conversation_id: 'cid_demo'
        }
      }
    }
  });

  assert.equal(received?.channel, 'dingtalk');
  assert.equal(received?.sessionKey, 'agent:main:dingtalk:group:cid_demo');
  assert.equal(received?.accountId, 'default');
  assert.equal(received?.conversationId, 'cid_demo');
  assert.equal(received?.metadata?.routing?.channel, 'dingtalk');
});
