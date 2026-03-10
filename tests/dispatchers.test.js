import assert from 'node:assert/strict';
import test from 'node:test';

import { PluginDispatcher } from '../src/runtime/dispatchers/PluginDispatcher.js';
import { DaemonDispatcher } from '../src/runtime/dispatchers/DaemonDispatcher.js';

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
});

test('DaemonDispatcher forwards trigger to daemon handler', async () => {
  let received = null;
  const dispatcher = new DaemonDispatcher({
    onTriggered: async (event) => {
      received = event;
    }
  });
  await dispatcher.onTriggered({ payload: { strategy_id: 's9' } });
  assert.equal(received?.payload?.strategy_id, 's9');
});
