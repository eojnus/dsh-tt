# 角色扮演

把 SillyTavern 的资产带进 DeepSeek Harness：角色卡、预设、世界书、EJS 模板与酒馆助手脚本。

## 这个插件做什么

- **资产按需读取**：构建期只生成元数据快照；卡/预设/世界书正文由客户端通过 `workspaceFiles.readBytes` 从工作区读取，不把几 MB 的卡塞进客户端包。
- **提示词接管**：`@dsh-tt/roleplay/agent` 挂在「角色扮演」preset 的 agent 作用域里，声明 `systemPrompt` 注入；用 ST 的固定内置段 + `prompt_order` + marker + 世界书重新生成系统提示词，并用 `agent/pre-step` 剥掉客户端信封，让会话日志只保留用户原文。
- **EJS**：跨块渲染（`<%` 与 `%>` 可以分布在不同的 prompt/世界书条目里），兼容 `-%>`/`_%>` trim、`<%= %>` 转义、`getvar/setvar/getwi/getchar`、lodash 子集与 faker。
- **世界书**：扫描当前输入和最近聊天，支持按条目覆盖扫描深度。独立世界书可从「世界书 → 本局世界书」绑定到会话。支持常量、关键词、递归、计时、分组、装饰器、outlet、概率和预算。普通关键词由 Rust/WASM 批量匹配。
- **TH 宿主**：执行当前角色卡和预设里的脚本，提供变量、消息、事件与世界书 API。执行前解析脚本语法，按普通脚本或 ES 模块加载。Vue、YAML、Lodash、jQuery 和 Zod 随客户端发布。
- **输出渲染**：先应用预设显示正则，再应用角色卡显示正则及 EJS，最后在独立 iframe 渲染楼层 HTML。开场白和资产里的固定显示模板可运行界面脚本并读取当前楼层变量。其余助手 HTML 以静态内容显示。
- **资产面板**：角色/世界书/预设查看与启停、TH 脚本开关与状态变量、诊断日志。

## 怎么开始

1. 把角色卡（PNG/JSON）、预设、世界书放进工作区的 `assets/` 或 `参考/`。
2. 构建元数据与客户端包：

   ```powershell
   node tools/snapshot.mjs
   node tools/build-client.mjs
   ```

3. 在 **插件** 里安装本目录（profile 需要 `node_modules/@dsh-tt/roleplay` 联接与 `cordis.patch.yml` 的两条 insert）。
4. 重启 DSH（Loader 条目在启动时组合），从左侧栏进入「角色扮演」。
5. 在面板里选卡/预设，新建对话。会话使用「角色扮演」preset（零工具）。

## 已知边界（v0.2）

- 深度注入（`@depth`）按 ST 语义应插进对话消息之间；DSH 的 `agent/pre-step` 只能进入 user 角色消息，因此目前把深度条目按深度降序追加在 system 段末尾。会话日志不受影响。
- 世界书默认扫描最近两条消息，条目可覆盖深度。聊天历史的可用范围取决于 DSH 的会话事件窗口。向量匹配和按 Persona 绑定仍待接入。
- TH 的 `generate` 和 `generateRaw` 通过 DSH 的认证 Connection 路由复用当前会话模型。辅助生成支持文本、流式事件、取消、历史提示词正则和按深度插入。它有独立的模型调用，结果由脚本处理。
- TH 的聊天编辑 API（create/delete/rotate）只改 iframe 镜像，不回写 DSH 会话（会话日志仅追加）；变量与消息变量的读写会持久化。
- TH iframe 为兼容 `window.parent` 偏好存储使用 `allow-scripts allow-same-origin`；只运行你信任的角色卡脚本。
- Host 对用户输入和世界书使用提示词正则，辅助生成也会处理助手历史。普通 DSH 会话的生成请求由会话日志派生并冻结。面板和脚本 API 共用正则实现。
- 模型连接和默认采样由 DSH 管理。预设采样参数映射仍待接入。
