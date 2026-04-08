# 渠道与通知参数

## 渠道策略

- `openclaw` 渠道默认必带（用于回当前会话）。
- `email/call/sms/dingtalk` 仅在用户明确要求时添加。

## OpenClaw 会话路由

当 `channels` 包含 `openclaw` 时，`channel_configs.openclaw` 必须可定位当前会话。

常用字段：
- `channel` 或 `source_channel`
- `account_id`
- `session_key`
- `conversation_id` 或 `chat_id`

约束：
- 拿不到路由信息时，不得传空对象 `openclaw: {}` 假装已配置。
- 宿主传入 `context` 时，插件运行时只负责合并 openclaw 路由字段。

## 联系人记忆（Agent/OpenClaw 侧 CSV）

真源：`~/.openclaw/workspace/memory/watch-notify-contacts.csv`

建议表头：

```text
channel,sender_id,sender_name,phone,email,dingtalk_cas_id,customer_name,updated_at,notes
```

取值优先级：
1. 本轮用户明确提供
2. CSV 历史默认值
3. 仍缺必填字段 -> 追问

查询示例：

```bash
rg -n '^dingtalk,jinguo\.xie,' ~/.openclaw/workspace/memory/watch-notify-contacts.csv
```

## `watch.create` 渠道必填

- 选 `email` -> `channel_configs.email.to_address/template_id/title/content`
- 选 `call` -> `channel_configs.call.phone/customer_name/condition`
- 选 `sms` -> `channel_configs.sms.receiver(或phone)/template_id/content`
- 选 `dingtalk` -> `channel_configs.dingtalk.cas_id/template_id/msg_type/content`

## `notify.*` 参数

- `notify.sms`: `receiver(或phone)`、`template_id`、`content`
- `notify.call`: `phone`、`customer_name`、`condition`
- `notify.email`: `to_address`、`template_id`、`title`、`content`
- `notify.dingtalk`: `cas_id`、`template_id`、`msg_type`、`content`

固定模板：

```javascript
// notify.sms
{ receiver: '13800138000', template_id: 90010, content: '测试消息1' }

// notify.call
{ phone: '13800138000', customer_name: 'Demo', condition: '比特币跌幅超过2%' }

// notify.email
{ to_address: 'demo@example.com', template_id: 4, title: '监控提醒', content: '测试消息1' }

// notify.dingtalk
{ cas_id: 'user.dingtalk', template_id: 3, msg_type: 'text', content: '测试消息1' }
```

禁止项：
- 手机号含空格、`+86-`、中划线等非纯数字
- `template_id` 传字符串
- `msg_type` 非 `text/markdown`
- 手动传 `request_id`

成功判定：
- `success = true`
