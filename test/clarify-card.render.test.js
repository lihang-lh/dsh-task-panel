// 澄清卡片「真实渲染」验证 —— 对照 docs/superpowers/specs/2026-09-17-澄清卡片化-design.md §7.2（A1–A8）
//
// 两级验证：
//   1) 离屏 DOM：跑 client.js 真实渲染代码（DrawerBody → TaskCard → 澄清卡片），
//      通过点击 tab / 展开卡片模拟真实交互，断言结构、文案、状态类名；
//   2) headless Chrome：把渲染结果交给真实浏览器，用 getComputedStyle 核对字号 / 字重 /
//      边框 / 底色 / 圆角等视觉验收点（本机无 Chrome 时自动跳过，不阻塞 CI）。
//
// 运行：npm test（= node --test "test/*.test.js"；Node 26 下 `node --test test/` 会报 Cannot find module）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SCENARIOS, runScenario, hasChrome, measureInBrowser, toMeasureHtml,
  renderPanel, buildTasks, byClass, textOf,
} from '../devtools/render-clarify-card.mjs'

const browserTest = hasChrome() ? test : test.skip

test('A1 展开待澄清任务：每问一张卡片，问题正文与 why 分行', async () => {
  const { root } = await runScenario(SCENARIOS[0])
  const cards = byClass(root, 'tp-q')
  assert.equal(cards.length, 3, '应有 3 张问题卡片')
  // 序号为渲染索引 Q1..Q3
  assert.deepEqual(byClass(root, 'tp-q-no').map(textOf), ['Q1', 'Q2', 'Q3'])
  // 问题正文不再把 why 拼进正文（旧实现是 q.q + "（why）"）
  const texts = byClass(root, 'tp-q-text').map(textOf)
  texts.forEach((t) => assert.ok(!t.includes('（'), '问题正文不应包含拼接的 why：' + t))
  assert.equal(byClass(root, 'tp-q-why').length, 3, 'why 应单独成行')
  // 每张卡片内各自一个作答框
  assert.equal(byClass(root, 'tp-q')[0].children.filter((c) => c.tagName === 'TEXTAREA').length, 1)
  assert.equal(byClass(root, 'tp-clarify').length, 1, '澄清区容器唯一')
})

test('A2/A3 进度与已答高亮随答案变化', async () => {
  const none = await runScenario(SCENARIOS[0])
  assert.equal(textOf(byClass(none.root, 'tp-clarify-progress')[0]), '已答 0/3')
  assert.equal(byClass(none.root, 'tp-q-done').length, 0, '全未答时不应有已答高亮')

  const partial = await runScenario(SCENARIOS[1])
  assert.equal(textOf(byClass(partial.root, 'tp-clarify-progress')[0]), '已答 2/3')
  assert.equal(byClass(partial.root, 'tp-q-done').length, 2, '已答 2 问应有 2 张绿色卡片')

  const full = await runScenario(SCENARIOS[2])
  assert.equal(textOf(byClass(full.root, 'tp-clarify-progress')[0]), '已答 3/3')
  assert.match(byClass(full.root, 'tp-clarify-progress')[0].attrs.class, /tp-clarify-progress-ok/)
})

test('A1b 标题行用独立类承载字号（写成 .tp-kv 会退回 12px）', async () => {
  const { root } = await runScenario(SCENARIOS[0])
  const titles = byClass(root, 'tp-clarify-title')
  assert.equal(titles.length, 1, '应有一个澄清区标题元素')
  assert.ok(textOf(titles[0]).startsWith('待澄清问题'), '标题文案')
  // 关键：标题不得同时挂 .tp-kv（其 12px 会覆盖标题字号）
  assert.equal(byClass(root, 'tp-kv').filter((e) => textOf(e).startsWith('待澄清问题')).length, 0,
    '标题不应使用 .tp-kv（会被其 12px 覆盖，导致 13px 静默失效）')
})

test('A5 收起态任务卡片带「待澄清 N 问」徽章', async () => {
  const { root } = await runScenario({ answers: {}, collapsed: true })
  const badges = byClass(root, 'tp-badge-clarify')
  assert.equal(badges.length, 1, '收起态应有一个待澄清徽章')
  assert.equal(textOf(badges[0]), '待澄清 3 问')
  assert.equal(byClass(root, 'tp-q').length, 0, '收起态不应渲染澄清卡片')
})

