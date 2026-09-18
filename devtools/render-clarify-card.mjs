// 待澄清卡片离屏渲染验证脚本 —— 对照 docs/superpowers/specs/2026-09-17-澄清卡片化-design.md §7.2/§7.3
//
// 目的：不重启 `dsh web`、不改动真实 tasks.json，就把 client.js 的**真实渲染代码**
// （DrawerBody → TaskCard → 待澄清卡片）跑在一个极简 DOM 里，用来核对
// 「每问一张强调色卡片 / 问题正文 15px 加粗 / 已答 x/y / 收起态徽章」这些验收点，
// 并生成可直接给老板看的 PNG 截图。
//
// 做法：
//   1) 用 vm 加载 client.js，拦截 window.__ModuleLoader__.load 拿到插件工厂；
//   2) 注入极简 React 兼容层（createElement / useState / useEffect）——client.js 只用这三个 API；
//   3) 把 vnode 渲染成真实 DOM（每个组件实例一个 hook 槽位，与 React 语义一致）；
//   4) 用假 fetch 让插件拿到构造好的 tasks-list 数据；
//   5) 如需 PNG：把 DOM 写成 HTML 文件，用 headless Chrome --screenshot 出图。
//
// 运行：node devtools/render-clarify-card.mjs [--png] [--measure] [--contrast]
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'

const ROOT = new URL('../', import.meta.url).pathname
// Chrome 可执行文件：可用 DSH_CLARIFY_CHROME 覆盖；找不到时浏览器级验证自动跳过
const CHROME = process.env.DSH_CLARIFY_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

// ---------- 极简 React 兼容层 ----------
export function createMiniReact() {
  const effects = []
  function createElement(type, props, ...children) {
    const flat = []
    const push = (c) => {
      if (Array.isArray(c)) c.forEach(push)
      else if (c !== null && c !== undefined && c !== false && c !== true) flat.push(c)
    }
    children.forEach(push)
    if (flat.length === 0) return { type, props: props || {}, children: [] }
    if (flat.length === 1) return { type, props: props || {}, children: [flat[0]] }
    return { type, props: props || {}, children: flat }
  }
  function useState(init) {
    const i = rt.hookIndex++
    const slots = rt.curSlots
    if (slots[i] === undefined) slots[i] = { v: typeof init === 'function' ? init() : init }
    const slot = slots[i]
    return [slot.v, (next) => {
      slot.v = typeof next === 'function' ? next(slot.v) : next
      rt.scheduleRender()
    }]
  }
  function useEffect(fn) {
    const i = rt.hookIndex++
    const slots = rt.curSlots
    if (!slots[i]) { slots[i] = { ran: true }; effects.push(fn) }
  }
  const rt = { hookIndex: 0, curSlots: [], scheduleRender: () => {} }
  return { React: { createElement, useState, useEffect }, effects, rt }
}

// ---------- 极简 DOM 兼容层（够 client.js 用）----------
function makeElement(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [], attrs: {}, listeners: {}, parentNode: null, style: {},
    setAttribute(k, v) { this.attrs[k] = String(v) },
    getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k] },
    removeAttribute(k) { delete this.attrs[k] },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn) },
    removeEventListener(t, fn) {
      const l = this.listeners[t]
      if (l) this.listeners[t] = l.filter((f) => f !== fn)
    },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); return c },
    set innerHTML(v) { this._html = String(v); this.children = [] },
    get innerHTML() { return this._html || '' },
    set textContent(v) { this._text = String(v); this.children = [] },
    get textContent() {
      if (this._text !== undefined) return this._text
      return this.children.map((c) => (c.nodeType === 3 ? c.data : c.textContent)).join('')
    },
    querySelectorAll() { return [] },
    classList: {
      add() {}, remove() {}, contains() { return false },
    },
  }
  return el
}

