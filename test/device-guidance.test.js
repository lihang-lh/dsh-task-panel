// deviceGuidance 纯函数单测 —— 对照 docs/superpowers/specs/2026-09-07-app原生真机截图验收-design.md §7.1（T1–T8）
// 运行：node --test test/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deviceGuidance } from '../index.js'

const join = (r) => [r.title, ...(r.steps || [])].join('\n')

test('T1 android 缺 adb：给出安装与检查指引', () => {
  const r = deviceGuidance('android', ['adb'])
  const text = join(r)
  assert.match(r.title, /Android/)
  assert.match(text, /command -v adb/)
  assert.match(text, /brew install android-platform-tools/)
})

test('T2 android 无设备/未授权：给出连接与授权指引', () => {
  const r = deviceGuidance('android', ['android-device'])
  const text = join(r)
  assert.match(text, /adb devices/)
  assert.match(text, /unauthorized/)
  assert.match(text, /adb connect/)
})

test('T3 android 同时缺工具与设备：两类指引都出现', () => {
  const r = deviceGuidance('android', ['adb', 'android-device'])
  const text = join(r)
  assert.match(text, /brew install android-platform-tools/)
  assert.match(text, /adb devices/)
})

test('T4 ios-simulator 缺 xcode：给出 Xcode 检查指引', () => {
  const r = deviceGuidance('ios-simulator', ['xcode'])
  const text = join(r)
  assert.match(r.title, /iOS/)
  assert.match(text, /xcode-select/)
})

test('T5 ios-simulator 无已启动模拟器：给出启动指引', () => {
  const r = deviceGuidance('ios-simulator', ['simulator'])
  const text = join(r)
  assert.match(text, /open -a Simulator/)
  assert.match(text, /xcrun simctl list devices/)
})

test('T6 ios-device 缺 idb：给出 idb companion 安装指引', () => {
  const r = deviceGuidance('ios-device', ['idb'])
  const text = join(r)
  assert.match(r.title, /iOS/)
  assert.match(text, /idb-companion/)
})

test('T7 ios-device 真机未配对：给出信任电脑与设备识别指引', () => {
  const r = deviceGuidance('ios-device', ['ios-pairing'])
  const text = join(r)
  assert.match(text, /信任此电脑/)
  assert.match(text, /idevice_id -l/)
})

test('T8 未知平台或空缺失列表：返回兜底指引且不抛错', () => {
  const r1 = deviceGuidance('weird-platform', ['other'])
  assert.ok(r1.title && Array.isArray(r1.steps))
  const r2 = deviceGuidance('android', [])
  assert.ok(r2.title && Array.isArray(r2.steps))
  const r3 = deviceGuidance(undefined, undefined)
  assert.ok(r3.title && Array.isArray(r3.steps))
})

test('T9 重复缺失项与大小写变体：指引只生成一次', () => {
  const r = deviceGuidance('android', ['adb', 'ADB', ' adb '])
  const adbLines = (r.steps || []).filter((s) => s.indexOf('command -v adb') !== -1)
  assert.equal(adbLines.length, 1)
})

test('T10 未知缺失项与已知项混合：不抛错且保留已知项指引', () => {
  const r = deviceGuidance('android', ['adb', 'unknown-thing'])
  const text = join(r)
  assert.match(text, /command -v adb/)
})
