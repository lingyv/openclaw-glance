import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveOpenclawRouting,
  mergeContextMetadata,
  pickFirstSenderIdentifier,
  pickFirstTrimmedScalar
} from '../src/openclawRouting.js';

test('pickFirstTrimmedScalar accepts finite numbers and bigint', () => {
  assert.equal(pickFirstTrimmedScalar('', 12345), '12345');
  assert.equal(pickFirstTrimmedScalar(0), '0');
  assert.equal(pickFirstTrimmedScalar(BigInt(99)), '99');
  assert.equal(pickFirstTrimmedScalar('', null, undefined), undefined);
});

test('pickFirstSenderIdentifier skips numeric / bigint zero', () => {
  assert.equal(pickFirstSenderIdentifier(0, 'ok'), 'ok');
  assert.equal(pickFirstSenderIdentifier(0, 0, 42), '42');
  assert.equal(pickFirstSenderIdentifier(0n, 'x'), 'x');
  assert.equal(pickFirstSenderIdentifier(0, 0, 0), undefined);
});

test('mergeContextMetadata merges flat then event (event wins on same key)', () => {
  const m = mergeContextMetadata({
    metadata: { channel: 'a', x: 1 },
    event: { metadata: { channel: 'b', y: 2 } }
  });
  assert.equal(m.channel, 'b');
  assert.equal(m.x, 1);
  assert.equal(m.y, 2);
});

test('deriveOpenclawRouting reads senderContext and context.metadata', () => {
  const r = deriveOpenclawRouting({
    params: {},
    context: {
      metadata: { sessionKey: 'from-flat' },
      senderContext: {
        channel: 'dingtalk',
        conversationId: 'cid-from-sc'
      }
    }
  });
  assert.equal(r.channel, 'dingtalk');
  assert.equal(r.session_key, 'from-flat');
  assert.equal(r.conversation_id, 'cid-from-sc');
});
