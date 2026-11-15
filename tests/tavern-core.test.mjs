// 酒馆助手运行时（纯状态层）测试：变量五作用域、消息、事件、宏、世界书。
// src/tavern/core.js 是浏览器里的 IIFE（也兼容 CJS），这里用 vm 在沙箱里执行它，
// 顺便验证"不依赖 DOM 就能跑"这一条。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './helpers.mjs';

const SOURCE = fs.readFileSync(path.join(ROOT, 'src', 'tavern', 'core.js'), 'utf8');

function loadCore() {
  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
    structuredClone,
    Intl,
    Date,
    Math,
    JSON,
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'core.js' });
  return sandbox.module.exports;
}

const TT_CORE = loadCore();

// 跨 realm（vm）产生的对象/数组原型不同：比较前统一 JSON 归一化。
const plain = (value) => JSON.parse(JSON.stringify(value));
const eq = (actual, expected, message) => assert.deepEqual(plain(actual), plain(expected), message);

function makeCore(overrides = {}) {
  const posted = [];
  const core = TT_CORE.createCore({
    card: { name: '青岚', description: '守夜人', character_book: { name: '青岚的世界' } },
    userName: '旅人',
    charName: '青岚',
    chatId: 'chat-1',
    worldbookName: '青岚的世界',
    worldbookEntries: [
      { uid: 1, comment: '灯', content: '铜灯。' },
      { uid: 2, comment: '桥', content: '铁索桥。' },
    ],
    variables: {
      global: { 天气: '雨' },
      character: { 好感: 1 },
      chat: { 回合: 0 },
      preset: { 风格: '短句' },
      script: { 已加载: true },
    },
    post: (message) => posted.push(message),
    ...overrides,
  });
  return { core, posted };
}

test('CJS 导出可用（不含 DOM 依赖）', () => {
  assert.equal(typeof TT_CORE.createCore, 'function');
  assert.equal(typeof TT_CORE.getPath, 'function');
  assert.ok(TT_CORE.TAVERN_EVENTS.MESSAGE_SENT);
});

test('消息镜像：applyChat → getChatMessages 各种 range', () => {
  const { core } = makeCore();
  core.applyChat([
    { role: 'assistant', text: '开场白' },
    { role: 'user', text: '你好' },
    { role: 'assistant', text: '嗯。' },
  ]);
  assert.equal(core.getLastMessageId(), 2);

  const latest = core.getChatMessages('latest');
  assert.equal(latest.length, 1);
  assert.equal(latest[0].message_id, 2);
  assert.equal(String(latest[0].message), '嗯。');

  assert.equal(core.getChatMessages(0).length, 1);
  assert.equal(core.getChatMessages(-1)[0].message_id, 2);
  eq(core.getChatMessages('0-1').map((item) => item.message_id), [0, 1]);

  const users = core.getChatMessages('0-2', { role: 'user' });
  eq(users.map((item) => item.message_id), [1]);

  const withSwipes = core.getChatMessages(2, { include_swipes: true })[0];
  eq(withSwipes.swipes, ['嗯。']);
  assert.equal(withSwipes.swipe_id, 0);
});

test('消息镜像：applyChat 只追加时发 MESSAGE_SENT / MESSAGE_RECEIVED', () => {
  const { core } = makeCore();
  const seen = [];
  core.bus.on(TT_CORE.TAVERN_EVENTS.MESSAGE_SENT, (index) => seen.push(['sent', index]));
  core.bus.on(TT_CORE.TAVERN_EVENTS.MESSAGE_RECEIVED, (index) => seen.push(['received', index]));
  core.applyChat([
    { role: 'user', text: '一' },
    { role: 'assistant', text: '二' },
  ], { emitAdded: true });
  eq(seen, [['sent', 0], ['received', 1]]);
});

