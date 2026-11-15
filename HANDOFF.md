# 交接文档（给下一个 AI）

> 仓库：`C:\coding\dsh-tt`，分支 `main`，工作树干净，最新提交 `dde12e2`（2026-11-15）。
> **把仓库交给下一个 AI 时，直接给它下面这段**：
>
> > 你在 `C:\coding\dsh-tt` 接手一个 DSH（DeepSeek Harness）的「角色扮演」插件项目。
> > 先通读本文件（`HANDOFF.md`）全文，再按第 12.4 节跑两条命令确认环境（应当 126/126 通过、残留 0），
> > 然后按第 9 节 P1 继续。不要改第 2 节的架构与用户约束；动代码前先看第 10 节的坑；
> > 设计与历史决策看 `DESIGN.md`（当前 v1.1，§14 是 ST 语义规格，§22 是最近一轮实现记录）。
>
> **怎么读这份文件**：第 0–3 节让你知道"这是什么、环境在哪、能跑什么"；第 4–7 节是架构与代码地图；
> 第 8 节给命令；第 9 节是待办（带落点）；第 10 节是**会让你浪费几小时的坑**，务必先读。
> `DESIGN.md` 是设计与历史决策的唯一事实来源（当前 v1.1，§1–§22）；本文件是**现状 + 怎么继续**。
> 文档里所有数字都可以用第 8 节的命令自己复现；与实测冲突时以实测为准。

---

## 0. 三十秒版本

这是一个**给 DSH（DeepSeek Harness）做的「角色扮演」插件**：用 SillyTavern 的资产（角色卡 PNG/JSON、
世界书、预设、正则、酒馆助手脚本）在 DSH 里复刻 ST 的体验。已完成：资产解析、ST 语义的提示词组装
（世界书激活/预设顺序/EJS/宏/正则）、每会话隔离的系统提示词、面板（三区布局 + 世界书/预设/预览/正则/
扩展/设置）、TH（酒馆助手）兼容运行时的 iframe 宿主、以及一整套构建/测试/安装/实机验证工具。

**当前最大未验证项**：TH 运行时（MVU 变量框架）在真实浏览器里能否跑起来；**最大硬约束**：DSH 的
会话日志只追加、`agent/request` 不能改消息，所以 ST 的 swipe/编辑/删除、@depth 逐消息插入、
`placement=2` 的 prompt 侧正则都做不了，除非改走 Shadow Chat（见 §9）。

---

## 1. 环境（先核对这一节）

| 项 | 值 |
|---|---|
| 仓库 / 工作目录 | `C:\coding\dsh-tt` |
| DSH 版本 | `@deepseek-ai/dsh` **0.2.2-rc.3**（Electron 单文件安装，源码在 `app.asar` 内） |
| DSH 可执行 | `C:\Users\Administrator\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe` |
| DSH CLI 入口 | `…\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js` |
| DSH 安装根（源码） | `…\resources\app.asar\dsh\node_modules\@deepseek-ai\` |
| profile | `C:\Users\Administrator\.dsh\profiles\desktop`（当前**已装插件**，待重启） |
| Node（用它，不要用别的） | `C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`（v24.21.0） |
| Python | `C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe` |
| git | `C:\Program Files\Git\cmd\git.exe`（仓库身份已配 `dsh-tt <dsh-tt@local>`） |
| npm / npx | **不存在**，别去找 |
| Web GUI | `http://127.0.0.1:<随机端口>/?token=…`，每次启动都变 |

若 DSH 升级：先跑第 8 节的构建 + `node tools/check.mjs` + 实机 e2e（§8.4），DSH 契约可能变（§7 是要点）。

---

## 2. 这个项目的目标与非目标

**目标（用户原话归纳，DESIGN §16.1）**
1. 点进插件就是完整的角色扮演界面：左侧局列表、窄顶栏、大面积聊天区（macOS 取向）。
2. 局（历史）跟着 DSH 会话走：会话还在就能加载全部内容；插件不备份聊天内容。
3. 角色卡里的**脚本与 UI 要能跑**（酒馆助手 JS-Slash-Runner 兼容）。
4. 能换卡、换预设；导入导出要做到位。
5. **必须兼容两套 ST 生态**：酒馆助手（TH 运行时）与 ST-Prompt-Template（EJS 提示词模板）。

**非目标**：像素级复刻 ST；运行 ST 原生扩展（jQuery DOM 注入那一类）；多用户/联网大厅。

**用户已确认的硬约束**（不要擅自改）
- 架构 C′：每局就是一个 DSH 会话（存储+回放载体），生成走 DSH 的 agent loop，插件在请求前重建提示词。
- 兼容层 b2：不 embed 整个 ST，只实现 JS-Slash-Runner 依赖的 ST API 子集。
- 聊天内容只存在于会话；会话标题统一 `RP · ` 前缀。
- 附件与语音不做；不设 token 上限。
- **不要玩开发套件/DevTools**（用户明确说过），优先写代码；需要浏览器验证就交给用户。
- 插件资产的私有大文件（`参考/`、`assets/`）不进版本库。

