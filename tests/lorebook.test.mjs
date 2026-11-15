import test from 'node:test';
import assert from 'node:assert/strict';
import { cardFixture, lorebookFixture } from './helpers.mjs';
import { normalizeCard } from '../plugin/lib/card.js';
import {
  activateEntries,
  normalizeCharacterBookEntries,
  normalizeBookEntryPosition,
  WI_POSITION,
  estimateTokens,
} from '../plugin/lib/lorebook.js';
import { applyWorldInfoDecorators } from '../plugin/lib/decorators.js';
import { createEjsScope } from '../plugin/lib/ejs.js';

function bookOf() {
  return normalizeCharacterBookEntries(normalizeCard(cardFixture()).characterBook);
}

function scanText() {
  return '雨夜的客栈里，一盏灯亮着。';
}

test('位置：数字原样，字符串映射 before_char/after_char', () => {
  assert.equal(normalizeBookEntryPosition({ position: 3 }), 3);
  assert.equal(normalizeBookEntryPosition({ position: 'before_char' }), WI_POSITION.before);
  assert.equal(normalizeBookEntryPosition({ position: 'after_char' }), WI_POSITION.after);
  assert.equal(normalizeBookEntryPosition({}), WI_POSITION.before);
});

test('卡内世界书：keys/secondary_keys/insertion_order 归一化', () => {
  const entries = bookOf();
  assert.equal(entries.length, 11);
  const light = entries.find((entry) => entry.comment === '关键词·灯');
  assert.deepEqual(light.key, ['灯']);
  assert.equal(light.uid, 2);
  assert.equal(light.position, WI_POSITION.before);
  const rain = entries.find((entry) => entry.comment === '次级·雨与客栈');
  assert.deepEqual(rain.keysecondary, ['客栈']);
  assert.equal(rain.position, WI_POSITION.after);
  const disabled = entries.find((entry) => entry.comment === '禁用条目');
  assert.equal(disabled.enabled, false);
});

test('独立世界书：对象式 entries 也要能归一化', () => {
  const entries = normalizeCharacterBookEntries(lorebookFixture());
  assert.equal(entries.length, 10);
  const first = entries[0];
  assert.equal(first.uid, 0);
  assert.equal(first.comment, '客栈的规矩');
  assert.deepEqual(first.key, ['客栈']);
  assert.equal(first.position, WI_POSITION.before);
  // 对象式条目的键是索引字符串；顺序必须按 uid 稳定。
  assert.deepEqual(entries.map((entry) => entry.uid).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('激活：恒定 + 主关键词 + 次级逻辑 + 禁用 + 装饰器', () => {
  const lorebook = activateEntries({
    entries: bookOf(),
    scanText: scanText(),
    budget: 100000,
    decorateEntry: (entry) => applyWorldInfoDecorators(entry.content, {}),
  });
  const comments = lorebook.activated.map((entry) => entry.comment);
  assert.ok(comments.includes('恒常·云上山门'), 'constant 应当激活');
  assert.ok(comments.includes('关键词·灯'), '主关键词「灯」应当激活');
  assert.ok(comments.includes('次级·雨与客栈'), '次级关键词同时满足应当激活');
  assert.equal(comments.includes('次级·雨但没有客栈'), false, '次级关键词不满足时不该激活');
  assert.equal(comments.includes('禁用条目'), false, 'enabled=false 不该激活');
  assert.equal(comments.includes('装饰器·不激活'), false, '@@dont_activate 不该激活');
  assert.equal(comments.includes('节庆·元日'), false, '@@if(false) 不该激活');
  assert.ok(comments.includes('装饰器·激活'), '@@activate 应当保留正文');
  const activated = lorebook.activated.find((entry) => entry.comment === '装饰器·激活');
  assert.equal(activated.content.startsWith('@@'), false, '指令行必须被去掉');
});

test('装配：before/after 桶与 unshift 顺序', () => {
  const lorebook = activateEntries({
    entries: bookOf(),
    scanText: scanText(),
    budget: 100000,
    decorateEntry: (entry) => applyWorldInfoDecorators(entry.content, {}),
  });
  // ST 的装配是逐条 unshift，所以最终数组与排序相反。
  assert.equal(lorebook.buckets.before[0].startsWith('那盏铜灯'), true, '插入顺序靠后的条目排在前面');
  assert.ok(lorebook.buckets.before.length >= 2);
  assert.ok(lorebook.buckets.after.length >= 2);
  // 深度桶按 (depth, role) 分组。
  assert.equal(lorebook.buckets.depth.length, 1);
  assert.equal(lorebook.buckets.depth[0].depth, 2);
  assert.equal(lorebook.buckets.depth[0].entries[0], '铁索桥每逢初一十五只开半边。');
});

test('预算：超出即停，ignoreBudget 不受限', () => {
  const entries = bookOf();
  const tight = activateEntries({ entries, scanText: scanText(), budget: 1 });
  assert.equal(tight.stats.overflowed, true);
  assert.equal(tight.stats.activated, 0);

  const withIgnore = entries.map((entry) => (entry.comment === '恒常·云上山门' ? { ...entry, ignoreBudget: true } : entry));
  const result = activateEntries({ entries: withIgnore, scanText: scanText(), budget: 1 });
  assert.equal(result.activated.length, 1);
  assert.equal(result.activated[0].comment, '恒常·云上山门');
});

test('概率：固定随机源可复现，constant 不掷骰', () => {
  const entries = bookOf().map((entry) => (entry.comment === '关键词·灯'
    ? { ...entry, useProbability: true, probability: 30 }
    : entry));
  const denied = activateEntries({ entries, scanText: scanText(), budget: 100000, random: () => 0.9 });
  assert.equal(denied.activated.some((entry) => entry.comment === '关键词·灯'), false);
  const allowed = activateEntries({ entries, scanText: scanText(), budget: 100000, random: () => 0.1 });
  assert.equal(allowed.activated.some((entry) => entry.comment === '关键词·灯'), true);
});

test('宏替换：世界书正文里的 {{//}} 注释要剥掉', () => {
  const lorebook = activateEntries({
    entries: bookOf(),
    scanText: scanText(),
    budget: 100000,
  });
  const entry = lorebook.activated.find((item) => item.comment === '写卡期备忘');
  assert.ok(entry);
  assert.equal(entry.content.includes('{{//'), true, '未走 trim 时注释宏留在正文里，由提示词阶段剥掉');
});

test('装饰器作用域：@@if 能读变量', () => {
  const scope = createEjsScope({ 开关: true });
  assert.equal(applyWorldInfoDecorators('@@if (getvar("开关") === true)\n出现', scope), '出现');
  assert.equal(applyWorldInfoDecorators('@@if (getvar("开关") === false)\n不出现', scope), '');
});

test('token 估算：CJK 与 ASCII 分别计权', () => {
  assert.ok(estimateTokens('测试') >= 1);
  assert.ok(estimateTokens('test') >= 1);
  assert.equal(estimateTokens(''), 0);
});
