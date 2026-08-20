// =============================================================
// 老板任务面板 · Host 半部
// 运行环境：DSH 动态 Cordis 插件沙箱（plain JavaScript，无 import）
// 依赖服务：fs / sessionQuery / subagents / agents / timer
// =============================================================

return {
  inject: ['timer'],
  async apply(ctx) {
    const fs = ctx.get('fs')
    const sq = ctx.get('sessionQuery')
    const subagents = ctx.get('subagents')
    const agents = ctx.get('agents')
    if (fs === undefined || sq === undefined || subagents === undefined || agents === undefined) {
      console.error('[task-panel] 缺少必要服务', { fs: fs !== undefined, sq: sq !== undefined, subagents: subagents !== undefined, agents: agents !== undefined })
      return
    }

    // ---------- 常量 ----------
    const PROJECT_DIR = '/Users/lihang/gitlab1/dsh-task-panel'
    const FILE = 'tasks.json'
    const STATUS = { TODO: 'todo', CONFIRM: 'confirm', DEVELOP: 'develop', REVIEW: 'review', DONE: 'done' }
    const STATUS_LABEL = { todo: '待领取', confirm: '待确认', develop: '开发中', review: '复核中', done: '已完成' }
    const STATUS_COLOR = { todo: '#94a3b8', confirm: '#f59e0b', develop: '#3b82f6', review: '#8b5cf6', done: '#22c55e' }
    const STAGE_LABEL = { claim: '规划', develop: '开发', review: '复核' }
    const MAX_CONCURRENT_DEVELOP = 1

    // fs.writeText 需要显式沙箱策略：默认按 workspace-write 裁定（workspaceRoot=进程 cwd），
    // 进程 cwd 不在项目目录时写入会被拒绝。这里显式限定在项目目录内写；/tmp 始终可写，作为回退。
    const PERSIST_POLICY = { mode: 'workspace-write', workspaceRoot: PROJECT_DIR }

    const SCHEMAS = {
      claim: {
        type: 'object',
        properties: {
          plan: { type: 'string' },
          steps: { type: 'array', items: { type: 'string' } },
          risks: { type: 'array', items: { type: 'string' } },
        },
        required: ['plan'],
        additionalProperties: true,
      },
      develop: {
        type: 'object',
        properties: {
          done: { type: 'boolean' },
          summary: { type: 'string' },
          changedFiles: { type: 'array', items: { type: 'string' } },
          blocker: { type: 'string' },
        },
        required: ['done'],
        additionalProperties: true,
      },
      review: {
        type: 'object',
        properties: {
          passed: { type: 'boolean' },
          issues: { type: 'array', items: { type: 'string' } },
          verdict: { type: 'string' },
        },
        required: ['passed'],
        additionalProperties: true,
      },
    }

    // ---------- 状态 ----------
    let state = { version: 1, tasks: [] }
    let storeDir = null
    let storeFile = FILE
    let persistenceOk = true
    let runningDevelop = 0
    let sweepStarted = false

    const now = () => new Date().toISOString()
    const uid = () => 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
    const findTask = (id) => {
      for (const t of state.tasks) if (t.id === id) return t
      return undefined
    }
    const textOf = (blocks) => {
      if (!Array.isArray(blocks)) return ''
      let out = ''
      for (const b of blocks) if (b && b.type === 'text' && typeof b.text === 'string') out += b.text + '\n'
      return out.trim()
    }
    // 子代理 start 需要 AbortSignal；沙箱里没有 AbortController，用最小桩对象满足驱动方接口
    const makeSignal = () => ({
      aborted: false,
      addEventListener() {},
      removeEventListener() {},
      throwIfAborted() {},
    })
    const kick = (fn) => {
      Promise.resolve().then(fn).catch((err) => console.error('[task-panel] 异步任务异常:', err && err.message || err))
    }

    // ---------- 持久化 ----------
    async function resolveTarget(dir, file) {
      try {
        return await fs.resolve(file || FILE, { cwd: dir })
      } catch (err) {
        return null
      }
    }

    async function verifyPersistence() {
      // 用当前状态试写一次，确认存储可用；失败则尝试回退目录（/tmp 在 workspace-write 下始终可写）
      const attempts = [{ dir: PROJECT_DIR, file: FILE }, { dir: '/tmp', file: 'dsh-task-panel-tasks.json' }]
      if (storeDir !== null) attempts.unshift({ dir: storeDir, file: storeFile || FILE })
      for (const c of attempts) {
        try {
          const target = await resolveTarget(c.dir, c.file)
          if (target === null) continue
          await fs.writeText(target, JSON.stringify(state, null, 2), undefined, undefined, PERSIST_POLICY)
          storeDir = c.dir
          storeFile = c.file
          persistenceOk = true
          return
        } catch (err) {
          console.error('[task-panel] 存储自检失败:', c.dir, err && err.message)
        }
      }
      persistenceOk = false
      console.error('[task-panel] 所有存储位置都不可写，任务将无法持久化')
    }

    async function loadState() {
      const candidates = [
        { dir: PROJECT_DIR, file: FILE },
        { dir: '/tmp', file: 'dsh-task-panel-tasks.json' },
      ]
      for (const c of candidates) {
        const target = await resolveTarget(c.dir, c.file)
        if (target === null) continue
        try {
          const raw = await fs.readText(target)
          const parsed = JSON.parse(raw)
          if (parsed && Array.isArray(parsed.tasks)) {
            state = parsed
            storeDir = c.dir
            storeFile = c.file
            for (const t of state.tasks) {
              t.history = Array.isArray(t.history) ? t.history : []
              t.relatedSessions = Array.isArray(t.relatedSessions) ? t.relatedSessions : []
              t.flags = t.flags && typeof t.flags === 'object' ? t.flags : {}
              t.flags.running = false // 执行态不跨进程，重启后复位
              t.steps = Array.isArray(t.steps) ? t.steps : []
            }
            console.log('[task-panel] 已加载任务库:', c.dir, state.tasks.length, '个任务')
            break
          }
        } catch (err) {
          console.error('[task-panel] 读取', c.dir, '失败:', err && err.message)
        }
      }
      await verifyPersistence()
    }

    async function saveState() {
      if (storeDir === null) {
        await verifyPersistence()
        if (storeDir === null) return
      }
      try {
        const target = await resolveTarget(storeDir, storeFile)
        if (target !== null) {
          await fs.writeText(target, JSON.stringify(state, null, 2), undefined, undefined, PERSIST_POLICY)
          persistenceOk = true
        }
      } catch (err) {
        console.error('[task-panel] 保存失败:', err && err.message)
        // 当前目录不可写：尝试回退到 /tmp 后重试一次
        persistenceOk = false
        const prevDir = storeDir
        await verifyPersistence()
        if (storeDir !== prevDir) await saveState()
      }
    }

    // ---------- 基础操作 ----------
    function note(task, text) {
      task.history = task.history || []
      task.history.push({ at: now(), note: text })
      if (task.history.length > 100) task.history = task.history.slice(-100)
      task.updatedAt = now()
    }

    function move(task, to, text) {
      const from = task.status
      if (from !== to) task.status = to
      if (text) note(task, text)
    }

    // ---------- 蒸馏：检索历史会话 ----------
    async function readTitleSafe(id) {
      try {
        const snap = await sq.readTitle(id)
        return snap && snap.title ? snap.title : undefined
      } catch (err) {
        return undefined
      }
    }

    async function searchRelated(query, excludeIds, limit) {
      const q = String(query || '').trim().slice(0, 300)
      if (!q) return []
      let page
      try {
        page = await sq.searchSessions({ query: q, limit: limit || 6 })
      } catch (err) {
        console.error('[task-panel] 检索失败:', err && err.message)
        return []
      }
      const out = []
      const seen = {}
      const items = page && page.items ? page.items : []
      for (const hit of items) {
        const id = hit && hit.header ? hit.header.id : undefined
        if (!id || seen[id]) continue
        seen[id] = true
        if (excludeIds && excludeIds.indexOf(id) !== -1) continue
        const title = await readTitleSafe(id)
        const snippet = hit.bestMatch && hit.bestMatch.snippet ? hit.bestMatch.snippet : ''
        const cwd = hit.header && hit.header.cwd ? hit.header.cwd : ''
        out.push({ id, title: title || '(无标题会话)', reason: String(snippet).slice(0, 140), cwd: cwd })
      }
      return out
    }

    // ---------- 阶段 prompt（每个阶段一套） ----------
    function buildPrompt(stage, task) {
      const related = (task.relatedSessions || [])
        .map((r) => '- ' + (r.title || r.id) + '（会话 ' + r.id + (r.cwd ? '，位于 ' + r.cwd : '') + '）：' + (r.reason || ''))
        .join('\n')
      // 仓库定位：目标仓库优先（老板显式选择或识别），其次发布会话的工作目录
      const repoLines = []
      if (task.repoPath) repoLines.push('- 目标仓库（老板指定/识别）：' + task.repoPath)
      if (task.sourceCwd && task.sourceCwd !== task.repoPath) repoLines.push('- 发布会话工作目录：' + task.sourceCwd)
      const repoText = repoLines.length > 0 ? repoLines.join('\n') : '（未指定，请先自行定位任务涉及的仓库/目录，并在结果中说明）'
      const base = '# 任务：' + task.title
        + '\n\n## 需求描述\n' + (task.description || '（无，请按标题合理推断）')
        + '\n\n## 验收标准\n' + (task.acceptance || '（未指定，请在结果中明确你的验收方式）')
        + '\n\n## 仓库定位（重要）\n' + repoText
        + '\n动手前必须确认：你将要改动的文件应位于「目标仓库」内。若你的工作目录与目标仓库不同，请先 cd 到目标仓库，'
        + '并用 pwd 与 git rev-parse --show-toplevel 验证所在仓库；严禁把改动写到错误的仓库。'

      if (stage === 'claim') {
        return base
          + '\n\n## 关联的历史会话（仅供了解背景，不得修改它们）\n' + (related || '（无）')
          + '\n\n你的角色：任务规划代理。'
          + '\n请梳理该任务需要做什么，制定一份可执行的实施计划：步骤、涉及的文件/模块、风险与验证方式。'
          + '\n【不要开始实施】。'
          + '\n以 JSON 输出：plan（一段话的实施计划）、steps（步骤数组）、risks（风险数组）。'
      }
      if (stage === 'develop') {
        return base
          + '\n\n## 老板已确认的实施计划\n' + (task.plan || '（无，请自行规划后实施）')
          + '\n\n你的角色：开发执行代理。'
          + '\n请严格按照计划实施本任务，完成代码/文档/配置改动并自测。'
          + '\n以 JSON 输出：done（boolean 是否完成）、summary（完成情况摘要）、changedFiles（改动文件数组）、blocker（未完成时的阻塞原因，否则空字符串）。'
      }
      if (stage === 'review') {
        return base
          + '\n\n## 实现摘要\n' + (task.summary || '（见执行子会话）')
          + '\n\n你的角色：质量复核代理（老板验收前的自动检查）。'
          + '\n请对照验收标准复核实现：需求是否满足、代码质量、遗留问题与明显缺陷。'
          + '\n以 JSON 输出：passed（boolean 是否通过）、issues（问题数组）、verdict（复核结论）。'
      }
      return base
    }

    // ---------- 阶段执行器（自动读取器核心） ----------
    const stageLabel = (stage) => STAGE_LABEL[stage] || STATUS_LABEL[stage] || stage

    async function runStage(task, stage) {
      // 父会话优先取任务来源会话；来源缺失/不在线时回退到当前任意在线根会话（老板场景）
      const parent = agents.get(task.sourceSessionId)
        || agents.get(task.workSessionId)
        || (typeof agents.roots === 'function' ? agents.roots()[0] : undefined)
        || agents.list()[0]
      if (parent === undefined) {
        note(task, '无法启动' + stageLabel(stage) + '代理：没有在线会话可供派生，请在任意会话中打开 DSH 后重试')
        await saveState()
        return null
      }
      let run
      try {
        run = await subagents.start('spawn', {
          label: 'task-' + task.id + '-' + stage,
          prompt: [{ type: 'text', text: buildPrompt(stage, task) }],
          parent: parent,
          signal: makeSignal(),
          outputSchema: SCHEMAS[stage],
        })
      } catch (err) {
        note(task, '启动' + stageLabel(stage) + '代理失败: ' + (err && err.message || String(err)))
        await saveState()
        return null
      }
      task.flags.runId = run.id
      if (stage === 'develop') task.workSessionId = run.id
      note(task, '已启动' + stageLabel(stage) + '代理（子会话 ' + run.id + '）')
      await saveState()
      try {
        const result = await run.result
        const structured = result && result.structured
        const output = textOf(result && result.output)
        await run.dispose().catch(function () {})
        return { structured: structured, output: output, stopReason: result && result.stopReason }
      } catch (err) {
        await run.dispose().catch(function () {})
        note(task, stageLabel(stage) + '代理异常: ' + (err && err.message || String(err)))
        await saveState()
        return null
      }
    }

    // ---------- 流水线 ----------
    function todoQueue() {
      return state.tasks
        .filter((t) => t.status === STATUS.TODO && t.autoRun !== false && !t.flags.running)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    }

    async function maybeAdvanceQueue() {
      if (runningDevelop >= MAX_CONCURRENT_DEVELOP) return
      const next = todoQueue()[0]
      if (!next) return
      await runClaim(next)
    }

    async function runClaim(task) {
      if (task.status !== STATUS.TODO) return
      if (task.flags.running) return // 防重入：已有领取/规划在执行
      task.flags.running = true
      await saveState()
      try {
        const res = await runStage(task, 'claim')
        if (!res) return
        const s = res.structured || {}
        if (typeof s.plan === 'string' && s.plan) task.plan = s.plan
        task.steps = Array.isArray(s.steps) ? s.steps : []
        if (task.autoConfirm !== false) {
          move(task, STATUS.DEVELOP, '规划完成，计划已自动确认，进入开发')
          // 先释放领取锁再启动开发（否则 runDevelop 的防重入会直接返回）
          delete task.flags.running
          await saveState()
          await runDevelop(task)
        } else {
          move(task, STATUS.CONFIRM, '规划完成，等待老板确认计划')
          await saveState()
        }
      } finally {
        delete task.flags.running
        await saveState()
      }
    }

    async function runDevelop(task) {
      if (task.status !== STATUS.DEVELOP) return
      if (runningDevelop >= MAX_CONCURRENT_DEVELOP) {
        // 执行名额已满：回到待领取排队，名额释放后由队列自动重新领取
        move(task, STATUS.TODO, '已有任务在执行，回到待领取排队')
        await saveState()
        return
      }
      if (task.flags.running) return
      runningDevelop += 1
      task.flags.running = true
      try {
        const res = await runStage(task, 'develop')
        if (!res) return
        const s = res.structured || {}
        if (typeof s.summary === 'string' && s.summary) task.summary = s.summary
        task.changedFiles = Array.isArray(s.changedFiles) ? s.changedFiles : []
        if (s.done === true) {
          move(task, STATUS.REVIEW, '开发完成，进入自动复核')
          await saveState()
          await runReview(task)
        } else {
          note(task, '开发代理报告未完成：' + (s.blocker || '原因未说明') + '（可在面板点击「重新执行」）')
          await saveState()
        }
      } finally {
        runningDevelop -= 1
        delete task.flags.running
        await saveState()
        kick(maybeAdvanceQueue)
      }
    }

    async function runReview(task) {
      if (task.status !== STATUS.REVIEW) return
      const res = await runStage(task, 'review')
      if (!res) return
      const s = res.structured || {}
      task.reviewReport = {
        passed: s.passed === true,
        issues: Array.isArray(s.issues) ? s.issues : [],
        verdict: typeof s.verdict === 'string' ? s.verdict : '',
        at: now(),
      }
      if (s.passed === true) {
        note(task, '自动复核通过：' + (s.verdict || '无遗留问题') + ' —— 等待老板验收')
      } else {
        note(task, '自动复核发现问题（' + task.reviewReport.issues.length + ' 项）：' + (s.verdict || '详见复核报告') + ' —— 等待老板决定')
      }
      await saveState()
    }

    // ---------- 摘要（JSON 安全） ----------
    function toSummary(t) {
      return {
        id: t.id,
        title: t.title,
        description: t.description || '',
        acceptance: t.acceptance || '',
        status: t.status,
        statusLabel: STATUS_LABEL[t.status] || t.status,
        color: STATUS_COLOR[t.status] || '#94a3b8',
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        plan: t.plan || '',
        steps: t.steps || [],
        summary: t.summary || '',
        changedFiles: t.changedFiles || [],
        reviewReport: t.reviewReport || null,
        relatedSessions: (t.relatedSessions || []).map((r) => ({ id: r.id, title: r.title, reason: r.reason || '', cwd: r.cwd || '' })),
        sourceSessionId: t.sourceSessionId || '',
        sourceCwd: t.sourceCwd || '',
        repoPath: t.repoPath || '',
        workSessionId: t.workSessionId || '',
        autoRun: t.autoRun !== false,
        autoConfirm: t.autoConfirm !== false,
        running: !!t.flags.running,
        history: (t.history || []).slice(-30),
      }
    }

    function countsOf() {
      const counts = { todo: 0, confirm: 0, develop: 0, review: 0, done: 0 }
      for (const t of state.tasks) if (counts[t.status] !== undefined) counts[t.status] += 1
      return counts
    }

    // ---------- 巡检读取器（进程重启恢复） ----------
    function startSweep() {
      if (sweepStarted) return
      sweepStarted = true
      ctx.interval(() => {
        let changed = false
        for (const t of state.tasks) {
          if (t.status === STATUS.DEVELOP && t.flags.runId) {
            const child = agents.get(t.workSessionId)
            if (child === undefined) {
              note(t, '检测到执行子会话已不在线（可能是进程重启），可在面板点击「重新执行」')
              delete t.flags.runId
              changed = true
            }
          }
        }
        if (changed) saveState()
      }, 20000)
    }

    // ---------- RPC ----------
    harness.handle('tasks.list', async () => {
      return { ok: true, tasks: state.tasks.map(toSummary), counts: countsOf(), labels: STATUS_LABEL, colors: STATUS_COLOR, order: [STATUS.TODO, STATUS.CONFIRM, STATUS.DEVELOP, STATUS.REVIEW, STATUS.DONE], persistenceOk: persistenceOk }
    })

    harness.handle('tasks.scan', async (args) => {
      const a = args || {}
      const exclude = Array.isArray(a.excludeIds) ? a.excludeIds : []
      const hits = await searchRelated(a.query || '', exclude, a.limit || 8)
      return { ok: true, hits: hits }
    })

    harness.handle('tasks.create', async (args) => {
      const a = args || {}
      const title = String(a.title || '').trim()
      if (!title) return { ok: false, error: '任务标题不能为空' }
      const dup = state.tasks.find((t) => t.title.trim() === title)
      if (dup) {
        return { ok: false, error: '已存在同名任务「' + dup.title + '」（' + (STATUS_LABEL[dup.status] || dup.status) + '），可在面板中直接操作', taskId: dup.id }
      }
      const task = {
        id: uid(),
        title: title,
        description: String(a.description || '').trim(),
        acceptance: String(a.acceptance || '').trim(),
        status: STATUS.TODO,
        createdAt: now(),
        updatedAt: now(),
        sourceSessionId: typeof a.sessionId === 'string' ? a.sessionId : '',
        sourceCwd: (function () {
          const p = agents.get(typeof a.sessionId === 'string' ? a.sessionId : '')
          return p && p.session && p.session.header && p.session.header.cwd ? p.session.header.cwd : ''
        })(),
        repoPath: typeof a.repoPath === 'string' && a.repoPath.trim() ? a.repoPath.trim() : '',
        relatedSessions: [],
        steps: [],
        changedFiles: [],
        history: [],
        flags: {},
        autoRun: a.autoRun !== false,
        autoConfirm: a.autoConfirm !== false,
      }
      if (!task.repoPath && task.sourceCwd) task.repoPath = task.sourceCwd // 未显式指定时默认发布会话所在仓库
      state.tasks.push(task)
      let related
      if (Array.isArray(a.related) && a.related.length > 0) {
        related = a.related
          .slice(0, 6)
          .map((r) => ({ id: String(r.id || ''), title: String(r.title || '(无标题会话)'), reason: String(r.reason || '手动关联') }))
          .filter((r) => r.id)
      } else {
        related = await searchRelated(title + ' ' + task.description, [task.sourceSessionId], 6)
      }
      task.relatedSessions = related
      note(task, '任务已创建' + (related.length > 0 ? '，自动关联 ' + related.length + ' 个历史会话' : '（未找到明显相关的历史会话）') + (task.repoPath ? '；目标仓库：' + task.repoPath : ''))
      await saveState()
      if (task.autoRun) kick(maybeAdvanceQueue)
      return { ok: true, task: toSummary(task) }
    })

    harness.handle('tasks.action', async (args) => {
      const a = args || {}
      const task = findTask(String(a.taskId || ''))
      if (!task) return { ok: false, error: '任务不存在' }
      const action = String(a.action || '')
      try {
        if (action === 'claim') {
          if (task.status !== STATUS.TODO) return { ok: false, error: '仅「待领取」任务可领取' }
          if (task.flags.running) return { ok: false, error: '任务正在领取/规划中，请稍候' }
          kick(function () { return runClaim(task) })
          return { ok: true, message: '已开始领取并规划' }
        }
        if (action === 'confirm') {
          if (task.status !== STATUS.CONFIRM) return { ok: false, error: '仅「待确认」任务可确认' }
          move(task, STATUS.DEVELOP, '老板已确认计划，进入开发')
          await saveState()
          kick(function () { return runDevelop(task) })
          return { ok: true, message: '已确认，进入开发' }
        }
        if (action === 'reject') {
          if (task.status !== STATUS.CONFIRM) return { ok: false, error: '仅「待确认」任务可打回' }
          if (a.note) note(task, '老板打回：' + String(a.note).slice(0, 500))
          move(task, STATUS.TODO, '计划被老板打回，回到待领取')
          await saveState()
          return { ok: true, message: '已打回' }
        }
        if (action === 'accept') {
          if (task.status !== STATUS.REVIEW) return { ok: false, error: '仅「复核中」任务可验收' }
          move(task, STATUS.DONE, '老板验收通过 🎉')
          await saveState()
          kick(maybeAdvanceQueue)
          return { ok: true, message: '验收通过' }
        }
        if (action === 'reopen') {
          if (task.status !== STATUS.REVIEW && task.status !== STATUS.DONE) return { ok: false, error: '仅「复核中 / 已完成」任务可打回' }
          if (a.note) note(task, '老板打回：' + String(a.note).slice(0, 500))
          move(task, STATUS.DEVELOP, '老板打回开发')
          await saveState()
          kick(function () { return runDevelop(task) })
          return { ok: true, message: '已打回开发' }
        }
        if (action === 'rerun') {
          if (task.status === STATUS.TODO) {
            if (task.flags.running) return { ok: false, error: '任务正在领取/规划中，请稍候' }
            kick(function () { return runClaim(task) })
            return { ok: true, message: '已重新领取' }
          }
          if (task.status === STATUS.DEVELOP) {
            kick(function () { return runDevelop(task) })
            return { ok: true, message: '已重新执行开发' }
          }
          if (task.status === STATUS.REVIEW) {
            kick(function () { return runReview(task) })
            return { ok: true, message: '已重新复核' }
          }
          return { ok: false, error: '当前状态无需重新执行' }
        }
        if (action === 'delete') {
          state.tasks = state.tasks.filter((t) => t.id !== task.id)
          await saveState()
          return { ok: true, deleted: true }
        }
        if (action === 'edit') {
          if (typeof a.title === 'string' && a.title.trim()) task.title = a.title.trim()
          if (typeof a.acceptance === 'string') task.acceptance = a.acceptance
          if (typeof a.description === 'string') task.description = a.description
          await saveState()
          return { ok: true, task: toSummary(task) }
        }
        return { ok: false, error: '未知操作: ' + action }
      } catch (err) {
        return { ok: false, error: err && err.message || String(err) }
      }
    })

    // ---------- 启动 ----------
    await loadState()
    startSweep()
    kick(maybeAdvanceQueue)
    console.log('[task-panel] Host 已就绪，任务数:', state.tasks.length)
  },
}
