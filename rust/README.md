# Rust / WASM 核心

Host 和面板共用内嵌的 WASM，处理 V2/V3 角色卡的文本字段、标签和备选开场白，并扫描 PNG 的 `tEXt`、未压缩 `iTXt` 块。JavaScript 根据块的位置读取原始载荷并解析卡片 JSON。两端按 `chara`、`ccv3`、`Chara`、`CCV3` 的顺序选择载荷，同名块使用最后一份。

归一化后，原始卡对象、世界书和扩展继续以原引用提供。JavaScript 保留 V2/V3 包装层识别和深度字段的 `Number()` 转换语义。若 WASM 无法加载、调用失败，或某条输入含独立 UTF-16 代理项，JS 实现接管该操作。客户端「设置 → 运行自检」会报告浏览器能否加载 WASM 并执行字段归一化。

世界书的历史扫描窗口、普通关键词批量匹配、递归激活、分组、概率、token 预算、回合计时和注入位置分桶均接入了 Rust。JavaScript 负责读取历史和条目字段，执行原有的正则、大小写归一化和装饰器，以及按原顺序提供随机数并写回会话状态。混合数字与字符串 ID 时沿用 JavaScript 的候选排序规则。自定义估算器、外部随机回调和无法传给 WASM 的输入使用原有兼容路径。

预设解析、面板启停、顺序覆盖和酒馆助手预设读写使用同一套 Rust 规则。主聊天由 Rust 选择提示词、处理角色卡覆盖、按消息角色分组，并在对话历史中插入提示词。Rust 按预设顺序调用 JavaScript 的世界书装饰器，保留 EJS 求值与宏渲染。辅助生成的提示词顺序、历史裁剪与深度插入也由 Rust 负责。

Rust 根据 DSH 事件确定聊天楼层、合并历史窗口，并结算实时回复、重试和思考流。DSH 消息与文本片段保留在宿主，由 WASM 返回引用索引，避免复制附件以及破坏跨片段的 Unicode 字符。

脚本注入分类、楼层文本围栏分段和动态楼层模板捕获值编码共用同一 WASM。JavaScript 和 TypeScript 负责 DSH 服务接入、EJS 和宏的执行、浏览器界面及酒馆助手脚本运行接口。

独立扩展的 GitHub 地址、归档索引、清单校验、斜杠命令分词、世界书条目写入和原始生成请求校验由 Rust 负责。DSH 宿主缓存归档并提供认证的文件路由，浏览器在角色扮演会话中加载扩展。

## 构建和验证

首次构建需准备 Rust 1.89.0 或较新版本的工具链，以及对应的 `wasm32-unknown-unknown` 目标。在 Windows 上，Cargo 还需要能链接本机运行的依赖构建脚本。本次用 Windows GNU 工具链完成了构建。

```sh
rustup target add wasm32-unknown-unknown
node tools/build-card-assets-wasm.mjs
node tools/snapshot.mjs
node tools/build-client.mjs
node tests/run.mjs
```

构建脚本编译到 `build/rust-target/`，并更新随仓库分发的 `plugin/lib/card-assets-wasm-bytes.js`。客户端构建把同一份字节带入 `plugin/client.js`。只改 JavaScript 时可以直接复用仓库已有的 WASM，无需安装 Rust。

UTF-16 长度计数保留给 `node tools/benchmark-rust-prototype.mjs` 及其原型测试。生产路径的测试覆盖归一化、PNG 块解析以及 WASM 和 JS 回退的一致性。

## 隔离 DSH 验证（2026-11-15）

使用 DSH 0.2.2-rc.3、独立 `DSH_HOME` 和 `wasm-probe` web profile：将正式插件复制到 build 下，在副本的 Host 入口加载本地 WASM，启动日志确认实例化与计算成功。把同一 WASM 编码进副本客户端 JS 后，从 DSH 的认证插件组合资源取得客户端，解码后的字节与原 WASM 一致。HTTP 页面 200，响应没有 CSP 头，HTML 未发现 CSP meta。验证后已关闭进程并移除测试联接，未操作 desktop profile。

DSH 该版本的客户端资产路由只允许图片扩展名；独立 `.wasm` 不能直接通过该路由发布。内嵌到客户端 JS 是一个已验证传输的候选，尚未验证浏览器执行、Electron 特有策略或用户界面。上述 HTTP 检查也不能代替浏览器实际验证。

隔离 profile 的初始补丁是 `[]`；现有安装器将列表条目追加其后会产生无效 YAML。此次只在隔离 profile 中移除了空数组以继续验证，正式安装器尚未修复。
