// 提示词组装：复刻 ST 的 system 段顺序（设计文档 §14.3）+ 深度注入。
// v2：跨块 EJS（整段配对）、注入条目也走渲染、记录可诊断的组装轨迹。

import { substitute } from './macros.js';
import { renderEjs, renderEjsMessages } from './ejs.js';
import { joinDecorated } from './decorators.js';
import { cardAssetsWasm } from './card-assets-wasm.js';

/** ST 的内置 marker（位置占位符，不产出文本）。 */
export const MARKERS = new Set([
  'main', 'worldInfoBefore', 'worldInfoAfter', 'charDescription', 'charPersonality',
  'scenario', 'personaDescription', 'chatHistory', 'enhanceDefinitions', 'nsfw', 'jailbreak',
]);

export function parsePreset(json) {
  if (!json || typeof json !== 'object') return null;
  const normalized = cardAssetsWasm().normalizePreset({
    name: json.name, preset_name: json.preset_name, prompts: json.prompts,
    order: Array.isArray(json.prompt_order) ? json.prompt_order[0]?.order : null,
  });
  if (!normalized) throw new Error('Rust 无法解析预设提示词');
  return { ...normalized, raw: json };
}

/**
 * 应用客户端的面板覆盖（启停、顺序）。不修改原始预设对象。
 * @param {object} preset
 * @param {{ prompts?: Record<string, {enabled?: boolean, content?: string}> | {identifier: string, enabled?: boolean}[], order?: {identifier: string, enabled?: boolean}[] }} overrides
 */
export function applyPresetOverrides(preset, overrides) {
  if (!preset || !overrides || typeof overrides !== 'object') return preset;
  if (!overrides.order?.length && !Object.keys(overrides.prompts ?? {}).length) return preset;
  const updated = cardAssetsWasm().applyPresetOverrides({
    prompts: preset.prompts, order: preset.order, overrides,
  });
  if (!updated) throw new Error('Rust 无法应用预设覆盖');
  return { ...preset, ...updated };
}

function promptByIdentifier(preset, identifier) {
  return preset?.prompts.find((p) => p.identifier === identifier);
}

const BUILTINS = ['worldInfoBefore', 'main', 'worldInfoAfter', 'charDescription', 'charPersonality',
  'scenario', 'personaDescription', 'nsfw', 'jailbreak'];

function presetLayoutInput(preset) {
  const prompts = preset?.prompts ?? [];
  const order = Array.isArray(preset?.order) ? preset.order : [];
  const ordinary = (value) => value == null || ['number', 'string', 'boolean'].includes(typeof value);
  if (!Array.isArray(prompts) || prompts.some((prompt) => typeof prompt?.identifier !== 'string'
    || !ordinary(prompt.injection_position)) || order.some((slot) => typeof slot?.identifier !== 'string')) return null;
  return {
    prompts: prompts.map((prompt) => [prompt.identifier, prompt.enabled !== false, Boolean(prompt.content), Number(prompt.injection_position) === 1]),
    order: order.map((slot) => [slot.identifier, slot.enabled !== false]),
  };
}

function planWithRust(preset, wasm) {
  const input = presetLayoutInput(preset);
  return input && wasm?.planMainPrompt?.(input);
}

function markerEnabled(marker, preset) {
  if (marker === 'personaDescription') return true;
  const slot = Array.isArray(preset?.order) ? preset.order.find((entry) => entry?.identifier === marker) : null;
  if (slot?.enabled === false) return false;
  if (marker === 'nsfw' || marker === 'jailbreak') {
    const prompt = promptByIdentifier(preset, marker);
    return Boolean(prompt && prompt.enabled !== false);
  }
  return promptByIdentifier(preset, marker)?.enabled !== false;
}

function markerContent(marker, { card, lorebook, persona, preset, decorate }) {
  const join = (list) => (decorate ? decorate(list) : (list?.length ? list.join('\n') : ''));
  switch (marker) {
    case 'worldInfoBefore': return join(lorebook?.buckets?.before);
    case 'worldInfoAfter': return join(lorebook?.buckets?.after);
    case 'charDescription': return card?.description ?? '';
    case 'charPersonality': return card?.personality ?? '';
    case 'scenario': return card?.scenario ?? '';
    case 'personaDescription': return persona?.description ?? '';
    case 'main':
    case 'nsfw':
    case 'jailbreak': return promptByIdentifier(preset, marker)?.content ?? '';
    default: return '';
  }
}

/**
 * 渲染 system 段、tail 段与"在对话中按深度注入"的条目。
 * ST 语义：injection_position = 0（相对 system）/ 1（绝对注入，按 injection_depth 插进对话）。
 *
 * 跨块 EJS：先收集原文，最后整段渲染——模板允许 `<%` 在上一块、`%>` 在下一块。
 *
 * @returns {{
 *   system: string,
 *   tail: string,
 *   depth: {role:string, content:string}[],
 *   injected: {role:string, content:string, depth:number}[],
 *   trace: { parts: {label:string, chars:number, rendered:number}[], depth: number, injected: number, preset: string|null }
 * }}
 */
