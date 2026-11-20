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
      assert.ok(text.length > 120, `页签 ${view} 的渲染结果看起来是空的（${text.length} 字）`);
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

test('新局渲染卡片主页，可从主页进入同一局的备选剧情', async () => {
  const raw = cardFixture();
  raw.data.first_mes = '【主页】';
  raw.data.alternate_greetings = ['剧情开场甲', '剧情开场乙'];
  raw.data.extensions.regex_scripts = [{
    placement: [2], markdownOnly: true, findRegex: '【主页】',
    replaceString: '```html\n<body><main id="card-home">卡片主页</main></body>\n```',
  }];
  const card = { id: 'card-1', name: '测试角色', filePath: 'card.json' };
  const states = new Map();
  const refs = [];
  const reads = [];
  let stateIndex;
  let refIndex;
  let sessions = 0;
  let history = [];
  let captured;
  let main;
  const stubs = {
    window: { __ModuleLoader__: { load(definition) { captured = definition; } } },
    localStorage: {
      getItem: (key) => key === 'dsh-tt:v3' ? JSON.stringify({ cards: [card], activeCardId: card.id }) : null,
      setItem() {}, removeItem() {},
    },
  };
  const saved = Object.fromEntries(Object.keys(stubs).map((key) => [key, globalThis[key]]));
  Object.assign(globalThis, stubs);
  try {
    await import(pathToFileURL(CLIENT).href + '?greeting');
    const { React } = makeReact();
    React.useState = (initial) => {
      const index = stateIndex++;
      if (!states.has(index)) states.set(index, typeof initial === 'function' ? initial() : initial);
      return [states.get(index), (patch) => states.set(index, typeof patch === 'function' ? patch(states.get(index)) : patch)];
    };
    React.useRef = (initial) => (refs[refIndex++] ??= { current: initial });
    captured.factory(() => React).apply({
      remote: {
        session: { create: async () => ({ sessionId: 'chat-' + ++sessions }), rename: async () => {}, list: async () => [],
          events: async () => ({ records: history }) },
        workspaceFiles: { readBytes: async (sessionId, filename) => {
          reads.push([sessionId, filename]);
          return new TextEncoder().encode(JSON.stringify(raw));
        } },
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
    const clickButton = (tree, label) => findTags(tree, 'button').find((button) => collectText(button).includes(label)).props.onClick();

    await clickButton(render(), '新建对话');
    assert.deepEqual(reads, [['chat-1', 'card.json']]);
    assert.equal(states.get(0).sessionMeta['chat-1'].greeting, '【主页】');
    const chat = render();
    assert.doesNotMatch(collectText(chat), /选择开场白/);
    assert.match(findTags(chat, 'iframe')[0].props.srcDoc, /id="card-home"/);

    clickButton(chat, '开始剧情');
    history = [{ type: 'event', event: { type: 'user/message' } }];
    await clickButton(render(), '剧情开场甲');
    assert.match(collectText(render()), /这局已经开始对话/);
    assert.equal(states.get(0).sessionMeta['chat-1'].greeting, '【主页】');

    history = [];
    clickButton(render(), '开始剧情');
    await clickButton(render(), '剧情开场甲');
    assert.equal(sessions, 1);
    assert.equal(states.get(0).sessionMeta['chat-1'].greeting, '剧情开场甲');
    assert.match(collectText(render()), /剧情开场甲/);

    clickButton(chat, '角色');
    const cardView = render();
    const tile = findTags(cardView, 'div').find((node) => node.props.className?.split(' ').includes('tt-card'));
    await tile.props.onDoubleClick();
    assert.equal(states.get(0).sessionMeta['chat-2'].greeting, '【主页】');
    clickButton(render(), '角色');
    clickButton(render(), '从备选开场新建');
    const picker = render();
    assert.match(collectText(picker), /选择开场白/);
    assert.equal(sessions, 2);
    await clickButton(picker, '剧情开场乙');
    assert.equal(states.get(0).sessionMeta['chat-3'].greeting, '剧情开场乙');
  } finally {
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
