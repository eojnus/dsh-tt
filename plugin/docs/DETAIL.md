# 角色扮演

把 SillyTavern 的资产带进 DeepSeek Harness：角色卡、预设、世界书，以及一套"只聊天"的会话模式。

## 这个插件做什么

- **导入**：直接读取 `参考/` 与 `assets/` 下的 Character Card V2/V3（PNG 的 `chara` / `ccv3` 块，4 MB 级卡也能解）、预设 JSON、世界书 JSON。
- **世界书**：按 SillyTavern 的语义激活——常量、主/次关键词四种逻辑、概率、token 预算、八种插入位置。
- **提示词**：用 ST 的组装顺序生成系统提示词（预设 prompt 顺序 + marker 占位 + 卡字段 + 世界书），宏在渲染时展开。
- **模式**：附带一个 `roleplay` agent preset，不含任何工具，只保留对话与模型。

## 怎么开始

1. 把角色卡（PNG/JSON）、预设、世界书放进工作区的 `assets/` 或 `参考/`。
2. 构建资产快照：`node tools/snapshot.mjs`，再 `node tools/build-client.mjs`。
3. 在 **插件** 里安装本目录，重启后从左侧栏进入「角色扮演」。
4. 新建会话时选择 **角色扮演** 预设。

## 已知边界（v1）

- 只接管 system 段，对话历史仍走 DSH 会话；深度注入（`@depth`）尚未写入消息流。
- 世界书的递归扫描、sticky/cooldown/delay、inclusion group 尚未实现。
- 酒馆助手（TavernHelper）脚本：本期只解析并展示，不执行。
