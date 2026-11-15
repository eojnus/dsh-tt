# 交接文档（HANDOFF）

> 本文件只记录事实与可验证状态，不包含主观评价或建议。
> 生成时间：2026-11-15（会话 30）。仓库：`C:\coding\dsh-tt`，分支 `main`。
> 设计文档是唯一事实来源（`DESIGN.md`，当前 v1.1，§22 是会话 30 的实现记录）。

---

## 1. 环境事实

| 项 | 值 |
|---|---|
| 工作目录 / 仓库 | `C:\coding\dsh-tt`（旧的 `X:\dsh-tt` 已不存在） |
| DSH 安装包版本 | `@deepseek-ai/dsh` 0.2.2-rc.3（Electron 单文件安装，源码在 `app.asar` 内） |
| DSH 安装根（asar 内） | `C:\Users\Administrator\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai\` |
| DSH 可执行 | `C:\Users\Administrator\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe`（`ELECTRON_RUN_AS_NODE=1` 时可当 node 用） |
| CLI 入口 | `…\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js` |
| Desktop profile | `C:\Users\Administrator\.dsh\profiles\desktop` |
| 当前 Web GUI | `http://127.0.0.1:60566`（端口每次启动变化） |
| Node（可用） | `C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`（v24.21.0） |
| Python（可用） | `C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe` |
| git（可用） | `C:\Program Files\Git\cmd\git.exe`；仓库身份 `dsh-tt <dsh-tt@local>` |
| npm / npx | 不存在于 PATH |
| 读 ASAR 工具 | `tmp/asar.mjs`（`info`/`list`/`read`/`grep`，会话内自建） |
| 端到端验证 | `tools/verify-e2e.mjs`（见 §7.3） |
| GitHub 远程 | `https://github.com/eojnus/dsh-tt`（public；`参考/`、`assets/*`、`tmp/`、`build/` 未上传） |

---

## 2. 安装状态（需要重启才生效）

| 项 | 状态 |
|---|---|
| profile 目录联接 | `profiles\desktop\node_modules\@dsh-tt\roleplay` → `C:\coding\dsh-tt\plugin`（junction） |
| profile 补丁层 | `profiles\desktop\cordis.patch.yml` 共 59 行；末尾是 `tools/install.mjs` 管理的块：根层 `tt-roleplay`（`takeover:false`）+ `preset-roleplay`（内嵌 `tt-roleplay-agent` → `@dsh-tt/roleplay/agent`，`takeover:true`） |
| profile 安装标记 | `profiles\desktop\.dsh-tt-install.json`（卸载时确认归属） |
| profile package.json | 211 字节，只有 `dsh-context`/`dshmarket` 与 bundles；**不含**本插件 |
| **运行中的实例** | **仍是启动时加载的旧 Host 与旧客户端 bundle**；改动要**完全退出并重开 DSH** 才生效 |
| 本次验证实例 | 克隆 `desktop` → `desktop-verify` 跑 `dsh web --port 7788`，验证完已删除（先 `cmd /c rmdir` 掉 junction） |
| 回滚 | `build/profile-backup/<时间戳>/`（含 `cordis.patch.yml`、`package.json`、`MANIFEST.json`）或 `node tools/install.mjs uninstall` |

生效条件：Loader 图在启动时组合；`plugin/package.json` 的 `exports`/`dsh.client` 也只在条目启动或 Host 重启时重新读取。

**不要再对 `include:tt-roleplay` 调 `plugin_manager set_plugin enabled=false`**：它会往 profile 补丁写 `disabled: true`，重启后侧栏入口消失。

---

## 3. 文件清单