export function createMiniDom() {
  const html = makeElement('html')
  const body = makeElement('body')
  const head = makeElement('head')
  const styleRegistry = []
  const document = {
    body,
    head,
    documentElement: html,
    createElement: (t) => {
      const el = makeElement(t)
      if (String(t).toLowerCase() === 'style') styleRegistry.push(el)
      return el
    },
    createElementNS: (_ns, t) => makeElement(t),
    createTextNode: (d) => ({ nodeType: 3, data: String(d), parentNode: null, textContent: String(d) }),
    getElementById: (id) => styleRegistry.find((e) => e.attrs.id === id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
  }
  return { document, body, html, head, styleRegistry }
}

// ---------- 把 vnode 渲染成真实 mini-DOM ----------
export function createRenderer(ctx, instanceMap = new Map()) {
  const { React, rt, effects } = ctx
  let seq = 0

  function renderNode(node, parent) {
    if (node === null || node === undefined || node === false || node === true) return null
    if (typeof node === 'string' || typeof node === 'number') {
      const t = ctx.document.createTextNode(String(node))
      parent.appendChild(t)
      return t
    }
    if (Array.isArray(node)) { node.forEach((n) => renderNode(n, parent)); return null }
    if (typeof node.type === 'function') {
      const key = node.props && node.props.key !== undefined ? String(node.props.key) : null
      const instKey = key !== null ? key : 'anon#' + (seq++)
      let inst = instanceMap.get(instKey)
      if (!inst) { inst = { slots: [] }; instanceMap.set(instKey, inst) }
      rt.curSlots = inst.slots
      rt.hookIndex = 0
      let out
      try {
        out = node.type(node.props || {})
      } catch (e) {
        throw new Error('组件渲染失败 ' + (node.type.name || 'anonymous') + ': ' + e.message)
      }
      return renderNode(out, parent)
    }
    const el = ctx.document.createElement(node.type)
    const props = node.props || {}
    for (const k in props) {
      if (k === 'key' || k === 'children') continue
      const v = props[k]
      if (v === null || v === undefined || v === false) continue
      if (k === 'className' || k === 'id' || k === 'title' || k === 'placeholder' ||
          k === 'rows' || k === 'value' || k === 'name' || k === 'type') {
        el.setAttribute(k === 'className' ? 'class' : k, v)
      } else if (k === 'style' && typeof v === 'object') {
        el.style = v
      } else if (k === 'dangerouslySetInnerHTML' && v && v.__html) {
        el.innerHTML = v.__html
      } else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v)
      } else if (typeof v !== 'object') {
        el.setAttribute(k, v)
      }
    }
    ;(node.children || []).forEach((c) => renderNode(c, el))
    parent.appendChild(el)
    return el
  }

  return {
    /** 渲染一个 vnode 到 root 元素，返回 DOM 树。 */
    render(vnode, root) {
      while (root.children.length) root.removeChild(root.children[0])
      renderNode(vnode, root)
    },
    /** 跑本轮排队的 effect（模拟挂载后执行，只首轮入队）。 */
    flushEffects() {
      const queued = effects.splice(0, effects.length)
      const cleanups = []
      queued.forEach((fn) => { const c = fn(); if (typeof c === 'function') cleanups.push(c) })
      return cleanups
    },
  }
}

// ---------- 加载 client.js（真实代码）----------
export function loadClientModule() {
  const src = readFileSync(join(ROOT, 'client.js'), 'utf8')
  const dom = createMiniDom()
  const ctx = createMiniReact()
  let captured = null
  const sandbox = {
    window: {
      __ModuleLoader__: { load(mod) { captured = mod } },
      // localStorage 用内存实现：插件的「面板宽度记忆」等逻辑与真实运行一致（缺失会被 try/catch 静默降级）
      localStorage: (() => {
        const m = new Map()
        return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }
      })(),
      getComputedStyle: () => ({ getPropertyValue: () => '' }),
      addEventListener() {}, removeEventListener() {},
      setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
      location: { href: 'http://localhost/', search: '' },
      document: dom.document,
      fetch: (...a) => globalThis.fetch(...a),
    },
    document: dom.document,
    console,
    setTimeout, clearTimeout,
    setInterval: () => 0, clearInterval() {},
    fetch: (...a) => globalThis.fetch(...a),
    location: { href: 'http://localhost/' },
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox, { filename: 'client.js' })
  if (!captured) throw new Error('client.js 未注册 __ModuleLoader__ 模块')
  const module = captured.factory((name) => {
    if (name === 'react') return ctx.React
    throw new Error('未预期的 require: ' + name)
  })
  return { module, ...ctx, document: dom.document, body: dom.body, dom }
}

