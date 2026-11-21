// Host 侧装配测试：用假的 Cordis ctx 与假的 agent 验证
// 「每个会话有自己的提示词段」「信封在 pre-step 被剥离」。
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { FIXTURES } from './helpers.mjs';
import { apply, resolveAssetRoots } from '../plugin/agent.js';
import { cardFixture, secondCardFixture, presetFixture } from './helpers.mjs';
import { mountRoleplayStream } from '../plugin/lib/roleplay-stream.js';

const MARK = '\u0000TT\u0000';
const originalLog = console.log;

before(() => { console.log = () => {}; });
after(() => { console.log = originalLog; });

function makeCtx() {
  const handlers = new Map();
  return {
    ctx: {
      on(event, handler) {
        handlers.set(event, handler);
        return () => handlers.delete(event);
      },
    },
    handlers,
    emit(event, ...args) {
      const handler = handlers.get(event);
      assert.ok(handler, `事件 ${event} 没有监听器`);
      return handler(...args);
    },
  };
}

function makeAgent(id) {
  const sections = [];
  const effects = [];
  return {
    id,
    sections,
    effects,
    ctx: {
      systemPrompt: {
        section(section) {
          sections.push(section);
          return () => {
            const index = sections.indexOf(section);
            if (index >= 0) sections.splice(index, 1);
          };
        },
      },
      effect(fn) {
        effects.push(fn);
        return () => {};
      },
    },
  };
}

function envelope(binding, body) {
  return {
    id: 'msg-' + Math.random().toString(36).slice(2, 8),
    content: [{ type: 'text', text: MARK + JSON.stringify(binding) + MARK + body }],
  };
}

function boot() {
  const harness = makeCtx();
  apply(harness.ctx, {
    takeover: true,
    assetsDir: path.join(FIXTURES, 'no-such-asset-root'),
    assetDirs: [FIXTURES],
  });
  return harness;
}

test('资产根目录：默认是项目根下的 参考/ 与 assets/，可用 assetsDir 覆盖', () => {
  const roots = resolveAssetRoots({});
  assert.equal(roots.length, 2);
  assert.match(roots[0].replace(/\\/g, '/'), /dsh-tt\/参考$/);
  assert.match(roots[1].replace(/\\/g, '/'), /dsh-tt\/assets$/);
  assert.equal(resolveAssetRoots({ assetsDir: 'D:/assets-root' })[0].replace(/\\/g, '/'), 'D:/assets-root/参考');
  // 硬编码路径必须消失（这是本轮修的 bug）。
  assert.equal(roots.some((root) => root.startsWith('X:')), false);
});

test('主聊天通过 Rust 编排卡片和预设，以角色消息向 DSH 发送历史后指令和助手前缀', async () => {
  const harness = boot();
  const agent = { ...makeAgent('native-roleplay'), session: { id: 'native-roleplay-session' } };
  const message = envelope({
    cardJson: { name: '守门人', post_history_instructions: '{{original}}，始终记住钥匙<% } %>',
      extensions: { depth_prompt: { prompt: '此刻下雨', depth: 0, role: 'user' } } },
    presetJson: {
      temp_openai: 0.5, openai_max_tokens: 500, custom_stopping_strings: '["结束"]',
      assistant_prefill: '<%= getvar("开头") %>{{getvar::引号}} ',
      prompts: [
        { identifier: 'main', content: '<% if (getvar("启用")) { %>用中文' },
        { identifier: 'jailbreak', content: '保持第三人称' },
        { identifier: 'format', role: 'user', content: '保留引号{{setvar::引号::左}} {{lastMessageId}} {{input}}' },
      ],
      prompt_order: [{ order: ['main', 'chatHistory', 'jailbreak', 'format'].map((identifier) => ({ identifier, enabled: true })) }],
    },
    variables: { 开头: '「', 启用: true }, greeting: '你来了。', lastMessageId: 1,
  }, '我推门。');
  message.role = 'user';
  harness.emit('agent/inbox/inserted', { agent, message });
  const accepted = await harness.emit('agent/pre-step', { agent }, async () => ({ kind: 'enter', messages: [message] }));
  const user = Object.freeze(accepted.messages[0]);
  const context = { id: 'runtime', role: 'user', source: { kind: 'runtime-context' }, content: [{ type: 'text', text: '运行时' }] };
  const system = { role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: '旧扁平提示词' }] };
  let forwarded;
  let dispatch;
  const llm = { async *stream(options) {
    forwarded = options;
    yield { type: 'text-delta', text: '雨停了' };
    yield { type: 'finish', reason: { kind: 'stop' } };
  } };
  mountRoleplayStream({ llm, on(_event, hook) { dispatch = hook; } });
  const signal = new AbortController().signal;
  const options = Object.freeze({ provider: 'configured', model: 'chat', sessionId: agent.session.id, signal,
    messages: Object.freeze([system, user, context]) });
  const chunks = [];
  for await (const chunk of dispatch(options, () => assert.fail('角色扮演请求未接管'))) chunks.push(chunk);
  assert.equal(chunks.at(-1).reason.kind, 'stop');
  assert.equal(forwarded.signal, signal);
  assert.equal(forwarded.messages[2], user);
  assert.equal(forwarded.messages[3], context);
  assert.equal(options.messages[0], system);
  assert.deepEqual(forwarded.messages.map(({ role, content }) => [role, content[0].text]), [
    ['system', '用中文'], ['assistant', '你来了。'], ['user', '我推门。'], ['user', '运行时'],
    ['user', '此刻下雨'], ['system', '保持第三人称，始终记住钥匙'], ['user', '保留引号 1 我推门。'], ['assistant', '「左 '],
  ]);
  assert.equal(forwarded.temperature, 0.5);
  assert.equal(forwarded.maxTokens, 500);
  assert.deepEqual(forwarded.stop, ['结束']);
  assert.equal(dispatch(forwarded, () => 'separate request'), 'separate request');
  assert.equal(dispatch({ ...options, sessionId: 'unrelated' }, () => 'ordinary chat'), 'ordinary chat');
  for (const effect of agent.effects) effect()();
  assert.equal(dispatch(options, () => 'disposed'), 'disposed');
});

