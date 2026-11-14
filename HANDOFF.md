# 交接文档（HANDOFF）

> 本文件为交接用途，只记录事实与可验证状态，不包含主观评价或建议。
> 生成时间：2026-11-15（会话 29）。仓库：`X:\dsh-tt`，分支 `main`。
> 上一份交接：HEAD `f5be654`（会话 27/28 的分界）；本轮改动见 §12。

---

## 1. 环境事实

| 项 | 值 |
|---|---|
| 工作目录 | `X:\dsh-tt` |
| DSH 安装包版本 | `@deepseek-ai/dsh` 0.2.2-rc.3（desktop shell `@deepseek-ai/dsh-desktop` 0.2.2-rc.3） |
| DSH 安装根 | `C:\Users\Administrator\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai\` |
| Desktop profile | `C:\Users\Administrator\.dsh\profiles\desktop` |
| Web GUI | `http://127.0.0.1:<随机端口>`（每次启动变化；本会话为 49273，重启后会变） |
| Node（可用） | `C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe` |
| Python（可用） | `C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe` |
| git（可用） | `C:\Users\Administrator\.dsh\bin\mingit\cmd\git.exe`（MinGit 2.56.1） |
| npm / npx | 不存在于 PATH |
| 读 ASAR 工具 | `tmp/asarls.ps1`（列目录/读文件）、`tmp/asargrep.ps1`（按正则搜包内源码） |
| 验证用 CLI | `tmp/dsh.ps1 -CliArgs "..."`（`ELECTRON_RUN_AS_NODE=1` 跑 `lib/bin.js`；注意它会缓冲输出到退出才打印） |
| GitHub 远程 | `https://github.com/eojnus/dsh-tt`（public，无 description；`参考/`、`assets/*`、`tmp/`、`build/` 未上传，仅保留 `assets/README.md`） |

---

## 2. 安装状态（重要：需要重启才生效）

| 项 | 状态 |
|---|---|
| profile 目录联接 | `profiles\desktop\node_modules\@dsh-tt\roleplay` → `X:\dsh-tt\plugin`（junction，`require.resolve` 已验证） |
| profile 补丁层 | `profiles\desktop\cordis.patch.yml` 末尾的 `insert` 块：根层 `tt-roleplay`（`@dsh-tt/roleplay`，`takeover:false`）+ `preset-roleplay`（内嵌 `tt-roleplay-agent`，`name: '@dsh-tt/roleplay/agent'`，`takeover:true`） |
| profile package.json | 315 字节，仅含 `dsh-context`/`dshmarket` 与 bundles；**未**包含本插件 |
| 编码 | 已逐字节验证 `cordis.patch.yml`、`plugin/package.json` 无 BOM |
| **本轮运行中的实例** | **仍是启动时（23:24）加载的旧 Host 与旧客户端 bundle**；改动要**完全退出并重开 DSH** 才生效 |
| 已修复的坑 | 上一轮 `plugin_manager set_plugin include:tt-roleplay enabled=false` 曾把 `- id: tt-roleplay; disabled: true` 写进 profile 补丁；本会话已删除该块并验证补丁 60 行 |
| 验证 profile | `desktop-verify` 已创建、验证并**删除**（junctions 用 `cmd /c rmdir` 先删，未跟随到 `X:\dsh-tt\plugin`） |

生效条件：Loader 图在启动时组合；`plugin/package.json` 的 `exports`/`dsh.client` 也只在条目启动或 Host 重启时重新读取。

---

## 3. 文件清单

