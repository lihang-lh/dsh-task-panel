# 提案：App 原生（iOS / Android）真机/模拟器截图作为验收证据

- 日期：2026-09-07
- 状态：已澄清，待实现
- 任务编号：无（老板明确「该项目无需任务 id」，提交前需再向老板确认）
- 涉及文件：`index.js`（Host）、`client.js`（Client）
- 关联：README §3「阶段 prompt 与自动读取器」、§4「面板 UI」

---

## 1. 背景

「老板任务面板」的验收截图链路是：

```
开发/复核代理 → 把关键界面存成 PNG → 上报 screenshots[] 路径
  → host collectScreenshots() 拷贝到 面板/screenshots/<taskId>/
  → /files/<taskId>/<name> 静态下发 → 面板卡片缩略图 + 点击放大
```

这条管道**与设备类型解耦**——host 只认「PNG 文件 + 路径」。唯一的 web 专用假设藏在两处代理 prompt（`index.js` buildPrompt 的 develop / review 段）里：只教了代理「用真实浏览器或 Playwright」截图。

但使用面板的不只有 web 开发者，也有 app 原生开发者（iOS / Android）。他们的「UI/页面」是跑在真机/模拟器上的原生应用，现有指令覆盖不到，导致两类后果：

1. app 工程任务里，开发/复核代理没有「截真机屏」的指令依据，只能放弃截图或误用浏览器工具；
2. 复核的「UI 任务必须有真实截图」硬门槛让 app 任务天然无法通过，或被迫走「纯后端说明原因」的旁路，验收证据缺失。

本项目运行拓扑（已与老板确认）：**DSH（dsh web + 子代理）跑在开发者本机，真机/模拟器通过 USB 或无线直连这台机器**。子代理用 `subagents.start('spawn')` 在宿主进程内执行命令，因此能直接触达这台机器上的 adb / xcrun / idb 等系统工具与设备。

平台截图均为现成命令行，不需要自研截图能力：

| 平台 | 手段 | 环境要求 |
| --- | --- | --- |
| Android 真机 / 模拟器 | `adb -s <serial> exec-out screencap -p > shot.png`（无线：`adb connect <ip>`） | 任意平台装 adb，设备已授权 |
| iOS 模拟器 | `xcrun simctl io <udid> screenshot shot.png` | macOS + Xcode |
| iOS 真机 | `idb screenshot shot.png`（推荐）；兜底 `idevicescreenshot`（libimobiledevice） | macOS + idb companion；设备已信任配对 |

---

## 2. 目标

1. 当任务是**原生 app 工程**（Android / iOS）改动时，开发/复核代理能按平台用上述系统工具截取**真机/模拟器实际运行界面**，产物走**现有**截图收集/下发/展示管道，不新增第二套图片通道。
2. 代理截屏前先探测工具与设备；**缺工具 / 无设备 / iOS 未配对**时不得硬截，如实报告（`done=false` + blocker），任务留在「开发中」。
3. 面板在任务卡上展示**「连接设备指引」**：按平台、按缺失项给出安装 / 检查 / 连接命令，老板照做后点「重新执行」即可重试，**不新增任务状态**。
4. Web 任务与纯后端任务的现有行为**完全不变**。

## 3. 非目标（明确不做）

- ❌ 不做实时/流式真机画面预览（如 scrcpy 内嵌画面、持续镜像）。
- ❌ 不做跨机器设备网关 / 云真机 / 远程设备服务（DSH 不在手机所在机器时的方案）。
- ❌ 不在发布表单加「工程类型」下拉字段——工程平台由**开发代理完全自动探测**（老板已拍板）。
- ❌ 不做代理主动驱动 UI 的自动化测试编排（adb tap / 滑动 / XCTest 用例），仅「把当前屏截下来当证据」。
- ❌ 不改动截图收集、静态下发、点击放大的核心链路与 `collectScreenshots`。
- ❌ 不改动任务状态机（不新增状态，复用「开发中 + 重新执行 rerun」）。

## 4. 已确认需求（老板逐条拍板）

