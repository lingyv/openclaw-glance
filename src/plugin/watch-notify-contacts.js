import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  deriveOpenclawRouting,
  mergeContextMetadata,
  pickFirstSenderIdentifier,
  pickFirstString,
  unwrapSenderContextObject
} from '../openclawRouting.js';

/**
 * 同一联系人文件读改写串行化，避免并发丢更新。
 * 仅单进程内有效；多进程同时写仍可能竞态，需外部协调或独占部署。
 */
const contactFileQueues = new Map();

export function runContactsFileSerialized(filePath, fn) {
  const key = path.resolve(String(filePath));
  const prev = contactFileQueues.get(key) || Promise.resolve();
  const next = prev.then(
    () => fn(),
    () => fn()
  );
  contactFileQueues.set(key, next);
  return next.finally(() => {
    if (contactFileQueues.get(key) === next) {
      contactFileQueues.delete(key);
    }
  });
}

/**
 * 从 OpenClaw / 宿主上下文解析发送者维度主键（channel:sender_id）。
 * 与 OpenClaw `buildSenderContext` 对齐：优先 `context.senderContext`，其次顶层 `senderId`；
 * 仍兼容 `senderDingtalkId`、metadata、路由字段等历史来源。
 */
export function extractSenderContext({ context = {}, params = {} } = {}) {
  const metadata = mergeContextMetadata(context);
  const sc = unwrapSenderContextObject(context);
  const routing = deriveOpenclawRouting({ params, context });

  const channelRaw = pickFirstString(
    sc.channel,
    sc.sourceChannel,
    sc.source_channel,
    routing.channel,
    params?.source_channel,
    metadata?.channel,
    metadata?.channelId,
    context?.channel,
    context?.channelId
  );
  const channel = String(channelRaw || 'unknown')
    .toLowerCase()
    .trim();

  const senderId = pickFirstSenderIdentifier(
    sc.senderId,
    sc.sender_id,
    sc.userId,
    sc.user_id,
    sc.casId,
    sc.cas_id,
    context.senderId,
    context.sender_id,
    context.userId,
    context.user_id,
    context.casId,
    context.cas_id,
    metadata.senderId,
    metadata.sender_id,
    metadata.senderDingtalkId,
    metadata.sender_dingtalk_id,
    context.senderDingtalkId,
    metadata.userId,
    metadata.user_id,
    metadata.openId,
    params.senderId,
    params.sender_id
  );

  const senderName = pickFirstString(
    sc.senderName,
    sc.sender_name,
    sc.displayName,
    sc.display_name,
    sc.nickname,
    metadata.senderName,
    metadata.sender_name,
    metadata.displayName,
    metadata.display_name,
    metadata.nickname,
    context.senderName,
    context.displayName
  );

  if (!senderId) {
    return { channel, senderId: null, senderName: senderName || null, senderKey: null };
  }
  const id = String(senderId).trim();
  const senderKey = `${channel}:${id}`;
  return { channel, senderId: id, senderName: senderName || null, senderKey };
}

/**
 * 与 OpenClaw 侧 `buildSenderContext(context)` 单参用法兼容的别名。
 */
export function buildSenderContext(context = {}, params = {}) {
  return extractSenderContext({ context, params });
}

/** @returns {string|null} 仅数字，含简单 +86 剥离 */
export function normalizePhone(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/\s+/g, '');
  if (!s) return null;
  s = s.replace(/^\+86/, '').replace(/^86/, '');
  const digits = s.replace(/\D/g, '');
  if (digits.length === 11) return digits;
  if (digits.length === 13 && digits.startsWith('86')) return digits.slice(2);
  return null;
}

/** @returns {string|null} 非空 trim，用于钉钉 cas_id 等 */
export function normalizeCasId(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s || null;
}

/** @returns {string|null} 合法邮箱则返回 trim 后地址 */
export function normalizeEmail(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}

