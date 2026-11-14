# DSH × SillyTavern 角色扮演插件 · 设计文档

> **状态**：v0.9 草案（已定 11 项决策；v1 已构建，见 §15）
> **维护方式**：本文件是唯一事实来源。每轮讨论后追加「决策记录」与「变更日志」，不推翻历史结论，只做带编号的修订。
> **基线环境**：DeepSeek Harness Desktop，profile = `desktop`，构建日期 2026-11-14（DSH 事实以该安装为准，路径见附录 A）。
> **已定决策**：D-001（被 D-006 取代）· D-002 Shadow Chat · D-003 首批范围 · D-004 不做 ST 扩展 JS 生态 · D-005 术语 · D-006 全局面板 + 侧栏入口 · D-007 聊天面与会话绑定 · D-008 UI 设计先加载技能 · D-009 必须兼容酒馆助手（TavernHelper）运行时 · D-010 里程碑重排 · **D-011 独立 RP 模式（agent preset：零工具、插件接管系统提示词）**。

---

## 0. 文档约定

| 标记 | 含义 |
|---|---|
| ✅ 已核实 | 已在当前安装 / 参考资产 / 上游仓库中确认，附出处 |
| ⚠️ 待验证 | 依赖的 API 尚未确认，需 Inspect、读源码或 spike |
| ❌ 硬约束 | 当前架构下不可行或代价极高，只能替代实现 |
| 🧭 建议 | 我的方案倾向，等你确认后转为决策记录 |

- **决策记录** `D-xxx`：确认后不改写，只能被新决策取代。
- **待决问题** `Q-xxx`：等你回答；回答后转成决策记录。
- **变更日志**：文末表格，每轮一行。

---

## 1. 目标与非目标

### 1.1 目标

在 DSH 内部打造**角色扮演插件**，用 ST 的资产（角色卡 / 世界书 / 预设 / 聊天记录 / **酒馆助手脚本**）在 DSH 里获得等价的 RP 体验。

兼容等级（每级都要过验收）：

| 等级 | 名称 | 含义 |
|---|---|---|
| **L1** | 数据兼容 | Character Card V2/V3（PNG `chara`/`ccv3`、JSON）、World Info/Lorebook、Chat JSONL、Preset JSON 的导入导出 |
| **L2** | 语义兼容 | 卡字段、世界书触发、预设 prompt 顺序与注入深度、正则、宏，在**实际请求**中按 ST 语义生效 |
| **L3** | 交互兼容 | swipe / 重新生成 / 编辑 / 删除 / 复制、备选问候、Author's Note、群聊、分支 |
| **L4** | 运行时兼容 | **酒馆助手（JS-Slash-Runner / TavernHelper）脚本可运行**：变量、消息、事件、生成、世界书读写、MVU 变量框架、前端渲染 |
| **L5** | 生态兼容 | ST 第三方扩展、任意 JS slash 脚本、Web 后端插件（不做，见 D-004） |

承诺 L1–L4。L5 只提供受限替代。

> **D-004 与 L4 不矛盾**：我们不"运行 ST 扩展"，而是**复刻 TavernHelper 这套受控 API**，让用户脚本在独立沙箱里、只能通过白名单接口访问插件状态（D-009）。ST 原生扩展（jQuery DOM 注入那一类）仍然不支持。

已定形态（D-006/D-007）：左侧「插件栏」`sidebar.panellist` 增加**角色扮演**入口 → 切换 `main[key=roleplay]` **全局面板**（与「插件管理」页同级）；会话内聊天面由 `conversation.view` 的 `roleplay` 视图承担。

### 1.2 非目标

- 不复刻 ST 像素级外观（必须用 DSH 主题令牌与宿主交互惯例）。
- 不做多用户/联网大厅。
- 不运行 ST 原生扩展（T5 生态），也不支持无沙箱执行任意 JS。
- 不重写 DSH 会话日志格式。

---

## 2. ST 能力全景（映射对象）

1. **角色**：卡 V2/V3 全字段、头像、角色库、用户人设（Persona）。
2. **提示词**：Prompt Manager、预设保存/切换、System Prompt、Author's Note、宏、token 预算与历史裁剪。
3. **世界书**：主/次关键词、AND/OR/NOT、大小写、概率、inclusion group、sticky/cooldown/delay、触发位置、递归、扫描深度与预算、来源（chat/char/persona）。
4. **正则**：prompt 与 display 两套作用域（`markdownOnly` / `promptOnly` / `placement`）。
5. **聊天**：swipe、重新生成、编辑、删除、复制、分支（checkpoint）、导入导出、群聊、自动模式。
6. **输入与命令**：斜杠命令、Quick Replies、自动补全、token 计数。
7. **模型后端**：Chat/Text Completion、多连接、采样参数预设。
8. **周边**：TTS、语音输入、图片生成、Data Bank、翻译扩展。
9. **酒馆助手生态（L4 的核心）**：
   - **TavernHelper API**：约 100 个函数，24 个域（audio / builtin / character / chat_message / displayed_message / extension / file / generate / global / import_raw / inject / lorebook / lorebook_entry / macro_like / persona / preset / raw_character / script / slash / tavern_regex / util / variables / version / worldbook）✅（`JS-Slash-Runner/@types/function/index.d.ts`）
   - **脚本模型**：脚本挂在角色卡 / 预设 / 全局，带 `id` `name` `enabled` `type` `content`，在 iframe 里执行。
   - **MVU（MagVarUpdate）**：以 `[InitVar]` 世界书条目初始化 `stat_data`，模型按 JSON Patch 更新变量，前端渲染状态栏。参考卡直接依赖它 ✅
   - **热更**：脚本从 jsDelivr/CDN 拉取版本清单与业务脚本并执行 ✅（参考卡的 loader 就是这么写的）
   - **前端渲染**：`formatAsDisplayedMessage` / `retrieveDisplayedMessage` / `refreshOneMessage` + iframe 楼层渲染（状态栏、立绘、Galgame 界面）。

---

## 3. DSH 机制基线（已核实）

### 3.1 插件形态 ✅

Host 插件 = npm 包 + `cordis.patch.yml`；`apply(ctx)` 导出。Client 插件在 `package.json` 的 `dsh.client` 声明，浏览器侧注册 lazy factory，通过 **Slot** 注入 UI。安装用 **Plugins → 添加插件**（或 `plugin_manager`）。
出处：`dsh-agent-preset/skills/dsh-doc/references/{plugin-development,ui-plugin,host-plugin}.md`。

### 3.2 请求管线 ✅

```
system-prompt/assemble   ← waterfall，可整体替换 system 段
agent/pre-step           ← waterfall，可 reject 或 enter(messages)   ← messages 级改写点
step/start
agent/request            ← waterfall（不能改 request messages）
LLM → assistant/message → tools
```

- `agent/pre-step` 是 messages 级权威改写点；`system-prompt/assemble` 管 system 段；`ctx.systemPrompt.section()` 与 `dsh-persona` 是较弱入口。

### 3.3 会话日志 ✅ / ❌

- 仅追加、是唯一真相来源；`fork()` 可复制前缀；压缩只隐藏不删除。
- ❌ 不能新增自定义事件类型（`appendPluginRecord` 属实验接口）。
- ⇒ 不能改写历史消息，不能"删除"agent 楼层（→ D-002）。

### 3.4 Web UI：插槽与全局面板 ✅

- `main` 是 root 作用域 **keyed** slot；`conversation` 为会话保留 key，其他 key = 全局面板。
- 入口 = `sidebar.panellist`（root list，注册 `id`/`order`/`label`/图标），**同 id 寻址 `main`** 的面板组件；点击 = `ctx.layout.selectPanel(id)`，`null` 回会话界面。
- 「插件管理」页就是这样一个全局面板。
- 视图页签 `conversation.view`（keyed）用于会话内聊天面；可用 View ≥ 2 时显示标签栏，默认回退 `chat`。

| 插槽 | 基数 | 用途 |
|---|---|---|
| `sidebar.panellist` | list（root） | 插件栏入口 `id=roleplay` |
| `main` | keyed（root） | 角色扮演全局面板 `key=roleplay` |
| `conversation.view` | keyed | 会话内聊天面 `id=roleplay` |
| `conversation.composer.dock` / `conversation.input.*` | list | 输入框周边（角色切换、token 计数） |
| `conversation.session.header.actions/utilities` | list | 会话头部按钮（回工作台、诊断） |
| `sidebar.panellist.actions` | list | 插件栏"更多"菜单行（可选） |
| `ui-settings` 设置页 | — | 数据 / 导入导出 / 脚本与安全设置 |

组件只拿投影 props（root：`useSessions`/`useWorkspaces`/`usePanelInfo`；会话：`useSession`/`useProjection`/`useConversation`/`useChat`），**不能 require Harness 的 Client 包**。

### 3.5 存储与其它 ✅

- `ctx.storage` + `dsh-storage-json` + `dsh-storage-domain` → `ctx.storageDomain`（非会话持久数据）。desktop profile 是否挂载：⚠️ V5。
- `ctx.sessions.fork()` 可用于分支。
- LLM 参数仅 `temperature` / `maxTokens` / `stop` ❌ 无 `top_p`/penalty（`dsh-llm/README.zh.md`）。
- 可复用：`dsh-persona`、`dsh-commands`、`dsh-experimental-voice-input`、`dsh-skill`。
- 全局技能目录 `<dshHome>/skills`（`C:\Users\Administrator\.dsh\skills`）。

### 3.6 参考资产实测 ✅（决定优先级的关键证据）

`参考/IMG_4552.PNG`（4.6 MB，512×768）内嵌 `chara` tEXt（4.19 MB base64）：