// ---------- 构造任务数据（形状对齐 index.js toSummary）----------
export function buildTasks(answers = {}) {
  const now = Date.now()
  return [
    {
      id: 't_test_clarify', title: '商城首页改版需求确认', description: '首页要改版，具体范围待确认。',
      acceptance: '首页新样式上线且不影响下单主流程。',
      status: 'clarify', statusLabel: '待澄清', color: '#ec4899',
      createdAt: now - 3600e3, updatedAt: now - 60e3,
      plan: '', planDraft: '先澄清范围，再出实施计划。',
      questions: [
        { id: 'q1', q: '本次首页改版的范围是仅移动端，还是移动端 + PC 端一起改？', why: '影响工作量与联调排期，范围不同工期差一倍', answer: answers.q1 || '' },
        { id: 'q2', q: '新版首页是否需要保留现有的活动楼层入口？', why: '运营侧依赖该入口做日常投放', answer: answers.q2 || '' },
        { id: 'q3', q: '是否需要同步改造首页的埋点方案？', why: '埋点变更需要数据侧配合，需要提前约人', answer: answers.q3 || '' },
      ],
      relatedSessions: [], screenshots: [], reviewReport: null, reviewClean: false,
      autoRun: true, autoConfirm: true, running: false,
      sourceSessionId: 'sess_clarify_demo01', repoPath: '~/gitlab1/store_cn_product_center',
    },
    {
      id: 't_test_done', title: '已完成任务（回归对照）', status: 'done', statusLabel: '已完成', color: '#22c55e',
      createdAt: now - 7200e3, updatedAt: now - 3600e3, questions: [], screenshots: [],
      reviewReport: { passed: true, issues: [], verdict: '全部验收项通过' }, reviewClean: true,
      relatedSessions: [], running: false,
    },
  ]
}

/** 让插件 store 拿到构造数据：假 fetch 响应 tasks-list。 */
export function stubFetch(sandbox, tasks) {
  sandbox.fetch = (url, opts) => {
    const body = opts && opts.body ? JSON.parse(opts.body) : {}
    const method = String(url).split('/api/')[1]
    if (method === 'tasks-list') {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({
          ok: true, tasks, counts: { clarify: 1, done: 1 }, persistenceOk: true,
        }),
      })
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, body }) })
  }
}

