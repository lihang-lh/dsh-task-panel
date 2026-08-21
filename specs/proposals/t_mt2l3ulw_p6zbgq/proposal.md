# 提案：任务面板的UI 帮我优化

- 任务 ID：`t_mt2l3ulw_p6zbgq`
- 状态：已规划（由任务面板维护）
- 创建时间：2026-08-21T06:44:41.780Z
- 来源会话：`session-5c105e50-d45e-4bc9-aba1-09b3d649a96a`
- 目标仓库：`/Users/lihang/gitlab1/dsh-task-panel`

## 背景与动机
按钮不要用 emoji 来做，可以去 iconfont 中抓一些好看的icon 来用，还有这任务发布区使用按钮，按钮点击后用dialog 来发布

## 目标与方案
在 dsh-task-panel 插件内做一轮「图标化 + 弹窗发布 + 暂停/编辑」改造，全部改动只落在目标仓库 /Users/lihang/gitlab1/dsh-task-panel：① 在 client.js 内置一套 Feather/Lucide 风格线性 stroke SVG 图标（24×24、currentColor、strokeWidth 2，与现有侧栏图标一致），通过 Icon 辅助组件以 React.createElement 内联渲染，实现零外部依赖；② 发布区由内联折叠区改为「发布新任务」按钮 + 弹窗（mask 遮罩 + 居中卡片，复用标题/描述/验收/仓库/自动执行/自动确认/扫描勾选表单，Esc/遮罩/✕ 均可关闭，发布成功自动关窗并刷新），用统一的 store.modal 管理弹窗优先级（弹窗打开时 Esc 先关弹窗再关面板）；③ 全部按钮（领取/删除/澄清/确认/打回/验收/重新执行/重新打开）与装饰性 emoji（📋⏳✅❌⚠️🔄✕▴▾ 等）替换为图标+文字，卡片展开箭头改为可旋转的 SVG chevron、运行中改为 spinner 图标；④ 服务端（index.js）新增 paused 状态（标签「暂停中」、插入 develop 之后的 Tab 序、counts/loadState/toSummary 归一化），新增 pause/resume 动作（pause 记录 pausedFrom、运行中阶段经 task.flags.abort 中断，resume 恢复到暂停前状态、暂停时在跑则重踢对应阶段），扩展已有 edit 动作仅对 paused 任务开放并清空旧 plan/planDraft/steps/risks/summary/reviewReport 以便按新方向重新生成；⑤ 客户端新增暂停 Tab、暂停任务的「继续执行/重新编辑/删除」按钮与编辑弹窗；⑥ README 同步状态表、流程图与 UI 说明并清除文档 emoji；⑦ 重启 dsh web（managed background job）后按验收清单逐项人工验证并留截图证据。

## 实施步骤
- 见 [tasks.md](./tasks.md)（9 个编号任务）

## 风险
- client.js 是手写无构建单文件 bundle（React.createElement 无 JSX），图标组件与弹窗改造量大、手写易错：用 node --check 每步校验语法，小步增量实施，弹窗 z-index 与抽屉/遮罩层叠关系需专门处理（dialog 在抽屉之上、互不干扰）。
- client.js/index.js 改动需重启 dsh web 才生效（README 明确），重启会中断当前 GUI：用 managed background job 管理并在页面刷新后验证；若 3080 端口有他人运行中的 dsh web 实例需先确认归属，避免误杀。
- 暂停中断运行中的子代理存在竞态：abort 后 runDevelop/runClaim 的 finally 会释放名额并 kick(maybeAdvanceQueue)，若此时任务已被 pause，需以 paused 状态为守卫防止 finally/队列把任务再次流转（在 runner 的 finally 里先检查 task.status 是否为 paused）。
- 历史 tasks.json 中的任务没有 pausedFrom/pausedFromRunning 字段：loadState 需归一化兜底（默认 '' / false），否则 resume 时状态恢复异常；order/labels/colors 由 tasks-list 下发，旧浏览器缓存需刷新页面才生效。
- 图标风格一致性：iconfont 图标风格混杂（线性/填充/粗细不一）会破坏视觉；固定为 Feather/Lucide 风格线性 stroke 图标（24×24、strokeWidth 2、currentColor、MIT/ISC 许可），与现有侧栏图标一致，避免混用。
- 编辑清空旧产物（plan/steps/summary/reviewReport）属破坏性操作：仅对 paused 状态开放编辑以缩小影响面，清空前写历史时间线 note 留痕；若老板希望编辑后保留旧计划对比，需调整清理策略（列为可选项）。
- 角标口径变更（badge 计入 paused）会改变老板对「待处理数」的预期：README 同步说明；若老板不需要，仅需改 client.js 一行。
- 验收以人工在 DSH web 上确认为主、无自动化：用 grep 静态检查（无 emoji、无外部 URL）+ 截图证据补强，明暗主题与宽度拖拽属交互行为只能人工/截图确认。

## 验收方式
（任务未单独填写验收标准，以下方澄清问答为准）

## 澄清问答（老板确认）
- Q1：验收标准未指定，我提议以这份清单为准：① 面板所有按钮不再含 emoji/▸▾ 字符，统一为 iconfont 图标+文字；② 点「发布新任务」按钮弹出弹窗，填表发布成功、任务进入待领取且弹窗自动关闭，Esc/遮罩/✕ 均可关闭；③ 全部状态操作按钮（领取/澄清/确认/打回/验收/重新执行/删除）图标替换后功能不变；④ 明暗主题与宽度拖拽正常；⑤ 不引入外部网络依赖（图标全部内联）。可以吗？ → 确认
- Q2：iconfont 图标用哪种引入方式？A. 内联 SVG（把 iconfont 选中的图标 path 内联进 client.js，零外部依赖、CSP 安全、离线可用，推荐）；B. 运行时加载 iconfont CDN 字体/css（需联网，可能被 DSH web 的 CSP 拦截）；C. 把字体文件放进插件目录由 DSH 托管（DSH 对插件静态资源的托管未确认，风险最高）。 → A
- Q3：替换范围是只改『按钮』上的 emoji，还是连装饰性文字 emoji（头部标题 📋、运行中 ⏳、复核结论 ✅/❌、持久化警告 ⚠️）也一并替换为图标以保持视觉一致？ → 全部都修改，另外每个任务需要增加暂停的状态，暂停后支持重新编辑来调整方向，