| 字段 | 实测值 |
|---|---|
| spec | `chara_card_v3` / `3.0`，解出 2.40 MB JSON |
| 名称 | 春日狂想曲·统一版（玩家通道），作者「时之写卡器」，`unified-v1.22-player` |
| description / first_mes | 20 / 33 字符（**正文几乎为空**） |
| alternate_greetings | 3 条（10.9k / 3.6k / 5.6k 字符） |
| character_book | 126 条、28.2 万字；91 条 `constant`；位置 `before_char` 83 / `after_char` 9 / 未指定 34 |
| `[InitVar]` 条目 | 3 条（初始变量、非同层初始变量、开局设定）→ **MVU 依赖** |
| `extensions.tavern_helper` | 1.99 MB；`scripts` 15 个、`variables` 已存变量 |
| 其中已启用脚本 | 仅 2 个：`[共用] MVU`（91 字符，内容为 `import 'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js'`）、`[共用] 00-热更加载器`（24.5 KB，多 CDN 取版本并拉远程脚本） |
| 其中冷备脚本 | 13 个（含 1.17 MB 的「[同层] 核心v88」、178 KB 状态栏、150 KB 后台推演…） |
| `extensions.regex_scripts` | 14 条（显示 8 / prompt 6，`placement=[2]`） |
| `depth_prompt` | `{prompt:'', depth:4, role:'system'}` |

`参考/梦鲸思客V5-1030-exp.json`（1.5 MB，ST Chat Completion 预设）：

| 字段 | 实测值 |
|---|---|
| prompts | 122 条（system 14 / user 104 / assistant 4），内容合计 3.2 万字 |
| prompt_order | 118 项，44 项启用，8 个 marker |
| 采样参数 | temperature 1 / top_p 0.95 / max_tokens 30000 / context 2,000,000（**DSH 只支持前三项中的温度与上限**） |
| `extensions` | `regex_scripts` 116 KB、`tavern_helper.scripts` 1.16 MB、`tool_output_bridge`、`luker`（另一扩展的配置） |

**结论**：这两个参考资产是"**TH 脚本 + MVU + 世界书 + 正则**"四件套，几乎不含传统卡面文字。**没有 L4 运行时，这张卡只剩壳**——这直接决定了里程碑顺序（D-010）。

---

## 4. 总体架构

### 4.1 包结构

```
@dsh-tt/bundle            ← cordis.patch.yml + 依赖（Host 行 + Client 行）
├─ @dsh-tt/core           ← Host：领域数据、提示词引擎、请求接管、生成调度、TH 运行时宿主、导入导出
└─ @dsh-tt/ui             ← Client：main[roleplay] 工作台、conversation.view[roleplay] 聊天面、
                                编辑器、诊断面板、TH 脚本沙箱容器
```

### 4.2 核心决策：Shadow Chat（插件拥有 RP 真相）

DSH 日志仅追加，而 ST 的编辑/删除/swipe 要求"历史可改写"。方案：插件维护自己的楼层数组，DSH 日志退化为传输层：

```
用户输入 ──► DSH 会话（普通 user/message 事件，保留日志/fork/resume）
                │
                ▼
        agent/pre-step   ← 用 Shadow Chat + 世界书 + 预设 + 正则 + 变量 重建 messages
                │
                ▼
             LLM 请求 → assistant/message ──► 写入 Shadow Chat（当前 swipe 变体）
```

- 编辑/删除/swipe 只改 Shadow Chat；下次请求全量重建，"所见即所算"。
- 代价：日志与请求漂移；RP 会话关闭自动压缩；工具往返在 RP 模式默认 restrict（Q-007）。
- ⚠️ V1：`agent/pre-step` 整体替换 `decision.messages` 的官方用法（必须保留 `startsRequestSeries` 等字段）。

### 4.3 提示词引擎（复刻 ST 组装顺序）

`system-prompt/assemble` 管 system 段，`agent/pre-step` 管对话段：

```
[系统]  预设主提示词 + 卡 system_prompt + 世界书@before + 用户人设
[对话]  世界书@depth + Author's Note@depth + 历史（预算裁剪）+ 备选问候
[系统末] post_history_instructions（世界书@after）
```

- 只接管 RP 会话；通过 `agent/created` → `agent.ctx` 在 agent 作用域注册，避免污染其他 agent。
- 宏在渲染期展开（`{{char}}` `{{user}}` `{{time}}`…）。
- **预设的 122 条 prompt 要按 ST 语义处理**：`marker`（chatHistory/systemPrompt/postHistoryInstructions 等 8 个）是**位置占位符**，不是内容；`prompt_order` 决定顺序与启用；injection 类走深度注入。这是 L2 最容易做错的地方。

### 4.4 世界书引擎

- 扫描最近 N 条（scan depth）+ 递归触发；规则：主/次关键词、AND/OR/NOT、正则 key、大小写、概率（种子可复现）、inclusion group、sticky/cooldown/delay 状态机。
- 注入按 `position`（before/after char、AN 深度、@depth）+ token 预算。
- 参考卡有 91 条 `constant` + 28 万字、位置以 `before_char` 为主 → **预算裁剪与世界书排序是硬需求**，否则一次请求就爆上下文。
- 所有命中决策进诊断日志（ST 用户最依赖的可见性）。

### 4.5 生成与交互（L3，在会话视图内）

| 交互 | 实现 |
|---|---|
| 发送 | 复用宿主 composer（`inputActions`） |
| Swipe | 楼层 ◀ 2/5 ▶ 切变体；走到末尾触发生成 |
| 重新生成 | 生成新变体 + 当前变体标回滚点 |
| 编辑 / 删除 / 复制 | hover 动作 + 弹层，只改 Shadow Chat |
| 备选问候 | 新建 RP 会话时选一条 `alternate_greetings` |
| 角色切换 | 顶部选择器；只影响新楼层（旧楼层留卡快照） |
| 群聊 | 单 agent 多角色轮转 |
| 分支 | Shadow Chat 内部树；需要日志级分支时 `sessions.fork()`（Q-003） |

### 4.6 工作台面板（`main[key=roleplay]`）

```
┌ 角色扮演 ────────────────────────────────────────────────────────┐
│ [角色库] [世界书] [预设] [人设] [正则] [脚本] [诊断]     [新建对话]  │
│ ┌──────────┐  角色卡片网格 / 列表                                 │
│ │ 头像 名字 │  详情：描述、内嵌世界书、备选问候、脚本清单、正则     │
│ │ 标签 最近 │  操作：开始对话、编辑、导出、复制                     │
│ └──────────┘  底部：导入 ST 卡（PNG/JSON）/ 扫描 assets/           │
└──────────────────────────────────────────────────────────────────┘
```

- 「新建对话」= 建 DSH 会话 + 绑定角色 + Shadow Chat → `selectPanel(null)` 回会话界面并选中 `roleplay` 视图。
- 面板是 root 作用域，拿不到 `useSession`，只管数据与导航；面板内直接聊天见 Q-009。
- **动工前必做（D-008）**：先加载 `frontend-design` + `emil-design-eng`，交付前用 `web-design-guidelines` 过一遍；但 DSH 宿主规则优先（槽位、`--dsw-alias-*` 令牌、locale、既有页面间距）。

### 4.7 两层 UI 的导航

```
插件栏「角色扮演」──► main[roleplay] 工作台（选卡/配置/导入/脚本）
                          │ 新建对话 / 继续对话
                          ▼
                   main[conversation] 会话界面（composer + roleplay 视图）
                          │ 头部按钮「角色扮演工作台」
                          ▼
                     回到 main[roleplay]
```

### 4.8 酒馆助手兼容层（L4，D-009）

**定位**：不是"跑 ST 扩展"，而是**自建一个 TavernHelper 运行时**——用户脚本在隔离沙箱里运行，只能通过白名单 RPC 访问插件的 Shadow Chat / 世界书 / 变量。

```
┌─ roleplay 视图 / 工作台 ──────────────────────────────────────┐
│  React UI（楼层、状态栏容器、脚本面板）                        │
│      ▲ props/hooks              ▲ iframe 渲染楼层              │
│      │                          │                              │
│  ┌───┴────────────┐      ┌──────┴─────────────┐               │
│  │ Client Service │◄────►│ 脚本沙箱 iframe     │               │
│  │ (TH RPC 网关)  │postM │ sandbox=allow-scripts│              │
│  └───┬────────────┘      │ window.TavernHelper │               │
│      │ RPC/WS            │ + eventOn/emit      │               │
│  ┌───▼────────────┐      └──────▲─────────────┘               │
│  │ Host: TH Runtime│            │ 远程脚本（经 Host 代理）      │
│  │ 变量/消息/世界书 │────────────┘                              │
│  │ 事件总线/生成调度│                                           │
│  └───┬────────────┘                                            │
│      └── Shadow Chat / Worldbook / Storage / Session            │
└────────────────────────────────────────────────────────────────┘
```

**分层实现（按参考卡的实际需要排序）**：

| 层 | 内容 | 说明 |
|---|---|---|
| **T0 数据** | 解析 `tavern_helper.scripts` / `variables` / `regex_scripts` / `character_book` / `depth_prompt` | 只读，M0 就要做（否则连"卡里有什么"都看不到） |
| **T1 核心** | `getVariables` `replaceVariables` `updateVariablesWith` `insertOrAssignVariables` `insertVariables` `deleteVariable`；`getChatMessages` `setChatMessages` `createChatMessages` `deleteChatMessages` `rotateChatMessages` `getLastMessageId`；`eventOn`/`eventOnce`/`eventEmit`/`eventRemoveListener`；`substitudeMacros` `getMessageId` `errorCatched`；`getWorldbook*` `getLorebookEntries*`（读）；`triggerSlash`（子集） | **MVU 能跑起来的最小集合** |
| **T2 生成** | `generate` `generateRaw` `stopGenerationById` `stopAllGeneration` `injectPrompts` `uninjectPrompts` `registerMacroLike` `getTavernRegexes` `formatAsTavernRegexedString` | 后台推演、外置 AI、格式补全要用 |
| **T3 渲染** | `formatAsDisplayedMessage` `retrieveDisplayedMessage` `refreshOneMessage`；iframe 楼层渲染；EJS 模板；状态栏与立绘 | 参考卡的"状态栏/天元录式注入"要靠它 |
| **T4 管理** | character / persona / preset / 正则写入、extension 安装、audio、file、upload | 只做只读或明确不做（Q-013） |