| 路径 | 说明 |
|---|---|
| `DESIGN.md` | 设计文档 v1.1（§1–§22；§22 是会话 30 的实现记录，D-022..D-025） |
| `HANDOFF.md` | 本文件 |
| `package.json` | 仓库根脚本：`build` / `test` / `check` / `install:profile` / `verify:e2e` |
| `plugin/package.json` | v0.2.0；`exports`：`.`、`./agent`、`./client`、`./locale/*`、`./icon`、`./package.json`；`dsh.client` = web/immediately |
| `plugin/index.js` | **根层入口**：只打印一行日志，不读资产、不碰 systemPrompt |
| `plugin/agent.js` | **Host 接管入口**：`inject=['systemPrompt']`；按 agent 注册提示词段；`inbox/inserted` 应用绑定 + 推进世界书回合；`pre-step` 剥信封 + 用户输入正则 |
| `plugin/cordis.patch.yml` | 插件自带的补丁（作为 bundle 安装时用）；**不含**硬编码资产路径 |
| `plugin/lib/library.js` | 资产扫描与类型识别（`参考/`、`assets/`，可加 `assetDirs`） |
| `plugin/lib/png.js` | PNG `tEXt`/`iTXt` → 卡 JSON |
| `plugin/lib/card.js` | V2/V3 归一化 + 摘要 |
| `plugin/lib/lorebook.js` | 世界书激活：constant/关键词/次级逻辑/概率/预算/8 位置/递归/sticky/cooldown/delay/delayUntilRecursion/inclusion group/outlet/`@@` 前置判定 |
| `plugin/lib/decorators.js` | `@@if` / `@@activate` / `@@dont_activate`（平衡括号 + EJS 作用域求值） |
| `plugin/lib/macros.js` | ST 宏；`charIfNotGroup` |
| `plugin/lib/ejs.js` | EJS 运行时：跨块、trim（官方语义）、转义、路径变量、lodash 子集、faker；`stat_data`/`v` getter |
| `plugin/lib/prompt.js` | ST 固定内置段 + `prompt_order` 用户段；`applyPresetOverrides`；深度/绝对注入分桶 |
| `plugin/lib/regex.js` | **新增**：ST regex_scripts 解析、placement 作用域过滤、世界书(5)/用户输入(1) 应用 |
| `plugin/lib/pipeline.js` | **新增**：同构提示词管线（不碰 Node API）。Host 的 `agent.js`、`tools/snapshot.mjs`、`tools/check.mjs` 与面板预览共用这一份 |
| `plugin/client.js` | 构建产物（311.8 KB）；由 `tools/build-client.mjs` 生成，**勿手改** |
| `src/client.template.js` | 面板模板：三区布局、开场白选择器、世界书/预设/预览/正则/扩展/设置、TH 宿主、自检 |
| `src/tavern/core.js` | TH 纯状态/API 语义（Node 可跑，`tests/tavern-core.test.mjs` 18 个用例） |
| `src/tavern/shim.js` | iframe 内 ST/TH 全局、toastr、`$`、`_`、弹窗桥、脚本执行、资源加载失败捕获 |
| `tools/snapshot.mjs` | 资产 → `build/snapshot.json`（v3 元数据；含 `filePath`，不含正文；报告 effectiveLength） |
| `tools/build-client.mjs` | 注入快照 + `src/tavern/*` + 同构管线 → `plugin/client.js` |
| `tools/bundle-lib.mjs` | 8 个 lib 模块 → 同构脚本（`TT_LIB`），供面板预览 |
| `tools/check.mjs` | 管线自检：资产清单、世界书激活/分桶/递归、system/完整段字数、残留检查 |
| `tools/install.mjs` | profile 安装器：备份 + junction + 补丁块 + 安装标记 + 安全卸载 |
| `tools/verify-e2e.mjs` | 对运行中的 `dsh web` 发信封，断言 system 由插件组装、用户日志只剩正文 |
| `tools/inspect-cards.mjs` | 卡体检：逐卡报告世界书/脚本/正则/InitVar 与管线数字 |
| `tools/inspect-th-scripts.mjs` | 卡内启用脚本用到哪些 TH/ST API，与 shim 对照 |
| `tools/inspect-remote.mjs` | 拉取远程 MVU bundle，静态核对其 API 面与依赖 |
| `tests/` | 126 个用例 + 合成夹具（`characters/`、`presets/`、`lorebooks/`）；`node tests/run.mjs` |
| `build/` | 生成物、验证日志、profile 备份（`.gitignore` 排除） |
| `tmp/` | 调研脚手架：`asar.mjs`、`positions.mjs`、`diff-normalize.mjs`、`bucket-diff.mjs`、`ab-trim.mjs` 等（排除出版本库） |
| `参考/` | 用户资产（3 张 PNG 卡 + 1 个预设；`.gitignore` 排除） |