export function emptyContactsDoc() {
  return { version: 1, senders: {} };
}

async function backupCorruptContactsFile(filePath, raw) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(dir, `${base}.corrupt.${stamp}.bak`);
  await mkdir(dir, { recursive: true });
  await writeFile(backupPath, raw, 'utf8');
}

export async function loadContactsFile(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch (_parseErr) {
      await backupCorruptContactsFile(filePath, raw);
      return emptyContactsDoc();
    }
    if (!data || typeof data !== 'object') return emptyContactsDoc();
    if (!data.senders || typeof data.senders !== 'object') {
      data.senders = {};
    }
    if (data.version == null) data.version = 1;
    return data;
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      return emptyContactsDoc();
    }
    throw err;
  }
}

export async function saveContactsFile(filePath, doc) {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  const text = `${JSON.stringify(doc, null, 2)}\n`;
  await writeFile(filePath, text, 'utf8');
}

function getEntry(doc, senderKey) {
  if (!senderKey || !doc?.senders) return null;
  return doc.senders[senderKey] || null;
}

function touchEntry(doc, senderKey, senderId, senderName) {
  if (!senderKey) return;
  if (!doc.senders) doc.senders = {};
  const prev = doc.senders[senderKey] || {
    sender_id: senderId,
    sender_name: senderName,
    defaults: {},
    updated_at: null
  };
  doc.senders[senderKey] = {
    ...prev,
    sender_id: senderId || prev.sender_id,
    sender_name: senderName || prev.sender_name || undefined
  };
}

/**
 * 宿主未带会话 channel 时，用已合并的 openclaw 路由里的 channel 推断记忆主键，减少 unknown:<id> 串号。
 */
function refineSessionFromOpenclawConfig(ctx, openclaw) {
  let { channel, senderId, senderName, senderKey } = ctx;
  if (channel !== 'unknown' || !senderId) return ctx;
  if (!openclaw || typeof openclaw !== 'object') return ctx;
  const hint = pickFirstString(
    openclaw.channel,
    openclaw.source_channel,
    openclaw.sourceChannel
  );
  if (!hint) return ctx;
  const c = String(hint).toLowerCase().trim();
  if (!c || c === 'unknown') return ctx;
  const id = String(senderId).trim();
  return {
    channel: c,
    senderId: id,
    senderName,
    senderKey: `${c}:${id}`
  };
}

/**
 * 合并 watch.create / submitWatchDemand 的 channel_configs。
 * 缺字段时按记忆与钉钉 sender_id 规则补全；有 senderKey 时回写记忆。
 */
