# 交接文档（HANDOFF）

> 本文件为交接用途，只记录事实与可验证状态，不包含主观评价或建议。
> 生成时间：2026-11-15（会话第 27 轮）。仓库：`X:\dsh-tt`，分支 `main`，HEAD `aea9bd1`。

---

## 1. 环境事实

| 项 | 值 |
|---|---|
| 工作目录 | `X:\dsh-tt` |
| DSH 安装包版本 | `@deepseek-ai/dsh` 0.2.2-rc.3 |
| DSH 安装根 | `C:\Users\Administrator\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai\` |
| Desktop profile | `C:\Users\Administrator\.dsh\profiles\desktop` |
| Web GUI | `http://127.0.0.1:<随机端口>`（每次启动变化，需从应用内复制） |
| Node（可用） | `C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe` |
| Python（可用） | `C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe` |
| git（可用） | `C:\Users\Administrator\.dsh\bin\mingit\cmd\git.exe`（MinGit 2.56.1，本机原无 git） |
| npm / npx | 不存在于 PATH |
| 读 ASAR 工具 | `tmp/asarls.ps1`（列目录/读文件）、`tmp/asargrep.ps1`（按正则搜包内源码） |

---

## 2. 安装状态（已生效，重启后加载）

| 项 | 状态 |
|---|---|
| profile 目录联接 | `profiles\desktop\node_modules\@dsh-tt\roleplay` → `X:\dsh-tt\plugin`（junction，`require.resolve` 已验证通过） |
| profile 补丁层 | `profiles\desktop\cordis.patch.yml` 末尾有 `insert` 块，含两条行：`tt-roleplay`（`config.takeover=false`）与 `preset-roleplay`（内嵌 `tt-roleplay-agent`，`takeover=true`） |
| profile package.json | 已还原为原始 263 字节，**未**包含本插件依赖，**未**列入 `dsh.profile.bundles` |
| 编码 | `package.json` 与 `cordis.patch.yml` 均经字节校验为无 BOM |
| 生效条件 | 完全退出并重开应用（客户端模块图在启动时组合） |
| 回滚 | 拷回 `build/profile-backup/*.bak`，并删除 `profiles\desktop\node_modules\@dsh-tt` |

---

## 3. 文件清单

| 路径 | 说明 |
|---|---|
| `DESIGN.md` | 设计文档 v0.9，含 §1–§20（目标、DSH 机制、参考资产实测、TH/MVU 实测、A/C 架构、ST-Prompt-Template 调研、决策记录 D-001..D-016、待决问题 Q-001..Q-025、验证清单 V1..V17） |
| `plugin/package.json` | `dsh.bundle.patch` = `./cordis.patch.yml`；`dsh.client` = `{platform:'web', immediately:true}`；`exports` 含 `.`、`./client`、`./locale/*.json`、`./icon`、`./package.json` |
| `plugin/cordis.patch.yml` | 根层 `tt-roleplay` + `preset-roleplay`（零工具 preset） |
| `plugin/index.js` | Host 入口：扫资产 → 渲染系统提示词 → `ctx.systemPrompt.section({complete:true})` → `ctx.on('agent/pre-step')` 剥信封、切绑定、注入 `@depth` |
| `plugin/lib/png.js` | PNG `tEXt`/`iTXt` 读取 `chara`/`ccv3` → 卡 JSON |
| `plugin/lib/card.js` | Character Card V2/V3 归一化 + 摘要 |
| `plugin/lib/lorebook.js` | 世界书激活：constant、主/次关键词四种逻辑、概率、预算、8 种位置分桶 |
| `plugin/lib/macros.js` | ST 宏：`{{//}}` `{{trim}}` `{{setvar}}/{{getvar}}` `{{random}}` `{{pick}}` `{{roll}}` 时间/日期/`{{char}}` 等 |
| `plugin/lib/prompt.js` | ST 顺序组装；`injection_position=1` 归入 `injected`（深度注入）；当前为逐块渲染 |
| `plugin/lib/ejs.js` | EJS 子集：`<% %>` / `<%= %>` / `<%- %>` / `<%# %>`；作用域 `getvar/setvar/incvar/decvar/delvar/getwi/getchar/print/variables` |
| `plugin/lib/library.js` | 目录扫描与类型识别（card / preset / lorebook） |
| `src/client.template.js` | 客户端面板源文件；构建时注入快照生成 `plugin/client.js` |
| `plugin/client.js` | 构建产物（约 74 KB），由 `tools/build-client.mjs` 生成 |
| `tools/snapshot.mjs` | 资产 → `build/snapshot.json`（含 `rawLite`：description/firstMes/systemPrompt/postHistoryInstructions/alternateGreetings/depthPrompt/regex_scripts） |
| `tools/build-client.mjs` | 用 `const SNAPSHOT = __SNAPSHOT__;` 精确替换注入快照，输出 `plugin/client.js` |
| `build/snapshot.json` | 生成物（`.gitignore` 已排除） |
| `assets/`、`参考/` | 用户资产，`.gitignore` 已排除 |
| `tmp/` | 调研脚手架（已排除）：`asarls.*`、`asargrep.*`、`inspect_*.py`、`render-test.cjs`、`smoke.mjs`、`check-ejs.mjs`、`patch-v*.mjs` |

