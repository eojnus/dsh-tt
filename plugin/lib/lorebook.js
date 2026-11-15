// 世界书激活引擎：按 SillyTavern（release）的语义实现核心路径。
// 已实现：constant / 主关键词 / 次关键词四种逻辑 / 概率 / 预算 / 8 种位置 / 插入顺序。
// 未实现（见设计文档 §14 与 v2 计划）：递归扫描、sticky/cooldown/delay、inclusion group、@@装饰器、outlet。

export const WI_POSITION = {
  before: 0,
  after: 1,
  ANTop: 2,
  ANBottom: 3,
  atDepth: 4,
  EMTop: 5,
  EMBottom: 6,
  outlet: 7,
};

export const WI_LOGIC = { AND_ANY: 0, NOT_ALL: 1, NOT_ANY: 2, AND_ALL: 3 };
export const DEFAULT_DEPTH = 4;

export function estimateTokens(text) {
  if (!text) return 0;
  let cjk = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code >= 0x2e80) cjk++;
  }
  const rest = text.length - cjk;
  return Math.ceil(cjk / 1.6 + rest / 3.6);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMatcher(key, { useRegex = false, caseSensitive = false, matchWholeWords = false } = {}) {
  if (!key) return null;
  if (useRegex) {
    try {
      const re = new RegExp(key, caseSensitive ? '' : 'i');
      return (text) => re.test(text);
    } catch {
      return null;
    }
  }
  if (caseSensitive) {
    return (text) => text.includes(key);
  }
  if (matchWholeWords && /^[\w-]+$/.test(key)) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(key)}([^\\p{L}\\p{N}_]|$)`, 'iu');
    return (text) => re.test(text);
  }
  const needle = key.toLowerCase();
  return (text) => text.toLowerCase().includes(needle);
}

function matchKeys(text, keys, options) {
  for (const rawKey of keys) {
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (!key) continue;
    const match = buildMatcher(key, options);
    if (match && match(text)) return key;
  }
  return null;
}

function passesSecondary(text, entry, options) {
  const secondary = Array.isArray(entry.keysecondary) ? entry.keysecondary : [];
  if (!secondary.length) return true;
  const logic = Number(entry.selectiveLogic ?? WI_LOGIC.AND_ANY);
  const results = secondary
    .map((k) => (typeof k === 'string' ? k.trim() : ''))
    .filter(Boolean)
    .map((k) => Boolean(matchKeys(text, [k], options)));

  if (!results.length) return true;
  const any = results.some(Boolean);
  const all = results.every(Boolean);

  switch (logic) {
    case WI_LOGIC.NOT_ALL: return !all;
    case WI_LOGIC.NOT_ANY: return !any;
    case WI_LOGIC.AND_ALL: return all;
    case WI_LOGIC.AND_ANY:
    default: return any;
  }
}

/**
 * @param {object} input
 * @param {any[]} input.entries 世界书条目（ST 格式）
 * @param {string} input.scanText 参与扫描的文本（最近 N 楼拼起来）
 * @param {number} [input.budget] token 预算
 * @param {(t:string)=>number} [input.estimate] token 估算器
 * @param {() => number} [input.random] 随机源（便于测试固定）
 * @param {(entry:object)=>boolean} [input.isActive] 额外激活判定（如世界书 @@if 装饰器）
 * @param {(entry:object)=>string} [input.decorateEntry] 返回条目最终正文（处理 @@if 等装饰器后）；空串视为不激活
 */
export function activateEntries({
  entries, scanText, budget = 2048, estimate = estimateTokens, random = Math.random, isActive, decorateEntry,
}) {
  const options = { useRegex: false, caseSensitive: false, matchWholeWords: false };
  const list = (entries || [])
    .filter((e) => e && e.enabled !== false && e.disable !== true)
    .map((e, index) => ({ ...e, __index: index }))
    .sort((a, b) => (Number(a.insertion_order ?? 100) - Number(b.insertion_order ?? 100)) || (Number(a.uid ?? a.__index) - Number(b.uid ?? b.__index)));

  const activated = [];
  const skipped = [];
  let used = 0;
  let overflowed = false;

  for (const entry of list) {
    const rawContent = typeof entry.content === 'string' ? entry.content : '';
    if (!rawContent) continue;

    const isConstant = entry.constant === true;
    let matchedKey = null;

    if (!isConstant) {
      const keys = Array.isArray(entry.key) ? entry.key : [];
      if (!keys.length) { skipped.push({ uid: entry.uid, comment: entry.comment, why: 'no-keys' }); continue; }

      const entryOptions = {
        ...options,
        useRegex: entry.useRegex === true,
        caseSensitive: entry.caseSensitive === true,
        matchWholeWords: entry.matchWholeWords === true,
      };
      matchedKey = matchKeys(scanText, keys, entryOptions);
      if (!matchedKey) continue;
      if (entry.selective !== false && !passesSecondary(scanText, entry, entryOptions)) {
        skipped.push({ uid: entry.uid, comment: entry.comment, why: 'secondary' });
        continue;
      }
    }

    if (entry.useProbability === true && Number(entry.probability) < 100 && !isConstant) {
      if (random() * 100 > Number(entry.probability)) {
        skipped.push({ uid: entry.uid, comment: entry.comment, why: 'probability' });
        continue;
      }
    }

    if (typeof isActive === 'function' && !isActive(entry)) {
      skipped.push({ uid: entry.uid, comment: entry.comment, why: 'decorator' });
      continue;
    }

    const content = typeof decorateEntry === 'function' ? String(decorateEntry(entry) ?? '') : rawContent;
    if (!content) {
      skipped.push({ uid: entry.uid, comment: entry.comment, why: 'decorator' });
      continue;
    }

    if (overflowed && entry.ignoreBudget !== true) {
      skipped.push({ uid: entry.uid, comment: entry.comment, why: 'budget' });
      continue;
    }

    const cost = estimate(content);
    if (entry.ignoreBudget !== true && used + cost > budget) {
      overflowed = true;
      skipped.push({ uid: entry.uid, comment: entry.comment, why: 'budget' });
      continue;
    }

    used += cost;
    activated.push({
      uid: entry.uid,
      comment: entry.comment ?? '',
      content,
      position: Number(entry.position) || 0,
      depth: entry.depth == null ? null : Number(entry.depth),
      role: entry.role ?? 'system',
      order: Number(entry.insertion_order ?? 100),
      matchedKey,
      constant: isConstant,
    });
  }

  const buckets = {
    before: [],
    after: [],
    ANTop: [],
    ANBottom: [],
    EMTop: [],
    EMBottom: [],
    depth: [],
    outlet: [],
  };

  // ST 的装配：按顺序 unshift，因此最终数组与排序相反。
  for (const item of activated) {
    switch (item.position) {
      case WI_POSITION.before: buckets.before.unshift(item.content); break;
      case WI_POSITION.after: buckets.after.unshift(item.content); break;
      case WI_POSITION.ANTop: buckets.ANTop.unshift(item.content); break;
      case WI_POSITION.ANBottom: buckets.ANBottom.unshift(item.content); break;
      case WI_POSITION.EMTop: buckets.EMTop.unshift(item.content); break;
      case WI_POSITION.EMBottom: buckets.EMBottom.unshift(item.content); break;
      case WI_POSITION.atDepth: {
        const depth = item.depth ?? DEFAULT_DEPTH;
        const existing = buckets.depth.find((d) => d.depth === depth && d.role === item.role);
        if (existing) existing.entries.unshift(item.content);
        else buckets.depth.push({ depth, role: item.role, entries: [item.content] });
        break;
      }
      default: buckets.outlet.push(item.content); break;
    }
  }

  return {
    activated,
    skipped,
    buckets,
    stats: { total: list.length, activated: activated.length, tokens: used, budget, overflowed },
  };
}

/** ST 的位置是数字；角色卡内嵌世界书用字符串，扩展里可能又放在 extensions 里。 */
export function normalizeBookEntryPosition(entry) {
  if (typeof entry?.position === 'number' && Number.isFinite(entry.position)) return entry.position;
  const extPosition = entry?.extensions?.position;
  if (extPosition != null && Number.isFinite(Number(extPosition))) return Number(extPosition);
  const map = {
    before_char: WI_POSITION.before,
    after_char: WI_POSITION.after,
    before_an: WI_POSITION.ANTop,
    after_an: WI_POSITION.ANBottom,
    at_depth: WI_POSITION.atDepth,
    before_em: WI_POSITION.EMTop,
    after_em: WI_POSITION.EMBottom,
    outlet: WI_POSITION.outlet,
  };
  return map[entry?.position] ?? WI_POSITION.before;
}

const ROLE_NAMES = { 0: 'system', 1: 'user', 2: 'assistant' };
function normalizeRole(entry) {
  const raw = entry?.role ?? entry?.extensions?.role;
  if (typeof raw === 'number') return ROLE_NAMES[raw] ?? 'system';
  if (typeof raw === 'string' && raw) return raw;
  return 'system';
}

export function normalizeCharacterBookEntries(book) {
  // 角色卡内嵌世界书一般是数组；ST 导出的独立世界书是 { "0": {...}, "1": {...} } 的对象。
  const raw = book?.entries;
  const list = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : []);
  return list.map((entry, index) => ({
    ...entry,
    uid: entry.id ?? entry.uid ?? index,
    position: normalizeBookEntryPosition(entry),
    depth: entry.depth ?? entry.extensions?.depth,
    role: normalizeRole(entry),
    enabled: entry.enabled !== false && entry.disable !== true,
    key: Array.isArray(entry.keys) ? entry.keys : (Array.isArray(entry.key) ? entry.key : []),
    keysecondary: Array.isArray(entry.secondary_keys) ? entry.secondary_keys
      : (Array.isArray(entry.keysecondary) ? entry.keysecondary : []),
    insertion_order: Number(entry.insertion_order ?? entry.order ?? 100),
    content: typeof entry.content === 'string' ? entry.content : '',
    comment: entry.comment ?? entry.name ?? '',
  }));
}
