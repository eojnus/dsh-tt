// 世界书高级语义：递归 / sticky / cooldown / delay / inclusion group / outlet / @@activate。
import test from 'node:test';
import assert from 'node:assert/strict';
import { lorebookFixture } from './helpers.mjs';
import {
  activateEntries,
  normalizeCharacterBookEntries,
  createWorldInfoSession,
  WI_POSITION,
} from '../plugin/lib/lorebook.js';
import { applyWorldInfoDecorators } from '../plugin/lib/decorators.js';

function entriesOf() {
  return normalizeCharacterBookEntries(lorebookFixture());
}

function activate(overrides = {}) {
  return activateEntries({
    entries: entriesOf(),
    scanText: '客栈的灯亮着，铜钱在桌上。',
    budget: 100000,
    decorateEntry: (entry) => applyWorldInfoDecorators(entry.content, {}),
    ...overrides,
  });
}

const comments = (lorebook) => lorebook.activated.map((entry) => entry.comment);

test('递归：被激活条目的正文会带出下一条', () => {
  // 「铁索」命中 → 正文含「山门」→ 第二条在同一请求内被带出。
  const once = activate({ scanText: '铁索桥的另一头', recursive: false });
  assert.equal(comments(once).includes('recursion·铁索桥'), true);
  assert.equal(comments(once).includes('recursion·被铁索桥带出来的山门'), false, '不递归时不该被带出');

  const recursive = activate({ scanText: '铁索桥的另一头' });
  assert.equal(comments(recursive).includes('recursion·铁索桥'), true);
  assert.equal(comments(recursive).includes('recursion·被铁索桥带出来的山门'), true, '递归应当带出下一条');
  assert.ok(recursive.stats.recursion >= 1);
});

test('递归：excludeRecursion 的条目不会被递归带出', () => {
  const entries = entriesOf().map((entry) => (entry.comment === 'recursion·被铁索桥带出来的山门'
    ? { ...entry, excludeRecursion: true }
    : entry));
  const result = activate({ entries, scanText: '铁索桥的另一头' });
  assert.equal(comments(result).includes('recursion·铁索桥'), true);
  assert.equal(comments(result).includes('recursion·被铁索桥带出来的山门'), false);
});

test('递归上限：maxRecursionSteps=1 时只扫描一轮', () => {
  const result = activate({ scanText: '铁索桥的另一头', maxRecursionSteps: 1 });
  assert.equal(comments(result).includes('recursion·被铁索桥带出来的山门'), false);
});

test('delay：回合数不足时不激活', () => {
  const session = createWorldInfoSession();
  const early = activate({ session });
  // 「铜钱」命中，但 delay=0；换一条真正带 delay 的：delayUntilRecursion 另测。
  assert.ok(comments(early).includes('outlet·零钱'));

  const entries = entriesOf().map((entry) => (entry.comment === 'outlet·零钱' ? { ...entry, delay: 3 } : entry));
  const session2 = createWorldInfoSession();
  const blocked = activate({ entries, session: session2 });
  assert.equal(comments(blocked).includes('outlet·零钱'), false, 'delay=3 在第 0 回合不该激活');
  session2.turn = 3;
  const allowed = activate({ entries, session: session2 });
  assert.equal(comments(allowed).includes('outlet·零钱'), true, '到第 3 回合应激活');
});

test('delayUntilRecursion：第 N 层递归才放开', () => {
  // 三层链：甲 → 乙 → 丙，按 delayUntilRecursion=2 的条目要到第 3 轮才可见。
  const entries = [
    { uid: 1, comment: '第一层', key: ['甲'], content: '正文里提到乙。', position: 0, enabled: true },
    { uid: 2, comment: '第二层', key: ['乙'], content: '正文里提到丙。', position: 0, enabled: true },
    { uid: 3, comment: '延迟条目', key: ['丙'], content: '延迟条目出现了。', position: 0, enabled: true, delayUntilRecursion: 2 },
  ];
  const shallow = activateEntries({ entries, scanText: '甲', budget: 10000, maxRecursionSteps: 1 });
  assert.equal(shallow.activated.some((item) => item.comment === '延迟条目'), false, '递归上限 1 时不该出现');
  const deep = activateEntries({ entries, scanText: '甲', budget: 10000, maxRecursionSteps: 5 });
  assert.equal(deep.activated.some((item) => item.comment === '延迟条目'), true, '第 2 层递归后应出现');
});