| # | 决策 | 出处 |
| --- | --- | --- |
| R1 | 能力形态：**代理自动截真机屏，走现有验收截图管道** | 澄清 Q1 |
| R2 | 拓扑：DSH 跑在开发者本机，手机（USB/无线）直连这台机器 | 澄清 Q2 |
| R3 | 平台全覆盖：Android 真机 + 模拟器、iOS 真机、iOS 模拟器 | 澄清 Q3 |
| R4 | 面板需要**提示用户如何安装/连接**工具链与设备 | 澄清 Q3 补充 |
| R5 | 工程平台**完全自动探测**，发布表单不加字段 | 澄清 Q4 |
| R6 | 设备未就绪：任务留在「开发中」+ 面板指引 + 点「重新执行」重试（`rerun` 复用，状态机零改动） | 澄清 Q5 |
| R7 | 复核阶段同样要求 app 任务的**真实截图证据**（复核代理可自行截屏核对，硬门槛保留） | 现状 R + README |

---

## 5. 设计

### 5.1 总体数据流

**成功路径（设备就绪）**：

```
开发代理（任务判定为 app 工程）
  → 探测平台（仓库结构启发式，见 5.3）
  → 探测工具与设备（command -v adb/xcrun/idb；adb devices；xcrun simctl list）
  → 构建并启动 app（Android: adb install -r + am start；iOS 模拟器: simctl install+launch；
     iOS 真机: 指示老板已手动打开 app 或 xcodebuild 安装）
  → 按平台命令截屏 → PNG 保存到 <目标仓库>/specs/proposals/<任务id>/screenshots/
  → 输出 screenshots[]（走现有 collectScreenshots 管道，host/面板零感知差异）
```

**失败路径（设备/工具未就绪）**：

```
开发代理：done=false；blocker 详述缺口（缺什么命令 / 无设备 / unauthorized / 未配对）
         ；deviceStatus = { ok:false, platform, missing:[...], detail }
  → host runDevelop：task.flags.deviceGuidance = { platform, missing, detail, at }（持久化）
  → 任务停留「开发中」，时间线 note(blocker)
  → client：卡片出现「待接设备」徽标 + 展开区「连接设备指引」横幅（5.5）
  → 老板按指引装好/接好设备 → 点「重新执行」（现有 rerun action）
  → runDevelop 重跑，开始时清空旧 deviceGuidance；成功（done=true 且有截图）则不再设置
```

### 5.2 develop outputSchema 扩展

在 `SCHEMAS.develop.properties` 增加**可选**字段（向后兼容，旧代理不输出也合法）：

```js
deviceStatus: {
  type: 'object',
  properties: {
    platform: { type: 'string' },      // 'android' | 'ios-simulator' | 'ios-device' | 'web' | ''
    ok: { type: 'boolean' },           // 截图环节是否就绪/成功
    missing: { type: 'array', items: { type: 'string' } }, // 缺失项标识，见 5.4
    detail: { type: 'string' },        // 人工可读的缺口说明（会进 blocker/时间线）
  },
  additionalProperties: true,
},
```

review schema 不新增字段（复核截图仍走 `screenshots[]`）。

### 5.3 prompt 指令（buildPrompt 的 develop / review 段增加「原生 App 截图分支」）

在 develop 段现有「端到端与截图要求」附近追加段落（web 语义不变，仅当任务命中 app 工程时生效）：