**变量作用域映射**（ST → 我们）：

| ST | 我们的实现 |
|---|---|
| `global` | 插件 storage 的全局段 |
| `character` | 角色卡记录上的 `variables` |
| `chat` | Shadow Chat 记录的 `variables` |
| `message` | 楼层记录的 `variables`（按楼层 id 定位，等价 ST 的 message_id） |
| `script` | 脚本实例自己的命名空间 |
| MVU `stat_data` | 由 `[InitVar]` 世界书条目初始化，落在 `message` 作用域 |

**事件映射**：

| TH 事件 | 触发点 |
|---|---|
| `message_sent` / `message_received` | 用户楼层提交 / assistant 回复落定 |
| `generation_started` / `generation_ended` | `agent/pre-step` 进入 / `assistant/message` 落定 |
| `chat_changed` | 会话切换 / 角色切换 |
| `message_edited` / `message_deleted` | Shadow Chat 变更 |

**网络与供应链（关键设计）**：

- 参考卡的 MVU 是 `import 'https://…/bundle.js'`，loader 还会按版本去 4 个 CDN 拉业务脚本 → **脚本必然要联网**。
- 但 `srcdoc`/`blob:` iframe 会继承父页 CSP，DSH 页面的 CSP 未必允许任意外链 ESM（⚠️ V13）。
- 因此：**远程脚本一律由 Host 代理**——Host 侧下载、校验、落盘缓存，再由插件以同源 blob 注入沙箱；沙箱本身禁直连外网。
  - 好处：版本可锁、可审计、离线可复现、缓存命中快。
  - 默认策略：**远程脚本关闭**，用户在工作台的「脚本」页显式启用某个脚本/域名后才放行（Q-010/Q-011）。
- 安全边界：沙箱 `sandbox="allow-scripts"`（**不给** `allow-same-origin`）、无 DSH 凭据、RPC 白名单、单脚本超时与内存上限。

**安全免责**：与 JS-Slash-Runner 相同的风险等级——脚本可读取聊天与变量、可发起网络请求。插件必须在启用前显示明确警告，并在诊断页展示每个脚本的来源与最近一次执行结果。

---

## 5. 特性映射矩阵

状态：✅ 有明确方案 ｜ ⚠️ 待验证 ｜ ❌ 硬约束，仅替代 ｜ — 不在范围

| # | ST 功能 | DSH 方案 | 状态 | 阶段 |
|---|---|---|---|---|
| 0 | 插件栏入口 + 独立插件页 | `sidebar.panellist` + `main[key=roleplay]`（D-006） | ✅ | M0 |
| 1 | 会话内 RP 聊天面 | `conversation.view` `id=roleplay` 自绘楼层（D-007） | ⚠️ V4 | M0 |
| 2 | 角色卡 V2/V3 导入（PNG/JSON） | 解析 `tEXt` `chara`/`ccv3` → storage；支持 4 MB 级卡 | ✅ | M0 |
| 3 | 角色库 + 头像 | 工作台网格 + 详情 | ✅ | M0 |
| 4 | `character_book` 内嵌世界书 | 导入拆成独立世界书并关联 | ✅ | M0 |
| 5 | 主提示词 / System Prompt | `system-prompt/assemble` | ⚠️ V2 | M1 |
| 6 | prompt 列表：顺序、开关、marker 定位 | 预设导入 + 组装引擎（§4.3） | ✅ | M1 |
| 7 | 预设保存/切换/导入导出 | storage + ST preset JSON 兼容 | ✅ | M1 |
| 8 | Author's Note（深度注入） | pre-step 按深度插入 | ✅ | M1 |
| 9 | 宏展开 | 渲染期变量替换；随机可复现 | ✅ | M1 |
| 10 | 世界书（关键词/深度/预算/递归） | §4.4 | ✅ | M1 |
| 11 | 世界书 sticky/cooldown/delay | 会话状态机 | ✅ | M2 |
| 12 | 正则（prompt 作用域） | pre-step 文本变换 | ✅ | M2 |
| 13 | 正则（显示作用域） | Client 渲染时变换 | ✅ | M2 |
| 14 | token 预算 / 历史裁剪 | 插件自算 + 关闭 DSH 压缩 | ⚠️ V7 | M1 |
| 15 | **TH 脚本清单/变量/正则解析** | T0 数据层 | ✅ | M0 |
| 16 | **TH 变量 API（5 作用域）** | T1 + §4.8 映射 | ⚠️ V14 | M2 |
| 17 | **TH 消息 API + 事件** | T1 + 事件映射 | ⚠️ V12 | M2 |
| 18 | **MVU 变量框架** | `[InitVar]` 初始化 + 楼层变量 + `stat_data` | ⚠️ V14 | M2 |
| 19 | **TH 生成类 API** | T2（`generate` / `injectPrompts` / 宏注册） | ⚠️ V12 | M3 |
| 20 | **TH 前端渲染（iframe/EJS/状态栏）** | T3 + `conversation.chat.node` 或自绘楼层内嵌 | ⚠️ V15 | M3 |
| 21 | **TH 远程脚本（热更）** | Host 代理下载 + 缓存 + 显式授权（§4.8） | ⚠️ V13 | M3 |
| 22 | STScript（`/setvar` 等） | `triggerSlash` 子集 + 宿主命令 | ⚠️ | M3 |
| 23 | swipe / 重新生成 | Shadow Chat 变体 + 生成触发 | ⚠️ V3 | M4 |
| 24 | 编辑 / 删除 / 复制楼层 | Shadow Chat | ✅ | M4 |
| 25 | 备选问候语 | 建会话时选择 | ✅ | M1 |
| 26 | 聊天导入导出（ST jsonl） | Shadow Chat ↔ ST chat 结构 | ✅ | M4 |
| 27 | 分支 / checkpoint | Shadow Chat 树（可选 `sessions.fork`） | ⚠️ | M4 |
| 28 | 群聊 | 单 agent 轮转 | ✅ | M4 |
| 29 | 斜杠命令 / Quick Replies | `dsh-commands` + 按钮面板 | ✅ | M4 |
| 30 | 采样参数预设（top_p 等） | ❌ DSH 只有 temperature/maxTokens/stop；可选自建 provider | ❌+可选 | M5 |
| 31 | 多后端连接配置 | 用 DSH 的 model/provider | ✅ | M0 |
| 32 | TTS / 语音输入 | 外部 TTS + `dsh-experimental-voice-input` | ⚠️ | M5 |
| 33 | 图片生成（SD/ComfyUI） | 工具调用外部 API | ⚠️ | M5 |
| 34 | Data Bank（RAG） | skill/文件 + 检索工具 | ⚠️ | M5 |
| 35 | ST 原生扩展 / 像素级复刻 | ❌ 不做 | ❌ | — |

---

## 6. 数据模型（初稿）

```
ctx.storageDomain（或插件自有目录）
├─ characters/           角色卡（原始 JSON + 头像 + 元数据 + 卡内脚本/正则）
├─ personas/             用户人设（多套）
├─ lorebooks/            世界书（ST World Info 兼容，含 [InitVar] 原样保留）
├─ presets/              预设（ST preset 兼容：prompts/prompt_order/extensions）
├─ regex/                正则（prompt / display 双作用域）
├─ scripts/              TH 脚本（来源：卡 / 预设 / 全局）+ 启用状态 + 远程缓存引用
├─ remotes/              远程脚本缓存（URL → 内容 + sha256 + 拉取时间 + 版本）
├─ chats/                Shadow Chat：{ chatId, characterId, floors[], branches, variables, meta }
└─ sessions.json         会话 ↔ chatId / 角色 / 预设 绑定 + RP 开关 + TH 运行时开关
```

```ts
interface FloorVariant {
  text: string
  sendDate?: number
  genStarted?: number
  genFinished?: number
  extra?: Record<string, unknown>   // ST 的 per-swipe extra（模型、token…）
}

interface Floor {
  id: string
  role: 'user' | 'assistant' | 'system'
  speaker?: string
  variants: FloorVariant[]          // 对应 ST 的 swipes[] + swipe_info[]（§14.7）
  selected: number                  // swipe_id
  visible: boolean
  variables?: Record<string, unknown>   // TH 的 message 作用域（MVU stat_data 在这里）
  createdAt: number
  meta?: { model?: string; tokens?: number; greeting?: boolean; scriptTags?: string[] }
}

interface ScriptRecord {
  id: string                 // TH script id
  name: string
  enabled: boolean
  source: 'character' | 'preset' | 'global'
  contentRef: { kind: 'inline'; text: string } | { kind: 'remote'; url: string; sha256: string }
  granted: { network: boolean; domains: string[] }   // 用户显式授权
  lastRun?: { at: number; ok: boolean; error?: string; ms?: number }
}
```

---

## 7. 里程碑（D-010 重排）