| 路径 | 说明 |
|---|---|
| `DESIGN.md` | 设计文档 v1.0（§1–§21；§21 是本轮实现记录与勘误，D-017..D-021） |
| `plugin/package.json` | v0.2.0；`exports`：`.`（根）、`./agent`（Host 接管）、`./client`、`./locale/*`、`./icon`、`./package.json`；`dsh.client` = web/immediately |
| `plugin/index.js` | **根层入口**：只打印一行日志，不读资产、不碰 systemPrompt；保证客户端模块被发现 |
| `plugin/agent.js` | **Host 接管入口**：`inject=['systemPrompt']`；扫资产；`agent/inbox/inserted` 应用绑定；`agent/pre-step` 剥信封；完整段 = system + 深度 + 开场白 |
| `plugin/cordis.patch.yml` | 根层 `tt-roleplay` + preset `preset-roleplay`（子行 `@dsh-tt/roleplay/agent`） |
| `plugin/lib/library.js` | 资产扫描与类型识别 |
| `plugin/lib/png.js` | PNG `tEXt`/`iTXt` → 卡 JSON |
| `plugin/lib/card.js` | V2/V3 归一化 + 摘要 |
| `plugin/lib/lorebook.js` | 世界书激活；新增 `decorateEntry`（激活前求值 `@@if`，最终正文去指令）与 `isActive` |
| `plugin/lib/decorators.js` | **新增**：`@@if` / `@@activate` / `@@dont_activate`；平衡括号解析 + EJS 作用域求值 |
| `plugin/lib/macros.js` | ST 宏；新增 `charIfNotGroup` |
| `plugin/lib/ejs.js` | EJS 运行时：跨块、trim、转义、路径变量、lodash 子集、faker；scope 新增 `stat_data`/`v` getter |
| `plugin/lib/prompt.js` | ST 固定内置段 + `prompt_order` 用户段；`applyPresetOverrides`；跨块渲染；depth/injected 渲染 |
| `src/client.template.js` | 新面板：资产按需读取、世界书/预设查看、TH 宿主、输出 EJS、诊断 |
| `src/tavern/core.js` | **新增**：TH 纯状态/API 语义（Node 可 require 测试） |
| `src/tavern/shim.js` | **新增**：iframe 内 ST/TH 全局、toastr、`$`、`_`、弹窗桥、脚本执行 |
| `plugin/client.js` | 构建产物（约 200.7 KB：快照 0.9 + 核心 44.1 + shim 56.3 + 面板）；由 `tools/build-client.mjs` 生成，勿手改 |
| `tools/snapshot.mjs` | 资产 → `build/snapshot.json`（v3 元数据；含 `filePath`，不含正文） |
| `tools/build-client.mjs` | 注入快照、`src/tavern/core.js`、`src/tavern/shim.js` |
| `build/` | 生成物与验证日志（`.gitignore` 排除） |
| `tmp/` | 调研/测试脚手架（排除出版本库）：`check-ejs2.mjs`、`test-host.mjs`、`test-host2.mjs`、`test-core.cjs`、`verify-e2e.mjs`、`render-test.cjs`、`smoke.mjs`、`patch-v*.mjs`、`st-src/`、`mvu.js`、`th-dist.js` |
| `assets/`、`参考/` | 用户资产，`.gitignore` 排除 |

---

## 4. 已验证的 DSH 契约（含出处/实测）

### 4.1 事件与作用域

| 事实 | 出处/实测 |
|---|---|
| `agent/pre-step` 签名 `(payload, next)`；`payload={agent,messages,turn,step,signal,modelSelection}`；`next()` → `Promise<PreStepDecision>` | `dsh-agent/src/runtime-types.ts` 351；`dsh-agent-loop/src/agent.ts` 300–312；`dsh-agent/src/model-selection.ts` 158–171 |
| `PreStepDecision = {kind:'reject'} \| {kind:'enter', messages: UserMessage[], startsRequestSeries?}` | `dsh-agent/src/runtime-types.ts` 139–146 |
| `UserMessage` 只有 user 角色、`content` readonly、消息被冻结 | `dsh-llm/src/message.ts` 162–164、`freezeMessage` |
| 会话日志写的是 **`decision.messages`**（所以 pre-step 里替换 content 能让日志只留原文） | `dsh-agent-loop/src/agent.ts` 469–479 |
| `agent/inbox/inserted` 在收件箱插入时触发，payload `{agent,message}` | `runtime-types.ts` 318；实测 Host 在 `system-prompt` 组装前应用了绑定 |
| preset 子插件在 `createScope` + `mountPreset` 的独立 scope 中；`systemPrompt` 段/事件只属于该 preset 作用域 | `dsh-agent-preset-registry/src/index.ts` `activate()` |
| 插件访问 `ctx.systemPrompt` 必须 `inject=['systemPrompt']`，否则 `cannot get property "systemPrompt" without inject` | `dsh-persona/src/index.ts` 27；本机验证 profile 实测错误文本 |
| `ctx.systemPrompt.section({complete:true})` 可用；空文本会清空 system 节点 | `dsh-system-prompt/README.zh.md`；本机实测完整段 44,667/48,702 字 |

