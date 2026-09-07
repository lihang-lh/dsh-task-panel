// =============================================================
// dsh-task-panel · Host 入口（静态插件形态）
// 运行环境：DSH host 进程（Node ESM）
// 依赖服务：fs / sessionQuery / subagents / agents / timer / webServer
// 客户端通过 HTTP 路由 /dsh-task-panel/api/* 与 Host 通信；
// 截图/产物通过 /dsh-task-panel/files/<taskId>/<name> 静态下发。
// =============================================================

import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { join as pathJoin, sep as pathSep } from 'node:path'

// ---------- 原生 App（iOS/Android）截图：设备/工具未就绪指引（纯函数，可单测） ----------
// 开发/复核代理截真机屏前发现缺工具/无设备/未配对时，host 用本函数生成「如何安装/连接」指引，
// 存入 task.flags.deviceGuidance 供面板展示；client 只做渲染，不重复此逻辑。
const DEVICE_GUIDE_TITLE = {
  android: '连接 Android 设备（真机/模拟器）',
  'ios-simulator': '准备 iOS 模拟器',
  'ios-device': '连接并信任 iOS 真机',
}
const DEVICE_GUIDE_STEPS = {
  adb: [
    '检查是否已安装 adb：command -v adb',
    '未安装时安装（macOS）：brew install android-platform-tools',
    '安装后验证：adb version',
  ],
  'android-device': [
    '连接并授权设备：手机开启「开发者选项 → USB 调试」，连接电脑后在手机弹窗点「允许 USB 调试」',
    '查看设备状态（须显示 device，不能是 unauthorized / offline）：adb devices',
    '无线调试可选：先 adb tcpip 5555，再 adb connect <手机IP>，最后 adb devices 确认',
  ],
  xcode: [
    '检查 Xcode 命令行工具是否就绪：xcode-select -p',
    '未安装时安装 Xcode（App Store 或 brew install --cask xcode），首次使用接受许可：sudo xcodebuild -license accept',
  ],
  simulator: [
    '列出可用模拟器：xcrun simctl list devices available',
    '启动一个模拟器：open -a Simulator',
  ],
  idb: [
    '检查是否已安装 idb：command -v idb',
    '安装 idb companion（macOS）：brew tap facebook/fb && brew install idb-companion',
    '安装 idb 命令行：pipx install fb-idb（或 pip install fb-idb）',
    '验证能看到设备：idb list-targets',
  ],
  'ios-pairing': [
    '让 iPhone 信任这台电脑：连接后解锁手机，点击弹窗「信任此电脑」',
    '确认设备已被识别：idevice_id -l（依赖 libimobiledevice：brew install libimobiledevice）',
    '也可在 Xcode → Window → Devices and Simulators 中确认设备已配对',
  ],
}
export function deviceGuidance(platform, missing) {
  const known = DEVICE_GUIDE_TITLE[platform] ? platform : ''
  const title = known ? DEVICE_GUIDE_TITLE[known] : '检查开发环境工具链'
  const list = Array.isArray(missing)
    ? missing.map((m) => String(m).trim().toLowerCase()).filter(Boolean)
    : []
  const steps = []
  for (const key of new Set(list)) {
    const lines = DEVICE_GUIDE_STEPS[key]
    if (!lines) continue
    for (const line of lines) if (steps.indexOf(line) === -1) steps.push(line)
  }
  if (steps.length === 0) {
    steps.push('按代理报告的具体缺口，安装对应平台的命令行工具链（Android：adb；iOS：Xcode/simctl 或 idb），并把设备/模拟器连接到这台电脑')
  }
  return { title: title, steps: steps }
}

export const name = 'dsh-task-panel'
export const inject = ['timer', 'webServer']