| 里程碑 | 交付物 | 验收 |
|---|---|---|
| **M0 骨架** | ① 空面板 spike（`sidebar.panellist` + `main[roleplay]`，V4） ② bundle + core + ui ③ 角色卡导入（含 4 MB V3 卡）+ 角色库 ④ **T0：解析并展示卡内脚本/变量/正则/世界书** ⑤ 会话内 `roleplay` 视图渲染楼层（含流式） | 插件栏出现「角色扮演」→ 导入参考卡 → 看到 15 个脚本、14 条正则、126 条世界书 → 新建对话能正常聊天 |
| **M1 提示词引擎** | 世界书触发与预算、预设（122 prompt / marker / order）、Author's Note、正则双作用域、宏、诊断面板 | 导入参考预设 + 卡，生成结果的 system/对话结构符合 ST 语义，可看命中详情 |
| **M2 TH 运行时 T1** | 沙箱 + RPC 网关、变量 5 作用域、消息 API、事件总线、世界书读、`[InitVar]` 初始化 | **MVU 能跑**：开局注入 `stat_data`，模型输出变量补丁后 `stat_data` 正确更新 |
| **M3 TH 运行时 T2/T3** | `generate`/`injectPrompts`/`registerMacroLike`、远程脚本代理与授权、iframe 渲染楼层、状态栏 | 参考卡的「状态栏」「热更」「后台推演」能按预期工作（逐项验收） |
| **M4 交互层** | swipe/重新生成/编辑/删除、聊天导入导出、群聊、分支、命令与快捷回复 | 完整体验对齐 ST 的楼层操作 |
| **M5 生态** | 采样参数透传（自建 provider）、TTS、图片生成、Data Bank | 按需扩展 |

> 为什么把 TH 提到 M2/M3：参考资产的正文几乎为空，**价值 100% 在脚本与变量**。先做交互层等于做了一个能 swipe 的空壳（见 §3.6）。

---

## 8. 风险与硬约束

| # | 风险 | 影响 | 应对 |
|---|---|---|---|
| R1 | 日志仅追加 | 编辑/删除必须走 Shadow Chat | D-002；所有请求由 Shadow Chat 重建 |
| R2 | `agent/pre-step` 全量替换与他插件冲突（压缩/记忆/goal） | 行为不可预期 | RP 会话显式关闭压缩等；只在自有会话接管 |
| R3 | 采样参数缺失 | 参考预设的 top_p/penalty 不生效 | 声明差异；M5 可选自建 provider 透传 |
| R4 | 空输入生成 API 未确认 | swipe 被阻塞 | M0 验证 V3；退路用宿主 composer |
| R5 | 世界书/正则/宏正确性 | RP 质量直接崩 | 诊断面板：命中、注入位置、最终 messages |
| R6 | DSH 升级导致插槽/事件变化 | 维护成本 | 只用文档化插槽；不 require Client 包 |
| R7 | "完全适配一切"不可达 | 期望错位 | L1–L5 分级验收 |
| R8 | 面板与会话分离 | 体验割裂 | 面板记住上次对话；头部回工作台入口 |
| **R9** | **TH 沙箱里跑任意第三方 JS** | 可读聊天/变量、可外联 | 沙箱无 same-origin、RPC 白名单、默认禁网、逐脚本授权与警告 |
| **R10** | **远程热更 = 供应链风险** | 上游被投毒即可执行任意代码 | Host 代理 + sha256 锁定 + 版本可回滚 + 变更日志 |
| **R11** | **许可**：JS-Slash-Runner 是 PolyForm NonCommercial | 不能复制其代码 | 只做 API 兼容的独立实现；接口名属事实性 API；不 vendor 其源码 |
| **R12** | **CSP/iframe 限制**（父页 CSP 继承） | 外链 ESM 可能被拦 | 走 Host 代理注入同源内容（V13）；必要时降级为"无网络脚本" |
| **R14** | **许可**：SillyTavern 是 AGPL-3.0 | 复制其代码会传染许可 | 只读源码提取**行为语义**（§14），实现独立编写；不复制代码片段 |
| **R15** | ST 的预设/卡无 schema 版本号，字段随版本漂移 | 导入易丢字段或误判默认值 | 宽容导入：缺字段取默认、未知字段原样保留（§14.9） |

---

## 9. 待决问题

| 编号 | 问题 | 结论 / 状态 |
|---|---|---|
| Q-001 | 交互形态 | **已定**：插件栏 + 全局面板 + 会话内聊天面（D-006/D-007） |
| Q-002 | 是否有 ST 资产 | **已定：有**（`参考/` 两件，见 §3.6 / §12） |
| Q-003 | 单角色优先还是群聊优先 | 待定（建议单角色，群聊 M4） |
| Q-004 | 接受 Shadow Chat | **已定：接受**（D-002） |
| Q-005 | 诊断面板/可复现 | 待定（强烈建议要，M1 起） |
| Q-006 | 模型范围 | 待定（先用 DSH 模型，M5 再评估自建 provider） |
| Q-007 | RP 会话是否强制禁工具 | 待定（建议默认可配置，开 RP 时 restrict） |
| Q-008 | 单会话是否可中途换卡 | 待定（建议允许，旧楼层留快照） |
| Q-009 | 聊天区是否全搬进面板 | 待定（建议先不搬） |
| **Q-010** | **沙箱网络策略** | 待定（建议：默认禁网；按脚本授权域名白名单） |
| **Q-011** | **是否支持"热更"（远程脚本自动更新）** | 待定（建议支持但默认关、需显式信任某个源；缓存+哈希） |
| **Q-012** | **TH 做到 T3（前端渲染）还是只到 T2（生成/变量）** | 待定（参考卡的状态栏依赖 T3，建议做） |
| **Q-013** | **TH API 基线版本** | 待定（建议锁一个 release 的 `@types` 快照作为契约，避免追 HEAD） |
| **Q-014** | **卡/预设里已存的 `tavern_helper.variables` 是否作为初始状态导入** | 待定（建议导入，并保留原样以便回写） |
| **Q-016** | **聊天引擎走哪条路线**：A 会话驱动 / B 直连 LLM / C 混合 | 待定（建议 B，见 §16.3） |
| **Q-017** | **"酒馆助手能安装使用"的准确含义**：脚本兼容层，还是原样运行 ST 扩展 | 待定（原样运行不可行，见 D-004） |
| **Q-018** | **局数据归属**：插件自有存储（ST 式）还是复用 DSH 会话列表 | 待定（建议自有） |
| **Q-019** | **首版范围**：先跑通"面板内能聊"，还是先做导入导出与 TH | 待定（建议先跑通闭环） |
| **Q-020** | **是否接受以 spike 开路的 v2**：先验证 RPC（V17）再动 UI | 待定（建议接受） |

---

## 10. 验证清单（动工前）

| # | 待验证项 | 方法 |
|---|---|---|
| V1 | `agent/pre-step` 替换 messages 的用法与必须保留字段 | 读 `dsh-agent-loop`；`cordis_inspect_query` 看 Event |
| V2 | `system-prompt/assemble` 替换边界（是否影响工具引导等必需段） | 同上 + 最小插件试装 |
| V3 | Client 侧触发一次生成（空输入/重新生成）的公开 API | 读 `dsh-client-ui-session`、`dsh-api-session-controller` |
| V4 | 全局面板注册参数（`main` keyed、`sidebar.panellist`、`selectPanel`） | `Slots.listSubTree` + 空面板 spike |
| V5 | `ctx.storageDomain` 是否在 desktop profile 挂载 | 读 profile 配置 |
| V6 | 图片/附件展示链路（头像、立绘、生图） | 读 `dsh-attachment`、`conversation.images.content` |
| V7 | 关闭压缩的最简做法 | 读 `dsh-compaction` 配置 |
| V8 | 自绘视图里的流式增量 | 读 `dsh-client-ui-chat` 的 `useChat` |
| V9 | 自绘视图的 Markdown 渲染方案 | 复制 primitives 行为或自带轻量渲染器 |
| V10 | 让 RP 会话默认打开 `roleplay` 视图 | 读 View 偏好持久化 |
| V11 | 面板内创建/驱动会话的 Client API（决定 Q-009） | 读 session controller；空面板 spike |
| **V12** | **TH API 契约快照**：以哪个 release 的 `@types/function/*.d.ts` 为准 | 固定 tag，落地到 `docs/th-api.md` |
| **V13** | **DSH 页面 CSP 是否允许 iframe 内 ESM 外链**；若否，Host 代理方案的注入路径 | 读 web 服务器 CSP 配置 + 最小 iframe 试验 |
| **V14** | **MVU 的变量结构与 `[InitVar]` 解析**：`stat_data` 形态、楼层变量定位 | 用参考卡跑通一次变量更新 |
| **V15** | **iframe 楼层渲染**在 `roleplay` 视图里的挂载方式（高度自适应、滚动、主题） | 最小 iframe 组件试验 |
| **V17** | **第三方 bundle 能否暴露 Typert Remote**：不跑 `dsh-typert-generator` 时，`createTypertRemoteInfo` + `bindTypertRemote` 是否够用；流式（`mode:'stream'`）是否可用 | 读 `dsh-typert-protocol` / `dsh-typert-loader` 源码与 `dsh-plugin-manager` 的 remote 产物；最小 spike |

---

## 11. 决策记录

