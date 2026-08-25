# 老板任务面板 (Boss Task Panel)

一个运行在 DeepSeek Harness (DSH) 里的任务面板插件：把「聊天气泡」升级成「任务流水线」。

- **老板角色**：你只负责两件事 —— **发布任务** 和 **验收结果**。
- **插件角色**：领取、规划、开发、复核全部由插件动态调度子代理完成。
- **不再翻聊天记录**：发布任务时插件自动**蒸馏**全部历史会话，把匹配的旧会话关联到任务上；任务每个阶段都有独立 prompt 和**自动读取器**，完成后自动进入「待验收」，面板角标提醒你。

---

## 1. 任务流水线（七个状态 + 彩色状态点）

| Tab | 状态 | 指示点颜色 | 含义 |
| --- | --- | --- | --- |
| 待领取 | `todo` | 灰 | 任务已登记，等待插件领取（或排队等待执行名额） |
| 待澄清 | `clarify` | 粉 | 规划代理发现需求不明确，产出问题清单，等待老板回答后定稿计划 |
| 待确认 | `confirm` | 琥珀 | 规划代理已产出实施计划，等待老板确认（仅当任务关闭「自动确认」时出现） |
| 开发中 | `develop` | 蓝 | 开发代理正在执行 |
| 暂停中 | `paused` | 橙 | 老板点「暂停」后进入；可「继续执行」恢复原阶段，或「重新编辑」调整方向 |
| 复核中 | `review` | 紫 | 自动复核通过（**零遗留问题**）后进入，等待老板**验收** |
| 已完成 | `done` | 绿 | 老板验收通过 |

> **待验收的质量门槛**：复核代理是老板验收前的最后一道关卡——**有任何遗留问题即视为复核未通过**（不允许「通过但带遗留问题」）。复核未通过时面板会自动把问题清单带回开发重试（最多 3 轮），超过上限后任务停在「复核中」并显示红色「不可验收」提示，由老板决定打回 / 重新复核 / 验收。因此出现在「复核中」Tab 的任务默认都是**零问题、可验收**的，卡片上有「可验收 / 有问题」徽标可一眼分辨。

> 每个阶段是任务状态机的一环，迁移由「自动读取器」或老板按钮驱动，见 §3。发布粗需求（方向型任务）时，规划代理会先**澄清**（产出问题清单进「待澄清」）再定稿，避免自行假设。

---

## 2. 老板的工作流

```
发布任务 ──▶ 自动蒸馏历史会话（匹配的旧会话自动挂到任务上）
   │
   ├─ 自动领取 ──▶ 规划代理产出「实施计划 + 问题清单 questions[]」
   │                    │
   │                    ├─ 有澄清问题 ──▶ 待澄清 Tab：老板逐条回答（至少 1 个）
   │                    │                     └─▶ 澄清定稿轮（结合回答重规划）──┐
   │                    └─ 需求清晰（questions 为空）──────────────────────────┤
   │                                                                           ▼
   │                      计划定稿：写入 OpenSpec 产物 specs/proposals/<任务id>/
   │                          ├─ 自动确认(默认) ──▶ 开发代理实施（按 tasks.md 逐项勾选）
   │                          └─ 需确认 ──▶ 待确认 Tab，老板点「确认计划」
   │
   ├─ 开发完成 ──▶ 自动进入复核 ──▶ 复核代理对照验收标准 + tasks.md 逐项自检
   │
   └─ 复核通过 ──▶ 复核中 Tab ──▶ 老板点「验收通过」──▶ 已完成
                        └─ 老板点「打回开发」──▶ 带反馈重回开发

任意阶段（已完成除外）都可点「暂停」──▶ 暂停中 Tab
      ├─「继续执行」──▶ 恢复到暂停前状态（若暂停时正在执行，自动重踢对应阶段）
      └─「重新编辑」──▶ 修改标题/描述/验收标准，旧计划与产物清空，按新方向重新生成
```