test('每个 agent 注册自己的提示词段（会话隔离）', () => {
  const harness = boot();
  const a = makeAgent('agent-a');
  const b = makeAgent('agent-b');
  harness.emit('agent/created', { agent: a });
  harness.emit('agent/created', { agent: b });

  assert.equal(a.sections.length, 1);
  assert.equal(b.sections.length, 1);
  assert.notEqual(a.sections[0], b.sections[0]);
  assert.equal(a.sections[0].name, 'dsh-tt:roleplay');
  assert.equal(a.sections[0].complete, true);
  assert.equal(typeof a.sections[0].text, 'function', '段文本必须是函数，组装时才读取最新状态');
});

test('两个会话绑定不同的卡：提示词互不污染', () => {
  const harness = boot();
  const a = makeAgent('agent-a');
  const b = makeAgent('agent-b');
  harness.emit('agent/created', { agent: a });
  harness.emit('agent/created', { agent: b });

  harness.emit('agent/inbox/inserted', {
    agent: a,
    message: envelope({
      cardJson: cardFixture(),
      presetJson: presetFixture(),
      variables: { 天气: '雨' },
      greeting: 'A 的开场白',
    }, 'A 的正文'),
  });
  harness.emit('agent/inbox/inserted', {
    agent: b,
    message: envelope({
      cardJson: secondCardFixture(),
      presetJson: presetFixture(),
      variables: { 天气: '晴' },
      greeting: 'B 的开场白',
    }, 'B 的正文'),
  });

  const textA = a.sections[0].text({ scope: 'scope-a' });
  const textB = b.sections[0].text({ scope: 'scope-b' });

  assert.match(textA, /青岚/, 'A 的 system 里是 A 的卡');
  assert.equal(textA.includes('听雪'), false, 'A 的 system 不能出现 B 的卡');
  assert.match(textA, /A 的开场白/);
  assert.match(textA, /注意雨声的描写/, 'A 的变量（晴/雨）独立生效');

  assert.match(textB, /听雪/, 'B 的 system 里是 B 的卡');
  assert.equal(textB.includes('山门在云上三千尺'), false, 'B 的 system 不能出现 A 的世界书');
  assert.match(textB, /B 的开场白/);
  assert.equal(textB.includes('注意雨声的描写'), false, 'B 的天气是晴');
});

