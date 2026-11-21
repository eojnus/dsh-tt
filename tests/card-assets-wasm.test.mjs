import test from 'node:test';
import assert from 'node:assert/strict';
import { cardFixture, lorebookFixture, presetFixture, secondCardFixture } from './helpers.mjs';
import { cardAssetsWasm, createCardAssetsWasm } from '../plugin/lib/card-assets-wasm.js';
import { activateEntries, createWorldInfoSession, normalizeCharacterBookEntries } from '../plugin/lib/lorebook.js';
import { normalizeCard } from '../plugin/lib/card.js';
import { extractCardJson, readPngTextChunks } from '../plugin/lib/png.js';
import { runPromptPipeline } from '../plugin/lib/pipeline.js';
import { parsePreset } from '../plugin/lib/prompt.js';
import { splitMessageBlocks } from '../plugin/lib/message-html.js';

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

test('世界书 Rust 激活与 JS 跨回合一致，包括混合 ID、跳过轨迹及预算', () => {
  const entries = [
    ...normalizeCharacterBookEntries(lorebookFixture()),
    { uid: 900, key: ['铁索'], content: '追加➀', insertion_order: 100, sticky: 1, cooldown: 1, group: '候选' },
    { uid: 'chat:900', key: ['(?<=铁)索'], content: '追加➁', useRegex: true, group: '候选', groupWeight: 2, insertion_order: 100 },
    { uid: 901, key: ['铁索'], content: '追加➂', insertion_order: 100, useProbability: true, probability: 35 },
    { uid: 902, constant: true, content: '始终出场 😀', position: 7, outletName: '__proto__', ignoreBudget: true },
  ];
  const state = createWorldInfoSession();
  const referenceState = createWorldInfoSession();
  let activatedInWasm = 0;
  let layouts = 0;
  let actualRolls = 0;
  let referenceRolls = 0;
  const rolls = [0.9, 0.2, 0.6, 0.1];
  const backend = { ...wasm,
    activateLorebook(input, hooks) {
      assert.equal(input.legacySort, true);
      activatedInWasm++;
      const result = wasm.activateLorebook(input, { ...hooks, random: () => rolls[actualRolls++ % rolls.length] });
      assert.ok(result);
      return result;
    },
    layoutLorebookBuckets(input) {
      const result = wasm.layoutLorebookBuckets(input);
      assert.ok(result);
      layouts++;
      return result;
    },
  };
  for (const [turn, scanText, budget] of [[0, '铁索桥和雨声', 1000], [1, '没有命中', 12],
    [2, '铁索桥和铜钱', 25], [3, '铁索桥', 1000]]) {
    state.turn = referenceState.turn = turn;
    const common = { entries, scanText, budget };
    const actual = activateEntries({ ...common, session: state, keywordBackend: backend });
    const expected = activateEntries({ ...common, session: referenceState, keywordBackend: fallback,
      random: () => rolls[referenceRolls++ % rolls.length] });
    assert.deepEqual(actual, expected);
    assert.deepEqual(state, referenceState);
  }
  assert.equal(activatedInWasm, 4);
  assert.equal(layouts, 4);
  assert.equal(actualRolls, referenceRolls);
  assert.ok(actualRolls > 0);
});

test('主聊天 Rust 扫描窗口与提示词计划保留 JS 模板、顺序和深度兼容', () => {
  const card = normalizeCard(cardFixture());
  const preset = parsePreset(presetFixture());
  preset.prompts.push(
    { identifier: 'begin', name: '前半段', content: '<% if (true) { %>起点' },
    { identifier: 'end', name: '后半段', content: '终点<% } %>' },
    { identifier: 'depth', content: '深度注入', injection_position: '1', injection_depth: 2 },
  );
  preset.order = [...preset.order, ...['begin', 'depth', 'end'].map((identifier) => ({ identifier }))];
  const input = { card, preset, chatMessages: ['上一条', '甲出现了'], greeting: '开场白', entries: [
    null, { uid: 'chat:10', key: ['甲'], content: '世界书正文', scanDepth: 1, position: 4, depth: 2 },
  ] };
  const called = new Set();
  const backend = { ...wasm };
  for (const name of ['buildLorebookScanWindows', 'activateLorebook', 'layoutLorebookBuckets', 'planMainPrompt', 'orderPromptDepth']) {
    backend[name] = (...args) => {
      const result = wasm[name](...args);
      assert.ok(result, name);
      called.add(name);
      return result;
    };
  }
  const actual = runPromptPipeline(input, backend);
  const expected = runPromptPipeline(input, fallback);
  for (const key of ['rendered', 'lorebook', 'systemText', 'depthText', 'sectionText', 'errors', 'stats']) {
    assert.deepEqual(actual[key], expected[key], key);
  }
  assert.equal(called.size, 5);
  assert.match(actual.systemText, /起点\s+终点/);
  assert.equal(actual.depthText.includes('深度注入\n\n世界书正文'), true);
});

test('Rust 模板编排按预设顺序调用宿主装饰器，内存增长和异常后仍可接收文本', () => {
  const input = { prompts: [], order: ['worldInfoAfter', 'chatHistory', 'worldInfoBefore']
    .map((identifier) => ({ identifier, enabled: true })) };
  assert.throws(() => wasm.prepareChatTemplates(input, () => { throw new Error('装饰器错误'); }), /装饰器错误/);
  const order = [];
  const large = '世界书😀'.repeat(120000);
  const result = wasm.prepareChatTemplates(input, (source) => {
    order.push(source);
    return source === 'worldInfoAfter' ? large : source;
  });
  assert.deepEqual(order, ['worldInfoAfter', 'authorsNote', 'worldInfoBefore']);
  assert.equal(result.groups[0].content, large);
  assert.equal(result.groups[1].history, true);
  assert.equal(result.groups[2].content, 'authorsNote\n\nworldInfoBefore');
});

test('消息分块的 Rust 路径保留多语言、未闭合围栏和 HTML 判定', () => {
  const samples = [
    '前文 😀\n  ~~~~HTML\n<section>🎭 状态栏</section>\n  ~~~~~\uFEFF\n后文',
    '前文\n```js\n\nconst a = "😀"\n```\n',
    '```html\n\n```\n~~~\n<body>可渲染</body>\n~~~~',
    '没有围栏的故事', '```', '\n```js\n', '````\n```\n🎭\n````',
    '```js\n内容\n```带文字\n剩余内容', '    ```js\n正文\n    ```',
  ];
  assert.ok(wasm.layoutMessageFences(samples[0]));
  for (const text of samples) assert.deepEqual(splitMessageBlocks(text, wasm), splitMessageBlocks(text, fallback));
  assert.equal(wasm.layoutMessageFences('```\n\ud800\n```'), null);
  assert.deepEqual(splitMessageBlocks('```\r特殊换行\n```', wasm), splitMessageBlocks('```\r特殊换行\n```', fallback));
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