export function renderPrompt({ card, preset, lorebook, persona, env, macroOptions, ejsScope = {}, wasm = cardAssetsWasm(), nativeChat = false }) {
  const parts = [];
  let injectedRaw = [];
  const trace = { parts: [], depth: 0, injected: 0, preset: preset?.name ?? null };

  // ① EJS → ② ST 宏（顺序与 ST-Prompt-Template 一致）
  const options = nativeChat ? { ...macroOptions, variableStore: Object.assign(Object.create(null), env?.__vars) } : macroOptions;
  const render = (text) => substitute(renderEjs(String(text ?? ''), ejsScope), env, options);

  // 先收集原文，最后整段渲染：EJS 允许跨块配对（<% 在此、%> 在彼）
  const push = (text, label) => {
    const raw = String(text ?? '');
    if (!raw.trim()) return;
    parts.push(raw);
    trace.parts.push({ label: label || 'part', chars: raw.length, rendered: 0 });
  };

  const consumePrompt = (prompt, absolute) => {
    if (!prompt || prompt.enabled === false) return;
    const content = prompt.content;
    if (!content) return;
    const isAbsolute = absolute ?? Number(prompt.injection_position) === 1;
    if (isAbsolute) {
      const depth = Number(prompt.injection_depth) || 0;
      injectedRaw.push({ role: chatRole(prompt.role), content, depth, order: Number(prompt.injection_order ?? 100) || 0 });
      return;
    }
    push(content, prompt.name || prompt.identifier || 'prompt');
  };

  // ST 的固定内置段（§14.3）：无论 prompt_order 是否列出，都按这个顺序在前。
  // prompt_order 只决定"用户 prompt"部分的顺序。
  const decorate = (list) => joinDecorated(list, ejsScope, '\n');
  const tailPartsRaw = [];
  for (const item of lorebook?.buckets?.ANTop ?? []) tailPartsRaw.push(item);
  for (const item of lorebook?.buckets?.ANBottom ?? []) tailPartsRaw.push(item);
  let sequence = null;
  if (nativeChat) {
    const worldInfoSources = {
      worldInfoBefore: () => decorate(lorebook?.buckets?.before),
      worldInfoAfter: () => decorate(lorebook?.buckets?.after),
      authorsNote: () => joinDecorated(tailPartsRaw, ejsScope, '\n\n'),
    };
    const compiled = wasm?.prepareChatTemplates?.({
      prompts: preset?.prompts ?? [], order: preset?.order ?? [], prefix: preset?.raw?.assistant_prefill,
      overrides: { main: card?.systemPrompt, jailbreak: card?.postHistoryInstructions },
      builtins: { charDescription: card?.description, charPersonality: card?.personality,
        scenario: card?.scenario, personaDescription: persona?.description },
    }, (source) => worldInfoSources[source]());
    if (!compiled) throw new Error('无法运行 Rust 对话提示词编排');
    const { groups } = compiled;
    trace.parts = compiled.trace;
    injectedRaw = compiled.injected;
    const sections = renderEjsMessages(groups.flatMap(({ content }) => content === undefined ? [] : [content]), ejsScope);
    let renderedIndex = 0;
    sequence = groups.flatMap((group) => {
      if (typeof group.history === 'boolean') return [{ history: group.history }];
      const output = substitute(sections[renderedIndex++], env, options);
      if (!output.trim()) return [];
      return [{ role: group.role, content: group.prefix ? output : output.trim() }];
    });
  } else {
    const plan = planWithRust(preset, wasm);
    for (const marker of plan?.markers ?? BUILTINS) {
      if (!plan && !markerEnabled(marker, preset)) continue;
      push(markerContent(marker, { card, lorebook, persona, preset, decorate }), `marker:${marker}`);
    }
    if (plan) {
      for (const [index, absolute] of plan.ordered) consumePrompt(preset.prompts[index], absolute);
    } else {
      for (const slot of preset?.order ?? []) {
        if (slot && slot.enabled !== false && !MARKERS.has(slot.identifier)) consumePrompt(promptByIdentifier(preset, slot.identifier));
      }
    }
    push(card?.systemPrompt, 'card:systemPrompt');
    if (card?.postHistoryInstructions) tailPartsRaw.push(card.postHistoryInstructions);
  }
  const historyIndex = sequence?.findIndex((item) => Object.hasOwn(item, 'history'));
  const flatten = (items) => items.map(({ content }) => content).filter(Boolean).join('\n\n');
  const system = sequence ? flatten(sequence.slice(0, historyIndex)) : render(parts.join('\n\n')).trim();
  const tail = sequence ? flatten(sequence.slice(historyIndex + 1)) : render(joinDecorated(tailPartsRaw, ejsScope, '\n\n')).trim();

  const depth = [];
  for (const group of lorebook?.buckets?.depth ?? []) {
    const content = render(joinDecorated(group.entries, ejsScope, '\n\n')).trim();
    if (content) depth.push({ role: group.role || 'system', content, depth: Number(group.depth) || 0 });
  }
  if (card?.depthPrompt?.prompt) {
    const content = render(card.depthPrompt.prompt).trim();
    if (content) depth.push({ role: card.depthPrompt.role || 'system', content, depth: Number(card.depthPrompt.depth) || 0 });
  }

  // 绝对注入条目也要渲染；放在最后，能看见前面 setvar 的变量。
  const injected = [];
  for (const item of injectedRaw) {
    const content = render(item.content).trim();
    if (content) injected.push({ role: item.role, content, depth: item.depth, ...(nativeChat && { order: item.order }) });
  }

  trace.depth = depth.length;
  trace.injected = injected.length;
  return { system, tail, depth, injected, trace, sequence };
}

function chatRole(role) {
  return role === 'assistant' || role === 'user' ? role : 'system';
}