test('世界书扫描玩家本轮输入和该会话最近的回复，尊重条目扫描深度', () => {
  const harness = boot();
  const agent = makeAgent('scan-chat');
  harness.emit('agent/created', { agent });
  const card = secondCardFixture();
  card.character_book = { entries: [
    { id: 1, keys: ['月海'], content: '当前输入触发条目' },
    { id: 2, keys: ['银钟'], content: '最近回复触发条目' },
    { id: 3, keys: ['旧地图'], content: '条目深度允许', extensions: { scan_depth: 3 } },
    { id: 4, keys: ['旧地图'], content: '默认深度不允许' },
    { id: 5, keys: ['月海'], content: '零深度不扫描聊天', extensions: { scan_depth: 0 } },
    { id: 6, keys: ['书页'], content: '指定描述来源触发', extensions: { match_character_description: true } },
    { id: 7, keys: ['/月[海潮]/'], content: '正则匹配并提到黑塔', extensions: { prevent_recursion: true } },
    { id: 8, keys: ['黑塔'], content: '禁止递归的词不应触发' },
  ] };
  card.description = '书页';
  harness.emit('agent/inbox/inserted', {
    agent,
    message: envelope({ cardJson: card, worldInfoHistory: ['旧地图', '银钟'] }, '月海'),
  });
  const system = agent.sections[0].text();
  assert.match(system, /当前输入触发条目/);
  assert.match(system, /最近回复触发条目/);
  assert.match(system, /条目深度允许/);
  assert.match(system, /指定描述来源触发/);
  assert.match(system, /正则匹配并提到黑塔/);
  assert.doesNotMatch(system, /默认深度不允许|零深度不扫描聊天|禁止递归的词不应触发/);
});

test('同名等长角色卡替换后，Host 使用新内容及其世界书', () => {
  const harness = boot();
  const agent = makeAgent('card-content-key');
  harness.emit('agent/created', { agent });
  const original = { ...secondCardFixture(), description: '旧版本', character_book: {
    entries: [{ id: 1, constant: true, content: '原始条目' }],
  } };
  const next = { ...original, description: '新版本', character_book: {
    entries: [{ id: 1, constant: true, content: '新版条目' }],
  } };
  for (const card of [original, next]) {
    harness.emit('agent/inbox/inserted', {
      agent,
      message: envelope({ cardJson: card, cardHash: 'stale-client-hash' }, '继续'),
    });
  }
  const system = agent.sections[0].text();
  assert.match(system, /新版本/);
  assert.match(system, /新版条目/);
  assert.doesNotMatch(system, /旧版本|原始条目/);
});

test('独立世界书只在绑定会话里参与生成，且卡内与独立条目 ID 可相同', () => {
  const harness = boot();
  const agent = makeAgent('chat-book');
  const other = makeAgent('without-chat-book');
  for (const current of [agent, other]) harness.emit('agent/created', { agent: current });
  const card = secondCardFixture();
  card.character_book = { entries: [{ id: 7, constant: true, content: '卡内条目' }] };
  const chatWorldbook = { id: 'world-1', name: '独立世界书', book: {
    entries: { 7: { uid: 7, key: ['渡口'], content: '附加世界设定', sticky: 2 } },
  } };
  harness.emit('agent/inbox/inserted', { agent, message: envelope({ cardJson: card, chatWorldbook }, '渡口') });
  assert.match(agent.sections[0].text(), /附加世界设定/);
  assert.match(agent.sections[0].text(), /卡内条目/);
  harness.emit('agent/inbox/inserted', { agent: other, message: envelope({ cardJson: card }, '渡口') });
  assert.doesNotMatch(other.sections[0].text(), /附加世界设定/);
  harness.emit('agent/inbox/inserted', { agent, message: envelope({ cardJson: card, chatWorldbook: null }, '渡口') });
  assert.doesNotMatch(agent.sections[0].text(), /附加世界设定/);
});

test('pre-step：信封被剥离，只留用户原文，消息 id 不变', async () => {
  const harness = boot();
  const a = makeAgent('agent-a');
  harness.emit('agent/created', { agent: a });
  const message = envelope({ cardJson: cardFixture(), greeting: '开场白' }, '只有正文');
  const decision = { kind: 'enter', messages: [message], startsRequestSeries: true };

  const result = await harness.emit('agent/pre-step', { agent: a, messages: [message] }, async () => decision);
  assert.equal(result.kind, 'enter');
  assert.equal(result.startsRequestSeries, true);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].id, message.id);
  assert.equal(result.messages[0].content[0].text, '只有正文');
  assert.equal(JSON.stringify(result.messages).includes(MARK), false, '信封不能泄漏进日志');
});

