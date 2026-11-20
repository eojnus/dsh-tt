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
// 普通 DSH 会话使用 USER_INPUT 和 WORLD_INFO。酒馆助手的辅助生成另行投影自己的历史，
// 可对其使用 AI_OUTPUT 的提示词规则。

export const REGEX_PLACEMENT = {
  USER_INPUT: 1,
  AI_OUTPUT: 2,
  SLASH_COMMAND: 3,
  MD_DISPLAY: 4,
  WORLD_INFO: 5,
  REASONING: 6,
};

const SOURCE_PLACEMENTS = {
  user_input: REGEX_PLACEMENT.USER_INPUT,
  ai_output: REGEX_PLACEMENT.AI_OUTPUT,
  slash_command: REGEX_PLACEMENT.SLASH_COMMAND,
  world_info: REGEX_PLACEMENT.WORLD_INFO,
  reasoning: REGEX_PLACEMENT.REASONING,
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
  const scriptName = rule.scriptName ?? rule.script_name ?? rule.name ?? `rule-${index}`;
  const findRegex = rule.findRegex ?? rule.find_regex ?? '';
  const source = rule.source && typeof rule.source === 'object' ? rule.source : null;
  const destination = rule.destination && typeof rule.destination === 'object' ? rule.destination : null;
  const placementRaw = rule.placement ?? rule.placements ?? (source
    ? Object.keys(SOURCE_PLACEMENTS).filter((key) => source[key]).map((key) => SOURCE_PLACEMENTS[key])
    : []);
  const placement = (Array.isArray(placementRaw) ? placementRaw : [placementRaw])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  return {
    id: rule.id ?? scriptName,
    name: scriptName,
    findRegex,
    replaceString: rule.replaceString ?? rule.replace_string ?? '',
    placement,
    disabled: rule.disabled === true || rule.enabled === false || Boolean(source && !placement.length) ||
      Boolean(destination && !destination.display && !destination.prompt),
    markdownOnly: destination ? Boolean(destination.display && !destination.prompt) : rule.markdownOnly === true,
    promptOnly: destination ? Boolean(destination.prompt && !destination.display) : rule.promptOnly === true,
    minDepth: rule.minDepth ?? rule.min_depth ?? null,
    maxDepth: rule.maxDepth ?? rule.max_depth ?? null,
    runOnEdit: rule.runOnEdit === true || rule.run_on_edit === true,
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
  // SillyTavern applies preset rules before character rules.
  for (const rule of [...pick(presetRaw), ...pick(cardRaw)]) {
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
  if (placement != null && rule.placement.length && !rule.placement.includes(Number(placement))) return false;
  if (options.isPrompt) {
    // 只用于显示的规则不进提示词
    if (rule.markdownOnly && !rule.promptOnly) return false;
  } else if (rule.promptOnly && !rule.markdownOnly) {
    // 只用于提示词的规则不进显示
    return false;
  }
  const depth = options.depth;
  if (Number.isFinite(depth)) {
    const min = rule.minDepth == null || rule.minDepth === '' ? NaN : Number(rule.minDepth);
    const max = rule.maxDepth == null || rule.maxDepth === '' ? NaN : Number(rule.maxDepth);
    if (min >= -1 && depth < min) return false;
    if (max >= 0 && depth > max) return false;
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
      out = options.replaceRule ? options.replaceRule(out, re, rule) : out.replace(re, String(rule.replaceString ?? ''));
    } catch (error) {
      if (options.onError) options.onError(rule, error);
    }
  }
  return out;
}

export function formatScriptRegex(text, rules, source, destination, options) {
  const placement = Object.hasOwn(SOURCE_PLACEMENTS, source) ? SOURCE_PLACEMENTS[source] : source;
  if (placement != null && !Number.isFinite(Number(placement))) return String(text ?? '');
  const settings = destination && typeof destination === 'object'
    ? destination
    : { ...options, isPrompt: destination === 'prompt' };
  return applyRegexScripts(text, rules, placement, settings);
}

/** 只有 prompt 侧会用到：世界书正文（placement=5）。 */
export function applyWorldInfoRegex(text, rules, options = {}) {
  return applyRegexScripts(text, rules, REGEX_PLACEMENT.WORLD_INFO, { ...options, isPrompt: true });
}

/** 只有 prompt 侧会用到：用户输入（placement=1）。 */
export function applyUserInputRegex(text, rules, options = {}) {
  return applyRegexScripts(text, rules, REGEX_PLACEMENT.USER_INPUT, { ...options, isPrompt: true });
}
