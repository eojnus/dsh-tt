// 提示词管线（同构）：卡 + 预设 + 变量 + 世界书 → system / 深度注入 / 完整段。
//
// 这个模块**不碰 Node API**（无 fs/path），所以同一份代码可以：
//   1) 在 Host 里跑（agent.js、tools/snapshot.mjs、tools/check.mjs）；
//   2) 经 tools/bundle-lib.mjs 打同构包后，在面板里做"发送前预览"。
// 两边共用同一实现，预览与实际请求就不会漂移。
//
// 顺序（与 ST-Prompt-Template / ST 一致）：
//   世界书条目：装饰器（@@if 等）→ prompt 作用域正则（placement=5）
//   提示词正文：EJS（跨块）→ ST 宏
//   用户输入：placement=1 正则（由调用方在 pre-step 里做）

import { createMacroEnv } from './macros.js';
import { createEjsScope } from './ejs.js';
import { applyWorldInfoDecorators } from './decorators.js';
import { activateEntries, normalizeCharacterBookEntries, createWorldInfoSession, DEFAULT_SCAN_DEPTH } from './lorebook.js';
import { renderPrompt } from './prompt.js';
import { collectRegexRules, applyWorldInfoRegex } from './regex.js';
import { cardAssetsWasm } from './card-assets-wasm.js';

const EJS_ERROR_RE = /<!-- dsh-tt EJS error: ([\s\S]*?) -->/g;

/** 深度/绝对注入按深度降序拼接：深度 0 最靠近对话，所以放在最后。 */
export function composeDepthText(depth, injected, wasm = cardAssetsWasm()) {
  const items = [
    ...(injected || []).map((item) => ({ ...item, depth: Number(item.depth) || 0 })),
    ...(depth || []).map((item) => ({ ...item, depth: Number(item.depth) || 0 })),
  ];
  const depths = items.map(({ depth }) => depth);
  const order = depths.every(Number.isFinite) ? wasm?.orderPromptDepth?.(depths) : null;
  if (order) return order.map((index) => items[index].content).filter(Boolean).join('\n\n');
  items.sort((a, b) => b.depth - a.depth);
  return items.map((item) => item.content).filter(Boolean).join('\n\n');
}

/** 开场白块：开场白只显示不发送，但要让模型知道自己说过这句。 */
export function greetingBlockOf(greeting) {
  const text = String(greeting ?? '').trim();
  return text ? `[你的开场白（已作为本局对话的第一条消息发给玩家）]\n${text}` : '';
}

/** 世界书扫描文本：卡的描述 / 开场白 / 前三条备选 / 场景。 */
export function scanTextOf(card) {
  return [card?.description, card?.firstMes, ...(card?.alternateGreetings ?? []).slice(0, 3), card?.scenario]
    .filter(Boolean).join('\n');
}

function scanDepthOf(entry) {
  const depth = entry.scanDepth ?? entry.scan_depth ?? entry.extensions?.scan_depth;
  const value = Number(depth);
  return depth !== null && depth !== undefined && depth !== '' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : DEFAULT_SCAN_DEPTH;
}

function worldInfoEntries(book, chatWorldbook) {
  return [
    ...normalizeCharacterBookEntries(book),
    ...normalizeCharacterBookEntries(chatWorldbook).map((entry) => ({ ...entry, uid: `chat:${entry.uid}` })),
  ];
}

export function worldInfoHistoryLimit(book, chatWorldbook) {
  return worldInfoEntries(book, chatWorldbook)
    .filter((entry) => entry.enabled)
    .reduce((depth, entry) => Math.max(depth, scanDepthOf(entry)), DEFAULT_SCAN_DEPTH);
}

function conversationScanner(messages, card, userDescription, injectedScan, entries, wasm) {
  const history = messages.filter((value) => typeof value === 'string' && value.length > 0);
  const sources = [
    ['matchPersonaDescription', 'match_persona_description', userDescription],
    ['matchCharacterDescription', 'match_character_description', card?.description],
    ['matchCharacterPersonality', 'match_character_personality', card?.personality],
    ['matchCharacterDepthPrompt', 'match_character_depth_prompt', card?.depthPrompt?.prompt],
    ['matchScenario', 'match_scenario', card?.scenario],
    ['matchCreatorNotes', 'match_creator_notes', card?.creatorNotes],
  ];
  const byDepth = new Map();
  const depths = [...new Set(entries.filter((entry) => entry && entry.enabled !== false && entry.disable !== true).map(scanDepthOf))];
  const windows = wasm.buildLorebookScanWindows?.({ history, depths });
  if (windows) depths.forEach((depth, index) => byDepth.set(depth, windows[index]));
  return (entry) => {
    const depth = scanDepthOf(entry);
    if (!byDepth.has(depth)) byDepth.set(depth, depth ? history.slice(-depth).reverse().join('\n') : '');
    const extra = sources
      .filter(([key, legacy]) => (entry[key] ?? entry[legacy] ?? entry.extensions?.[legacy]) === true)
      .map(([, , value]) => value);
    return [byDepth.get(depth), ...extra, ...injectedScan].filter(Boolean).join('\n');
  };
}