test('sticky：激活后若干回合保持激活，之后回到关键词判定', () => {
  const session = createWorldInfoSession();
  const entries = entriesOf();
  const first = activate({ entries, session, scanText: '雨声在楼梯口' });
  assert.equal(comments(first).includes('sticky·雨声'), true);
  assert.equal(first.activated.find((item) => item.comment === 'sticky·雨声').activatedBy, 'key');

  // 下一回合扫描文本里不再有「雨」：粘滞期内仍然激活。
  session.turn = 1;
  const second = activate({ entries, session, scanText: '无关的文本' });
  const stickyEntry = second.activated.find((item) => item.comment === 'sticky·雨声');
  assert.ok(stickyEntry, '粘滞期内应当仍然激活');
  assert.equal(stickyEntry.activatedBy, 'sticky');

  // 超过 sticky=2 之后失效。
  session.turn = 5;
  const later = activate({ entries, session, scanText: '无关的文本' });
  assert.equal(comments(later).includes('sticky·雨声'), false);
});

test('cooldown：激活后若干回合内不再激活', () => {
  const session = createWorldInfoSession();
  const entries = entriesOf();
  const first = activate({ entries, session, scanText: '客栈的灯' });
  assert.equal(comments(first).includes('cooldown·灯油'), true);

  session.turn = 1;
  const second = activate({ entries, session, scanText: '客栈的灯' });
  assert.equal(comments(second).includes('cooldown·灯油'), false, '冷却期内不该激活');
  assert.ok(second.skipped.some((item) => item.why === 'cooldown'));

  session.turn = 3;
  const third = activate({ entries, session, scanText: '客栈的灯' });
  assert.equal(comments(third).includes('cooldown·灯油'), true, '冷却结束后应能再次激活');
});

test('inclusion group：同组只留 groupWeight 最高的', () => {
  const result = activate();
  const inGroup = result.activated.filter((item) => ['inclusion·短版', 'inclusion·长版'].includes(item.comment));
  assert.equal(inGroup.length, 1, '同组只该留一条');
  assert.equal(inGroup[0].comment, 'inclusion·长版', 'groupWeight 高的胜出');
  assert.ok(result.skipped.some((item) => item.why.startsWith('group:')));
});

test('outlet：命名 outlet 进 outlets 映射', () => {
  const entries = entriesOf().map((entry) => (entry.comment === 'outlet·零钱' ? { ...entry, outletName: '零钱袋' } : entry));
  const result = activate({ entries });
  assert.ok(Array.isArray(result.buckets.outlets['零钱袋']));
  assert.equal(result.buckets.outlets['零钱袋'][0], '铜钱袋里混着一枚旧钱。');
  assert.equal(result.buckets.outlet.length, 0);
});

test('atDepth 分桶按 (depth, role) 分组', () => {
  const result = activate();
  assert.ok(result.buckets.depth.length >= 1);
  const group = result.buckets.depth.find((item) => item.depth === 3);
  assert.ok(group, 'fixture 里的 cooldown·灯油 深度是 3');
  assert.equal(group.role, 'system');
});

test('@@activate：没有关键词也强制激活', () => {
  const entries = [
    { uid: 1, comment: '强制激活', key: [], content: '@@activate\n强制内容', position: 0, enabled: true },
  ];
  const result = activateEntries({ entries, scanText: '没有任何关键词', budget: 1000 });
  assert.equal(result.activated.length, 1);
  assert.equal(result.activated[0].content, '强制内容');
  assert.equal(result.activated[0].activatedBy, 'decorator');
});

test('@@dont_activate：即使 constant 也不激活', () => {
  const entries = [
    { uid: 1, comment: '常量但被禁', key: [], content: '@@dont_activate\n不该出现', position: 0, enabled: true, constant: true },
  ];
  const result = activateEntries({
    entries,
    scanText: '',
    budget: 1000,
    decorateEntry: (entry) => applyWorldInfoDecorators(entry.content, {}),
  });
  assert.equal(result.activated.length, 0);
  assert.ok(result.skipped.some((item) => item.why === 'decorator'));
});

test('统计：跳过原因去重，不会随递归轮翻倍', () => {
  const result = activate({ scanText: '铁索桥的另一头', budget: 1 });
  const reasons = result.skipped.map((item) => item.why);
  const unique = new Set(result.skipped.map((item) => `${item.uid}|${item.why}`));
  assert.equal(reasons.length, unique.size);
});

test('createWorldInfoSession：新的会话状态互不影响', () => {
  const a = createWorldInfoSession();
  const b = createWorldInfoSession();
  a.turn = 5;
  a.entries[1] = { stickyUntil: 9 };
  assert.equal(b.turn, 0);
  assert.deepEqual(Object.keys(b.entries), []);
});
