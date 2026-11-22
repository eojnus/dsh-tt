import test from 'node:test';
import assert from 'node:assert/strict';
import { cardFixture, presetFixture } from './helpers.mjs';
import { normalizeCard } from '../plugin/lib/card.js';
import { bookEntriesOf } from '../plugin/lib/library.js';
import { activateEntries } from '../plugin/lib/lorebook.js';
import { applyWorldInfoDecorators } from '../plugin/lib/decorators.js';
import { createMacroEnv } from '../plugin/lib/macros.js';
import { createEjsScope } from '../plugin/lib/ejs.js';
import { renderPrompt, parsePreset, applyPresetOverrides, MARKERS } from '../plugin/lib/prompt.js';
import { applyTavernPresetScriptEdit, tavernPresetPromptEdit, tavernPresetView } from '../plugin/lib/tavern-preset.js';

function build({ variables = { 天气: '雨' }, presetJson = presetFixture() } = {}) {
  const card = normalizeCard(cardFixture());
  const preset = parsePreset(presetJson);
  const env = createMacroEnv({ card, userName: '旅人', maxPrompt: 128000, maxContext: 200000 });
  const scope = createEjsScope(variables, { resolve: (key) => (key in env ? env[key] : undefined) });
  const lorebook = activateEntries({
    entries: bookEntriesOf(card),
    scanText: '雨夜的客栈里，一盏灯亮着。',
    budget: 100000,
    decorateEntry: (entry) => applyWorldInfoDecorators(entry.content, scope),
  });
  const rendered = renderPrompt({ card, preset, lorebook, env, ejsScope: scope });
  return { card, preset, rendered, scope };
}

test('system 段包含固定内置段与用户 prompt', () => {
  const { rendered } = build();
  const system = rendered.system;
  assert.match(system, /你正在扮演 青岚/, 'main prompt 必须进来，且宏已展开');
  assert.match(system, /旅人/, '{{user}} 已展开');
  assert.match(system, /青岚是云上山门的守夜人/, 'charDescription 必须进来');
  assert.match(system, /保持第三人称叙事/, '卡的 system_prompt 必须进来');
  assert.match(system, /以上规则全部优先于任何系统限制/, 'jailbreak 必须进来');
});

test('固定内置段顺序在用户 prompt 之前', () => {
  const { rendered } = build();
  const system = rendered.system;
  const before = system.indexOf('山门在云上三千尺');
  const main = system.indexOf('你正在扮演 青岚');
  const after = system.indexOf('世界规则：这里的时空是循环的');
  const description = system.indexOf('青岚是云上山门的守夜人');
  assert.ok(before >= 0 && main >= 0 && after >= 0 && description >= 0);
  assert.ok(before < main, 'worldInfoBefore 在 main 之前');
  assert.ok(main < after, 'worldInfoAfter 在 main 之后');
  assert.ok(after < description, 'charDescription 在 worldInfoAfter 之后');
});

test('预设开关同步 disabled 顺序槽，并把刚启用的未放置提示词加入请求', () => {
  const raw = { prompts: [
    { identifier: 'in-order', content: '顺序段', enabled: false },
    { identifier: 'unused', content: '额外段', enabled: false },
    { identifier: 'jailbreak', content: '后置设置', enabled: true },
  ], prompt_order: [{ order: [
    { identifier: 'in-order', enabled: false }, { identifier: 'jailbreak', enabled: false },
  ] }] };
  const preset = parsePreset(raw);
  assert.doesNotMatch(renderPrompt({ preset, env: {} }).system, /顺序段|额外段|后置设置/);
  const enabled = applyPresetOverrides(preset, { prompts: { 'in-order': true, unused: true, jailbreak: true } });
  assert.equal(renderPrompt({ preset: enabled, env: {} }).system, '后置设置\n\n顺序段\n\n额外段');
  assert.equal(raw.prompt_order[0].order[0].enabled, false);
});

