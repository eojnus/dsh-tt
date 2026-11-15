import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cardFixture, secondCardFixture } from './helpers.mjs';
import { createCardLengthPrototype } from '../prototype/wasm-card-length.js';

const wasmPath = path.join(ROOT, 'build/rust-target/wasm32-unknown-unknown/release/dsh_tt_prototype.wasm');
test('WASM 原型：缺失或损坏时回退并保留诊断', () => {
  for (const bytes of [undefined, new Uint8Array([0, 1, 2])]) {
    const p = createCardLengthPrototype(bytes);
    assert.equal(p.mode, 'javascript');
    assert.ok(p.error);
    assert.equal(p.length('中文😀'), 4);
  }
});

test('WASM 原型：角色卡文本长度与 JS 一致', { skip: !fs.existsSync(wasmPath) && '先构建 WASM 原型' }, () => {
  const p = createCardLengthPrototype(fs.readFileSync(wasmPath));
  assert.equal(p.mode, 'wasm', p.error);
  const cards = [cardFixture().data, secondCardFixture()];
  const cases = ['', 'abc', '中文😀', '\ud800', '\udc00', '😀'.repeat(100000), null, 42];
  for (const card of cards) cases.push(card?.description, card?.first_mes, card?.mes_example);
  for (const value of cases) assert.equal(p.length(value), typeof value === 'string' ? value.length : 0);
  assert.equal(p.mode, 'wasm', p.error);
});

test('客户端自检内嵌的 WASM 与构建产物一致', { skip: !fs.existsSync(wasmPath) && '先构建 WASM 原型' }, () => {
  const client = fs.readFileSync(path.join(ROOT, 'plugin/client.js'), 'utf8');
  const encoded = client.match(/const WASM_PROTOTYPE_BASE64 = "([A-Za-z0-9+/=]+)";/)?.[1];
  assert.ok(encoded, '先运行 tools/build-client.mjs');
  assert.deepEqual(Buffer.from(encoded, 'base64'), fs.readFileSync(wasmPath));
  assert.match(client, /浏览器 WASM 原型/);
});