export async function mergeAndPersistWatchContacts(filePath, mergedPayload, context) {
  const channels = Array.isArray(mergedPayload?.channels)
    ? mergedPayload.channels.map((x) => String(x).toLowerCase().trim()).filter(Boolean)
    : [];
  if (channels.length === 0) {
    return mergedPayload;
  }

  return runContactsFileSerialized(filePath, async () => {
  let senderCtx = extractSenderContext({
    context,
    params: mergedPayload || {}
  });
  senderCtx = refineSessionFromOpenclawConfig(
    senderCtx,
    mergedPayload?.channel_configs?.openclaw
  );
  const { senderKey, senderId, senderName, channel: sessionChannel } = senderCtx;

  let doc = await loadContactsFile(filePath);
  const entry = getEntry(doc, senderKey);
  const defaults = entry?.defaults && typeof entry.defaults === 'object' ? entry.defaults : {};

  const channelConfigs = { ...(mergedPayload.channel_configs || {}) };

  const isDingtalkSession = sessionChannel === 'dingtalk';

  if (channels.includes('sms')) {
    const sms = { ...(channelConfigs.sms && typeof channelConfigs.sms === 'object' ? channelConfigs.sms : {}) };
    let phone = normalizePhone(pickFirstString(sms.receiver, sms.phone));
    if (!phone && defaults.sms?.phone) {
      phone = normalizePhone(defaults.sms.phone);
      if (phone) {
        sms.receiver = phone;
        if (sms.phone != null) delete sms.phone;
      }
    } else if (phone) {
      sms.receiver = phone;
    }
    channelConfigs.sms = sms;
  }

  if (channels.includes('dingtalk')) {
    const dt = {
      ...(channelConfigs.dingtalk && typeof channelConfigs.dingtalk === 'object'
        ? channelConfigs.dingtalk
        : {})
    };
    const casId =
      normalizeCasId(pickFirstString(dt.cas_id, dt.casId)) ||
      normalizeCasId(defaults.dingtalk?.cas_id) ||
      (isDingtalkSession ? normalizeCasId(senderId) : null);
    if (casId) {
      dt.cas_id = casId;
      if (dt.casId != null) delete dt.casId;
    }
    channelConfigs.dingtalk = dt;
  }

  if (channels.includes('email')) {
    const em = {
      ...(channelConfigs.email && typeof channelConfigs.email === 'object' ? channelConfigs.email : {})
    };
    const addr =
      normalizeEmail(pickFirstString(em.to_address, em.toAddress)) ||
      normalizeEmail(defaults.email?.to_address);
    if (addr) {
      em.to_address = addr;
      if (em.toAddress != null) delete em.toAddress;
    }
    channelConfigs.email = em;
  }

  if (channels.includes('call')) {
    const ca = {
      ...(channelConfigs.call && typeof channelConfigs.call === 'object' ? channelConfigs.call : {})
    };
    let phone = normalizePhone(pickFirstString(ca.phone, ca.receiver));
    if (!phone && defaults.call?.phone) {
      phone = normalizePhone(defaults.call.phone);
    }
    if (phone) ca.phone = phone;

    let name = pickFirstString(ca.customer_name, ca.customerName);
    if (!name && defaults.call?.customer_name) {
      name = String(defaults.call.customer_name).trim();
    }
    if (!name && senderName) {
      name = String(senderName).trim();
    }
    if (name) {
      ca.customer_name = name;
      if (ca.customerName != null) delete ca.customerName;
    }
    channelConfigs.call = ca;
  }

  const next = { ...mergedPayload, channel_configs: channelConfigs };

  if (senderKey && senderId) {
    touchEntry(doc, senderKey, senderId, senderName);
    const patch = {};
    const smsCfg = channelConfigs.sms;
    const pSms = normalizePhone(pickFirstString(smsCfg?.receiver, smsCfg?.phone));
    if (pSms) patch.sms = { phone: pSms };

    const dtCfg = channelConfigs.dingtalk;
    const cas = normalizeCasId(pickFirstString(dtCfg?.cas_id, dtCfg?.casId));
    if (cas) patch.dingtalk = { cas_id: cas };

    const emCfg = channelConfigs.email;
    const to = normalizeEmail(pickFirstString(emCfg?.to_address, emCfg?.toAddress));
    if (to) patch.email = { to_address: to };

    const caCfg = channelConfigs.call;
    const cPhone = normalizePhone(pickFirstString(caCfg?.phone, caCfg?.receiver));
    const cName = pickFirstString(caCfg?.customer_name, caCfg?.customerName);
    if (cPhone || cName) {
      patch.call = {
        ...(cPhone ? { phone: cPhone } : {}),
        ...(cName ? { customer_name: String(cName).trim() } : {})
      };
    }

    if (Object.keys(patch).length > 0) {
      const cur = doc.senders[senderKey];
      cur.defaults = { ...(cur.defaults || {}), ...patch };
      cur.updated_at = new Date().toISOString();
      await saveContactsFile(filePath, doc);
    }
  }

  return next;
  });
}

/**
 * 合并 notify.send 单渠道 payload。
 */