export async function apply(ctx) {
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
  const STATUS = { TODO: 'todo', CLARIFY: 'clarify', CONFIRM: 'confirm', DEVELOP: 'develop', PAUSED: 'paused', REVIEW: 'review', DONE: 'done' }
  const STATUS_LABEL = { todo: '待领取', clarify: '待澄清', confirm: '待确认', develop: '开发中', paused: '暂停中', review: '复核中', done: '已完成' }
  const STATUS_COLOR = { todo: '#94a3b8', clarify: '#ec4899', confirm: '#f59e0b', develop: '#3b82f6', paused: '#f97316', review: '#8b5cf6', done: '#22c55e' }
  const STAGE_LABEL = { claim: '规划', refine: '澄清定稿', develop: '开发', review: '复核' }
  const STATUS_ORDER = [STATUS.TODO, STATUS.CLARIFY, STATUS.CONFIRM, STATUS.DEVELOP, STATUS.PAUSED, STATUS.REVIEW, STATUS.DONE]
  const MAX_CONCURRENT_DEVELOP = 1
  // 复核未通过时的自动打回开发轮次上限：超过后任务停在「复核中」并点亮红色「不可验收」提示，由老板决定。
  const MAX_REWORK = 3
  // 复核报告里「通过」的硬门槛：不允许「通过但带遗留问题」。
  const reviewClean = (report) => !!report && report.passed === true && Array.isArray(report.issues) && report.issues.length === 0

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
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              q: { type: 'string' },
              why: { type: 'string' },
            },
            required: ['q'],
            additionalProperties: true,
          },
        },
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
        screenshots: { type: 'array', items: { type: 'string' } },
        deviceStatus: {
          type: 'object',
          properties: {
            platform: { type: 'string' }, // 'android' | 'ios-simulator' | 'ios-device' | 'web' | ''
            ok: { type: 'boolean' }, // 截图环节是否就绪/成功
            missing: { type: 'array', items: { type: 'string' } }, // 缺失项标识，见 develop prompt
            detail: { type: 'string' }, // 人工可读的缺口说明
          },
          additionalProperties: true,
        },
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
        screenshots: { type: 'array', items: { type: 'string' } },
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
  // 静态插件运行在 Node 环境，使用真实 AbortController
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
            t.risks = Array.isArray(t.risks) ? t.risks : []
            t.questions = Array.isArray(t.questions) ? t.questions : []
            t.planDraft = typeof t.planDraft === 'string' ? t.planDraft : undefined
            t.specPath = typeof t.specPath === 'string' ? t.specPath : ''
            t.specInRepo = !!t.specInRepo
            t.pausedFrom = typeof t.pausedFrom === 'string' ? t.pausedFrom : '' // 旧数据兜底
            t.pausedFromRunning = !!t.pausedFromRunning
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

  // ---------- 阶段 prompt（每个阶段一套；opts.refine = 澄清定稿轮） ----------
  function buildPrompt(stage, task, opts) {
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
      let s = base
        + '\n\n## 关联的历史会话（仅供了解背景，不得修改它们）\n' + (related || '（无）')
      if (opts && opts.refine) {
        const qa = (task.questions || [])
          .map((x) => '- Q' + x.id.slice(1) + '：' + x.q + (x.why ? '（' + x.why + '）' : '')
            + '\n  老板回答：' + (x.answer || '（未回答，按你的最佳判断处理）'))
          .join('\n')
        s += '\n\n## 老板的澄清回答（上一轮规划提出的问题，请据此收敛方案）\n' + qa
        s += '\n\n你的角色：任务规划代理（澄清定稿轮）。'
        s += '\n请结合老板的回答输出**最终**实施计划（questions 输出空数组），不要再提出新问题。'
      } else {
        s += '\n\n你的角色：任务规划代理（OpenSpec 规划模式）。'
      }
      s += '\n请先梳理该任务需要做什么，再制定一份**完整可执行**的实施计划：'
        + '\n- steps 必须像 OpenSpec 的 tasks.md 一样**编号列出**，每一步写清：做什么 / 涉及哪些文件或模块 / 如何验收这一步；'
        + '\n- plan 用一段话概括目标与方案；'
        + '\n- risks 列出主要风险与假设。'
        + '\n【不要开始实施】。'
      if (!(opts && opts.refine)) {
        s += '\n需求澄清（必要）：若存在以下任一不明确点，**必须**在 questions 中向老板提问（每问一句话可答，why 说明为什么需要），不要自行假设：'
          + '\n  1) 验收标准缺失或含糊，无法判断「做完」；2) 目标仓库/改动范围不明；3) 与现有实现或历史会话的关系不明；'
          + '\n  4) 技术方案有明显分叉需要老板拍板；5) 需求范围过大需要确认优先级或拆解。'
          + '\n  需求足够清晰时 questions 输出空数组。'
      }
      s += '\n以 JSON 输出：plan（一段话的实施计划）、steps（步骤数组）、risks（风险数组）、questions（数组，每项 {q, why}）。'
      return s
    }
    if (stage === 'develop') {
      let s = base
        + '\n\n## 老板已确认的实施计划\n' + (task.plan || '（无，请自行规划后实施）')
        + (task.specPath ? '\n\n## OpenSpec 任务清单（按编号任务逐步实施；每完成一项，把 tasks.md 中该项的 `[ ]` 改为 `[x]`）\n' + task.specPath : '')
      const feedback = (task.flags && task.flags.reworkFeedback) || []
      if (feedback.length > 0) {
        s += '\n\n## ⚠️ 上一轮复核未通过的问题清单（必须逐条修复，缺一不可）\n'
          + feedback.map((f, i) => (i + 1) + '. ' + f).join('\n')
          + '\n请在 summary 中逐条说明：修复方式 + 验证证据（实际跑过的命令与结果）。'
      }
      s += '\n\n你的角色：开发执行代理。'
        + '\n请严格按照计划实施本任务，完成代码/文档/配置改动并自测：能跑的命令要实际跑并记录结果（退出码/输出），改 UI 要给出可验证的证据。'
        + '\n【端到端与截图要求】先判定本任务形态，再按对应方式做端到端验证并截图。截图统一保存到 <目标仓库>/specs/proposals/<任务id>/screenshots/ 目录（PNG/JPEG），'
        + '并在输出的 screenshots 数组中给出截图路径（绝对路径或仓库内相对路径，每张一行，简短说明写在 summary）：'
        + '\n- Web / 页面 / 表单 / 交互（浏览器形态）：启动本地环境，用真实浏览器或 Playwright 打开页面验证，截取关键界面。'
        + '\n- 原生 App（iOS / Android）形态：按下面【原生 App 截图分支】操作，必须截「真机/模拟器实际运行界面」。'
        + '\n- 纯后端/测试任务可跳过截图，但必须在 summary 中说明原因。'
        + '\n\n【原生 App 截图分支】先判定本任务是否为原生 app 工程，再决定截图手段——'
        + '\n1. 判定：结合任务描述与仓库结构启发式探测，满足其一即视为原生 app 工程：'
        + 'Android——存在 app/src/main/AndroidManifest.xml、build.gradle(.kts) / settings.gradle(.kts) / gradle.properties 且含 android 插件；'
        + 'iOS——存在 *.xcodeproj / *.xcworkspace，或 ios/ 目录下 Package.swift 且任务指向 iOS app。'
        + '可在目标仓库用 find 自查；仓库同时含 web 与 app（混合工程）时，以任务描述的主对象为准，并在 summary 说明判定依据。'
        + '\n2. 截图流程（探测工具 → 构建/安装/启动 → 截屏）：'
        + '\n   - Android（真机/模拟器通用）：先 adb devices 确认有 device（unauthorized 需在手机弹窗点「允许 USB 调试」）；'
        + 'adb -s <serial> install -r <app> 后 adb shell am start 启动应用；再 adb -s <serial> exec-out screencap -p > <截图文件>。多设备必须用 -s <serial>；无线设备先 adb connect <ip:port>。'
        + '\n   - iOS 模拟器：xcrun simctl list devices 找到已启动（Booted）的模拟器；xcrun simctl install booted <app> 与 simctl launch 启动；再 xcrun simctl io booted screenshot <截图文件>。'
        + '\n   - iOS 真机：xcodebuild 安装到设备（或提示老板已在手机上手动打开应用）；用 idb screenshot <截图文件> 截图；无 idb 时可用 idevicescreenshot（libimobiledevice）。'
        + '\n3. 【探测先行，缺则如实报告，严禁硬截】截屏前先验证工具与设备（command -v adb / xcrun / idb、adb devices、xcrun simctl list devices）。'
        + '若缺工具 / 无设备 / 未配对，不要做无意义截图，而是：done 输出 false；'
        + 'deviceStatus 输出 { ok:false, platform:<android|ios-simulator|ios-device>, missing:[<缺失项>], detail:<缺什么、怎么检查> }；'
        + 'blocker 写清「截图未能完成 + 具体缺口」（面板会给出安装/连接指引，老板接好设备后点「重新执行」重试）。'
        + '缺失项标识从以下取值：adb（未装 adb）、android-device（无设备/未授权）、xcode（无 Xcode/simctl）、simulator（无已启动模拟器）、idb（无 idb）、ios-pairing（真机未信任配对）、other。'
        + '\n以 JSON 输出：done（boolean 是否完成）、summary（完成情况摘要）、changedFiles（改动文件数组）、screenshots（截图路径数组）、'
        + 'deviceStatus（可选，截图受阻时的状态对象 {platform, ok, missing[], detail}）、blocker（未完成时的阻塞原因，否则空字符串）。'
      return s
    }
    if (stage === 'review') {
      return base
        + '\n\n## 实现摘要\n' + (task.summary || '（见执行子会话）')
        + (task.specPath ? '\n\n## OpenSpec 任务清单（请逐项核对实现是否真正完成：对照 tasks.md 勾选状态与实际代码/产物）\n' + task.specPath : '')
        + '\n\n你的角色：质量复核代理（老板验收前的最后一道关卡）。'
        + '\n请对照验收标准、任务清单与真实运行结果逐项核对，不能只凭代码阅读或代理自述下结论：'
        + '\n1. 【必须实际运行】跑测试并核对结果（pytest / node --test / playwright 等），在 verdict 中写明跑了哪些命令与结果；'
        + '\n2. 【端到端】涉及 UI / 页面 / 表单 / 交互的任务，必须核对端到端确实执行过、截图真实存在且内容与实现一致：'
        + 'Web 类任务核对 Playwright 或真实浏览器流程；'
        + '原生 App（iOS/Android）任务按开发阶段的探测与截屏规则（adb / xcrun simctl / idb），亲自截取真机/模拟器实际运行界面核对——'
        + '拿不到真实 app 截图证据时（缺工具/无设备/未配对）必须记为问题，不得放行；'
        + '\n3. 逐条核对 tasks.md 勾选状态与真实实现是否一致，勾了但未实现的必须记为问题；'
        + '\n4. 检查是否有未完成功能、生产接线缺失、安全/权限/审计缺口。'
        + '\n【通过硬门槛（必须同时满足，否则 passed=false）】'
        + '\n- 验收标准全部满足；tasks.md 全部勾选且与实际一致；'
        + '\n- issues 必须为空数组——任何遗留问题（无论多小）都必须写进 issues 并使 passed=false；'
        + '\n- 有实际运行测试/端到端的证据；UI/表单类任务必须提供真实截图（screenshots 数组非空）。'
        + '\n【禁止】输出「通过但带遗留问题」这类自相矛盾的结论：有遗留问题就是未通过（passed=false），由面板自动打回开发。'
        + '\n以 JSON 输出：passed（boolean）、issues（问题数组，无问题必须为空数组）、verdict（复核结论：通过则写清测试与证据；不通过则说明主要原因）、screenshots（截图路径数组，无则空数组）。'
    }
    return base
  }

  // ---------- OpenSpec 产物（规划定稿时写入目标仓库 specs/proposals/<任务id>/） ----------
  function buildProposalMd(task) {
    const risks = (task.risks || []).map((r) => '- ' + r).join('\n') || '- （规划未列出风险）'
    const steps = (task.steps || []).length > 0
      ? '- 见 [tasks.md](./tasks.md)（' + task.steps.length + ' 个编号任务）'
      : '- （规划未产出步骤）'
    const qa = (task.questions || [])
      .filter((x) => x.answer)
      .map((x) => '- Q' + x.id.slice(1) + '：' + x.q + ' → ' + x.answer)
      .join('\n')
    return '# 提案：' + task.title
      + '\n\n- 任务 ID：`' + task.id + '`'
      + '\n- 状态：' + (task.status === STATUS.DONE ? '已完成' : task.status === STATUS.DEVELOP ? '实施中' : '已规划') + '（由任务面板维护）'
      + '\n- 创建时间：' + (task.createdAt || '')
      + '\n- 来源会话：`' + (task.sourceSessionId || '') + '`'
      + '\n- 目标仓库：`' + (task.repoPath || '（未指定）') + '`'
      + '\n\n## 背景与动机\n' + (task.description || '（无额外描述，按任务标题推断）')
      + '\n\n## 目标与方案\n' + (task.plan || '（规划未产出）')
      + '\n\n## 实施步骤\n' + steps
      + '\n\n## 风险\n' + risks
      + '\n\n## 验收方式\n' + (task.acceptance || (qa ? '（任务未单独填写验收标准，以下方澄清问答为准）' : '（任务未明确验收标准，复核阶段对照计划与描述检查）'))
      + (qa ? '\n\n## 澄清问答（老板确认）\n' + qa : '')
  }

  function buildTasksMd(task) {
    const lines = (task.steps || []).map((s, i) => '- [ ] ' + (i + 1) + '. ' + s)
    return '# 任务清单：' + task.title
      + '\n\n> 由任务面板规划阶段生成（OpenSpec 风格）。开发阶段按编号逐步实施，每完成一项将 `[ ]` 改为 `[x]`，复核阶段逐项核对。\n'
      + (lines.length > 0 ? '\n' + lines.join('\n') + '\n' : '\n- [ ] 1. （规划未产出步骤，见任务面板）\n')
  }

  // 写入 <repo>/specs/proposals/<taskId>/proposal.md + tasks.md；优先目标仓库，失败回退面板目录
  async function writeOpenSpec(task) {
    const attempts = []
    if (task.repoPath && task.repoPath !== PROJECT_DIR) attempts.push({ dir: task.repoPath, inRepo: true })
    attempts.push({ dir: PROJECT_DIR, inRepo: false })
    let lastErr = null
    for (const c of attempts) {
      try {
        const dir = 'specs/proposals/' + task.id
        const proposalTarget = await resolveTarget(c.dir, dir + '/proposal.md')
        const tasksTarget = await resolveTarget(c.dir, dir + '/tasks.md')
        if (proposalTarget === null || tasksTarget === null) throw new Error('resolve failed')
        const policy = { mode: 'workspace-write', workspaceRoot: c.dir }
        await fs.writeText(proposalTarget, buildProposalMd(task), undefined, undefined, policy)
        await fs.writeText(tasksTarget, buildTasksMd(task), undefined, undefined, policy)
        task.specPath = String(proposalTarget.targetKey || (c.dir + '/' + dir + '/proposal.md'))
        task.specInRepo = c.inRepo
        return true
      } catch (err) {
        lastErr = err
      }
    }
    note(task, 'OpenSpec 产物写入失败：' + (lastErr && lastErr.message || String(lastErr)) + '（计划仍保留在任务面板）')
    return false
  }

  // ---------- 阶段执行器（自动读取器核心） ----------
  const stageLabel = (stage) => STAGE_LABEL[stage] || STATUS_LABEL[stage] || stage

  async function runStage(task, stage, opts) {
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
    // 挂到 task.flags.abort 供「暂停」中断正在运行的子代理
    const abort = new AbortController()
    task.flags.abort = abort
    let run
    try {
      run = await subagents.start('spawn', {
        label: 'task-' + task.id + '-' + stage,
        prompt: [{ type: 'text', text: buildPrompt(stage, task, opts) }],
        parent: parent,
        signal: abort.signal,
        outputSchema: SCHEMAS[stage],
      })
    } catch (err) {
      if (task.flags.abort === abort) delete task.flags.abort
      note(task, '启动' + stageLabel(stage) + '代理失败: ' + (err && err.message || String(err)))
      await saveState()
      return null
    }
    task.flags.runId = run.id
    // 记录每个阶段的子会话 id 与其父会话 id（供面板「点击跳转到会话」使用）
    task.flags.stageRunIds = task.flags.stageRunIds || {}
    task.flags.stageParents = task.flags.stageParents || {}
    task.flags.stageRunIds[stage] = run.id
    task.flags.stageParents[stage] = parent.id
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
      const msg = err && err.message || String(err)
      if (err && (err.name === 'AbortError' || /abort|cancel/i.test(msg))) {
        note(task, stageLabel(stage) + '代理已因暂停中断')
      } else {
        note(task, stageLabel(stage) + '代理异常: ' + msg)
      }
      await saveState()
      return null
    } finally {
      if (task.flags.abort === abort) delete task.flags.abort
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

  // 归一化规划代理输出的澄清问题：兼容 string[] 与 {q, why}[]，最多 6 个
  function pickQuestions(raw) {
    if (!Array.isArray(raw)) return []
    const out = []
    for (const x of raw) {
      let q = '', why = ''
      if (typeof x === 'string') q = x
      else if (x && typeof x.q === 'string') { q = x.q; why = typeof x.why === 'string' ? x.why : '' }
      q = String(q).trim()
      if (!q) continue
      out.push({ id: 'q' + (out.length + 1), q: q, why: why.trim(), answer: '' })
      if (out.length >= 6) break
    }
    return out
  }

  // 计划定稿：写 OpenSpec 产物，按 autoConfirm 决定进开发或待确认
  async function settlePlan(task, text) {
    if (task.status === STATUS.PAUSED) return // 暂停守卫：暂停后不得继续流转
    await writeOpenSpec(task)
    if (task.status === STATUS.PAUSED) return
    if (task.autoConfirm !== false) {
      move(task, STATUS.DEVELOP, (text || '规划完成') + '，计划已自动确认，进入开发')
      // 先释放领取锁再启动开发（否则 runDevelop 的防重入会直接返回）
      delete task.flags.running
      await saveState()
      await runDevelop(task)
    } else {
      move(task, STATUS.CONFIRM, (text || '规划完成') + '，等待老板确认计划')
      await saveState()
    }
  }

  async function runClaim(task) {
    if (task.status !== STATUS.TODO) return
    if (task.flags.running) return // 防重入：已有领取/规划在执行
    task.flags.running = true
    await saveState()
    try {
      const res = await runStage(task, 'claim')
      if (!res || task.status === STATUS.PAUSED) return // 暂停守卫：中止/暂停后不再继续
      const s = res.structured || {}
      if (typeof s.plan === 'string' && s.plan) task.plan = s.plan
      task.steps = Array.isArray(s.steps) ? s.steps : []
      task.risks = Array.isArray(s.risks) ? s.risks : []
      const questions = pickQuestions(s.questions)
      if (questions.length > 0) {
        task.questions = questions
        task.planDraft = task.plan
        task.specPath = ''
        task.specInRepo = false
        move(task, STATUS.CLARIFY, '需求存在 ' + questions.length + ' 个不明确点，等待老板澄清后定稿计划')
        await saveState()
        return
      }
      task.questions = []
      delete task.planDraft
      await settlePlan(task, '规划完成')
    } finally {
      delete task.flags.running
      await saveState()
    }
  }

  // 澄清定稿：老板回答后重新规划一轮，产出最终计划并走定稿流程
  async function runClarifyRefine(task) {
    if (task.status !== STATUS.TODO) return
    if (task.flags.running) return
    task.flags.running = true
    await saveState()
    try {
      const res = await runStage(task, 'claim', { refine: true })
      if (!res || task.status === STATUS.PAUSED) {
        if (task.status !== STATUS.PAUSED) {
          note(task, '澄清定稿代理执行失败，任务回到待澄清，请重新提交回答')
          move(task, STATUS.CLARIFY, '澄清定稿失败，回到待澄清')
          await saveState()
        }
        return
      }
      const s = res.structured || {}
      if (typeof s.plan === 'string' && s.plan) task.plan = s.plan
      task.steps = Array.isArray(s.steps) ? s.steps : []
      task.risks = Array.isArray(s.risks) ? s.risks : []
      delete task.planDraft
      await settlePlan(task, '澄清完成，计划已定稿')
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
    delete task.flags.deviceGuidance // 每轮重跑前清掉旧的「待接设备」标记
    runningDevelop += 1
    task.flags.running = true
    try {
      const res = await runStage(task, 'develop')
      if (!res || task.status === STATUS.PAUSED) return // 暂停守卫：中止/暂停后不再继续
      const s = res.structured || {}
      if (typeof s.summary === 'string' && s.summary) task.summary = s.summary
      task.changedFiles = Array.isArray(s.changedFiles) ? s.changedFiles : []
      const shots = await collectScreenshots(task, s.screenshots)
      if (shots.length > 0) task.screenshots = Array.isArray(task.screenshots) ? task.screenshots.concat(shots) : shots
      if (s.done === true) {
        move(task, STATUS.REVIEW, '开发完成，进入自动复核')
        await saveState()
        await runReview(task)
      } else {
        const ds = s.deviceStatus
        // 原生 app 任务截图受阻（缺工具/无设备/未配对）：把分平台安装指引存入 flags，
        // 面板据此显示「待接设备」徽标与指引横幅；老板照做后点「重新执行」重试（rerun 复用）。
        if (ds && ds.ok === false) {
          const missing = Array.isArray(ds.missing) ? ds.missing : []
          const guide = deviceGuidance(ds.platform, missing)
          task.flags.deviceGuidance = {
            platform: typeof ds.platform === 'string' ? ds.platform : '',
            missing: missing,
            detail: (typeof ds.detail === 'string' && ds.detail) ? ds.detail : (s.blocker || ''),
            title: guide.title,
            steps: guide.steps,
            at: now(),
          }
        }
        note(task, '开发代理报告未完成：' + (s.blocker || '原因未说明')
          + ((ds && ds.ok === false) ? '（截图受阻：需连接设备/补齐工具后点「重新执行」，面板已显示安装指引）' : '（可在面板点击「重新执行」）'))
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
    if (!res || task.status === STATUS.PAUSED) return // 暂停守卫：中止/暂停后不再继续
    const s = res.structured || {}
    const issues = Array.isArray(s.issues) ? s.issues : []
    const shots = await collectScreenshots(task, s.screenshots)
    // 硬门槛：有任何遗留问题即视为未通过（不允许「通过但带遗留问题」进入待验收）
    const passed = s.passed === true && issues.length === 0
    task.reviewReport = {
      passed: passed,
      issues: issues,
      verdict: typeof s.verdict === 'string' ? s.verdict : '',
      screenshots: shots,
      at: now(),
    }
    if (shots.length > 0) task.screenshots = Array.isArray(task.screenshots) ? task.screenshots.concat(shots) : shots
    if (passed) {
      note(task, '自动复核通过（无遗留问题）：' + (s.verdict || '测试与验收标准均已核对') + ' —— 等待老板验收')
      await saveState()
      return
    }
    // 未通过：自动打回开发（带问题清单），轮次受限防止无限循环
    task.flags.reworkCount = (task.flags.reworkCount || 0) + 1
    if (task.flags.reworkCount <= MAX_REWORK) {
      task.flags.reworkFeedback = issues
      note(task, '自动复核未通过（' + issues.length + ' 项问题），自动打回开发重试（第 ' + task.flags.reworkCount + '/' + MAX_REWORK + ' 轮）：' + (s.verdict || '详见复核报告'))
      move(task, STATUS.DEVELOP, '复核未通过，自动打回开发（第 ' + task.flags.reworkCount + '/' + MAX_REWORK + ' 轮）')
      await saveState()
      kick(function () { return runDevelop(task) })
      return
    }
    note(task, '自动复核仍未通过（已重试 ' + MAX_REWORK + ' 轮，仍有 ' + issues.length + ' 项问题），停在复核中：请老板在面板决定「打回开发 / 重新复核 / 验收通过」')
    await saveState()
  }

  // 收集开发/复核代理产出的截图：拷贝到面板 screenshots/<taskId>/ 目录，供 /files 路由静态下发
  async function collectScreenshots(task, raw) {
    const out = []
    const list = Array.isArray(raw) ? raw : []
    for (const item of list) {
      let p = ''
      if (typeof item === 'string') p = item
      else if (item && typeof item.path === 'string') p = item.path
      p = String(p || '').trim()
      if (!p) continue
      try {
        const source = await fs.resolve(p, { cwd: task.repoPath || PROJECT_DIR })
        if (source === null) continue
        const info = await fs.stat(source)
        if (!info || info.type !== 'file' || !info.size || info.size <= 0 || info.size > 10 * 1024 * 1024) continue
        const name = String(p).split(/[\\/]/).pop().replace(/[^\w.\-]/g, '_')
        if (!name) continue
        const dir = pathJoin(PROJECT_DIR, 'screenshots', task.id)
        await mkdir(dir, { recursive: true })
        const dest = pathJoin(dir, name)
        await copyFile(source.targetKey, dest)
        out.push({ name: name, url: '/dsh-task-panel/files/' + task.id + '/' + encodeURIComponent(name), caption: (typeof item === 'object' && item.caption) ? String(item.caption) : name })
      } catch (err) {
        console.error('[task-panel] 截图收集失败:', p, err && err.message || err)
      }
    }
    return out
  }

  // ---------- 摘要（JSON 安全） ----------
  // 读取 OpenSpec tasks.md 的勾选进度：{checked, total}；读不到返回 null
  async function tasksProgressOf(t) {
    if (!t.specPath) return null
    try {
      const target = await fs.resolve(t.specPath)
      if (target === null) return null
      const text = await fs.readText(target)
      const checked = (text.match(/- \[x\]/g) || []).length
      const total = (text.match(/- \[[ x]\]/g) || []).length
      if (total === 0) return null
      return { checked: checked, total: total }
    } catch (err) {
      return null
    }
  }

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
      planDraft: t.planDraft || '',
      steps: t.steps || [],
      risks: t.risks || [],
      questions: (t.questions || []).map((q) => ({ id: q.id, q: q.q, why: q.why || '', answer: q.answer || '' })),
      specPath: t.specPath || '',
      specInRepo: !!t.specInRepo,
      summary: t.summary || '',
      changedFiles: t.changedFiles || [],
      screenshots: (t.screenshots || []).map((s) => ({ name: s.name || '', url: s.url || '', caption: s.caption || s.name || '' })),
      reviewReport: t.reviewReport || null,
      reviewClean: reviewClean(t.reviewReport),
      reworkCount: (t.flags && t.flags.reworkCount) || 0,
      deviceGuidance: (t.flags && t.flags.deviceGuidance) || null,
      tasksProgress: t._tasksProgress || null,
      relatedSessions: (t.relatedSessions || []).map((r) => ({ id: r.id, title: r.title, reason: r.reason || '', cwd: r.cwd || '' })),
      sourceSessionId: t.sourceSessionId || '',
      sourceCwd: t.sourceCwd || '',
      repoPath: t.repoPath || '',
      workSessionId: t.workSessionId || '',
      stageSessions: (function () {
        const ids = (t.flags && t.flags.stageRunIds) || {}
        const parents = (t.flags && t.flags.stageParents) || {}
        const out = {}
        for (const s of ['claim', 'develop', 'review']) {
          out[s] = { id: (s === 'develop' ? t.workSessionId || ids[s] : ids[s]) || '', parent: parents[s] || '' }
        }
        return out
      })(),
      autoRun: t.autoRun !== false,
      autoConfirm: t.autoConfirm !== false,
      running: !!t.flags.running,
      pausedFrom: t.pausedFrom || '',
      pausedFromRunning: !!t.pausedFromRunning,
      history: (t.history || []).slice(-30),
    }
  }

  function countsOf() {
    const counts = { todo: 0, clarify: 0, confirm: 0, develop: 0, paused: 0, review: 0, done: 0 }
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

  // ---------- HTTP API（客户端通过 fetch 调用） ----------
  const handlers = {
    'tasks-list': async () => {
      const tasks = await Promise.all(state.tasks.map(async (t) => {
        const s = toSummary(t)
        s.tasksProgress = await tasksProgressOf(t)
        return s
      }))
      return { ok: true, tasks: tasks, counts: countsOf(), labels: STATUS_LABEL, colors: STATUS_COLOR, order: STATUS_ORDER, persistenceOk: persistenceOk }
    },
    'tasks-scan': async (a) => {
      const exclude = Array.isArray(a.excludeIds) ? a.excludeIds : []
      const hits = await searchRelated(a.query || '', exclude, a.limit || 8)
      return { ok: true, hits: hits }
    },
    'tasks-create': async (a) => {
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
        screenshots: [],
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
          .map((r) => ({ id: String(r.id || ''), title: String(r.title || '(无标题会话)'), reason: String(r.reason || '手动关联'), cwd: String(r.cwd || '') }))
          .filter((r) => r.id)
      } else {
        related = await searchRelated(title + ' ' + task.description, [task.sourceSessionId], 6)
      }
      task.relatedSessions = related
      note(task, '任务已创建' + (related.length > 0 ? '，自动关联 ' + related.length + ' 个历史会话' : '（未找到明显相关的历史会话）') + (task.repoPath ? '；目标仓库：' + task.repoPath : ''))
      await saveState()
      if (task.autoRun) kick(maybeAdvanceQueue)
      return { ok: true, task: toSummary(task) }
    },
    'tasks-action': async (a) => {
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
        if (action === 'clarify-answer') {
          if (task.status !== STATUS.CLARIFY) return { ok: false, error: '仅「待澄清」任务可提交澄清' }
          const qs = task.questions || []
          if (qs.length === 0) return { ok: false, error: '该任务没有待澄清问题' }
          const map = {}
          if (Array.isArray(a.answers)) {
            for (const x of a.answers) {
              if (x && typeof x.qid === 'string' && typeof x.answer === 'string' && x.answer.trim()) map[x.qid] = x.answer.trim()
            }
          }
          let answered = 0
          task.questions = qs.map((x) => {
            const answer = map[x.id] || ''
            if (answer) answered += 1
            return Object.assign({}, x, { answer: answer })
          })
          if (answered === 0) return { ok: false, error: '请至少回答一个问题' }
          move(task, STATUS.TODO, '已收到澄清回答（' + answered + '/' + qs.length + '），重新定稿计划')
          await saveState()
          kick(function () { return runClarifyRefine(task) })
          return { ok: true, message: '已提交澄清，正在重新规划' }
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
          move(task, STATUS.DONE, '老板验收通过')
          await saveState()
          kick(maybeAdvanceQueue)
          return { ok: true, message: '验收通过' }
        }
        if (action === 'reopen') {
          if (task.status !== STATUS.REVIEW && task.status !== STATUS.DONE) return { ok: false, error: '仅「复核中 / 已完成」任务可打回' }
          if (a.note) note(task, '老板打回：' + String(a.note).slice(0, 500))
          // 把上一轮复核问题清单作为开发反馈带下去，要求逐条修复
          if (task.reviewReport && Array.isArray(task.reviewReport.issues) && task.reviewReport.issues.length > 0) {
            task.flags.reworkFeedback = task.reviewReport.issues.slice()
            note(task, '老板打回（附 ' + task.reviewReport.issues.length + ' 项复核问题，开发需逐条修复）')
          }
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
        if (action === 'pause') {
          if (task.status === STATUS.DONE || task.status === STATUS.PAUSED) return { ok: false, error: '已完成 / 已暂停任务不可再暂停' }
          task.pausedFrom = task.status
          task.pausedFromRunning = !!task.flags.running
          // 运行中：中断当前阶段子代理（runner 的 finally 会正常释放名额，暂停守卫阻止继续流转）
          if (task.flags.abort && task.flags.abort.abort) {
            try { task.flags.abort.abort() } catch (e) { /* ignore */ }
          }
          move(task, STATUS.PAUSED, '任务已暂停' + (task.pausedFromRunning ? '（执行中，子代理已中断）' : '') + '，可「继续执行」恢复或「重新编辑」调整方向')
          await saveState()
          return { ok: true, message: '已暂停' }
        }
        if (action === 'resume') {
          if (task.status !== STATUS.PAUSED) return { ok: false, error: '仅「暂停中」任务可继续执行' }
          const from = task.pausedFrom || STATUS.TODO
          const wasRunning = !!task.pausedFromRunning
          task.pausedFrom = ''
          task.pausedFromRunning = false
          move(task, from, '任务已恢复执行（原状态：' + (STATUS_LABEL[from] || from) + (wasRunning ? '，继续原阶段' : '') + '）')
          await saveState()
          if (wasRunning) {
            // 暂停时在跑：恢复后重踢对应阶段
            if (from === STATUS.TODO) kick(maybeAdvanceQueue)
            else if (from === STATUS.DEVELOP) kick(function () { return runDevelop(task) })
            else if (from === STATUS.REVIEW) kick(function () { return runReview(task) })
            // confirm / clarify：恢复到对应 Tab 等老板操作
          } else if (from === STATUS.TODO && task.autoRun !== false) {
            kick(maybeAdvanceQueue)
          }
          return { ok: true, message: '已恢复执行' }
        }
        if (action === 'delete') {
          state.tasks = state.tasks.filter((t) => t.id !== task.id)
          await saveState()
          return { ok: true, deleted: true }
        }
        if (action === 'edit') {
          if (task.status !== STATUS.PAUSED) return { ok: false, error: '仅「暂停中」任务可编辑（请先暂停任务，再重新编辑调整方向）' }
          const prev = { title: task.title, description: task.description, acceptance: task.acceptance }
          if (typeof a.title === 'string' && a.title.trim()) task.title = a.title.trim()
          if (typeof a.description === 'string') task.description = a.description
          if (typeof a.acceptance === 'string') task.acceptance = a.acceptance
          const changed = []
          if (task.title !== prev.title) changed.push('标题')
          if (task.description !== prev.description) changed.push('描述')
          if (task.acceptance !== prev.acceptance) changed.push('验收标准')
          if (changed.length > 0) {
            // 破坏性操作：清空旧产物，使下次运行按新方向重新生成（留痕）
            delete task.plan
            delete task.planDraft
            task.steps = []
            task.risks = []
            task.questions = []
            task.summary = ''
            task.reviewReport = null
            task.changedFiles = []
            task.screenshots = []
            delete task.flags.reworkFeedback
            delete task.flags.reworkCount
            note(task, '老板重新编辑：' + changed.join('、') + ' —— 旧计划与产物已清空，后续按新方向重新生成')
          }
          await saveState()
          return { ok: true, task: toSummary(task) }
        }
        return { ok: false, error: '未知操作: ' + action }
      } catch (err) {
        return { ok: false, error: err && err.message || String(err) }
      }
    },
  }

  ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-task-panel/api',
    handler: async (req, res) => {
      try {
        let args = {}
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        if (chunks.length > 0) {
          try { args = JSON.parse(Buffer.concat(chunks).toString('utf8')) || {} } catch (e) { args = {} }
        }
        const path = (req.url || '').split('?')[0].replace(/\/+$/, '')
        const method = path.replace('/dsh-task-panel/api', '').replace(/^\//, '')
        const fn = handlers[method]
        const result = fn ? await fn(args) : { ok: false, error: '未知方法: ' + method }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(result))
      } catch (err) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: err && err.message || String(err) }))
      }
    },
  })

  // 静态文件下发：仅限面板 screenshots/<taskId>/ 目录（防目录穿越）
  const FILES_DIR = pathJoin(PROJECT_DIR, 'screenshots')
  const FILE_ID_RE = /^[A-Za-z0-9_\-]+$/ // 任务 id 形态（t_xxx_yyy）
  const FILE_NAME_RE = /^[A-Za-z0-9_.\-]+$/
  const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }
  ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-task-panel/files',
    handler: async (req, res) => {
      try {
        const urlPath = (req.url || '').split('?')[0].replace('/dsh-task-panel/files', '').replace(/^\/+|\/+$/g, '')
        const parts = urlPath.split('/').filter(Boolean)
        const taskId = parts[0] || ''
        const name = parts.slice(1).join('/')
        if (!FILE_ID_RE.test(taskId) || !FILE_NAME_RE.test(name) || !name) {
          res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('bad request')
          return
        }
        const full = pathJoin(FILES_DIR, taskId, name)
        if (!full.startsWith(pathJoin(FILES_DIR, taskId) + pathSep)) {
          res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('forbidden')
          return
        }
        const buf = await readFile(full)
        const ext = (String(name).match(/\.[a-zA-Z0-9]+$/) || [''])[0].toLowerCase()
        res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-cache' })
        res.end(buf)
      } catch (err) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('not found')
      }
    },
  })

  // ---------- 启动 ----------
  await loadState()
  startSweep()
  kick(maybeAdvanceQueue)
  console.log('[task-panel] Host 已就绪，任务数:', state.tasks.length)
}