---

## 3. 架构：一条消息从面板到模型

```
[面板 Panel]（client 插件，浏览器）
  │  用户输入 + 信封（卡 JSON + 预设 JSON + 变量 + 开场白 + hash）
  │  ctx.remote.session.prompt({ mode:'queue', content:[{type:'text', text: "\0TT\0{...}\0TT\0正文"}] })
  ▼
[DSH 会话]（只追加的日志；这一局的"存储与回放"载体）
  │  agent/inbox/inserted → 插件按 agent 应用绑定（卡/预设/变量/开场白），推进世界书回合
  │  system-prompt 组装 → 读 agent.ctx 上注册的 section（text 是函数，返回该会话最新 system）
  │  agent/pre-step → 剥离信封（日志里只留用户原文）+ 用户输入正则（placement=1）
  │  agent/request（不能改消息）→ LLM → assistant/message 落日志
  ▼
[面板渲染]  读 session/events → 楼层列表 → 显示正则(placement=2) + 输出侧 EJS → Markdown/HTML
[TH iframe]  srcdoc + core.js（状态/API 语义）+ shim.js（ST/TH 全局）+ postMessage 桥
```

**提示词管线**（Host 与面板**同一份代码**：`plugin/lib/pipeline.js`）

```
卡 + 预设 + 变量 + 开场白
 ├─ 世界书：条目 → 装饰器（@@if/@@activate/@@dont_activate）→ 世界书正则(placement=5)
 │           → 递归扫描 / sticky·cooldown·delay / inclusion group / 概率 / 预算 → 按 position 分桶
 ├─ 提示词：固定内置段（worldInfoBefore→main→worldInfoAfter→charDescription→charPersonality
 │           →scenario→personaDescription→nsfw→jailbreak）+ prompt_order 用户段
 ├─ 渲染：整段 EJS（跨块）→ ST 宏
 ├─ tail：ANTop/ANBottom + post_history_instructions
 └─ 深度：@depth 条目 + 卡 depth_prompt + 绝对注入（injection_position=1）
           → 按深度降序**追加在 system 末尾**（D-020 的近似，见 §9）
```

**为什么提示词要靠"信封"送过去**：客户端能把资产读到浏览器里（`workspaceFiles.readBytes` 只读），
Host 读不到浏览器的 localStorage；两边唯一的通道就是用户发出去的那条 prompt。所以每轮把绑定塞进
信封、Host 解析后剥离。代价：每条约 3.5 MB（卡 2.4 MB + 预设 1.5 MB），本地实测无问题（§9 有优化想法）。

---

## 4. 现状矩阵（能用的 / 部分 / 做不到）

| 能力 | 状态 | 证据/落点 |
|---|---|---|
| 角色卡 V2/V3 PNG/JSON 解析（含 4.6 MB 卡） | ✅ | `plugin/lib/png.js`、`card.js`；`tools/inspect-cards.mjs` |
| 世界书：常量/主次关键词/概率/预算/8 位置 | ✅ | `plugin/lib/lorebook.js` + `tests/lorebook.test.mjs` |
| 世界书：递归 / sticky / cooldown / delay / delayUntilRecursion / inclusion group / outlet / `@@` 装饰器 | ✅ | 同上 + `tests/lorebook-advanced.test.mjs`（13 例） |
| 预设：prompt_order、marker、固定内置段、逐条启停 | ✅ | `plugin/lib/prompt.js`；`DESIGN §21.4`、`D-021` |
| EJS 模板（跨块/trim/转义/`getvar`/lodash/faker） | ✅ | `plugin/lib/ejs.js` + `tests/ejs.test.mjs` |
| ST 宏（`{{char}}`/`{{//}}`/`{{trim}}`/setvar/random/roll/时间…） | ✅ | `plugin/lib/macros.js` + `tests/macros.test.mjs` |
| 正则：显示侧（placement=2, markdownOnly） | ✅ | 面板 `applyDisplayRegex` |
| 正则：placement=1（用户输入）、5（世界书） | ✅ | `plugin/lib/regex.js` + `tests/regex.test.mjs` |
| 正则：placement=2 的 **prompt 侧**（改写 assistant 历史） | ⛔ | 见 §9 / D-023 |
| 每会话独立的系统提示词（多局并行不串） | ✅ | `plugin/agent.js` + `tests/agent.test.mjs`；D-022 |
| 信封剥离（日志只留原文） | ✅ | 实机 e2e：`user/message` = `测试正文` |
| @depth 逐消息插入 | ⛔ 近似 | 追加 system 末尾；D-020/D-024 |
| 开场白选择器（alternate_greetings） | ✅ 代码就绪，未点击验证 | `src/client.template.js` `greetingPick` |
| 面板：局列表/角色/世界书/预设/预览/正则/扩展/设置 | ✅ 静态渲染通过，未点击验证 | `src/client.template.js:914` `Panel()` |
| 面板「预览」：与 Host 同源的 system 段 + 激活清单 | ✅ | `plugin/lib/pipeline.js` + `tools/bundle-lib.mjs` |
| TH 运行时：变量五作用域/消息/事件/世界书/宏/toastr/弹窗/$、_ 子集 | ✅ 代码 + 18 个 Node 测试 | `src/tavern/core.js` + `tests/tavern-core.test.mjs` |
| TH：MVU 在真实浏览器里初始化 `stat_data` | ⚠ **未验证** | 需要用户在重启后点「扩展」看诊断 |
| TH：`generate` / `generateRaw` | ⛔ | 设计草案见 `DESIGN §22.8`、§9 |
| TH：聊天编辑/删除/轮转持久化 | ⛔ | 只改 iframe 镜像，下一页被父窗口覆盖 |
| swipe / 重新生成 / 编辑 / 删除楼层 | ⛔ | 日志只追加；需要 Shadow Chat（§9） |
| 群聊 / 分支 / 采样参数透传（top_p 等） | ⛔ 未做 | §9 |