发布时的**自动蒸馏**（`tasks.create` 内部）：
1. 用任务标题+描述对全部会话做全文检索（`sessionQuery.searchSessions`）；
2. 取排名前 6 个命中自动挂载，读出会话标题与命中片段（面板「扫描关联会话」最多返回 8 个候选供勾选）；
3. 挂到任务的 `relatedSessions` —— 规划/开发代理开跑前会先读这些历史上下文，等于「接着上次的会话继续做」。

面板里还有「扫描关联会话」按钮：发布前先检索，勾选你想挂载的历史会话，再发布。

---

## 3. 阶段 prompt 与自动读取器

### 每个阶段一个专属 prompt（`index.js` 的 `buildPrompt`）

- **领取/规划 (claim)**：要求子代理先读关联历史会话，以 OpenSpec 风格输出**完整可执行**的实施计划 `{plan, steps, risks, questions}`（steps 编号列出：做什么 / 涉及文件 / 如何验收），明确「不要开始实施」。
- **澄清定稿 (refine)**：老板回答澄清问题后触发的规划轮，结合回答输出最终计划（不再提问）。
- **开发 (develop)**：要求按已确认计划实施并**自测（给出可验证证据）**，按 `tasks.md` 逐项勾选；涉及 UI/页面/表单的任务必须做端到端验证并把关键界面**截图**保存到 `<目标仓库>/specs/proposals/<任务id>/screenshots/`，输出 `{done, summary, changedFiles, screenshots, blocker}`。
- **复核 (review)**：要求对照验收标准**和 tasks.md 逐项核对**实现、实际运行测试与端到端，输出 `{passed, issues, verdict, screenshots}`；**有遗留问题即 passed=false**（issues 为空才可通过），复核截图一并挂到任务。

各阶段都通过 **outputSchema**（JSON Schema）约束子代理的输出，结果结构化、可被读取器机械解析 —— 不靠猜文本。

### 澄清环节（粗需求 → 完整步骤的第一步）

规划代理发现以下任一不明确点时，**必须**在 `questions` 中向老板提问（每问一句话可答，`why` 说明为什么需要），不得自行假设：

1. 验收标准缺失或含糊，无法判断「做完」；
2. 目标仓库 / 改动范围不明；
3. 与现有实现或历史会话的关系不明；
4. 技术方案有明显分叉需要老板拍板；
5. 需求范围过大，需要确认优先级或拆解。

存在问题时任务进入「待澄清」Tab，老板逐条回答（至少 1 个）后触发**澄清定稿轮**；需求清晰时 `questions` 为空数组，直接定稿。整个流程保证：粗方向 → 澄清 → 完整开发步骤 → 才动手。

### OpenSpec 产物（计划定稿时自动写入仓库）

计划定稿时，Host 在目标仓库写入 OpenSpec 风格产物：

```
<repoPath>/specs/proposals/<任务id>/
├── proposal.md   # 背景与动机 / 目标与方案 / 风险 / 验收方式
└── tasks.md      # 编号任务清单，开发代理每完成一项把 [ ] 改为 [x]
```

开发代理与复核代理的 prompt 都会引用 `tasks.md`（逐项实施 / 逐项核对），实现过程与验收都有仓库内可追踪的清单。目标仓库不可写时回退到面板目录，并在卡片上标注「（目标仓库不可写，回退于面板目录）」。

### 自动读取器（每阶段一个，Host 侧自动驱动）

| 读取器 | 触发 | 行为 |
| --- | --- | --- |
| 领取读取器 | 任务进入待领取且有空闲执行名额 | 启动规划代理；产出计划后自动流入下一步 |
| 开发读取器 | 规划完成（自动确认）或老板确认 | 启动开发代理；`done=true` 时自动转入复核 |
| 复核读取器 | 开发代理报告完成 | 启动复核代理；**零遗留问题**才停在「复核中」并点亮面板角标；有遗留问题则带问题清单自动打回开发（≤3 轮） |
| 恢复读取器 | 每 20s 巡检一次 | 检测到开发子会话已不在线（进程重启）时，在任务上标注「可重新执行」 |

并发控制：默认同一时间只跑 **1 个开发任务**，其余自动排队，队列在「待领取」Tab 可见。

