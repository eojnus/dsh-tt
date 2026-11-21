import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { loadBundledLib } from '../tools/bundle-lib.mjs';
import { cardAssetsWasm } from '../plugin/lib/card-assets-wasm.js';
import { assistantProse, buildMessageFrame, fenceDisplayFragment, hideAssistantControlBlocks, literalAssetDisplays, splitMessageBlocks, streamingAssistantProse, vendorScript } from '../plugin/lib/message-html.js';

async function runHostedScripts(scripts, init = {}, options = {}) {
  const read = (file) => fs.readFileSync(new URL(`../src/tavern/${file}`, import.meta.url), 'utf8');
  let notifyReady;
  const ready = new Promise((resolve) => { notifyReady = resolve; });
  const elements = [];
  const modules = [];
  const preloads = [];
  const logs = [];
  const listeners = new Map();
  function jQuery(callback) { return jQuery.fn.ready(callback); }
  jQuery.fn = { ready(callback) { queueMicrotask(callback); } };
  const context = vm.createContext({
    structuredClone, DOMException, URL, setTimeout: options.setTimeout ?? setTimeout, clearTimeout, jQuery,
    addEventListener(type, listener) { listeners.set(type, listener); },
    __TT_INIT__: { ...init, scripts },
    __TT_REGEX__: (await loadBundledLib()).regex,
    async __TT_IMPORT_MODULE__(url) {
      const exports = await (options.loadModule ? options.loadModule(url, context) : import(url));
      modules.push(exports);
      return exports;
    },
    parent: {
      postMessage(data) {
        if (data.tt === 'ready') notifyReady(data);
        if (data.tt === 'log') logs.push(data);
        options.onPost?.(data, (reply) => listeners.get('message')({ source: this, data: { __ttParent: true, ...reply } }));
      },
    },
    document: {
      baseURI: 'https://host.example/roleplay/index.html',
      createElement(tag) {
        return { tag, style: {}, setAttribute(name, value) { this[name] = value; }, appendChild() {} };
      },
      head: { appendChild(link) { preloads.push(link); options.onPreload?.(link); } },
      body: {
        appendChild(element) {
          if (element.tag !== 'script') return;
          elements.push(element);
          vm.runInContext(element.textContent, context);
        },
      },
    },
  });
  context.window = context;
  vm.runInContext(read('core.js'), context);
  vm.runInContext(read('vendor/acorn.js'), context);
  vm.runInContext(read('shim.js').replace('/* __DSH_GENERATION_SHIM__ */',
    () => stripTypeScriptTypes(read('generation.ts'))), context);
  return { context, elements, modules, preloads, logs, ready: await ready };
}

test('酒馆助手：MVU 能遍历世界书绑定、异步读取 InitVar 并写入首楼', async () => {
  const { context, ready } = await runHostedScripts([{
    id: 'mvu-init',
    content: `$(async () => {
      const books = [...(await getLorebookSettings()).selected_global_lorebooks];
      const characterBooks = await getCharLorebooks();
      if (characterBooks.primary !== null) books.push(characterBooks.primary);
      books.push(...characterBooks.additional);
      const entries = await Promise.all(books.map((book) => getLorebookEntries(book).then((items) => items)));
      const initEntry = entries.flat().find((entry) => entry.comment.includes('[InitVar]'));
      const greeting = getChatMessages(0, { include_swipes: true })[0];
      greeting.swipes_data[0].stat_data = JSON.parse(initEntry.content);
      await setChatMessages([greeting]);
      TavernHelper.setLorebookSettings({ scan_depth: 2, context_percentage: 100, max_recursion_steps: 0 });
      window.initializedBooks = books;
    });`,
  }], {
    worldbookName: '角色世界书',
    worldbookEntries: [{ uid: 1, comment: '[InitVar] 初始变量', content: '{"好感":12}' }],
    messages: [{ role: 'assistant', text: '开场白' }],
  });
  assert.equal(ready.errors, 0);
  assert.deepEqual(Array.from(context.initializedBooks), ['角色世界书']);
  assert.equal(context.getVariables({ type: 'message', message_id: 0 }).stat_data.好感, 12);
  const settings = context.TavernHelper.getLorebookSettings();
  assert.deepEqual([settings.scan_depth, settings.context_percentage, settings.max_recursion_steps], [2, 100, 0]);
  settings.selected_global_lorebooks.push('外部修改');
  assert.equal(context.getLorebookSettings().selected_global_lorebooks.length, 0);
});