| 编号 | 日期 | 决策 | 理由 | 影响 |
|---|---|---|---|---|
| D-001 | 2026-11-14 | ~~注册独立 `conversation.view` 页签作主界面~~ | 首轮选择，已被 D-006 取代 | 仅保留为聊天面（D-007） |
| D-002 | 2026-11-14 | 采用 Shadow Chat | 日志仅追加，无法支持编辑/删除/swipe | 请求由 `agent/pre-step` 重建；关自动压缩 |
| D-003 | 2026-11-14 | M0 = 角色卡导入 + 角色口吻对话 | 先能玩起来 | 世界书/预设后移 |
| D-004 | 2026-11-14 | 不支持 ST 原生扩展与任意 JS | 安全与可维护性 | 只提供宏/正则/命令/工具 +（D-009 的 TH 白名单运行时） |
| D-005 | 2026-11-14 | 术语：楼层 = 消息，变体 = swipe | 对齐 ST 心智 | — |
| D-006 | 2026-11-14 | 插件栏入口 + `main[key=roleplay]` 全局面板 | 用户要求点插件按钮进插件 UI | 面板不绑定会话，只管数据与导航 |
| D-007 | 2026-11-14 | 聊天面留在 `conversation.view[id=roleplay]` | 复用 composer/流式/滚动物理 | 面板↔会话导航要顺（R8） |
| D-008 | 2026-11-14 | UI 设计前必须加载 `frontend-design` + `emil-design-eng`，完成后用 `web-design-guidelines` review | 用户要求；三者覆盖视觉/手感/规范 | 宿主规则优先于技能建议 |
| **D-009** | 2026-11-14 | **必须兼容酒馆助手（TavernHelper）**：自建白名单 API 运行时 + 隔离沙箱 + Host 代理远程脚本 | 参考卡与预设的价值几乎全在 TH 脚本与 MVU 变量上（§3.6） | 新增 L4；沙箱、事件、变量映射、远程代理全套设计（§4.8） |
| **D-010** | 2026-11-14 | 里程碑重排：TH 运行时提到 M2/M3，交互层后移 M4 | 先让参考资产"活"过来，而不是先做 swipe 空壳 | 见 §7 |
| **D-011** | 2026-11-14 | 新增**独立 RP 模式**：一个零工具的 `roleplay` agent preset，只提供会话与模型；系统提示词由插件在 `system-prompt/assemble` 整体接管，不挂 persona、不挂工具、不挂 compaction | 用户提案：模式只负责给插件一个聊天框；避免工具与默认提示词污染 RP | 见 §13；preset 与插件同 bundle；会话判定改为"绑定优先 + preset 辅助" |

---

## 12. 资产目录约定（Q-002 落点）

```
X:\dsh-tt\参考\            ← 用户投放的参考资产（不进版本库）
├─ IMG_4552.PNG            角色卡 V3（4.6 MB，内含 15 个 TH 脚本 / 126 条世界书 / 14 条正则）
└─ 梦鲸思客V5-1030-exp.json 预设（122 prompts / 118 order / 带 TH 脚本与正则）

X:\dsh-tt\assets\          ← 批量测试素材（.gitignore 排除）
├─ characters\  lorebooks\  presets\  chats\  regex\
```

- 插件只读原件、不改动；导入后副本进插件数据目录。
- 这两件是个人创作内容：`参考/` 与 `assets/` 均已排除出版本库。
- 它们同时是**验收基准**：M1 用预设验提示词结构，M2 用卡验 MVU 变量，M3 验状态栏与热更。

---

## 13. RP 模式：独立 agent preset（D-011）

> 本节是对 §4.3「只接管 RP 会话」判定方式的**修订**，不推翻原文，以本节为准。

### 13.1 提案

给插件一个**单独的模式**：不挂系统工具，唯一职责是提供会话聊天框给插件调用；连其他系统提示词都不加。

### 13.2 结论：可行，而且应该做

DSH 的 **agent preset** 就是"模式"的载体（`@deepseek-ai/dsh-agent-preset`，由 bundle patch 声明，见 `dsh-doc/references/compositions.md`）：

- **声明格式**：`config: { id, name, description, order, plugins[] }`，`plugins` 是 Cordis 入口列表——**一个模式有什么，全看这张表**。
- **零工具**：工具属于 preset 层，不是 Host 层。对照随包 `minimal` 预设（`dsh-web-app/presets/minimal.patch.yml`）：它显式列了 `dsh-tool-fs`、终端 shell 才有工具。我们的预设**一个 `dsh-tool-*` 都不列**，agent 就没有任何工具。
- **零系统提示词**：预设里不挂 `dsh-persona`，由插件在 `system-prompt/assemble` 里**整体替换**。
  - ⚠️ 不能用 `persona.complete: true`：那一刻注册表会把该前缀锁成唯一段落，监听器再也无法追加或替换提示词文本（`dsh-persona/README.zh.md`）。`minimal` 预设正是用它做"单段提示词"，与我们需求相反。
- **会话界面照旧**：composer、流式、滚动、附件都在 UI 层，与 preset 无关——这正是"模式只负责给插件一个聊天框"的落点。

### 13.3 预设草案

```yaml
- insert:
    - id: preset-roleplay
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: roleplay
        name: 角色扮演
        description: 只聊天——无工具、无工作区上下文，系统提示词由角色扮演插件接管。
        order: 20
        plugins:
          - id: tt-core                 # 我们的 Host 引擎（agent 作用域注册）
            name: '@dsh-tt/core'
```

- 不挂 compaction：RP 会话的历史裁剪与摘要由插件按 ST 语义自己做（§4.3、R2）。
- 不挂 skill / goal / schedule / subagent：RP 里不需要，且会污染提示词。
- 该 preset 与插件同属一个 bundle（`@dsh-tt/bundle` 里 insert 两行：`preset-roleplay` + 插件行）。

矩阵补充：

| # | 能力 | 方案 | 状态 | 阶段 |
|---|---|---|---|---|
| 36 | 零工具 RP 模式 | preset 不含 `dsh-tool-*`，系统提示词由插件接管 | ✅ | M0 |
| 37 | 面板一键建 RP 会话 | 新建会话时绑定 `roleplay` preset + Shadow Chat | ⚠️ V11/V16 | M0 |

### 13.4 会话如何判定自己是 RP

两级判定，**绑定优先**：

1. `sessions.json` 里该会话有 `chatId` → 插件接管（权威）。
2. 该 agent 的 preset id 是 `roleplay` → 辅助信号。

切走预设时插件应停止改写（⚠️ V16）。

### 13.5 影响

- **提示词**：system 段 100% 由插件生成，部署默认提示词、工具引导、工作区上下文全部消失 → token 明显下降，RP 人格稳定性上升。
- **工具**：彻底没有 fs / shell / web 工具，杜绝 RP 中途"模型突然去读文件"。
- **里程碑**：M0 增加两步——声明 `preset-roleplay`、面板新建会话时绑定它。
- **与 D-007 不冲突**：preset 决定"agent 有什么"，`conversation.view` 决定"界面长什么样"。
- **用户可见**：新建会话时能看到「角色扮演」预设；面板里也能一键建。

### 13.6 风险与待办

| # | 项 | 说明 |
|---|---|---|
| R13 | 切预设后插件仍在改写 | 需要绑定 + preset 双重判定，切走即清理（V16） |
| Q-015 | RP 模式是否还要显式关掉 Host 侧的压缩/goal/schedule | 建议：preset 层拿不到就已足够；若发现提示词污染再显式关 |
| V16 | 如何在 agent 作用域读到当前 preset id；面板如何指定 preset 建会话 | 读 `dsh-agent-preset` / `dsh-api-session-controller`；空面板 spike 一并验证 |

---

## 14. SillyTavern 源码研读：语义规格

> 目的：我们的目标不是"看起来像 ST"，而是**请求结构与 ST 逐字等价**。因此直接读 ST 源码，把算法固化成规格，再自己实现。
> **许可警告（R14）**：SillyTavern 是 **AGPL-3.0**。以下仅为**行为语义**的研读记录，实现必须是独立编写；不得复制其代码片段进本插件。

### 14.1 已下载的参考源（只读，位于 `tmp/st-src/`）

| 文件 | 大小 | 内容 |
|---|---|---|
| `world-info.js` | 265 KB | 世界书：扫描、递归、预算、分组、位置装配 |
| `openai.js` | 307 KB | 提示词组装、注入、marker 顺序 |
| `macros.js` | 27 KB | 宏替换（三段求值、完整宏表） |
| `chats.js` | 87 KB | 聊天与 swipe 相关操作 |
| `preset-manager.js` | 46 KB | 预设导入导出与格式 |
| `extensions_regex_engine.js` | 16 KB | 正则脚本引擎与 placement 枚举 |
| `script.js` | 498 KB | 主脚本：swipe、消息模型、`deleteMessage` |
| `slash-commands.js` | 295 KB | STScript：命令注册与 `initDefaultSlashCommands` |
| `group-chats.js` | 89 KB | 群聊（尚未深读） |

来源：`SillyTavern/SillyTavern` 分支 `release`，2026-11-14 抓取（后续可固定 commit sha 作为契约）。

### 14.2 世界书（`world-info.js`）

**枚举必须数值兼容**（导入的 JSON 直接可用，不做转换）：

```js
world_info_position = { before:0, after:1, ANTop:2, ANBottom:3, atDepth:4, EMTop:5, EMBottom:6, outlet:7 }
world_info_logic    = { AND_ANY:0, NOT_ALL:1, NOT_ANY:2, AND_ALL:3 }
```

**预算**：`budget = round(world_info_budget * maxContext / 100) || 1`，若 `world_info_budget_cap > 0` 且超出则取 cap。

**扫描状态机**：`while (scanState)`，每轮先判 `world_info_max_recursion_steps`（非 0 时到达即停，且此时 `min_activations` 被禁用）。`delayUntilRecursion` 有**分级**（`true` 视为 1，也可为数字），按级别逐轮放开；递归轮还受 `world_info_recursive` 与 `entry.excludeRecursion` 约束。sticky 条目不受这些抑制。

**单条目判定顺序**（照抄顺序即可等价）：

```
disabled → triggers(生成类型) → characterFilter(名字/tag) →
sticky/cooldown/delay 三个计时效果 → delayUntilRecursion 级别 →
excludeRecursion → @@activate / @@dont_activate 装饰器 → 外部激活 →
constant（恒激活） → sticky（计时激活） → 主关键词（逐个 substituteParams 后再 match） →
次关键词（AND_ANY / NOT_ALL / NOT_ANY / AND_ALL）
```

**激活后的批处理顺序**（很关键，决定谁被预算挤掉）：

1. 排序：sticky 优先，其次按 `sortedEntries` 的原序；
2. `filterByInclusionGroups`：同组只留最优（key 匹配分 + 计时效果两组过滤器）；
3. 概率：`useProbability && probability<100` 才掷；**sticky 不重掷**；掷失败记入 `failedProbabilityChecks`，本轮扫描内永久排除；
4. 预算累加：累加前先算 `已激活文本 token + 本批新增`，达到 budget 即 `token_budget_overflowed=true`；`ignoreBudget` 条目不受限；
5. 内容随即 `substituteParams` 展开宏。

