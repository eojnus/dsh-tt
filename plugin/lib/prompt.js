// 提示词组装：复刻 ST 的 system 段顺序（设计文档 §14.3）+ 深度注入。
// v1 只拼 system 与 tail（post_history_instructions）；对话历史由 DSH 会话提供。

import { substitute } from './macros.js';

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

function promptByIdentifier(preset, identifier) {
  return preset?.prompts.find((p) => p.identifier === identifier);
}

function markerContent(marker, { card, lorebook, env, persona, preset }) {
  const join = (list) => (list?.length ? list.join('\n') : '');
  switch (marker) {
    case 'worldInfoBefore': return join(lorebook?.buckets?.before);
    case 'worldInfoAfter': return join(lorebook?.buckets?.after);
    case 'charDescription': return card?.description ?? '';
    case 'charPersonality': return card?.personality ?? '';
    case 'scenario': return card?.scenario ?? '';
    case 'personaDescription': return persona?.description ?? '';
    case 'main': {
      const main = preset?.prompts.find((p) => p.identifier === 'main');
      return main?.content ?? '';
    }
    case 'enhanceDefinitions': return '';
    case 'nsfw':
    case 'jailbreak': {
      const p = promptByIdentifier(preset, marker);
      return p?.content ?? '';
    }
    default: return '';
  }
}

/**
 * 渲染 system 段与 tail 段。
 * @returns {{ system: string, tail: string, depth: {role:string, content:string}[] }}
 */
export function renderPrompt({ card, preset, lorebook, persona, env, macroOptions }) {
  const parts = [];
  const push = (text) => {
    const value = substitute(String(text ?? ''), env, macroOptions).trim();
    if (value) parts.push(value);
  };

  const hasOrder = preset?.order?.length;
  if (hasOrder) {
    for (const slot of preset.order) {
      if (slot.enabled === false) continue;
      const identifier = slot.identifier;
      if (MARKERS.has(identifier)) {
        push(markerContent(identifier, { card, lorebook, env, persona, preset }));
        continue;
      }
      const prompt = promptByIdentifier(preset, identifier);
      if (!prompt) continue;
      push(prompt.content);
    }
  } else {
    // 没有预设时的 ST 默认顺序
    push((lorebook?.buckets?.before ?? []).join('\n'));
    push(card?.description);
    push(card?.personality);
    push(card?.scenario);
    push(persona?.description);
    push((lorebook?.buckets?.after ?? []).join('\n'));
  }

  // 卡自带的 system_prompt 与 depth_prompt
  push(card?.systemPrompt);
  if (card?.depthPrompt?.prompt) push(card.depthPrompt.prompt);

  const system = parts.join('\n\n');

  const tailParts = [];
  for (const item of lorebook?.buckets?.ANTop ?? []) tailParts.push(item);
  for (const item of lorebook?.buckets?.ANBottom ?? []) tailParts.push(item);
  if (card?.postHistoryInstructions) tailParts.push(card.postHistoryInstructions);
  const tail = substitute(tailParts.join('\n\n'), env, macroOptions).trim();

  const depth = [];
  for (const group of lorebook?.buckets?.depth ?? []) {
    for (const content of group.entries) {
      depth.push({ role: group.role || 'system', content: substitute(content, env, macroOptions) });
    }
  }
  if (card?.depthPrompt?.depth) {
    depth.push({ role: card.depthPrompt.role || 'system', content: substitute(card.depthPrompt.prompt, env, macroOptions) });
  }

  return { system, tail, depth };
}