### 4.2 Remote 端点

| 端点 | 入参（`payload.args`） | 出参 | 出处 |
|---|---|---|---|
| `session/create` | `{ request: { workspaceId?, cwd?, sessionId?, agentPreset? } }` | `{sessionId, agentPreset?}` | 生成描述符；实测成功 |
| `session/prompt` | `{ request: { requestId, sessionId, mode:'queue'\|'steer', content[], clientTimeZone? } }` | `{accepted:true}` | 实测成功 |
| `session/events` | `{ request: { address:{kind:'session',sessionId}, throughSeq?, beforeSeq?, maxMessages?, turnWindow? } }` | `{cursor, records[], hasMore}` | 实测成功 |
| `session/rename` | `{ request: { sessionId, title } }` | `{title, seq}` | 代码沿用 |
| `session/modelCatalog` | `{ request: {} }` | `{groups[].models[]}` | 代码沿用 |
| `workspaceFiles.readBytes` | Client 调用 `(sessionId, path, {}, signal)`；返回 `WorkspaceFileBytes{data:Uint8Array,...}` | 二进制 | README + 实测（bundle 读取） |

- 浏览器 RPC 的 HTTP 形态：`POST /api/<namespace>/<method>`，body `{type:'client-request', rpcId, method, payload:{args:{request:...}}}`；响应 `{type:'server-response', rpcId, result:{ok,value|error}}`。
- 认证：`GET /?token=<启动令牌>` → 303 + 签名 cookie；后续请求带 cookie。

### 4.3 客户端模块

- 启动图 `globalThis["__DSH_BOOT__"].entries` 含 `{"id":"@dsh-tt/roleplay","url":"plugins/??@dsh-tt/roleplay/client.js&rev=…"}`（本机验证 profile 实测）。
- 用认证 cookie 取该 URL 返回 200，内容含 `TT_CORE` / `createTavernHost` / `dsh-tt:v3`。
- 只改 `package.json` 的 manifest 要条目重启/Host 重启；`/plugins` 组合脚本按文件 mtime/ctime/size 生成 rev。

---

## 5. 参考资产实测（本轮复核）

`参考/IMG_4552.PNG`（4.6 MB，`chara` tEXt）：

| 字段 | 值 |
|---|---|
| spec | `chara_card_v3` / 3.0 |
| name / creator | 春日狂想曲·统一版（玩家通道） / 时之写卡器 |
| description / first_mes | 20 / 33 字符 |
| character_book | 126 条、282,547 字符；91 条 constant |
| `[InitVar]` | 2 条 |
| `extensions.tavern_helper` | 1.99 MB；15 个脚本（启用 2：MVU 91 字符、热更加载器 24,565 字符） |
| `extensions.regex_scripts` | 14 条（markdownOnly 8 / promptOnly 6，placement [2]） |
| `@@` 装饰器 | **33 条**条目以 `@@if (function(){…})()` 开头（节庆/日期） |

`参考/梦鲸思客V5-1030-exp.json`：122 prompts、118 order、44 启用、8 marker；`main` prompt 88 字符且 **不在 prompt_order 里**。

**本轮世界书实测**：激活 **23/114** 条、**30,495 tokens**（预算 32,000）；`@@if` 为假的条目在激活阶段被剔除，最终 system **44,667** 字（空变量/默认日期），带 `牛头` 变量 + 开场白的实机会话为 **48,702** 字。

---

## 6. 本轮实现的运行时行为

