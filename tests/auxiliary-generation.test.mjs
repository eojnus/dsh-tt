import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../plugin/index.js';
import { GENERATION_PATH, handleAuxiliaryGeneration } from '../plugin/lib/dsh-generation.js';
import { cardAssetsWasm } from '../plugin/lib/card-assets-wasm.js';
import { runPromptPipeline } from '../plugin/lib/pipeline.js';

const selection = { provider: 'configured', model: 'session-model', reasoningEffort: 'low' };
const request = (input) => new Request(new URL(GENERATION_PATH, 'http://localhost'), {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
});
const input = {
  sessionId: 'the-session',
  options: { user_input: '继续', max_chat_history: 1, ordered_prompts: ['char_description', 'chat_history',
    { role: 'user', content: '补齐格式' }] },
  builtins: { char_description: '人物' },
  history: [{ role: 'user', content: '较早' }, { role: 'assistant', content: '上一次' }],
  depth: [{ role: 'system', depth: 1, content: '按深度插入' }],
};

test('DSH 通过受认证的 Connection 路由将 Rust 组装的消息交给当前模型', async () => {
  let route;
  apply({ inject(services, mount) {
    if (services.includes('profileContext')) return;
    if (services.length === 1 && services[0] === 'llm') {
      mount({ on(event) { assert.equal(event, 'llm/stream'); } });
      return;
    }
    assert.deepEqual(services, ['connection', 'llm', 'sessionController']);
    mount({
      connection: { fetch: { register(value) { route = value; } } },
      sessionController: { async resolveAgent(id) {
        assert.equal(id, input.sessionId);
        return { agent: { model: { current: () => selection } } };
      } },
      llm: { async *stream(options) {
        assert.equal(options.model, selection.model);
        assert.equal(options.provider, selection.provider);
        assert.deepEqual(options.messages.map(({ role, content }) => [role, content[0].text]), [
          ['system', '人物'], ['assistant', '上一次'], ['system', '按深度插入'], ['user', '继续'], ['user', '补齐格式'],
        ]);
        yield { type: 'reasoning-delta', text: '理由' };
        yield { type: 'text-delta', text: '完成' };
        yield { type: 'finish', reason: { kind: 'stop' } };
      } },
    });
  } });
  assert.equal(route.path, GENERATION_PATH);
  assert.deepEqual(route.methods, ['POST']);
  const response = await route.fetch(request(input));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.text()).trim().split('\n').map(JSON.parse), [
    { type: 'reasoning', text: '理由' }, { type: 'text', text: '完成' }, { type: 'done' },
  ]);
});

test('辅助生成拒绝脚本指定外部 API，并且取消响应会取消模型请求', async () => {
  const denied = await handleAuxiliaryGeneration({}, request({ ...input, options: { custom_api: { apiurl: 'https://example.org' } } }));
  assert.equal(denied.status, 400);

  let signal;
  const response = await handleAuxiliaryGeneration({
    sessionController: { async resolveAgent() { return { agent: { model: { current: () => selection } } }; } },
    llm: { async *stream(options) {
      signal = options.signal;
      yield { type: 'text-delta', text: '片段' };
      if (!signal.aborted) await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
    } },
  }, request(input));
  const reader = response.body.getReader();
  assert.equal((await reader.read()).done, false);
  await reader.cancel();
  assert.equal(signal.aborted, true);
});

test('ST 扩展原始生成只发送显式消息，并映射响应长度和温度', async () => {
  const response = await handleAuxiliaryGeneration({
    sessionController: { async resolveAgent() { return { agent: { model: { current: () => selection } } }; } },
    llm: { async *stream(options) {
      assert.equal(options.maxTokens, 40);
      assert.equal(options.temperature, 0.4);
      assert.deepEqual(options.messages.map(({ role, content }) => [role, content[0].text]),
        [['system', '仅扩展上下文'], ['assistant', '预填充']]);
      yield { type: 'text-delta', text: '完成' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    } },
  }, request({
    ...input, mode: 'generateRaw',
    options: { prompt: [{ role: 'system', content: '仅扩展上下文' }, { role: 'assistant', content: '预填充' }],
      responseLength: 40, temperature: 0.4 },
  }));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /"type":"done"/);
});

test('Rust 只把扫描注入交给世界书，把聊天注入加入提示词', () => {
  const result = runPromptPipeline({
    entries: [{ uid: 1, key: ['灯塔'], content: '世界书命中' }],
    chatMessages: ['普通聊天'],
    scriptPrompts: [
      { position: 'none', content: '去灯塔', should_scan: true },
      { position: 'in_chat', depth: 1, role: 'system', content: '脚本提示词' },
    ],
  });
  assert.match(result.sectionText, /世界书命中/);
  assert.match(result.sectionText, /脚本提示词/);
  assert.doesNotMatch(result.sectionText, /去灯塔/);
});

test('Rust 动态显示保留数据标签，阻止 HTML 和 JS 捕获值跳出所在位置', () => {
  const wasm = cardAssetsWasm();
  const text = '</textarea><script>x()</script>` ${x()} &';
  assert.equal(wasm.encodeDisplayCapture('tree', [
    { name: 'option', children: [text] }, { name: 'img', children: [] }, { name: 'br', children: [] },
  ]), '<option>&lt;/textarea&gt;&lt;script&gt;x()&lt;/script&gt;` ${x()} &amp;</option><br>');
  assert.match(wasm.encodeDisplayCapture('text', text), /^&lt;\/textarea&gt;/);
  const literal = wasm.encodeDisplayCapture('script', text);
  assert.doesNotMatch(literal, /</);
  assert.equal(JSON.parse(literal), text);
});