test('setChatMessages：编辑正文、写入消息变量、标记 edited', async () => {
  const { core, posted } = makeCore();
  core.applyChat([
    { role: 'assistant', text: '旧正文' },
    { role: 'user', text: '你好' },
  ]);
  await core.setChatMessages([{ message_id: 0, message: '新正文', data: { 心情: '好' } }], { refresh: 'none' });

  const message = core.getChatMessages(0)[0];
  assert.equal(String(message.message), '新正文');
  eq(message.data, { 心情: '好' });

  const touch = posted.filter((item) => item.tt === 'message').at(-1);
  assert.equal(touch.edited, true);
  assert.equal(touch.text, '新正文');
  eq(touch.vars, { 心情: '好' });
});

test('setChatMessages：越界抛错；latest 指向最后一楼', async () => {
  const { core } = makeCore();
  core.applyChat([{ role: 'assistant', text: '只有一楼' }]);
  await assert.rejects(() => core.setChatMessages([{ message_id: 9, message: 'x' }], { refresh: 'none' }));
  await core.setChatMessages([{ message_id: 'latest', message: '改过' }], { refresh: 'none' });
  assert.equal(String(core.getChatMessages('latest')[0].message), '改过');
});

test('createChatMessages / deleteChatMessages / rotateChatMessages', async () => {
  const { core } = makeCore();
  core.applyChat([{ role: 'assistant', text: 'A' }, { role: 'assistant', text: 'B' }]);

  const made = await core.createChatMessages([{ role: 'user', text: '插入' }], { insert_before: 1 });
  eq(made, [1]);
  eq(core.getChatMessages('0-2').map((item) => String(item.message)), ['A', '插入', 'B']);

  await core.rotateChatMessages(0, 1, 3);
  eq(core.getChatMessages('0-2').map((item) => String(item.message)), ['插入', 'B', 'A']);

  await core.deleteChatMessages([1], { refresh: 'none' });
  eq(core.getChatMessages('0-1').map((item) => String(item.message)), ['插入', 'A']);
});

test('变量：五个作用域读写互不影响', () => {
  const { core } = makeCore();
  eq(core.getVariables({ type: 'global' }), { 天气: '雨' });
  eq(core.getVariables({ type: 'character' }), { 好感: 1 });
  eq(core.getVariables({ type: 'preset' }), { 风格: '短句' });
  eq(core.getVariables({ type: 'chat' }), { 回合: 0 });
  eq(core.getVariables({ type: 'script', script_id: '已加载' }), {});

  core.insertOrAssignVariables({ 天气: '晴' }, { type: 'global' });
  core.insertOrAssignVariables({ 好感: 2 }, { type: 'character' });
  eq(core.getVariables({ type: 'global' }), { 天气: '晴' });
  eq(core.getVariables({ type: 'character' }), { 好感: 2 });
  eq(core.getVariables({ type: 'chat' }), { 回合: 0 }, '其他作用域不受影响');
});

test('变量：getVariables 返回副本，改它不影响内部状态', () => {
  const { core } = makeCore();
  const view = core.getVariables({ type: 'chat' });
  view.回合 = 99;
  eq(core.getVariables({ type: 'chat' }), { 回合: 0 });
});

test('变量：replace / updateVariablesWith / deleteVariable（含点路径）', () => {
  const { core } = makeCore();
  core.replaceVariables({ a: 1, b: { c: 2 } }, { type: 'chat' });
  eq(core.getVariables({ type: 'chat' }), { a: 1, b: { c: 2 } });

  core.updateVariablesWith((current) => ({ ...current, a: current.a + 1 }), { type: 'chat' });
  assert.equal(core.getVariables({ type: 'chat' }).a, 2);

  core.deleteVariable('b.c', { type: 'chat' });
  eq(core.getVariables({ type: 'chat' }), { a: 2, b: {} });
});

test('变量：message 作用域按楼层定位', async () => {
  const { core } = makeCore();
  core.applyChat([{ role: 'assistant', text: '一楼', vars: { hp: 10 } }]);
  eq(core.getVariables({ type: 'message', message_id: 0 }), { hp: 10 });
  await core.setChatMessages([{ message_id: 'latest', data: { hp: 7 } }], { refresh: 'none' });
  eq(core.getVariables({ type: 'message', message_id: 'latest' }), { hp: 7 });
});