// ---------- 对外：渲染面板并返回 root 元素 ----------
export async function renderPanel(opts = {}) {
  const ctx = loadClientModule()
  const { module, React, rt, document, body } = ctx
  const tasks = opts.tasks || buildTasks(opts.answers || {})
  ctx.sandboxTasks = tasks

  const registered = []
  const fakeCtx = {
    slots: {
      // 记录插件注册到各 slot 的组件：['sidebar.footer.action', 'shell.overlay'] 按顺序
      inject(slot, fn) { registered.push({ slot, ...fn() }) },
      register(spec, comp) { return { spec, component: comp } },
    },
    sessions: {},
    effect() {}, on() {},
  }
  // 让插件内部的 rpc 拿到构造数据
  const g = globalThis
  const origFetch = g.fetch
  g.fetch = (url, o) => {
    const method = String(url).split('/api/')[1]
    if (method === 'tasks-list') {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({
          ok: true, tasks, counts: { clarify: 1, done: 1 }, persistenceOk: true,
          labels: { todo: '待领取', clarify: '待澄清', confirm: '待确认', develop: '开发中', paused: '暂停中', review: '复核中', done: '已完成' },
          colors: { todo: '#94a3b8', clarify: '#ec4899', confirm: '#f59e0b', develop: '#3b82f6', paused: '#f97316', review: '#8b5cf6', done: '#22c55e' },
          order: ['todo', 'clarify', 'confirm', 'develop', 'paused', 'review', 'done'],
        }),
      })
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) })
  }
  module.apply(fakeCtx)
  await new Promise((r) => setTimeout(r, 10))

  const sidebar = registered.find((r) => r.slot === 'sidebar.footer.action')
  const drawer = registered.find((r) => r.slot === 'shell.overlay') || registered.find((r) => r.component)
  if (!drawer) { if (origFetch === undefined) delete g.fetch; else g.fetch = origFetch; throw new Error('未捕获 shell.overlay 组件') }

  // 组件实例槽位表按「渲染期调用序号」分配，多根节点共享，保证展开态等 useState 跨重渲染保持。
  const instanceMap = new Map()
  const renderer = createRenderer({ React, rt, effects: ctx.effects, document }, instanceMap)
  let seq = 0
  const renderWith = (resolve, root) => {
    seq = 0
    renderer.render(resolve(React), root)
    renderer.flushEffects()
  }
  const rerender = () => {
    renderWith((R) => R.createElement(drawer.component, { wide: true }), root)
    if (sidebarRoot) renderWith((R) => R.createElement(sidebar.component, { wide: true }), sidebarRoot)
  }
  // 状态更新 → 延后一帧重渲染（避免渲染中同步重入），并做稳定循环直到不再有更新
  let pending = false
  rt.scheduleRender = () => {
    if (pending) return
    pending = true
    queueMicrotask(() => {
      pending = false
      try { rerender() } catch (e) { console.error('[harness] 重渲染失败:', e.message) }
    })
  }

  const root = document.createElement('div')
  const sidebarRoot = sidebar ? document.createElement('div') : null
  document.body.appendChild(root)
  if (sidebarRoot) document.body.appendChild(sidebarRoot)
  rerender()
  await new Promise((r) => setTimeout(r, 10))
  rerender()
  // 面板默认收起（store.open=false）：点侧边栏按钮打开，再渲染抽屉 —— 与真实操作一致
  if (sidebarRoot) {
    const btn = sidebarRoot.children[0]
    if (btn && btn.listeners && btn.listeners.click) btn.listeners.click.forEach((f) => f({ stopPropagation() {} }))
    await new Promise((r) => setTimeout(r, 5))
    rerender()
  }

  if (origFetch === undefined) delete g.fetch; else g.fetch = origFetch
  /**
   * 模拟点击（复用 React 语义：onClick 事件处理器同步派发，状态更新触发重渲染）。
   * @param el - 目标 DOM 元素
   * @param type - 事件类型，默认 click
   */
  function click(el, type = 'click') {
    const fns = (el && el.listeners && el.listeners[type]) || []
    const ev = { type, target: el, currentTarget: el, stopPropagation() {}, preventDefault() {} }
    fns.forEach((f) => f(ev))
    return fns.length
  }
  // 状态更新→微任务重渲染→refresh 的 promise 链需要若干事件循环轮次，等待放宽到 40ms
  const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms))
  /** 切换到指定状态 tab（点击后等一帧，让 DOM 反映新的 store）。 */
  async function selectTab(label) {
    // 按类名精确取 tab 按钮（不能用 contains('tp-tab')，否则会命中父容器 .tp-tabs）
    const tab = byClass(root, 'tp-tab').find((e) => textOf(e).startsWith(label))
    if (!tab) throw new Error('未找到 tab: ' + label)
    const n = click(tab)
    await tick()
    return n
  }
  /** 展开第 n 张任务卡（模拟真实点击后等一帧）。 */
  async function expandCard(n = 0) {
    const card = byClass(root, 'tp-card')[n]
    if (!card) throw new Error('未找到第 ' + n + ' 张任务卡；当前卡片数=' + byClass(root, 'tp-card').length)
    const r = click(card)
    await tick()
    return r
  }
  return { root, sidebarRoot, React, rt, rerender, tasks, registered, dom: ctx.dom, click, selectTab, expandCard }
}

// ---------- DOM 工具：查询与样式断言 ----------
export function collect(el, out = []) {
  for (const c of el.children || []) {
    if (c.nodeType === 3) continue
    out.push(c)
    collect(c, out)
  }
  return out
}
export const byClass = (root, cls) => collect(root).filter((e) => String(e.attrs.class || '').split(/\s+/).includes(cls))
export const textOf = (el) => (el.children || []).map((c) => (c.nodeType === 3 ? c.data : textOf(c))).join('')
export function cssRule(css, selector) {
  const m = css.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}'))
  return m ? m[1] : null
}

