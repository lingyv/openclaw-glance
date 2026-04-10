# Docs Split (Daemon + Plugin) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 拆分并重写安装文档，形成 daemon 专用指南与 OpenClaw 插件专用指南，并统一将 `glance-watch` skill 设为必做步骤。

**Architecture:** 保留 `docs/openclaw-install-guide.md` 作为插件模式主文档，新增 `docs/daemon-install-guide.md` 作为 Claude Code/Codex daemon 专用文档。两文档互链但不混写，避免读者路径冲突。

**Tech Stack:** Markdown, npm/node command examples, OpenClaw plugin conventions

---

### Task 1: 新增 daemon 专用安装指南

**Files:**
- Create: `docs/daemon-install-guide.md`
- Modify: `README.md`

**Step 1: Write the failing check**

Run: `test -f docs/daemon-install-guide.md`  
Expected: FAIL (file missing)

**Step 2: Create minimal document**

写入以下内容块：
- 适用范围（仅 Claude Code/Codex）
- 前置条件
- 必做：安装 `glance-watch` skill
- 必做：启动 daemon
- 单活冲突/排障
- 快速验收清单

**Step 3: Run validation**

Run: `rg "必做|glance-watch|daemon" docs/daemon-install-guide.md`  
Expected: 命中关键段落

**Step 4: Commit**

```bash
git add docs/daemon-install-guide.md README.md
git commit -m "docs: add daemon install guide for claude/codex workflow"
```

### Task 2: 重写 OpenClaw 插件安装指南

**Files:**
- Modify: `docs/openclaw-install-guide.md`

**Step 1: Write the failing check**

Run: `rg "OpenClawPluginAdapter|adapter.start|submitWatchDemand" docs/openclaw-install-guide.md`  
Expected: 命中旧 SDK/Adapter 路径（待移除）

**Step 2: Rewrite document**

保留插件模式内容并重写为：
- 插件模式概览
- 必做：安装 `glance-watch` skill
- 必做：插件安装与 `plugins.allow`
- 必做：配置与启动
- 验证与排障

**Step 3: Re-run checks**

Run: `rg "OpenClawPluginAdapter|adapter.start|submitWatchDemand" docs/openclaw-install-guide.md`  
Expected: 无命中

Run: `rg "glance-watch|必做" docs/openclaw-install-guide.md`  
Expected: 命中 skill 必做段落

**Step 4: Commit**

```bash
git add docs/openclaw-install-guide.md
git commit -m "docs: rewrite openclaw install guide for plugin mode"
```

### Task 3: 全文档一致性校验

**Files:**
- Modify: `README.md`（如需补链接）

**Step 1: Run checks**

Run: `rg "install-guide" README.md docs/*.md`  
Expected: 两个安装文档路径可发现

Run: `git diff -- docs/daemon-install-guide.md docs/openclaw-install-guide.md README.md`  
Expected: 仅文档修改，无代码变更

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: align install guide cross-links"
```
