import test from 'node:test';
import assert from 'node:assert/strict';
import { substitute, createMacroEnv } from '../plugin/lib/macros.js';
import { normalizeCard } from '../plugin/lib/card.js';
import { cardFixture } from './helpers.mjs';

const env = () => createMacroEnv({
  card: normalizeCard(cardFixture()),
  userName: '旅人',
  maxPrompt: 1000,
  maxContext: 2000,
});

test('{{char}} / {{user}} / 大小写不敏感', () => {
  assert.equal(substitute('{{char}}对{{user}}说', env()), '青岚对旅人说');
  assert.equal(substitute('{{CHAR}}', env()), '青岚');
});

test('旧式尖括号 <USER> <BOT> <CHAR>', () => {
  assert.equal(substitute('<USER>与<CHAR>', env()), '旅人与青岚');
});

test('{{//注释}}：整段删除（卡内加密备注）', () => {
  assert.equal(substitute('前{{//5f92:eyJjaXBoZXJ0ZXh0}}后', env()), '前后');
  assert.equal(substitute('前{{//多\n行\n注释}}后', env()), '前后');
});

test('{{trim}} 会吃掉两侧换行', () => {
  assert.equal(substitute('a\n\n{{trim}}\n\nb', env()), 'ab');
});

test('{{newline}} 与 {{noop}}', () => {
  assert.equal(substitute('a{{newline}}b', env()), 'a\nb');
  assert.equal(substitute('a{{noop}}b', env()), 'ab');
});

test('变量宏：setvar / addvar / getvar', () => {
  assert.equal(substitute('{{setvar::心情::好}}{{getvar::心情}}', env()), '好');
  assert.equal(substitute('{{setvar::心情::好}}{{addvar::心情::极了}}{{getvar::心情}}', env()), '好极了');
  assert.equal(substitute('{{getvar::没有这个}}', env()), '');
});

test('{{random::a::b}} 与 {{roll:1d6}} 使用注入的随机源', () => {
  assert.equal(substitute('{{random::甲::乙}}', env(), { random: () => 0 }), '甲');
  assert.equal(substitute('{{roll:1d6}}', env(), { random: () => 0 }), '1');
  assert.equal(substitute('{{roll:1d6}}', env(), { random: () => 0.999 }), '6');
});

test('时间宏使用注入的 now', () => {
  const now = new Date('2026-11-15T09:05:00+08:00');
  const out = substitute('{{isotime}}|{{isodate}}', env(), { now });
  assert.equal(out, '09:05|2026-11-15');
});

test('{{reverse:…}} 与未知宏', () => {
  assert.equal(substitute('{{reverse:abc}}', env()), 'cba');
  assert.equal(substitute('{{不存在的宏}}', env()), '{{不存在的宏}}');
});
