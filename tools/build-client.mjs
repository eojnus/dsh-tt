// 把构建期快照注入客户端模板，产出 plugin/client.js。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const template = fs.readFileSync(path.join(root, 'src/client.template.js'), 'utf8');
const snapshotPath = path.join(root, 'build/snapshot.json');
if (!fs.existsSync(snapshotPath)) {
  console.error('缺少 build/snapshot.json，先运行 node tools/snapshot.mjs');
  process.exit(1);
}
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

// 面板只展示摘要：预览裁到 1200 字，避免把整份系统提示词塞进客户端包。
if (snapshot.active) {
  snapshot.active.systemPreview = snapshot.active.systemPreview.slice(0, 1200);
  snapshot.active.truncated = snapshot.active.systemLength > 1200;
}

const literal = JSON.stringify(snapshot, null, 2);
const out = template.replace('__SNAPSHOT__', literal);
fs.writeFileSync(path.join(root, 'plugin/client.js'), out, 'utf8');
console.log(`client.js 已生成（${(out.length / 1024).toFixed(1)} KB，快照 ${(literal.length / 1024).toFixed(1)} KB）`);
