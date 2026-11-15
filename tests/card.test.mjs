import test from 'node:test';
import assert from 'node:assert/strict';
import { cardFixture, secondCardFixture } from './helpers.mjs';
import { normalizeCard, summarizeCard } from '../plugin/lib/card.js';

test('V3 卡：字段包在 data 里', () => {
  const card = normalizeCard(cardFixture());
  assert.equal(card.spec, 'chara_card_v3');
  assert.equal(card.name, '青岚');
  assert.equal(card.creator, 'dsh-tt 测试夹具');
  assert.match(card.firstMes, /来了/);
  assert.equal(card.alternateGreetings.length, 2);
  assert.equal(card.characterBook.entries.length, 11);
  assert.equal(card.thScripts.length, 2);
  assert.equal(card.regexScripts.length, 2);
  assert.deepEqual(card.tags, ['测试', '古风', '雾雨']);
});

test('V3 卡：depth_prompt 归一化', () => {
  const card = normalizeCard(cardFixture());
  assert.ok(card.depthPrompt);
  assert.equal(card.depthPrompt.depth, 4);
  assert.equal(card.depthPrompt.role, 'system');
  assert.match(card.depthPrompt.prompt, /短句/);
});

test('V2 卡：字段在顶层', () => {
  const card = normalizeCard(secondCardFixture());
  assert.equal(card.spec, 'chara_card_v2');
  assert.equal(card.name, '听雪');
  assert.equal(card.characterBook, null);
  assert.equal(card.thScripts.length, 0);
  assert.equal(card.alternateGreetings.length, 0);
});

test('可选字段缺失时不抛错', () => {
  const card = normalizeCard({});
  assert.equal(card.name, '未命名角色');
  assert.deepEqual(card.alternateGreetings, []);
  assert.equal(card.depthPrompt, null);
});

test('summarizeCard：统计不携带脚本正文', () => {
  const summary = summarizeCard(normalizeCard(cardFixture()));
  assert.equal(summary.name, '青岚');
  assert.equal(summary.counts.lorebookEntries, 11);
  assert.equal(summary.counts.thScripts, 2);
  assert.equal(summary.counts.thScriptsEnabled, 1);
  assert.equal(summary.counts.greetings, 2);
  assert.equal(summary.hasTavernHelper, true);
  assert.equal(summary.worldName, '青岚的世界');
  // 摘要里不能出现卡正文（客户端包只放元数据）。
  assert.equal(JSON.stringify(summary).includes('云上三千尺'), false);
});