test('A7/A8 非澄清任务不受影响（回归对照）', async () => {
  const { root } = await runScenario({ answers: {}, collapsed: true })
  // 切到已完成 tab：不出现澄清卡片、不出现待澄清徽章
  const tab = byClass(root, 'tp-tab').find((e) => textOf(e).startsWith('已完成'))
  assert.ok(tab, '应存在「已完成」tab')
  tab.listeners.click.forEach((f) => f({ stopPropagation() {} }))
  await new Promise((r) => setTimeout(r, 40))
  // 正向断言：确认真的切到了「已完成」并渲染出它的卡片（否则下面的"零出现"可能是空列表造成的假绿）
  const active = byClass(root, 'tp-tab').filter((e) => String(e.attrs.class).includes('tp-active'))
  assert.equal(active.length, 1, '应有且只有一个高亮 tab')
  assert.ok(textOf(active[0]).startsWith('已完成'), '应已切到「已完成」tab，实际：' + textOf(active[0]))
  const cards = byClass(root, 'tp-card')
  assert.equal(cards.length, 1, '「已完成」tab 应渲染出 1 张任务卡片')
  assert.ok(textOf(cards[0]).includes('已完成任务'), '卡片应是非澄清的已完成任务')
  // 反向断言：非澄清任务不出现澄清卡片与待澄清徽章
  assert.equal(byClass(root, 'tp-q').length, 0, '非澄清任务不应出现澄清卡片')
  assert.equal(byClass(root, 'tp-badge-clarify').length, 0, '非澄清任务不应出现待澄清徽章')
  assert.equal(byClass(root, 'tp-clarify-progress').length, 0, '非澄清任务不应出现已答进度')
})

test('A3/A4 在作答框输入即时更新进度与卡片状态（onChange 打通提交流程）', async () => {
  const { root, panel } = await runScenario(SCENARIOS[0])
  const progress = () => textOf(byClass(root, 'tp-clarify-progress')[0])
  const type = async (ta, value) => {
    ta.listeners.change.forEach((f) => f({ target: { value } }))
    await new Promise((r) => setTimeout(r, 40))
  }
  assert.equal(progress(), '已答 0/3')
  // 在第一张卡片的作答框里输入
  const first = byClass(root, 'tp-q')[0].children.find((c) => c.tagName === 'TEXTAREA')
  assert.ok(first, '每张卡片应各有一个作答框')
  await type(first, '仅移动端')
  assert.equal(progress(), '已答 1/3', '输入后进度应更新')
  assert.equal(byClass(root, 'tp-q-done').length, 1, '刚作答的卡片应转绿')
  // 再输入纯空白 → 不算已答（与提交口径一致）
  const firstTa = byClass(root, 'tp-q')[0].children.find((c) => c.tagName === 'TEXTAREA')
  await type(firstTa, '   ')
  assert.equal(progress(), '已答 0/3', '纯空白不应计入已答')
  assert.equal(byClass(root, 'tp-q-done').length, 0, '清空后卡片应恢复未答')
  assert.ok(panel, '面板句柄可用')
})

test('A6 问题没有 why 时不渲染说明行（不产生空行）', async () => {
  const tasks = buildTasks({})
  tasks[0].questions = tasks[0].questions.map((q, i) => (i === 0 ? { id: q.id, q: q.q, why: '', answer: '' } : q))
  const panel = await renderPanel({ tasks })
  await panel.selectTab('待澄清')
  await panel.expandCard(0)
  const cards = byClass(panel.root, 'tp-q')
  assert.equal(cards.length, 3)
  assert.equal(byClass(panel.root, 'tp-q-why').length, 2, '只有 2 个问题带 why，应只渲染 2 行说明')
})