| 行为 | 位置 | 状态 |
|---|---|---|
| 根层只注册客户端模块 | `plugin/index.js` | ✅ 验证 profile 实测 |
| Host 接管（preset agent scope） | `plugin/agent.js` | ✅ 启动日志 + 实机会话 |
| 绑定在 system 组装前应用 | `agent/inbox/inserted` | ✅ 实机会话 system 含 `牛头` 分支、Main Prompt、开场白 |
| 信封剥离 | `plugin/agent.js` `agent/pre-step` | ✅ 实机会话 user 正文 4 字 `测试正文`，无 `\0TT\0` |
| 固定 ST 内置段 + prompt_order | `plugin/lib/prompt.js` | ✅ Main Prompt/charDescription 已进入 system |
| 预设逐条启停 | `applyPresetOverrides` + 面板 | ✅ 本地测试 44,667→44,580（停 main） |
| 跨块 EJS | `plugin/lib/ejs.js`、`prompt.js` | ✅ leftover `<%` = 0，EJS error = 0 |
| `@@if` 装饰器 | `plugin/lib/decorators.js`、`lorebook.js` | ✅ 无装饰器残留；默认 system 44,667；1/1 时含“元日” |
| 资产按需读取 | 面板 + `workspaceFiles.readBytes` | ✅ 启动图 bundle 可取；面板代码就绪（未重启视觉验证） |
| 世界书查看 | 面板 `lore` tab | ✅ 代码就绪 |
| 预设 prompt 查看/启停 | 面板 `presets` tab | ✅ 代码就绪 |
| TH 宿主（iframe + core/shim） | `src/tavern/*`、面板 | ✅ 代码就绪；**真实浏览器内的 MVU 执行未验证** |
| 输出侧 EJS + 显示正则 | 面板 `renderFloors` | ✅ 代码就绪 |
| 深度注入 | `composeDepth` 追加 system 末尾 | ✅ 近似（D-020）；未逐消息插入 |
| TH `generate`/聊天编辑 | shim/core | ⛔ 明确边界（见 §8） |

---

## 7. 最近实测输出（可复现）

### 7.1 构建与语法

```powershell
node tools/snapshot.mjs
node tools/build-client.mjs
node --check plugin/client.js
node --check plugin/agent.js
node --check plugin/index.js
node --check plugin/lib/prompt.js
node --check plugin/lib/ejs.js
node --check plugin/lib/decorators.js
node --check src/client.template.js
node --check src/tavern/core.js
node --check src/tavern/shim.js
```

输出（2026-11-15 最后一次）：

```
snapshot: cards=1 presets=1 lorebooks=0 errors=0 | active=春日狂想曲-统一版-玩家通道-0 wi=23/114 sys=44667
client.js 已生成（200.7 KB：快照 0.9 KB、核心 44.1 KB、shim 56.3 KB）
```

### 7.2 本地测试

```powershell
node tmp/check-ejs2.mjs
node tmp/test-host.mjs
node tmp/test-host2.mjs
node tmp/test-core.cjs
node tmp/render-test.cjs
node tmp/smoke.mjs
```

关键输出：

```
errors: 0
leftover tags: 0
leftover decorators: 0
worldbook: 23/114 tokens: 30495
system chars: 44667
suspicious lines: 0

initial chars: 44667
after disable main: 44580 (changed: true)
after card switch: ... has 描述: true has greeting: true has 春日: false
after 牛头 vars: 48581 has 苦主: true
pre-step stripped: "只有正文"
pre-step id preserved: true
```

### 7.3 验证 profile（pscustom，已删除）

```powershell
# 克隆 desktop → desktop-verify（/XJ 跳 junction），再建 junction
robocopy C:\Users\Administrator\.dsh\profiles\desktop C:\Users\Administrator\.dsh\profiles\desktop-verify /E /XJ
New-Item -ItemType Junction -Path ...\desktop-verify\node_modules\@dsh-tt\roleplay -Target X:\dsh-tt\plugin
# 启动（随机端口；--no-open）
$env:ELECTRON_RUN_AS_NODE='1'
Start-Process "$env:DSH_NODE_EXECUTABLE" -ArgumentList ('"' + $env:DSH_INSTALL_DIR + '\lib\bin.js" --profile desktop-verify --port 0 --no-open') ...
```

启动日志（最终）：

```
[dsh-tt] 根层入口：客户端模块已注册，提示词接管由 preset 内的 @dsh-tt/roleplay/agent 负责。
[dsh-tt] 资产：1 张卡 / 1 个预设 / 0 本世界书
[dsh-tt] 角色「春日狂想曲·统一版（玩家通道）」预设「导入的预设」 · 世界书 23/114（30495 tokens） · system 44667 字 ...
[dsh-tt] 已挂载 agent/inbox/inserted（绑定切换）。
[dsh-tt] 已挂载 agent/pre-step（信封剥离）。
dsh web: http://127.0.0.1:<port>/?token=<token>
```