test('独立扩展能注册异步命令、写聊天世界书和元数据，并调用 ST 原始生成', async () => {
  const calls = [];
  const wasm = cardAssetsWasm();
  let book;
  let raw;
  const { context, ready } = await runHostedScripts([{
    id: 'extension-probe',
    content: `$(async () => {
      const c = SillyTavern.getContext();
      c.SlashCommandParser.addCommandObject(c.SlashCommand.fromProps({
        name: 'mirror', callback: async (_args, value) => value,
      }));
      window.bookName = (await c.executeSlashCommandsWithOptions('/getchatbook create=true name="测试世界书"')).pipe;
      window.uid = (await c.executeSlashCommandsWithOptions('/createentry file="测试世界书" key="记录"')).pipe;
      window.written = await c.executeSlashCommandsWithOptions('/mirror "保留 | 竖线" | /setentryfield file="测试世界书" uid='+uid+' field=content');
      window.currentBook = await c.loadWorldInfo(bookName);
      c.chatMetadata.bookmark = 8;
      await c.saveMetadata();
      await c.writeExtensionField(0, 'Sample', { enabled: true });
      const messages = [{role:'user', content:'只传这条'}];
      c.eventSource.on(c.eventTypes.CHAT_COMPLETION_SETTINGS_READY, data => {
        if (data.messages.includes(messages[0])) data.temperature = 0.25;
      });
      window.reply = await c.generateRaw({ prompt: messages, responseLength: 120 });
    });`,
  }], {
    extensions: [{ id: 'sample', slug: 'sample', name: '样例', requires: [] }],
    messages: [{ role: 'assistant', text: '已有聊天' }],
  }, {
    onPost(data, reply) {
      if (data.tt === 'extension-call') {
        calls.push(data);
        let value;
        if (data.method === 'parse-slash') value = wasm.parseExtensionCommands(data.args).commands;
        if (data.method === 'create-chat-worldbook') value = book = { name: data.args, entries: {} };
        if (data.method === 'edit-worldbook') {
          value = wasm.editExtensionWorldbook({ ...data.args, book });
          book = value.book;
        }
        reply({ type: 'extension-call-result', id: data.id, value });
      }
      if (data.tt === 'generate') {
        raw = data;
        reply({ type: 'generation-frame', id: data.id, frame: { type: 'text', text: '完成' } });
        reply({ type: 'generation-frame', id: data.id, frame: { type: 'done' } });
      }
    },
  });
  assert.equal(ready.errors, 0);
  assert.equal(context.bookName, '测试世界书');
  assert.equal(context.written.isError, false);
  assert.equal(context.currentBook.entries[context.uid].content, '保留 | 竖线');
  assert.ok(calls.some(({ method, args }) => method === 'save-metadata' && args.bookmark === 8));
  assert.ok(calls.some(({ method, args }) => method === 'write-card-extension' && args.key === 'Sample'));
  assert.equal(context.reply, '完成');
  assert.equal(raw.history.length, 0);
  assert.equal(raw.options.prompt[0].content, '只传这条');
  assert.equal(raw.options.temperature, 0.25);
  assert.equal(raw.options.max_tokens, 120);
});

