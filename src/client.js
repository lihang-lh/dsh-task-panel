// =============================================================
// 老板任务面板 · Client 半部
// 运行环境：浏览器（plain JavaScript，React.createElement，无 JSX）
// 入口：sidebar.footer.action（左侧底部按钮）+ shell.overlay（右侧抽屉）
// =============================================================

return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    const sessions = ctx.get('sessions')

    styles.insert(`
.tp-side-btn{position:relative;display:flex;align-items:center;gap:10px;width:100%;padding:6px 10px;height:44px;border:none;background:transparent;color:inherit;cursor:pointer;border-radius:10px;font-size:13px;transition:background .18s ease,transform .12s ease}
.tp-side-btn:hover{background:rgba(127,127,127,.1)}
.tp-side-btn:active{transform:translateY(1px)}
.tp-side-btn.tp-side-active{background:rgba(59,130,246,.14)}
.tp-side-ic{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;flex-shrink:0;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;box-shadow:0 1px 3px rgba(59,130,246,.35);transition:transform .18s ease,box-shadow .18s ease}
.tp-side-btn:hover .tp-side-ic{transform:scale(1.06);box-shadow:0 2px 6px rgba(59,130,246,.45)}
.tp-side-label{font-weight:600;letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tp-side-badge{margin-left:auto;min-width:18px;height:18px;padding:0 6px;border-radius:9px;background:linear-gradient(135deg,#ef4444,#f97316);color:#fff;font-size:10.5px;font-weight:700;line-height:18px;text-align:center;box-shadow:0 1px 3px rgba(239,68,68,.4);flex-shrink:0}
.tp-side-rail{justify-content:center;padding:6px 0}
.tp-side-rail .tp-side-badge{position:absolute;top:3px;right:8px;margin-left:0;min-width:14px;height:14px;line-height:14px;font-size:9.5px;padding:0 4px;border-radius:7px}
.tp-wrap{position:fixed;inset:0;z-index:1000;font-size:13px;line-height:1.5}
.tp-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.35)}
.tp-drawer{position:absolute;top:0;right:0;bottom:0;max-width:94vw;background:var(--tp-bg,#ffffff);color:var(--tp-fg,#1e293b);box-shadow:-12px 0 40px rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden}
.tp-resize{position:absolute;left:0;top:0;bottom:0;width:6px;cursor:ew-resize;z-index:3;touch-action:none}
.tp-resize:hover,.tp-resize:active{background:rgba(59,130,246,.35)}
.tp-header{display:flex;align-items:center;gap:8px;padding:12px 14px 8px 16px}
.tp-header-title{font-size:15px;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tp-header-actions{display:flex;gap:2px;flex-shrink:0}
.tp-counts-row{display:flex;gap:4px;padding:0 16px 10px;flex-wrap:wrap;border-bottom:1px solid rgba(127,127,127,.2)}
.tp-count-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--tp-dim,#64748b);background:rgba(127,127,127,.1);border-radius:9px;padding:1px 7px;white-space:nowrap}
.tp-dot{display:inline-block;width:8px;height:8px;border-radius:50%;flex-shrink:0}
.tp-icon-btn{border:none;background:transparent;cursor:pointer;font-size:14px;color:inherit;border-radius:6px;padding:6px 8px;flex-shrink:0;line-height:1}
.tp-icon-btn:hover{background:rgba(127,127,127,.15)}
.tp-body{flex:1;overflow-y:auto;padding:10px 16px 16px}
.tp-pub-toggle{width:100%;text-align:left;border:1px dashed rgba(127,127,127,.4);background:transparent;color:inherit;border-radius:8px;padding:8px 10px;cursor:pointer;font-size:13px;margin-bottom:10px}
.tp-pub-toggle:hover{border-color:var(--tp-accent,#3b82f6);color:var(--tp-accent,#3b82f6)}
.tp-pub-body{display:flex;flex-direction:column;gap:8px;margin-bottom:12px;border:1px solid rgba(127,127,127,.25);border-radius:10px;padding:12px}
.tp-input,.tp-textarea{width:100%;box-sizing:border-box;border:1px solid rgba(127,127,127,.35);border-radius:8px;background:transparent;color:inherit;padding:7px 10px;font-size:13px;font-family:inherit}
.tp-input:focus,.tp-textarea:focus{outline:none;border-color:var(--tp-accent,#3b82f6)}
.tp-toggle-row{display:flex;gap:16px;font-size:12px}
.tp-toggle-row label{display:inline-flex;align-items:center;gap:4px;cursor:pointer}
.tp-btn-row{display:flex;gap:8px}
.tp-btn{border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:13px}
.tp-btn:hover{border-color:var(--tp-accent,#3b82f6);color:var(--tp-accent,#3b82f6)}
.tp-btn:disabled{opacity:.5;cursor:not-allowed}
.tp-btn-primary{background:var(--tp-accent,#3b82f6);border-color:var(--tp-accent,#3b82f6);color:#fff}
.tp-btn-primary:hover{color:#fff;opacity:.9}
.tp-hits{display:flex;flex-direction:column;gap:4px;border:1px solid rgba(127,127,127,.2);border-radius:8px;padding:8px;max-height:180px;overflow-y:auto}
.tp-hits-title{font-size:11px;color:var(--tp-dim,#64748b)}
.tp-hit{display:flex;align-items:flex-start;gap:6px;cursor:pointer;font-size:12px}
.tp-hit-title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px}
.tp-hit-reason{color:var(--tp-dim,#64748b);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.tp-msg{font-size:12px;color:var(--tp-accent,#3b82f6)}
.tp-msg.tp-err{color:#ef4444}
.tp-tabs{display:flex;gap:2px;border-bottom:1px solid rgba(127,127,127,.2);padding:0 8px;overflow-x:auto}
.tp-tab{display:inline-flex;align-items:center;gap:6px;border:none;background:transparent;color:var(--tp-dim,#64748b);cursor:pointer;padding:9px 10px;font-size:13px;border-bottom:2px solid transparent;white-space:nowrap}
.tp-tab.tp-active{color:inherit;border-bottom-color:var(--tp-accent,#3b82f6);font-weight:600}
.tp-tab-count{background:rgba(127,127,127,.15);border-radius:9px;padding:0 6px;font-size:11px}
.tp-list{display:flex;flex-direction:column;gap:8px;padding:12px 0 8px}
.tp-empty{color:var(--tp-dim,#64748b);text-align:center;padding:24px 0;font-size:12px}
.tp-card{border:1px solid rgba(127,127,127,.25);border-radius:10px;padding:10px 12px;cursor:pointer}
.tp-card:hover{border-color:rgba(127,127,127,.5)}
.tp-card-row{display:flex;align-items:center;gap:8px}
.tp-card-title{font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tp-card-status{font-size:11px;color:var(--tp-dim,#64748b);white-space:nowrap}
.tp-card-meta{font-size:11px;color:var(--tp-dim,#64748b);margin-top:4px;display:flex;gap:10px;flex-wrap:wrap}
.tp-running{color:var(--tp-accent,#3b82f6);font-weight:600}
.tp-card-body{margin-top:8px;border-top:1px dashed rgba(127,127,127,.25);padding-top:8px;display:flex;flex-direction:column;gap:6px}
.tp-kv{font-size:12px}
.tp-kv b{color:var(--tp-dim,#64748b);font-weight:600;margin-right:6px}
.tp-sec{font-size:12px;white-space:pre-wrap;word-break:break-word}
.tp-sess{display:inline-flex;align-items:center;gap:4px;max-width:100%;border:1px solid rgba(127,127,127,.3);border-radius:12px;padding:2px 8px;font-size:11px;cursor:pointer;margin:2px 4px 2px 0}
.tp-sess:hover{border-color:var(--tp-accent,#3b82f6);color:var(--tp-accent,#3b82f6)}
.tp-sess-t{max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tp-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.tp-hist{font-size:11px;color:var(--tp-dim,#64748b);max-height:150px;overflow-y:auto;display:flex;flex-direction:column;gap:2px}
.tp-hist-item{display:flex;gap:6px}
.tp-footer{padding:8px 16px;border-top:1px solid rgba(127,127,127,.2);font-size:11px;color:var(--tp-dim,#64748b)}
@media (prefers-color-scheme: dark){
  .tp-drawer{--tp-bg:#111827;--tp-fg:#e2e8f0;--tp-dim:#94a3b8;--tp-accent:#60a5fa}
  .tp-backdrop{background:rgba(0,0,0,.5)}
}
@media (prefers-color-scheme: light){
  .tp-drawer{--tp-bg:#ffffff;--tp-fg:#1e293b;--tp-dim:#64748b;--tp-accent:#3b82f6}
}
`)

    // ---------- 共享状态 ----------
    let savedWidth = 460
    try {
      const w = Number(window.localStorage.getItem('task-panel-width'))
      if (w >= 320 && w <= 900) savedWidth = w
    } catch (err) { /* localStorage 不可用时忽略 */ }

    const store = {
      tasks: [],
      counts: {},
      order: ['todo', 'confirm', 'develop', 'review', 'done'],
      labels: { todo: '待领取', confirm: '待确认', develop: '开发中', review: '复核中', done: '已完成' },
      colors: {},
      open: false,
      tab: 'todo',
      width: savedWidth,
      persistenceOk: true,
    }
    const listeners = new Set()
    function setStore(patch) {
      Object.assign(store, patch)
      listeners.forEach(function (fn) { fn() })
    }
    function subscribe(fn) {
      listeners.add(fn)
      return function () { listeners.delete(fn) }
    }
    function useStore() {
      const [, force] = React.useState(0)
      React.useEffect(function () { return subscribe(function () { force(function (n) { return n + 1 }) }) }, [])
      return store
    }
    async function refresh() {
      try {
        const r = await host.call('tasks.list', {})
        if (r && r.ok) {
          setStore({ tasks: r.tasks || [], counts: r.counts || {}, labels: r.labels || store.labels, colors: r.colors || store.colors, order: r.order || store.order, persistenceOk: r.persistenceOk !== false })
        }
      } catch (err) {
        console.error('[task-panel] 刷新失败', err)
      }
    }
    function closePanel() {
      setStore({ open: false })
    }

    // ---------- 工具 ----------
    function currentSession(props) {
      // SnapshotSelectorHook：useSessions((s) => s.current)；防御性兼容各种返回形态
      if (props && typeof props.useSessions === 'function') {
        try {
          const raw = props.useSessions(function (s) { return s })
          if (typeof raw === 'string' && raw) return raw
          if (raw && typeof raw === 'object') {
            const c = raw.current || raw.id || raw.sessionId
            if (typeof c === 'string' && c) return c
          }
        } catch (err) { /* ignore */ }
      }
      if (props && typeof props.sessionId === 'string' && props.sessionId) return props.sessionId
      return undefined
    }
    function relTime(iso) {
      if (!iso) return ''
      const diff = Date.now() - new Date(iso).getTime()
      const m = Math.floor(diff / 60000)
      if (m < 1) return '刚刚'
      if (m < 60) return m + ' 分钟前'
      const h = Math.floor(m / 60)
      if (h < 24) return h + ' 小时前'
      return Math.floor(h / 24) + ' 天前'
    }
    // 拖拽抽屉左边缘调整宽度（pointer capture，不依赖 window/document 全局）
    function onDragStart(e) {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startW = store.width
      const el = e.currentTarget
      const onMove = function (ev) {
        const w = startW + (startX - ev.clientX)
        setStore({ width: Math.max(320, Math.min(900, Math.round(w))) })
      }
      const onUp = function () {
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerup', onUp)
        try { window.localStorage.setItem('task-panel-width', String(store.width)) } catch (err) { /* ignore */ }
        try { el.releasePointerCapture(e.pointerId) } catch (err) { /* ignore */ }
      }
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', onUp)
      try { el.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ }
    }

    // ---------- 组件：发布区 ----------
    const EMPTY_ITEMS = []
    function PublishBox(props) {
      const sid = props.sid
      const repos = props.repos || []
      const [open, setOpen] = React.useState(false)
      const [title, setTitle] = React.useState('')
      const [desc, setDesc] = React.useState('')
      const [acc, setAcc] = React.useState('')
      const [autoRun, setAutoRun] = React.useState(true)
      const [autoConfirm, setAutoConfirm] = React.useState(true)
      const [hits, setHits] = React.useState([])
      const [selected, setSelected] = React.useState({})
      const [scanning, setScanning] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [msg, setMsg] = React.useState('')
      const [err, setErr] = React.useState(false)
      const [repo, setRepo] = React.useState('')

      const scan = async () => {
        if (!title.trim()) { setErr(true); setMsg('请先填写任务标题再扫描'); return }
        setScanning(true); setErr(false); setMsg('')
        try {
          const r = await host.call('tasks.scan', { query: title + ' ' + desc, limit: 8 })
          if (r && r.ok) {
            setHits(r.hits || [])
            const sel = {}
            ;(r.hits || []).slice(0, 3).forEach(function (h) { sel[h.id] = true })
            setSelected(sel)
          }
        } catch (e) { setErr(true); setMsg('扫描失败: ' + (e && e.message || e)) }
        setScanning(false)
      }

      const submit = async () => {
        if (!title.trim()) return
        setBusy(true); setErr(false); setMsg('')
        try {
          const related = hits.filter(function (h) { return selected[h.id] }).map(function (h) { return { id: h.id, title: h.title, reason: h.reason } })
          // 只带 JSON 字段，绝不携带 undefined（host.call 会拒绝）
          const payload = { title: title, description: desc, acceptance: acc, autoRun: autoRun, autoConfirm: autoConfirm }
          if (typeof sid === 'string' && sid) payload.sessionId = sid
          if (repo) payload.repoPath = repo
          if (related.length > 0) payload.related = related
          const r = await host.call('tasks.create', payload)
          if (r && r.ok) {
            setTitle(''); setDesc(''); setAcc(''); setHits([]); setSelected({})
            setMsg('已发布「' + r.task.title + '」→ ' + r.task.statusLabel)
            setOpen(false)
            refresh()
          } else {
            setErr(true); setMsg(r && r.error || '发布失败')
          }
        } catch (e) { setErr(true); setMsg('发布失败: ' + (e && e.message || e)) }
        setBusy(false)
      }

      return React.createElement('div', { className: 'tp-publish' }, [
        React.createElement('button', { className: 'tp-pub-toggle', onClick: function () { setOpen(!open) } }, open ? '▾ 收起发布区' : '▸ 发布新任务'),
        open ? React.createElement('div', { className: 'tp-pub-body' }, [
          React.createElement('input', { className: 'tp-input', placeholder: '任务标题（必填）', value: title, onChange: function (e) { setTitle(e.target.value) } }),
          React.createElement('textarea', { className: 'tp-textarea', rows: 2, placeholder: '需求描述（可选）', value: desc, onChange: function (e) { setDesc(e.target.value) } }),
          React.createElement('textarea', { className: 'tp-textarea', rows: 2, placeholder: '验收标准（可选）', value: acc, onChange: function (e) { setAcc(e.target.value) } }),
          React.createElement('select', { className: 'tp-input', value: repo, onChange: function (e) { setRepo(e.target.value) } }, [
            React.createElement('option', { key: 'auto', value: '' }, '目标仓库：自动识别（默认发布会话所在仓库）'),
            repos.map(function (w) {
              return React.createElement('option', { key: w.value, value: w.value }, w.label + ' · ' + w.value)
            }),
          ]),
          React.createElement('div', { className: 'tp-toggle-row' }, [
            React.createElement('label', null, [
              React.createElement('input', { type: 'checkbox', checked: autoRun, onChange: function (e) { setAutoRun(e.target.checked) } }),
              '自动执行（插件领取并调度）',
            ]),
            React.createElement('label', null, [
              React.createElement('input', { type: 'checkbox', checked: autoConfirm, onChange: function (e) { setAutoConfirm(e.target.checked) } }),
              '自动确认计划',
            ]),
          ]),
          React.createElement('div', { className: 'tp-btn-row' }, [
            React.createElement('button', { className: 'tp-btn', onClick: scan, disabled: scanning }, scanning ? '扫描中…' : '🔍 扫描关联会话'),
            React.createElement('button', { className: 'tp-btn tp-btn-primary', onClick: submit, disabled: busy }, busy ? '发布中…' : '🚀 发布任务'),
          ]),
          hits.length > 0 ? React.createElement('div', { className: 'tp-hits' }, [
            React.createElement('div', { className: 'tp-hits-title' }, '找到的相关历史会话（默认勾选前 3 个，可调整）'),
            hits.map(function (h) {
              return React.createElement('label', { key: h.id, className: 'tp-hit' }, [
                React.createElement('input', { type: 'checkbox', checked: !!selected[h.id], onChange: function (e) {
                  const sel = Object.assign({}, selected)
                  if (e.target.checked) sel[h.id] = true; else delete sel[h.id]
                  setSelected(sel)
                } }),
                React.createElement('span', { className: 'tp-hit-title' }, h.title),
                React.createElement('span', { className: 'tp-hit-reason' }, h.reason),
              ])
            }),
          ]) : null,
          msg ? React.createElement('div', { className: 'tp-msg' + (err ? ' tp-err' : '') }, msg) : null,
        ]) : null,
      ])
    }

    // ---------- 组件：任务卡片 ----------
    function TaskCard(props) {
      const task = props.task
      const sid = props.sid
      const [expanded, setExpanded] = React.useState(false)
      const [note, setNote] = React.useState('')
      const [busy, setBusy] = React.useState('')
      const [err, setErr] = React.useState('')

      const act = async (action) => {
        setBusy(action); setErr('')
        try {
          const payload = { taskId: task.id, action: action }
          if (note) payload.note = note
          if (typeof sid === 'string' && sid) payload.sessionId = sid
          const r = await host.call('tasks.action', payload)
          if (r && r.ok) { setNote('') } else { setErr(r && r.error || '操作失败') }
          refresh()
        } catch (e) { setErr('操作失败: ' + (e && e.message || e)) }
        setBusy('')
      }

      const actions = []
      if (task.status === 'todo') {
        actions.push({ label: '🚀 领取并规划', action: 'claim', primary: true })
        actions.push({ label: '🗑 删除', action: 'delete' })
      } else if (task.status === 'confirm') {
        actions.push({ label: '✅ 确认计划', action: 'confirm', primary: true })
        actions.push({ label: '↩️ 打回', action: 'reject' })
      } else if (task.status === 'develop') {
        actions.push({ label: '🔄 重新执行', action: 'rerun' })
      } else if (task.status === 'review') {
        actions.push({ label: '✅ 验收通过', action: 'accept', primary: true })
        actions.push({ label: '↩️ 打回开发', action: 'reopen' })
        actions.push({ label: '🔄 重新复核', action: 'rerun' })
      } else if (task.status === 'done') {
        actions.push({ label: '↩️ 重新打开', action: 'reopen' })
      }
      const needNote = task.status === 'confirm' || task.status === 'review' || task.status === 'done'

      return React.createElement('div', { className: 'tp-card', onClick: function () { setExpanded(!expanded) } }, [
        React.createElement('div', { className: 'tp-card-row' }, [
          React.createElement('span', { className: 'tp-dot', style: { background: task.color || '#94a3b8' } }),
          React.createElement('span', { className: 'tp-card-title' }, task.title),
          React.createElement('span', { className: 'tp-card-status' }, task.statusLabel),
          React.createElement('span', null, expanded ? '▴' : '▾'),
        ]),
        React.createElement('div', { className: 'tp-card-meta' }, [
          task.running ? React.createElement('span', { className: 'tp-running' }, '⏳ ' + (task.status === 'todo' ? '规划中…' : task.status === 'develop' ? '执行中…' : '处理中…')) : null,
          React.createElement('span', null, '更新于 ' + relTime(task.updatedAt)),
          task.repoPath ? React.createElement('span', null, '仓库 ' + task.repoPath) : null,
          task.sourceSessionId ? React.createElement('span', null, '来源会话 ' + String(task.sourceSessionId).slice(0, 12) + '…') : null,
          (task.relatedSessions || []).length > 0 ? React.createElement('span', null, '关联 ' + task.relatedSessions.length + ' 个会话') : null,
        ]),
        expanded ? React.createElement('div', { className: 'tp-card-body' }, [
          task.description ? React.createElement('div', { className: 'tp-sec' }, [React.createElement('div', { className: 'tp-kv' }, React.createElement('b', null, '需求')), task.description]) : null,
          task.acceptance ? React.createElement('div', { className: 'tp-sec' }, [React.createElement('div', { className: 'tp-kv' }, React.createElement('b', null, '验收标准')), task.acceptance]) : null,
          task.plan ? React.createElement('div', { className: 'tp-sec' }, [React.createElement('div', { className: 'tp-kv' }, React.createElement('b', null, '实施计划')), task.plan]) : null,
          task.summary ? React.createElement('div', { className: 'tp-sec' }, [React.createElement('div', { className: 'tp-kv' }, React.createElement('b', null, '实现摘要')), task.summary]) : null,
          task.reviewReport ? React.createElement('div', { className: 'tp-sec' }, [
            React.createElement('div', { className: 'tp-kv' }, React.createElement('b', null, '复核报告')),
            '结论：' + (task.reviewReport.passed ? '✅ 通过' : '❌ 未通过') + (task.reviewReport.verdict ? '（' + task.reviewReport.verdict + '）' : ''),
            (task.reviewReport.issues || []).length > 0 ? '；问题：' + task.reviewReport.issues.join('；') : '',
          ]) : null,
          (task.relatedSessions || []).length > 0 ? React.createElement('div', { className: 'tp-kv' }, [
            React.createElement('b', null, '关联会话'),
            task.relatedSessions.map(function (r) {
              return React.createElement('span', { key: r.id, className: 'tp-sess', title: r.reason, onClick: function (e) {
                e.stopPropagation()
                if (sessions !== undefined) sessions.open(r.id)
              } }, [
                React.createElement('span', { className: 'tp-dot', style: { background: '#64748b' } }),
                React.createElement('span', { className: 'tp-sess-t' }, r.title),
              ])
            }),
          ]) : null,
          (task.history || []).length > 0 ? React.createElement('div', { className: 'tp-hist' }, [
            React.createElement('div', { className: 'tp-kv' }, React.createElement('b', null, '时间线')),
            task.history.map(function (h, i) {
              return React.createElement('div', { key: i, className: 'tp-hist-item' }, [
                React.createElement('span', null, relTime(h.at)),
                React.createElement('span', null, h.note),
              ])
            }),
          ]) : null,
          actions.length > 0 ? React.createElement('div', { className: 'tp-actions', onClick: function (e) { e.stopPropagation() } }, [
            needNote ? React.createElement('input', { className: 'tp-input', style: { flex: 1, minWidth: 120 }, placeholder: '打回/反馈附言（可选）', value: note, onChange: function (e) { setNote(e.target.value) } }) : null,
            actions.map(function (btn) {
              return React.createElement('button', {
                key: btn.action,
                className: 'tp-btn' + (btn.primary ? ' tp-btn-primary' : ''),
                disabled: busy === btn.action,
                onClick: function () { act(btn.action) },
              }, busy === btn.action ? '处理中…' : btn.label)
            }),
          ]) : null,
          err ? React.createElement('div', { className: 'tp-msg tp-err' }, err) : null,
        ]) : null,
      ])
    }

    // ---------- 组件：抽屉主体 ----------
    function DrawerBody(props) {
      const st = useStore()
      const sid = currentSession(props)
      const repos = (function () {
        if (props && typeof props.useWorkspaces === 'function') {
          try {
            const ws = props.useWorkspaces(function (s) { return s ? s.items : EMPTY_ITEMS })
            if (Array.isArray(ws)) return ws.map(function (w) { return { value: w.path, label: w.title || w.path } })
          } catch (err) { /* ignore */ }
        }
        return []
      })()
      const badge = (st.counts.todo || 0) + (st.counts.confirm || 0) + (st.counts.review || 0)
      return React.createElement('div', { className: 'tp-wrap' }, [
        React.createElement('div', { className: 'tp-backdrop', onClick: closePanel }),
        React.createElement('div', { className: 'tp-drawer', style: { width: st.width + 'px' } }, [
          React.createElement('div', { className: 'tp-resize', title: '拖拽调整宽度', onPointerDown: onDragStart }),
          React.createElement('div', { className: 'tp-header' }, [
            React.createElement('span', { className: 'tp-header-title' }, '📋 任务面板' + (badge > 0 ? '（' + badge + ' 件待处理）' : '') + (st.persistenceOk === false ? ' ⚠️' : '')),
            React.createElement('div', { className: 'tp-header-actions' }, [
              React.createElement('button', { className: 'tp-icon-btn', title: '刷新', onClick: refresh }, '🔄'),
              React.createElement('button', { className: 'tp-icon-btn', title: '关闭面板', onClick: closePanel }, '✕'),
            ]),
          ]),
          React.createElement('div', { className: 'tp-counts-row' }, [
            st.order.map(function (s) {
              return React.createElement('span', { key: s, className: 'tp-count-chip' }, [
                React.createElement('span', { className: 'tp-dot', style: { background: (st.colors && st.colors[s]) || '#94a3b8' } }),
                ((st.labels && st.labels[s]) || s) + ' ' + ((st.counts && st.counts[s]) || 0),
              ])
            }),
          ]),
          React.createElement('div', { className: 'tp-body' }, [
            React.createElement(PublishBox, { key: 'pb', sid: sid, repos: repos }),
            React.createElement('div', { className: 'tp-tabs' }, [
              st.order.map(function (s) {
                return React.createElement('button', {
                  key: s,
                  className: 'tp-tab' + (st.tab === s ? ' tp-active' : ''),
                  onClick: function () { setStore({ tab: s }) },
                }, [
                  React.createElement('span', { className: 'tp-dot', style: { background: (st.colors && st.colors[s]) || '#94a3b8' } }),
                  (st.labels && st.labels[s]) || s,
                  React.createElement('span', { className: 'tp-tab-count' }, (st.counts && st.counts[s]) || 0),
                ])
              }),
            ]),
            React.createElement('div', { className: 'tp-list' }, [
              st.tasks.filter(function (t) { return t.status === st.tab }).map(function (t) {
                return React.createElement(TaskCard, { key: t.id, task: t, sid: sid })
              }),
              st.tasks.filter(function (t) { return t.status === st.tab }).length === 0
                ? React.createElement('div', { className: 'tp-empty' }, '这里空空如也' + (st.tab === 'todo' ? '，点击上方「发布新任务」开始' : ''))
                : null,
            ]),
          ]),
          React.createElement('div', { className: 'tp-footer' }, st.persistenceOk === false
            ? '⚠️ 数据保存失败（tasks.json 写入被拒），任务在重启后会丢失 —— 请检查沙箱策略'
            : '发布时可指定目标仓库 · 拖拽左边缘调宽度 · 阶段自动流转：领取 → 规划 → 开发 → 复核 → 待你验收'),
        ]),
      ])
    }

    // ---------- 组件：侧边栏按钮 ----------
    function SidebarButton(props) {
      const st = useStore()
      const badge = (st.counts.todo || 0) + (st.counts.confirm || 0) + (st.counts.review || 0)
      return React.createElement('button', {
        className: 'tp-side-btn' + (props.wide ? '' : ' tp-side-rail') + (st.open ? ' tp-side-active' : ''),
        title: '任务面板' + (badge > 0 ? '（' + badge + ' 件待处理）' : ''),
        onClick: function () { setStore({ open: !st.open }) },
      }, [
        React.createElement('span', { className: 'tp-side-ic' }, [
          React.createElement('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, [
            React.createElement('rect', { x: 3, y: 4, width: 18, height: 16, rx: 3 }),
            React.createElement('path', { d: 'M8 8.5 L10 10.5 L16 6' }),
          ]),
        ]),
        props.wide ? React.createElement('span', { className: 'tp-side-label' }, '任务面板') : null,
        badge > 0 ? React.createElement('span', { className: 'tp-side-badge' }, badge > 99 ? '99+' : badge) : null,
      ])
    }

    // ---------- 注册 ----------
    slots.inject('sidebar.footer.action', function () {
      return slots.register({ name: 'sidebar.footer.action', id: 'task-panel-open', order: 10 }, function (props) {
        return React.createElement(SidebarButton, { wide: props.wide })
      })
    })

    slots.inject('shell.overlay', function () {
      return slots.register({ name: 'shell.overlay', id: 'task-panel-drawer', order: 9500 }, function (props) {
        return React.createElement(DrawerBody, props)
      })
    })

    // ---------- 轮询 ----------
    refresh()
    ctx.interval(refresh, 8000)
    console.log('[task-panel] Client 已就绪')
  },
}