实机会话（`tmp/verify-e2e.mjs`，通过 HTTP RPC）：

```
session session-…
system chars 48702
system has 苦主 true has 开场白 true has MainPrompt true
system head "<推演与走动>…"          # 不再是 @@if 代码
user texts [ '4:"测试正文"', '743:"<system-reminder>…"' ]
envelope leaked false
```

> 这次会话的 `user/message` 4 字、`system` 48,702 字是最终证据：绑定在组装前生效、pre-step 剥离生效、`@@if` 不再泄漏。

---

## 8. 未完成与下一步（P0→P3）

| 优先级 | 项 | 落点/说明 |
|---|---|---|
| **P0** | **完全退出并重开 DSH 后，实机验证新面板与新 Host** | 运行中的实例仍是旧 bundle；重启后侧栏「角色扮演」→ 选卡 → 新建对话 → 发消息；看「扩展/设置」的 TH 日志 |
| **P0** | 若面板白屏：看 `window.__dshTT`（Boundary 捕获） | `src/client.template.js` 的 Boundary 会把错误写进该全局；也可看 DevTools Console |
| P1 | TH 在真实浏览器里跑 MVU | 面板「扩展」→ 打开脚本界面；看是否出现 MVU 面板/日志、`stat_data` 是否出现在「状态变量」；当前 `generate` 未接通，但默认「随AI输出」不需要 |
| P1 | 提示词作用域正则（`promptOnly`） | Host 的 `agent/pre-step` 对 assistant 历史应用 `placement=2` 的 promptOnly 规则；目前只接了显示侧 |
| P1 | 开场白选择器（alternate_greetings） | 面板 `startChat` 只用 first_mes/第一条 alternate；可加选择弹层，写入 `sessionMeta.greeting` |
| P2 | `@depth` 逐消息注入 | D-020 目前追加在 system 末尾；真正 ST 语义需要 Shadow Chat 或 Host 新 API |
| P2 | TH `generate`/`generateRaw` | Host 生成桥（Remote 或会话内调度）；当前明确 reject，不阻塞 MVU 默认路径 |
| P2 | TH create/delete/rotate 聊天消息 | 只改 iframe 镜像，下一页被父窗口覆盖；需要把 TH 镜像作为本地覆盖持久化，或走 Shadow Chat |
| P3 | 世界书递归/sticky/cooldown/inclusion group/`@@` 其余装饰器/outlet | `lorebook.js` 的注释列了未实现项；`@@if` 已做 |
| P3 | 采样参数 top_p/penalty、swipe/编辑/删除、群聊、分支 | §5/§14；DSH 仅 temperature/maxTokens/stop |
| P3 | TH 远程脚本缓存/授权、YAML 全局、完整前端渲染 | 与 Host 代理/资源路由、§14.8 相关；iframe 会自行 fetch loader 脚本 |

### 8.1 已知边界（事实）

- TH iframe 用 `sandbox="allow-scripts allow-same-origin allow-forms allow-modals"`：为了 `window.parent` 偏好存储与 TH 全局；风险与 JS-Slash-Runner 同级，面板有提示。
- `system` 段的深度注入是近似（D-020）；`agent/pre-step` 只能进入 user 角色消息。
- 参考卡的 `@@if` 表达式默认日期 7/26；变量 `牛头` 会让系统从 44,667 增到 48,702 字（更多条目/分支被激活），仍在 128k 上下文内。
- 本轮**没有**在真实浏览器里验证新面板与 TH 运行；只验证了 bundle 可取、代码语法、Node 逻辑与 Host 实机会话。**不要**把 Host 验证当成 UI 验证。

---

## 9. 常用操作

```powershell
# 构建
& "C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" X:\dsh-tt\tools\snapshot.mjs
& "...\node.exe" X:\dsh-tt\tools\build-client.mjs

# 语法
& "...\node.exe" --check X:\dsh-tt\plugin\client.js
& "...\node.exe" --check X:\dsh-tt\plugin\agent.js

# 测试
& "...\node.exe" X:\dsh-tt\tmp\check-ejs2.mjs
& "...\node.exe" X:\dsh-tt\tmp\test-host2.mjs
& "...\node.exe" X:\dsh-tt\tmp\test-core.cjs
& "...\node.exe" X:\dsh-tt\tmp\render-test.cjs

# git
& "C:\Users\Administrator\.dsh\bin\mingit\cmd\git.exe" -C X:\dsh-tt status
```

