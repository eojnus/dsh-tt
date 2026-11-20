// 角色卡归一化：兼容 Character Card V2（字段在顶层）与 V3（字段包在 data 里）。

import { cardAssetsWasm } from './card-assets-wasm.js';

const str = (v) => (typeof v === 'string' ? v : '');
const arr = (v) => (Array.isArray(v) ? v : []);

export function flattenTavernScripts(value) {
  const scripts = arr(value);
  if (!scripts.some((item) => item?.type === 'folder')) return scripts;
  return scripts.flatMap((item) => {
    if (item?.type !== 'folder') return [item];
    const children = flattenTavernScripts(item.scripts);
    return item.enabled === false
      ? children.map((script) => script && { ...script, enabled: false })
      : children;
  });
}

const TEXT_FIELDS = {
  name: 'name',
  creator: 'creator',
  characterVersion: 'character_version',
  description: 'description',
  personality: 'personality',
  scenario: 'scenario',
  firstMes: 'first_mes',
  mesExample: 'mes_example',
  systemPrompt: 'system_prompt',
  postHistoryInstructions: 'post_history_instructions',
  creatorNotes: 'creator_notes',
  tags: 'tags',
  alternateGreetings: 'alternate_greetings',
};
const isTextList = (name) => name === 'tags' || name === 'alternateGreetings';

function normalizeText(inner, wasm) {
  const fields = {};
  for (const [name, key] of Object.entries(TEXT_FIELDS)) {
    const value = inner[key];
    fields[name] = isTextList(name)
      ? arr(value).map((item) => typeof item === 'string' ? item : null)
      : typeof value === 'string' ? value : null;
  }
  const normalized = wasm.normalizeText(fields);
  if (normalized) return Object.assign(fields, normalized);

  for (const name of Object.keys(fields)) {
    fields[name] = isTextList(name) ? fields[name].filter((item) => item !== null) : str(fields[name]);
  }
  fields.name ||= '未命名角色';
  return fields;
}

function pickExtension(extensions, key) {
  if (!extensions || typeof extensions !== 'object') return undefined;
  return extensions[key];
}

/**
 * @param {any} raw 已解析的卡 JSON
 * @returns 归一化后的卡（保留原始对象在 raw 字段，写回时用）
 */
export function normalizeCard(raw, wasm = cardAssetsWasm()) {
  const isV3 = raw && typeof raw.spec === 'string' && raw.spec.startsWith('chara_card_v3') && raw.data;
  const inner = isV3 ? raw.data : raw || {};
  const extensions = inner.extensions && typeof inner.extensions === 'object' ? inner.extensions : {};

  const characterBook = inner.character_book ?? null;
  const th = pickExtension(extensions, 'tavern_helper') ?? null;
  const thScripts = flattenTavernScripts(th?.scripts);
  const regexScripts = arr(pickExtension(extensions, 'regex_scripts'));
  const depthPrompt = pickExtension(extensions, 'depth_prompt') ?? null;
  const text = normalizeText(inner, wasm);

  return {
    spec: isV3 ? String(raw.spec) : 'chara_card_v2',
    specVersion: text.characterVersion,
    ...text,
    characterBook,
    depthPrompt: depthPrompt && typeof depthPrompt === 'object'
      ? { prompt: str(depthPrompt.prompt), depth: Number(depthPrompt.depth) || 4, role: str(depthPrompt.role) || 'system' }
      : null,
    extensions,
    thScripts,
    regexScripts,
    raw,
  };
}

/** 面板/日志用的精简摘要（不带走几 MB 的脚本正文）。 */
export function summarizeCard(card) {
  const bookEntries = arr(card.characterBook?.entries);
  const enabledScripts = card.thScripts.filter((s) => s && s.enabled);
  return {
    name: card.name,
    creator: card.creator,
    spec: card.spec,
    version: card.characterVersion,
    tags: card.tags.slice(0, 8),
    counts: {
      description: card.description.length,
      firstMes: card.firstMes.length,
      greetings: card.alternateGreetings.length,
      examples: card.mesExample.length,
      lorebookEntries: bookEntries.length,
      lorebookChars: bookEntries.reduce((n, e) => n + str(e?.content).length, 0),
      regexScripts: card.regexScripts.length,
      thScripts: card.thScripts.length,
      thScriptsEnabled: enabledScripts.length,
    },
    worldName: str(card.characterBook?.name) || str(card.extensions?.world),
    hasTavernHelper: card.thScripts.length > 0 || Boolean(card.extensions?.tavern_helper),
    depthPrompt: card.depthPrompt,
  };
}
