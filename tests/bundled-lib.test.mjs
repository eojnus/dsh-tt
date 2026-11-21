// 同构包与 Host 模块的一致性：同一份源码在两边各跑一次，输出必须逐字相同。
// 有了这个测试，面板里的"发送前预览"才敢说与实际请求一致。
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardFixture, presetFixture, lorebookFixture } from './helpers.mjs';
import { bundleLibSource, loadBundledLib, transformModule, MODULES } from '../tools/bundle-lib.mjs';
import * as hostPipeline from '../plugin/lib/pipeline.js';
import * as hostCard from '../plugin/lib/card.js';
import * as hostPrompt from '../plugin/lib/prompt.js';
import * as hostDecorators from '../plugin/lib/decorators.js';
import * as hostLorebook from '../plugin/lib/lorebook.js';
import * as hostRegex from '../plugin/lib/regex.js';

const bundled = await loadBundledLib();

test('同构包：模块齐全，且不含 node: 依赖', () => {
  for (const name of MODULES) assert.ok(bundled[name], `缺少模块 ${name}`);
  const source = bundleLibSource();
  assert.equal(/from\s*['"]node:/.test(source), false);
  assert.equal(/require\(['"]node:/.test(source), false);
  // 生成物必须是纯脚本（可被 new Function 执行，不依赖 import/export 语法）
  assert.equal(/^\s*import\s/m.test(source), false);
  assert.equal(/^\s*export\s/m.test(source), false);
});

test('聊天楼层与世界书历史排除系统事件、原生推理和内部绑定数据', () => {
  const { packChatInput, toChatFloors } = bundled['chat-wire'];
  const input = packChatInput('玩家正文', { presetJson: { name: '内部预设' }, worldInfoHistory: ['内部历史'] });
  const floors = toChatFloors([
    { type: 'event', event: { type: 'system/message', data: { content: '仅供模型使用' } } },
    { type: 'user/message', data: { source: { kind: 'runtime-context' }, content: 'DSH 运行时上下文' } },
    { type: 'user/message', seq: 1, data: { content: [{ text: input.slice(0, 10) }, { text: input.slice(10) }] } },
    { type: 'user/message', seq: 2, data: { content: '\u0000TT\u0000未完成的内部数据' } },
    { type: 'assistant/message', seq: 3, data: { message: { content: '正常回复' } } },
    { type: 'assistant/message', seq: 4, data: { message: { content: [
      { type: 'reasoning', text: '原生推理' }, { type: 'text', text: '正文' },
      { type: 'tool-call', text: '内部调用' }, { type: 'text', text: '<UpdateVariable>脚本数据</UpdateVariable>' },
    ] } } },
  ]);
  assert.deepEqual(floors.map(({ role, text }) => [role, text]), [
    ['user', '玩家正文'],
    ['assistant', '正常回复'],
    ['assistant', '正文<UpdateVariable>脚本数据</UpdateVariable>'],
  ]);
});

test('Rust 用回合和步骤结算实时回复，聊天正文和思考保留原始分片', () => {
  const { liveAssistantReply, mergeChatFloors } = bundled['chat-wire'];
  const chunk = (attemptId, type, text) => ({ type: 'assistant/live-chunk', time: 3,
    data: { turn: 1, step: 2, attemptId, chunk: { type, text } } });
  const aborted = { type: 'assistant/attempt', data: { turn: 1, step: 2 } };
  const retry = [
    chunk('old', 'text-delta', '旧回复'), aborted, chunk('new', 'reasoning-delta', '单独的推理'),
    chunk('new', 'text-delta', '\ud83d'), chunk('new', 'text-delta', '\ude00'),
    { type: 'step/end', data: { turn: 1, step: 1 } },
  ];
  assert.deepEqual(liveAssistantReply(retry), { attemptId: 'new', key: 'reply-1-2', time: 3, text: '😀', reasoning: '单独的推理' });
  assert.equal(liveAssistantReply([...retry, { type: 'assistant/message', data: { turn: 1, step: 2 } }]), null);
  const old = [1, 2, 3, 4].map((seq) => ({ seq, text: '旧内容' }));
  const recent = [2, 3].map((seq) => ({ seq, text: '新内容' }));
  assert.deepEqual(mergeChatFloors(old, recent, 3), [...recent, old[3]]);
});

test('transformModule：具名导出被识别，相对导入被改写', () => {
  const { body, exported } = transformModule('demo', `
    import { a, b } from './other.js';
    export function alpha(x) { return a(x) + b(x); }
    export const beta = 2;
  `);
  assert.deepEqual(exported, ['alpha', 'beta']);
  assert.match(body, /const \{ a, b \} = __require\('other'\);/);
  assert.equal(/export /.test(body), false);
});

test('卡归一化：两边结构一致', () => {
  const raw = cardFixture();
  const host = hostCard.normalizeCard(raw);
  const client = bundled.card.normalizeCard(raw);
  assert.deepEqual(JSON.parse(JSON.stringify(client)), JSON.parse(JSON.stringify(host)));
});

test('世界书激活：两边一致（含装饰器与正则）', () => {
  const card = bundled.card.normalizeCard(cardFixture());
  const entries = bundled.lorebook.normalizeCharacterBookEntries(card.characterBook);
  const hostEntries = hostLorebook.normalizeCharacterBookEntries(hostCard.normalizeCard(cardFixture()).characterBook);
  const decorate = (entry) => hostDecorators.applyWorldInfoDecorators(entry.content, {});
  const shared = { scanText: '雨夜的客栈，一盏灯，铁索桥的另一头。', budget: 100000, decorateEntry: decorate };
  const clientResult = bundled.lorebook.activateEntries({ ...shared, entries });
  const hostResult = hostLorebook.activateEntries({ ...shared, entries: hostEntries });
  assert.equal(clientResult.stats.activated, hostResult.stats.activated);
  assert.deepEqual(
    clientResult.activated.map((item) => `${item.uid}:${item.position}:${item.content.length}`),
    hostResult.activated.map((item) => `${item.uid}:${item.position}:${item.content.length}`),
  );
  assert.deepEqual(
    clientResult.skipped.map((item) => `${item.uid}:${item.why}`),
    hostResult.skipped.map((item) => `${item.uid}:${item.why}`),
  );
});

test('完整管线：同构包与 Host 逐字一致（含变量/开场白/正则）', () => {
  const cardRaw = cardFixture();
  const presetRaw = presetFixture();
  const input = {
    variables: { 天气: '雨', stat_data: { 好感: 3 } },
    greeting: '「……来了。」',
    userName: '旅人',
    maxContext: 128000,
    worldInfoBudget: 50000,
  };

  const host = hostPipeline.runPromptPipeline({
    ...input,
    card: hostCard.normalizeCard(cardRaw),
    preset: hostPrompt.parsePreset(presetRaw),
  });
  const client = bundled.pipeline.runPromptPipeline({
    ...input,
    card: bundled.card.normalizeCard(cardRaw),
    preset: bundled.prompt.parsePreset(presetRaw),
  });

  assert.equal(client.systemText, host.systemText);
  assert.equal(client.depthText, host.depthText);
  assert.equal(client.sectionText, host.sectionText);
  assert.deepEqual(client.stats, host.stats);
  assert.deepEqual(client.errors, host.errors);
});

test('完整管线：对象式世界书与预设覆盖也一致', () => {
  const bookEntries = hostLorebook.normalizeCharacterBookEntries(lorebookFixture());
  const presetBase = hostPrompt.parsePreset(presetFixture());
  const preset = hostPrompt.applyPresetOverrides(presetBase, { prompts: { main: false } });
  const card = hostCard.normalizeCard(cardFixture());

  const host = hostPipeline.runPromptPipeline({
    card, preset, entries: bookEntries, maxContext: 64000, worldInfoBudget: 20000,
  });
  const client = bundled.pipeline.runPromptPipeline({
    card: bundled.card.normalizeCard(cardFixture()),
    preset: bundled.prompt.applyPresetOverrides(bundled.prompt.parsePreset(presetFixture()), { prompts: { main: false } }),
    entries: bundled.lorebook.normalizeCharacterBookEntries(lorebookFixture()),
    maxContext: 64000,
    worldInfoBudget: 20000,
  });
  assert.ok(host.systemText.length > 0);
  assert.equal(client.systemText, host.systemText);
  assert.equal(client.stats.worldInfo.activated, host.stats.worldInfo.activated);
});

test('正则：两边对同一段文本结果一致', () => {
  const rules = hostRegex.collectRegexRules(cardFixture(), presetFixture());
  const clientRules = bundled.regex.collectRegexRules(cardFixture(), presetFixture());
  assert.deepEqual(JSON.parse(JSON.stringify(clientRules)), JSON.parse(JSON.stringify(rules)));
  const text = '他说...好【提示】正文';
  assert.equal(
    bundled.regex.applyUserInputRegex(text, clientRules),
    hostRegex.applyUserInputRegex(text, rules),
  );
});