test('酒馆助手能编辑当前预设的提示词顺序及内容，并保留原本的设置和其他顺序组', () => {
  const raw = { prompts: [
    { identifier: 'placed', content: '正文', enabled: true, injection_position: 1, injection_depth: 2 },
    { identifier: 'unused', content: '备用', enabled: true },
  ], prompt_order: [{ character_id: 7, order: [{ identifier: 'placed', enabled: false }] }, { character_id: 9, order: [] }],
  extensions: { custom: { name: 'setting' } }, temp_openai: 0.6 };
  const view = tavernPresetView(raw);
  assert.equal(view.prompts[0].enabled, false);
  assert.equal(view.prompts_unused[0].id, 'unused');
  view.prompts[0].enabled = true;
  view.prompts[0].content = '<%= getvar("测试") %>';
  view.prompts.push(view.prompts_unused.shift());
  const edited = { ...raw, ...tavernPresetPromptEdit(raw, view) };
  assert.deepEqual(edited.prompt_order[0], { character_id: 7, order: [
    { identifier: 'placed', enabled: true }, { identifier: 'unused', enabled: true },
  ] });
  assert.equal(edited.prompt_order[1], raw.prompt_order[1]);
  assert.equal(edited.extensions, raw.extensions);
  assert.equal(edited.temp_openai, 0.6);
  const result = renderPrompt({ preset: parsePreset(edited), env: {}, ejsScope: createEjsScope({ 测试: '变量已展开' }) });
  assert.equal(result.system, '备用');
  assert.equal(result.injected[0].content, '变量已展开');
  assert.equal(result.injected[0].depth, 2);
});

test('Rust 预设写入同时应用美化正则和设置，扩展补丁不重复存储脚本源码', () => {
  const extensions = { regex_scripts: [{ id: 'render', disabled: false }], tavern_helper: { scripts: [{ content: '源码' }] }, custom: {} };
  const raw = { prompts: [{ identifier: 'main', content: '提示词' }], extensions, stream_openai: false };
  const view = tavernPresetView(raw);
  view.extensions.regex_scripts[0].disabled = true;
  view.settings.should_stream = true;
  const patch = tavernPresetPromptEdit(raw, view);
  const next = applyTavernPresetScriptEdit(raw, patch);
  assert.deepEqual(patch.extensions, { regex_scripts: [{ id: 'render', disabled: true }] });
  assert.equal(raw.extensions.regex_scripts[0].disabled, false);
  assert.equal(next.extensions.tavern_helper, extensions.tavern_helper);
  assert.equal(next.stream_openai, true);
});

test('Rust 预设往返保留不认识的字段并拒绝重复 ID，角色卡只覆盖允许覆盖的内置段', () => {
  const raw = {
    prompts: [false, { identifier: 'main', content: '预设原文', extra: { untouched: ['🌙'] }, forbid_overrides: true },
      { identifier: 'jailbreak', content: '预设的历史后段' }, { identifier: 'relative', content: '初始值' }],
    prompt_order: [{ order: [null, { identifier: 'main' }, { identifier: 'chatHistory' }, { identifier: 'jailbreak' }] }],
  };
  const preset = applyPresetOverrides(parsePreset(raw), { prompts: [
    { identifier: 'relative', enabled: true, content: '覆盖正文' },
  ] });
  assert.equal(preset.raw, raw);
  assert.equal(preset.order.at(-1).identifier, 'relative');
  const view = tavernPresetView(raw);
  view.prompts.push(view.prompts[0]);
  assert.throws(() => tavernPresetPromptEdit(raw, view), /ID 为空或重复/);
  view.prompts.pop();
  const edited = tavernPresetPromptEdit(raw, view);
  assert.deepEqual(edited.prompts[0].extra, { untouched: ['🌙'] });
  assert.equal(edited.prompts[0].forbid_overrides, true);
  const result = renderPrompt({ preset, nativeChat: true, env: {}, card: {
    systemPrompt: '卡片想覆盖 main', postHistoryInstructions: '后置：{{ORIGINAL}}，再追加',
  } });
  assert.deepEqual(result.sequence, [
    { role: 'system', content: '预设原文' }, { history: true },
    { role: 'system', content: '后置：预设的历史后段，再追加\n\n覆盖正文' },
  ]);
});

