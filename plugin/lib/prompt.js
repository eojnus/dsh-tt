// 提示词组装：复刻 ST 的 system 段顺序（设计文档 §14.3）+ 深度注入。
// v2：跨块 EJS（整段配对）、注入条目也走渲染、记录可诊断的组装轨迹。

import { substitute } from './macros.js';
import { renderEjs } from './ejs.js';
import { joinDecorated } from './decorators.js';
import { cardAssetsWasm } from './card-assets-wasm.js';

/** ST 的内置 marker（位置占位符，不产出文本）。 */
export const MARKERS = new Set([
  'main', 'worldInfoBefore', 'worldInfoAfter', 'charDescription', 'charPersonality',
  'scenario', 'personaDescription', 'chatHistory', 'enhanceDefinitions', 'nsfw', 'jailbreak',
]);

export function parsePreset(json) {
  if (!json || typeof json !== 'object') return null;
  const prompts = Array.isArray(json.prompts) ? json.prompts : [];
  const order = Array.isArray(json.prompt_order) && json.prompt_order[0]?.order
    ? json.prompt_order[0].order
    : prompts.map((p) => ({ identifier: p.identifier, enabled: true }));
  return {
    name: json.name || json.preset_name || '导入的预设',
    prompts,
    order,
    raw: json,
  };
}

/**
 * 应用客户端的面板覆盖（启停、顺序）。不修改原始预设对象。
 * @param {object} preset
 * @param {{ prompts?: Record<string, {enabled?: boolean, content?: string}> | {identifier: string, enabled?: boolean}[], order?: {identifier: string, enabled?: boolean}[] }} overrides
 */
export function applyPresetOverrides(preset, overrides) {
  if (!preset || !overrides || typeof overrides !== 'object') return preset;
  const promptChanges = new Map();
  if (Array.isArray(overrides.prompts)) {
    for (const item of overrides.prompts) {
      if (item && typeof item.identifier === 'string') promptChanges.set(item.identifier, item);
    }
  } else if (overrides.prompts && typeof overrides.prompts === 'object') {
    for (const [identifier, change] of Object.entries(overrides.prompts)) {
      if (typeof change === 'boolean' || (change && typeof change === 'object')) promptChanges.set(identifier, change);
    }
  }

  const prompts = preset.prompts.map((prompt) => {
    const change = promptChanges.get(prompt.identifier);
    if (change === undefined) return prompt;
    const next = { ...prompt };
    if (typeof change === 'boolean') next.enabled = change;
    else {
      if (typeof change.enabled === 'boolean') next.enabled = change.enabled;
      if (typeof change.content === 'string') next.content = change.content;
    }
    return next;
  });

  const order = Array.isArray(overrides.order) && overrides.order.length
    ? overrides.order.map((slot) => ({ ...slot }))
    : preset.order;

  return { ...preset, prompts, order };
}

function promptByIdentifier(preset, identifier) {
  return preset?.prompts.find((p) => p.identifier === identifier);
}

const BUILTINS = ['worldInfoBefore', 'main', 'worldInfoAfter', 'charDescription', 'charPersonality',
  'scenario', 'personaDescription', 'nsfw', 'jailbreak'];

function planWithRust(preset, wasm) {
  if (!wasm?.planMainPrompt) return null;
  const prompts = preset?.prompts ?? [];
  const order = Array.isArray(preset?.order) ? preset.order : [];
  const ordinary = (value) => value == null || ['number', 'string', 'boolean'].includes(typeof value);
  if (!Array.isArray(prompts) || prompts.some((prompt) => typeof prompt?.identifier !== 'string'
    || !ordinary(prompt.injection_position)) || order.some((slot) => typeof slot?.identifier !== 'string')) return null;
  return wasm.planMainPrompt({
    prompts: prompts.map((prompt) => [prompt.identifier, prompt.enabled !== false, Boolean(prompt.content), Number(prompt.injection_position) === 1]),
    order: order.map((slot) => [slot.identifier, slot.enabled !== false]),
  });
}

function markerEnabled(marker, preset) {
  if (marker === 'personaDescription') return true;
  if (marker === 'nsfw' || marker === 'jailbreak') {
    const prompt = promptByIdentifier(preset, marker);
    return Boolean(prompt && prompt.enabled !== false);
  }
  const slot = Array.isArray(preset?.order) ? preset.order.find((entry) => entry.identifier === marker) : null;
  return slot?.enabled !== false && promptByIdentifier(preset, marker)?.enabled !== false;
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
export function renderPrompt({ card, preset, lorebook, persona, env, macroOptions, ejsScope = {}, wasm = cardAssetsWasm() }) {
  const parts = [];
  const injectedRaw = [];
  const trace = { parts: [], depth: 0, injected: 0, preset: preset?.name ?? null };

  // ① EJS → ② ST 宏（顺序与 ST-Prompt-Template 一致）
  const render = (text) => substitute(renderEjs(String(text ?? ''), ejsScope), env, macroOptions);

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
      injectedRaw.push({ role: prompt.role || 'system', content, depth, label: prompt.name || prompt.identifier || 'inject' });
      return;
    }
    push(content, prompt.name || prompt.identifier || 'prompt');
  };

  // ST 的固定内置段（§14.3）：无论 prompt_order 是否列出，都按这个顺序在前。
  // prompt_order 只决定"用户 prompt"部分的顺序。
  const plan = planWithRust(preset, wasm);
  const decorate = (list) => joinDecorated(list, ejsScope, '\n');
  for (const marker of plan?.markers ?? BUILTINS) {
    if (!plan && !markerEnabled(marker, preset)) continue;
    push(markerContent(marker, { card, lorebook, persona, preset, decorate }), `marker:${marker}`);
  }

  if (plan) {
    for (const [index, absolute] of plan.ordered) consumePrompt(preset.prompts[index], absolute);
  } else if (Array.isArray(preset?.order)) {
    for (const slot of preset.order) {
      if (!slot || slot.enabled === false) continue;
      const identifier = slot.identifier;
      // 内置段已在前面处理；marker 只表示位置，不重复消费。
      if (MARKERS.has(identifier)) continue;
      consumePrompt(promptByIdentifier(preset, identifier));
    }
  }

  // 卡自带的 system_prompt 追加在预设之后；depth_prompt 只进深度桶，不再重复进 system。
  push(card?.systemPrompt, 'card:systemPrompt');

  const system = render(parts.join('\n\n')).trim();

  const tailPartsRaw = [];
  for (const item of lorebook?.buckets?.ANTop ?? []) tailPartsRaw.push(item);
  for (const item of lorebook?.buckets?.ANBottom ?? []) tailPartsRaw.push(item);
  if (card?.postHistoryInstructions) tailPartsRaw.push(card.postHistoryInstructions);
  const tail = render(joinDecorated(tailPartsRaw, ejsScope, '\n\n')).trim();

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
    if (content) injected.push({ role: item.role, content, depth: item.depth });
  }

  trace.depth = depth.length;
  trace.injected = injected.length;
  return { system, tail, depth, injected, trace };
}
