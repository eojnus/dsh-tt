// ST 正则脚本（regex scripts）在 Host 侧的执行。
//
// ST 的枚举（数值必须兼容，导入的 JSON 直接可用）：
//   regex_placement = { USER_INPUT:1, AI_OUTPUT:2, SLASH_COMMAND:3, MD_DISPLAY:4, WORLD_INFO:5, REASONING:6 }
//
// 作用域规则：
//   - disabled 的规则跳过；
//   - prompt 侧：markdownOnly && !promptOnly 的规则只用于显示，不进提示词；
//   - 显示侧：promptOnly && !markdownOnly 的规则只用于提示词，不用于显示（客户端已实现）。
//
// 本机架构的限制：DSH 的 `agent/request` 明确「不能改消息」，assistant 历史不可改写，
// 所以 placement=2（AI 输出）的 prompt 侧规则目前只作用于**新生成的显示**，
// 无法回写历史（要等 Shadow Chat）。Host 这里负责 USER_INPUT 与 WORLD_INFO。

export const REGEX_PLACEMENT = {
  USER_INPUT: 1,
  AI_OUTPUT: 2,
  SLASH_COMMAND: 3,
  MD_DISPLAY: 4,
  WORLD_INFO: 5,
  REASONING: 6,
};

/** 把 ST 的 `/pattern/flags` 文本编译成正则；不是该形式时按普通字符串处理。 */
export function compileFindRegex(raw) {
  const source = String(raw ?? '');
  if (!source) return null;
  const slash = source.match(/^\/([\s\S]*)\/([a-z]*)$/);
  try {
    if (slash) return new RegExp(slash[1], slash[2]);
    return new RegExp(source, 'g');
  } catch {
    return null;
  }
}

/** 归一化一条规则（容忍 ST 各版本的字段名差异）。 */
export function normalizeRegexRule(rule, index = 0) {
  if (!rule || typeof rule !== 'object') return null;
  const scriptName = rule.scriptName ?? rule.name ?? `rule-${index}`;
  const findRegex = rule.findRegex ?? rule.find_regex ?? '';
  const placementRaw = rule.placement ?? rule.placements ?? [];
  const placement = (Array.isArray(placementRaw) ? placementRaw : [placementRaw])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  return {
    id: rule.id ?? scriptName,
    name: scriptName,
    findRegex,
    replaceString: rule.replaceString ?? rule.replace_string ?? '',
    placement,
    disabled: rule.disabled === true || rule.enabled === false,
    markdownOnly: rule.markdownOnly === true,
    promptOnly: rule.promptOnly === true,
    minDepth: rule.minDepth ?? null,
    maxDepth: rule.maxDepth ?? null,
    runOnEdit: rule.runOnEdit === true,
  };
}

export function normalizeRegexRules(rules) {
  return (Array.isArray(rules) ? rules : [])
    .map((rule, index) => normalizeRegexRule(rule, index))
    .filter(Boolean);
}

/** 从角色卡 / 预设的原始对象里收集正则脚本（去重后按出现顺序）。 */
export function collectRegexRules(cardRaw, presetRaw) {
  const pick = (raw) => {
    const inner = raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object' ? raw.data : raw;
    const extensions = inner && typeof inner.extensions === 'object' ? inner.extensions : null;
    const list = extensions?.regex_scripts ?? extensions?.regexScripts;
    return Array.isArray(list) ? list : [];
  };
  const seen = new Set();
  const rules = [];
  for (const rule of [...pick(cardRaw), ...pick(presetRaw)]) {
    const normalized = normalizeRegexRule(rule, rules.length);
    if (!normalized) continue;
    const key = normalized.id + '|' + normalized.findRegex + '|' + normalized.replaceString;
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push(normalized);
  }
  return rules;
}

/**
 * 判断这条规则是否作用于某个位置。
 * @param {ReturnType<typeof normalizeRegexRule>} rule
 * @param {number} placement REGEX_PLACEMENT
 * @param {{ isPrompt?: boolean, depth?: number|null }} [options]
 */
export function isRuleApplicable(rule, placement, options = {}) {
  if (!rule || rule.disabled) return false;
  if (rule.placement.length && !rule.placement.includes(Number(placement))) return false;
  if (options.isPrompt) {
    // 只用于显示的规则不进提示词
    if (rule.markdownOnly && !rule.promptOnly) return false;
  } else if (rule.promptOnly && !rule.markdownOnly) {
    // 只用于提示词的规则不进显示
    return false;
  }
  const depth = options.depth;
  if (Number.isFinite(Number(depth))) {
    const min = Number(rule.minDepth);
    const max = Number(rule.maxDepth);
    if (Number.isFinite(min) && Number(depth) < min) return false;
    if (Number.isFinite(max) && Number(depth) > max) return false;
  }
  return true;
}

/**
 * 对一个位置应用所有匹配的规则。
 * @param {string} text
 * @param {Array} rules 已归一化或原始规则数组
 * @param {number} placement REGEX_PLACEMENT
 * @param {{ isPrompt?: boolean, depth?: number|null, onError?: (rule:object, error:Error)=>void }} [options]
 */
export function applyRegexScripts(text, rules, placement, options = {}) {
  let out = String(text ?? '');
  if (!out) return out;
  const list = Array.isArray(rules) ? rules : [];
  for (const rawRule of list) {
    const rule = rawRule && rawRule.placement ? rawRule : normalizeRegexRule(rawRule);
    if (!isRuleApplicable(rule, placement, options)) continue;
    const re = compileFindRegex(rule.findRegex);
    if (!re) continue;
    try {
      out = out.replace(re, String(rule.replaceString ?? ''));
    } catch (error) {
      if (options.onError) options.onError(rule, error);
    }
  }
  return out;
}

/** 只有 prompt 侧会用到：世界书正文（placement=5）。 */
export function applyWorldInfoRegex(text, rules, options = {}) {
  return applyRegexScripts(text, rules, REGEX_PLACEMENT.WORLD_INFO, { ...options, isPrompt: true });
}

/** 只有 prompt 侧会用到：用户输入（placement=1）。 */
export function applyUserInputRegex(text, rules, options = {}) {
  return applyRegexScripts(text, rules, REGEX_PLACEMENT.USER_INPUT, { ...options, isPrompt: true });
}
