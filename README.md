# 老板任务面板 (Boss Task Panel)

一个运行在 DeepSeek Harness (DSH) 里的任务面板插件：把「聊天气泡」升级成「任务流水线」。

- **老板角色**：你只负责两件事 —— **发布任务** 和 **验收结果**。
- **插件角色**：领取、规划、开发、复核全部由插件动态调度子代理完成。
- **不再翻聊天记录**：发布任务时插件自动**蒸馏**全部历史会话，把匹配的旧会话关联到任务上；任务每个阶段都有独立 prompt 和**自动读取器**，完成后自动进入「待验收」，面板角标提醒你。

---

## 1. 任务流水线（五个阶段 + 彩色状态点）

| Tab | 状态 | 指示点颜色 | 含义 |
| --- | --- | --- | --- |
| 待领取 | `todo` | 灰 | 任务已登记，等待插件领取（或排队等待执行名额） |
| 待确认 | `confirm` | 琥珀 | 规划代理已产出实施计划，等待老板确认（仅当任务关闭「自动确认」时出现） |
| 开发中 | `develop` | 蓝 | 开发代理正在执行 |
| 复核中 | `review` | 紫 | 自动复核完成，等待老板**验收** |
| 已完成 | `done` | 绿 | 老板验收通过 |

> 每个阶段是任务状态机的一环，迁移由「自动读取器」或老板按钮驱动，见 §3。

---

## 2. 老板的工作流

```
发布任务 ──▶ 自动蒸馏历史会话（匹配的旧会话自动挂到任务上）
   │
   ├─ 自动领取 ──▶ 规划代理产出实施计划
   │                    ├─ 自动确认(默认) ──▶ 开发代理实施
   │                    └─ 需确认 ──▶ 待确认 Tab，老板点「✅ 确认计划」
   │
   ├─ 开发完成 ──▶ 自动进入复核 ──▶ 复核代理对照验收标准自检
   │
   └─ 复核通过 ──▶ 复核中 Tab ──▶ 老板点「✅ 验收通过」──▶ 已完成
                        └─ 老板点「↩️ 打回开发」──▶ 带反馈重回开发
```

发布时的**自动蒸馏**（`tasks.create` 内部）：
1. 用任务标题+描述对全部会话做全文检索（`sessionQuery.searchSessions`）；
2. 取排名前 6 个命中自动挂载，读出会话标题与命中片段（面板「🔍 扫描关联会话」最多返回 8 个候选供勾选）；
3. 挂到任务的 `relatedSessions` —— 规划/开发代理开跑前会先读这些历史上下文，等于「接着上次的会话继续做」。

面板里还有「🔍 扫描关联会话」按钮：发布前先检索，勾选你想挂载的历史会话，再发布。

---

## 3. 阶段 prompt 与自动读取器

### 每个阶段一个专属 prompt（`src/host.js` 的 `buildPrompt`）

- **领取/规划 (claim)**：要求子代理先读关联历史会话，输出实施计划 `{plan, steps, risks}`，明确「不要开始实施」。
- **开发 (develop)**：要求按已确认计划实施，自测，输出 `{done, summary, changedFiles, blocker}`。
- **复核 (review)**：要求对照验收标准复核实现，输出 `{passed, issues, verdict}`。

三个阶段都通过 **outputSchema**（JSON Schema）约束子代理的输出，结果结构化、可被读取器机械解析 —— 不靠猜文本。

### 自动读取器（每阶段一个，Host 侧自动驱动）

| 读取器 | 触发 | 行为 |
| --- | --- | --- |
| 领取读取器 | 任务进入待领取且有空闲执行名额 | 启动规划代理；产出计划后自动流入下一步 |
| 开发读取器 | 规划完成（自动确认）或老板确认 | 启动开发代理；`done=true` 时自动转入复核 |
| 复核读取器 | 开发代理报告完成 | 启动复核代理；产出报告后任务停在「复核中」并点亮面板角标 |
| 恢复读取器 | 每 20s 巡检一次 | 检测到开发子会话已不在线（进程重启）时，在任务上标注「可重新执行」 |

并发控制：默认同一时间只跑 **1 个开发任务**，其余自动排队，队列在「待领取」Tab 可见。

---

## 4. 面板 UI

- 左侧边栏底部新增「📋 任务面板」按钮（在设置上方），带**角标数字** = 待领取 + 待确认 + 复核中。
  > 位置说明：DSH 侧边栏「新会话」按钮下方是内置的会话浏览区（单一内置 Slot），插件没有可插入的槽位；
  > 侧边栏底部 `sidebar.footer.action` 是唯一可追加的入口，故按钮放在底部（设置上方）。如需真正置于「新会话」
  > 下方，需要改动 DSH 自带的 Web 侧边栏源码，可作为后续工程化事项。
- 点击后右侧弹出浮层面板（`shell.overlay`，不遮挡其它列交互）：
  - **宽度拖拽**：拖拽面板左边缘可调宽度（320–900px，记忆到 localStorage）。
  - **发布区**：标题 / 描述 / 验收标准 / 自动执行开关 / 自动确认开关 / 扫描关联会话。
  - **Tab 栏**：待领取 · 待确认 · 开发中 · 复核中 · 已完成，各带计数。
  - **任务卡片**：彩色状态点 + 标题 + 状态 + 更新时间；展开后可见描述、验收标准、计划、实现摘要、复核报告、关联会话（点击**直接跳转到该历史会话**）、完整时间线；按状态给出操作按钮（领取并规划 / 确认计划 / 打回 / 验收通过 / 重新执行 / 删除 / 重新打开）。
  - 面板每 8s 自动刷新，操作后立即刷新。
  - **📖 README 区**：抽屉内发布区上方有可折叠「📖 README / 使用说明」区（面板定位、五阶段状态点图例、自动蒸馏说明、操作要点、持久化与角标说明），默认收起，点击展开；仅展开/收起自身，与发布区、Tab、卡片交互互不影响。