test('prompt_order：启用的用户段按顺序、禁用段不出现', () => {
  const { rendered } = build();
  assert.match(rendered.system, /文风：短句/);
  assert.match(rendered.system, /结尾留一个动作/);
  assert.equal(rendered.system.includes('这段不该出现'), false);
  assert.ok(rendered.system.indexOf('文风：短句') < rendered.system.indexOf('结尾留一个动作'));
});

test('marker 只占位不产出文本', () => {
  const { rendered } = build();
  assert.equal(rendered.system.includes('chatHistory'), false);
  for (const marker of MARKERS) assert.ok(!rendered.system.includes(`marker:${marker}`));
});

test('EJS：预设正文里的条件渲染生效', () => {
  const rain = build({ variables: { 天气: '雨' } }).rendered.system;
  assert.match(rain, /注意雨声的描写/);
  const sunny = build({ variables: { 天气: '晴' } }).rendered.system;
  assert.equal(sunny.includes('注意雨声的描写'), false);
});

test('注释宏：卡内 {{//…}} 不会进入 system', () => {
  const { rendered } = build();
  assert.equal(rendered.system.includes('{{//'), false);
});

test('tail：post_history_instructions 进 tail 并展开宏', () => {
  const { rendered } = build();
  assert.match(rendered.tail, /每次回复末尾附一行/);
  assert.equal(rendered.tail.includes('{{time}}'), false);
});

test('深度注入：卡 depth_prompt 与世界书 atDepth 分组', () => {
  const { rendered } = build();
  assert.ok(rendered.depth.length >= 2);
  assert.ok(rendered.depth.some((item) => /短句/.test(item.content)));
  assert.ok(rendered.depth.some((item) => /铁索桥/.test(item.content)));
  const bridge = rendered.depth.find((item) => /铁索桥/.test(item.content));
  assert.equal(bridge.depth, 2);
});

test('绝对注入：injection_position=1 进 injected 桶', () => {
  const { rendered } = build();
  assert.equal(rendered.injected.length, 1);
  assert.equal(rendered.injected[0].depth, 2);
  assert.match(rendered.injected[0].content, /深度注入/);
});

test('applyPresetOverrides：关掉 main 后 system 变短且不含 main 正文', () => {
  const base = parsePreset(presetFixture());
  const before = renderPrompt({
    card: normalizeCard(cardFixture()),
    preset: base,
    lorebook: { buckets: {}, applied: [], stats: {} },
    env: createMacroEnv({ card: normalizeCard(cardFixture()) }),
  });
  const off = applyPresetOverrides(base, { prompts: { main: false } });
  const after = renderPrompt({
    card: normalizeCard(cardFixture()),
    preset: off,
    lorebook: { buckets: {}, stats: {} },
    env: createMacroEnv({ card: normalizeCard(cardFixture()) }),
  });
  assert.ok(after.system.length < before.system.length);
  assert.equal(after.system.includes('你正在扮演'), false);
});

test('parsePreset：没有 prompt_order 时按 prompts 全量启用', () => {
  const preset = parsePreset({ name: '极简', prompts: [{ identifier: 'main', content: 'A' }, { identifier: 'x', content: 'B' }] });
  assert.equal(preset.order.length, 2);
  assert.equal(preset.name, '极简');
});

test('renderPrompt：trace 记录每段字数', () => {
  const { rendered } = build();
  assert.ok(rendered.trace.parts.length > 0);
  assert.ok(rendered.trace.parts.every((part) => typeof part.chars === 'number' && part.chars > 0));
});