**三张参考卡的实测**（`node tools/inspect-cards.mjs`）：

| 卡 | 世界书 | 提示词 | 备注 |
|---|---|---|---|
| 春日狂想曲·统一版（玩家通道） | 23/114 激活、30,495 tokens、递归 1 轮 | system 43,366 + 深度 1,299 = **44,667 字** | 15 个 TH 脚本（启用 2：MVU + 热更） |
| 天极1.5 | 33/201、20,256 tokens | 40,393 + 270 = 40,665 字 | 3 个启用脚本，最大 3.18 MB |
| 天元录 | 32/66、20,430 tokens、递归 2 轮 | 31,845 + **深度 18,485** = 50,332 字 | 6 个启用脚本，含 `mvu_zod.js` |

残留检查恒为 0（EJS 标签、EJS 错误、`@@` 装饰器、`{{//}}`）。

---

## 5. 代码地图

### 5.1 Host（Node，随 DSH 启动）

| 文件 | 职责 | 关键位置 |
|---|---|---|
| `plugin/index.js` | **根层入口**：只打一行日志。存在的唯一目的是让客户端模块被发现 | `apply()` |
| `plugin/agent.js` | **接管入口**（在 `roleplay` preset 的 agent 作用域内加载，`inject=['systemPrompt']`）。每 agent 一份状态 + 一份提示词段；`inbox/inserted` 应用绑定、推进世界书回合；`pre-step` 剥信封 + 用户输入正则 | `apply()`:119、`render()`:168、`applyBinding()`:225、`ensureRecord()`:324 |
| `plugin/lib/pipeline.js` | **同构管线**：卡+预设+变量+开场白 → system/深度/完整段。**不碰 Node API**，浏览器里也跑 | `runPromptPipeline()`:62 |
| `plugin/lib/lorebook.js` | 世界书引擎：激活顺序、计时、递归、分组、预算、分桶 | `activateEntries()`:151、`normalizeCharacterBookEntries()` |
| `plugin/lib/prompt.js` | ST 提示词结构：固定内置段 + `prompt_order` 用户段 + 深度/绝对注入分桶 | `renderPrompt()`:113、`parsePreset()`、`applyPresetOverrides()` |
| `plugin/lib/ejs.js` | EJS 运行时（跨块、trim、转义、路径、lodash/faker、错误回退） | `createEjsScope()`:516、`renderEjs()` |
| `plugin/lib/macros.js` | ST 宏替换 | `substitute()`、`createMacroEnv()` |
| `plugin/lib/decorators.js` | 世界书 `@@if`/`@@activate`/`@@dont_activate` | `applyWorldInfoDecorators()` |
| `plugin/lib/regex.js` | ST regex_scripts 解析与作用域过滤 | `applyRegexScripts()`:121、`collectRegexRules()` |
| `plugin/lib/card.js` | V2/V3 卡归一化 + 摘要 | `normalizeCard()`、`summarizeCard()` |
| `plugin/lib/png.js` | PNG `tEXt`/`iTXt` → 卡 JSON | `extractCardJson()` |
| `plugin/lib/library.js` | 资产扫描（`参考/`、`assets/`、`assetDirs`） | `loadLibrary()`、`resolveActive()` |
| `plugin/cordis.patch.yml` | 插件自带补丁（作为 bundle 安装时用；**不含**硬编码路径） | — |
| `plugin/package.json` | `exports`（`.`/`./agent`/`./client`/`./locale/*`/`./icon`/`./package.json`）、`dsh.client` | — |