test('酒馆助手：辅助生成按深度清理历史，回传增量，脚本注入可只执行一次', async () => {
  const requests = [];
  const { context, ready } = await runHostedScripts([{
    id: 'preset',
    content: `$(async () => {
      window.tokens = [];
      eventOn(iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY, (text, id) => tokens.push([text, id]));
      injectPrompts([{ id: 'rule', content: '校验格式', position: 'in_chat', depth: 0, filter: async () => true }], { once: true });
      window.results = [
        await generateRaw({ should_stream: true, generation_id: 'format', ordered_prompts: ['chat_history'] }),
        await generateRaw({ ordered_prompts: ['chat_history'] }),
      ];
    });`,
  }], {
    messages: [{ role: 'assistant', text: '上一条<hidden>内部内容</hidden>' }],
    regexScripts: [{ placement: [2], findRegex: '/<hidden>.*<\\/hidden>/g', promptOnly: true, maxDepth: 0 }],
  }, {
    onPost(data, reply) {
      if (data.tt !== 'generate') return;
      requests.push(data);
      const send = (frame) => reply({ type: 'generation-frame', id: data.id, frame });
      send({ type: 'start' });
      send({ type: 'text', text: '补全' });
      send({ type: 'done' });
    },
  });
  assert.equal(ready.errors, 0);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].history[0].content, '上一条');
  assert.equal(requests[0].injections[0].content, '校验格式');
  assert.equal(requests[1].injections.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(context.tokens)), [['补全', 'format']]);
  assert.deepEqual(Array.from(context.results), ['补全', '补全']);
});