test('pre-step：没有信封时原样返回同一个 decision', async () => {
  const harness = boot();
  const a = makeAgent('agent-a');
  harness.emit('agent/created', { agent: a });
  const plain = { id: 'x', content: [{ type: 'text', text: '普通消息' }] };
  const decision = { kind: 'enter', messages: [plain] };
  const result = await harness.emit('agent/pre-step', { agent: a }, async () => decision);
  assert.equal(result, decision);
});

test('pre-step：预设绑定失败也会移除消息中的内部数据', async () => {
  const harness = boot();
  const agent = makeAgent('malformed-preset');
  const message = envelope({ presetJson: { prompts: [null] } }, '这是玩家正文');
  const decision = { kind: 'enter', messages: [message] };
  const result = await harness.emit('agent/pre-step', { agent }, async () => decision);
  assert.equal(result.messages[0].content[0].text, '这是玩家正文');
  assert.equal(result.messages[0].id, message.id);
});

test('没有 agent 时走兜底记录，不抛错', () => {
  const harness = boot();
  const recordSection = () => {
    const message = envelope({ cardJson: cardFixture() }, '正文');
    harness.emit('agent/inbox/inserted', { agent: undefined, message });
  };
  assert.doesNotThrow(recordSection);
});

test('agent/created 之后同一个 agent 不会重复注册段', () => {
  const harness = boot();
  const a = makeAgent('agent-a');
  harness.emit('agent/created', { agent: a });
  harness.emit('agent/created', { agent: a });
  harness.emit('agent/inbox/inserted', { agent: a, message: envelope({ cardJson: cardFixture() }, 'x') });
  assert.equal(a.sections.length, 1);
});

test('世界书正则（placement=5）作用于条目正文', () => {
  const harness = boot();
  const a = makeAgent('agent-wi-regex');
  harness.emit('agent/created', { agent: a });
  const card = {
    spec: 'chara_card_v3',
    data: {
      name: '正则卡',
      description: '一个用于验证正则的卡。',
      first_mes: '',
      character_book: {
        entries: [{
          id: 1,
          keys: [],
          content: '【提示】真正的正文。',
          constant: true,
          position: 'before_char',
          insertion_order: 10,
          enabled: true,
        }],
      },
      extensions: {
        regex_scripts: [{
          scriptName: '去提示',
          findRegex: '/【[^】]*】/g',
          replaceString: '',
          placement: [5],
          promptOnly: true,
        }],
      },
    },
  };
  harness.emit('agent/inbox/inserted', { agent: a, message: envelope({ cardJson: card }, 'hi') });
  const text = a.sections[0].text();
  assert.match(text, /真正的正文/);
  assert.equal(text.includes('【提示】'), false, 'placement=5 的正则应当把世界书里的标记去掉');
});

test('用户输入正则（placement=1）在 pre-step 生效', async () => {
  const harness = boot();
  const a = makeAgent('agent-user-regex');
  harness.emit('agent/created', { agent: a });
  // 夹具卡里有 promptOnly 规则：把 ... 换成全角省略号，placement [1,2]。
  harness.emit('agent/inbox/inserted', { agent: a, message: envelope({ cardJson: cardFixture() }, '他说...好') });
  const message = envelope({ cardJson: cardFixture() }, '他说...好');
  const decision = { kind: 'enter', messages: [message] };
  const result = await harness.emit('agent/pre-step', { agent: a }, async () => decision);
  assert.equal(result.messages[0].content[0].text, '他说……好');
});

test('只用于显示的正则不会改提示词', async () => {
  const harness = boot();
  const a = makeAgent('agent-display-regex');
  harness.emit('agent/created', { agent: a });
  const card = {
    spec: 'chara_card_v3',
    data: {
      name: '显示正则卡',
      description: '描述',
      first_mes: '',
      extensions: {
        regex_scripts: [{
          scriptName: '只显示',
          findRegex: '/ABC/g',
          replaceString: 'xyz',
          placement: [1],
          markdownOnly: true,
        }],
      },
    },
  };
  harness.emit('agent/inbox/inserted', { agent: a, message: envelope({ cardJson: card }, 'ABC') });
  const message = envelope({ cardJson: card }, 'ABC');
  const result = await harness.emit('agent/pre-step', { agent: a }, async () => ({ kind: 'enter', messages: [message] }));
  assert.equal(result.messages[0].content[0].text, 'ABC', 'markdownOnly 的规则不该进提示词');
});