**装配**：每次扫描结束后，把全部激活条目按 `sortFn` 排序，逐条 `unshift` 进目标桶（因此最终顺序与排序相反），并按 `entry.position` 分桶：

| position | 桶 |
|---|---|
| 0 before | `worldInfoBefore`（join `\n`） |
| 1 after | `worldInfoAfter` |
| 2 ANTop / 3 ANBottom | 与 Author's Note 拼接：`ANTop + '\n' + AN + '\n' + ANBottom` |
| 4 atDepth | 按 `(depth, role)` 分组，同组内 unshift |
| 5 EMTop / 6 EMBottom | 挂在示例消息（Example Messages）前后 |
| 7 outlet | 具名 outlet 数组 |

每条内容在装配前会过一次 TavernRegex：`getRegexedString(content, regex_placement.WORLD_INFO, { depth: position===atDepth ? entry.depth : null, isPrompt: true })`。

### 14.3 提示词组装（`openai.js` · `populateChatCompletion`）

固定顺序（与预设的 `prompt_order` 无关，这些是内置项）：

```
worldInfoBefore → main → worldInfoAfter → charDescription → charPersonality
→ scenario → personaDescription → nsfw → jailbreak
→ [用户 prompt：按 prompt_order 顺序，排除 system_prompt 与 ABSOLUTE 注入]
→ enhanceDefinitions → bias
```

- **相对注入**：`summary` / `authorsNote` / `vectorsMemory` / `vectorsDataBank` / `smartContext`，以及任何带 `position` 的 extension prompt，插在 `main` **之前或之后**（`position: 'start' | 'end'`）。
- **绝对注入**（`injection_position === ABSOLUTE`）：按 `injection_depth` 插入到对话消息流里（`populationInjectionPrompts`）。
- **控制提示词永远最后**：impersonate、continue 的 prefill、quiet prompt。
- `pin_examples` 决定示例对话在聊天历史之前还是之后。
- 预算用 `reserveBudget` 逐段预留，先算系统段，再算控制段。

### 14.4 正则（`extensions/regex/engine.js`）

```js
regex_placement = { USER_INPUT:1, AI_OUTPUT:2, SLASH_COMMAND:3, MD_DISPLAY:4, WORLD_INFO:5, REASONING:6 }
```

参考卡里 14 条正则全是 `placement:[2]`（AI 输出）与 `markdownOnly`/`promptOnly` 的组合——与我们 §5 第 12/13 行的"双作用域"设计一致。

### 14.5 对设计的修正（并入 M1/M2）

| 原设计 | 需要修正为 |
|---|---|
| §4.4 "按 position 落位" | 补全 8 种位置（含 ANTop/ANBottom/EMTop/EMBottom/outlet）与 atDepth 的 `(depth, role)` 分组 |
| §4.4 "概率/分组" | 明确：sticky 免掷、失败永久排除、同组只留最优、预算按"sticky 优先 + 原序"挤掉 |
| §4.3 "预设顺序" | 补：内置固定七段在前、用户 prompt 在后、相对注入插 main 前后、绝对注入按 depth、控制段最后 |
| 预算裁剪 | 用 ST 的百分比公式而非拍脑袋的数字，并把 `budget_cap` 暴露成插件 Config |

### 14.6 宏（`macros.js` · `evaluateMacros`，三段求值）

**顺序**：`preEnvMacros → envMacros（story string 变量）→ postEnvMacros`，全部 `//gi` 大小写不敏感。

| 段 | 宏 |
|---|---|
| pre-env（旧式） | `<USER>` `<BOT>` `<CHAR>` `<CHARIFNOTGROUP>` `<GROUP>`；骰子 `getDiceRollMacro()`；instruct 宏；**变量宏** `getVariableMacros()`（来自 `variables.js`）；`{{newline}}` `{{trim}}` `{{noop}}` `{{input}}` |
| env | story string 变量（`user` / `char` / `group` …），未注册的 `{{x}}` 由 `helperMissing` 兜底 |
| post-env | 上下文 `{{maxPrompt}}` `{{maxContext}}` `{{maxResponse}}`（含 `…Tokens` 别名）；消息 `{{lastMessage}}` `{{lastMessageId}}` `{{lastUserMessage}}` `{{lastCharMessage}}` `{{firstIncludedMessageId}}` `{{firstDisplayedMessageId}}` `{{lastSwipeId}}` `{{currentSwipeId}}` `{{allChatRange}}`；时间 `{{time}}` `{{date}}` `{{weekday}}` `{{isotime}}` `{{isodate}}` `{{datetimeformat:…}}` `{{idle_duration}}` `{{time_UTC±N}}`；其他 `{{reverse:…}}` `{{outlet::key}}` `{{random::a::b}}` `{{pick::…}}` `{{roll:…}}`、违禁词替换、**`{{//注释}}` 整段删除** |

两个易错的细节：

- `{{trim}}` 会吃掉**左右相邻换行**（`/(?:\r?\n)*{{trim}}(?:\r?\n)*/`），不是普通空串；
- `{{//…}}` 用于卡内加密备注。**参考卡的 `mes_example` 第一行就是 `{{//5f92…:eyJjaXBoZXJ0ZXh0…}}`**——宏引擎若不能正确剥离，就会把整段密文送进提示词。

### 14.7 Swipe 与消息数据模型（`script.js`）

消息对象的相关字段：

```js
{ mes: string, swipe_id: number, swipes: string[],
  swipe_info: [{ send_date, gen_started, gen_finished, extra }] }
```

- **惰性初始化**：第一次滑动时才补 `swipe_id=0`、`swipes=[mes]`、`swipe_info[0]={…}`。
- **左滑**：`swipe_id--`，小于 0 时回绕到 `swipes.length-1`。
- **右滑**：`swipe_id++`；越过末尾 = **overswipe**，按 `OVERSWIPE_BEHAVIOR` 处理：`NONE` 取消回到原 ID，`REGENERATE` 清空消息数据后重新生成。
- **切换**：`standardSwipe(id)` 做 `mes = swipes[id]`、`swipe_id = id`、保存；时间戳与 `extra` 是**每个变体独立**的。
- **删除**：`deleteSwipe(swipeId, messageId)`。
- 生成中禁止滑动（`isSwipingAllowed` / `isMessageSwipeable`），`SWIPE_SOURCE` 区分用户点击/键盘/删除/自动/slash。

对我们的改动：`Floor.variants` 要升级成带元数据的变体数组（`{ text, sendDate, genStarted, genFinished, extra }`），否则变体回滚会丢模型/时间信息。已在 §6 记待改。

### 14.8 STScript（`slash-commands.js`）

- 命令用 `SlashCommand.fromProps({ name, callback, namedArgumentList, helpString, … })` 注册进全局 `parser`；**名字不带斜杠**，输入时才加 `/`。
- 命令表在 `initDefaultSlashCommands()`（第 226 行起，200+ 条）。常用命令的行号（便于复查）：`sendas` 1255、`sys` 1330、`comment` 1408、`continue` 1490、`trigger` 1806、`echo` 2109、`gen` 2211、`pass` 2451、`run` 2579、`setinput` 2663。
- **变量类命令（`/setvar` `/getvar` `/addvar` `/incvar` …）不在这个文件里**，来自 `scripts/variables.js`（与变量宏同源）。
- 语法能力：命名参数 `key=value`、管道 `|`、闭包 `{: … :}`、静默执行。

对我们的改动：TH 的 `triggerSlash` 只需实现**变量类 + `sys` / `sendas` / `comment` / `gen` / `trigger` / `echo` / `pass` / `setinput`** 这一子集；其余命令必须返回明确的"不支持"错误，而不是静默吞掉（脚本作者会以为是 ST 的 bug）。

### 14.9 预设（`preset-manager.js`）

- 通过 `getPresetManager(apiId)` 工厂取得管理器，`initPresetManager()` 注册各 API 的管理器，另有 `/preset` 命令。
- 预设体本质是 **`oai_settings` 的子集序列化**：`prompts` / `prompt_order` / 采样参数 / `extensions`（各扩展自带字段）。
- **没有独立 schema 版本号** —— 所以导入必须**宽容**：缺字段取默认、未知字段原样保留（写回时不丢）。参考预设里的 `tool_output_bridge`、`luker` 就是"别人家的字段"，我们必须保留而不是丢弃。

### 14.10 剩余项（可选深读）

| 待读 | 目的 |
|---|---|
| `scripts/variables.js` | 变量宏与 `/setvar` 系列的确切语义（与 TH 变量作用域直接对应） |
| `public/scripts/extensions/regex/` 其余 | `markdownOnly` / `promptOnly` 在渲染链路的实际调用点 |
| `public/scripts/group-chats.js` | 群聊轮转与发言者选择（对应 M4 的群聊） |
| `public/scripts/macros/macro-system.js` | 新宏引擎（带参数宏、`registry.registerMacro`）的完整能力 |

---

## 15. v1 实现记录（2026-11-14）

### 15.1 已交付

| 层 | 内容 |
|---|---|
| Bundle | `plugin/package.json`（`dsh.bundle` + `dsh.client`）、`plugin/cordis.patch.yml`（`preset-roleplay` + 插件行）、`locale/{zh,en}.json`、`icon.svg`、`docs/DETAIL.md` |
| Host | `plugin/index.js` + `plugin/lib/{png,card,lorebook,macros,prompt,library}.js` |
| Client | `plugin/client.js`（由 `src/client.template.js` + 构建期快照生成）：侧栏「角色扮演」入口 + `main[key=roleplay]` 工作台面板 |
| 工具 | `tools/snapshot.mjs`（资产解析 → `build/snapshot.json`）、`tools/build-client.mjs`（注入快照 → `client.js`） |