验证 profile 的清理（必须用 `cmd /c rmdir` 先删 junction，避免 `Remove-Item -Recurse` 跟随到 `X:\dsh-tt\plugin`）：

```powershell
cmd /c rmdir "C:\Users\Administrator\.dsh\profiles\desktop-verify\node_modules\@dsh-tt\roleplay"
Remove-Item "C:\Users\Administrator\.dsh\profiles\desktop-verify" -Recurse -Force
```

---

## 10. 用户已确认的约束（事实）

1. 架构：C′（会话作聊天载体）+ b2（ST API 仿真层）。
2. 两套扩展（JS-Slash-Runner、ST-Prompt-Template）作为**内置扩展、默认启用**。
3. 资产与聊天记录：聊天内容只存在于会话，插件不备份；会话标题统一 `RP · ` 前缀。
4. 面板形态：macOS 取向；左侧局列表、窄顶栏、右侧大面积聊天区。
5. 破限/深度注入按 ST 语义（`prompt_order` + `marker` + `injection_position/depth/role`）；D-020 是当前近似。
6. 附件与语音：不做。
7. 测试策略：除必要外不测试；不设 token 上限。
8. 用户明确要求：不要玩开发套件/DevTools，优先继续代码工作。

---

## 11. 注意事项

1. **必须先重启**：当前进程里是旧 Host/旧客户端；不要用当前面板的行为判断新代码。
2. 不要再次对 `include:tt-roleplay` 调 `plugin_manager set_plugin enabled=false`：它会向 profile 补丁写入 `disabled: true`，重启后侧栏会消失（本轮已修复一次）。
3. profile 补丁必须保留两条 insert；preset 子行必须是 `@dsh-tt/roleplay/agent`。
4. `plugin/client.js` 是生成物；改动要落在 `src/client.template.js` / `src/tavern/*` 后重新 build。
5. `build/`、`tmp/`、`参考/`、`assets/` 均不进版本库；`build/snapshot.json` 只在本机。
6. TH 宿主与卡内脚本同源（`allow-same-origin`），只跑信任的卡；不要在该 iframe 里加载来源不明的远程脚本。
7. 如果某次启动日志出现 `cannot get property "systemPrompt" without inject`，说明 `agent.js` 的 `inject` 被改掉或 preset 子行指回了根入口。
8. 如果 system 段出现 `@@if` 或 JS 片段，检查 `plugin/lib/decorators.js` 是否被 `lorebook.js` 的 `decorateEntry` 与 `prompt.js` 的 `joinDecorated` 使用。

---

## 12. Git 状态

- 本轮提交：
  - **`f8ff70f`** — `feat: 打通 Host 接管 + TH 宿主 + 资产面板（v0.2）`（18 files，+6732/−1355）
  - **`95960ed`** — `fix: 面板仅向角色扮演会话发送；默认不自动选普通会话；新局先取资产作用域`
  - `dc60a93` — HANDOFF 记录
- 改动：`plugin/{index.js,agent.js,package.json,cordis.patch.yml,docs/DETAIL.md}`、`plugin/lib/{ejs,prompt,macros,lorebook,decorators}.js`、`src/client.template.js`、`src/tavern/{core,shim}.js`、`tools/{snapshot,build-client}.mjs`、`DESIGN.md`、`HANDOFF.md`。
- `plugin/client.js` 是生成物，已随提交更新（约 200.7 KB）；若要排除它，需同时改 `.gitignore` 与安装说明，并确保首次安装前先 build。
- 仍未验证的接口形状：`session/list` 的 `value` 精确形状（代码兼容 `sessions`/`rows`/`items`/数组）、`session/selectModel` 的入参（代码尝试 `{sessionId, provider, model}` 与 `{sessionId, selection}`）。
- 面板发送门禁：只有 `sessionMeta` 存在或标题以 `RP · ` 开头的局才允许发送；普通 DSH 会话在面板里只读，避免信封泄漏到非 preset 会话。