---

## 4. 已验证的 DSH 契约（含出处/实测）

### 4.1 事件与作用域

| 事实 | 出处/实测 |
|---|---|
| `agent/pre-step` 签名 `(payload, next)`；`payload={agent,messages,turn,step,signal,modelSelection}`；`next()` → `Promise<PreStepDecision>` | `dsh-agent/src/runtime-types.ts` 351；`dsh-agent-loop/src/agent.ts` 300–312 |
| **组装顺序：先 assemble，再发 pre-step**（绑定必须在 `inbox/inserted` 生效） | `dsh-agent-loop/src/agent.ts` 300（assemble）与 303（emit pre-step） |
| `PreStepDecision = {kind:'reject'} \| {kind:'enter', messages: UserMessage[], startsRequestSeries?}`；`messages` 全是 **user 角色** | `runtime-types.ts` 139–146 |
| **`agent/request` 不能改消息**（官方注释：this waterfall cannot mutate messages） | `runtime-types.ts` ~361 |
| `agent/created({agent, source, signal})`；`Agent.ctx` 注册只对该 agent 生效并随释放撤销 | `runtime-types.ts` 291；`dsh-agent/README.zh.md` 74 |
| 同一 preset 的插件树由所有 agent **共享**（`mountPreset` 一棵树） | `dsh-agent-preset-registry/src/mount.ts` |
| 提示词段可注册在 `agent.ctx`；`text` 可为 `(AssembleContext)=>string` | `dsh-system-prompt/src/index.ts`（`section()` + `PromptSection.text`） |
| `systemPrompt` 需 `inject=['systemPrompt']`；`agent.ctx.systemPrompt.section()` 可用（实机生效） | 本机验证 profile 实测 |
| 会话日志写的是 **`decision.messages`**（pre-step 替换 content 能让日志只留原文） | `dsh-agent-loop/src/agent.ts` 469–479 |
| `agent/disposed({agent})` 存在（可用作清理钩子） | `runtime-types.ts` 300 |

### 4.2 Remote 端点

| 端点 | 入参（`payload.args`） | 出参 | 出处 |
|---|---|---|---|
| `session/create` | `{ request: { workspaceId?, cwd?, sessionId?, agentPreset? } }` | `{sessionId, agentPreset?}` | 实测成功 |
| `session/prompt` | `{ request: { requestId, sessionId, mode:'queue'\|'steer', content[], clientTimeZone? } }` | `{accepted:true}` | 实测成功 |
| `session/events` | `{ request: { address:{kind:'session',sessionId}, throughSeq?, beforeSeq?, maxMessages?, turnWindow? } }` | `{cursor, records[], hasMore}` | 实测成功 |
| `session/rename` | `{ request: { sessionId, title } }` | `{title, seq}` | 代码沿用 |
| `session/fork` | 存在（`@Remote('fork')`） | — | `dsh-api-session-controller/src/index.ts` 448 |
| `session/cancel` / `session/updateQueue` | 存在 | — | 同上 519 / 509 |
| `session/selectModel` / `session/modelCatalog` | 存在 | — | 同上 316 / 343 |
| `workspaceFiles.readBytes` | Client 调用 `(sessionId, path, {}, signal)` | `WorkspaceFileBytes{data:Uint8Array}` | README + 实测 |

- 浏览器 RPC 的 HTTP 形态：`POST /api/<namespace>/<method>`，body `{type:'client-request', rpcId, method:'<namespace>/<method>', payload:{args:{request:…}}}`；响应 `{type:'server-response', rpcId, result:{ok,value|error}}`。
- **`method` 必须是 `namespace/method` 全名**（只写 `create` 会报 `method "create" does not match endpoint "session/create"`）。
- 认证：`GET /?token=<启动令牌>` → 303 + 签名 cookie；后续请求带 cookie。
- 没有「重新生成 / 重试」端点；`session/fork` 是唯一的"分支"能力。