### 15.2 能力边界（实测于参考卡 + 参考预设）

| 能力 | 状态 |
|---|---|
| PNG V3 卡解析（4.6 MB，`chara` 块，2.4 MB JSON） | ✅ 实测通过 |
| 卡片字段归一化（V2/V3、内嵌 `character_book`、`depth_prompt`、`tavern_helper.scripts`、`regex_scripts`） | ✅ |
| 预设解析（122 prompts / 118 order / 8 marker） | ✅ |
| 世界书激活（常量、主/次关键词四种逻辑、概率、预算、8 种位置分桶） | ✅ 25/114 命中、31,130/32,000 tokens |
| 宏（`{{//}}` `{{trim}}` `{{setvar}}` `{{getvar}}` `{{random}}` `{{roll}}` 时间/日期/`{{char}}`…） | ✅ 单测通过 |
| 系统提示词组装（预设顺序 + marker + 卡字段 + 世界书） | ✅ 79,726 字 |
| 零工具 `roleplay` 预设 | ✅ 已声明 |
| 客户端面板（角色列表 / 详情 / 世界书命中 / 系统提示词预览 / 复制） | ✅ 代码就绪，**未实机验证** |
| 深度注入（`@depth`）/ 递归 / sticky / inclusion group | ⛔ v2 |
| TH 脚本执行 | ⛔ v2 |

### 15.3 未实机验证的点（安装后第一件事）

1. `ctx.systemPrompt.section({ complete: true })` 在本 profile 是否被接受（被拒时插件会退回非 complete 段并写日志）；
2. `sidebar.panellist` + `main[key=roleplay]` 的注册与 `selectPanel` 跳转；
3. 面板在深/浅主题下的观感（令牌名不可用时靠 fallback 颜色）。

### 15.4 已知缺口：客户端拿不到实时数据

面板数据来自**构建期快照**（`tools/snapshot.mjs` → `build/snapshot.json`）。运行时的 host↔client 通道（Typert remote）尚未打通——这是 v2 的第一项，动工前先读 `@deepseek-ai/dsh-typert-protocol` 与 `dsh-plugin-manager` 的 Remote 用法。

### 15.5 运行方式

```powershell
# 1) 解析 assets/ 与 参考/ 下的资产，生成快照
node tools/snapshot.mjs
# 2) 生成客户端包
node tools/build-client.mjs
# 3) 插件 → 添加插件 → 选择 X:\dsh-tt\plugin 目录
# 4) 新建会话时选择「角色扮演」预设
```

### 15.6 安装记录（2026-11-14，已修正）

**踩过的两个坑**：

1. **`dsh plugin --profile desktop ...` 被拒绝**：desktop profile 由 Electron 应用独占。
2. **把包塞进 `dsh.profile.bundles` 会让应用起不来**：绕过了 pnpm（锁文件没有这条 `file:` 依赖），启动时报错。**已回滚**为原始 `package.json`（263 字节）。
3. **侧栏没有插件 —— 根因**：客户端模块图由「**已启用的 Loader 条目**」组合（`dsh-client-modules`）。插件原来只作为 preset 内的嵌套行存在，根层没有条目，浏览器侧永远发现不了它。

**最终安装方式（不碰依赖图，只改用户补丁层）**：

| 步骤 | 结果 |
|---|---|
| `profiles/desktop/node_modules/@dsh-tt/roleplay` → `X:\dsh-tt\plugin`（junction） | ✅ `require.resolve` 通过 |
| `profiles/desktop/cordis.patch.yml` 追加：根层 `tt-roleplay`（`takeover:false`，仅供客户端发现）+ `preset-roleplay`（内嵌 `tt-roleplay-agent`，`takeover:true`） | ✅ |
| 插件 `package.json` 补 `"./package.json"` 导出；去掉 `dsh.client.inject`（减少加载顺序依赖） | ✅ |
| 所有 profile 文件用 `UTF8Encoding(false)` / `node fs` 写入，逐字节验证**无 BOM** | ✅ |
| 端到端验证：克隆 profile 到 `desktop-verify`，`dsh --profile desktop-verify --help` | ✅ exit 0，日志出现 `[dsh-tt] 已加载 1 张卡…`（验证后已删除克隆） |
| 生效条件 | **完全退出并重开应用**（Loader 条目在启动时组合） |

回滚：把 `build/profile-backup/*.bak` 拷回 profile，并删除 `node_modules/@dsh-tt` 目录联接。

### 15.7 使用路径（v1.1）

1. 左侧栏「角色扮演」→ 工作台：确认卡、预设、世界书都被解析（右侧是世界书命中与系统提示词预览）。
2. **新建会话**，在预设选择器里选「角色扮演」。该预设没有任何工具，只保留对话与模型。
3. 直接说话。插件在 agent 作用域接管 system 段（`complete`），对话历史仍由 DSH 会话提供。
4. 想换角色：回工作台换卡后新建会话（v1 的激活角色来自构建期快照 + 配置）。

**v1.1 已知缺口**：开场白（`first_mes` / `alternate_greetings`）尚未自动插入成第一楼；需要在 `agent/created` 时把问候语注入会话（v1.2）。

### 15.8 Git 基线（2026-11-14）

- 本机原本没有 git，已安装 **MinGit 2.56.1** 到 `C:\Users\Administrator\.dsh\bin\mingit`（SHA256 与官方一致）。
- 仓库在 `X:\dsh-tt`，主分支 `main`，基线提交 `0ec8add`（20 个文件）。
- 排除：`参考/`、`assets/*`（保留 README）、`tmp/`、`build/`、`node_modules/`。

---

## 16. 目标形态修订：插件即应用（v2，讨论中）

> 本节是**提案与开放问题**，不构成决策。v1 的实现（§15）仍是当前基线。

### 16.1 用户要求（原话归纳）

1. 点进插件 UI 就是**完整的角色扮演界面**，不需要切到外面的会话；
2. **面板内要有历史列表**：玩过的局都在里面，点进去恢复该局的角色卡、预设、世界书、变量；
3. 角色卡**内置脚本与 UI** 能正常显示；
4. 除了换角色卡，还要能**换预设**；
5. 角色卡与预设的**导入导出**要做到位；
6. **酒馆助手（JS-Slash-Runner）必须能正常安装使用**。

### 16.2 与既有决策的冲突

D-007（聊天面留在 `conversation.view`）与 D-011（预设只管"零工具对话"）都是以"聊天在会话界面"为前提的。新要求推翻了这个前提，**需要一条 D-012 取代 D-007**。v1 的面板因此只是过渡形态。

### 16.3 三条技术路线（待选）

| 路线 | 做法 | 关键依赖 | 代价 |
|---|---|---|---|
| **A 会话驱动** | 面板自绘输入框与楼层，背后仍是一局 DSH 会话（agent loop） | Client 侧提交 prompt + 订阅流（V11/V17） | 受会话语义约束，历史与"加载所需插件"仍要另存 |
| **B 直连 LLM** | 面板/AI 引擎直接调 `ctx.llm.stream`，完全自管消息、历史、变量、预设 | Host→Client 流式 RPC | 流式、错误、token、重试都要自己写 |
| **C 混合** | B 负责生成，DSH 会话只作可选审计日志 | 同 B | 同 B，多一层同步 |

### 16.4 已核实的事实（决定可行性）

- ✅ **插件可以直接调用模型**：`ctx.llm.stream({ provider, model, messages })` 返回 token 级分片并以 `finish` 结束（`dsh-llm/README.zh.md`）。路线 B 在 Host 侧成立。
- ⚠️ **Host→Client 通道**：`@deepseek-ai/dsh-typert-protocol` 的 `@Remote` 需要**生成产物**（`./remote` 导出、描述符与 codec）；本工作区没有该生成器。**能否在不跑生成器的前提下暴露 Remote，是本项目最大的技术前置**（V17）。
- ✅ **导入**可退化为"目录扫描 + 手动放置"；**导出**可用浏览器 Blob 下载，不需要 Host 通道。
- ✅ **文件上传**由 `dsh-client-file-upload` 提供（未细读）。
- ⏳ **TH 运行时**（§4.8 T0–T3）独立于上述路线，但 T3 的 iframe 楼层渲染依赖面板内渲染能力。

### 16.5 v2 依赖清单

| # | 能力 | 前置 |
|---|---|---|
| 1 | 面板内聊天（输入、流式、滚动、错误） | V17（RPC） |
| 2 | 局（chat）数据模型与历史列表 | 1 |
| 3 | 点历史 → 恢复角色卡/预设/世界书/变量 | 2 |
| 4 | 角色卡切换、预设切换 | 1 |
| 5 | 角色卡/预设导入导出 | 导入可先走目录，导出走 Blob |
| 6 | TH 运行时 T1（变量/消息/事件） | 1 |
| 7 | TH 运行时 T2/T3（generate/渲染/iframe） | 6 + §4.8 的网络代理设计 |

### 16.6 待决问题（见 §9 的 Q-016 起）

### 16.7 第 1 轮答复（2026-11-14，待落定）

| 编号 | 问题 | 用户答复 |
|---|---|---|
| Q-017 | "支持酒馆助手"的含义 | **（b）原样安装 JS-Slash-Runner，以插件形式，可卸载可更新** |
| Q-016 | 聊天引擎路线 | **B：面板直连 `ctx.llm.stream`，完全自管** |
| Q-018 | 局数据归属 | **历史跟着 DSH 会话走**：会话还在就加载会话内容全量显示；插件不备份聊天内容 |
| Q-020 | 是否 spike 优先 | **是，先验证再做** |

**发现一处冲突（本轮必须解决）**：

- B（直连 LLM、完全自管）**不会产生 DSH 会话**，于是"历史跟着会话走"无对象可依；
- 反过来，若历史必须由 DSH 会话承载，生成就必须经过 agent loop（路线 A/C），而不是直连。

