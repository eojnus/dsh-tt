# ST 资产投放目录

把 SillyTavern 的资产放进对应子目录，插件只读、不改原件。

| 目录 | 放什么 | 备注 |
|---|---|---|
| `characters/` | `*.png` 角色卡（V2/V3）、`*.json` 角色卡 | PNG 里的 `chara` / `ccv3` 文本块会被解析 |
| `lorebooks/` | `*.json` 世界书 | ST 的 World Info 导出文件 |
| `presets/` | `*.json` 提示词预设 | 含 Prompt Manager 的那类导出 |
| `chats/` | `*.jsonl` / `*.json` 聊天记录 | ST 的 chat 导出 |
| `regex/` | `*.json` 正则脚本 | 可选 |

注意：
- 这些是个人创作内容，`assets/` 已在 `.gitignore` 中排除，不会被提交或上传。
- 文件名随意，能看懂即可；导入时以卡片内 `name` 为准。
- M0 只需要 `characters/` 里至少一张卡，其他目录可以后补。
