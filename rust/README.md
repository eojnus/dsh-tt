# Rust / WASM 原型（阶段 0–1）

本目录是独立实验，不替换现有功能。构建时若 WASM 产物存在，会内嵌客户端供设置页手动自检，其他时候不运行。原型只实现角色卡文本的 UTF-16 长度计数，检验 Rust/WASM ABI、Unicode 及 JS 回退；它不代表完整角色卡归一化。

## 构建和验证

在 Windows PowerShell 中，使用本机独立工具链：

```powershell
. C:\coding\rust-toolchain\env.ps1
cargo build --manifest-path rust/prototype/Cargo.toml --target wasm32-unknown-unknown --release --target-dir build/rust-target --offline
$node = 'C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
& $node tests/run.mjs
& $node tools/check.mjs
& $node tools/benchmark-rust-prototype.mjs
```

产物在被忽略的 `build/rust-target/`；运行 `tools/build-client.mjs` 会将其内嵌客户端用于手动自检。如果未构建 WASM，客户端自检会报告未包含原型，WASM 一致性测试会明确跳过；损坏和缺失的回退测试仍执行。基准使用本地参考资产（若存在），只输出时长、大小和计数，不输出卡片内容。结果受机器负载、预热和输入影响；内存是进程快照，不是峰值。

## 限制

适配层接受 WASM 字节并同步初始化，失败或执行异常时回退 JS 并保留错误；插件只在手动自检时调用它。Node 测试和下述隔离 DSH 检查不等于实际浏览器运行验证。计数只是 ABI 原型，不包含完整管线或性能加速。Windows 原生目标仍需 MSVC 链接工具。

## 隔离 DSH 验证（2026-11-15）

使用 DSH 0.2.2-rc.3、独立 `DSH_HOME` 和 `wasm-probe` web profile：将正式插件复制到 build 下，在副本的 Host 入口加载本地 WASM，启动日志确认实例化与计算成功。把同一 WASM 编码进副本客户端 JS 后，从 DSH 的认证插件组合资源取得客户端，解码后的字节与原 WASM 一致。HTTP 页面 200，响应没有 CSP 头，HTML 未发现 CSP meta。验证后已关闭进程并移除测试联接，未操作 desktop profile。

DSH 该版本的客户端资产路由只允许图片扩展名；独立 `.wasm` 不能直接通过该路由发布。内嵌到客户端 JS 是一个已验证传输的候选，尚未验证浏览器执行、Electron 特有策略或用户界面。上述 HTTP 检查也不能代替浏览器实际验证。

隔离 profile 的初始补丁是 `[]`；现有安装器将列表条目追加其后会产生无效 YAML。此次只在隔离 profile 中移除了空数组以继续验证，正式安装器尚未修复。