test('变量写入会 post 到父窗口（含 scope / messageId）', () => {
  const { core, posted } = makeCore();
  core.insertOrAssignVariables({ x: 1 }, { type: 'chat' });
  const last = posted.filter((item) => item.tt === 'vars').at(-1);
  assert.equal(last.scope, 'chat');
  eq(last.value, { 回合: 0, x: 1 });
  assert.ok(last.hash);
});

test('宏：{{char}} / {{user}} / setvar / 注释 / 未注册宏', () => {
  const { core } = makeCore();
  assert.equal(core.substituteMacros('{{char}}对{{user}}说'), '青岚对旅人说');
  assert.equal(core.substituteMacros('{{//注释}}正文'), '正文');
  assert.equal(core.substituteMacros('{{setvar::心情::好}}{{getvar::心情}}'), '好');
  assert.equal(core.substituteMacros('{{不存在的宏}}'), '{{不存在的宏}}');
  assert.equal(core.substituteMacros('<USER>与<CHAR>'), '旅人与青岚');
});

test('宏：registerMacro 自定义宏（含函数）', () => {
  const { core } = makeCore();
  core.registerMacro('我的宏', '固定值');
  core.registerMacro('函数宏', () => '算出来的');
  assert.equal(core.substituteMacros('{{我的宏}}/{{函数宏}}'), '固定值/算出来的');
  core.unregisterMacro('我的宏');
  assert.equal(core.substituteMacros('{{我的宏}}'), '{{我的宏}}');
});

test('宏：lastMessage / lastUserMessage / lastCharMessage', () => {
  const { core } = makeCore();
  core.applyChat([
    { role: 'assistant', text: '开场' },
    { role: 'user', text: '提问' },
    { role: 'assistant', text: '回答' },
  ]);
  assert.equal(core.substituteMacros('{{lastMessage}}'), '回答');
  assert.equal(core.substituteMacros('{{lastUserMessage}}'), '提问');
  assert.equal(core.substituteMacros('{{lastCharMessage}}'), '回答');
  assert.equal(core.substituteMacros('{{lastMessageId}}'), '2');
});

test('世界书：getLorebookEntries / getWorldbook / getWorldbookNames', () => {
  const { core } = makeCore();
  eq(core.getWorldbookNames(), ['青岚的世界']);
  const entries = core.getLorebookEntries();
  assert.equal(entries.length, 2);
  assert.equal(entries[0].comment, '灯');
  const book = core.getWorldbook();
  assert.equal(book.name, '青岚的世界');
  assert.equal(book.entries['1'].content, '铜灯。');
  eq(core.getCharWorldbookNames(), { primary: '青岚的世界', additional: [] });
});

test('事件总线：on / once / makeFirst / remove / emitAndWait', async () => {
  const { core } = makeCore();
  const order = [];
  const listener = () => order.push('normal');
  core.bus.on('demo', listener);
  core.bus.makeFirst('demo', () => order.push('first'));
  core.bus.once('demo', () => order.push('once'));
  core.bus.emit('demo');
  core.bus.emit('demo');
  eq(order, ['first', 'normal', 'once', 'first', 'normal']);

  core.bus.remove('demo', listener);
  order.length = 0;
  core.bus.emit('demo');
  eq(order, ['first']);

  const asyncSeen = [];
  core.bus.on('async', async (value) => { asyncSeen.push(value); });
  await core.bus.emitAndWait('async', 42);
  eq(asyncSeen, [42]);
});

test('事件总线：监听器抛错不会打断其它监听器', () => {
  const { core } = makeCore();
  const seen = [];
  core.bus.on('boom', () => { throw new Error('炸了'); });
  core.bus.on('boom', () => seen.push('ok'));
  assert.doesNotThrow(() => core.bus.emit('boom'));
  eq(seen, ['ok']);
});

test('path 工具：get/set/has/delete 支持点路径与数组下标', () => {
  const target = { a: { b: [1, 2] } };
  assert.equal(TT_CORE.getPath(target, 'a.b.1'), 2);
  assert.equal(TT_CORE.hasPath(target, 'a.b.0'), true);
  TT_CORE.setPath(target, 'a.c', 3);
  assert.equal(target.a.c, 3);
  TT_CORE.deletePath(target, 'a.b');
  assert.equal('b' in target.a, false);
});