```
【原生 App（iOS/Android）截图分支】先判定本任务是否为原生 app 工程，再决定截图手段——
1. 判定：结合任务描述与仓库结构启发式探测，满足其一即视为原生 app 工程：
   - Android：存在 app/src/main/AndroidManifest.xml、build.gradle(.kts) / settings.gradle(.kts) / gradle.properties 且含 android 插件；
   - iOS：存在 *.xcodeproj / *.xcworkspace，或 ios/ 目录下 Package.swift 且任务描述指向 iOS app；
   - 可用 find 在目标仓库自查；若仓库同时含 web 与 app（混合），以任务描述的主对象为准，并在 summary 说明判定依据。
2. 原生 app 任务必须截「真机/模拟器实际运行界面」，流程：探测工具 → 构建/安装/启动 → 截屏：
   - Android（真机/模拟器通用）：adb devices 确认有 device（unauthorized 需在手机上点「允许 USB 调试」）；
     adb -s <serial> install -r <apk> 后 am start 启动，再 adb -s <serial> exec-out screencap -p > <screenshots目录>/xxx.png；
     多设备必须用 -s <serial>；无线设备先用 adb connect <ip:port>。
   - iOS 模拟器：xcrun simctl list devices 找已启动（Booted）的模拟器；xcrun simctl install booted <app>、launch 启动；
     xcrun simctl io booted screenshot <screenshots目录>/xxx.png。
   - iOS 真机：xcodebuild 安装到真机，或提示老板已在手机上手动打开 app；
     截图用 idb screenshot <screenshots目录>/xxx.png；无 idb 时可用 idevicescreenshot（libimobiledevice）。
3. 【探测先行，缺则报告，严禁硬截】截屏前先验证工具与设备：command -v adb / xcrun / idb 等、adb devices、
   xcrun simctl list devices。若缺工具/无设备/未配对，**不要**尝试无意义截图，而是：
   - done 输出 false；
   - deviceStatus 输出 { ok:false, platform:<平台>, missing:[<缺失项标识>], detail:<缺什么、怎么检查> }；
   - blocker 写清：截图未能完成 + 具体缺口 + 面板会给出安装指引，老板接好设备后点「重新执行」。
   缺失项标识从以下取值（对应面板指引）：adb（未装 adb）、android-device（无设备/未授权）、
   xcode（无 Xcode/simctl）、simulator（无已启动模拟器）、idb（无 idb）、ios-pairing（真机未信任配对）、other。
4. 截图质量要求与 web 一致：真实存在、内容与实现一致、PNG/JPEG、保存到 <目标仓库>/specs/proposals/<任务id>/screenshots/，
   并在 screenshots 数组给出路径。
```

review 段追加（对称）：

```
原生 app 任务的复核：同样按平台规则**亲自截真机/模拟器运行界面**与实现核对（工具与流程同开发说明）；
无法取得真实 app 截图证据时，必须记为问题（issues），不得放行。
```

### 5.4 host 侧 deviceGuidance 纯函数与存储

新增一个可在 Node 下直接单测的纯函数 `deviceGuidance(platform, missing)`：

- 输入：`platform` ∈ `'android' | 'ios-simulator' | 'ios-device'`（+ 未知兜底）、`missing: string[]`（5.3 的缺失项标识）。
- 输出：`{ title: string, steps: string[] }` —— 给老板看的安装/连接指引（步骤为逐条命令/动作）。
- 平台 × 缺失项文案矩阵（要点，实现按此展开，命令给 macOS 优先 + 通用提示）：

| missing | Android | iOS 模拟器 | iOS 真机 |
| --- | --- | --- | --- |
| `adb` 未安装 | `command -v adb` 检查；`brew install android-platform-tools`；装完 `adb version` | — | — |
| `android-device` 无设备/未授权 | `adb devices`：需出现 `device` 而非 `unauthorized/offline`；手机开「开发者选项 → USB 调试」并在弹窗点允许；可改用无线 `adb tcpip 5555` + `adb connect <手机IP>` | — | — |
| `xcode` / `xcrun` | — | `xcode-select -p` 确认装 Xcode；`brew install --cask xcode` 或 App Store；首次运行 `sudo xcodebuild -license accept` | 同左 |
| `simulator` 无已启动模拟器 | — | `xcrun simctl list devices available`；`open -a Simulator` 启动一个 | — |
| `idb` 未安装 | — | — | `command -v idb` 检查；`brew tap facebook/fb && brew install idb-companion`，CLI 用 `pipx install fb-idb`（或 `pip install fb-idb`）；`idb list-targets` 验证 |
| `ios-pairing` 真机未信任 | — | — | 手机解锁屏点「信任此电脑」；`idevice_id -l` 能看到设备即配对成功（libimobiledevice：`brew install libimobiledevice`）；Xcode Window → Devices and Simulators 确认设备 |
| 兜底 / `other` | 通用：把 deviceStatus.detail 的具体缺口列出 + 检查对应平台工具链 |

host 集成点：