// ---------- 生成 HTML + 截图 ----------
/**
 * 生成一个自带测量脚本的页面：headless Chrome --dump-dom 时，页面脚本会把关键元素的
 * getComputedStyle 结果写进 #probe 输出，从而在**真实浏览器**里核对字号/字重/边框等验收点。
 */
export function toMeasureHtml(label, root, cssText, dark = false) {
  const base = toHtml({ label }, root, cssText)
    // 暗色实测：覆盖面板主题变量，核对卡片文字在暗底上的对比度（spec §8 O5）
    + (dark ? '<style>.tp-wrap{--tp-bg:#111827 !important;--tp-fg:#e2e8f0 !important;--tp-dim:#94a3b8 !important;--tp-accent:#60a5fa !important;background:#111827 !important;color:#e2e8f0 !important}body{background:#0b1220 !important}</style>' : '')
  const probe = `<script>
(function(){
  function q(sel){ return Array.from(document.querySelectorAll(sel)) }
  function cs(el, props){
    var s = getComputedStyle(el), o = {};
    props.forEach(function(p){ o[p] = s.getPropertyValue(p) })
    return o
  }
  var out = { label: ${JSON.stringify(label)}, dark: ${JSON.stringify(!!dark)}, q: [], progress: [], badge: [], done: [], why: [], title: null, contrast: [] }
  // WCAG 相对亮度与对比度（半透明前景/背景时后退到最近的不透明祖先底色做近似）
  function relLum(rgb){
    var m = String(rgb).match(/[0-9.]+/g); if (!m || m.length < 3) return null
    var c = m.slice(0, 3).map(function(v){ v = Number(v) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) })
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  function ratio(fg, bg){
    var a = relLum(fg), b = relLum(bg); if (a === null || b === null) return null
    var hi = Math.max(a, b), lo = Math.min(a, b)
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
  }
  // 把从根到该元素的所有背景层按 alpha 依次合成，得到实际可见底色
  function parseBg(c){
    var m = String(c).match(/[0-9.]+/g); if (!m) return null
    return { r: Number(m[0]), g: Number(m[1]), b: Number(m[2]), a: m.length > 3 ? Number(m[3]) : 1 }
  }
  function composite(el){
    var layers = [], node = el
    while (node) { var c = parseBg(getComputedStyle(node).backgroundColor); if (c && c.a > 0) layers.push(c); node = node.parentElement }
    var base = { r: 255, g: 255, b: 255, a: 1 }
    for (var i = layers.length - 1; i >= 0; i--) {
      var t = layers[i]
      base = { r: t.r * t.a + base.r * (1 - t.a), g: t.g * t.a + base.g * (1 - t.a), b: t.b * t.a + base.b * (1 - t.a), a: 1 }
    }
    return 'rgb(' + Math.round(base.r) + ', ' + Math.round(base.g) + ', ' + Math.round(base.b) + ')'
  }
  function probeContrast(sel){
    var el = document.querySelector(sel); if (!el) return
    var s = getComputedStyle(el), bg = composite(el)
    out.contrast.push({ sel: sel, color: s.color, base: bg, ratio: ratio(s.color, bg) })
  }
  probeContrast('.tp-clarify-title'); probeContrast('.tp-q-why'); probeContrast('.tp-clarify-progress')
  probeContrast('.tp-badge-clarify'); probeContrast('.tp-q-no'); probeContrast('.tp-q-text')
  q('.tp-clarify-title').forEach(function(el){ out.title = { text: el.textContent.trim(), size: getComputedStyle(el).fontSize } })
  q('.tp-q').forEach(function(el, i){
    out.q.push({
      index: i + 1,
      text: el.querySelector('.tp-q-text') ? el.querySelector('.tp-q-text').textContent : null,
      qText: el.querySelector('.tp-q-text') ? cs(el.querySelector('.tp-q-text'), ['font-size','font-weight','line-height','color']) : null,
      why: el.querySelector('.tp-q-why') ? cs(el.querySelector('.tp-q-why'), ['font-size','color']) : null,
      card: cs(el, ['border-left-width','border-left-color','background-color','border-radius','padding']),
      no: el.querySelector('.tp-q-no') ? cs(el.querySelector('.tp-q-no'), ['background-color','color','font-size','font-weight']) : null,
      ta: el.querySelector('textarea') ? cs(el.querySelector('textarea'), ['font-size','height']) : null
    })
  })
  q('.tp-clarify-progress').forEach(function(el){ out.progress.push({ text: el.textContent.trim(), color: getComputedStyle(el).color, size: getComputedStyle(el).fontSize }) })
  q('.tp-badge-clarify').forEach(function(el){ out.badge.push({ text: el.textContent.trim(), color: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }) })
  try { document.title = 'MEASURED###' + JSON.stringify(out) } catch (e) { document.title = 'MEASURED###err' }
  var d = document.createElement('div'); d.id = 'probe-marker'; d.textContent = 'M'; document.body.appendChild(d)
})()
</script>`
  return base.replace('</body>', probe + '</body>')
}

