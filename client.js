/*
 * dsh-task-panel — 老板任务面板（浏览器端 client bundle）
 *
 * 手写 bundle 遵循 DSH client-modules 协议：
 *   window.__ModuleLoader__.load({ id, factory })，
 *   factory(require) 返回 module.exports = { inject, apply }。
 *
 * 与 Host 的通信走 HTTP：fetch("/dsh-task-panel/api/<method>")。
 *
 * 图标：内置 Feather/Lucide 风格线性 stroke SVG（24×24、currentColor、
 * strokeWidth 2），零外部依赖、CSP 安全、离线可用。
 */
window.__ModuleLoader__.load({
  id: "dsh-task-panel",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");

    var STYLE_ID = "dsh-task-panel-style";
    var CSS_TEXT = [
      ".tp-side-btn{position:relative;display:flex;align-items:center;gap:10px;width:100%;padding:6px 10px;height:44px;border:none;background:transparent;color:inherit;cursor:pointer;border-radius:10px;font-size:13px;transition:background .18s ease,transform .12s ease}",
      ".tp-side-btn:hover{background:rgba(127,127,127,.1)}",
      ".tp-side-btn:active{transform:translateY(1px)}",
      ".tp-side-btn.tp-side-active{background:rgba(59,130,246,.14)}",
      ".tp-side-ic{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;flex-shrink:0;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;box-shadow:0 1px 3px rgba(59,130,246,.35);transition:transform .18s ease,box-shadow .18s ease}",
      ".tp-side-btn:hover .tp-side-ic{transform:scale(1.06);box-shadow:0 2px 6px rgba(59,130,246,.45)}",
      ".tp-side-label{font-weight:600;letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".tp-side-badge{margin-left:auto;min-width:18px;height:18px;padding:0 6px;border-radius:9px;background:linear-gradient(135deg,#ef4444,#f97316);color:#fff;font-size:10.5px;font-weight:700;line-height:18px;text-align:center;box-shadow:0 1px 3px rgba(239,68,68,.4);flex-shrink:0}",
      ".tp-side-rail{justify-content:center;padding:6px 0}",
      ".tp-side-rail .tp-side-badge{position:absolute;top:3px;right:8px;margin-left:0;min-width:14px;height:14px;line-height:14px;font-size:9.5px;padding:0 4px;border-radius:7px}",
      ".tp-wrap{position:fixed;inset:0;z-index:1000;font-size:13px;line-height:1.5}",
      ".tp-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.35)}",
      ".tp-drawer{position:absolute;top:0;right:0;bottom:0;max-width:94vw;background:var(--tp-bg,#ffffff);color:var(--tp-fg,#1e293b);box-shadow:-12px 0 40px rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden}",
      ".tp-resize{position:absolute;left:0;top:0;bottom:0;width:6px;cursor:ew-resize;z-index:3;touch-action:none}",
      ".tp-resize:hover,.tp-resize:active{background:rgba(59,130,246,.35)}",
      ".tp-header{display:flex;align-items:center;gap:8px;padding:12px 14px 8px 16px}",
      ".tp-header-title{font-size:15px;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:6px}",
      ".tp-header-actions{display:flex;gap:2px;flex-shrink:0}",
      ".tp-counts-row{display:flex;gap:4px;padding:0 16px 10px;flex-wrap:wrap;border-bottom:1px solid rgba(127,127,127,.2)}",
      ".tp-count-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--tp-dim,#64748b);background:rgba(127,127,127,.1);border-radius:9px;padding:1px 7px;white-space:nowrap}",
      ".tp-dot{display:inline-block;width:8px;height:8px;border-radius:50%;flex-shrink:0}",
      ".tp-icon-btn{border:none;background:transparent;cursor:pointer;font-size:14px;color:inherit;border-radius:6px;padding:6px 8px;flex-shrink:0;line-height:1;display:inline-flex;align-items:center;justify-content:center}",
      ".tp-icon-btn:hover{background:rgba(127,127,127,.15)}",
      ".tp-body{flex:1;overflow-y:auto;padding:10px 16px 16px}",
      ".tp-pub-btn{width:100%;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px dashed rgba(127,127,127,.4);background:transparent;color:inherit;border-radius:8px;padding:8px 10px;cursor:pointer;font-size:13px;margin-bottom:10px;transition:border-color .18s ease,color .18s ease}",
      ".tp-pub-btn:hover{border-color:var(--tp-accent,#3b82f6);color:var(--tp-accent,#3b82f6)}",
      ".tp-input,.tp-textarea{width:100%;box-sizing:border-box;border:1px solid rgba(127,127,127,.35);border-radius:8px;background:transparent;color:inherit;padding:7px 10px;font-size:13px;font-family:inherit}",
      ".tp-input:focus,.tp-textarea:focus{outline:none;border-color:var(--tp-accent,#3b82f6)}",
      ".tp-toggle-row{display:flex;gap:16px;font-size:12px}",
      ".tp-toggle-row label{display:inline-flex;align-items:center;gap:4px;cursor:pointer}",
      ".tp-btn-row{display:flex;gap:8px}",
      ".tp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:13px;transition:border-color .18s ease,color .18s ease}",
      ".tp-btn:hover{border-color:var(--tp-accent,#3b82f6);color:var(--tp-accent,#3b82f6)}",
      ".tp-btn:disabled{opacity:.5;cursor:not-allowed}",
      ".tp-btn-primary{background:var(--tp-accent,#3b82f6);border-color:var(--tp-accent,#3b82f6);color:#fff}",
      ".tp-btn-primary:hover{color:#fff;opacity:.9}",
      ".tp-hits{display:flex;flex-direction:column;gap:4px;border:1px solid rgba(127,127,127,.2);border-radius:8px;padding:8px;max-height:180px;overflow-y:auto}",
      ".tp-hits-title{font-size:11px;color:var(--tp-dim,#64748b)}",
      ".tp-hit{display:flex;align-items:flex-start;gap:6px;cursor:pointer;font-size:12px}",
      ".tp-hit-title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px}",
      ".tp-hit-reason{color:var(--tp-dim,#64748b);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}",
      ".tp-msg{font-size:12px;color:var(--tp-accent,#3b82f6)}",
      ".tp-msg.tp-err{color:#ef4444}",
      ".tp-tabs{display:flex;gap:2px;border-bottom:1px solid rgba(127,127,127,.2);padding:0 8px;overflow-x:auto}",
      ".tp-tab{display:inline-flex;align-items:center;gap:6px;border:none;background:transparent;color:var(--tp-dim,#64748b);cursor:pointer;padding:9px 10px;font-size:13px;border-bottom:2px solid transparent;white-space:nowrap}",
      ".tp-tab.tp-active{color:inherit;border-bottom-color:var(--tp-accent,#3b82f6);font-weight:600}",
      ".tp-tab-count{background:rgba(127,127,127,.15);border-radius:9px;padding:0 6px;font-size:11px}",
      ".tp-list{display:flex;flex-direction:column;gap:8px;padding:12px 0 8px}",
      ".tp-empty{color:var(--tp-dim,#64748b);text-align:center;padding:24px 0;font-size:12px}",
      ".tp-card{border:1px solid rgba(127,127,127,.25);border-radius:10px;padding:10px 12px;cursor:pointer}",
      ".tp-card:hover{border-color:rgba(127,127,127,.5)}",
      ".tp-card-row{display:flex;align-items:center;gap:8px}",
      ".tp-card-title{font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".tp-card-status{font-size:11px;color:var(--tp-dim,#64748b);white-space:nowrap}",
      ".tp-card-meta{font-size:11px;color:var(--tp-dim,#64748b);margin-top:4px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}",
      ".tp-meta-ic{vertical-align:-2px;flex-shrink:0}",
      ".tp-running{color:var(--tp-accent,#3b82f6);font-weight:600;display:inline-flex;align-items:center;gap:5px}",
      ".tp-chev{display:inline-flex;align-items:center;color:var(--tp-dim,#64748b);transition:transform .18s ease;flex-shrink:0}",
      ".tp-chev.tp-chev-open{transform:rotate(180deg)}",
      ".tp-card-body{margin-top:8px;border-top:1px dashed rgba(127,127,127,.25);padding-top:8px;display:flex;flex-direction:column;gap:6px}",
      ".tp-kv{font-size:12px}",
      ".tp-kv b{color:var(--tp-dim,#64748b);font-weight:600;margin-right:6px}",
      ".tp-sec{font-size:12px;white-space:pre-wrap;word-break:break-word}",
      ".tp-kv-line{display:flex;align-items:center;gap:5px;font-size:12px}",
      ".tp-ok{color:#22c55e}",
      ".tp-bad{color:#ef4444}",
      ".tp-warn{color:#ef4444;flex-shrink:0}",
      ".tp-sess{display:inline-flex;align-items:center;gap:4px;max-width:100%;border:1px solid rgba(127,127,127,.3);border-radius:12px;padding:2px 8px;font-size:11px;cursor:pointer;margin:2px 4px 2px 0}",
      ".tp-sess:hover{border-color:var(--tp-accent,#3b82f6);color:var(--tp-accent,#3b82f6)}",
      ".tp-sess-t{max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".tp-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}",
      ".tp-hist{font-size:11px;color:var(--tp-dim,#64748b);max-height:150px;overflow-y:auto;display:flex;flex-direction:column;gap:2px}",
      ".tp-hist-item{display:flex;gap:6px}",
      ".tp-footer{padding:8px 16px;border-top:1px solid rgba(127,127,127,.2);font-size:11px;color:var(--tp-dim,#64748b);display:flex;align-items:center;gap:5px}",
      ".tp-dialog-mask{position:absolute;inset:0;z-index:20;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px}",
      ".tp-dialog{background:var(--tp-bg,#ffffff);color:var(--tp-fg,#1e293b);border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.35);width:min(560px,94vw);max-height:86vh;display:flex;flex-direction:column;overflow:hidden}",
      ".tp-dialog-header{display:flex;align-items:center;gap:8px;padding:14px 16px 10px;border-bottom:1px solid rgba(127,127,127,.2)}",
      ".tp-dialog-title{font-size:14px;font-weight:700;flex:1;display:flex;align-items:center;gap:6px}",
      ".tp-dialog-body{display:flex;flex-direction:column;gap:8px;padding:12px 16px;overflow-y:auto}",
      ".tp-dialog-actions{display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;border-top:1px solid rgba(127,127,127,.2)}",
      ".tp-spin{animation:tp-spin 1s linear infinite}",
      "@keyframes tp-spin{to{transform:rotate(360deg)}}",
      // —— 验收结论 / 截图 / 进度 ——
      ".tp-badge{font-size:10px;font-weight:700;border-radius:8px;padding:1px 7px;white-space:nowrap;flex-shrink:0}",
      ".tp-badge-ok{background:rgba(34,197,94,.15);color:#16a34a}",
      ".tp-badge-bad{background:rgba(239,68,68,.15);color:#dc2626}",
      ".tp-badge-run{background:rgba(59,130,246,.15);color:#2563eb}",
      ".tp-badge-done{background:rgba(34,197,94,.15);color:#16a34a}",
      ".tp-verdict{border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;font-size:12px}",
      ".tp-verdict-ok{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.4)}",
      ".tp-verdict-bad{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.45)}",
      ".tp-verdict-run{background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.35)}",
      ".tp-verdict-line{display:flex;align-items:center;gap:6px;font-weight:700}",
      ".tp-verdict-ok .tp-verdict-line{color:#16a34a}",
      ".tp-verdict-bad .tp-verdict-line{color:#dc2626}",
      ".tp-verdict-run .tp-verdict-line{color:#2563eb}",
      ".tp-verdict-desc{color:var(--tp-dim,#64748b);white-space:pre-wrap;word-break:break-word}",
      ".tp-issue{display:flex;gap:6px;align-items:flex-start;font-size:12px;padding:4px 0;border-bottom:1px dashed rgba(127,127,127,.18)}",
      ".tp-issue:last-child{border-bottom:none}",
      ".tp-issue-tag{font-size:10px;font-weight:700;border-radius:5px;padding:1px 6px;flex-shrink:0;margin-top:1px}",
      ".tp-issue-tag-blocker{background:rgba(239,68,68,.18);color:#dc2626}",
      ".tp-issue-tag-high{background:rgba(249,115,22,.18);color:#ea580c}",
      ".tp-issue-tag-medium{background:rgba(245,158,11,.18);color:#d97706}",
      ".tp-issue-tag-low{background:rgba(127,127,127,.15);color:var(--tp-dim,#64748b)}",
      ".tp-issue-text{flex:1;white-space:pre-wrap;word-break:break-word}",
      ".tp-progress{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--tp-dim,#64748b)}",
      ".tp-progress-bar{flex:1;height:6px;border-radius:3px;background:rgba(127,127,127,.18);overflow:hidden}",
      ".tp-progress-fill{height:100%;border-radius:3px;background:#22c55e;transition:width .3s ease}",
      ".tp-progress-fill.tp-progress-part{background:#f59e0b}",
      ".tp-shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}",
      ".tp-shot{border:1px solid rgba(127,127,127,.3);border-radius:8px;overflow:hidden;cursor:zoom-in;background:rgba(127,127,127,.05)}",
      ".tp-shot img{width:100%;height:110px;object-fit:cover;display:block}",
      ".tp-shot-cap{font-size:10px;color:var(--tp-dim,#64748b);padding:3px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      // —— 验收截图弹窗预览（当前页内，不开新 tab）——
      ".tp-shot-mask{position:absolute;inset:0;z-index:30;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:20px}",
      ".tp-shot-modal{background:var(--tp-bg,#ffffff);color:var(--tp-fg,#1e293b);border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,.45);width:min(1000px,92vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden}",
      ".tp-shot-head{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid rgba(127,127,127,.2)}",
      ".tp-shot-title{font-size:13px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:6px}",
      ".tp-shot-body{flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;background:rgba(127,127,127,.06);padding:12px}",
      ".tp-shot-body img{max-width:100%;max-height:100%;object-fit:contain;display:block;border-radius:6px}",
      ".tp-shot-desc{font-size:11px;color:var(--tp-dim,#64748b);padding:8px 16px;border-top:1px solid rgba(127,127,127,.2);white-space:pre-wrap;word-break:break-word}",
      ".tp-btn:focus-visible,.tp-icon-btn:focus-visible,.tp-tab:focus-visible,.tp-side-btn:focus-visible,.tp-pub-btn:focus-visible{outline:2px solid var(--tp-accent,#3b82f6);outline-offset:1px}",
      "@media (prefers-color-scheme: dark){.tp-wrap{--tp-bg:#111827;--tp-fg:#e2e8f0;--tp-dim:#94a3b8;--tp-accent:#60a5fa}.tp-backdrop{background:rgba(0,0,0,.5)}}",
      "@media (prefers-color-scheme: light){.tp-wrap{--tp-bg:#ffffff;--tp-fg:#1e293b;--tp-dim:#64748b;--tp-accent:#3b82f6}}"
    ].join("\n");

    function ensureStyles() {
      if (typeof document === "undefined") return;
      if (document.getElementById(STYLE_ID)) return;
      var el = document.createElement("style");
      el.id = STYLE_ID;
      el.textContent = CSS_TEXT;
      (document.head || document.documentElement).appendChild(el);
    }

    /** 调用 Host 的 HTTP API */
    function rpc(method, args) {
      return fetch("/dsh-task-panel/api/" + method, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args || {})
      }).then(function (r) { return r.json() });
    }

    // ---------- 内联 SVG 图标（Feather/Lucide 风格，24×24 stroke） ----------
    // 每项：[标签名, 属性]；由 Icon 组件渲染为 <svg> 子元素。全部内联，零外部依赖。
    var ICONS = {
      "plus": [["line", { x1: 12, y1: 5, x2: 12, y2: 19 }], ["line", { x1: 5, y1: 12, x2: 19, y2: 12 }]],
      "send": [["line", { x1: 22, y1: 2, x2: 11, y2: 13 }], ["polygon", { points: "22 2 15 22 11 13 2 9 22 2" }]],
      "search": [["circle", { cx: 11, cy: 11, r: 8 }], ["line", { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }]],
      "rocket": [["path", { d: "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" }], ["path", { d: "M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" }], ["path", { d: "M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" }], ["path", { d: "M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" }]],
      "play": [["polygon", { points: "5 3 19 12 5 21 5 3" }]],
      "pause": [["rect", { x: 6, y: 4, width: 4, height: 16 }], ["rect", { x: 14, y: 4, width: 4, height: 16 }]],
      "check": [["polyline", { points: "20 6 9 17 4 12" }]],
      "check-circle": [["path", { d: "M22 11.08V12a10 10 0 1 1-5.93-9.14" }], ["polyline", { points: "22 4 12 14.01 9 11.01" }]],
      "x-circle": [["circle", { cx: 12, cy: 12, r: 10 }], ["line", { x1: 15, y1: 9, x2: 9, y2: 15 }], ["line", { x1: 9, y1: 9, x2: 15, y2: 15 }]],
      "rotate-ccw": [["polyline", { points: "1 4 1 10 7 10" }], ["path", { d: "M3.51 15a9 9 0 1 0 2.13-9.36L1 10" }]],
      "refresh-cw": [["polyline", { points: "23 4 23 10 17 10" }], ["polyline", { points: "1 20 1 14 7 14" }], ["path", { d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" }]],
      "trash": [["polyline", { points: "3 6 5 6 21 6" }], ["path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }], ["line", { x1: 10, y1: 11, x2: 10, y2: 17 }], ["line", { x1: 14, y1: 11, x2: 14, y2: 17 }]],
      "edit": [["path", { d: "M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" }]],
      "chevron-down": [["polyline", { points: "6 9 12 15 18 9" }]],
      "x": [["line", { x1: 18, y1: 6, x2: 6, y2: 18 }], ["line", { x1: 6, y1: 6, x2: 18, y2: 18 }]],
      "alert-triangle": [["path", { d: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" }], ["line", { x1: 12, y1: 9, x2: 12, y2: 13 }], ["line", { x1: 12, y1: 17, x2: 12.01, y2: 17 }]],
      "clipboard": [["path", { d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" }], ["rect", { x: 8, y: 2, width: 8, height: 4, rx: 1, ry: 1 }]],
      "loader": [["line", { x1: 12, y1: 2, x2: 12, y2: 6 }], ["line", { x1: 12, y1: 18, x2: 12, y2: 22 }], ["line", { x1: 4.93, y1: 4.93, x2: 7.76, y2: 7.76 }], ["line", { x1: 16.24, y1: 16.24, x2: 19.07, y2: 19.07 }], ["line", { x1: 2, y1: 12, x2: 6, y2: 12 }], ["line", { x1: 18, y1: 12, x2: 22, y2: 12 }], ["line", { x1: 4.93, y1: 19.07, x2: 7.76, y2: 16.24 }], ["line", { x1: 16.24, y1: 7.76, x2: 19.07, y2: 4.93 }]],
      "folder": [["path", { d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" }]],
      "clock": [["circle", { cx: 12, cy: 12, r: 10 }], ["polyline", { points: "12 6 12 12 16 14" }]],
      "link": [["path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }], ["path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }]],
      "message-square": [["path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }]],
      "image": [["rect", { x: 3, y: 3, width: 18, height: 18, rx: 2, ry: 2 }], ["circle", { cx: 8.5, cy: 8.5, r: 1.5 }], ["polyline", { points: "21 15 16 10 5 21" }]]
    };

    /** 渲染一个内联 SVG 图标：<Icon name="rocket" size={16} className="..."/> */
    function Icon(props) {
      var items = ICONS[props.name] || [];
      var size = props.size || 16;
      return React.createElement("svg", {
        className: "tp-ic" + (props.className ? " " + props.className : ""),
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": "true"
      }, items.map(function (d, i) {
        return React.createElement(d[0], Object.assign({ key: i }, d[1]));
      }));
    }

    /** 图标+文字按钮（busy 时显示 spinner + 处理中…） */
    function ActionButton(props) {
      return React.createElement("button", {
        className: "tp-btn" + (props.primary ? " tp-btn-primary" : ""),
        disabled: props.busy,
        title: props.title || props.label,
        onClick: props.onClick
      }, [
        props.busy
          ? React.createElement(Icon, { name: "loader", size: 14, className: "tp-spin" })
          : React.createElement(Icon, { name: props.icon || "check", size: 14 }),
        React.createElement("span", null, props.busy ? "处理中…" : props.label)
      ]);
    }

    // ---------- 共享状态 ----------
    var savedWidth = 720;
    try {
      var w = Number(window.localStorage.getItem("task-panel-width"));
      if (w >= 400 && w <= 1100) savedWidth = w;
    } catch (err) { /* ignore */ }

    var store = {
      tasks: [],
      counts: {},
      order: ["todo", "clarify", "confirm", "develop", "paused", "review", "done"],
      labels: { todo: "待领取", clarify: "待澄清", confirm: "待确认", develop: "开发中", paused: "暂停中", review: "复核中", done: "已完成" },
      colors: { todo: "#94a3b8", clarify: "#ec4899", confirm: "#f59e0b", develop: "#3b82f6", paused: "#f97316", review: "#8b5cf6", done: "#22c55e" },
      open: false,
      tab: "todo",
      width: savedWidth,
      persistenceOk: true,
      modal: null // null | {kind:'publish'} | {kind:'edit', taskId} | {kind:'shot', url, caption, name, desc}
    };
    var listeners = [];
    function setStore(patch) {
      for (var k in patch) store[k] = patch[k];
      for (var i = 0; i < listeners.length; i++) listeners[i]();
    }
    function subscribe(fn) {
      listeners.push(fn);
      return function () {
        var idx = listeners.indexOf(fn);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    }
    function useStore() {
      var state = React.useState(0);
      React.useEffect(function () { return subscribe(function () { state[1](function (n) { return n + 1; }); }); }, []);
      return store;
    }
    function refresh() {
      rpc("tasks-list", {}).then(function (r) {
        if (r && r.ok) {
          setStore({
            tasks: r.tasks || [],
            counts: r.counts || {},
            labels: r.labels || store.labels,
            colors: r.colors || store.colors,
            order: r.order || store.order,
            persistenceOk: r.persistenceOk !== false
          });
        }
      }).catch(function (err) { console.error("[task-panel] 刷新失败", err); });
    }
    function closePanel() { setStore({ open: false }); }
    function openModal(m) { setStore({ modal: m }); }
    function closeModal() { setStore({ modal: null }); }

    // ---------- 工具 ----------
    function currentSession(props) {
      if (props && typeof props.useSessions === "function") {
        try {
          var raw = props.useSessions(function (s) { return s; });
          if (typeof raw === "string" && raw) return raw;
          if (raw && typeof raw === "object") {
            var c = raw.current || raw.id || raw.sessionId;
            if (typeof c === "string" && c) return c;
          }
        } catch (err) { /* ignore */ }
      }
      if (props && typeof props.sessionId === "string" && props.sessionId) return props.sessionId;
      return undefined;
    }
    /** 跳转到根会话（发布会话 / 关联会话） */
    function openSession(id) {
      if (!id) return;
      if (exports.sessionOpen) {
        try { exports.sessionOpen(id); } catch (err) { console.error("[task-panel] 打开会话失败", err); }
      }
    }
    /** 跳转到子会话（规划/开发/复核子代理）：优先按目录地址 openSubagent，回退 open */
    function openChildSession(childId) {
      if (!childId) return;
      if (exports.sessionAddress && exports.sessionOpenSubagent) {
        try {
          var addr = exports.sessionAddress(childId);
          if (addr) { exports.sessionOpenSubagent(addr); return; }
        } catch (err) { /* fall through */ }
      }
      openSession(childId);
    }
    function relTime(iso) {
      if (!iso) return "";
      var diff = Date.now() - new Date(iso).getTime();
      var m = Math.floor(diff / 60000);
      if (m < 1) return "刚刚";
      if (m < 60) return m + " 分钟前";
      var h = Math.floor(m / 60);
      if (h < 24) return h + " 小时前";
      return Math.floor(h / 24) + " 天前";
    }
    function onDragStart(e) {
      e.preventDefault();
      e.stopPropagation();
      var startX = e.clientX;
      var startW = store.width;
      var el = e.currentTarget;
      function onMove(ev) {
        var w = startW + (startX - ev.clientX);
        setStore({ width: Math.max(400, Math.min(1100, Math.round(w))) });
      }
      function onUp() {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        try { window.localStorage.setItem("task-panel-width", String(store.width)); } catch (err) { /* ignore */ }
        try { el.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }

    // ---------- 组件：发布弹窗 ----------
    var EMPTY_ITEMS = [];
    function PublishDialog(props) {
      var sid = props.sid;
      var repos = props.repos || [];
      var stTitle = React.useState("");
      var stDesc = React.useState("");
      var stAcc = React.useState("");
      var stAutoRun = React.useState(true);
      var stAutoConfirm = React.useState(true);
      var stHits = React.useState([]);
      var stSelected = React.useState({});
      var stScanning = React.useState(false);
      var stBusy = React.useState(false);
      var stMsg = React.useState("");
      var stErr = React.useState(false);
      var stRepo = React.useState("");
      var title = stTitle[0], setTitle = stTitle[1];
      var desc = stDesc[0], setDesc = stDesc[1];
      var acc = stAcc[0], setAcc = stAcc[1];
      var autoRun = stAutoRun[0], setAutoRun = stAutoRun[1];
      var autoConfirm = stAutoConfirm[0], setAutoConfirm = stAutoConfirm[1];
      var hits = stHits[0], setHits = stHits[1];
      var selected = stSelected[0], setSelected = stSelected[1];
      var scanning = stScanning[0], setScanning = stScanning[1];
      var busy = stBusy[0], setBusy = stBusy[1];
      var msg = stMsg[0], setMsg = stMsg[1];
      var err = stErr[0], setErr = stErr[1];
      var repo = stRepo[0], setRepo = stRepo[1];

      function scan() {
        if (!title.trim()) { setErr(true); setMsg("请先填写任务标题再扫描"); return; }
        setScanning(true); setErr(false); setMsg("");
        rpc("tasks-scan", { query: title + " " + desc, limit: 8 }).then(function (r) {
          if (r && r.ok) {
            setHits(r.hits || []);
            var sel = {};
            (r.hits || []).slice(0, 3).forEach(function (h) { sel[h.id] = true; });
            setSelected(sel);
          }
        }).catch(function (e) { setErr(true); setMsg("扫描失败: " + (e && e.message || e)); })
          .finally(function () { setScanning(false); });
      }

      function submit() {
        if (!title.trim()) return;
        setBusy(true); setErr(false); setMsg("");
        var related = hits.filter(function (h) { return selected[h.id]; })
          .map(function (h) { return { id: h.id, title: h.title, reason: h.reason }; });
        var payload = { title: title, description: desc, acceptance: acc, autoRun: autoRun, autoConfirm: autoConfirm };
        if (typeof sid === "string" && sid) payload.sessionId = sid;
        if (repo) payload.repoPath = repo;
        if (related.length > 0) payload.related = related;
        rpc("tasks-create", payload).then(function (r) {
          if (r && r.ok) {
            // 发布成功：自动关窗并刷新
            setTitle(""); setDesc(""); setAcc(""); setHits([]); setSelected({});
            props.onClose();
            refresh();
          } else {
            setErr(true); setMsg(r && r.error || "发布失败");
          }
        }).catch(function (e) { setErr(true); setMsg("发布失败: " + (e && e.message || e)); })
          .finally(function () { setBusy(false); });
      }

      return React.createElement("div", { className: "tp-dialog-mask", onClick: props.onClose }, [
        React.createElement("div", { className: "tp-dialog", onClick: function (e) { e.stopPropagation(); } }, [
          React.createElement("div", { className: "tp-dialog-header" }, [
            React.createElement("span", { className: "tp-dialog-title" }, [
              React.createElement(Icon, { name: "send", size: 15 }),
              React.createElement("span", null, "发布新任务")
            ]),
            React.createElement("button", { className: "tp-icon-btn", title: "关闭", onClick: props.onClose }, React.createElement(Icon, { name: "x", size: 16 }))
          ]),
          React.createElement("div", { className: "tp-dialog-body" }, [
            React.createElement("input", { className: "tp-input", placeholder: "任务标题（必填）", value: title, onChange: function (e) { setTitle(e.target.value); } }),
            React.createElement("textarea", { className: "tp-textarea", rows: 2, placeholder: "需求描述（可选）", value: desc, onChange: function (e) { setDesc(e.target.value); } }),
            React.createElement("textarea", { className: "tp-textarea", rows: 2, placeholder: "验收标准（可选）", value: acc, onChange: function (e) { setAcc(e.target.value); } }),
            React.createElement("select", { className: "tp-input", value: repo, onChange: function (e) { setRepo(e.target.value); } }, [
              React.createElement("option", { key: "auto", value: "" }, "目标仓库：自动识别（默认发布会话所在仓库）"),
              repos.map(function (w) {
                return React.createElement("option", { key: w.value, value: w.value }, w.label + " · " + w.value);
              })
            ]),
            React.createElement("div", { className: "tp-toggle-row" }, [
              React.createElement("label", null, [
                React.createElement("input", { type: "checkbox", checked: autoRun, onChange: function (e) { setAutoRun(e.target.checked); } }),
                "自动执行（插件领取并调度）"
              ]),
              React.createElement("label", null, [
                React.createElement("input", { type: "checkbox", checked: autoConfirm, onChange: function (e) { setAutoConfirm(e.target.checked); } }),
                "自动确认计划"
              ])
            ]),
            React.createElement("div", { className: "tp-btn-row" }, [
              React.createElement("button", { className: "tp-btn", onClick: scan, disabled: scanning }, [
                scanning
                  ? React.createElement(Icon, { name: "loader", size: 14, className: "tp-spin" })
                  : React.createElement(Icon, { name: "search", size: 14 }),
                React.createElement("span", null, scanning ? "扫描中…" : "扫描关联会话")
              ])
            ]),
            hits.length > 0 ? React.createElement("div", { className: "tp-hits" }, [
              React.createElement("div", { className: "tp-hits-title" }, "找到的相关历史会话（默认勾选前 3 个，可调整）"),
              hits.map(function (h) {
                return React.createElement("label", { key: h.id, className: "tp-hit" }, [
                  React.createElement("input", { type: "checkbox", checked: !!selected[h.id], onChange: function (e) {
                    var sel = Object.assign({}, selected);
                    if (e.target.checked) sel[h.id] = true; else delete sel[h.id];
                    setSelected(sel);
                  } }),
                  React.createElement("span", { className: "tp-hit-title" }, h.title),
                  React.createElement("span", { className: "tp-hit-reason" }, h.reason)
                ]);
              })
            ]) : null,
            msg ? React.createElement("div", { className: "tp-msg" + (err ? " tp-err" : "") }, msg) : null
          ]),
          React.createElement("div", { className: "tp-dialog-actions" }, [
            React.createElement("button", { className: "tp-btn", onClick: props.onClose, disabled: busy }, "取消"),
            React.createElement("button", { className: "tp-btn tp-btn-primary", onClick: submit, disabled: busy || !title.trim() }, [
              busy
                ? React.createElement(Icon, { name: "loader", size: 14, className: "tp-spin" })
                : React.createElement(Icon, { name: "send", size: 14 }),
              React.createElement("span", null, busy ? "发布中…" : "发布任务")
            ])
          ])
        ])
      ]);
    }

    // ---------- 组件：编辑弹窗（仅暂停中的任务） ----------
    function EditDialog(props) {
      var st = useStore();
      var taskId = props.taskId;
      var task = null;
      for (var i = 0; i < st.tasks.length; i++) {
        if (st.tasks[i].id === taskId) { task = st.tasks[i]; break; }
      }
      var stTitle = React.useState(task ? task.title : "");
      var stDesc = React.useState(task ? (task.description || "") : "");
      var stAcc = React.useState(task ? (task.acceptance || "") : "");
      var stBusy = React.useState(false);
      var stMsg = React.useState("");
      var stErr = React.useState(false);
      var title = stTitle[0], setTitle = stTitle[1];
      var desc = stDesc[0], setDesc = stDesc[1];
      var acc = stAcc[0], setAcc = stAcc[1];
      var busy = stBusy[0], setBusy = stBusy[1];
      var msg = stMsg[0], setMsg = stMsg[1];
      var err = stErr[0], setErr = stErr[1];

      function save() {
        if (!title.trim()) { setErr(true); setMsg("任务标题不能为空"); return; }
        setBusy(true); setErr(false); setMsg("");
        var payload = { taskId: taskId, action: "edit", title: title, description: desc, acceptance: acc };
        rpc("tasks-action", payload).then(function (r) {
          if (r && r.ok) {
            props.onClose();
            refresh();
          } else {
            setErr(true); setMsg(r && r.error || "保存失败");
          }
        }).catch(function (e) { setErr(true); setMsg("保存失败: " + (e && e.message || e)); })
          .finally(function () { setBusy(false); });
      }

      return React.createElement("div", { className: "tp-dialog-mask", onClick: props.onClose }, [
        React.createElement("div", { className: "tp-dialog", onClick: function (e) { e.stopPropagation(); } }, [
          React.createElement("div", { className: "tp-dialog-header" }, [
            React.createElement("span", { className: "tp-dialog-title" }, [
              React.createElement(Icon, { name: "edit", size: 15 }),
              React.createElement("span", null, "重新编辑任务")
            ]),
            React.createElement("button", { className: "tp-icon-btn", title: "关闭", onClick: props.onClose }, React.createElement(Icon, { name: "x", size: 16 }))
          ]),
          React.createElement("div", { className: "tp-dialog-body" }, [
            React.createElement("div", { className: "tp-msg" }, "编辑保存后将清空旧计划与产物，后续按新方向重新生成。"),
            React.createElement("input", { className: "tp-input", placeholder: "任务标题（必填）", value: title, onChange: function (e) { setTitle(e.target.value); } }),
            React.createElement("textarea", { className: "tp-textarea", rows: 3, placeholder: "需求描述（可选）", value: desc, onChange: function (e) { setDesc(e.target.value); } }),
            React.createElement("textarea", { className: "tp-textarea", rows: 2, placeholder: "验收标准（可选）", value: acc, onChange: function (e) { setAcc(e.target.value); } }),
            msg ? React.createElement("div", { className: "tp-msg" + (err ? " tp-err" : "") }, msg) : null
          ]),
          React.createElement("div", { className: "tp-dialog-actions" }, [
            React.createElement("button", { className: "tp-btn", onClick: props.onClose, disabled: busy }, "取消"),
            React.createElement("button", { className: "tp-btn tp-btn-primary", onClick: save, disabled: busy || !title.trim() }, [
              busy
                ? React.createElement(Icon, { name: "loader", size: 14, className: "tp-spin" })
                : React.createElement(Icon, { name: "check", size: 14 }),
              React.createElement("span", null, busy ? "保存中…" : "保存")
            ])
          ])
        ])
      ]);
    }

    // ---------- 组件：验收截图预览弹窗 ----------
    function ShotDialog(props) {
      var url = props.url;
      var caption = props.caption || props.name || "验收截图";
      return React.createElement("div", { className: "tp-shot-mask", onClick: props.onClose }, [
        React.createElement("div", { className: "tp-shot-modal", onClick: function (e) { e.stopPropagation(); } }, [
          React.createElement("div", { className: "tp-shot-head" }, [
            React.createElement("span", { className: "tp-shot-title" }, [
              React.createElement(Icon, { name: "image", size: 15 }),
              React.createElement("span", null, caption)
            ]),
            React.createElement("button", { className: "tp-icon-btn", title: "关闭", onClick: props.onClose }, React.createElement(Icon, { name: "x", size: 16 }))
          ]),
          React.createElement("div", { className: "tp-shot-body" }, [
            React.createElement("img", { src: url, alt: caption, onError: function (e) { e.currentTarget.parentNode.style.display = "none"; } })
          ]),
          props.desc ? React.createElement("div", { className: "tp-shot-desc" }, props.desc) : null
        ])
      ]);
    }

    // ---------- 组件：任务卡片 ----------
    // ---------- 验收结论辅助 ----------
    function severityOf(issue) {
      if (/生产阻断|阻断级|致命|严重|无法使用|不可用|安全漏洞|越权/.test(issue)) return "blocker";
      if (/高风险|危险|权限|注入|安全/.test(issue)) return "high";
      if (/中风险|遗留|偏差|未实测|局限|风险|建议/.test(issue)) return "medium";
      return "low";
    }
    function severityLabel(s) { return s === "blocker" ? "阻断" : s === "high" ? "高" : s === "medium" ? "中" : "低"; }
    function issueTag(issue) {
      var m = issue.match(/【([^】]{1,12})】/);
      if (m) return m[1];
      return severityLabel(severityOf(issue));
    }
    // 任务卡上的状态徽标：让老板不展开也能看到「可验收 / 有问题」
    function cardBadge(task) {
      if (task.status === "review") {
        if (task.reviewClean) return { cls: "tp-badge-ok", text: "可验收" };
        return { cls: "tp-badge-bad", text: "有问题" };
      }
      if (task.status === "done") return { cls: "tp-badge-done", text: "已完成" };
      if (task.status === "develop" && task.running) return { cls: "tp-badge-run", text: "执行中" };
      return null;
    }
    // 展开后的验收结论横幅：直观告诉老板「到底有没有完成」
    function VerdictBanner(props) {
      var task = props.task;
      if (task.status === "review") {
        if (task.reviewClean) {
          return React.createElement("div", { className: "tp-verdict tp-verdict-ok" }, [
            React.createElement("div", { className: "tp-verdict-line" }, [
              React.createElement(Icon, { name: "check-circle", size: 15 }),
              React.createElement("span", null, "复核通过 · 无遗留问题 · 可验收")
            ]),
            task.reviewReport && task.reviewReport.verdict
              ? React.createElement("div", { className: "tp-verdict-desc" }, "证据：" + task.reviewReport.verdict)
              : null
          ]);
        }
        var reworkInfo = task.reworkCount > 0
          ? (task.reworkCount >= 3 ? "（已自动打回 " + task.reworkCount + " 轮仍存在问题，请老板决定）" : "（已自动打回开发第 " + task.reworkCount + " 轮）")
          : "";
        return React.createElement("div", { className: "tp-verdict tp-verdict-bad" }, [
          React.createElement("div", { className: "tp-verdict-line" }, [
            React.createElement(Icon, { name: "x-circle", size: 15 }),
            React.createElement("span", null, "复核未通过 · " + ((task.reviewReport && task.reviewReport.issues || []).length) + " 个未解决问题 · 不可验收" + reworkInfo)
          ]),
          React.createElement("div", { className: "tp-verdict-desc" }, "存在未解决问题，必须全部修复并重新复核通过后才能验收。")
        ]);
      }
      if (task.status === "done") {
        return React.createElement("div", { className: "tp-verdict tp-verdict-ok" }, [
          React.createElement("div", { className: "tp-verdict-line" }, [
            React.createElement(Icon, { name: "check-circle", size: 15 }),
            React.createElement("span", null, "已验收通过 · 任务完成")
          ])
        ]);
      }
      if (task.status === "develop") {
        return React.createElement("div", { className: "tp-verdict tp-verdict-run" }, [
          React.createElement("div", { className: "tp-verdict-line" }, [
            React.createElement(Icon, { name: "loader", size: 15, className: "tp-spin" }),
            React.createElement("span", null, "开发中 · 尚未完成，未到验收阶段")
          ])
        ]);
      }
      return null;
    }
    function ProgressBar(props) {
      var p = props.progress;
      if (!p || !p.total) return null;
      var pct = Math.round((p.checked / p.total) * 100);
      var done = p.checked >= p.total;
      return React.createElement("div", { className: "tp-progress" }, [
        React.createElement("span", null, "任务清单 " + p.checked + "/" + p.total + (done ? "（全部完成）" : "（未完成）")),
        React.createElement("div", { className: "tp-progress-bar" }, [
          React.createElement("div", { className: "tp-progress-fill" + (done ? "" : " tp-progress-part"), style: { width: pct + "%" } })
        ])
      ]);
    }

    function TaskCard(props) {
      var st = useStore();
      var task = props.task;
      var sid = props.sid;
      var stExpanded = React.useState(false);
      var stNote = React.useState("");
      var stBusy = React.useState("");
      var stErr = React.useState("");
      var stAns = React.useState({});
      var expanded = stExpanded[0], setExpanded = stExpanded[1];
      var note = stNote[0], setNote = stNote[1];
      var busy = stBusy[0], setBusy = stBusy[1];
      var err = stErr[0], setErr = stErr[1];
      var answers = stAns[0], setAnswers = stAns[1];

      function setAnswer(qid, value) {
        var a = Object.assign({}, answers);
        a[qid] = value;
        setAnswers(a);
      }

      function act(action) {
        setBusy(action); setErr("");
        var payload = { taskId: task.id, action: action };
        if (note) payload.note = note;
        if (typeof sid === "string" && sid) payload.sessionId = sid;
        rpc("tasks-action", payload).then(function (r) {
          if (r && r.ok) setNote(""); else setErr(r && r.error || "操作失败");
          refresh();
        }).catch(function (e) { setErr("操作失败: " + (e && e.message || e)); })
          .finally(function () { setBusy(""); });
      }

      function submitAnswers() {
        var list = (task.questions || []).map(function (q) {
          return { qid: q.id, answer: ((answers[q.id] !== undefined ? answers[q.id] : (q.answer || "")) || "").trim() };
        });
        setBusy("clarify-answer"); setErr("");
        var payload = { taskId: task.id, action: "clarify-answer", answers: list };
        if (typeof sid === "string" && sid) payload.sessionId = sid;
        rpc("tasks-action", payload).then(function (r) {
          if (r && r.ok) setErr(""); else setErr(r && r.error || "操作失败");
          refresh();
        }).catch(function (e) { setErr("操作失败: " + (e && e.message || e)); })
          .finally(function () { setBusy(""); });
      }

      var actions = [];
      if (task.status === "todo") {
        actions.push({ label: "领取并规划", icon: "rocket", action: "claim", primary: true });
        actions.push({ label: "暂停", icon: "pause", action: "pause" });
        actions.push({ label: "删除", icon: "trash", action: "delete" });
      } else if (task.status === "clarify") {
        actions.push({ label: "提交澄清并定稿", icon: "check", action: "clarify-answer", primary: true });
        actions.push({ label: "暂停", icon: "pause", action: "pause" });
        actions.push({ label: "删除", icon: "trash", action: "delete" });
      } else if (task.status === "confirm") {
        actions.push({ label: "确认计划", icon: "check", action: "confirm", primary: true });
        actions.push({ label: "打回", icon: "rotate-ccw", action: "reject" });
        actions.push({ label: "暂停", icon: "pause", action: "pause" });
      } else if (task.status === "develop") {
        actions.push({ label: "暂停", icon: "pause", action: "pause" });
        actions.push({ label: "重新执行", icon: "refresh-cw", action: "rerun" });
      } else if (task.status === "review") {
        actions.push({ label: "验收通过", icon: "check-circle", action: "accept", primary: true });
        actions.push({ label: "打回开发", icon: "rotate-ccw", action: "reopen" });
        actions.push({ label: "重新复核", icon: "refresh-cw", action: "rerun" });
        actions.push({ label: "暂停", icon: "pause", action: "pause" });
      } else if (task.status === "done") {
        actions.push({ label: "重新打开", icon: "rotate-ccw", action: "reopen" });
      } else if (task.status === "paused") {
        actions.push({ label: "继续执行", icon: "play", action: "resume", primary: true });
        actions.push({ label: "重新编辑", icon: "edit", action: "edit-open" });
        actions.push({ label: "删除", icon: "trash", action: "delete" });
      }
      var needNote = task.status === "confirm" || task.status === "review" || task.status === "done";
      var runningText = task.status === "todo" ? "规划中…" : task.status === "develop" ? "执行中…" : task.status === "review" ? "复核中…" : "处理中…";

      return React.createElement("div", { className: "tp-card", onClick: function () { setExpanded(!expanded); } }, [
        React.createElement("div", { className: "tp-card-row" }, [
          React.createElement("span", { className: "tp-dot", style: { background: task.color || "#94a3b8" } }),
          React.createElement("span", { className: "tp-card-title" }, task.title),
          React.createElement("span", { className: "tp-card-status" }, task.statusLabel),
          (function () {
            var badge = cardBadge(task);
            return badge ? React.createElement("span", { className: "tp-badge " + badge.cls }, badge.text) : null;
          })(),
          React.createElement("span", { className: "tp-chev" + (expanded ? " tp-chev-open" : "") }, React.createElement(Icon, { name: "chevron-down", size: 16 }))
        ]),
        React.createElement("div", { className: "tp-card-meta" }, [
          task.running ? React.createElement("span", { className: "tp-running" }, [
            React.createElement(Icon, { name: "loader", size: 12, className: "tp-spin" }),
            React.createElement("span", null, runningText)
          ]) : null,
          task.status === "paused" && task.pausedFrom
            ? React.createElement("span", null, "已暂停（来自 " + ((st.labels && st.labels[task.pausedFrom]) || task.pausedFrom) + "）")
            : null,
          React.createElement("span", null, [
            React.createElement(Icon, { name: "clock", size: 12, className: "tp-meta-ic" }),
            " 更新于 " + relTime(task.updatedAt)
          ]),
          task.repoPath ? React.createElement("span", null, [
            React.createElement(Icon, { name: "folder", size: 12, className: "tp-meta-ic" }),
            " 仓库 " + task.repoPath
          ]) : null,
          task.sourceSessionId ? React.createElement("span", {
            title: "跳转到发布会话（" + task.sourceSessionId + "）",
            style: { cursor: "pointer", color: "var(--tp-accent,#3b82f6)" },
            onClick: function (e) { e.stopPropagation(); openSession(task.sourceSessionId); }
          }, [
            React.createElement(Icon, { name: "link", size: 12, className: "tp-meta-ic" }),
            " 发布会话 " + String(task.sourceSessionId).slice(0, 10) + "…"
          ]) : null,
          task.workSessionId ? React.createElement("span", {
            title: "跳转到执行子会话（" + task.workSessionId + "）",
            style: { cursor: "pointer", color: "var(--tp-accent,#3b82f6)" },
            onClick: function (e) { e.stopPropagation(); openChildSession(task.workSessionId); }
          }, [
            React.createElement(Icon, { name: "message-square", size: 12, className: "tp-meta-ic" }),
            " 执行会话 " + String(task.workSessionId).slice(0, 10) + "…"
          ]) : null,
          (task.relatedSessions || []).length > 0 ? React.createElement("span", null, [
            React.createElement(Icon, { name: "message-square", size: 12, className: "tp-meta-ic" }),
            " 关联 " + task.relatedSessions.length + " 个会话"
          ]) : null
        ]),
        expanded ? React.createElement("div", { className: "tp-card-body" }, [
          React.createElement(VerdictBanner, { key: "verdict", task: task }),
          React.createElement(ProgressBar, { key: "progress", progress: task.tasksProgress }),
          task.description ? React.createElement("div", { className: "tp-sec" }, [React.createElement("div", { className: "tp-kv" }, React.createElement("b", null, "需求")), task.description]) : null,
          task.acceptance ? React.createElement("div", { className: "tp-sec" }, [React.createElement("div", { className: "tp-kv" }, React.createElement("b", null, "验收标准")), task.acceptance]) : null,
          task.plan ? React.createElement("div", { className: "tp-sec" }, [React.createElement("div", { className: "tp-kv" }, React.createElement("b", null, "实施计划")), task.plan]) : null,
          task.planDraft ? React.createElement("div", { className: "tp-sec" }, [React.createElement("div", { className: "tp-kv" }, React.createElement("b", null, "计划草稿（待澄清定稿）")), task.planDraft]) : null,
          (task.questions || []).length > 0 && task.status === "clarify" ? React.createElement("div", { className: "tp-sec", onClick: function (e) { e.stopPropagation(); } }, [
            React.createElement("div", { className: "tp-kv" }, React.createElement("b", null, "待澄清问题（至少回答一个，其余按未回答处理）")),
            task.questions.map(function (q) {
              return React.createElement("div", { key: q.id, style: { marginBottom: 8 } }, [
                React.createElement("div", { className: "tp-kv" }, "Q" + q.id.slice(1) + ". " + q.q + (q.why ? "（" + q.why + "）" : "")),
                React.createElement("textarea", { className: "tp-textarea", rows: 2, placeholder: "你的回答…", value: answers[q.id] !== undefined ? answers[q.id] : (q.answer || ""), onChange: function (e) { setAnswer(q.id, e.target.value); } })
              ]);
            })
          ]) : null,
          (task.questions || []).length > 0 && task.status !== "clarify" ? React.createElement("div", { className: "tp-sec" }, [
            React.createElement("div", { className: "tp-kv" }, React.createElement("b", null, "澄清问答")),
            task.questions.map(function (q) {
              return React.createElement("div", { key: q.id }, "Q" + q.id.slice(1) + ". " + q.q + "：" + (q.answer || "（未回答）"));
            })
          ]) : null,
          task.specPath ? React.createElement("div", { className: "tp-sec" }, [
            React.createElement("div", { className: "tp-kv" }, React.createElement("b", null, "OpenSpec 产物")),
            task.specPath + (task.specInRepo ? "" : "（目标仓库不可写，回退于面板目录）")
          ]) : null,
          task.summary ? React.createElement("div", { className: "tp-sec" }, [React.createElement("div", { className: "tp-kv" }, React.createElement("b", null, "实现摘要")), task.summary]) : null,
          task.reviewReport ? React.createElement("div", { className: "tp-sec" }, [
            React.createElement("div", { className: "tp-kv" }, React.createElement("b", null, "复核报告")),
            React.createElement("div", { className: "tp-kv-line" }, [
              task.reviewReport.passed
                ? React.createElement(Icon, { name: "check-circle", size: 14, className: "tp-ok" })
                : React.createElement(Icon, { name: "x-circle", size: 14, className: "tp-bad" }),
              React.createElement("span", null, " " + (task.reviewReport.passed ? "通过" : "未通过") + (task.reviewReport.verdict ? "（" + task.reviewReport.verdict + "）" : ""))
            ]),
            (task.reviewReport.issues || []).length > 0 ? React.createElement("div", { className: "tp-kv", style: { marginTop: 4 } }, [
              React.createElement("b", null, "遗留问题（" + task.reviewReport.issues.length + " 项，全部修复后才可验收）"),
              task.reviewReport.issues.map(function (iss, i) {
                var sev = severityOf(iss);
                return React.createElement("div", { key: i, className: "tp-issue" }, [
                  React.createElement("span", { className: "tp-issue-tag tp-issue-tag-" + sev }, issueTag(iss)),
                  React.createElement("span", { className: "tp-issue-text" }, iss)
                ]);
              })
            ]) : null
          ]) : null,
          (task.screenshots || []).length > 0 ? React.createElement("div", { className: "tp-sec" }, [
            React.createElement("div", { className: "tp-kv" }, React.createElement("b", null, "验收截图（" + task.screenshots.length + " 张，点击放大）")),
            React.createElement("div", { className: "tp-shots" }, task.screenshots.map(function (s, i) {
              return React.createElement("div", { key: i, className: "tp-shot", title: s.caption || s.name, onClick: function (e) {
                e.stopPropagation();
                if (s.url) openModal({ kind: "shot", url: s.url, caption: s.caption, name: s.name });
              } }, [
                React.createElement("img", { src: s.url, alt: s.caption || s.name, loading: "lazy", onError: function (e) { e.currentTarget.style.display = "none"; } }),
                React.createElement("div", { className: "tp-shot-cap" }, s.caption || s.name)
              ]);
            }))
          ]) : null,
          (function () {
            var ss = task.stageSessions || {};
            var items = [];
            if (task.sourceSessionId) items.push({ id: task.sourceSessionId, label: "发布会话", color: "#3b82f6", child: false, title: "跳转到发布会话（" + task.sourceSessionId + "）" });
            if (ss.claim && ss.claim.id) items.push({ id: ss.claim.id, label: "规划会话", color: "#94a3b8", child: true, title: "跳转到规划子会话（" + ss.claim.id + "）" });
            if (ss.develop && ss.develop.id) items.push({ id: ss.develop.id, label: "开发会话", color: "#3b82f6", child: true, title: "跳转到开发子会话（" + ss.develop.id + "）" });
            if (ss.review && ss.review.id) items.push({ id: ss.review.id, label: "复核会话", color: "#8b5cf6", child: true, title: "跳转到复核子会话（" + ss.review.id + "）" });
            (task.relatedSessions || []).forEach(function (r) {
              items.push({ id: r.id, label: r.title || "(无标题会话)", color: "#64748b", child: false, title: r.reason || ("跳转到关联会话（" + r.id + "）") });
            });
            if (items.length === 0) return null;
            return React.createElement("div", { className: "tp-kv" }, [
              React.createElement("b", null, "会话（点击跳转）"),
              items.map(function (it) {
                return React.createElement("span", { key: it.id + it.label, className: "tp-sess", title: it.title, onClick: function (e) {
                  e.stopPropagation();
                  if (it.child) openChildSession(it.id); else openSession(it.id);
                } }, [
                  React.createElement("span", { className: "tp-dot", style: { background: it.color } }),
                  React.createElement("span", { className: "tp-sess-t" }, it.label)
                ]);
              })
            ]);
          })(),
          (task.history || []).length > 0 ? React.createElement("div", { className: "tp-hist" }, [
            React.createElement("div", { className: "tp-kv" }, React.createElement("b", null, "时间线")),
            task.history.map(function (h, i) {
              return React.createElement("div", { key: i, className: "tp-hist-item" }, [
                React.createElement("span", null, relTime(h.at)),
                React.createElement("span", null, h.note)
              ]);
            })
          ]) : null,
          actions.length > 0 ? React.createElement("div", { className: "tp-actions", onClick: function (e) { e.stopPropagation(); } }, [
            needNote ? React.createElement("input", { className: "tp-input", style: { flex: 1, minWidth: 120 }, placeholder: "打回/反馈附言（可选）", value: note, onChange: function (e) { setNote(e.target.value); } }) : null,
            actions.map(function (btn) {
              return React.createElement(ActionButton, {
                key: btn.action,
                icon: btn.icon,
                label: btn.label,
                primary: btn.primary,
                busy: busy === btn.action,
                title: btn.label,
                onClick: function () {
                  if (btn.action === "clarify-answer") submitAnswers();
                  else if (btn.action === "edit-open") openModal({ kind: "edit", taskId: task.id });
                  else act(btn.action);
                }
              });
            })
          ]) : null,
          err ? React.createElement("div", { className: "tp-msg tp-err" }, err) : null
        ]) : null
      ]);
    }

    // ---------- 组件：抽屉主体 ----------
    function DrawerBody(props) {
      var st = useStore();
      var sid = currentSession(props);
      var repos = (function () {
        if (props && typeof props.useWorkspaces === "function") {
          try {
            var ws = props.useWorkspaces(function (s) { return s ? s.items : EMPTY_ITEMS; });
            if (Array.isArray(ws)) return ws.map(function (w) { return { value: w.path, label: w.title || w.path }; });
          } catch (err) { /* ignore */ }
        }
        return [];
      })();
      var badge = (st.counts.todo || 0) + (st.counts.clarify || 0) + (st.counts.confirm || 0) + (st.counts.review || 0) + (st.counts.paused || 0);
      // 面板默认收起：open=false 时不渲染遮罩/抽屉（关闭按钮与背景遮罩的 closePanel 因此真正生效）。
      // Esc 监听：弹窗打开时先关弹窗，再关面板。置于条件 return 之前遵守 hooks 规则。
      React.useEffect(function () {
        function onKeyDown(e) {
          if (e.key !== "Escape") return;
          if (store.modal) { closeModal(); return; }
          if (store.open) closePanel();
        }
        window.addEventListener("keydown", onKeyDown);
        return function () { window.removeEventListener("keydown", onKeyDown); };
      }, []);
      if (!st.open) return null;
      var dialog = null;
      if (st.modal && st.modal.kind === "publish") {
        dialog = React.createElement(PublishDialog, { key: "publish", sid: sid, repos: repos, onClose: closeModal });
      } else if (st.modal && st.modal.kind === "edit") {
        dialog = React.createElement(EditDialog, { key: "edit", taskId: st.modal.taskId, onClose: closeModal });
      } else if (st.modal && st.modal.kind === "shot") {
        dialog = React.createElement(ShotDialog, { key: "shot", url: st.modal.url, caption: st.modal.caption, name: st.modal.name, desc: st.modal.desc, onClose: closeModal });
      }
      return React.createElement("div", { className: "tp-wrap" }, [
        React.createElement("div", { className: "tp-backdrop", onClick: closePanel }),
        React.createElement("div", { className: "tp-drawer", style: { width: st.width + "px" } }, [
          React.createElement("div", { className: "tp-resize", title: "拖拽调整宽度", onPointerDown: onDragStart }),
          React.createElement("div", { className: "tp-header" }, [
            React.createElement("span", { className: "tp-header-title" }, [
              React.createElement(Icon, { name: "clipboard", size: 16 }),
              React.createElement("span", null, "任务面板" + (badge > 0 ? "（" + badge + " 件待处理）" : "")),
              st.persistenceOk === false ? React.createElement(Icon, { name: "alert-triangle", size: 14, className: "tp-warn" }) : null
            ]),
            React.createElement("div", { className: "tp-header-actions" }, [
              React.createElement("button", { className: "tp-icon-btn", title: "刷新", onClick: refresh }, React.createElement(Icon, { name: "refresh-cw", size: 15 })),
              React.createElement("button", { className: "tp-icon-btn", title: "关闭面板", onClick: closePanel }, React.createElement(Icon, { name: "x", size: 16 }))
            ])
          ]),
          React.createElement("div", { className: "tp-counts-row" }, [
            st.order.map(function (s) {
              return React.createElement("span", { key: s, className: "tp-count-chip" }, [
                React.createElement("span", { className: "tp-dot", style: { background: (st.colors && st.colors[s]) || "#94a3b8" } }),
                ((st.labels && st.labels[s]) || s) + " " + ((st.counts && st.counts[s]) || 0)
              ]);
            })
          ]),
          React.createElement("div", { className: "tp-body" }, [
            React.createElement("button", { className: "tp-pub-btn", onClick: function () { openModal({ kind: "publish" }); } }, [
              React.createElement(Icon, { name: "plus", size: 16 }),
              React.createElement("span", null, "发布新任务")
            ]),
            React.createElement("div", { className: "tp-tabs" }, [
              st.order.map(function (s) {
                return React.createElement("button", {
                  key: s,
                  className: "tp-tab" + (st.tab === s ? " tp-active" : ""),
                  onClick: function () { setStore({ tab: s }); }
                }, [
                  React.createElement("span", { className: "tp-dot", style: { background: (st.colors && st.colors[s]) || "#94a3b8" } }),
                  (st.labels && st.labels[s]) || s,
                  React.createElement("span", { className: "tp-tab-count" }, (st.counts && st.counts[s]) || 0)
                ]);
              })
            ]),
            React.createElement("div", { className: "tp-list" }, [
              st.tasks.filter(function (t) { return t.status === st.tab; }).map(function (t) {
                return React.createElement(TaskCard, { key: t.id, task: t, sid: sid });
              }),
              st.tasks.filter(function (t) { return t.status === st.tab; }).length === 0
                ? React.createElement("div", { className: "tp-empty" }, "这里空空如也" + (st.tab === "todo" ? "，点击上方「发布新任务」开始" : ""))
                : null
            ])
          ]),
          React.createElement("div", { className: "tp-footer" }, st.persistenceOk === false
            ? [React.createElement(Icon, { name: "alert-triangle", size: 12, className: "tp-warn" }), " 数据保存失败（tasks.json 写入被拒），任务在重启后会丢失 —— 请检查沙箱策略"]
            : "发布时可指定目标仓库 · 拖拽左边缘调宽度 · 阶段自动流转：领取、规划、开发、复核、待你验收 · 随时可暂停")
        ]),
        dialog
      ]);
    }

    // ---------- 组件：侧边栏按钮 ----------
    function SidebarButton(props) {
      var st = useStore();
      var badge = (st.counts.todo || 0) + (st.counts.clarify || 0) + (st.counts.confirm || 0) + (st.counts.review || 0) + (st.counts.paused || 0);
      return React.createElement("button", {
        className: "tp-side-btn" + (props.wide ? "" : " tp-side-rail") + (st.open ? " tp-side-active" : ""),
        title: "任务面板" + (badge > 0 ? "（" + badge + " 件待处理）" : ""),
        onClick: function () { setStore({ open: !st.open }); }
      }, [
        React.createElement("span", { className: "tp-side-ic" }, [
          React.createElement(Icon, { name: "clipboard", size: 16 })
        ]),
        props.wide ? React.createElement("span", { className: "tp-side-label" }, "任务面板") : null,
        badge > 0 ? React.createElement("span", { className: "tp-side-badge" }, badge > 99 ? "99+" : badge) : null
      ]);
    }

    // ---------- 插件体 ----------
    function apply(ctx) {
      ensureStyles();
      refresh();
      setInterval(refresh, 8000);
      exports.sessionOpen = (ctx.sessions && typeof ctx.sessions.open === "function")
        ? function (id) { ctx.sessions.open(id); }
        : undefined;
      exports.sessionOpenSubagent = (ctx.sessions && typeof ctx.sessions.openSubagent === "function")
        ? function (addr) { ctx.sessions.openSubagent(addr); }
        : undefined;
      exports.sessionAddress = (ctx.sessions && typeof ctx.sessions.subagentAddress === "function")
        ? function (id) { return ctx.sessions.subagentAddress(id); }
        : undefined;

      ctx.slots.inject("sidebar.footer.action", function () {
        return ctx.slots.register(
          { name: "sidebar.footer.action", id: "task-panel-open", order: 10 },
          function (props) { return React.createElement(SidebarButton, { wide: props.wide }); }
        );
      });

      ctx.slots.inject("shell.overlay", function () {
        return ctx.slots.register(
          { name: "shell.overlay", id: "task-panel-drawer", order: 9500 },
          function (props) { return React.createElement(DrawerBody, props); }
        );
      });
    }

    exports.apply = apply;
    exports.inject = ["slots", "sessions"];
    return module.exports;
  }
});