### 4.3 客户端模块

- 启动图 `globalThis["__DSH_BOOT__"].entries` 含 `{"id":"@dsh-tt/roleplay","url":"plugins/??@dsh-tt/roleplay/client.js&rev=…"}`。
- 只改 `package.json` 的 manifest 要条目重启/Host 重启；`/plugins` 组合脚本按文件 mtime/ctime/size 生成 rev。

---

## 5. 参考资产实测（会话 30）

`参考/` 现有 4 个文件：`IMG_4552.PNG`（4.6 MB）、`1.5.png`（10.2 MB）、`688e…png`（2.8 MB）、`梦鲸思客V5-1030-exp.json`（1.5 MB）。

| 卡 | 内嵌条目 | 首条开场白 | 备选开场白 |
|---|---|---|---|
| `春日狂想曲·统一版（玩家通道）` | 126 | 33 字符 | 3 |
| `天极1.5` | 203 | 未统计 | 2 |
| `天元录` | 161 | 未统计 | 0 |

**春日狂想曲 + 梦鲸预设（本轮实测）**：

| 项 | 值 |
|---|---|
| 世界书激活 | **23/114**，30,495 tokens（预算 32,000），递归 1 轮，按来源 `{constant:23}` |
| 分桶 | before 22 / after 0 / depth 1（`d0/user`，1,299 字）/ outlet 0 |
| 跳过原因 | `decorator 32`、`no-keys 1`、`budget 54` |
| system 段 | 43,366 字；含深度注入 **44,667 字**（= 文档旧基线，逐字一致） |
| 残留 | EJS 标签 0、EJS 错误 0、`@@` 装饰器 0、`{{//}}` 0 |
| 正则脚本 | 预设 28 条（`[1] promptOnly`×1、`[1] markdownOnly`×1，其余 `[2]`）；卡 14 条全 `[2]`；**无 `[5]`** |

`天极1.5`：33/201、20,256 tokens、system 40,393 字（有效 40,665）。

---

## 6. 本轮实现的运行时行为

| 行为 | 位置 | 状态 |
|---|---|---|
| 每会话独立的提示词段 | `plugin/agent.js`（`agent/created` + `agent.ctx`） | ✅ 单测 + 实机 |
| 绑定在 assemble 之前生效 | `agent/inbox/inserted` | ✅ 实机（system 44,705 = 本地引擎输出） |
| 信封剥离 + 日志只留原文 | `agent/pre-step` | ✅ 实机（`user/message` 正文 `测试正文`） |
| 世界书递归/计时/分组/outlet | `plugin/lib/lorebook.js` | ✅ 单测（13 个用例） |
| prompt 侧正则 placement 1/5 | `plugin/lib/regex.js` + agent | ✅ 单测；参考资产里没有 5 类规则 |
| 开场白选择器 | `src/client.template.js` | ✅ 构建通过；**未实机点击**（需重启后看） |
| 资产按需读取 | 面板 + `workspaceFiles.readBytes` | ✅ 代码就绪（会话 28 验证过 bundle 可取） |
| TH 宿主（iframe + core/shim） | `src/tavern/*`、面板 | ✅ 代码就绪；**真实浏览器内 MVU 仍未验证** |
| 输出侧 EJS + 显示正则 | 面板 `renderFloors` | ✅ 代码就绪 |
| 深度注入 | `composeDepth` 追加 system 末尾 | ✅ 近似（D-020/D-024） |
| TH `generate`/聊天编辑 | shim/core | ⛔ 明确边界 |

---

## 7. 常用命令（可复现）

### 7.1 构建与测试

```powershell
$node = 'C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
& $node tools/snapshot.mjs
& $node tools/build-client.mjs
& $node tests/run.mjs           # 126 个用例
& $node tools/check.mjs         # 管线自检（默认第一张卡）
& $node tools/inspect-cards.mjs # 三张卡的体检报告
```

