import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildSenderContext,
  emptyContactsDoc,
  extractSenderContext,
  loadContactsFile,
  mergeAndPersistNotifyContacts,
  mergeAndPersistWatchContacts,
  normalizePhone,
  runContactsFileSerialized
} from '../src/plugin/watch-notify-contacts.js';

test('normalizePhone strips country code and non-digits', () => {
  assert.equal(normalizePhone('13800138000'), '13800138000');
  assert.equal(normalizePhone('+86 138 0013 8000'), '13800138000');
  assert.equal(normalizePhone('8613800138000'), '13800138000');
  assert.equal(normalizePhone('abc'), null);
});

test('extractSenderContext builds dingtalk sender key from metadata', () => {
  const ctx = extractSenderContext({
    context: {
      channelId: 'dingtalk',
      event: {
        metadata: {
          senderDingtalkId: 'jinguo.xie',
          senderName: '谢金国'
        }
      }
    },
    params: {}
  });
  assert.equal(ctx.senderKey, 'dingtalk:jinguo.xie');
  assert.equal(ctx.senderId, 'jinguo.xie');
  assert.equal(ctx.senderName, '谢金国');
});

test('extractSenderContext prefers senderContext + senderId (OpenClaw shape)', () => {
  const ctx = extractSenderContext({
    context: {
      channelId: 'dingtalk',
      senderContext: {
        channel: 'dingtalk',
        senderId: 'corp.user01',
        senderName: 'OpenClaw User'
      },
      event: {
        metadata: {
          senderDingtalkId: 'should-not-win'
        }
      }
    },
    params: {}
  });
  assert.equal(ctx.senderKey, 'dingtalk:corp.user01');
  assert.equal(ctx.senderId, 'corp.user01');
  assert.equal(ctx.senderName, 'OpenClaw User');
});

test('buildSenderContext is alias for extractSenderContext', () => {
  const a = buildSenderContext({
    channelId: 'dingtalk',
    senderId: 'top-level-id'
  });
  assert.equal(a.senderKey, 'dingtalk:top-level-id');
});

test('extractSenderContext accepts numeric senderId', () => {
  const ctx = extractSenderContext({
    context: {
      channelId: 'dingtalk',
      senderContext: { channel: 'dingtalk', senderId: 987654321 }
    },
    params: {}
  });
  assert.equal(ctx.senderId, '987654321');
  assert.equal(ctx.senderKey, 'dingtalk:987654321');
});

test('extractSenderContext ignores numeric senderId zero', () => {
  const ctx = extractSenderContext({
    context: {
      channelId: 'dingtalk',
      senderContext: { channel: 'dingtalk', senderId: 0 }
    },
    params: {}
  });
  assert.equal(ctx.senderId, null);
  assert.equal(ctx.senderKey, null);
});

test('loadContactsFile backs up corrupt JSON and returns empty doc', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'watch-corrupt-'));
  const filePath = path.join(dir, 'contacts.json');
  await mkdir(dir, { recursive: true });
  await writeFile(filePath, '{ not json', 'utf8');
  const doc = await loadContactsFile(filePath);
  assert.equal(doc.senders && Object.keys(doc.senders).length, 0);
  const names = await readdir(dir);
  const backups = names.filter((n) => n.includes('.corrupt.') && n.endsWith('.bak'));
  assert.equal(backups.length, 1);
});

test('mergeAndPersistWatchContacts refines unknown session via openclaw.channel', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'watch-refine-'));
  const filePath = path.join(dir, 'contacts.json');

  const payload = {
    channels: ['dingtalk'],
    channel_configs: {
      openclaw: { channel: 'dingtalk', session_key: 'sk' },
      dingtalk: { template_id: 3, msg_type: 'text', content: 'hi' }
    }
  };

  const out = await mergeAndPersistWatchContacts(filePath, payload, {
    senderId: 'user.from.context.only'
  });

  assert.equal(out.channel_configs.dingtalk.cas_id, 'user.from.context.only');
  const disk = JSON.parse(await readFile(filePath, 'utf8'));
  assert.ok(disk.senders['dingtalk:user.from.context.only']);
});

test('runContactsFileSerialized runs tasks in order', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'watch-serial-'));
  const filePath = path.join(dir, 'x.json');
  const order = [];
  await Promise.all([
    runContactsFileSerialized(filePath, async () => {
      order.push(1);
      await new Promise((r) => setTimeout(r, 5));
      order.push(2);
    }),
    runContactsFileSerialized(filePath, async () => {
      order.push(3);
    })
  ]);
  assert.deepEqual(order, [1, 2, 3]);
});

test('mergeAndPersistWatchContacts fills dingtalk cas_id from sender in dingtalk session', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'watch-contacts-'));
  const filePath = path.join(dir, 'contacts.json');

  const payload = {
    channels: ['openclaw', 'dingtalk'],
    channel_configs: {
      openclaw: { channel: 'dingtalk', session_key: 'sk1' },
      dingtalk: {
        template_id: 3,
        msg_type: 'text',
        content: 'hi'
      }
    }
  };

  const context = {
    channelId: 'dingtalk',
    senderDingtalkId: 'jinguo.xie',
    senderName: '谢金国'
  };

  const out = await mergeAndPersistWatchContacts(filePath, payload, context);
  assert.equal(out.channel_configs.dingtalk.cas_id, 'jinguo.xie');

  const doc = JSON.parse(await readFile(filePath, 'utf8'));
  assert.equal(doc.senders['dingtalk:jinguo.xie'].defaults.dingtalk.cas_id, 'jinguo.xie');
});

test('mergeAndPersistWatchContacts reuses stored sms phone', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'watch-contacts-'));
  const filePath = path.join(dir, 'contacts.json');

  const doc = emptyContactsDoc();
  doc.senders['dingtalk:u1'] = {
    sender_id: 'u1',
    defaults: { sms: { phone: '13900001111' } },
    updated_at: '2026-01-01T00:00:00.000Z'
  };
  await mkdir(dir, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(doc)}\n`, 'utf8');

  const payload = {
    channels: ['sms'],
    channel_configs: {
      sms: { template_id: 1, content: 'x' }
    }
  };

  const out = await mergeAndPersistWatchContacts(filePath, payload, {
    channelId: 'dingtalk',
    senderDingtalkId: 'u1'
  });
  assert.equal(out.channel_configs.sms.receiver, '13900001111');
});

test('mergeAndPersistNotifyContacts fills call customer_name from sender display name', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'watch-contacts-'));
  const filePath = path.join(dir, 'contacts.json');

  const out = await mergeAndPersistNotifyContacts(
    filePath,
    'call',
    { phone: '13800138000', condition: 'test' },
    {
      channelId: 'dingtalk',
      senderDingtalkId: 'u2',
      senderName: '张三'
    }
  );
  assert.equal(out.customer_name, '张三');
  assert.equal(out.phone, '13800138000');

  const doc = await loadContactsFile(filePath);
  assert.equal(doc.senders['dingtalk:u2'].defaults.call.customer_name, '张三');
});
