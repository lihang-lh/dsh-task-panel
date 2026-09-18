// 澄清卡片化单测 —— 对照 docs/superpowers/specs/2026-09-17-澄清卡片化-design.md §7.1（T1–T12）
// 运行：npm test（= node --test "test/*.test.js"；Node 26 下 `node --test test/` 会报 Cannot find module）
//
// client.js 是 DSH client-modules bundle（window.__ModuleLoader__.load），不能直接 import，
// 因此这里做两件事：
//   1) 从源码中抽取纯函数 clarifyProgress 的源码，用 new Function 求值后断言行为；
//   2) 源码契约断言：类名定义、cardBadge 的 clarify 分支、渲染序号口径、问题正文字号。
// 抽取 + 求值再断言，保证测的是 client.js 里真实存在的那份实现（改坏了会红）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const CLIENT_SRC = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

/** 从 client.js 源码中抽取指定顶层函数并求值为可调用的 JS 函数。 */
function extractFunction(name) {
  const re = new RegExp(`function ${name}\\s*\\([\\s\\S]*?\\n    \\}`, 'm')
  const m = CLIENT_SRC.match(re)
  assert.ok(m, `client.js 中未找到函数 ${name} —— 抽取正则失配或函数被删除`)
  return new Function(`${m[0]}\n return ${name}`)()
}

// —— 行为测试：clarifyProgress 与提交口径必须一致（trim 后非空才算已答） ——

test('T1 空问题列表：返回零值且不抛错', () => {
  const p = extractFunction('clarifyProgress')([], {})
  assert.deepEqual(p, { answered: 0, total: 0, answeredIds: {} })
})

test('T2 全部未答（无草稿、无 q.answer）：answered=0，answeredIds 为空', () => {
  const p = extractFunction('clarifyProgress')(
    [{ id: 'q1', q: 'A' }, { id: 'q2', q: 'B' }], {})
  assert.equal(p.answered, 0)
  assert.equal(p.total, 2)
  assert.deepEqual(p.answeredIds, {})
})

test('T3 草稿为纯空白：不算已答', () => {
  const p = extractFunction('clarifyProgress')([{ id: 'q1', q: 'A' }], { q1: '   \n  ' })
  assert.equal(p.answered, 0)
  assert.deepEqual(p.answeredIds, {})
})

test('T4 草稿有实际内容：算已答并标记 answeredIds', () => {
  const p = extractFunction('clarifyProgress')([{ id: 'q1', q: 'A' }], { q1: ' 方案 A ' })
  assert.equal(p.answered, 1)
  assert.equal(p.answeredIds.q1, true)
})

test('T5 无草稿但 q.answer 已有值：回填算已答（与 submitAnswers 一致）', () => {
  const p = extractFunction('clarifyProgress')(
    [{ id: 'q1', q: 'A', answer: '旧答案' }], {})
  assert.equal(p.answered, 1)
  assert.equal(p.answeredIds.q1, true)
})

test('T6 草稿为空字符串但 q.answer 有值：草稿优先，不算已答', () => {
  const p = extractFunction('clarifyProgress')(
    [{ id: 'q1', q: 'A', answer: '旧答案' }], { q1: '' })
  assert.equal(p.answered, 0)
})

test('T7 三问只答一问：answered=1 / total=3', () => {
  const p = extractFunction('clarifyProgress')(
    [{ id: 'q1', q: 'A' }, { id: 'q2', q: 'B' }, { id: 'q3', q: 'C' }], { q2: '答了' })
  assert.equal(p.answered, 1)
  assert.equal(p.total, 3)
  assert.deepEqual(p.answeredIds, { q2: true })
})

test('T8 null / undefined 入参：不抛错，返回零值', () => {
  const fn = extractFunction('clarifyProgress')
  assert.deepEqual(fn(null, null), { answered: 0, total: 0, answeredIds: {} })
  assert.deepEqual(fn(undefined, undefined), { answered: 0, total: 0, answeredIds: {} })
  // 非字符串草稿（脏数据）不得抛错，也不得被当成已答
  assert.equal(fn([{ id: 'q1', q: 'A' }], { q1: 42 }).answered, 0)
})

