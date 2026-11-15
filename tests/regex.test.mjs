// ST 正则脚本：解析、作用域过滤与 Host 侧应用。
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardFixture, presetFixture } from './helpers.mjs';
import {
  REGEX_PLACEMENT,
  compileFindRegex,
  normalizeRegexRule,
  normalizeRegexRules,
  collectRegexRules,
  isRuleApplicable,
  applyRegexScripts,
  applyWorldInfoRegex,
  applyUserInputRegex,
} from '../plugin/lib/regex.js';

test('compileFindRegex：支持 /pattern/flags 与裸字符串', () => {
  const re = compileFindRegex('/【[^】]*】/g');
  assert.equal(re.test('【提示】正文'), true);
  const plain = compileFindRegex('\\.\\.\\.');
  assert.equal(plain.test('a...b'), true);
  assert.equal(compileFindRegex('('), null, '非法正则返回 null 而不是抛错');
  assert.equal(compileFindRegex(''), null);
});

test('normalizeRegexRule：字段名兼容与默认值', () => {
  const rule = normalizeRegexRule({ scriptName: '去提示', findRegex: '/x/g', placement: [2], markdownOnly: true }, 0);
  assert.equal(rule.name, '去提示');
  assert.deepEqual(rule.placement, [2]);
  assert.equal(rule.markdownOnly, true);
  assert.equal(rule.promptOnly, false);
  assert.equal(rule.disabled, false);

  const disabled = normalizeRegexRule({ name: 'a', enabled: false }, 1);
  assert.equal(disabled.disabled, true);
  assert.equal(normalizeRegexRule(null), null);
});

test('placement 过滤：只作用于声明的位置', () => {
  const rules = normalizeRegexRules([
    { scriptName: 'user', findRegex: '/A/g', replaceString: 'a', placement: [1] },
    { scriptName: 'ai', findRegex: '/B/g', replaceString: 'b', placement: [2] },
    { scriptName: 'wi', findRegex: '/C/g', replaceString: 'c', placement: [5] },
  ]);
  const text = 'ABC';
  assert.equal(applyRegexScripts(text, rules, REGEX_PLACEMENT.USER_INPUT, { isPrompt: true }), 'aBC');
  assert.equal(applyRegexScripts(text, rules, REGEX_PLACEMENT.AI_OUTPUT, { isPrompt: true }), 'AbC');
  assert.equal(applyWorldInfoRegex(text, rules), 'ABc');
  assert.equal(applyUserInputRegex(text, rules), 'aBC');
});

test('prompt 侧跳过只用于显示的规则；显示侧跳过只用于提示词的规则', () => {
  const displayOnly = normalizeRegexRule({ scriptName: 'd', findRegex: '/X/g', replaceString: 'x', placement: [2], markdownOnly: true }, 0);
  const promptOnly = normalizeRegexRule({ scriptName: 'p', findRegex: '/X/g', replaceString: 'y', placement: [2], promptOnly: true }, 1);
  const both = normalizeRegexRule({ scriptName: 'b', findRegex: '/X/g', replaceString: 'z', placement: [2], promptOnly: true, markdownOnly: true }, 2);

  assert.equal(isRuleApplicable(displayOnly, 2, { isPrompt: true }), false);
  assert.equal(isRuleApplicable(displayOnly, 2, { isPrompt: false }), true);
  assert.equal(isRuleApplicable(promptOnly, 2, { isPrompt: true }), true);
  assert.equal(isRuleApplicable(promptOnly, 2, { isPrompt: false }), false);
  assert.equal(isRuleApplicable(both, 2, { isPrompt: true }), true);
  assert.equal(isRuleApplicable(both, 2, { isPrompt: false }), true);
});

test('minDepth / maxDepth 生效（给出 depth 时）', () => {
  const rule = normalizeRegexRule({ scriptName: 'r', findRegex: '/X/g', replaceString: 'y', placement: [2], minDepth: 2, maxDepth: 4 }, 0);
  assert.equal(isRuleApplicable(rule, 2, { isPrompt: true, depth: 1 }), false);
  assert.equal(isRuleApplicable(rule, 2, { isPrompt: true, depth: 3 }), true);
  assert.equal(isRuleApplicable(rule, 2, { isPrompt: true, depth: 5 }), false);
  assert.equal(isRuleApplicable(rule, 2, { isPrompt: true }), true, '没给 depth 时不限制');
});

test('disabled 的规则不执行', () => {
  const rules = normalizeRegexRules([{ scriptName: 'off', findRegex: '/A/g', replaceString: 'z', placement: [1], disabled: true }]);
  assert.equal(applyUserInputRegex('ABC', rules), 'ABC');
});

test('替换串里的 $1 / $& 按 JS 语义生效', () => {
  const rules = normalizeRegexRules([{ scriptName: 'cap', findRegex: '/(\\w+)@(\\w+)/g', replaceString: '$2@$1', placement: [1] }]);
  assert.equal(applyUserInputRegex('me@host', rules), 'host@me');
});

test('collectRegexRules：卡与预设都收、按 id+内容去重', () => {
  const card = cardFixture();
  const preset = presetFixture();
  const rules = collectRegexRules(card, preset);
  assert.equal(rules.length, 2, '夹具卡里有 2 条，预设里没有');
  assert.equal(rules.some((rule) => rule.name === '把省略号换成全角'), true);
});

test('出错不影响其余规则（收集 onError）', () => {
  const bad = normalizeRegexRule({ scriptName: 'bad', findRegex: '/[/g', placement: [1] }, 0);
  const good = normalizeRegexRule({ scriptName: 'good', findRegex: '/A/g', replaceString: 'a', placement: [1] }, 1);
  assert.equal(applyUserInputRegex('ABC', [bad, good]), 'aBC');
});
