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
});
