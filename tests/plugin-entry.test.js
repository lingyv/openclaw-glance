import assert from 'node:assert/strict';
import test from 'node:test';

import plugin from '../index.js';

test('plugin entry exposes id/register', () => {
  assert.equal(plugin.id, 'openclaw-glance-plugin');
  assert.equal(typeof plugin.register, 'function');
});
