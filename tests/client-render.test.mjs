// 客户端面板冒烟测试：用极简 React 实现把 plugin/client.js 的 Panel 渲染一遍。
//
// 目的：在没有浏览器的环境里抓住语法错误、未定义变量、首屏渲染异常。
// 不执行 useEffect（避免发起真实 RPC），也不模拟交互。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, cardFixture, presetFixture } from './helpers.mjs';

const CLIENT = path.join(ROOT, 'plugin', 'client.js');

function makeReact() {
  const effects = [];
  const createElement = (type, props, ...children) => ({
    type,
    props: { ...(props || {}), children: children.length ? children : (props ? props.children : undefined) },
  });

  class Component {
    constructor(props) {
      this.props = props;
      this.state = {};
    }
    setState(patch) {
      this.state = { ...this.state, ...(typeof patch === 'function' ? patch(this.state) : patch) };
    }
  }
  Component.prototype.isReactComponent = true;

  const React = {
    createElement,
    Component,
    Fragment: 'fragment',
    useState(initial) {
      const value = typeof initial === 'function' ? initial() : initial;
      return [value, () => { /* 冒烟测试不重渲染 */ }];
    },
    useRef(initial) { return { current: initial }; },
    useMemo(factory) { return factory(); },
    useCallback(fn) { return fn; },
    useEffect(fn) { effects.push(fn); return undefined; },
    useLayoutEffect(fn) { effects.push(fn); return undefined; },
  };
  return { React, effects };
}

/** 只渲染一次（不重渲染、不跑 effect）。 */
function renderTree(node, React) {
  if (node == null || node === false || node === true) return null;
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((child) => renderTree(child, React));
  const { type, props } = node;
  if (type === 'fragment') return renderTree(props?.children, React);
  if (typeof type === 'function') {
    if (type.prototype && type.prototype.isReactComponent) {
      const instance = new type(props);
      instance.props = props;
      if (instance.state === undefined) instance.state = {};
      return renderTree(instance.render(), React);
    }
    return renderTree(type(props), React);
  }
  return { tag: type, props, children: renderTree(props?.children, React) };
}

/** 收集渲染树里的文本（用于断言页签内容）。 */
function collectText(node) {
  if (node == null || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node) + '\n';
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (node.tag === 'style') return '';
  if (typeof node === 'object' && node.children !== undefined) return collectText(node.children);
  return '';
}

function findTags(tree, tag) {
  if (Array.isArray(tree)) return tree.flatMap((item) => findTags(item, tag));
  if (!tree || typeof tree !== 'object') return [];
  return [...(tree.tag === tag ? [tree] : []), ...findTags(tree.children, tag)];
}