### 5.2 Client（浏览器，构建产物 `plugin/client.js`）

| 文件 | 职责 |
|---|---|
| `src/client.template.js` | 面板模板（唯一源文件，130 KB）。`Panel()`:914；`previewState`:1424；`runSelfTest`:1496；含开场白选择器、预览页、正则页、自检、TH 宿主生命周期 |
| `src/tavern/core.js` | TH 纯状态/API 语义（变量五作用域、消息、事件总线、世界书、宏、STScript 子集）。**Node 可直接测** | `createCore()`:254 |
| `src/tavern/shim.js` | iframe 内：`SillyTavern` 上下文、`TavernHelper` 全局、toastr、`$`/`_` 子集、弹窗桥、脚本执行、资源加载失败捕获 | `runScript()`:1018、`callGenericPopup()`:598 |
| `plugin/client.js` | **生成物**（311.8 KB = 快照 1.8 + 核心 45.3 + shim 57.9 + 管线 78.6 + 面板）。**不要手改** |

### 5.3 工具（都在 `tools/`，可复现一切）

| 命令 | 作用 |
|---|---|
| `node tools/snapshot.mjs` | 资产 → `build/snapshot.json`（只留元数据，不含正文）；报告激活数与字数 |
| `node tools/build-client.mjs` | 注入快照 + core/shim + 同构管线 → `plugin/client.js` |
| `node tools/bundle-lib.mjs` | 单独产出 `build/tt-lib.js`（检查同构包；构建时内部已调用） |
| `node tools/check.mjs` | 管线自检：激活/分桶/递归/tokens/字数/残留。**判定"提示词是否正确"就用它** |
| `node tests/run.mjs` | 126 个用例（单进程；`node --test` 在沙箱里会 EPERM） |
| `node tools/install.mjs status\|install\|uninstall` | profile 安装/卸载（幂等、备份、安装标记、抗误删） |
| `node tools/verify-e2e.mjs <url?token=…>` | 对运行中的 `dsh web` 发信封，断言 system 由插件组装、日志只剩正文 |
| `node tools/inspect-cards.mjs` | 三张卡的体检报告 |
| `node tools/inspect-th-scripts.mjs` | 卡内启用脚本用到哪些 TH/ST API，与 shim 对照 |
| `node tools/inspect-remote.mjs` | 拉取远程 MVU bundle 并静态核对 API 面 |
| `tmp/asar.mjs` | 读 `app.asar`：`info` / `list <前缀>` / `read <路径>` / `grep <前缀> <正则>`（源码在 asar 里，必须用它读） |

### 5.4 测试（126 个）

`tests/card` `lorebook` `lorebook-advanced` `prompt` `ejs` `macros` `decorators` `regex`（Host 各层）、
`agent`（假 Cordis ctx + 假 agent，验证会话隔离/信封剥离/正则）、`tavern-core`（TH 状态层，用 `node:vm` 跑 IIFE）、
`bundled-lib`（同构包与 Host **逐字一致**）、`client-render`（用极简 React 真渲染 8 个页签）、`install`（安装器）。

夹具在 `tests/fixtures/`：V3 卡、V2 卡、预设、对象式世界书（**不含任何私有资产**）。

---

## 6. 数据与状态

| 数据 | 存在哪 | 谁写 |
|---|---|---|
| 聊天内容 | DSH 会话日志（只追加） | agent loop |
| 角色卡/预设/世界书原文 | 磁盘 `参考/`、`assets/`（Host 只读）；浏览器 localStorage `dsh-tt:v3`（导入的卡） | 用户 / 面板 |
| 面板状态（选卡、预设覆盖、会话元数据、开场白） | localStorage `dsh-tt:v3` | 面板 |
| TH 变量/消息变量/显示覆盖 | localStorage `dsh-tt:th:v1`（去抖 + 裁剪） | TH iframe → 面板 |
| 世界书计时（sticky/cooldown/delay） | **Host 内存**，每 agent 一份（`createWorldInfoSession()`） | `agent.js` |
| 插件的提示词状态 | Host 内存，每 agent 一份（`records: Map<agentId, …>`） | `agent.js` |
| profile 安装痕迹 | `profiles/desktop/{cordis.patch.yml, .dsh-tt-install.json, node_modules/@dsh-tt/roleplay}` | `tools/install.mjs` |

---

## 7. DSH 契约速查（实测，改代码前必读）

### 7.1 事件与作用域

