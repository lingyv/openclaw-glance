import assert from 'node:assert/strict';
import test from 'node:test';

import plugin from '../index.js';

test('plugin entry exposes id/register', () => {
  assert.equal(plugin.id, 'glance-bridge');
  assert.equal(typeof plugin.register, 'function');
});
