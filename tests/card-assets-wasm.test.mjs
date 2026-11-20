import test from 'node:test';
import assert from 'node:assert/strict';
import { cardFixture, secondCardFixture } from './helpers.mjs';
import { cardAssetsWasm, createCardAssetsWasm } from '../plugin/lib/card-assets-wasm.js';
import { activateEntries } from '../plugin/lib/lorebook.js';
import { normalizeCard } from '../plugin/lib/card.js';
import { extractCardJson, readPngTextChunks } from '../plugin/lib/png.js';

const wasm = cardAssetsWasm();
const fallback = createCardAssetsWasm(new Uint8Array([0, 1, 2]));

test('世界书：Rust 批量匹配与 JS 回退的激活结果一致', () => {
  assert.deepEqual(wasm.matchLorebookKeywords([['中文😀abc', ['😀', 'abc', 'ABC']]]), [[true, true, false]]);
  assert.equal(wasm.matchLorebookKeywords([['\ud800', ['\ud800']]]), null);
  const input = {
    entries: [
      { uid: 1, key: ['中文'], keysecondary: ['AbC'], content: '激活后提到灯塔' },
      { uid: 2, key: ['灯塔'], content: '递归条目' },
      { uid: 3, key: ['ABC'], caseSensitive: true, content: '大小写不匹配' },
      { uid: 4, key: ['abc'], matchWholeWords: true, content: '完整词匹配' },
      { uid: 5, key: ['😀.+?ABC'], useRegex: true, content: 'JavaScript 正则匹配' },
    ],
    scanText: '中文😀 abc',
    budget: 10000,
  };
  const result = activateEntries({ ...input, keywordBackend: wasm });
  assert.deepEqual(result, activateEntries({ ...input, keywordBackend: fallback }));
  assert.deepEqual(result.activated.map((entry) => entry.uid), [1, 4, 5, 2]);
});

test('角色卡归一化：WASM 与 JS 回退一致，保留原卡及扩展引用', () => {
  assert.equal(wasm.mode, 'wasm', wasm.error);
  assert.equal(fallback.mode, 'javascript');
  assert.ok(fallback.error);
  assert.deepEqual(wasm.normalizeText({ name: '', description: false, tags: ['标签😀', 42] }),
    { name: '未命名角色', description: '', tags: ['标签😀'] });
  const v3 = cardFixture();
  const v2 = secondCardFixture();
  v2.tags = ['中文😀', null, 42, ''];
  v2.alternate_greetings = [false, '你好'];
  v2.extensions = { depth_prompt: { depth: '0x10' }, regex_scripts: [null] };
  for (const raw of [v3, v2, {}, undefined, { spec: 'chara_card_v3', data: null, name: 'V2 回退' }]) {
    const card = normalizeCard(raw);
    assert.deepEqual(card, normalizeCard(raw, fallback));
    assert.equal(card.raw, raw);
  }
  const card = normalizeCard(v3);
  assert.equal(card.characterBook, v3.data.character_book);
  assert.equal(card.extensions, v3.data.extensions);
  assert.equal(card.thScripts, v3.data.extensions.tavern_helper.scripts);
  assert.equal(card.regexScripts, v3.data.extensions.regex_scripts);
  assert.equal(normalizeCard(v2).depthPrompt.depth, 16);
});

test('角色卡归一化：JS 独立代理项按原值回退，之后仍可走 WASM', () => {
  const raw = { name: '\ud800', tags: ['\udc00', false] };
  assert.equal(wasm.normalizeText(raw), null);
  assert.deepEqual(normalizeCard(raw), normalizeCard(raw, fallback));
  assert.equal(wasm.mode, 'wasm', wasm.error);
});

function chunk(type, payload = '') {
  const data = Buffer.from(payload, 'utf8');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  return out;
}

function png(...chunks) {
  const bytes = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    ...chunks,
    chunk('IEND'),
  ]);
  const padded = Buffer.concat([Buffer.from([0]), bytes, Buffer.from([1])]);
  return new Uint8Array(padded.buffer, padded.byteOffset + 1, bytes.length);
}

test('PNG 提取：两种文本块、Base64 和优先级在 WASM 与回退一致', () => {
  const v2 = Buffer.from(JSON.stringify({ name: '听雪😀' })).toString('base64url');
  const v3 = { spec: 'chara_card_v3', data: { name: '青岚😀' } };
  const v3Text = JSON.stringify(v3);
  const v3Chunk = chunk('iTXt', `ccv3\0\0\0zh\0角色卡\0${v3Text}`);
  const both = png(v3Chunk, chunk('tEXt', 'chara\0{"name":"旧卡"}'), chunk('tEXt', `chara\0${v2}`));
  assert.equal(wasm.scanPng(both).length, 3);
  for (const backend of [wasm, fallback]) {
    assert.deepEqual(extractCardJson(both, backend), { name: '听雪😀' });
    assert.deepEqual(extractCardJson(png(v3Chunk), backend), v3);
    assert.deepEqual(extractCardJson(png(chunk('tEXt', `CCV3\0${v2}`)), backend), { name: '听雪😀' });
  }
  assert.deepEqual(readPngTextChunks(both, wasm), readPngTextChunks(both, fallback));
});

test('PNG 提取：签名、截断块和压缩块的错误结果一致', () => {
  const broken = chunk('tEXt', 'chara\0{"name":"bad"}');
  broken.writeUInt32BE(0xffffffff);
  const compressed = png(chunk('iTXt', 'ccv3\0\x01\0\0\0data'), broken);
  for (const backend of [wasm, fallback]) {
    assert.throws(() => extractCardJson(new Uint8Array(8), backend), /不是有效的 PNG/);
    assert.throws(() => extractCardJson(compressed, backend), /压缩块 ccv3/);
    assert.deepEqual(readPngTextChunks(png(broken), backend), { chunks: {}, compressed: [] });
  }
});
