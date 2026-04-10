# 直连通知（notify_*）

## 适用工具

- `notify_sms`
- `notify_call`
- `notify_email`
- `notify_dingtalk`

## 统一规则

- 仅在用户明确要求时调用直连通知。
- 不手动传 `request_id`。
- 返回 `success === true` 视为成功。
- 失败时直接反馈 `code/error/hint`，不静默重试。
- 联系人记忆规则同时适用于：
  - `notify_*`
  - `watch_create`（当渠道含 `call/sms/email/dingtalk`）

## 参数要求

### `notify_sms`
- `receiver`（或 `phone`）
- `template_id`
- `content`

### `notify_call`
- `phone`
- `customer_name`
- `condition`

### `notify_email`
- `to_address`
- `template_id`
- `title`
- `content`

### `notify_dingtalk`
- `cas_id`
- `template_id`
- `msg_type`（`text` 或 `markdown`）
- `content`

## 联系人记忆（强约束）

联系人 CSV：`~/.openclaw/workspace/memory/watch-notify-contacts.csv`

执行要求：
1. 触发条件：`notify_*` 或 `watch_create` 使用 `call/sms/email/dingtalk` 时，调用前必须查 CSV。
2. 文件初始化：CSV 不存在时，先创建文件并写入标准表头后再查询。
3. 表头修复：CSV 存在但无表头时，先补表头再继续。
4. 权限异常：若无权限读/写该 CSV，先向用户申请权限后再执行，不静默降级。
5. 取值优先级：本轮用户明确提供 > CSV 历史值 > 追问。
6. 回写条件：调用成功且联系方式有更新时，必须回写 CSV。
7. 文件唯一性：只认该 CSV，不读取其他联系人文件。

建议表头：

```text
channel,sender_id,sender_name,phone,email,dingtalk_cas_id,customer_name,updated_at,notes
```

查询示例：

```bash
rg -n '^sms,jinguo\.xie,' ~/.openclaw/workspace/memory/watch-notify-contacts.csv
```

回写要求：
- 已有同一 `(channel, sender_id)`：更新该行，不重复追加
- 不存在：按表头顺序追加
- `updated_at`：写 ISO-8601 时间

## 常见禁止项

- 手机号含空格、中划线、`+86-` 等非纯数字
- `template_id` 传字符串
- `msg_type` 不是 `text/markdown`

## `watch_create` 渠道必填映射

- 选 `email`：`channel_configs.email.to_address/template_id/title/content`
- 选 `call`：`channel_configs.call.phone/customer_name/condition`
- 选 `sms`：`channel_configs.sms.receiver(或phone)/template_id/content`
- 选 `dingtalk`：`channel_configs.dingtalk.cas_id/template_id/msg_type/content`