### 暂停 / 继续 / 重新编辑

- 任意非「已完成」任务都可在面板点「暂停」进入「暂停中」Tab；若暂停时该任务正在执行，对应子代理会被中断（执行名额随即释放，队列守卫保证暂停任务不会被自动领取）。
- 点「继续执行」恢复到暂停前状态：原「开发中」会重新启动开发代理、「复核中」重新复核、待领取自动重新入队，其余状态停在对应 Tab 等老板操作。
- 点「重新编辑」修改标题 / 描述 / 验收标准：保存后**旧计划与产物（plan/planDraft/steps/risks/summary/reviewReport）会被清空**并在时间线留痕，后续按新方向重新生成。

---

## 4. 面板 UI

- 左侧边栏底部新增「任务面板」按钮（clipboard 图标 + 文字，在设置上方），带**角标数字** = 待领取 + 待确认 + 复核中 + 暂停中。
  > 位置说明：DSH 侧边栏「新会话」按钮下方是内置的会话浏览区（单一内置 Slot），插件没有可插入的槽位；
  > 侧边栏底部 `sidebar.footer.action` 是唯一可追加的入口，故按钮放在底部（设置上方）。如需真正置于「新会话」
  > 下方，需要改动 DSH 自带的 Web 侧边栏源码，可作为后续工程化事项。
- 点击后右侧弹出浮层面板（`shell.overlay`，不遮挡其它列交互）：
  - **宽度拖拽**：默认 720px（7 个状态 Tab 不拥挤），拖拽面板左边缘可调宽度（400–1100px，记忆到 localStorage）。
  - **发布区**：点「发布新任务」按钮（加号图标）弹出居中弹窗（mask 遮罩 + 卡片），表单含标题 / 描述 / 验收标准 / 目标仓库下拉 / 自动执行 / 自动确认 / 扫描关联会话（候选勾选）；发布成功自动关窗并刷新，Esc / 点遮罩 / 关闭按钮均可关闭。
  - **Tab 栏**：待领取 · 待澄清 · 待确认 · 开发中 · 暂停中 · 复核中 · 已完成，各带计数。
  - **任务卡片**：彩色状态点 + 标题 + 状态 + 更新时间 + **结论徽标**（复核中显示「可验收/有问题」、已完成显示「已完成」）；展开箭头为可旋转的 chevron 图标，运行中显示 spinner 图标；展开后可见描述、验收标准、计划、实现摘要、**验收结论横幅**（复核中绿色「复核通过·无遗留问题·可验收」/ 红色「复核未通过·N 个问题·不可验收」、已完成绿色「已验收通过」、开发中蓝色「开发中」）、**任务清单进度条**（tasks.md 勾选数）、复核报告（通过/未通过 + **逐条遗留问题清单**，带「阻断/高/中/低」严重度标签）、**验收截图**（开发/复核代理产出的截图缩略图，点击放大）、会话（点击跳转）、完整时间线；按状态给出图标化操作按钮（领取并规划 / 确认计划 / 打回 / 验收通过 / 重新执行 / 重新复核 / 暂停 / 继续执行 / 重新编辑 / 删除 / 重新打开）。
  - **会话跳转**：每个任务的卡片 meta 行提供可点击的「发布会话」与「执行会话」；展开后的「会话（点击跳转）」区列出全部关联会话——发布会话、规划会话、开发会话、复核会话（子代理会话，Host 记录其父会话用于目录寻址）与蒸馏出的历史会话，点击任意一项直接跳转到目标会话。根会话走 `sessions.open`，子会话优先按 `subagentAddress` + `openSubagent` 打开，失败回退 `open`。
  - **暂停与编辑**：非「已完成」任务可点「暂停」进入「暂停中」Tab；暂停任务提供「继续执行 / 重新编辑 / 删除」，重新编辑在弹窗中修改标题、描述、验收标准。
  - 全部按钮与装饰元素均为**内联 SVG 图标 + 文字**（Feather/Lucide 风格线性图标，随主题变色），不使用 emoji。
  - 面板每 8s 自动刷新，操作后立即刷新。

---