---

## 5. 架构

```
浏览器 (Client)                          DSH 进程 (Host)
─────────────────                       ─────────────────────────────
sidebar.footer.action 按钮 ──fetch/JSON─▶ webServer 路由 /dsh-task-panel/api/*
shell.overlay 抽屉面板  ◀── JSON 返回 ───   tasks-list / tasks-scan / tasks-create / tasks-action
                                          │
                                          ├─ sessionQuery.searchSessions  蒸馏历史会话
                                          ├─ subagents.start('spawn')     各阶段子代理
                                          ├─ fs (tasks.json)              持久化
                                          └─ timer.interval               恢复读取器
```

- **持久化**：`tasks.json` 落在项目根目录（写入失败时退回 `/tmp`），进程重启后任务与时间线不丢。
- **数据模型**：见 `tasks.json` —— 每任务含 `id/title/description/acceptance/status/plan/steps/summary/changedFiles/reviewReport/relatedSessions/sourceSessionId/workSessionId/history/flags/autoRun/autoConfirm`。
- **文件**：`src/host.js`（Host 半部）、`src/client.js`（Client 半部）与动态插件源码保持一致。

---

## 6. 局限与路线图

- **v1**：面板为主入口；`task_publish` 模型工具（在聊天框里直接「发布任务：…」）暂未接入。
- **蒸馏增强**：当前是关键词/全文检索关联；后续可用 LLM 对候选会话做语义摘要后再挂载。
- **通知**：当前靠面板角标 + 计数；后续可接入飞书/邮件等推送。
- **多任务并行**：目前开发阶段串行（1 个名额），可在面板加「并发数」设置。
- **会话续聊**：卡片上的「继续」将支持把老板的后续消息投递到任务的执行会话（`subagents.followup`）。

---

## 7. 安装与开发

### 安装（标准 DSH 插件包）

本目录即标准 DSH 插件包：`index.js`（Host 入口）、`client.js`（浏览器 bundle，`__ModuleLoader__` 协议）、`cordis.patch.yml`（composition 行）、`package.json`（`dsh.bundle` + `dsh.client` 声明）。

1. 在 web profile 中 link 安装：
   - 编辑 `~/.dsh/profiles/web/package.json`：`dependencies` 增加 `"dsh-task-panel": "link:<你的 dsh-task-panel 目录>"`，并在 `dsh.profile.bundles` 末尾追加 `"dsh-task-panel"`；
   - 在 `~/.dsh/profiles/web` 执行 `pnpm install`；
   - 重启 `dsh web`。
2. 刷新页面：侧边栏底部出现「📋 任务面板」按钮 → 发布你的第一个任务。

### 开发

- 改 Host（`index.js`）或前端（`client.js`）后重启 `dsh web` 生效；`tasks.json` 是运行时数据（gitignored，插件会自动创建）。
- Host 提供 HTTP API：`POST /dsh-task-panel/api/tasks-list | tasks-scan | tasks-create | tasks-action`。

---

## 8. 常见问题（QA）

### Q1：「检索失败: session search is disabled: this deployment configures the session-query index with openAt "never"」

**原因**：DSH 的全文会话搜索默认是**关闭的（opt-in）**。`dsh-base` / `dsh-web-app` 两个 bundle 层把 `session-query-sqlite` 配成 `openAt: never`（`path` 为 `:memory:`），此时 `ctx.sessionQuery` 仍挂载，但 `searchSessions` / `searchEvents` 会直接抛 `SESSION_QUERY_SEARCH_DISABLED`，且 node:sqlite 不会被导入。任务面板的「自动蒸馏 / 扫描关联会话」调用 `sessionQuery.searchSessions`，因此报错（见 `index.js` 中 `[task-panel] 检索失败:`）。

**修复**：在 profile 的 patch 层（`~/.dsh/profiles/web/cordis.patch.yml`，在所有 bundle 层之后应用）覆盖该行 —— patch 会**整体替换** config，所以要连同 `path` 一起重申：

```yaml
- id: session-query-sqlite
  config:
    path: ~/.dsh/session-query/index.sqlite
    openAt: first-search
```

- `openAt` 取值：`startup`（服务激活时打开）/ `first-search`（推荐，推迟到首次搜索，Node 22 启动输出保持干净）/ `never`（关闭，默认）。
- `path` 建议用持久化路径；默认 `:memory:` 首次搜索时会从 JSONL 会话日志重建索引，但每次进程重启后都要重建。
- 改完**重启 `dsh web`** 生效，再点「🔍 扫描关联会话」或发布任务即可。

### Q2：面板里没有「📋 任务面板」按钮

**原因**：插件未安装或未在 profile 中启用。

**排查**：

1. 确认 `~/.dsh/profiles/web/package.json` 的 `dependencies` 含 `"dsh-task-panel": "link:<你的 dsh-task-panel 目录>"`，且 `dsh.profile.bundles` 末尾含 `"dsh-task-panel"`；
2. 在 `~/.dsh/profiles/web` 执行 `pnpm install`；
3. 重启 `dsh web` 后刷新页面（侧边栏底部、设置上方应出现带角标的按钮）。