---

## 4. 已验证的 DSH 契约（含出处）

### 4.1 Remote 调用返回信封

- 形式：成功 `{ ok: true, value }`；失败 `{ ok: false, error: { code, message } }`。
- 出处：`dsh-client-ui-model-selection/src/client/catalog.ts` 第 56–75 行（`response.ok` / `response.value.groups` / `response.error.code`）。

### 4.2 session 命名空间端点（出处：`dsh-api-session-controller/lib/typert.remote-client.js`）

| 端点 | 入参 | 出参 | 行号 |
|---|---|---|---|
| `session/create` | `{workspaceId?, cwd?, sessionId?, agentPreset?}`（无 title） | `{sessionId, agentPreset?}` | 2022–2053 |
| `session/events` | `{address:{kind:'session',sessionId} \| {kind:'subagent',...}, throughSeq?, beforeSeq?, maxMessages?, turnWindow?}` | `{cursor, records[], hasMore}` | 2054–2086 |
| `session/list` | `{cursor?}` | `SessionListValue`（JSON Schema 缺省，**形状未验证**） | 2168–2200 |
| `session/prompt` | 必填 `{requestId, sessionId, mode:'queue'\|'steer', content[]}`，可选 `clientTimeZone` | `{accepted:true}` | 2417–2449 |
| `session/rename` | `{sessionId, title}` | `{title, seq}` | 2450–2479 |
| `session/modelCatalog` | 无参数 | `ModelCatalog`（`groups[].models[]`） | 2201–2215 |
| `session/selectModel` | 未读取 schema | 未读取 | 2515 |

`content` 项为 `{type:'text',text}` / `{type:'image',mediaType,data}` / `{type:'file',receiptId}`。

### 4.3 其余已验证事实

| 事实 | 出处 |
|---|---|
| `workspaceFiles` 只有 `list/read/readBytes/search/stat/changes`，**无写入端点** | `dsh-api-workspace-files/lib/typert.host.js` 187–484 |
| `ctx.systemPrompt.section({name, order, text, complete?, interpolate?})` | `dsh-system-prompt/README.zh.md` 58–64 |
| 客户端插件格式 `window.__ModuleLoader__.load({id, factory(require){…}})` | `dsh-agent-preset/skills/dsh-doc/templates/decoration/client.js` |
| 客户端插件必须声明 `remote` 与 `remote.session` 注入，否则报 `cannot get property "remote" without inject`（该错误文本已在实机出现） | `dsh-client-ui-model-selection/src/client/index.ts:107` |
| 客户端模块图由"已启用的 Loader 条目"组合；只改 manifest 需条目重启或 Host 重启 | `dsh-client-modules/README.zh.md` 12、149 |
| 客户端 `main` keyed 面板与 `sidebar.panellist` 注册形状 | `dsh-client-ui-plugin-manager/src/client/index.ts` 129–173 |
| `main`/`sidebar.panellist` 注册与 `ctx.layout.selectPanel(id)` | `dsh-client-ui-layout/README.zh.md`、`dsh-client-ui-sidebar/README.zh.md` |

---

## 5. 参考资产评估结果（实测）

`参考/IMG_4552.PNG`（4,638,746 字节，512×768，`chara` tEXt，4,191,436 字节 base64）：

| 字段 | 值 |
|---|---|
| spec | `chara_card_v3` / `3.0`，解出 2,399,543 字符 JSON |
| name / creator | 春日狂想曲·统一版（玩家通道） / 时之写卡器 |
| description / first_mes | 20 / 33 字符 |
| alternate_greetings | 3 条：10,919 / 3,626 / 5,601 字符 |
| character_book | 126 条、282,547 字符；91 条 constant；position：before_char 83 / after_char 9 / 未指定 34 |
| `[InitVar]` 条目 | 3 条 |
| extensions.tavern_helper | 1,993,524 字符；scripts 15 个（启用 2 个），含 variables |
| 启用脚本 | `[共用] MVU`（91 字符，内容为 `import 'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js'`）、`[共用] 00-热更加载器`（24,563 字符） |
| 冷备脚本 | 13 个，最大 `[同层] 核心v88` 1,171,652 字符 |
| extensions.regex_scripts | 14 条（markdownOnly 8 / promptOnly 6，placement=[2]） |
| depth_prompt | `{prompt:'', depth:4, role:'system'}` |

