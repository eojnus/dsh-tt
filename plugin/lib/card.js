// 角色卡归一化：兼容 Character Card V2（字段在顶层）与 V3（字段包在 data 里）。

const str = (v) => (typeof v === 'string' ? v : '');
const arr = (v) => (Array.isArray(v) ? v : []);

function pickExtension(extensions, key) {
  if (!extensions || typeof extensions !== 'object') return undefined;
  return extensions[key];
}

/**
 * @param {any} raw 已解析的卡 JSON
 * @returns 归一化后的卡（保留原始对象在 raw 字段，写回时用）
 */
export function normalizeCard(raw) {
  const isV3 = raw && typeof raw.spec === 'string' && raw.spec.startsWith('chara_card_v3') && raw.data;
  const inner = isV3 ? raw.data : raw || {};
  const extensions = inner.extensions && typeof inner.extensions === 'object' ? inner.extensions : {};

  const characterBook = inner.character_book ?? null;
  const th = pickExtension(extensions, 'tavern_helper') ?? null;
  const thScripts = arr(th?.scripts);
  const regexScripts = arr(pickExtension(extensions, 'regex_scripts'));
  const depthPrompt = pickExtension(extensions, 'depth_prompt') ?? null;

  return {
    spec: isV3 ? String(raw.spec) : 'chara_card_v2',
    specVersion: str(inner.character_version),
    name: str(inner.name) || '未命名角色',
    creator: str(inner.creator),
    characterVersion: str(inner.character_version),
    description: str(inner.description),
    personality: str(inner.personality),
    scenario: str(inner.scenario),
    firstMes: str(inner.first_mes),
    mesExample: str(inner.mes_example),
    systemPrompt: str(inner.system_prompt),
    postHistoryInstructions: str(inner.post_history_instructions),
    creatorNotes: str(inner.creator_notes),
    tags: arr(inner.tags).filter((t) => typeof t === 'string'),
    alternateGreetings: arr(inner.alternate_greetings).filter((t) => typeof t === 'string'),
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