/**
 * 跑一次完整管线。
 * @param {object} input
 * @param {object} input.card 归一化后的卡（`normalizeCard` 的结果即可）
 * @param {object|null} input.preset `parsePreset` 的结果
 * @param {Record<string, unknown>} [input.variables] EJS/装饰器可见的变量
 * @param {string} [input.userName]
 * @param {number} [input.maxContext]
 * @param {number} [input.worldInfoBudget] 缺省 = maxContext * 0.25
 * @param {object} [input.session] 世界书计时状态（缺省新建，不跨轮记忆）
 * @param {boolean} [input.recursive]
 * @param {number} [input.maxRecursionSteps]
 * @param {number} [input.minActivations]
 * @param {string} [input.greeting]
 * @param {string[]} [input.chatMessages] 按时间顺序排列的对话正文，含本轮输入
 * @param {Array} [input.regexRules] 已归一化的正则规则；缺省从卡/预设收集
 * @param {Array} [input.entries] 世界书条目（缺省取角色及会话绑定）
 * @param {object} [input.chatWorldbook] 本局绑定的独立世界书
 * @param {(kind:string, error:unknown)=>void} [input.onError]
 */
export function runPromptPipeline(input = {}, wasm = cardAssetsWasm()) {
  const card = input.card ?? null;
  const preset = input.preset ?? null;
  const variables = input.variables && typeof input.variables === 'object' ? input.variables : {};
  const userName = input.userName || '你';
  const maxContext = Number(input.maxContext) || 128000;
  const budget = Number(input.worldInfoBudget) || Math.round(maxContext * 0.25);
  const session = input.session ?? createWorldInfoSession();
  const errors = { ejs: [], regex: [] };
  const report = input.onError || (() => {});
  const scriptPrompts = input.scriptPrompts?.length
    ? wasm.partitionPromptInjections(input.scriptPrompts) : null;
  const injectedScan = scriptPrompts?.scan ?? [];

  const regexRules = Array.isArray(input.regexRules)
    ? input.regexRules
    : collectRegexRules(card?.raw, preset?.raw);
  const entries = Array.isArray(input.entries)
    ? input.entries
    : worldInfoEntries(card?.characterBook, input.chatWorldbook);

  const env = createMacroEnv({ card, userName, userDescription: input.userDescription,
    lastMessage: input.chatMessages?.findLast(Boolean), lastMessageId: input.lastMessageId,
    input: input.userInput, maxPrompt: maxContext, maxContext, maxResponse: preset?.raw?.openai_max_tokens });
  const lorebookByName = new Map();
  const scope = createEjsScope(variables, {
    getwi: (name) => lorebookByName.get(name) ?? '',
    getchar: () => card?.name ?? '',
    resolve: (key) => (env && key in env ? env[key] : undefined),
  });

  const lorebook = activateEntries({
    entries,
    keywordBackend: wasm,
    scanText: Array.isArray(input.chatMessages) ? '' : [scanTextOf(card), ...injectedScan].filter(Boolean).join('\n'),
    scanTextForEntry: Array.isArray(input.chatMessages)
      ? conversationScanner(input.chatMessages, card, input.userDescription, injectedScan, entries, wasm)
      : undefined,
    budget,
    // ST 的顺序：装饰器先求值，再对最终正文过一次世界书正则（placement=5）。
    decorateEntry: (entry) => applyWorldInfoRegex(
      applyWorldInfoDecorators(entry.content, scope),
      regexRules,
      {
        onError: (rule, error) => {
          if (errors.regex.length < 5) errors.regex.push(`${rule.name}: ${error?.message || error}`);
          report('regex', error);
        },
      },
    ),
    session,
    recursive: input.recursive !== false,
    maxRecursionSteps: input.maxRecursionSteps == null ? undefined : Number(input.maxRecursionSteps),
    minActivations: Number(input.minActivations) || 0,
  });
  for (const entry of lorebook.activated) lorebookByName.set(entry.comment, entry.content);

  const rendered = renderPrompt({ card, preset, lorebook, env, ejsScope: scope, wasm, nativeChat: input.nativeChat });
  if (scriptPrompts?.depth.length) {
    rendered.injected.push(...scriptPrompts.depth);
    rendered.trace.injected = rendered.injected.length;
  }
  const systemText = [rendered.system, rendered.tail].filter(Boolean).join('\n\n');
  const depthText = composeDepthText(rendered.depth, rendered.injected, wasm);
  const greetingBlock = greetingBlockOf(input.greeting);
  const sectionText = [systemText, depthText, greetingBlock].filter(Boolean).join('\n\n');

  const combined = `${systemText}\n${depthText}`;
  for (const match of combined.matchAll(EJS_ERROR_RE)) {
    if (errors.ejs.length < 5) errors.ejs.push(match[1]);
  }

  return {
    card,
    preset,
    entries,
    regexRules,
    env,
    scope,
    lorebook,
    rendered,
    systemText,
    depthText,
    greetingBlock,
    sectionText,
    errors,
    stats: {
      systemChars: systemText.length,
      depthChars: depthText.length,
      sectionChars: sectionText.length,
      worldInfo: lorebook.stats,
      depthGroups: rendered.depth.length,
      injectedCount: rendered.injected.length,
      parts: rendered.trace.parts.length,
    },
  };
}
