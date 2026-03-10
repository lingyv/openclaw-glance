# 安装文档拆分设计（daemon vs OpenClaw 插件）

日期：2026-03-10  
状态：已确认

## 目标

将现有单一安装引导拆分为两份文档，分别服务两种运行模式，并将 `glance-watch` skill 明确为两种模式的必做前置步骤。

## 文档范围

- 新增：`docs/daemon-install-guide.md`
  - 面向 Claude Code/Codex 使用者
  - 仅覆盖 daemon 模式
- 重写：`docs/openclaw-install-guide.md`
  - 面向 OpenClaw 插件模式
  - 仅覆盖插件安装/启用/配置/运行

## 关键约束

- 两份文档均要求先安装 `glance-watch` skill（必做）
- 避免混写：daemon 文档不讲 OpenClaw 插件加载流程；插件文档不讲 Claude/Codex daemon 操作
- 两份文档互相引用但不复制完整步骤

## 章节设计

### daemon-install-guide.md

1. 适用范围（Claude Code/Codex）
2. 前置条件
3. 必做：安装 `glance-watch` skill
4. 必做：启动 daemon
5. 必做：在 agent 流程中使用 skill + daemon
6. 单活冲突与常见排障
7. 快速验收清单

### openclaw-install-guide.md

1. 插件模式概览
2. 前置条件
3. 必做：安装 `glance-watch` skill
4. 必做：安装并启用 OpenClaw 插件（含 `plugins.allow`）
5. 必做：配置并启动 channel
6. 插件模式验证与排障

## 验收标准

- `docs/daemon-install-guide.md` 存在且内容仅针对 daemon + Claude/Codex
- `docs/openclaw-install-guide.md` 不再出现 SDK/Adapter 旧初始化主流程
- 两份文档都把 skill 标注为“必做”