/** 用 headless Chrome 真实渲染并测量（--dump-dom 拿到注入的 PROBE_JSON）。 */
export function measureInBrowser(html, { dark: forceDark = false } = {}) {
  const dir = join(tmpdir(), 'dsh-clarify-probe-' + Date.now())
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'probe.html')
  writeFileSync(file, html)
  const out = execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    // 强制暗色配色：走 client.js 自带的 prefers-color-scheme: dark 分支
    ...(forceDark ? ['--force-dark-mode', '--enable-features=WebContentsForceDark'] : []),
    '--virtual-time-budget=1500', '--dump-dom', 'file://' + file,
  ], { stdio: 'pipe', maxBuffer: 32 * 1024 * 1024 }).toString()
  rmSync(dir, { recursive: true, force: true })
  const m = out.match(/MEASURED###([^<]*)</)
  if (!m) throw new Error('未从 headless Chrome 取到 PROBE_JSON')
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
}

export function toHtml(ctx, root, cssText) {
  const styleOf = (o) => Object.entries(o || {}).map(([k, v]) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + ':' + v).join(';')
  const walk = (el) => {
    if (el.nodeType === 3) return el.data
    const cls = el.attrs.class ? ' class="' + el.attrs.class + '"' : ''
    const st = el.style && Object.keys(el.style).length ? ' style="' + styleOf(el.style) + '"' : ''
    const attrs = Object.entries(el.attrs)
      .filter(([k]) => !['class'].includes(k))
      .map(([k, v]) => ' ' + k + '="' + String(v).replace(/"/g, '&quot;') + '"').join('')
    const inner = el._html !== undefined ? el._html : (el.children || []).map(walk).join('')
    return '<' + el.tagName.toLowerCase() + cls + st + attrs + '>' + inner + '</' + el.tagName.toLowerCase() + '>'
  }
  return '<!doctype html><html><head><meta charset="utf-8"><style>'
    + 'body{margin:0;background:#f1f5f9;font-family:-apple-system,"PingFang SC",sans-serif;color:#1e293b}'
    + cssText + '</style></head><body>'
    + `<div style="padding:18px"><div style="font-size:13px;color:#64748b;margin-bottom:8px">${ctx.label || ''}</div>${walk(root)}</div>`
    + '</body></html>'
}

export function screenshot(html, outPng, { width = 780, height = 900 } = {}) {
  const dir = join(tmpdir(), 'dsh-clarify-shot-' + Date.now())
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'page.html')
  writeFileSync(file, html)
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
    '--force-device-scale-factor=2',
    `--window-size=${width},${height}`,
    `--screenshot=${outPng}`,
    'file://' + file,
  ], { stdio: 'pipe' })
  rmSync(dir, { recursive: true, force: true })
  return outPng
}

/** 三种验收场景（对应 spec §7.2 A1 / A3 / A2）。 */
export const SCENARIOS = [
  { key: 'a1-未答', answers: {}, label: 'A1：待澄清（3 问全未答）' },
  { key: 'a3-已答', answers: { q1: '仅移动端', q2: '保留活动楼层入口' }, label: 'A3：已答 2/3（已答卡片转绿）' },
  { key: 'a2-全答', answers: { q1: '移动端 + PC 端', q2: '保留', q3: '需要同步改造' }, label: 'A2：全部已答（进度转绿）' },
]