test('酒馆楼层：角色创建先暂存玩家消息，由正常发送通道确认成功', async () => {
  const accepted = [];
  const handlers = new Map();
  const parent = { postMessage(message) { accepted.push(message); } };
  const window = {
    parent,
    addEventListener(event, handler) { handlers.set(event, handler); },
  };
  const html = buildMessageFrame('<main>角色创建</main>', { nonce: 'n', context: { compose: true, index: 0 } });
  const code = html.match(/<script nonce="n">([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(code, { window, setTimeout, clearTimeout });
  await window.createChatMessages([{ role: 'user', message: '玩家设定' }]);
  assert.equal(accepted.length, 0);
  const sent = window.triggerSlash('/trigger');
  assert.deepEqual(JSON.parse(JSON.stringify(accepted)), [{ type: 'dsh-tt:compose', id: 1, text: '玩家设定', send: true }]);
  handlers.get('message')({ source: parent, data: { type: 'dsh-tt:compose-result', id: 1, ok: true } });
  assert.equal((await sent).pipe, '');
});

test('酒馆助手：显示和提示词正则按文本来源、用途及深度执行', async () => {
  const { context, ready } = await runHostedScripts([{
    id: 'regex',
    content: `window.results = [
      formatAsTavernRegexedString('X', 'ai_output', 'display', { depth: 0 }),
      TavernHelper.formatAsTavernRegexedString('X', 'ai_output', 'prompt', { depth: 0 }),
      formatAsTavernRegexedString('X', 'user_input', 'display', { depth: 0 }),
      formatAsTavernRegexedString('X', 'ai_output', 'display', { depth: 2 }),
      formatAsTavernRegexedString('X', 2, { depth: 0 }),
    ];`,
  }], {
    regexScripts: [
      { placement: [2], findRegex: 'X', replaceString: '显示', markdownOnly: true, maxDepth: 0 },
      { placement: [2], findRegex: 'X', replaceString: '提示词', promptOnly: true },
    ],
  });
  assert.equal(ready.errors, 0);
  assert.deepEqual(Array.from(context.results), ['显示', '提示词', 'X', 'X', '显示']);
});

test('酒馆助手：同步读取当前预设，并等待提示词写入确认', async () => {
  const view = { prompts: [{ id: 'p', enabled: false }], prompts_unused: [] };
  const { context, ready } = await runHostedScripts([{
    id: 'preset-test',
    content: `$(async () => {
      const current = getPreset('in_use');
      current.prompts[0].enabled = true;
      window.before = getPreset('in_use').prompts[0].enabled;
      await TavernHelper.replacePreset('in_use', current);
      window.after = getPreset('in_use').prompts[0].enabled;
      window.saved = getPreset('测试预设').prompts[0].enabled;
    });`,
  }], { presetName: '测试预设', presetViews: { active: view, saved: view } }, {
    onPost(data, reply) {
      if (data.tt === 'preset-write') {
        assert.equal(data.name, 'in_use');
        reply({ type: 'preset-write-result', id: data.id, views: { active: data.preset, saved: view } });
      }
    },
  });
  assert.equal(ready.errors, 0);
  assert.equal(context.before, false);
  assert.equal(context.after, true);
  assert.equal(context.saved, false);
});

test('酒馆助手：能通过本局世界书名称读取独立条目', async () => {
  const { context, ready } = await runHostedScripts([], {
    worldbookName: '世界设定',
    worldbookEntries: [{ uid: 1, content: '角色设定' }],
    chatWorldbook: { name: '世界设定', entries: [{ uid: 1, content: '剧情设定' }] },
  });
  assert.equal(ready.errors, 0);
  const name = context.TavernHelper.getChatWorldbookName();
  assert.equal(name, '世界设定（本局）');
  assert.equal(context.getLorebookSettings().chatLorebook, name);
  assert.equal((await context.getLorebookEntries(name))[0].content, '剧情设定');
  assert.equal((await context.getLorebookEntries('世界设定'))[0].content, '角色设定');
});

test('酒馆助手：异步启动脚本各自注册按钮，按名称去重且保留已有设置', async () => {
  const scripts = ['mvu', 'preset'].map((id) => ({
    id,
    buttons: [{ name: '已有按钮', visible: true }],
    content: [
      '$(async () => {',
      '  await Promise.resolve();',
      '  appendInexistentScriptButtons([{ name: "已有按钮", visible: false }, { name: "新按钮", visible: false }]);',
      '  TavernHelper.appendInexistentScriptButtons([{ name: "新按钮", visible: true }]);',
      '  const buttons = updateScriptButtonsWith(items => items.concat({ name: "操作", visible: true }));',
      '  await TavernHelper.updateScriptButtonsWith(async () => buttons);',
      `  eventOn(getButtonEvent('操作'), () => { window.clicked = ${JSON.stringify(id)}; });`,
      `  window.${id} = [getScriptId(), getScriptButtons()];`,
      '});',
    ].join('\n'),
  }));
  const { context, ready } = await runHostedScripts(scripts, {}, {
    onPost(data, reply) {
      if (data.tt === 'ready') reply({ type: 'script-button', id: 'mvu', name: '操作' });
    },
  });
  assert.equal(ready.errors, 0);
  assert.equal(context.clicked, 'mvu');
  for (const { id } of scripts) {
    assert.deepEqual(JSON.parse(JSON.stringify(context[id])), [
      id, [{ name: '已有按钮', visible: true }, { name: '新按钮', visible: false }, { name: '操作', visible: true }],
    ]);
  }
});

test('酒馆助手：静态远程依赖在脚本执行前并发提交，重复地址只预载一次', async () => {
  const shared = 'https://cdn.example/shared.js';
  const extra = 'https://cdn.example/extra.js';
  const timeline = [];
  const { ready } = await runHostedScripts([
    { id: 'first', content: `import '${shared}';` },
    { id: 'second', content: `import '${shared}'; export * from '${extra}';` },
  ], {}, {
    setTimeout: (callback, delay) => setTimeout(callback, delay === 60000 ? 1000 : 0),
    onPreload(link) { timeline.push(link.href); },
    loadModule(url) { timeline.push(decodeURIComponent(url).includes(extra) ? 'second' : 'first'); },
  });
  assert.equal(ready.errors, 0);
  assert.deepEqual(timeline, [shared, extra, 'first', 'second']);
});

test('酒馆助手：模块完成导入后，就绪回调可以等待后续脚本和 APP_READY', async () => {
  const scripts = [
    { id: 'mvu', content: 'import "https://cdn.example/mvu.js";' },
    { id: 'preset', content: `eventEmit('preset-loaded');` },
  ];
  const { context, logs, ready } = await runHostedScripts(scripts, {}, {
    setTimeout: (callback, delay) => setTimeout(callback, delay === 60000 ? 1000 : 0),
    loadModule(_url, context) {
      vm.runInContext(`$(async () => {
        window.startingScript = getScriptId();
        await new Promise(resolve => eventOnce('preset-loaded', resolve));
        await new Promise(resolve => eventOnce(tavern_events.APP_READY, resolve));
        window.mvuInitialized = true;
      });`, context);
    },
  });
  assert.equal(ready.errors, 0);
  assert.equal(context.startingScript, 'mvu');
  assert.equal(context.mvuInitialized, true);
  assert.equal(logs.filter(log => log.level === 'error').length, 0);
  assert.match(logs.find(log => log.level === 'warn').text, /mvu.*初始化仍在等待/);
});

test('酒馆助手：模块超时报告入口地址，后续脚本仍执行', async () => {
  const scripts = [
    { id: 'mvu', content: 'import "https://cdn.example/mvu.js";' },
    { id: 'preset', content: 'window.presetLoaded = true;' },
  ];
  const { context, logs, ready } = await runHostedScripts(scripts, {}, {
    setTimeout: (callback) => setTimeout(callback, 0),
    loadModule: () => new Promise(() => {}),
  });
  assert.equal(ready.errors, 1);
  assert.equal(context.presetLoaded, true);
  assert.match(logs.find(log => log.level === 'error').text, /mvu.*模块加载超时.*https:\/\/cdn\.example\/mvu\.js/);
});

test('酒馆助手：按完整语法识别模块，单个无效脚本不影响后续脚本', async () => {
  const imported = 'data:text/javascript,export const value=6';
  const scripts = [
    { id: 'after-directive', content: `"use strict"; const base=4; import{value}from "${imported}"; export{base}; export const result=base+value;` },
    { id: 'compact', content: `import{value}from "${imported}"; export const result=value*2;` },
    { id: 'top-level-await', content: 'const result = await Promise.resolve(13); export{result};' },
    { id: 'invalid', content: `if (true) { import "${imported}"; }` },
    { id: 'classic', content: '/* import and export */ window.classic = (this === window); var laterLoad = () => import("unused");' },
  ];
  const { context, elements, modules, logs, ready } = await runHostedScripts(scripts);
  assert.equal(ready.errors, 1);
  assert.equal(ready.module, true);
  assert.deepEqual(elements.map((element) => element['data-tt-script']), ['classic']);
  assert.deepEqual(modules.map((exports) => exports.result), [10, 12, 13]);
  assert.equal(context.classic, true);
  assert.equal(logs.filter((log) => log.level === 'error').length, 1);
  assert.match(logs.find((log) => log.level === 'error').text, /invalid.*top level/);
});

test('酒馆助手：保留文档相对导入，模块执行抛错后继续下一脚本', async () => {
  const { ready, context, logs } = await runHostedScripts([
    { id: 'relative', content: 'export { version } from "./shared.js";' },
    { id: 'failing', content: 'await Promise.resolve(); throw new Error("初始化错误");' },
    { id: 'classic', content: 'window.reached = true;' },
  ], {}, {
    loadModule(url) {
      if (decodeURIComponent(url).includes('shared.js')) {
        assert.match(decodeURIComponent(url), /https:\/\/host\.example\/roleplay\/shared\.js/);
        return { version: 1 };
      }
      return import(url);
    },
  });
  assert.equal(context.reached, true);
  assert.equal(ready.errors, 1);
  assert.match(logs.find((log) => log.level === 'error').text, /failing.*初始化错误/);
});

test('酒馆助手：脚本目录按顺序展开，并继承目录的启停状态', async () => {
  const { card } = await loadBundledLib();
  const script = { id: 'mvu', type: 'script', content: 'import("./mvu.js");', enabled: true };
  const disabledCopy = { ...script, id: 'later' };
  const scripts = [
    { type: 'folder', enabled: true, scripts: [script] },
    { type: 'folder', enabled: false, scripts: [disabledCopy] },
  ];
  const result = card.flattenTavernScripts(scripts);
  assert.equal(result[0], script);
  assert.deepEqual(result[1], { ...disabledCopy, enabled: false });
  assert.equal(disabledCopy.enabled, true);
});

test('酒馆助手：浏览器全局提供 Vue、YAML 和 Lodash 链式方法', () => {
  const load = (name) => fs.readFileSync(new URL(`../src/tavern/vendor/${name}.js`, import.meta.url), 'utf8');
  const source = vendorScript(['vue', 'js-yaml', 'lodash'].map(load).join('\n;\n'));
  const context = vm.createContext({});
  context.window = context;
  vm.runInContext(source.slice('<script>'.length, -'</script>'.length), context);
  assert.equal(typeof context.Vue.createApp, 'function');
  assert.equal(typeof context.Vue.watch, 'function');
  assert.equal(context.YAML.parse('stat_data:\n  好感: 15').stat_data.好感, 15);
  assert.deepEqual(Array.from(context._([{ id: 1 }, { id: 2 }]).differenceBy([{ id: 2 }], 'id').map('id').value()), [1]);
});

test('酒馆楼层：完整 HTML 围栏可以跨空行，非 HTML 和未闭合围栏保留为代码', () => {
  const html = '<html><body>\n\n<section>状态栏</section>\n</body></html>';
  const source = ['正文', '````', html, '````', '```js', 'const x = 1;', '```', '```html', '<b>还没结束</b>'].join('\r\n');
  const blocks = splitMessageBlocks(source);
  assert.deepEqual(blocks.map(({ type }) => type), ['text', 'html', 'code', 'code']);
  assert.equal(blocks[1].text, html);
  assert.equal(splitMessageBlocks(html)[0].type, 'html');
});

test('酒馆楼层：显示预设状态栏与正文，隐藏推理和带代码围栏的变量更新', () => {
  const source = '<think>推理</think><dream_plot>\n<scene>日期|时刻|地点</scene>\n\n可见正文\n'
    + '<UpdateVariable>\n```json\n[{ "op": "replace" }]\n```\n</UpdateVariable></dream_plot>';
  const decorated = hideAssistantControlBlocks(source).replace(/<scene>([^|]+)\|([^|]+)\|([^<]+)<\/scene>/,
    fenceDisplayFragment('<div class="scene"><span>$1</span><span>$2</span><span>$3</span></div>'));
  const blocks = splitMessageBlocks(decorated);
  assert.equal(blocks.find((block) => block.type === 'html').text, '<div class="scene"><span>日期</span><span>时刻</span><span>地点</span></div>');
  assert.equal(blocks.filter((block) => block.type === 'text').map((block) => assistantProse(block.text)).join('').trim(), '可见正文');
  assert.equal(blocks.some((block) => block.type === 'code'), false);
  assert.equal(streamingAssistantProse('正文\n```html\n<style>color:blue'), '正文');
  assert.equal(streamingAssistantProse('<dream_scene/>正文<StatusPlaceHolderImpl/>'), '正文');
  assert.equal(streamingAssistantProse('<dream_plot>正文<JSONPatch>局部变量'), '正文');
});

test('酒馆楼层：只有卡片模板能获得楼层数据，普通输出使用受限的 iframe 文档', () => {
  const html = '<body><div id="status">状态栏</div></body>';
  const fenced = (code) => '```html\n' + code + '\n```';
  const rules = [
    { placement: [2], replaceString: '$1\n' + fenced(html) },
    { placement: [2], replaceString: fenced('<div>$1</div>') },
    { placement: [2], promptOnly: true, replaceString: fenced('<div>仅限提示词</div>') },
  ];
  assert.deepEqual([...literalAssetDisplays(rules)], [html]);
  const variables = { stat_data: { label: '</script>状态栏' } };
  const srcdoc = buildMessageFrame(html, { nonce: 'testing', context: { index: 2, variables } });
  assert.ok(srcdoc.includes('\\u003c/script>状态栏'));
  const bootstrap = srcdoc.match(/<script nonce="testing">([\s\S]*?)<\/script>/)[1];
  const context = vm.createContext({ structuredClone });
  context.window = context;
  context.addEventListener = () => {};
  vm.runInContext(bootstrap, context);
  assert.equal(context.getMessageId(), 2);
  assert.deepEqual(context.Mvu.getMvuData({ type: 'message' }), variables);
  const staticDoc = buildMessageFrame(html, { nonce: 'testing' });
  assert.match(staticDoc, /default-src 'none'; script-src 'nonce-testing'/);
  assert.doesNotMatch(staticDoc, /"stat_data"/);
});