| 事实 | 出处 |
|---|---|
| **先 assemble 系统提示词，再发 `agent/pre-step`** → 绑定必须在 `agent/inbox/inserted` 生效 | `dsh-agent-loop/src/agent.ts` 300 / 303 |
| `agent/pre-step(payload, next)`；`payload={agent,messages,turn,step,signal,modelSelection}`；`next()` → `PreStepDecision` | `dsh-agent/src/runtime-types.ts` 351 |
| `PreStepDecision = {kind:'reject'} \| {kind:'enter', messages: UserMessage[], startsRequestSeries?}`，`messages` **只能是 user 角色且被冻结** | 同上 139–146 |
| **`agent/request` 不能改消息**（官方注释） | 同上 ~361 |
| `agent/created({agent,source,signal})`；`agent/disposed({agent})`；`agent/inbox/inserted({agent,message})` | 同上 291/300/318 |
| `Agent.ctx` 的注册（提示词段/工具/监听）**只对该 agent 生效**，释放时撤销 | `dsh-agent/README.zh.md` 74 |
| 同一 preset 的插件树由**所有使用它的 agent 共享**（`mountPreset`） | `dsh-agent-preset-registry/src/mount.ts` |
| 访问 `systemPrompt` 必须在插件里 `inject=['systemPrompt']`；`agent.ctx.systemPrompt.section()` 可用 | 实测 |
| 提示词段 `text` 可以是 `(AssembleContext)=>string`，每次组装求值 | `dsh-system-prompt/src/index.ts` |

### 7.2 Remote（浏览器 → Host）

- HTTP 形态：`POST /api/<namespace>/<method>`，body
  `{type:'client-request', rpcId, method:'<namespace>/<method>', payload:{args:{request:{...}}}}`
  → `{type:'server-response', rpcId, result:{ok, value|error}}`。
  **`method` 必须是全名**（写 `create` 会报 `does not match endpoint "session/create"`）。
- 认证：`GET /?token=<启动令牌>` → 303 + 签名 cookie；后续带 cookie。
- 已知端点：`session/{list,search,create,rename,prompt,events,page,fork,cancel,updateQueue,selectModel,modelCatalog,attachment}`、
  `workspaceFiles/{list,read,readBytes,search,stat,changes}`。
  **没有「重新生成/重试」端点**；`fork` 是唯一的分支能力。
- `session/prompt` 入参：`{requestId, sessionId, mode:'queue'|'steer', content:[{type:'text',text}], clientTimeZone}`。
- `session/events` 入参：`{address:{kind:'session',sessionId}, maxMessages}` → `{records:[{type:'event',event:{type,…}}]}`。

### 7.3 客户端模块

- 启动图 `globalThis.__DSH_BOOT__.entries` 里会有 `{"id":"@dsh-tt/roleplay","url":"plugins/??@dsh-tt/roleplay/client.js&rev=…"}`。
- 客户端模块通过 `window.__ModuleLoader__.load({id, factory(require)})` 注册；导出 `{inject, apply(ctx)}`。
- 面板用 `ctx.remote.session` / `ctx.remote.workspaceFiles`；`inject` 要写全（`'remote.session'` 等）。
- 槽位：`slots.inject('main', () => slots.register({name:'main', key:'roleplay'}, Component))`；
  侧栏入口 `sidebar.panellist`（`id:'roleplay'`）。

---

## 8. 工作流（命令都可直接复制）

```powershell
$node = 'C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$git  = 'C:\Program Files\Git\cmd\git.exe'
Set-Location C:\coding\dsh-tt
```

### 8.1 改完代码的标准流程

```powershell
& $node tools/snapshot.mjs            # 资产变了才需要
& $node tools/build-client.mjs        # 改过 src/ 或 plugin/lib/ 就必须重新构建
& $node tests/run.mjs                 # 必须 126/126
& $node tools/check.mjs               # 看激活数/字数/残留（默认第一张卡=天极1.5：33/201、40,665 字）
& $git status --short                 # 构建是确定性的，正常应当干净
```

要复现文档里的「春日狂想曲 44,667 字」基线：

```powershell
$env:DSH_TT_ACTIVE='春日狂想曲·统一版（玩家通道）'
& $node tools/check.mjs               # 23/114、30,495 tokens、system 43,366 + 深度 1,299 = 44,667
Remove-Item Env:\DSH_TT_ACTIVE
```

改 `plugin/lib/*` 或 `plugin/agent.js` 时：**不要**手改 `plugin/client.js`（生成物）。
`plugin/lib` 里被同构打包的模块（ejs/macros/decorators/lorebook/regex/prompt/card/pipeline）**不能 import node: 内置**，
否则 `tools/bundle-lib.mjs` 会直接报错（这是故意的）。

### 8.2 提交

```powershell
& $git add -A
& $git -c core.safecrlf=false commit -m "…"     # 直接 -m 中文没问题；不要用 PowerShell 拼字符串写文件
```

### 8.3 安装到 profile（需要写工作区外的目录，DSH 沙箱会要求提升）

```powershell
& $node tools/install.mjs status
& $node tools/install.mjs install      # 备份 + junction + 补丁块 + 安装标记
& $node tools/install.mjs uninstall    # 安全卸载（先认包名与安装标记，再 rmdir）
```