/** 渲染一个场景并展开澄清卡片，返回面板句柄与样式文本（供测试复用）。 */
export async function runScenario({ answers = {}, collapsed = false, dark = false } = {}) {
  const panel = await renderPanel({ tasks: buildTasks(answers) })
  await panel.selectTab('待澄清')          // 切到待澄清 tab（卡片行可见）
  if (!collapsed) await panel.expandCard(0)  // 展开卡片（点开澄清区）
  const cssText = panel.dom.styleRegistry.map((e) => e.textContent).join('\n')
  return { panel, root: panel.root, cssText, dark: !!dark }
}

/** 判断本机是否有可用于截图/测量的 Chrome。 */
export function hasChrome() {
  return existsSync(CHROME)
}

if (process.argv[1] && process.argv[1].endsWith('render-clarify-card.mjs')) {
  const wantPng = process.argv.includes('--png')
  const wantMeasure = process.argv.includes('--measure')
  const wantContrast = process.argv.includes('--contrast')
  const outDir = join(ROOT, 'screenshots', 'clarify-card')
  const scenarios = SCENARIOS
  ;(async () => {
    if (wantPng && !existsSync(outDir)) mkdirSync(outDir, { recursive: true })
    for (const sc of scenarios) {
      const { panel, root, cssText: scenarioCss } = await runScenario(sc)
      const st = scenarioCss
      const cards = byClass(root, 'tp-card')
      const qs = byClass(root, 'tp-q')
      console.log(`[${sc.key}] 卡片数=${cards.length} 澄清卡片数=${qs.length} 进度=${byClass(root, 'tp-clarify-progress').map(textOf).join(',')} 徽章=${byClass(root, 'tp-badge-clarify').map(textOf).join(',')}`)
      if (wantContrast) {
        const light = measureInBrowser(toMeasureHtml(sc.label, root, scenarioCss, false))
        const dark = measureInBrowser(toMeasureHtml(sc.label, root, scenarioCss, false), { dark: true })
        console.log('  对比度实测（前景 vs 实际合成底色，WCAG AA 正文需 ≥4.5）:')
        light.contrast.forEach((c, i) => {
          const d = dark.contrast[i] || {}
          console.log(`    ${c.sel.padEnd(21)} 亮色 ${String(c.ratio).padStart(5)} (${c.color} on ${c.base}) | 暗色 ${String(d.ratio).padStart(5)} (${d.color} on ${d.base})`)
        })
      }
      if (wantMeasure) {
        const m = measureInBrowser(toMeasureHtml(sc.label, root, st))
        console.log('  浏览器实测:')
        m.q.forEach((q) => {
          console.log(`    Q${q.index} 正文 ${q.qText['font-size']}/${q.qText['font-weight']} color=${q.qText.color} | why ${q.why ? q.why['font-size'] : '-'} | 卡片 border-left=${q.card['border-left-width']} ${q.card['border-left-color']} bg=${q.card['background-color']} radius=${q.card['border-radius']}`)
          console.log(`        序号胶囊 bg=${q.no['background-color']} color=${q.no.color} | 作答框 ${q.ta['font-size']} 高=${q.ta.height}`)
        })
        if (m.title) console.log(`    区域标题 ${m.title.size} 「${m.title.text.slice(0, 20)}…」`)
        m.progress.forEach((p) => console.log(`    进度 "${p.text}" color=${p.color} size=${p.size}`))
        m.badge.forEach((b) => console.log(`    徽章 "${b.text}" color=${b.color} bg=${b.bg}`))
      }
      if (wantPng) {
        const html = toHtml({ label: sc.label }, root, st)
        screenshot(html, join(outDir, sc.key + '.png'))
        // 同步落一份 HTML：可用浏览器直接打开，核对字体/间距/配色细节（截图之外的补充证据）
        writeFileSync(join(outDir, sc.key + '.html'), html)
        console.log('  截图 → ' + join(outDir, sc.key + '.png') + '（同目录另有可交互 .html 预览）')
      }
    }
  })().catch((e) => { console.error('渲染失败:', e); process.exit(1) })
}
