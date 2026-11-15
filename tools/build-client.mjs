// 把构建期快照、TH 核心、iframe shim 与提示词管线（同构包）注入客户端模板，产出 plugin/client.js。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleLibSource } from './bundle-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const template = fs.readFileSync(path.join(root, 'src/client.template.js'), 'utf8');
const snapshotPath = path.join(root, 'build/snapshot.json');
if (!fs.existsSync(snapshotPath)) {
  console.error('缺少 build/snapshot.json，先运行 node tools/snapshot.mjs');
  process.exit(1);
}
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const coreSource = fs.readFileSync(path.join(root, 'src/tavern/core.js'), 'utf8');
const shimSource = fs.readFileSync(path.join(root, 'src/tavern/shim.js'), 'utf8');
const zodSource = fs.readFileSync(path.join(root, 'src/tavern/zod4.bundle.mjs')).toString('base64');
const wasmPath = path.join(root, 'build/rust-target/wasm32-unknown-unknown/release/dsh_tt_prototype.wasm');
const wasmBase64 = fs.existsSync(wasmPath) ? fs.readFileSync(wasmPath).toString('base64') : '';
const wasmAdapter = fs.readFileSync(path.join(root, 'prototype/wasm-card-length.js'), 'utf8')
  .replace('export function createCardLengthPrototype', 'function createCardLengthPrototype');
const libSource = bundleLibSource();

// 客户端只需要元数据：卡/预设/世界书正文由 workspaceFiles 在运行时按需读取。
// 系统提示词预览留在 build/snapshot.json（已排除出版本库），不注入客户端包。
// 不带 generatedAt：否则每次构建都会让 plugin/client.js 产生一行无意义 diff。
const clientSnapshot = {
  version: snapshot.version,
  roots: snapshot.roots,
  counts: snapshot.counts,
  cards: snapshot.cards,
  presets: snapshot.presets,
  lorebooks: snapshot.lorebooks,
  errors: snapshot.errors,
};

function replaceOnce(source, marker, literal, label) {
  if (!source.includes(marker)) {
    console.error(`模板里找不到${label}占位语句：${marker}`);
    process.exit(1);
  }
  return source.replace(marker, () => literal);
}

let out = template;
out = replaceOnce(out, 'const SNAPSHOT = __SNAPSHOT__;', `const SNAPSHOT = ${JSON.stringify(clientSnapshot)};`, '快照');
out = replaceOnce(out, 'const TAVERN_CORE_SRC = __TAVERN_CORE__;', `const TAVERN_CORE_SRC = ${JSON.stringify(coreSource)};`, 'TH 核心');
out = replaceOnce(out, 'const TAVERN_SHIM_SRC = __TAVERN_SHIM__;', `const TAVERN_SHIM_SRC = ${JSON.stringify(shimSource)};`, 'TH shim');
out = replaceOnce(out, 'const TAVERN_ZOD_SRC = __TAVERN_ZOD__;', `const TAVERN_ZOD_SRC = ${JSON.stringify(zodSource)};`, 'Zod');
out = replaceOnce(out, 'const WASM_PROTOTYPE_BASE64 = __WASM_PROTOTYPE__;', `const WASM_PROTOTYPE_BASE64 = ${JSON.stringify(wasmBase64)};`, 'WASM 原型');
out = replaceOnce(out, '/* __WASM_ADAPTER__ */', wasmAdapter, 'WASM 适配层');
out = replaceOnce(out, 'const TT_LIB_SRC = __TT_LIB__;', `const TT_LIB_SRC = ${JSON.stringify(libSource)};`, '提示词管线');

fs.writeFileSync(path.join(root, 'plugin/client.js'), out, 'utf8');
console.log(
  `client.js 已生成（${(out.length / 1024).toFixed(1)} KB：` +
  `快照 ${(JSON.stringify(clientSnapshot).length / 1024).toFixed(1)} KB、` +
  `核心 ${(coreSource.length / 1024).toFixed(1)} KB、` +
  `shim ${(shimSource.length / 1024).toFixed(1)} KB、` +
  `管线 ${(libSource.length / 1024).toFixed(1)} KB）`,
);