> `node --test tests/` 在本机会 `spawn EPERM`（沙箱禁止子进程管道），必须用 `tests/run.mjs`。

输出（2026-11-15 最后一次，`DSH_TT_ACTIVE=春日狂想曲·统一版（玩家通道）`）：

```
snapshot: cards=3 presets=1 lorebooks=0 errors=0 | active=天极1-5-0 wi=33/201 sys=40393 effective=40665
client.js 已生成（311.8 KB：快照 1.9 KB、核心 45.3 KB、shim 57.9 KB、管线 78.6 KB）
tests 126 / pass 126 / fail 0
```

### 7.2 安装 / 卸载

```powershell
& $node tools/install.mjs status
& $node tools/install.mjs install      # 需要写 profile 目录（工作区外）
& $node tools/install.mjs uninstall
```

### 7.3 实机端到端验证（会动 profile，需要授权）

```powershell
# 1) 克隆 profile（/XJ 跳过 junction）并装插件
robocopy "$env:USERPROFILE\.dsh\profiles\desktop" "$env:USERPROFILE\.dsh\profiles\desktop-verify" /E /XJ
& $node tools/install.mjs install --profile-dir "$env:USERPROFILE\.dsh\profiles\desktop-verify"

# 2) 起一个独立实例（ELECTRON_RUN_AS_NODE + asar 内的 bin.js）
$env:ELECTRON_RUN_AS_NODE='1'
Start-Process "…\DeepSeek Harness.exe" -ArgumentList @("`"…\app.asar\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js`"", '--profile','desktop-verify','--port','7788','--no-open') -RedirectStandardOutput build\verify-web.out.log -RedirectStandardError build\verify-web.err.log

# 3) 验证（从日志里取 URL 与 token）
& $node tools/verify-e2e.mjs "http://127.0.0.1:7788/?token=…"