1. `runDevelop` 开头：`delete task.flags.deviceGuidance`（每轮重跑清旧标记）。
2. `runDevelop` 处理结果处：若 `s.done !== true` 且 `s.deviceStatus && s.deviceStatus.ok === false` → `task.flags.deviceGuidance = { platform, missing, detail, at: now() }`，时间线 note 沿用现有 blocker 文案逻辑（L589 已有，追加 detail）。
3. `toSummary` 增加：`deviceGuidance: (t.flags && t.flags.deviceGuidance) || null`。
4. 函数存放：`index.js` 内定义并在文件顶部导出（`export function deviceGuidance(...)`），供 `test/` 单测直接 import（index.js 顶层无副作用，import 安全）；同时挂到 `module` 导出键不影响 cordis 加载。若拆独立文件会引入插件加载机制的不确定，故不拆。

### 5.5 client 面板提示（徽标 + 横幅）

1. `cardBadge`（L590-598）增加分支：`status === "develop" && !task.running && task.deviceGuidance` → 橙色徽标「待接设备」（`tp-badge-device`）。
2. 新增设备指引横幅组件（`tp-device-guide`），**仅当 `task.status === "develop"` 且 `task.deviceGuidance` 存在时**在展开区渲染（位置见 5.5.3）：
   - 标题行：图标（alert-triangle）+「需要连接设备后才能继续：真机/模拟器截图未完成」；
   - detail 行（deviceGuidance.detail，来自代理报告）；
   - 「如何安装/连接（按平台）」步骤列表：由 client 调用与 host 相同的 `deviceGuidance()`？——**不行**：client 是浏览器静态 bundle，不能共享 host 模块。决策：**指引文案在 host 生成并存进 flags**（`task.flags.deviceGuidance.steps` 由 host 在写 flags 时一并生成好），client 纯渲染 `deviceGuidance.title/detail/steps`，不重复逻辑、不重复打包。→ 修正 5.4：host 写 flags 时即调用 `deviceGuidance(platform, missing)` 并把 `steps` 一并存入。
   - 提示行：「接好设备后点上方/卡片上的『重新执行』按钮重试」。
3. 展开区渲染位置：现有「实现摘要」区之后（L810 附近），新增 `tp-device-guide` 区块；新样式类加进 client.js 内的样式表。

### 5.6 平台探测归属

探测（判定工程是 Android/iOS/web）**不写在 host 代码里**，作为 5.3 的 prompt 启发式指令交给开发/复核代理执行——代理可用 `find`/读仓库结构结合任务描述判断，比 host 端固定规则更鲁棒，且对混合仓库能按任务描述取舍。host 与 client 不做文件级探测。

---

## 6. 影响面

| 面 | 影响 |
| --- | --- |
| `index.js` | 新增 `deviceGuidance()` 纯函数与导出；`SCHEMAS.develop` 加可选 `deviceStatus`；develop/review prompt 加原生 App 截图分支段落；`runDevelop` 读写 `task.flags.deviceGuidance`；`toSummary` 透出该字段。 |
| `client.js` | `cardBadge` 加「待接设备」徽标；新增设备指引横幅组件与样式；数据透出后渲染。 |
| 数据模型 | `task.flags.deviceGuidance`（持久化于 `tasks.json` 的 flags 内）；旧数据无此字段 → 渲染判空，向后兼容；`SCHEMAS` 均为 `additionalProperties: true`，兼容旧代理输出。 |
| web / 纯后端任务 | 零影响：prompt 分支仅在代理判定为原生 app 工程时生效；web 路径文本保持原语义。 |
| 复核硬门槛 | 不变：UI/表单任务必须有真实截图；原生 app 任务由复核代理亲自截屏取证。 |
| 任务状态机 | 零改动：失败路径复用「开发中停留 + rerun」。 |

---

## 7. 测试与验收

### 7.1 单元测试（TDD 红灯先行，node:test，文件 `test/device-guidance.test.js`）