可行的折中是 **C′**：每局仍是一个 DSH 会话（只作存储与回放载体），生成走现有 agent loop，插件在 `agent/pre-step` 用 ST 语义重建 messages，面板只负责渲染该会话事件与输入。这样"不备份聊天内容"成立，且面板内自足。

### 16.8 （b）的两条落地路径（待选）

| 路径 | 做法 | 代价 |
|---|---|---|
| **b1 嵌 ST 本体** | 插件内跑一份 SillyTavern 前端（iframe），JS-Slash-Runner 装进那个 ST，DSH 只做外壳与模型桥 | 等于打包 ST（AGPL、双 UI、模型与设置全要桥接）；但"原样运行"最彻底 |
| **b2 ST API 仿真层** | 实现 JS-Slash-Runner 依赖的 ST 全局与 DOM 子集（jQuery、`eventSource`/`event_types`、`SillyTavern.getContext()`、聊天 DOM），让扩展以它自己的形式加载 | 工作量取决于它触碰多少 ST 内部；可增量验证（先加载，再补 API） |

## 17. 第 2–3 轮答复与 MVU 实测（2026-11-14）

### 17.1 已落定的决策草案

| 编号 | 决策 | 内容 |
|---|---|---|
| D-012（草案） | 取代 D-007 | **C′：会话作载体**。每局 = 一个 DSH 会话（存储 + 回放）；生成走 agent loop；插件在 `agent/pre-step` 用 ST 语义重建 messages；面板渲染该会话事件。插件不备份聊天内容。 |
| D-013（草案） | 取代 D-004 的"不做 ST 扩展"部分 | **b2：ST API 仿真层**。不复刻 ST 全前端，只实现 JS-Slash-Runner 实际依赖的那部分 ST 全局与 DOM；扩展以它自己的形式加载运行。插件 UI 内有**扩展管理子菜单**（安装/更新/卸载）。 |
| D-014（草案） | TH 验收线 | 三档递进：(a) 扩展能加载并能打开它自己的面板 → (b) 能跑通最小脚本（读写变量） → (c) **跑通 MVU**；同时支持导入/管理多套预设的预设列表。 |

### 17.2 MVU 实测：它到底用了哪些 ST API

把卡里 `import` 的 MVU bundle（`testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js`，611,598 字节）拉下来做了调用面统计：

| 类别 | 实际用到 | 次数 |
|---|---|---|
| `SillyTavern.*`（上下文） | `chat`(27)、`callGenericPopup`(17)、`POPUP_TYPE`(17)、`POPUP_RESULT`(14)、`getCurrentChatId`(13)、`getRequestHeaders`(5)、`saveChat`(5)、`chatCompletionSettings`(3)、`extensionSettings`(3)、`getCharacterCardFields`(2)、`ToolManager`(2)、`unregisterFunctionTool`(2)、`characters`(1)、`chatMetadata`(1)、`characterId`(1)、`saveSettingsDebounced`(1)、`loadWorldInfo`(1)、`registerMacro`(1)、`unregisterMacro`(1)、`getChatCompletionModel`(1)、`getCurrentLocale`(1)、`name2`(1) | ~120 |
| TH 裸全局 | `getVariables`(11)、`getChatMessages`(9)、`setChatMessages`(7)、`substitudeMacros`(7)、`eventOn`(4)、`eventEmit`(21)、`getTavernHelperVersion`(2) | ~60 |
| UI 依赖 | `toastr.*`（103）、`$(`（9，jQuery-lite） | 112 |
| 打包内建 | `YAML.stringify`（随 bundle 打包，不需我们提供） | — |

**结论**：MVU 的兼容面是**可枚举、有边界**的——约 24 个上下文成员 + 7 个 TH 全局 + toastr + 极少量 jQuery。这让 b2 从"猜工作量"变成"按清单实现"。

⚠️ 仍需实测：这些 `SillyTavern.*` 是从 `getContext()` 解构出来的（bundle 里没有直接 `getContext` 字样，说明被压缩/别名化了）。b2 的具体形状要在 spike 里按实际报错补。

### 17.3 由此确定的首版 TH 范围

1. `toastr` 全套最小实现（error/success/warning/info + title）；
2. `$()` 的 9 处用法所需子集（通常是选择器 + text/html/on/val）；
3. `SillyTavern` 上下文对象（上表 24 个成员）；
4. TH 裸全局 7 个 + `setVariables`/`insertOrAssignVariables`（脚本常用，虽未被 MVU 直接调用）；
5. `callGenericPopup` + `POPUP_TYPE`/`POPUP_RESULT`（MVU 用它做确认框）；
6. `getRequestHeaders`（MVU 用它调"额外模型"）——需要桥接到 DSH 的 provider 凭据，**不能直接把 key 交给脚本**，用 Host 侧代发。

---

## 附录 A：事实出处（当前安装）

基址：`C:\Users\Administrator\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai\`

| 事实 | 文件 |
|---|---|
| 请求管线 | `dsh/docs/agent-lifecycle.zh.md` |
| 插槽全量层级 | `dsh/docs/subsystems/slots.zh.md` |
| 全局面板 / `selectPanel` | `dsh-client-ui-layout/README.zh.md` |
| 插件栏入口 `sidebar.panellist` | `dsh-client-ui-sidebar/README.zh.md`（「全局面板入口」） |
| 会话仅追加 / fork / 不能新增事件类型 | `dsh-session/README.zh.md`、`dsh/docs/subsystems/session.zh.md` |
| LLM 采样参数仅 3 个 | `dsh-llm/README.zh.md` |
| 存储域 | `dsh-storage/README.zh.md`、`dsh/docs/subsystems/storage.zh.md` |
| 人设 | `dsh-persona/README.zh.md` |
| 技能目录优先级 | `dsh/docs/subsystems/skills.zh.md` |
| 插件开发 / UI / 规范 | `dsh-agent-preset/skills/dsh-doc/references/*.md` |

**上游参考（酒馆助手）**：[N0VI028/JS-Slash-Runner](https://github.com/N0VI028/JS-Slash-Runner)（1.4k stars，PolyForm NonCommercial）；API 面见 `@types/function/index.d.ts`（24 域、约 100 个函数）；文档 <https://n0vi028.github.io/JS-Slash-Runner-Doc/>。MVU 依赖 [MagicalAstrogy/MagVarUpdate](https://github.com/MagicalAstrogy/MagVarUpdate)。

## 附录 B：环境与工具

| 项 | 内容 |
|---|---|
| 全局技能 `find-skills` | [vercel-labs/skills](https://github.com/vercel-labs/skills)（39.3k★）。本机无 npm/npx：检索走 `https://skills.sh/api/search?q=`，安装走 raw/jsdelivr |
| 全局技能 `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills)（194k★）。视觉方向、字体版式、反模板 |
| 全局技能 `emil-design-eng` | [emilkowalski/skills](https://github.com/emilkowalski/skills)（56.8k★）。按压/原点/时序/动效性能 |
| 全局技能 `web-design-guidelines` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)（34k★）。UI 规范 review（运行时拉规则） |
| 安装位置 | `C:\Users\Administrator\.dsh\skills\<name>\SKILL.md`（全局，rank 400） |
| ASAR 读取脚手架 | `tmp/asarls.js` + `tmp/asarls.ps1` |
| 资产解析脚本 | `tmp/inspect_refs.py` / `inspect_card*.py` / `inspect_th.py`（Pillow 解 PNG 文本块 + JSON 结构统计） |

---

## 变更日志

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1 | 2026-11-14 | 初稿：目标分级、DSH 机制基线、Shadow Chat、特性矩阵、路线图、待决问题 |
| v0.2 | 2026-11-14 | 拍板 4 项：独立视图、Shadow Chat、M0 范围、有 ST 资产 |
| v0.3 | 2026-11-14 | 插件栏入口 + 全局面板（D-006/D-007）；补 §3.4、§4.6、§4.7、Q-009、R8、V11 |
| v0.4 | 2026-11-14 | 检索并全局安装 3 个 UI 设计技能；D-008 写入工作约定 |
| v0.5 | 2026-11-14 | 参考资产实测（§3.6）：卡与预设的结构说明"没有 TH 运行时就没有卡"；新增 L4 运行时兼容与 D-009（TavernHelper 自建白名单运行时 + 沙箱 + Host 代理远程脚本）；新增 §4.8 兼容层设计、6 行特性矩阵、D-010 里程碑重排、R9–R12、Q-010–Q-014、V12–V15 |
| v0.6 | 2026-11-14 | 用户提出"单独模式"：新增 D-011 与 §13（agent preset 零工具 + 插件接管系统提示词、persona.complete 冲突说明、preset 草案、绑定优先判定、R13/Q-015/V16） |
| v0.7 | 2026-11-14 | 研读 ST 源码（AGPL 只读语义）：新增 §14——世界书枚举/预算/扫描状态机/判定顺序/批处理/8 种位置装配，提示词组装的固定顺序与三类注入，正则 placement；给出对 §4.3/§4.4 的修正清单与"还没读的部分" |
| v0.8 | 2026-11-14 | 读完剩余源码：补 §14.6 宏三段求值与完整宏表（含 `{{//}}`、`{{trim}}` 两个坑）、§14.7 swipe 数据模型与 overswipe、§14.8 STScript 注册方式与常用命令行号、§14.9 预设无版本号需宽容导入；`Floor.variants` 升级为带元数据的 `FloorVariant[]`；新增 R15（ST 字段漂移） |
| v0.9 | 2026-11-14 | **v1 开工并构建完成**：Host 资产引擎（PNG/V3 解析、世界书激活、宏、ST 顺序提示词组装）+ 零工具 `roleplay` 预设 + 客户端工作台面板；新增 §15 实现记录、文件地图、能力边界、未验证项与缺口 |