browserTest('浏览器实测（暗色）：全答进度的绿色对比度达 WCAG AA（≥4.5）', async () => {
  const { root, cssText } = await runScenario(SCENARIOS[2])
  const html = toMeasureHtml(SCENARIOS[2].label, root, cssText, false)
  const light = measureInBrowser(html).contrast.find((c) => c.sel === '.tp-clarify-progress')
  const dark = measureInBrowser(html, { dark: true }).contrast.find((c) => c.sel === '.tp-clarify-progress')
  assert.ok(light.ratio >= 4.5, `亮色全答进度对比度应 ≥4.5，实际 ${light.ratio}`)
  assert.ok(dark.ratio >= 4.5, `暗色全答进度对比度应 ≥4.5，实际 ${dark.ratio}`)
})

browserTest('浏览器实测：字号 15px 加粗 / 卡片强调色 / 进度配色 / 徽章配色', async () => {
  const cases = [
    { sc: SCENARIOS[0], doneCount: 0, progressColor: 'rgb(100, 116, 139)' },
    { sc: SCENARIOS[1], doneCount: 2, progressColor: 'rgb(100, 116, 139)' },
    { sc: SCENARIOS[2], doneCount: 3, progressColor: 'rgb(21, 128, 61)' },
  ]
  for (const c of cases) {
    const { root, cssText } = await runScenario(c.sc)
    const m = measureInBrowser(toMeasureHtml(c.sc.label, root, cssText))
    assert.equal(m.q.length, 3, '测量到 3 张问题卡片')
    for (const q of m.q) {
      // R3：问题正文 15px 加粗（相对面板其他 12–13px 文本明显醒目）
      assert.equal(q.qText['font-size'], '15px', '问题正文字号')
      assert.equal(q.qText['font-weight'], '700', '问题正文加粗')
      // why 退为次级 12px
      assert.equal(q.why['font-size'], '12px', 'why 字号')
      // R2：强调卡片 —— 左侧 3px 强调竖条 + 浅强调底色 + 圆角
      assert.equal(q.card['border-left-width'], '3px', '左侧强调竖条')
      assert.equal(q.card['border-radius'], '10px', '卡片圆角')
      assert.notEqual(q.card['background-color'], 'rgba(0, 0, 0, 0)', '卡片应有底色')
      // 作答框 14px
      assert.equal(q.ta['font-size'], '14px', '作答框字号')
      // 序号胶囊：实心强调色 + 白字
      assert.equal(q.no['font-weight'], '700', '序号胶囊字重')
      assert.equal(q.no.color, 'rgb(255, 255, 255)', '序号胶囊文字为白色')
    }
    // 已答卡片转绿：卡片竖条与序号胶囊同为绿色
    const green = m.q.filter((q) => q.card['border-left-color'] === 'rgb(34, 197, 94)')
    assert.equal(green.length, c.doneCount, '已答卡片数量：' + c.sc.key)
    green.forEach((q) => assert.equal(q.no['background-color'], 'rgb(34, 197, 94)', '已答卡片序号胶囊转绿'))
    const blue = m.q.filter((q) => q.card['border-left-color'] === 'rgb(59, 130, 246)')
    blue.forEach((q) => assert.equal(q.no['background-color'], 'rgb(59, 130, 246)', '未答卡片序号胶囊为强调蓝'))
    // 进度配色：全答完转绿
    assert.equal(m.progress[0].color, c.progressColor, '进度文字配色：' + c.sc.key)
    // 区域标题 13px（写成 .tp-kv 会被其 12px 覆盖）
    assert.equal(m.title.size, '13px', '区域标题字号')
    assert.equal(m.title.text.startsWith('待澄清问题'), true, '标题文案')
    // 进度配色三态都核对（未答/部分已答用次级灰，全答转绿）
    const progressCls = (await runScenario(c.sc)).root
    const okCls = byClass(progressCls, 'tp-clarify-progress-ok').length
    assert.equal(okCls, c.doneCount === 3 ? 1 : 0, '仅全答完才加 tp-clarify-progress-ok：' + c.sc.key)
    // R5：徽章在卡片行上（展开态同样可见），蓝色系 = 等待老板动作
    assert.equal(m.badge.length, 1, '卡片行应有一个待澄清徽章')
    assert.equal(m.badge[0].text, '待澄清 3 问')
    assert.equal(m.badge[0].color, 'rgb(37, 99, 235)', '徽章文字为蓝色系')
  }
})
