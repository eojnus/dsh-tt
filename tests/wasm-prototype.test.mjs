import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cardFixture, secondCardFixture } from './helpers.mjs';
import { createCardLengthPrototype } from '../prototype/wasm-card-length.js';
import { CARD_ASSETS_WASM_BASE64 } from '../plugin/lib/card-assets-wasm-bytes.js';
import { loadBundledLib } from '../tools/bundle-lib.mjs';

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

test('客户端角色卡 WASM 与 Host 内嵌字节一致', async () => {
  const client = fs.readFileSync(path.join(ROOT, 'plugin/client.js'), 'utf8');
  const encodedSource = client.match(/^    const TT_LIB_SRC = (.+);$/m)?.[1];
  assert.ok(encodedSource, '先运行 tools/build-client.mjs');
  const lib = await loadBundledLib(JSON.parse(encodedSource));
  assert.equal(lib['card-assets-wasm-bytes'].CARD_ASSETS_WASM_BASE64, CARD_ASSETS_WASM_BASE64);
  const wasm = lib['card-assets-wasm'].cardAssetsWasm();
  assert.equal(wasm.mode, 'wasm', wasm.error);
  assert.equal(lib.card.normalizeCard(cardFixture()).name, '青岚');
  assert.match(client, /浏览器角色卡 WASM/);
});

test('发布用 WASM 字节与 Cargo 产物一致', { skip: !fs.existsSync(wasmPath) && '先构建 WASM' }, () => {
  assert.deepEqual(Buffer.from(CARD_ASSETS_WASM_BASE64, 'base64'), fs.readFileSync(wasmPath));
});
