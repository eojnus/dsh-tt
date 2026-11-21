# DSH-TT

DSH-TT 是一个为 [DeepSeek Harness](https://www.deepseek.com/harness/en/)（DSH）开发的角色扮演插件，目标是在 DSH 中复现 [SillyTavern](https://docs.sillytavern.app/) 的体验。希望玩家能继续使用熟悉的角色卡、世界书和预设，在 DSH 里开局、续玩，并使用卡片自带的交互界面。

项目的长期目标是全面兼容 SillyTavern 的**插件、扩展、脚本和预设系统**，让现有内容和工作流可以一起迁移。当前版本已打通单人角色扮演的主流程，复杂卡片与扩展的兼容仍在逐项验证。

## 现在可以用什么

| 功能 | 当前支持 |
| --- | --- |
| 角色卡与开局 | 导入 Character Card V2/V3 的 PNG 和 JSON，使用默认或备选开场白，渲染卡片提供的开局界面。 |
| 预设与提示词 | 导入 SillyTavern JSON 预设，逐项启停，并按发送顺序预览消息角色。主聊天支持历史后提示词、世界书与脚本的按深度注入，以及模型支持的助手回复预填充。 |
| 世界书 | 支持卡内嵌世界书和会话绑定的独立世界书，以及关键词、递归、分组、概率、预算和回合计时。 |
| 脚本与扩展 | 可从公开 GitHub 仓库安装 SillyTavern 浏览器扩展。内置酒馆助手兼容接口覆盖部分 MVU、脚本按钮、EJS、常用正则和 HTML 状态栏。 |
| 聊天与界面 | 流式正文、独立折叠的思考区、搜索和重命名会话、置顶、批量归档与恢复，以及浅色、白色和深色主题。 |

主聊天支持预设的温度、最大输出长度和停止词。历史中的系统消息和助手回复预填充取决于模型适配器。DeepSeek Messages 模式支持在指定消息位置更新系统提示词。如果模型或当前位置无法接收系统消息，插件会在原位置发送用户角色指令。

扩展 API、其余预设参数、重抽、剧情分支和 SillyTavern 聊天记录迁移仍在完善。

## 安装与使用

安装流程已在 Windows 版 DeepSeek Harness 中验证。安装 DSH 和 Node.js 24 后，在终端运行以下命令。

```sh
git clone https://github.com/eojnus/dsh-tt.git
cd dsh-tt
node tools/install.mjs install --profile desktop
```

安装器会将本仓库的 `plugin/` 接到 DSH 的 `desktop` 配置，后续请保留仓库目录。**完全退出并重开 DSH**，从侧栏打开「角色扮演」，导入角色卡和预设，再新建对话。使用其他配置时，将 `desktop` 改为对应的配置名。

查看安装状态可运行 `node tools/install.mjs status --profile desktop`。卸载时运行 `node tools/install.mjs uninstall --profile desktop`。

## 安装 SillyTavern 扩展

在「角色扮演 → 扩展 → 第三方扩展」粘贴公开 GitHub 仓库地址，点击「安装并启用」。支持带 `.git` 的仓库地址，使用仓库默认分支。扩展包保存在当前 DSH 配置中。可以在同一列表停用、更新或卸载。打开角色扮演会话后，查看加载状态并点击「打开扩展与脚本界面」。

当前宿主支持扩展清单、JS 模块的相对导入、CSS 和静态资源、部分 SillyTavern 模块与事件、扩展斜杠命令、使用当前 DSH 模型的 `generateRaw`、聊天元数据和当前会话的世界书读写。扩展对角色字段的更改保存在 DSH-TT 本地数据中，角色卡原文件保留。SillyTavern 服务端插件、Extras、自定义模型代理、生成拦截器和完整的酒馆内部界面接口仍待兼容。扩展的加载状态反映入口执行结果。

## 开发

项目优先在 Rust 中实现可共享的业务逻辑，通过 WebAssembly 服务于 DSH 主进程和客户端。角色卡字段处理、世界书激活、预设读写、提示词编排、深度注入、聊天楼层和流式结算都使用这个底层。JavaScript 和 TypeScript 用于 DSH 与浏览器接口、酒馆脚本和 EJS 模板运行。

仓库已包含可安装的客户端和 WASM。修改客户端后，按以下顺序生成快照、构建客户端并运行测试。

```sh
node tools/snapshot.mjs
node tools/build-client.mjs
node tests/run.mjs
```

修改 Rust 代码时，先按 [Rust / WASM 构建说明](rust/README.md) 重新生成 WASM。项目的架构和兼容性设计见 [DESIGN.md](DESIGN.md)。