`参考/梦鲸思客V5-1030-exp.json`（1,516,363 字节）：

| 字段 | 值 |
|---|---|
| prompts | 122 条（system 14 / user 104 / assistant 4），正文合计 32,084 字符 |
| prompt_order | 118 项，启用 44 项，marker 8 个 |
| 采样参数 | temperature 1 / top_p 0.95 / openai_max_tokens 30000 / openai_max_context 2000000 |
| extensions | `regex_scripts` 116,806 字符；`tavern_helper.scripts` 1,162,857 字符；`tool_output_bridge` 666 字符；`luker` 7,149 字符 |

---

## 6. 两套必装扩展的实测与调研

### 6.1 JS-Slash-Runner（酒馆助手）

- 仓库 `N0VI028/JS-Slash-Runner`，1,423 stars，PolyForm NonCommercial。
- API 面：`@types/function/` 下 24 个域（audio / builtin / character / chat_message / displayed_message / extension / file / generate / global / import_raw / inject / lorebook / lorebook_entry / macro_like / persona / preset / raw_character / script / slash / tavern_regex / util / variables / version / worldbook）。
- MVU bundle 实测（611,598 字节，`testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js`）：

| 符号 | 次数 |
|---|---|
| `SillyTavern.chat` | 27 |
| `SillyTavern.callGenericPopup` / `POPUP_TYPE` / `POPUP_RESULT` | 17 / 17 / 14 |
| `SillyTavern.getCurrentChatId` | 13 |
| `SillyTavern.getRequestHeaders` / `saveChat` | 5 / 5 |
| `SillyTavern.chatCompletionSettings` / `extensionSettings` | 3 / 3 |
| `SillyTavern.getCharacterCardFields` / `ToolManager` / `unregisterFunctionTool` | 2 / 2 / 2 |
| `getVariables` / `getChatMessages` / `setChatMessages` | 11 / 9 / 7 |
| `substitudeMacros` / `eventOn` / `eventEmit` | 7 / 4 / 21 |
| `toastr.*` / `$(` | 103 / 9 |

### 6.2 ST-Prompt-Template（提示词模板）

- 仓库 `zonde306/ST-Prompt-Template`，518 stars，AGPL-3.0，描述 "Using Template Syntax (EJS) in Prompt"。
- 能力：发送前 EJS 渲染（prompt / 卡 / 世界书）、收言后渲染、`[GENERATE:BEFORE|AFTER]` 内容注入、`@INJECT` 消息注入、`getvar/setvar/getwi/getchar`、变量三级作用域（global/local/message）、内建 `_`（lodash）与 `faker`。
- 例：参考预设正文含 `<% /* … */ var TH_FEST_M = 4 … %>` 形式的 EJS 块。

---

## 7. 已实现的运行时行为

| 行为 | 位置 | 状态 |
|---|---|---|
| 资产扫描（卡/预设/世界书） | `plugin/lib/library.js` | 可用 |
| PNG 卡解析（含 4 MB 级 base64，客户端分块解码） | `plugin/lib/png.js`、`src/client.template.js` `readCardFile` | 可用 |
| 世界书激活（constant/主次关键词/概率/预算/8 位置） | `plugin/lib/lorebook.js` | 可用；未实现递归、sticky/cooldown/delay、inclusion group、`@@`装饰器、outlet |
| ST 宏 | `plugin/lib/macros.js` | 可用 |
| EJS（单块） | `plugin/lib/ejs.js` + `prompt.js` | 已接入；跨块模板未处理 |
| 系统提示词接管 | `plugin/index.js`（`complete:true` 段） | 已实现，实机未验证 |
| 信封（卡/预设绑定） | `client.template.js` `bridge.prompt` + `plugin/index.js` `readEnvelope` | 已实现，实机未验证 |
| `@depth` 注入 | `plugin/index.js` pre-step | 已实现，实机未验证 |
| 面板三区 / 局列表 / 发送 / 导入导出 / 诊断 | `src/client.template.js` | 已实现 |
| 模型目录 | `session.modelCatalog()` → `value.groups[].models[]` | 已实现 |
| TH 沙箱宿主 | — | **未实现**（`tmp/patch-v7.mjs` 因脚本自身语法错误未产生任何改动） |
| 输出侧 EJS / 显示正则接线 | `applyDisplayRegex` 已用于楼层；客户端 EJS **未加入** | **未实现** |
| 世界书查看/编辑 | — | **未实现** |
| 附件 / 语音 | — | 按用户要求移出范围 |

---

## 8. 最近一次实测输出（可复现）

命令：

