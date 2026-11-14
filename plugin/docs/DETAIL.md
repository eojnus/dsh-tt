# 角色扮演

把 SillyTavern 的资产带进 DeepSeek Harness：角色卡、预设、世界书、EJS 模板与酒馆助手脚本。

## 这个插件做什么

- **资产按需读取**：构建期只生成元数据快照；卡/预设/世界书正文由客户端通过 `workspaceFiles.readBytes` 从工作区读取，不把几 MB 的卡塞进客户端包。
- **提示词接管**：`@dsh-tt/roleplay/agent` 挂在「角色扮演」preset 的 agent 作用域里，声明 `systemPrompt` 注入；用 ST 的固定内置段 + `prompt_order` + marker + 世界书重新生成系统提示词，并用 `agent/pre-step` 剥掉客户端信封，让会话日志只保留用户原文。
- **EJS**：跨块渲染（`<%` 与 `%>` 可以分布在不同的 prompt/世界书条目里），兼容 `-%>`/`_%>` trim、`<%= %>` 转义、`getvar/setvar/getwi/getchar`、lodash 子集与 faker。
- **世界书**：常量、主/次关键词四种逻辑、概率、token 预算、八种插入位置。
- **TH 宿主**：卡里的 `extensions.tavern_helper.scripts` 在隔离 iframe 中执行；提供变量五作用域、聊天消息、事件总线、世界书读、宏、toastr、弹窗与 jQuery/lodash 子集，目标是跑通 MVU 变量框架。
- **输出渲染**：楼层的显示作用域正则 + 输出侧 EJS（变量来自 TH 宿主）。
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
- 世界书的递归扫描、sticky/cooldown/delay、inclusion group、`@@` 装饰器、outlet 尚未实现。
- TH 的 `generate`/`generateRaw` 需要 Host 生成桥，当前明确拒绝；MVU 的默认「随AI输出」路径不依赖它。
- TH 的聊天编辑 API（create/delete/rotate）只改 iframe 镜像，不回写 DSH 会话（会话日志仅追加）；变量与消息变量的读写会持久化。
- TH iframe 为兼容 `window.parent` 偏好存储使用 `allow-scripts allow-same-origin`；只运行你信任的角色卡脚本。
- 卡内提示词作用域正则（`promptOnly`）尚未接到 Host 的请求文本上；显示作用域（`markdownOnly`）已接。
- 采样参数只透传 DSH 支持的 temperature/maxTokens/stop；预设的 top_p/penalty 不生效。