test('client.js：每个页签都能渲染（含预览/正则/设置/扩展）', async () => {
  const source = fs.readFileSync(CLIENT, 'utf8');
  let captured = null;
  const stubs = {
    window: { __ModuleLoader__: { load(definition) { captured = definition; } } },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  const saved = {};
  for (const key of Object.keys(stubs)) {
    saved[key] = globalThis[key];
    globalThis[key] = stubs[key];
  }
  try {
    await import(pathToFileURL(CLIENT).href + '?views=' + Date.now());
    const { React } = makeReact();
    const useState = React.useState;
    let fixtures;
    let stateIndex = 0;
    React.useState = (initial) => useState(fixtures?.get(++stateIndex) ?? initial);
    const module = captured.factory((name) => {
      if (name === 'react') return React;
      throw new Error('意外的 require：' + name);
    });
    const registered = [];
    const ctx = {
      remote: {},
      slots: {
        inject(slot, produce) { registered.push({ slot, produce }); },
        // 与宿主一致：register(slotProps, component) 返回登记句柄；
        // 真正的渲染元素 = component(slotProps)。
        register(slotProps, component) { return { slotProps, component }; },
      },
    };
    module.apply(ctx);
    const main = registered.find((item) => item.slot === 'main');
    assert.ok(main);

    for (const view of ['chat', 'cards', 'lore', 'presets', 'preview', 'regex', 'extensions', 'settings']) {
      const registration = main.produce();
      assert.ok(registration && registration.component, `页签 ${view}：main 槽位应当登记组件`);
      const tree = renderTree(registration.component({ __initialView: view }), React);
      assert.ok(tree, `页签 ${view} 应当渲染出元素树`);
      const text = collectText(tree);
      assert.ok(text.length > 38, `页签 ${view} 的渲染结果看起来是空的（${text.length} 字）`);
      if (view === 'preview') assert.match(text, /发送前预览/);
      if (view === 'regex') assert.match(text, /正则脚本/);
      if (view === 'settings') assert.match(text, /设置与诊断/);
      if (view === 'presets') assert.match(text, /预设/);
      if (view === 'chat') assert.match(text, /新建对话|对话/);
    }
    const raw = cardFixture();
    const replacement = '```html\n<body><div id="status-panel">状态栏</div></body>\n```';
    raw.data.extensions.regex_scripts = [
      { placement: [2], markdownOnly: true, findRegex: '<StatusPlaceHolderImpl/>', replaceString: replacement },
    ];
    const preset = presetFixture();
    preset.extensions.regex_scripts = [
      { placement: [2], markdownOnly: true, findRegex: '<PresetStatus/>', replaceString: '<StatusPlaceHolderImpl/>' },
      { placement: [2], markdownOnly: true, findRegex: '<PresetPanel/>', replaceString: '```html\n<body><div id="preset-panel">预设界面</div></body>\n```' },
    ];
    localStorage.getItem = (key) => key === 'dsh-tt:v3' ? JSON.stringify({
      cards: [{ id: 'fixture-card', name: '青岚', raw }],
      presets: [{ id: 'fixture-preset', name: '测试预设', raw: preset }],
      lorebooks: [{ id: 'fixture-lorebook', name: '本局设定', raw: { entries: [{ content: '剧情信息' }] } }],
      activeCardId: 'fixture-card',
      activePresetId: 'fixture-preset',
      sessionMeta: { 'fixture-chat': { cardId: 'fixture-card', presetId: 'fixture-preset',
        lorebookId: 'fixture-lorebook', greeting: '开场白\n\n<PresetStatus/>' } },
    }) : null;
    fixtures = new Map([
      [4, 'fixture-chat'],
      [5, [{ id: 'floor', role: 'assistant', text: '正文\n\n<PresetStatus/>\n\n<PresetPanel/>' }]],
    ]);
    const registration = main.produce();
    const selected = renderTree(registration.component({ __initialView: 'chat' }), React);
    const frames = findTags(selected, 'iframe');
    assert.equal(frames.length, 3, '应渲染两个联动状态栏和一个预设界面');
    for (const frame of frames) {
      assert.equal(frame.props.sandbox, 'allow-scripts');
    }
    assert.match(frames[0].props.srcDoc, /<div id="status-panel">状态栏/);
    assert.match(frames[1].props.srcDoc, /<div id="status-panel">状态栏/);
    assert.match(frames[2].props.srcDoc, /<div id="preset-panel">预设界面/);
    assert.match(collectText(selected), /正文/);
    stateIndex = 0;
    const lore = renderTree(registration.component({ __initialView: 'lore' }), React);
    assert.match(collectText(lore), /本局世界书/);
    assert.ok(findTags(lore, 'select').some((select) => select.props.value === 'fixture-lorebook'));
    assert.ok(source.includes('dsh-tt:v3'));
  } finally {
    for (const key of Object.keys(saved)) globalThis[key] = saved[key];
  }
});

test('client.js：模块注册、apply 注册槽位、Panel 首屏可渲染', async () => {
  assert.ok(fs.existsSync(CLIENT), 'plugin/client.js 不存在，先运行 node tools/build-client.mjs');
  const source = fs.readFileSync(CLIENT, 'utf8');
  let captured = null;
  const stubs = {
    window: { __ModuleLoader__: { load(definition) { captured = definition; } } },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  const saved = {};
  for (const key of Object.keys(stubs)) {
    saved[key] = globalThis[key];
    globalThis[key] = stubs[key];
  }
  try {
    await import(pathToFileURL(CLIENT).href + '?smoke=' + Date.now());
    assert.ok(captured, 'client.js 应当调用 window.__ModuleLoader__.load');
    assert.equal(captured.id, '@dsh-tt/roleplay');

    const { React } = makeReact();
    const module = captured.factory((name) => {
      if (name === 'react') return React;
      throw new Error('意外的 require：' + name);
    });
    assert.ok(Array.isArray(module.inject));
    assert.ok(module.inject.includes('slots'));

    const registered = [];
    const ctx = {
      remote: {},
      slots: {
        inject(slot, produce) { registered.push({ slot, produce }); },
        register(slotProps, component) { return { slotProps, component, dispose() {} }; },
      },
    };
    module.apply(ctx);
    assert.equal(registered.length, 2, '应当注册 main 与 sidebar.panellist 两个入口');
    const main = registered.find((item) => item.slot === 'main');
    const sidebar = registered.find((item) => item.slot === 'sidebar.panellist');
    assert.ok(main && sidebar);

    const iconRegistration = sidebar.produce();
    const icon = renderTree(iconRegistration.component(iconRegistration.slotProps), React);
    assert.ok(icon, '侧栏图标应当渲染');

    const registration = main.produce();
    assert.ok(registration && registration.component, 'main 槽位应当登记组件');
    const tree = renderTree(registration.component(registration.slotProps || {}), React);
    assert.ok(tree, 'Panel 应当产出元素树');
    assert.match(collectText(tree), /角色扮演|对话|角色/, '首屏应当有面板文本');
    assert.ok(source.includes('dsh-tt:v3'), '客户端包应当带主 store 键');
  } finally {
    for (const key of Object.keys(saved)) globalThis[key] = saved[key];
  }
});

test('新局直接渲染作者默认开场，可在对话开始前主动切换', async () => {
  const raw = cardFixture();
  raw.data.first_mes = '【主页】\n';
  raw.data.alternate_greetings = ['剧情开场甲', '剧情开场乙'];
  raw.data.extensions.regex_scripts = [{
    placement: [2], markdownOnly: true, findRegex: '【主页】',
    replaceString: '```html\n<body><main id="card-home">卡片主页</main><script>window.parent.DreamRpg;</script></body>\n```',
  }, {
    placement: [1], markdownOnly: true, findRegex: '<rpg_ans>([^<]+)</rpg_ans>',
    replaceString: '<style>.drpg-action { color: blue; }</style><span class="drpg-action" data-drpg-answer>$1</span>',
  }];
  raw.data.extensions.tavern_helper = { scripts: [
    { id: 'rpg', type: 'script', name: '梦境 RPG', content: 'window.parent.DreamRpg = {};', enabled: true },
  ] };
  const card = { id: 'card-1', name: '测试角色', filePath: 'card.json' };
  const states = new Map();
  const refs = [];
  const reads = [];
  let stateIndex;
  let refIndex;
  let sessions = 0;
  let history = [];
  let failPrompt = true;
  const prompts = [];
  let liveEntries = [];
  let running = false;
  let retainedId;
  let released = 0;
  let cleanupFeed;
  const feedListeners = new Set();
  const subscribeFeed = (listener) => { feedListeners.add(listener); return () => feedListeners.delete(listener); };
  let persistedStore = JSON.stringify({ cards: [card], activeCardId: card.id });
  const groups = { state: 'idle', archivedSessionIds: [], pinnedSessionIds: [] };
  const archiveAttempts = [];
  const renames = [];
  let captured;
  let main;
  const stubs = {
    window: { __ModuleLoader__: { load(definition) { captured = definition; } } },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: setImmediate,
    cancelAnimationFrame: clearImmediate,
    localStorage: {
      getItem: (key) => key === 'dsh-tt:v3' ? persistedStore : null,
      setItem(key, value) { if (key === 'dsh-tt:v3') persistedStore = value; }, removeItem() {},
    },
  };
  const saved = Object.fromEntries(Object.keys(stubs).map((key) => [key, globalThis[key]]));
  Object.assign(globalThis, stubs);
  try {
    await import(pathToFileURL(CLIENT).href + '?greeting');
    const { React, effects } = makeReact();
    React.useState = (initial) => {
      const index = stateIndex++;
      if (!states.has(index)) states.set(index, typeof initial === 'function' ? initial() : initial);
      return [states.get(index), (patch) => states.set(index, typeof patch === 'function' ? patch(states.get(index)) : patch)];
    };
    React.useRef = (initial) => (refs[refIndex++] ??= { current: initial });
    captured.factory(() => React).apply({
      remote: {
        session: { create: async () => ({ sessionId: 'chat-' + ++sessions }), rename: async ({ sessionId, title }) => {
          renames.push({ sessionId, title });
        },
          list: async () => Array.from({ length: sessions }, (_, i) => ({ sessionId: 'chat-' + (i + 1), title: `会话 ${i + 1}` })),
          events: async () => ({ records: history }),
          prompt: async (request) => {
            prompts.push(request);
            if (failPrompt) throw new Error('测试网络错误');
          },
        },
        workspaceFiles: { readBytes: async (sessionId, filename) => {
          reads.push([sessionId, filename]);
          return new TextEncoder().encode(JSON.stringify(raw));
        } },
      },
      workspaces: {
        list: { getSnapshot: () => groups, subscribe: () => () => {} },
        async archiveSession(id) {
          archiveAttempts.push(id);
          if (id === 'chat-2') throw { rpcError: { code: 'workspace/session-active' } };
          groups.archivedSessionIds.push(id);
        },
        async unarchiveSession(id) { groups.archivedSessionIds = groups.archivedSessionIds.filter((archived) => archived !== id); },
        async pinSession(id) { groups.pinnedSessionIds.push(id); },
      },
      sessions: {
        retain(id) {
          retainedId = id;
          const binding = {
            eventSource: { getSnapshot: () => ({ entries: liveEntries }), subscribe: subscribeFeed },
            session: { getSnapshot: () => ({ running, openState: 'open' }), subscribe: subscribeFeed },
          };
          return { binding, ready: Promise.resolve(binding), release() { released++; } };
        },
      },
      slots: {
        inject(slot, produce) { if (slot === 'main') main = produce; },
        register(slotProps, component) { return { slotProps, component }; },
      },
    });
    const registration = main();
    const render = () => {
      stateIndex = 0;
      refIndex = 0;
      return renderTree(registration.component({}), React);
    };
    const buttonNamed = (tree, label) => findTags(tree, 'button').find((item) => item.props['aria-label'] === label
      || collectText(item).trim() === label || (item.props.className === 'tt-greet' && collectText(item).includes(label)));
    const clickButton = (tree, label) => {
      const button = buttonNamed(tree, label);
      assert.ok(button, `找不到按钮 ${label}`);
      if (button.props.className?.split(' ').includes('tt-tool')) assert.equal(button.props.title, button.props['aria-label']);
      return button.props.onClick();
    };

    await clickButton(render(), '新建对话');
    assert.deepEqual(reads, [['chat-1', 'card.json']]);
    assert.equal(states.get(0).sessionMeta['chat-1'].greeting, raw.data.first_mes);
    const chat = render();
    assert.doesNotMatch(collectText(chat), /选择开场白/);
    assert.match(findTags(chat, 'iframe')[0].props.srcDoc, /id="card-home"/);
    assert.equal(findTags(chat, 'iframe')[0].props.sandbox, 'allow-scripts allow-same-origin');

    clickButton(chat, '脚本工具');
    const scriptTools = findTags(render(), 'dialog').find((item) => item.props.id === 'tt-script-tools');
    assert.ok(buttonNamed(scriptTools, '打开扩展与脚本界面'));
    clickButton(scriptTools, '关闭');

    assert.equal(buttonNamed(chat, '开始剧情'), undefined);
    clickButton(chat, '切换开场白');
    history = [{ type: 'event', event: { type: 'user/message' } }];
    await clickButton(render(), '剧情开场甲');
    assert.match(collectText(render()), /这局已经开始对话/);
    assert.equal(states.get(0).sessionMeta['chat-1'].greeting, raw.data.first_mes);

    history = [];
    clickButton(render(), '切换开场白');
    await clickButton(render(), '剧情开场甲');
    assert.equal(sessions, 1);
    assert.equal(states.get(0).sessionMeta['chat-1'].greeting, '剧情开场甲');
    assert.match(collectText(render()), /剧情开场甲/);

    clickButton(render(), '切换开场白');
    await clickButton(render(), '作者默认');
    assert.equal(sessions, 1);
    assert.equal(states.get(0).sessionMeta['chat-1'].greeting, raw.data.first_mes);

    clickButton(chat, '角色卡');
    await clickButton(render(), '开始对话');
    assert.equal(states.get(0).sessionMeta['chat-2'].greeting, raw.data.first_mes);
    clickButton(render(), '角色卡');
    clickButton(render(), '从备选开场新建');
    const picker = render();
    assert.match(collectText(picker), /选择开场白/);
    assert.equal(sessions, 2);
    await clickButton(picker, '剧情开场乙');
    assert.equal(states.get(0).sessionMeta['chat-3'].greeting, '剧情开场乙');

    const textarea = () => findTags(render(), 'textarea')[0];
    textarea().props.onChange({ target: { value: '继续剧情' } });
    let prevented = 0;
    const enter = (nativeEvent, shiftKey) => textarea().props.onKeyDown({ key: 'Enter', nativeEvent, shiftKey,
      preventDefault() { prevented++; },
    });
    enter({ isComposing: true });
    enter({ keyCode: 229 });
    enter({}, true);
    assert.equal(prevented, 0);
    assert.equal(prompts.length, 0);

    enter({});
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(prompts.length, 1);
    assert.equal(textarea().props.value, '继续剧情');
    assert.match(collectText(render()), /发送失败，草稿已保留/);

    failPrompt = false;
    enter({});
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(prompts.length, 2);
    assert.equal(textarea().props.value, '');
    assert.match(prompts[1].content[0].text, /剧情开场乙/);

    const earlier = { type: 'event', event: { type: 'user/message', seq: 1,
      data: { content: '已提交的输入\n\n<rpg_ans>穿过大厅</rpg_ans>' } } };
    history = [earlier];
    render();
    cleanupFeed = effects.findLast((effect) => String(effect).includes('bridge.retainSession'))();
    assert.equal(retainedId, 'chat-3');
    const chunk = (type, text) => ({ type: 'transient', event: { type: 'assistant/live-chunk',
      data: { turn: 1, step: 1, attemptId: 'test-stream', chunk: { type, index: 0, text } } } });
    const publishLive = async (entries, active) => {
      liveEntries = entries;
      running = active;
      for (const listener of feedListeners) listener();
      await new Promise((done) => setImmediate(done));
      return render();
    };
    const thought = chunk('reasoning-delta', '单独的思考文本');
    const thinking = await publishLive([thought], true);
    const disclosure = findTags(thinking, 'details').find((item) => item.props.className === 'tt-reasoning');
    assert.match(collectText(disclosure), /思考中.*\n单独的思考文本/s);
    assert.equal(disclosure.props.open, undefined);
    const partial = chunk('text-delta', '<dream_plot>正在写的故事<UpdateVariable>内部状态');
    const streaming = await publishLive([earlier, thought, partial], true);
    const streamRow = findTags(streaming, 'article').find((item) => item.props.className === 'tt-fl tt-stream');
    assert.match(collectText(streamRow), /正在写的故事/);
    assert.doesNotMatch(collectText(streamRow), /内部状态|dream_plot|UpdateVariable/);
    const finalReply = { type: 'event', event: { type: 'assistant/message', surfaceOp: 'append', seq: 3,
      data: { turn: 1, step: 1, message: { content: [
        { type: 'reasoning', text: '单独的思考文本' }, { type: 'text', text: '<style>.internal{color:red}</style><dream_plot>完成的故事</dream_plot>\n```html\n<script>window.parent.DreamRpg;</script>\n```' },
      ] } } } };
    const completed = await publishLive([earlier, thought, partial, finalReply], false);
    assert.doesNotMatch(collectText(completed), /正在写的故事|生成中/);
    assert.match(collectText(completed), /思考过程/);
    assert.match(collectText(completed), /完成的故事/);
    assert.doesNotMatch(collectText(completed), /drpg-action|rpg_ans|internal|<style>/);
    assert.equal(collectText(completed).match(/已提交的输入/g).length, 1);
    const player = findTags(completed, 'article').find((item) => item.props.className === 'tt-fl user mes');
    assert.ok(findTags(completed, 'div').some((item) => item.props.id === 'chat'));
    assert.ok(findTags(completed, 'div').some((item) => item.props.className === 'tt-bub mes_text'));
    const action = findTags(player, 'iframe')[0];
    assert.match(action.props.srcDoc, /<span class="drpg-action" data-drpg-answer>穿过大厅<\/span>/);
    assert.equal(action.props.sandbox, 'allow-scripts');
    assert.match(action.props.srcDoc, /default-src 'none'/);
    const finalRow = findTags(completed, 'article').find((item) => collectText(item).includes('完成的故事'));
    assert.equal(finalRow.props.key, streamRow.props.key);
    assert.equal(findTags(finalRow, 'iframe')[0].props.sandbox, 'allow-scripts');
    const composer = findTags(completed, 'textarea')[0];
    assert.equal(composer.props.id, 'send_textarea');
    assert.ok(findTags(completed, 'button').some((item) => item.props.id === 'send_but'));
    composer.props.onInput({ nativeEvent: { isTrusted: false }, currentTarget: { value: 'RPG 行动' } });
    assert.equal(textarea().props.value, 'RPG 行动');
    cleanupFeed();
    cleanupFeed = null;
    assert.equal(feedListeners.size, 0);
    assert.equal(released, 1);

    textarea().props.onChange({ target: { value: '第三局草稿' } });
    clickButton(render(), '会话 1');
    assert.equal(textarea().props.value, '');
    clickButton(render(), '会话 3');
    assert.equal(textarea().props.value, '第三局草稿');

    const scroll = findTags(render(), 'div').find((node) => node.props.className === 'tt-chat');
    scroll.props.onScroll({ currentTarget: { scrollHeight: 900, clientHeight: 300, scrollTop: 150 } });
    clickButton(render(), '回到最新消息');
    assert.equal(buttonNamed(render(), '回到最新消息'), undefined);

    clickButton(render(), '管理会话 2');
    await clickButton(render(), '置顶');
    const sessionButtons = () => findTags(render(), 'button').filter((node) => node.props.className === 'tt-row');
    assert.equal(collectText(sessionButtons()[0]).trim(), '会话 2');
    clickButton(render(), '管理会话 3');
    clickButton(render(), '重命名');
    const input = (label) => findTags(render(), 'input').find((node) => node.props['aria-label'] === label);
    input('会话名称').props.onChange({ target: { value: '第三局新名称' } });
    await clickButton(render(), '保存名称');
    assert.deepEqual(renames.at(-1), { sessionId: 'chat-3', title: '第三局新名称' });
    assert.ok(buttonNamed(render(), '第三局新名称'));

    input('搜索会话').props.onChange({ target: { value: '会话' } });
    clickButton(render(), '批量选择');
    clickButton(render(), '全选当前结果');
    assert.equal(input('选择会话 1').props.checked, true);
    assert.equal(input('选择会话 2').props.checked, true);
    assert.equal(input('选择第三局新名称'), undefined);
    clickButton(render(), '批量归档');
    assert.deepEqual(archiveAttempts, []);
    await clickButton(render(), '确认归档');
    assert.deepEqual(new Set(archiveAttempts), new Set(['chat-1', 'chat-2']));
    assert.equal(input('选择会话 1'), undefined);
    assert.equal(input('选择会话 2').props.checked, true);
    assert.match(collectText(render()), /仍有任务在运行/);
    clickButton(render(), '归档记录');
    await clickButton(render(), '恢复会话 1');
    assert.match(collectText(render()), /还没有归档会话/);
    clickButton(render(), '返回会话列表');
    assert.ok(buttonNamed(render(), '会话 1'));
    clickButton(render(), '管理会话 1');
    clickButton(render(), '归档会话');
    assert.match(collectText(render()), /将「会话 1」移出列表/);
    clickButton(render(), '取消');
    assert.equal(archiveAttempts.length, 2);

    const desktop = render();
    assert.equal(findTags(findTags(desktop, 'aside')[0], 'nav').length, 0);
    assert.ok(buttonNamed(findTags(desktop, 'nav')[0], '角色卡'));
    clickButton(desktop, '收起会话列表');
    assert.equal(findTags(render(), 'aside').length, 0);
    assert.equal(findTags(render(), 'nav').length, 1);
    clickButton(render(), '展开会话列表');
    assert.ok(buttonNamed(render(), '会话 1'));

    const options = findTags(render(), 'details').find((node) => node.props.className === 'tt-chat-options');
    assert.equal(findTags(options, 'summary')[0].props.title, '对话选项');
    assert.equal(findTags(options, 'select').length, 3);

    const panel = findTags(render(), 'div').find((node) => node.props.className === 'tt-root');
    panel.props.ref.current = { clientWidth: 480 };
    effects[0]();
    assert.equal(findTags(render(), 'aside').length, 0);
    clickButton(render(), '会话与页面');
    const drawer = findTags(render(), 'dialog')[0];
    assert.equal(drawer.props.id, 'tt-navigation');
    assert.equal(findTags(drawer, 'nav').length, 1);
    assert.equal(findTags(drawer, 'aside').length, 1);
    clickButton(drawer, '关闭会话与页面');
    assert.equal(findTags(render(), 'dialog').length, 0);
    clickButton(render(), '会话与页面');
    clickButton(findTags(render(), 'dialog')[0], '角色卡');
    assert.equal(findTags(render(), 'dialog').length, 0);

    clickButton(render(), '会话与页面');
    clickButton(findTags(render(), 'dialog')[0], '设置与诊断');
    const radios = () => findTags(render(), 'input').filter((item) => item.props.name === 'dsh-tt-theme');
    const theme = () => findTags(render(), 'div').find((item) => item.props['data-tt-theme']).props['data-tt-theme'];
    assert.deepEqual(radios().map((item) => item.props.value), ['light', 'white', 'dark']);
    for (const choice of ['white', 'dark', 'light', 'dark']) {
      radios().find((item) => item.props.value === choice).props.onChange();
      assert.equal(theme(), choice);
      assert.equal(radios().find((item) => item.props.checked).props.value, choice);
    }
    assert.equal(JSON.parse(persistedStore).theme, 'dark');
    const fontPicker = () => findTags(render(), 'select').find((item) => item.props.className === 'tt-search'
      && findTags(item, 'option').some((option) => option.props.value === 'kai'));
    fontPicker().props.onChange({ target: { value: 'kai' } });
    assert.equal(JSON.parse(persistedStore).messageFont, 'kai');
    states.clear();
    assert.equal(theme(), 'dark');
    clickButton(render(), '设置与诊断');
    assert.equal(fontPicker().props.value, 'kai');
  } finally {
    cleanupFeed?.();
    Object.assign(globalThis, saved);
  }
});

test('client.js 内嵌的提示词管线可求值，并能算出 system 段', async () => {
  const source = fs.readFileSync(CLIENT, 'utf8');
  const match = source.match(/const TT_LIB_SRC = ("(?:[^"\\]|\\.)*");/);
  assert.ok(match, 'client.js 里应当有 TT_LIB_SRC');
  const libSource = JSON.parse(match[1]);
  // eslint-disable-next-line no-new-func
  const TT_LIB = new Function(libSource + '\nreturn TT_LIB;')();
  for (const name of ['card', 'prompt', 'lorebook', 'regex', 'pipeline']) assert.ok(TT_LIB[name], `缺少 ${name}`);

  const result = TT_LIB.pipeline.runPromptPipeline({
    card: TT_LIB.card.normalizeCard(cardFixture()),
    preset: TT_LIB.prompt.parsePreset(presetFixture()),
    variables: { 天气: '雨' },
    greeting: '开场白',
    maxContext: 128000,
  });
  assert.match(result.systemText, /青岚/);
  assert.match(result.sectionText, /开场白/);
  assert.ok(result.stats.worldInfo.total > 0);
  assert.equal(result.errors.ejs.length, 0);
});

test('client.js 里不再有硬编码的 X:\\dsh-tt', () => {
  const source = fs.readFileSync(CLIENT, 'utf8');
  assert.equal(source.includes('X:\\\\dsh-tt'), false);
  assert.equal(parenthesizedHardcoded(source), false);
});

function parenthesizedHardcoded(source) {
  return /['"]X:\\\\dsh-tt['"]/.test(source);
}