## 5. 架构

```
浏览器 (Client)                          DSH 进程 (Host)
─────────────────                       ─────────────────────────────
sidebar.footer.action 按钮 ──fetch/JSON─▶ webServer 路由 /dsh-task-panel/api/*
shell.overlay 抽屉面板  ◀── JSON 返回 ───   tasks-list / tasks-scan / tasks-create / tasks-action
验收截图 <img>        ◀── 图片字节 ───────   webServer 路由 /dsh-task-panel/files/<taskId>/<name>
                                          │
                                          ├─ sessionQuery.searchSessions  蒸馏历史会话
                                          ├─ subagents.start('spawn')     各阶段子代理
                                          ├─ fs (tasks.json)              持久化
                                          ├─ fs (specs/proposals/<id>/)   OpenSpec 产物写入目标仓库（不可写时回退面板目录）
                                          ├─ fs/node:fs (screenshots/)    收集并下发验收截图
                                          └─ timer.interval               恢复读取器
```

- **持久化**：`tasks.json` 落在项目根目录（写入失败时退回 `/tmp`），进程重启后任务与时间线不丢。
- **数据模型**：见 `tasks.json` —— 每任务含 `id/title/description/acceptance/status/plan/steps/risks/questions/summary/changedFiles/reviewReport/relatedSessions/sourceSessionId/sourceCwd/repoPath/workSessionId/pausedFrom/pausedFromRunning/history/flags/autoRun/autoConfirm`。
- **文件**：`index.js`（Host 半部）、`client.js`（Client 半部，浏览器端静态 bundle）。

---

## 6. 局限与路线图

- **v1**：面板为主入口；`task_publish` 模型工具（在聊天框里直接「发布任务：…」）暂未接入。
- **蒸馏增强**：当前是关键词/全文检索关联；后续可用 LLM 对候选会话做语义摘要后再挂载。
- **通知**：当前靠面板角标 + 计数；后续可接入飞书/邮件等推送。
- **多任务并行**：目前开发阶段串行（1 个名额），可在面板加「并发数」设置。
- **会话续聊**：卡片上的「继续」将支持把老板的后续消息投递到任务的执行会话（`subagents.followup`）。
- **澄清可配置**：目前澄清由规划代理按 prompt 规则自动触发；后续可在发布区加「允许澄清」开关与澄清问题数量上限。
- **OpenSpec 深化**：目前产物为 `proposal.md` + `tasks.md`；后续可对接 `openspec` CLI 做 proposal review 与 spec 归档（`specs/<capability>/spec.md`）。

---

## 7. 安装与开发

### 安装（标准 DSH 插件包）

本目录即标准 DSH 插件包：`index.js`（Host 入口）、`client.js`（浏览器 bundle，`__ModuleLoader__` 协议）、`cordis.patch.yml`（composition 行）、`package.json`（`dsh.bundle` + `dsh.client` 声明）。

1. 在 web profile 中 link 安装：
   - 编辑 `~/.dsh/profiles/web/package.json`：`dependencies` 增加 `"dsh-task-panel": "link:<你的 dsh-task-panel 目录>"`，并在 `dsh.profile.bundles` 末尾追加 `"dsh-task-panel"`；
   - 在 `~/.dsh/profiles/web` 执行 `pnpm install`；
   - 重启 `dsh web`。
2. 刷新页面：侧边栏底部出现「任务面板」按钮 → 发布你的第一个任务。

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
- 改完**重启 `dsh web`** 生效，再点「扫描关联会话」或发布任务即可。

### Q2：面板里没有「任务面板」按钮

**原因**：插件未安装或未在 profile 中启用。

**排查**：

1. 确认 `~/.dsh/profiles/web/package.json` 的 `dependencies` 含 `"dsh-task-panel": "link:<你的 dsh-task-panel 目录>"`，且 `dsh.profile.bundles` 末尾含 `"dsh-task-panel"`；
2. 在 `~/.dsh/profiles/web` 执行 `pnpm install`；
3. 重启 `dsh web` 后刷新页面（侧边栏底部、设置上方应出现带角标的按钮）。
