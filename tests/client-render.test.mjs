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