装完**必须完全退出并重开 DSH**：Loader 图与客户端模块只在启动时组合。

### 8.4 实机端到端验证（会动 profile，需要授权）

```powershell
robocopy "$env:USERPROFILE\.dsh\profiles\desktop" "$env:USERPROFILE\.dsh\profiles\desktop-verify" /E /XJ
& $node tools/install.mjs install --profile-dir "$env:USERPROFILE\.dsh\profiles\desktop-verify"

$env:ELECTRON_RUN_AS_NODE='1'
Start-Process "C:\Users\Administrator\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe" `
  -ArgumentList @("`"C:\Users\Administrator\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js`"",
                  '--profile','desktop-verify','--port','7788','--no-open') `
  -RedirectStandardOutput build\verify-web.out.log -RedirectStandardError build\verify-web.err.log

# 从 build\verify-web.out.log 里取 URL（含 token），然后：
& $node tools/verify-e2e.mjs "http://127.0.0.1:7788/?token=…"

# 清理（顺序不能反：先删 junction，再删目录）
cmd /c rmdir "$env:USERPROFILE\.dsh\profiles\desktop-verify\node_modules\@dsh-tt\roleplay"
Remove-Item "$env:USERPROFILE\.dsh\profiles\desktop-verify" -Recurse -Force
```

最后一次结果（最新代码，2026-11-15）：`system 44,705 字`（= 本地 `check.mjs` 同输入输出 + 38 字开场白块）、
`user/message` 里有 `测试正文`、无信封、无 EJS/装饰器残留 —— 全部通过。

### 8.5 读 DSH 源码（必须用 asar 工具）

```powershell
& $node tmp/asar.mjs list 'dsh/node_modules/@deepseek-ai/dsh-system-prompt'
& $node tmp/asar.mjs read 'dsh/node_modules/@deepseek-ai/dsh-agent/src/runtime-types.ts'
& $node tmp/asar.mjs grep 'dsh/node_modules/@deepseek-ai/' 'agent/pre-step'
```

---

## 9. 待办（按优先级，带落点）

### P1 — 让 MVU 在真实浏览器里跑起来（用户侧验证 + 你修）

现在**没有**任何证据证明 TH 运行时在浏览器里初始化成功。步骤：
1. 用户重启 DSH → 进一个 RP 局 → 面板「设置」→「运行自检」；再看诊断里有没有
   `执行脚本「…MVU…」（module）`、`资源加载失败：<url>`。
2. 面板「扩展」→「状态变量」里若出现 `stat_data`，说明 MVU 完成 `[InitVar]` 初始化。
3. 若失败，按线索改：
   - 资源加载失败 → 远程依赖问题（MVU bundle 558.9 KB，还 import 了 `@google/genai`、
     `@earendil-works/pi-ai` 等数十个 jsdelivr 模块）。落点：`src/tavern/shim.js` 的 `runScript()`；
     可做「父窗口预取 + blob URL 重写」的本地缓存（这是 DESIGN 里的「远程脚本缓存」）。
   - 报某 API 不存在 → 对照 `tools/inspect-remote.mjs` 的输出补 `src/tavern/shim.js` / `core.js`。
     已核对：TH 20/20、`SillyTavern` 成员 26/26（按名字；语义要按报错补）。
   - 初始化时机问题 → `runScripts()` 末尾补发的事件（`CHAT_CHANGED`/`APP_READY`/`SETTINGS_LOADED`/一次
     `GENERATION_STARTED`）是 MVU 的初始化触发点，注意别重复发 `GENERATION_STARTED`（会重置变量）。

### P2 — Shadow Chat（一次解决四件事）

要解锁：`@depth` 逐消息插入、`placement=2` 的 prompt 侧正则、swipe/编辑/删除、TH 聊天编辑持久化。
**为什么现在做不了**：日志只追加；`pre-step` 只能改 user 消息；`agent/request` 不能改 messages。
可选路径（按代价排序）：
1. **Host 侧自生成**：插件用 `ctx.llm.stream()` 直接出结果，然后 append 一条 assistant 消息，
   在 `agent/pre-step` 里 `{kind:'reject'}` 掉 loop 的模型调用。需要先确认两件事：
   插件能否 `inject:['llm']`、`agent.session.append('assistant/message', …)` 是否对插件开放。
2. **客户端组请求 + Host 透传**：需要一条 Host→Client 的流式通道（Typert Remote 生成器本仓库没有，
   V17 一直是风险项；`/api/<ns>/<method>` 只能调已注册的命名空间）。
3. 退路：`session/fork` 做"分支/重新生成"，语义与 ST 的 swipe 不同但可行。

### P2 — TH `generate` / `generateRaw`

设计草案（`DESIGN §22.8`）：面板开一个辅助会话（标题 `RP · 辅助`），TH 的 `generate` 通过 postMessage
请求面板 → 面板用信封发 prompt（`generate` 走完整 ST 管线；`generateRaw` 带 `raw:true`，Host 用最小 system）
→ 面板从 `session/events` 取 `assistant/message` 回填给脚本。要处理：辅助会话会进会话列表、
轮询延迟、取消语义。

### P3 — 其它

- 远程脚本缓存/离线可复现（sha256 + 本地缓存 + 显式授权）。
- 采样参数透传（DSH 只有 temperature/maxTokens/stop；top_p/penalty 要自建 provider）。
- 群聊、分支、聊天导入导出（ST jsonl）。
- 信封瘦身：卡/预设 JSON 每轮 3.5 MB。做法：客户端按 hash 只发一次，Host 落盘缓存
  （Host 有写权限）；注意 Host 重启后要能回退到按名字查资产库。
- 世界书预算可配置化（现在是 `maxContext * 0.25` 或 `worldInfoBudget`）。

### 怎么加一个新 ST 能力（标准打法）

以"新增一个世界书字段"为例：
1. `plugin/lib/lorebook.js` 的 `normalizeCharacterBookEntries()` / `normalizeTimers()` 里归一化；
2. `activateEntries()` 的判定顺序里插入（**顺序必须照 ST**，见 `DESIGN §14.2`）；
3. `tests/lorebook*.test.mjs` 补用例；夹具放 `tests/fixtures/lorebooks/`；
4. `node tools/check.mjs` 看三张真卡有没有回归（数字会变是正常的，但残留必须是 0）；
5. 若面板要展示，改 `src/client.template.js` 并跑 `tests/client-render.test.mjs`；
6. `DESIGN.md` 的 §22 或新章节记录一行。

---

## 10. 坑（会让你浪费几小时的，逐条踩过）

1. **不要用 PowerShell 的 `Get-Content`/`Set-Content` 改含中文的文件**：本机 PS 5.1 默认按 ANSI 读写，
   会把 UTF-8 中文变成乱码、甚至吃掉引号（本轮踩过 `.gitignore` 与一个测试文件）。
   改文本用编辑工具或 Node 的 `fs.writeFileSync(path, text, 'utf8')`。用 PowerShell 时只做**读**。
2. **本机 Node 识别不出目录联接**：对 junction，`lstatSync().isSymbolicLink()` 返回 false，
   `readlinkSync()` 抛 `EINVAL`，`realpathSync()` 不解析。但**通过联接读文件与 `require.resolve` 正常**。
   所以安装器用「读 `package.json` 的 name + 解析成功 + `.dsh-tt-install.json` 标记」判定，
   卸载用 `fs.rmdirSync`（对联接只删链接）。**绝对不要**对 profile 里的 `node_modules/@dsh-tt` 做
   `Remove-Item -Recurse`（会跟随联接删到 `plugin/`）。
3. **不要对 `include:tt-roleplay` 调 `plugin_manager set_plugin enabled=false`**：它会往 profile 补丁写
   `disabled: true`，重启后侧栏入口消失（上一轮踩过，已修）。
4. **`node --test tests/` 会 `spawn EPERM`**：DSH 的 Windows 沙箱禁止子进程用管道捕获 stdio。
   用 `node tests/run.mjs`（同进程加载）。同理，Node 里 `child_process.spawn` 用默认 `stdio:'pipe'` 会失败。
5. **改 Host/client 代码后必须重启 DSH**：运行中的实例永远加载的是启动时的 bundle，
   不要用当前面板的行为判断新代码。
6. **提示词段必须在 `agent.ctx` 上注册**：注册在 preset 作用域会被所有会话共享（多局串卡）。
   而且段文本要是**函数**（每次组装读最新状态），否则换卡/改变量不会生效。
7. **绑定要在 `agent/inbox/inserted` 应用**：assemble 在 `agent/pre-step` 之前发生（DSH 源码 300/303 行），
   在 pre-step 里应用会慢一拍。
8. **`plugin/client.js` 是生成物**：改 `src/client.template.js` / `src/tavern/*` / `plugin/lib/*` 后重新
   `node tools/build-client.mjs`。构建是确定性的（不含时间戳），重建后 `git status` 应干净。
9. **EJS 的 trim 语义**：`<%_` 吃前导空白、`_%>` 吃后导空白、`-%>` 吃一个换行、`<%%` 输出字面 `<%`。
   参考卡用了 415 个 `-%>`；改这段等于改所有卡输出，改前先跑 `tools/check.mjs` 记基线。
10. **世界书位置映射**：V3 卡把 atDepth 存在 `extensions.position`，顶层 `position` 可能是
    `"after_char"`；`normalizeBookEntryPosition()` 必须优先看 `extensions.position`。
11. **`session/list` 的返回形状没完全确认**：代码兼容 `sessions`/`rows`/`items`/数组四种；
    `session/selectModel` 的入参也是多形状尝试（`{sessionId,provider,model}` 与 `{sessionId,selection}`）。
    真机校准时看面板「设置」的诊断。
12. **TH iframe 的 sandbox 是 `allow-scripts allow-same-origin`**：TH 的 `window.parent` 与
    `registerScriptPreference` 依赖同源；代价是脚本与插件同权，只跑信任的卡。
13. **参考资产不进版本库**：`参考/`、`assets/*`、`tmp/`、`build/` 都在 `.gitignore` 里。
    测试用 `tests/fixtures/` 的合成夹具，不要依赖私有大文件。

---

## 11. 术语表

| 词 | 含义 |
|---|---|
| 楼层 / floor | 一条消息 |
| 变体 / swipe | 同一条消息的多个候选回复（当前不支持） |
| 世界书 / lorebook / character_book | 按关键词或恒定触发的设定条目 |
| 预设 / preset | ST 的 prompt 列表 + `prompt_order` + 采样参数 + 扩展配置 |
| marker | 预设里的位置占位符（`worldInfoBefore`/`chatHistory`/`main`…），不产出文本 |
| @depth / atDepth | 按"距对话末尾的楼层数"注入的条目（我们目前追加在 system 末尾） |
| 破限 / jailbreak | 预设里绕过限制的提示词，通常走深度注入 |
| TH / 酒馆助手 / JS-Slash-Runner | ST 的脚本扩展生态；我们自建兼容运行时（b2） |
| MVU / MagVarUpdate | 用 `[InitVar]` 世界书条目初始化变量、模型按 JSON Patch 更新 `stat_data` 的框架 |
| EJS / ST-Prompt-Template | 提示词里的 `<% %>` 模板；我们内置渲染器 |
| 信封（envelope） | 面板把绑定塞进 prompt 的 `\0TT\0{json}\0TT\0` 前缀，Host 解析后剥离 |
| preset 作用域 / agent 作用域 | Cordis 的作用域；前者被同 preset 的所有会话共享，后者单会话 |

---

## 12. 附录

### 12.1 参考资产（`参考/`，不进版本库）

| 文件 | 说明 |
|---|---|
| `IMG_4552.PNG`（4.6 MB） | 春日狂想曲·统一版（玩家通道）：126 条世界书、91 常量、15 个 TH 脚本（启用 2）、14 条正则 |
| `1.5.png`（10.2 MB） | 天极1.5：203 条世界书、3 个启用脚本（最大 3.18 MB） |
| `688e49680bc24949a25daf3f636721a8.png`（2.8 MB） | 天元录：161 条世界书、6 个启用脚本、18 条 atDepth |
| `梦鲸思客V5-1030-exp.json`（1.5 MB） | ST Chat Completion 预设：122 prompts / 118 order / 28 条正则 |

### 12.2 Git 历史（本会话新增，旧提交见 `git log`）

```
dde12e2 build: 客户端快照不再内嵌 generatedAt，重建不再产生无意义 diff
ab23f79 docs: HANDOFF 记录本轮提交与最新 e2e 结果
34d7696 feat(inspect): 卡体检/TH 脚本盘点/远程依赖核对 + 资源加载失败诊断
c08f934 feat(panel): 正则页 + 设置页自检；测试真正渲染每个页签
91dec40 feat(preview): 面板「预览」页 —— 与 Host 同源的提示词管线同构包
5383555 docs: 会话 30 记录（DESIGN §22 + D-022..D-025，HANDOFF 全面更新）
55c246a feat(lorebook+regex): 世界书递归/计时/分组/outlet，prompt 作用域正则接入
9ac47ed feat(v0.3): 会话隔离的提示词段 + 路径解耦 + 测试/安装/验证脚手架
```

### 12.3 外部资料

- 上游：`https://github.com/N0VI028/JS-Slash-Runner`（PolyForm NonCommercial，**只做 API 兼容，不 vendor 代码**）
- MVU：`https://github.com/MagicalAstrogy/MagVarUpdate`
- 提示词模板：`https://github.com/zonde306/ST-Prompt-Template`（AGPL-3.0，只复刻行为语义）
- SillyTavern 语义：`DESIGN.md §14`（世界书判定顺序、提示词组装、正则 placement、宏三段求值、swipe 模型、STScript、预设格式）
- 本仓库远程：`https://github.com/eojnus/dsh-tt`（public；大资产未上传）

### 12.4 现在就能做的第一件事

```powershell
Set-Location C:\coding\dsh-tt
& 'C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe' tests/run.mjs
& 'C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe' tools/check.mjs
```

两条都通过（126/126、残留 0），说明代码与环境一致；然后请用户重启 DSH，按 §9 P1 收集 MVU 的实机信号。
