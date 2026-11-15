// 客户端面板冒烟测试：用极简 React 实现把 plugin/client.js 的 Panel 渲染一遍。
//
// 目的：在没有浏览器的环境里抓住语法错误、未定义变量、首屏渲染异常。
// 不执行 useEffect（避免发起真实 RPC），也不模拟交互。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './helpers.mjs';

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

    const icon = renderTree(sidebar.produce(), React);
    assert.ok(icon, '侧栏图标应当渲染');

    const element = main.produce();
    const tree = renderTree(element, React);
    assert.ok(tree, 'Panel 应当产出元素树');
    assert.ok(source.includes('dsh-tt:v3'), '客户端包应当带主 store 键');
  } finally {
    for (const key of Object.keys(saved)) globalThis[key] = saved[key];
  }
});

test('client.js 里不再有硬编码的 X:\\dsh-tt', () => {
  const source = fs.readFileSync(CLIENT, 'utf8');
  assert.equal(source.includes('X:\\\\dsh-tt'), false);
  assert.equal(parenthesizedHardcoded(source), false);
});

function parenthesizedHardcoded(source) {
  return /['"]X:\\\\dsh-tt['"]/.test(source);
}