export async function mergeAndPersistNotifyContacts(filePath, notifyChannel, payload, context) {
  const ch = String(notifyChannel || '')
    .toLowerCase()
    .trim();
  const allowedNotify = new Set(['sms', 'email', 'call', 'dingtalk']);
  if (!ch || !allowedNotify.has(ch)) {
    return { ...(payload && typeof payload === 'object' ? payload : {}) };
  }

  return runContactsFileSerialized(filePath, async () => {
  let senderCtx = extractSenderContext({
    context,
    params: payload || {}
  });
  const routingHint = deriveOpenclawRouting({ params: payload || {}, context });
  senderCtx = refineSessionFromOpenclawConfig(
    senderCtx,
    routingHint.channel ? { channel: routingHint.channel } : null
  );
  const { senderKey, senderId, senderName, channel: sessionChannel } = senderCtx;
  const out = { ...(payload && typeof payload === 'object' ? payload : {}) };

  let doc = await loadContactsFile(filePath);
  const entry = getEntry(doc, senderKey);
  const defaults = entry?.defaults && typeof entry.defaults === 'object' ? entry.defaults : {};
  const isDingtalkSession = sessionChannel === 'dingtalk';

  if (ch === 'sms') {
    let phone = normalizePhone(pickFirstString(out.receiver, out.phone));
    if (!phone && defaults.sms?.phone) {
      phone = normalizePhone(defaults.sms.phone);
    }
    if (phone) {
      out.receiver = phone;
      if (out.phone != null) delete out.phone;
    }
  } else if (ch === 'dingtalk') {
    const casId =
      normalizeCasId(pickFirstString(out.cas_id, out.casId)) ||
      normalizeCasId(defaults.dingtalk?.cas_id) ||
      (isDingtalkSession ? normalizeCasId(senderId) : null);
    if (casId) {
      out.cas_id = casId;
      if (out.casId != null) delete out.casId;
    }
  } else if (ch === 'email') {
    const addr =
      normalizeEmail(pickFirstString(out.to_address, out.toAddress)) ||
      normalizeEmail(defaults.email?.to_address);
    if (addr) {
      out.to_address = addr;
      if (out.toAddress != null) delete out.toAddress;
    }
  } else if (ch === 'call') {
    let phone = normalizePhone(pickFirstString(out.phone, out.receiver));
    if (!phone && defaults.call?.phone) {
      phone = normalizePhone(defaults.call.phone);
    }
    if (phone) out.phone = phone;

    let name = pickFirstString(out.customer_name, out.customerName);
    if (!name && defaults.call?.customer_name) {
      name = String(defaults.call.customer_name).trim();
    }
    if (!name && senderName) {
      name = String(senderName).trim();
    }
    if (name) {
      out.customer_name = name;
      if (out.customerName != null) delete out.customerName;
    }
  }

  if (senderKey && senderId) {
    touchEntry(doc, senderKey, senderId, senderName);
    const patch = {};
    if (ch === 'sms') {
      const p = normalizePhone(pickFirstString(out.receiver, out.phone));
      if (p) patch.sms = { phone: p };
    } else if (ch === 'dingtalk') {
      const c = normalizeCasId(pickFirstString(out.cas_id, out.casId));
      if (c) patch.dingtalk = { cas_id: c };
    } else if (ch === 'email') {
      const t = normalizeEmail(pickFirstString(out.to_address, out.toAddress));
      if (t) patch.email = { to_address: t };
    } else if (ch === 'call') {
      const p = normalizePhone(pickFirstString(out.phone, out.receiver));
      const n = pickFirstString(out.customer_name, out.customerName);
      if (p || n) {
        patch.call = {
          ...(p ? { phone: p } : {}),
          ...(n ? { customer_name: String(n).trim() } : {})
        };
      }
    }
    if (Object.keys(patch).length > 0) {
      const cur = doc.senders[senderKey];
      cur.defaults = { ...(cur.defaults || {}), ...patch };
      cur.updated_at = new Date().toISOString();
      await saveContactsFile(filePath, doc);
    }
  }

  return out;
  });
}