| # | 用例 | 断言要点 |
| --- | --- | --- |
| T1 | `deviceGuidance('android', ['adb'])` | steps 含 `brew install android-platform-tools` 与 `command -v adb` |
| T2 | `deviceGuidance('android', ['android-device'])` | steps 含 `adb devices`、`device` vs `unauthorized` 说明、无线 `adb connect` |
| T3 | `deviceGuidance('android', ['adb', 'android-device'])` | 两步都出现 |
| T4 | `deviceGuidance('ios-simulator', ['xcode'])` | 含 xcode-select 检查 |
| T5 | `deviceGuidance('ios-simulator', ['simulator'])` | 含 `open -a Simulator` |
| T6 | `deviceGuidance('ios-device', ['idb'])` | 含 `idb-companion` 安装 |
| T7 | `deviceGuidance('ios-device', ['ios-pairing'])` | 含「信任此电脑」与 `idevice_id -l` |
| T8 | `deviceGuidance('weird-platform', ['other'])` / 空参数 | 不抛错，返回兜底指引 |
| T9 | `deviceGuidance('android', ['adb', 'ADB', ' adb '])` | 缺失项去重 + 大小写归一：`command -v adb` 步骤只出现一次 |
| T10 | `deviceGuidance('android', ['adb', 'unknown-thing'])` | 不抛错，未知项被跳过、已知项指引保留 |

实现后在项目根执行 `node --test`（自动发现 `test/` 目录；package.json 增加 `"scripts": { "test": "node --test" }`）。

### 7.2 静态与集成检查

- `node --check index.js`、`node --check client.js` 通过。
- develop/review prompt 文本包含 5.3 新增分支关键词（人工 grep 确认）。
- review 子代理：对照本 spec 检查实现一致性、遗漏与越界。

### 7.3 端到端（真实设备部分需人工）

本仓库无 Android/iOS 工程与真机，自动化 E2E 覆盖到：
1. host 纯函数与 prompt 生成：单测 + grep；
2. client UI：无法在无 DSH 环境独立渲染（依赖 `window.__DSH_BOOT__`）——若本机 dsh web profile 已 link 本插件，重启后用 Playwright 打开面板并以 fixture 数据核对「待接设备」徽标与指引横幅渲染；否则交付说明注明人工验收步骤。
3. 真实 app 任务（需老板在装有 Xcode/adb 的真机环境下跑一次）：
   - 发布一个 Android/iOS 仓库的 UI 改动任务 → 开发代理应探测平台、截真机屏、screenshots 出现 → 复核同样取证 → 可验收；
   - 拔掉设备发布同类任务 → 卡片出现「待接设备」徽标 + 指引横幅 → 按指引接好设备点「重新执行」→ 重跑成功出图。

### 7.4 验收标准（对 spec）

- [ ] R1：app 任务截图进入现有 screenshots 管道，面板展示与 web 截图一致；
- [ ] R3：prompt/指引覆盖 Android 真机+模拟器、iOS 模拟器、iOS 真机四条命令路径；
- [ ] R4/R6：缺设备时卡片出现「待接设备」徽标 + 分平台安装/连接指引；rerun 后重试成功并清标记；
- [ ] R5：发布表单零改动；
- [ ] R7：复核对 app 任务执行真机取证，无证据记问题；
- [ ] web 任务/纯后端任务行为与改动前一致（回归）；
- [ ] T1-T10 全绿；node --check 通过。

---

## 8. 开放问题（留档，不阻塞本次实现）

1. 混合仓库（同一仓库含 web + app）平台判定可能不唯一——已用「任务描述主对象 + 代理 summary 说明依据」缓解，后续可视反馈在发布区加可选平台字段。
2. iOS 真机安装 app 到设备（签名/证书）依赖开发者已有工程配置，代理不一定能独立完成——指引中保留「老板手动打开 app」路径。
3. 截图内容真实性（是否真在真机上运行）依赖代理自觉与复核取证，与 web 截图同等信任模型。
4. `deviceGuidance()` 边界（review 确认可接受，留档）：未知缺失项与已知项混合时静默跳过（仅当 steps 为空才触发泛化兜底）；platform 与 missing 域不匹配（如 `ios-device` + `['adb']`）时标题与步骤可能错配——依赖代理按 prompt 的标识组合输出，实现不做跨平台过滤以免过度复杂；`steps` 内部按行去重。
5. 本改动按「低复杂度：主 agent 实现 + 子 agent review」执行（无 ticketId，实现完不提交，等老板提供编号或明确豁免后按 `type(ticketId): title` 规范提交）。