```
node tools/snapshot.mjs
node tmp/check-ejs.mjs
node --check plugin/client.js
node --check plugin/index.js
node --check plugin/lib/prompt.js
node --check plugin/lib/ejs.js
```

输出（2026-11-14 最后一次执行）：

```
snapshot: cards=1 presets=1 lorebooks=0 errors=0 | active=春日狂想曲-统一版-玩家通道-0 wi=25/114 sys=79790
system chars: 79792
leftover <% count: 118
has setvar leftovers: false
client: 0  index: 0  prompt: 0  ejs: 0
```

---

## 9. 未完成项与精确落点

### 9.1 跨块 EJS（目标：`leftover <% count` = 0）

- 现状：`plugin/lib/prompt.js` 中 `push()` 逐块调用 `render()`，`const system = parts.join('\n\n');`。
- 目标形态：`push()` 只收集原文；末尾 `const system = render(parts.join('\n\n')).trim();`；`depth` 循环按 group 合并后渲染（现为逐条渲染）。
- 验收命令：`node tmp/check-ejs.mjs`（脚本位于 `tmp/`，读取 `参考/` 与 `assets/`）。

### 9.2 TH 沙箱宿主

- 现状：`plugin/client.js` 中不存在 `createTavernHost`；`grep -c createTavernHost plugin/client.js` = 0。
- 插入点：`src/client.template.js` 中 `function PanelIcon({ size }) {` 之前。
- 数据来源：卡片 `cardJson.extensions.tavern_helper.scripts`（参考卡 15 个，启用 2 个）。
- 需覆盖符号：见 §6.1 表格。
- 已写好但未落地的实现：`tmp/patch-v7.mjs`（该脚本第 96 行有语法错误，整体未执行）。

### 9.3 输出侧渲染

- 现状：楼层渲染处为 `const text = applyDisplayRegex(floor.text, displayRules);`；客户端无 EJS 函数。
- 目标：`renderEjsClient(applyDisplayRegex(text, rules), vars)`，变量由 TH 宿主回传。
- 已写好但未落地的实现：同 `tmp/patch-v7.mjs`。

### 9.4 资产与预设管理

- 现状：角色卡与预设的导入（JSON / PNG）、导出（Blob 下载）、切换、列表已实现于 `cardsPane` / `presetsPane`。
- 未实现：世界书列表与内容查看、预设内部 prompt 的查看/启停。

---

## 10. 未验证事项（实机才能确认）

| 编号 | 事项 |
|---|---|
| U1 | `ctx.on('agent/pre-step', (decision, next) => …)` 的真实签名与 `next(decision)` 语义 |
| U2 | `ctx.systemPrompt.section({complete:true})` 在本 profile 是否被接受（被拒时代码会退回非 complete 段并写日志） |
| U3 | `session.list` 返回的 `value` 具体形状（代码兼容 `sessions` / `rows` / `items` / 数组） |
| U4 | `session/selectModel` 入参形状（代码尝试 `{sessionId, provider, model}` 与 `{sessionId, selection}`） |
| U5 | 客户端 `ctx.remote` 在本插件上下文中可访问的命名空间集合 |
| U6 | 面板在宿主明暗主题下的实际渲染结果 |

---

## 11. 常用操作

```powershell
# 重新解析资产并生成客户端包
& "C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" X:\dsh-tt\tools\snapshot.mjs
& "C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" X:\dsh-tt\tools\build-client.mjs

# 语法检查
& "...\node.exe" --check X:\dsh-tt\plugin\client.js
& "...\node.exe" --check X:\dsh-tt\plugin\index.js

# 面板渲染桩测试（假 React，检测渲染期异常）
& "...\node.exe" X:\dsh-tt\tmp\render-test.cjs

# Host apply 桩测试（假 ctx；桩里没有 ctx.on，会打印 pre-step 订阅失败，属预期）
& "...\node.exe" X:\dsh-tt\tmp\smoke.mjs

# git
& "C:\Users\Administrator\.dsh\bin\mingit\cmd\git.exe" -C X:\dsh-tt status
```

---

## 12. 用户已确认的约束（事实）

1. 架构：C′（会话作聊天载体）+ b2（ST API 仿真层），取代早前的 A/B 方案。
2. 两套扩展（JS-Slash-Runner、ST-Prompt-Template）作为**内置扩展、默认启用**。
3. 资产与聊天记录：聊天内容只存在于会话，插件不备份；会话标题统一 `RP · ` 前缀。
4. 面板形态：macOS 取向；左侧局列表、窄顶栏、右侧大面积聊天区。
5. 破限/深度注入按 ST 语义（`prompt_order` + `marker` + `injection_position/depth/role`）。
6. 附件与语音：不做。
7. 测试策略：除必要外不测试；不设 token 上限。