# 4) 清理：先 rmdir 掉 junction 再删克隆，避免跟随联接删到 plugin/
cmd /c rmdir "$env:USERPROFILE\.dsh\profiles\desktop-verify\node_modules\@dsh-tt\roleplay"
Remove-Item "$env:USERPROFILE\.dsh\profiles\desktop-verify" -Recurse -Force
```

最后一次结果：`system 44,705 字`、`user/message` 正文 `测试正文`、全库无信封、无 EJS/装饰器残留，**全部通过**。

---

## 8. 未完成与下一步（P0→P3）

| 优先级 | 项 | 落点/说明 |
|---|---|---|
| **P0** | **完全退出并重开 DSH 后按下面的清单验一遍** | 侧栏「角色扮演」→ 选卡（弹开场白选择）→ 新建对话 → 发一条消息；然后逐页看：角色 / 世界书 / 预设 / 预览 / 正则 / 扩展 / 设置 |
| **P0** | 设置页「运行自检」 | 一次点完能看到通道、资产、管线、TH 宿主四类结果；任何 ❌ 直接把那一行发我 |
| **P0** | 若面板白屏：看 `window.__dshTT`（Boundary 捕获） | `src/client.template.js` 的 Boundary 会把错误写进该全局 |
| P1 | TH 在真实浏览器里跑 MVU | 进局后看诊断里是否有「执行脚本「…MVU…」（module）」、有没有「资源加载失败：<url>」；再看「扩展」→ 状态变量里是否出现 `stat_data` |
| P2 | **Shadow Chat**（真正改写历史） | 解锁 `placement=2` 的 prompt 侧正则、@depth 逐消息插入、swipe/编辑/删除。前置：Host 侧生成通道（`ctx.llm.stream` + 客户端流式）或 DSH 新 API |
| P2 | TH `generate`/`generateRaw` | 设计草案见 DESIGN §22.8：辅助会话 + 信封 + `session/events` 回填 |
| P2 | 重新生成 / 分支 | 可用 `session/fork` 起步，但语义与 ST 的 swipe 不同 |
| P3 | 采样参数透传、群聊、TH 远程脚本缓存（离线可复现）、完整前端渲染 | §7 M4/M5、§14.8 |

---

## 9. 用户已确认的约束（事实）

1. 架构：C′（会话作聊天载体）+ b2（ST API 仿真层）。
2. 两套扩展（JS-Slash-Runner、ST-Prompt-Template）作为**内置扩展、默认启用**。
3. 资产与聊天记录：聊天内容只存在于会话，插件不备份；会话标题统一 `RP · ` 前缀。
4. 面板形态：macOS 取向；左侧局列表、窄顶栏、右侧大面积聊天区。
5. 破限/深度注入按 ST 语义（`prompt_order` + `marker` + `injection_position/depth/role`）；D-020/D-024 是当前近似。
6. 附件与语音：不做。
7. 测试策略：除必要外不测试；不设 token 上限。
8. 用户明确要求：不要玩开发套件/DevTools，优先继续代码工作。
9. 用户要求：把插件**直接装进 desktop profile**（已装，待重启）。

---

## 10. 注意事项（踩过的坑）

1. **必须先重启**：当前进程里是旧 Host/旧客户端；不要用当前面板的行为判断新代码。
2. **不要用 PowerShell 的 `Get-Content`/`Set-Content` 改含中文的文件**：本机 PS 5.1 默认按 ANSI 读写，会把 UTF-8 中文变成乱码甚至吃掉引号（本轮踩过 `.gitignore` 与一个测试文件）。改文本一律用编辑工具或 Node 的 `fs.writeFileSync(..., 'utf8')`。
3. **不要用 `plugin_manager set_plugin include:tt-roleplay enabled=false`**（见 §2）。
4. **本机 Node 识别不出目录联接**：`lstat().isSymbolicLink()` 为 false、`readlinkSync` 抛 `EINVAL`。判定装没装要读 `package.json` 的 `name` 或直接 `require.resolve`；删联接用 `fs.rmdirSync`/`cmd /c rmdir`（**不要** `Remove-Item -Recurse`，会跟随联接）。
5. `plugin/client.js` 是生成物；改动落在 `src/client.template.js` / `src/tavern/*` 后重新 build。
6. profile 补丁块由 `tools/install.mjs` 管理（有 `# --- dsh-tt roleplay ---` 标记），手改会被下次安装覆盖。
7. TH 宿主与卡内脚本同源（`allow-same-origin`），只跑信任的卡。
8. 如果启动日志出现 `cannot get property "systemPrompt" without inject`，说明 `agent.js` 的 `inject` 被改掉或 preset 子行指回了根入口。
9. 如果某局换卡后提示词没变，先看诊断里是不是没有带信封的消息（`worldInfo.turn` 不推进就不会重算）。

---

## 11. Git 状态

- 本轮提交：
  - **`9ac47ed`** — `feat(v0.3): 会话隔离的提示词段 + 路径解耦 + 测试/安装/验证脚手架`
  - **`55c246a`** — `feat(lorebook+regex): 世界书递归/计时/分组/outlet，prompt 作用域正则接入`
  - **`5383555`** — `docs: 会话 30 记录（DESIGN §22 + D-022..D-025，HANDOFF 全面更新）`
  - **`91dec40`** — `feat(preview): 面板「预览」页 —— 与 Host 同源的提示词管线同构包`
  - **`c08f934`** — `feat(panel): 正则页 + 设置页自检；测试真正渲染每个页签`
  - **`34d7696`** — `feat(inspect): 卡体检/TH 脚本盘点/远程依赖核对 + 资源加载失败诊断`
- 仓库已配置本地身份 `dsh-tt <dsh-tt@local>`（本机没有全局 git 配置）。
- 最后一次实机 e2e（`desktop-verify` + `dsh web --port 7788`，最新代码）：`system 44,705 字`、
  `user/message` 正文 `测试正文`、无信封、无 EJS/装饰器残留，**全部通过**；验证后 profile 已删除。
- 仍未验证的接口形状：`session/list` 的 `value` 精确形状（代码兼容 `sessions`/`rows`/`items`/数组）、`session/selectModel` 的入参（代码尝试 `{sessionId, provider, model}` 与 `{sessionId, selection}`）。
