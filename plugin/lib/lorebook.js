// 世界书激活引擎：按 SillyTavern（release）的语义实现。
//
// 已实现：constant / 主关键词 / 次关键词四种逻辑 / 概率 / 预算 / 8 种位置 /
//        sticky / cooldown / delay / delayUntilRecursion / 递归扫描 /
//        inclusion group / groupOverride / excludeRecursion / outlet / ignoreBudget /
//        @@activate / @@dont_activate（由 decorateEntry 与条目原文前缀判定）。
// 未实现：向量化（vectorized）、@depth 之外的来源过滤（角色/人设 tag 匹配）、
//        minActivations 的"加深扫描"细节（只保留最基本的重试）。
//
// 计时单位：session.turn —— 每次用户消息 +1（近似 ST 的聊天消息条数）。

import { cardAssetsWasm } from './card-assets-wasm.js';

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
export const DEFAULT_SCAN_DEPTH = 2;
export const DEFAULT_MAX_RECURSION = 5;

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
  if (matchWholeWords && /^[\w-]+$/.test(key)) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(key)}([^\\p{L}\\p{N}_]|$)`, caseSensitive ? 'u' : 'iu');
    return (text) => re.test(text);
  }
  if (caseSensitive) return (text) => text.includes(key);
  const needle = key.toLowerCase();
  return (text) => text.toLowerCase().includes(needle);
}

function keywordOf(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function indexLiteralMatches(items, scanBufferOf, backend) {
  const folded = new Map();
  function fold(text) {
    if (!folded.has(text)) folded.set(text, text.toLowerCase());
    return folded.get(text);
  }
  const groups = new Map();
  for (const item of items) {
    const { entry } = item;
    if (item.blocked || !item.content || item.forced || entry.constant === true ||
        entry.useRegex === true || entry.matchWholeWords === true) continue;
    if (!Array.isArray(entry.key) || !entry.key.length) continue;
    const text = scanBufferOf(item);
    const caseSensitive = entry.caseSensitive === true;
    const haystack = caseSensitive ? text : fold(text);
    const keys = groups.get(haystack) ?? new Set();
    groups.set(haystack, keys);
    for (const values of [entry.key, entry.keysecondary]) {
      for (const value of Array.isArray(values) ? values : []) {
        const keyword = keywordOf(value);
        if (keyword) keys.add(caseSensitive ? keyword : keyword.toLowerCase());
      }
    }
  }
  const batches = Array.from(groups, ([text, keys]) => [text, [...keys]]);
  const results = batches.length ? (backend ?? cardAssetsWasm()).matchLorebookKeywords(batches) : null;
  const matches = new Map(batches.map(([text, keys], index) => [
    text, new Set(keys.filter((key, i) => results ? results[index][i] : text.includes(key))),
  ]));
  return (text, key, caseSensitive) => {
    const haystack = caseSensitive ? text : fold(text);
    const needle = caseSensitive ? key : key.toLowerCase();
    return matches.get(haystack)?.has(needle) ?? haystack.includes(needle);
  };
}

function matchKeys(text, keys, options, literalMatches) {
  for (const rawKey of keys) {
    const key = keywordOf(rawKey);
    if (!key) continue;
    const delimited = key.match(/^\/([\s\S]+)\/([a-z]*)$/i);
    if (delimited) {
      let regex;
      try { regex = new RegExp(delimited[1], delimited[2]); } catch { /* A malformed literal may be an ordinary key. */ }
      if (regex) {
        if (regex.test(text)) return key;
        continue;
      }
    }
    if (!options.useRegex && !options.matchWholeWords) {
      if (literalMatches(text, key, options.caseSensitive)) return key;
      continue;
    }
    const match = buildMatcher(key, options);
    if (match && match(text)) return key;
  }
  return null;
}

function passesSecondary(text, entry, options, literalMatches) {
  const secondary = Array.isArray(entry.keysecondary) ? entry.keysecondary : [];
  if (!secondary.length) return true;
  const logic = Number(entry.selectiveLogic ?? WI_LOGIC.AND_ANY);
  const results = secondary
    .map((k) => (typeof k === 'string' ? k.trim() : ''))
    .filter(Boolean)
    .map((k) => Boolean(matchKeys(text, [k], options, literalMatches)));

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

/** delayed 条目的递归级别：true 视为 1，数字原样，0/false 视为不限。 */
function recursionLevelOf(value) {
  if (value === true) return 1;
  if (value == null || value === false) return 0;
  const level = Number(value);
  return Number.isFinite(level) && level > 0 ? Math.floor(level) : 0;
}

/** 空的会话状态：turn 是用户消息计数，entries 按 uid 记 sticky/cooldown 计时。 */
export function createWorldInfoSession() {
  return { turn: 0, entries: Object.create(null) };
}

/**
 * 同组只留最优（ST 的 filterByInclusionGroups）：
 * groupWeight 高者优先，同分按 insertion_order / uid；groupOverride 的条目不受组限制。
 */
function filterByInclusionGroups(candidates, skipped) {
  const groups = new Map();
  const kept = [];
  for (const item of candidates) {
    const group = item.entry.group;
    if (!group || item.entry.groupOverride === true) {
      kept.push(item);
      continue;
    }
    const list = groups.get(group);
    if (list) list.push(item);
    else groups.set(group, [item]);
  }
  for (const [group, list] of groups) {
    list.sort((a, b) => (Number(b.entry.groupWeight) || 1) - (Number(a.entry.groupWeight) || 1)
      || (Number(a.entry.insertion_order ?? 100) - Number(b.entry.insertion_order ?? 100))
      || (Number(a.entry.uid ?? 0) - Number(b.entry.uid ?? 0)));
    kept.push(list[0]);
    for (const item of list.slice(1)) {
      skipped.push({ uid: item.entry.uid, comment: item.entry.comment, why: 'group:' + group });
    }
  }
  return kept;
}

function activationOf({ entry, content }, activatedBy, matchedKey) {
  return {
    uid: entry.uid ?? entry.__index,
    comment: entry.comment ?? '',
    content,
    position: Number(entry.position) || 0,
    depth: entry.depth == null ? null : Number(entry.depth),
    role: entry.role ?? 'system',
    order: Number(entry.insertion_order ?? 100),
    matchedKey,
    constant: entry.constant === true,
    activatedBy,
    sticky: Number(entry.sticky) > 0,
    outletName: entry.outletName ?? null,
  };
}

function matchOptionsOf(entry) {
  return {
    useRegex: entry.useRegex === true,
    caseSensitive: entry.caseSensitive === true,
    matchWholeWords: entry.matchWholeWords === true,
  };
}

function activateWithRust(prepared, state, settings, backend) {
  if (!backend.activateLorebook || settings.estimate !== estimateTokens || settings.random !== Math.random) return null;
  const budget = Number(settings.budget);
  const limit = Number(settings.maxRecursionSteps) || 0;
  if (![budget, limit, settings.turn].every(Number.isFinite)) return null;

  const stateKeys = new Set();
  const orderKinds = new Map();
  let legacySort = false;
  const input = [];
  for (const { entry, content, blocked, forced } of prepared) {
    const uid = entry.uid ?? entry.__index;
    if (typeof uid !== 'number' && typeof uid !== 'string') return null;
    const stateKey = String(uid);
    const group = entry.group && entry.groupOverride !== true ? entry.group : null;
    if (stateKeys.has(stateKey) || (group !== null && typeof group !== 'string')) return null;
    stateKeys.add(stateKey);
    const entryState = state.entries[stateKey];
    if (entryState != null && (typeof entryState !== 'object' || !Object.hasOwn(state.entries, stateKey))) return null;
    const uidOrder = Number(entry.uid ?? 0);
    const order = Number(entry.insertion_order ?? 100);
    const lexicalId = Number.isNaN(uidOrder);
    // Mixed character and chat ids may produce a non-transitive JS comparator.
    // Use its original ordering for those candidates while Rust owns the scan.
    if (orderKinds.has(order) && orderKinds.get(order) !== lexicalId) legacySort = true;
    orderKinds.set(order, lexicalId);
    const delay = Number(entry.delay) || 0;
    const sticky = Number(entry.sticky) || 0;
    const cooldown = Number(entry.cooldown) || 0;
    const groupWeight = Number(entry.groupWeight) || 1;
    if (![order, lexicalId ? 0 : uidOrder, delay, sticky, cooldown, groupWeight,
      settings.turn + sticky + cooldown].every(Number.isFinite)) return null;
    const probability = Number(entry.probability);
    input.push({ content, blocked, forced, group, groupWeight, order, uidOrder: lexicalId ? null : uidOrder,
      skipKey: String(entry.uid ?? entry.comment), delay, sticky, cooldown,
      recursionLevel: recursionLevelOf(entry.delayUntilRecursion),
      stickyUntil: Number(entryState?.stickyUntil), cooldownUntil: Number(entryState?.cooldownUntil),
      probability: entry.useProbability === true && Number.isFinite(probability) && probability < 100 ? probability : null,
      constant: entry.constant === true, hasKeys: Array.isArray(entry.key) && entry.key.length > 0,
      excludeRecursion: entry.excludeRecursion === true, preventRecursion: entry.preventRecursion === true,
      ignoreBudget: entry.ignoreBudget === true,
    });
  }

  let recursiveText;
  let literalMatches;
  const matched = [];
  const result = backend.activateLorebook({ entries: input, turn: settings.turn, budget,
    recursive: Boolean(settings.recursive), maxRecursionSteps: limit, legacySort }, {
    startRound(text) {
      recursiveText = text;
      literalMatches = indexLiteralMatches(prepared, (item) => item.scanText + text, backend);
    },
    matchEntry(index) {
      const { entry, scanText } = prepared[index];
      const options = matchOptionsOf(entry);
      const buffer = scanText + recursiveText;
      const key = matchKeys(buffer, entry.key, options, literalMatches);
      if (!key) return 0;
      if (entry.selective !== false && !passesSecondary(buffer, entry, options, literalMatches)) return -1;
      matched[index] = key;
      return 1;
    },
    random: settings.random,
    sortLegacy(candidates, grouped) {
      return candidates.sort((a, b) => {
        const left = input[a >>> 2];
        const right = input[b >>> 2];
        const priority = grouped ? right.groupWeight - left.groupWeight : Number((b & 3) === 0) - Number((a & 3) === 0);
        return priority || left.order - right.order || (left.uidOrder ?? NaN) - (right.uidOrder ?? NaN);
      });
    },
  });
  if (!result) return null;

  result.touched.forEach((touched, index) => {
    if (!touched) return;
    const { entry } = prepared[index];
    const uid = entry.uid ?? entry.__index;
    if (state.entries[uid] == null) state.entries[uid] = {};
  });
  for (const [index, stickyUntil, cooldownUntil] of result.timers) {
    const { entry } = prepared[index];
    const timer = state.entries[entry.uid ?? entry.__index];
    if (stickyUntil !== null) timer.stickyUntil = stickyUntil;
    if (cooldownUntil !== null) timer.cooldownUntil = cooldownUntil;
  }
  const activated = result.activated.map(([index, by]) => activationOf(prepared[index], by, by === 'key' ? matched[index] : null));
  const skipped = result.skipped.map(([index, why]) => {
    const { uid, comment } = prepared[index].entry;
    return { uid, comment, why };
  });
  return buildLorebookResult(activated, skipped, { total: prepared.length, tokens: result.tokens, budget: settings.budget,
    overflowed: result.overflowed, recursion: result.recursion, rounds: result.rounds }, backend);
}

/**
 * @param {object} input
 * @param {any[]} input.entries 世界书条目（ST 格式）
 * @param {string} input.scanText 参与扫描的文本（最近 N 楼拼起来）
 * @param {(entry:object)=>string} [input.scanTextForEntry] 条目自己的扫描窗口及附加来源
 * @param {number} [input.budget] token 预算
 * @param {(t:string)=>number} [input.estimate] token 估算器
 * @param {() => number} [input.random] 随机源（便于测试固定）
 * @param {(entry:object)=>boolean} [input.isActive] 额外激活判定（旧接口，等价于 decorateEntry 返回空串）
 * @param {(entry:object)=>string} [input.decorateEntry] 返回条目最终正文（处理 @@if 等装饰器后）；空串视为不激活
 * @param {{turn:number, entries:object}} [input.session] 会话计时状态（会被就地更新）
 * @param {boolean} [input.recursive] 是否递归扫描（默认 true）
 * @param {number} [input.maxRecursionSteps] 递归上限（默认 5；0 = 不限）
 * @param {number} [input.minActivations] 至少激活多少条才停止加深（默认 0）
 */
export function activateEntries({
  entries,
  scanText,
  scanTextForEntry,
  keywordBackend,
  budget = 2048,
  estimate = estimateTokens,
  random = Math.random,
  isActive,
  decorateEntry,
  session = null,
  recursive = true,
  maxRecursionSteps = DEFAULT_MAX_RECURSION,
  minActivations = 0,
}) {
  const state = session ?? createWorldInfoSession();
  if (!state.entries || typeof state.entries !== 'object') state.entries = Object.create(null);
  const turn = Number(state.turn) || 0;

  const list = (entries || [])
    .filter((entry) => entry && entry.enabled !== false && entry.disable !== true)
    .map((entry, index) => ({ ...entry, __index: index }))
    .sort((a, b) => (Number(a.insertion_order ?? 100) - Number(b.insertion_order ?? 100))
      || (Number(a.uid ?? a.__index) - Number(b.uid ?? b.__index)));

  // 装饰器在扫描前求值：@@if 为假 / @@dont_activate 的条目直接出局，
  // @@activate 的条目跳过关键词判定（ST 的外部激活语义）。
  const stripDirective = (text) => text.replace(/^\s*@@(?:activate|dont_activate)\b[^\n]*\r?\n?/, '');
  const prepared = list.map((entry) => {
    const raw = typeof entry.content === 'string' ? entry.content : '';
    const decorated = typeof decorateEntry === 'function' ? String(decorateEntry(entry) ?? '') : stripDirective(raw);
    const blockedByDecorator = /^\s*@@dont_activate\b/.test(raw) || (typeof isActive === 'function' && !isActive(entry));
    return {
      entry,
      scanText: String((scanTextForEntry ? scanTextForEntry(entry) : scanText) ?? ''),
      raw,
      // 即使调用方没提供 decorateEntry，也要把强制激活的指令行去掉。
      content: stripDirective(decorated),
      forced: /^\s*@@activate\b/.test(raw),
      blocked: blockedByDecorator,
    };
  });
  const rustResult = activateWithRust(prepared, state, { turn, budget, estimate, random, recursive, maxRecursionSteps },
    keywordBackend ?? cardAssetsWasm());
  if (rustResult) return rustResult;
  const byUid = new Map(prepared.map((item) => [item.entry.uid ?? item.entry.__index, item]));

  const activated = [];
  const skipped = [];
  const skipSeen = new Set();
  const failedProbability = new Set();
  const used = new Set();
  // inclusion group 跨轮占位：同一组在整次扫描里只能留下一条。
  const claimedGroups = new Map();
  let tokensUsed = 0;
  let overflowed = false;
  let recursion = 0;
  let recursiveText = '';
  let rounds = 0;

  // 递归轮会重复判定同一条目；跳过原因按 uid+原因去重，避免统计翻倍。
  const recordSkip = (entry, why) => {
    const key = `${entry.uid ?? entry.comment}|${why}`;
    if (skipSeen.has(key)) return;
    skipSeen.add(key);
    skipped.push({ uid: entry.uid, comment: entry.comment, why });
  };

  while (true) {
    rounds += 1;
    const candidates = [];
    const scanBufferOf = (item) => item.scanText + recursiveText;
    const literalMatches = indexLiteralMatches(prepared, scanBufferOf, keywordBackend);

    for (const item of prepared) {
      const entry = item.entry;
      const uid = entry.uid ?? entry.__index;
      if (used.has(uid)) continue;
      if (item.blocked) { recordSkip(entry, 'decorator'); continue; }
      if (!item.content) { recordSkip(entry, 'decorator'); continue; }

      const entryState = state.entries[uid] ?? (state.entries[uid] = {});
      const delay = Number(entry.delay) || 0;
      if (delay > 0 && turn < delay) { recordSkip(entry, 'delay'); continue; }

      const cooldownUntil = Number(entryState.cooldownUntil);
      if (Number.isFinite(cooldownUntil) && cooldownUntil > turn) { recordSkip(entry, 'cooldown'); continue; }

      // 同组已被前几轮占用：groupOverride 之外一律不再激活。
      if (entry.group && entry.groupOverride !== true && claimedGroups.has(entry.group)) {
        recordSkip(entry, 'group:' + entry.group);
        continue;
      }

      const level = recursionLevelOf(entry.delayUntilRecursion);
      if (level > 0 && recursion < level) { recordSkip(entry, 'delayUntilRecursion'); continue; }

      const stickyUntil = Number(entryState.stickyUntil);
      const stickyActive = Number.isFinite(stickyUntil) && stickyUntil >= turn;

      let activatedBy = null;
      let matchedKey = null;
      if (stickyActive) {
        activatedBy = 'sticky';
      } else if (item.forced) {
        activatedBy = 'decorator';
      } else if (entry.constant === true) {
        activatedBy = 'constant';
      } else {
        // 递归轮：excludeRecursion 的条目不再参与关键词判定。
        if (recursion > 0 && entry.excludeRecursion === true) { recordSkip(entry, 'excludeRecursion'); continue; }
        const keys = Array.isArray(entry.key) ? entry.key : [];
        if (!keys.length) { recordSkip(entry, 'no-keys'); continue; }
        const entryOptions = matchOptionsOf(entry);
        const scanBuffer = scanBufferOf(item);
        matchedKey = matchKeys(scanBuffer, keys, entryOptions, literalMatches);
        if (!matchedKey) continue;
        if (entry.selective !== false && !passesSecondary(scanBuffer, entry, entryOptions, literalMatches)) {
          recordSkip(entry, 'secondary');
          continue;
        }
        activatedBy = 'key';
      }

      candidates.push({ ...item, matchedKey, activatedBy, stickyActive });
    }

    if (!candidates.length) break;

    // ① sticky 优先，其次按原序（prepared 已按 insertion_order/uid 排序）。
    candidates.sort((a, b) => (Number(b.stickyActive) - Number(a.stickyActive))
      || (Number(a.entry.insertion_order ?? 100) - Number(b.entry.insertion_order ?? 100))
      || (Number(a.entry.uid ?? 0) - Number(b.entry.uid ?? 0)));

    // ② 同组只留最优。
    const grouped = filterByInclusionGroups(candidates, skipped);

    // ③ 概率：sticky 不重掷；失败条目不重试。
    const surviving = [];
    for (const item of grouped) {
      const uid = item.entry.uid ?? item.entry.__index;
      const probability = Number(item.entry.probability);
      if (!item.stickyActive && item.entry.useProbability === true && Number.isFinite(probability) && probability < 100) {
        if (failedProbability.has(uid)) { recordSkip(item.entry, 'probability'); continue; }
        if (random() * 100 > probability) {
          failedProbability.add(uid);
          recordSkip(item.entry, 'probability');
          continue;
        }
      }
      surviving.push(item);
    }

    // ④ 预算累加：超出后同轮与后续轮都不再增加（ignoreBudget 除外）。
    const roundActivated = [];
    for (const item of surviving) {
      const entry = item.entry;
      const uid = entry.uid ?? entry.__index;
      const ignoreBudget = entry.ignoreBudget === true;
      if (overflowed && !ignoreBudget) { recordSkip(entry, 'budget'); continue; }
      const cost = estimate(item.content);
      if (!ignoreBudget && tokensUsed + cost > budget) {
        overflowed = true;
        recordSkip(entry, 'budget');
        continue;
      }
      tokensUsed += cost;
      used.add(uid);
      const entryState = state.entries[uid] ?? (state.entries[uid] = {});
      const sticky = Number(entry.sticky) || 0;
      const cooldown = Number(entry.cooldown) || 0;
      if (sticky > 0) entryState.stickyUntil = turn + sticky;
      if (cooldown > 0) entryState.cooldownUntil = (sticky > 0 ? turn + sticky : turn) + cooldown;
      const activation = activationOf(item, item.activatedBy, item.matchedKey);
      activated.push(activation);
      roundActivated.push(activation);
      if (entry.group && entry.groupOverride !== true && !claimedGroups.has(entry.group)) {
        claimedGroups.set(entry.group, uid);
      }
    }

    if (!roundActivated.length) break;

    // ⑤ 递归：把本轮激活的正文并入下一轮扫描文本。
    if (!recursive) break;
    const limit = Number(maxRecursionSteps) || 0;
    const enough = activated.length >= (Number(minActivations) || 0);
    if (limit > 0 && recursion + 1 >= limit && enough) break;
    if (limit > 0 && recursion + 1 >= limit) break;
    const recursiveContents = roundActivated
      .filter((item) => byUid.get(item.uid)?.entry.preventRecursion !== true)
      .map((item) => item.content);
    if (!recursiveContents.length) break;
    recursiveText += '\n' + recursiveContents.join('\n');
    recursion += 1;
    if (rounds > 50) break;
  }

  return buildLorebookResult(activated, skipped, { total: list.length, tokens: tokensUsed, budget, overflowed, recursion, rounds },
    keywordBackend ?? cardAssetsWasm());
}

function layoutLorebookWithRust(activated, backend) {
  if (!backend?.layoutLorebookBuckets || !activated.every(({ position, depth, role, outletName }) =>
    Number.isFinite(position) && (depth == null || Number.isFinite(depth)) && typeof role === 'string'
    && (outletName == null || typeof outletName === 'string'))) return null;
  const layout = backend.layoutLorebookBuckets(activated.map(({ position, depth, role, outletName }) =>
    [position, depth ?? DEFAULT_DEPTH, role, outletName]));
  if (!layout) return null;
  const contentOf = (indices) => indices.map((index) => activated[index].content);
  const [before, after, ANTop, ANBottom, , EMTop, EMBottom, outlet] = layout.positions.map(contentOf);
  return { before, after, ANTop, ANBottom, EMTop, EMBottom,
    depth: layout.depth.map((indices) => {
      const { depth, role } = activated[indices.at(-1)];
      return { depth: depth ?? DEFAULT_DEPTH, role, entries: contentOf(indices) };
    }),
    outlet, outlets: Object.assign(Object.create(null), Object.fromEntries(layout.outlets.map(([name, indices]) => [name, contentOf(indices)]))),
  };
}

function buildLorebookResult(activated, skipped, stats, backend) {
  return {
    activated,
    skipped,
    buckets: layoutLorebookWithRust(activated, backend) ?? layoutLorebookWithJs(activated),
    stats: {
      total: stats.total,
      activated: activated.length,
      tokens: stats.tokens,
      budget: stats.budget,
      overflowed: stats.overflowed,
      recursion: stats.recursion,
      rounds: stats.rounds,
      byActivation: activated.reduce((acc, item) => {
        acc[item.activatedBy] = (acc[item.activatedBy] || 0) + 1;
        return acc;
      }, {}),
    },
  };
}

function layoutLorebookWithJs(activated) {
  const buckets = {
    before: [],
    after: [],
    ANTop: [],
    ANBottom: [],
    EMTop: [],
    EMBottom: [],
    depth: [],
    outlet: [],
    outlets: Object.create(null),
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
        const existing = buckets.depth.find((group) => group.depth === depth && group.role === item.role);
        if (existing) existing.entries.unshift(item.content);
        else buckets.depth.push({ depth, role: item.role, entries: [item.content] });
        break;
      }
      case WI_POSITION.outlet: {
        const name = item.outletName || '';
        if (name) {
          if (!buckets.outlets[name]) buckets.outlets[name] = [];
          buckets.outlets[name].unshift(item.content);
        } else {
          buckets.outlet.unshift(item.content);
        }
        break;
      }
      default: buckets.outlet.unshift(item.content); break;
    }
  }

  return buckets;
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

/** 计时/分组类字段的宽松归一化（ST 里这些字段有时在 extensions 下）。 */
function normalizeTimers(entry) {
  const ext = entry?.extensions && typeof entry.extensions === 'object' ? entry.extensions : {};
  const pick = (name, legacy = name) => entry[name] ?? entry[legacy] ?? ext[name] ?? ext[legacy];
  return {
    sticky: Number(pick('sticky')) || 0,
    cooldown: Number(pick('cooldown')) || 0,
    delay: Number(pick('delay')) || 0,
    delayUntilRecursion: pick('delayUntilRecursion', 'delay_until_recursion'),
    excludeRecursion: Boolean(pick('excludeRecursion', 'exclude_recursion')),
    preventRecursion: Boolean(pick('preventRecursion', 'prevent_recursion')),
    group: pick('group') ?? '',
    groupWeight: Number(pick('groupWeight', 'group_weight')) || 1,
    groupOverride: Boolean(pick('groupOverride', 'group_override')),
    outletName: pick('outletName', 'outlet_name') ?? '',
    useProbability: Boolean(pick('useProbability')),
    probability: pick('probability') == null ? 100 : Number(pick('probability')),
    ignoreBudget: Boolean(pick('ignoreBudget', 'ignore_budget')),
  };
}

export function normalizeCharacterBookEntries(book) {
  // 角色卡内嵌世界书一般是数组；ST 导出的独立世界书是 { "0": {...}, "1": {...} } 的对象。
  const raw = book?.entries;
  const list = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : []);
  return list.map((entry, index) => {
    if (!entry || typeof entry !== 'object') return null;
    const timers = normalizeTimers(entry);
    return {
      ...entry,
      uid: entry.id ?? entry.uid ?? index,
      position: normalizeBookEntryPosition(entry),
      depth: entry.depth ?? entry.extensions?.depth,
      role: normalizeRole(entry),
      enabled: entry.enabled !== false && entry.disable !== true,
      caseSensitive: entry.caseSensitive ?? entry.extensions?.case_sensitive,
      matchWholeWords: entry.matchWholeWords ?? entry.extensions?.match_whole_words,
      key: Array.isArray(entry.keys) ? entry.keys : (Array.isArray(entry.key) ? entry.key : []),
      keysecondary: Array.isArray(entry.secondary_keys) ? entry.secondary_keys
        : (Array.isArray(entry.keysecondary) ? entry.keysecondary : []),
      insertion_order: Number(entry.insertion_order ?? entry.order ?? 100),
      content: typeof entry.content === 'string' ? entry.content : '',
      comment: entry.comment ?? entry.name ?? '',
      ...timers,
    };
  }).filter(Boolean);
}
