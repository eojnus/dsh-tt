# DSH-TT

DSH-TT 是一个为 [DeepSeek Harness](https://www.deepseek.com/harness/en/)（DSH）开发的角色扮演插件，目标是在 DSH 中复现 [SillyTavern](https://docs.sillytavern.app/) 的体验。希望玩家能继续使用熟悉的角色卡、世界书和预设，在 DSH 里开局、续玩，并使用卡片自带的交互界面。

项目的长期目标是全面兼容 SillyTavern 的**插件、扩展、脚本和预设系统**，让现有内容和工作流可以一起迁移。当前版本已打通单人角色扮演的主流程，复杂卡片与扩展的兼容仍在逐项验证。

## 现在可以用什么

| 功能 | 当前支持 |
| --- | --- |
| 角色卡与开局 | 导入 Character Card V2/V3 的 PNG 和 JSON，使用默认或备选开场白，渲染卡片提供的开局界面。 |
| 预设与提示词 | 导入 SillyTavern JSON 预设，查看提示词顺序、逐项启停、预览组装结果。角色卡、预设和激活的世界书条目会随回合进入模型请求。 |
| 世界书 | 支持卡内嵌世界书和会话绑定的独立世界书，以及关键词、递归、分组、概率、预算和回合计时。 |
| 脚本与扩展 | 提供酒馆助手 API 的兼容子集，覆盖部分 MVU 变量接口、脚本按钮、EJS 模板、常用正则和 HTML 状态栏渲染。 |
| 聊天与界面 | 流式正文、独立折叠的思考区、搜索和重命名会话、置顶、批量归档与恢复，以及浅色、白色和深色主题。 |

当前兼容工作包括扩展与脚本 API、预设采样参数映射、主聊天按消息深度注入，以及重抽、剧情分支和 SillyTavern 聊天记录迁移。复杂角色卡的支持程度取决于它使用的脚本和接口。

## 安装与使用

安装流程已在 Windows 版 DeepSeek Harness 中验证。安装 DSH 和 Node.js 24 后，在终端运行以下命令。

```sh
git clone https://github.com/eojnus/dsh-tt.git
cd dsh-tt
node tools/install.mjs install --profile desktop
```

安装器会将本仓库的 `plugin/` 接到 DSH 的 `desktop` 配置，后续请保留仓库目录。**完全退出并重开 DSH**，从侧栏打开「角色扮演」，导入角色卡和预设，再新建对话。使用其他配置时，将 `desktop` 改为对应的配置名。

查看安装状态可运行 `node tools/install.mjs status --profile desktop`。卸载时运行 `node tools/install.mjs uninstall --profile desktop`。

## 开发

Rust 通过 WebAssembly 为 DSH Host 和客户端提供共享的底层实现，包括角色卡字段处理、世界书激活、提示词规划和消息分块。JavaScript 和 TypeScript 负责界面、DSH 会话接入及脚本与模板的兼容，模型配置和会话记录由 DSH 管理。

仓库已包含可安装的客户端和 WASM。修改客户端后，按以下顺序生成快照、构建客户端并运行测试。

```sh
node tools/snapshot.mjs
node tools/build-client.mjs
node tests/run.mjs
```

修改 Rust 代码时，先按 [Rust / WASM 构建说明](rust/README.md) 重新生成 WASM。项目的架构和兼容性设计见 [DESIGN.md](DESIGN.md)。

##目前问题

目前还不能保证实现与SillyTarven一致相同的使用体验，功能支持仍需完善。