// —— 源码契约测试：结构与样式不得脱节 ——

/** 断言某条 CSS 规则在 client.js 的 CSS_TEXT 里真实存在（精确到「类名 { 声明 }」，
 *  避免 includes 前缀匹配被 .tp-q-head 之类顶替而造成假绿）。 */
function cssRule(selector) {
  const m = CLIENT_SRC.match(new RegExp('"' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}'))
  assert.ok(m, `缺少样式规则：${selector}（或规则未闭合）`)
  return m[1]
}

test('T9（源码契约）澄清卡片类名已在 CSS_TEXT 中定义', () => {
  for (const cls of ['.tp-clarify', '.tp-clarify-head', '.tp-clarify-title', '.tp-clarify-progress',
    '.tp-clarify-progress-ok', '.tp-q', '.tp-q-head', '.tp-q-no', '.tp-q-text', '.tp-q-why',
    '.tp-q-done', '.tp-q .tp-textarea', '.tp-q-done .tp-q-no', '.tp-badge-clarify']) {
    cssRule(cls)
  }
})

test('T10（源码契约）cardBadge 增加 clarify 分支并输出「待澄清」文案', () => {
  const badge = extractFunction('cardBadge')
  const withQs = badge({ status: 'clarify', questions: [{ id: 'q1' }, { id: 'q2' }] })
  assert.equal(withQs.text, '待澄清 2 问')
  assert.equal(withQs.cls, 'tp-badge-clarify')
  assert.equal(badge({ status: 'clarify', questions: [] }).text, '待澄清')
  // 既有状态不受影响
  assert.equal(badge({ status: 'review', reviewClean: true }).text, '可验收')
  assert.equal(badge({ status: 'done' }).text, '已完成')
  assert.equal(badge({ status: 'todo' }), null)
})

test('T11（源码契约）待澄清序号改用渲染索引，不再用 q.id.slice(1)', () => {
  // 只约束本次改造的「待澄清卡片」区块（历史「澄清问答」列表本次不动）
  const block = CLIENT_SRC.slice(
    CLIENT_SRC.indexOf('className: "tp-clarify"'),
    CLIENT_SRC.indexOf('className: "tp-q-text"'))
  assert.ok(block.length > 0, '未找到 tp-clarify 渲染区块')
  assert.ok(block.includes('"Q" + (i + 1)'), '澄清卡片序号未改为索引 i + 1')
  assert.ok(!block.includes('q.id.slice(1)'), '澄清卡片序号仍在用 q.id.slice(1)')
})

test('T12（源码契约）问题正文样式为 15px 加粗，作答框为 14px', () => {
  const m = CLIENT_SRC.match(/"\.tp-q-text\{([^}]*)\}"/)
  assert.ok(m, '未找到 .tp-q-text 样式规则')
  assert.match(m[1], /font-size:15px/)
  assert.match(m[1], /font-weight:700/)
  const t = CLIENT_SRC.match(/"\.tp-q \.tp-textarea\{([^}]*)\}"/)
  assert.ok(t, '未找到 .tp-q .tp-textarea 样式规则')
  assert.match(t[1], /font-size:14px/)
  // 已答卡片整体转绿，序号胶囊同步转绿（否则卡片绿、胶囊蓝，视觉不统一）
  assert.match(cssRule('.tp-q-done .tp-q-no'), /background:#22c55e/)
  // 区域标题 13px 由独立类承载（写成 .tp-kv 会被其 12px 覆盖）
  assert.match(cssRule('.tp-clarify-title'), /font-size:13px/)
})

test('T13（源码契约）作答框绑定了 onChange 写回答案草稿', () => {
  const block = CLIENT_SRC.slice(CLIENT_SRC.indexOf('className: "tp-clarify"'))
  assert.ok(block.includes('onChange: function (e) { setAnswer(q.id, e.target.value); }'),
    '澄清作答框未绑定 onChange → setAnswer，填了也不会进入提交流程')
})
