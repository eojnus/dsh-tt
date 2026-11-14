// DSH 角色扮演插件（Host 侧）
//
// 职责（仅 takeover=true 的实例，即「角色扮演」preset 内的实例）：
// 1) 扫描资产（卡 / 预设 / 世界书）；
// 2) 在 agent/inbox/inserted 里读客户端通过 prompt 信封传来的绑定（卡 + 预设 + 变量），
//    在下一次 system-prompt 组装之前重建 ST 语义的系统提示词；
// 3) 在 agent/pre-step 里把信封从进入步骤的消息中剥离，保证会话日志只留用户原文。
//
// 根层实例只负责让客户端模块被发现，不接管任何提示词。

import path from 'node:path';
import { loadLibrary, bookEntriesOf, resolveActive } from './lib/library.js';
import { activateEntries } from './lib/lorebook.js';
import { applyWorldInfoDecorators } from './lib/decorators.js';
import { normalizeCard } from './lib/card.js';
import { renderPrompt, parsePreset, applyPresetOverrides } from './lib/prompt.js';
import { createMacroEnv } from './lib/macros.js';
import { createEjsScope } from './lib/ejs.js';

export const name = 'dsh-tt-roleplay-agent';

// systemPrompt 是 agent 作用域服务；不声明 inject 时 Cordis 会拒绝属性访问。
export const inject = ['systemPrompt'];

const MARK = '\u0000TT\u0000';
const EJS_ERROR_RE = /<!-- dsh-tt EJS error: ([\s\S]*?) -->/g;

function log(...args) {
  try { console.log('[dsh-tt]', ...args); } catch { /* ignore */ }
}

function buildScanText(card) {
  return [card?.description, card?.firstMes, ...(card?.alternateGreetings ?? []).slice(0, 3), card?.scenario]
    .filter(Boolean).join('\n');
}

/** 从一条消息里取出信封；没有则返回 null。 */
function readEnvelope(message) {
  try {
    const blocks = message?.content;
    if (!Array.isArray(blocks) || !blocks.length) return null;
    const first = blocks[0];
    const text = typeof first === 'string' ? first : first?.text;
    if (typeof text !== 'string' || !text.startsWith(MARK)) return null;
    const end = text.indexOf(MARK, MARK.length);
    if (end < 0) return null;
    const binding = JSON.parse(text.slice(MARK.length, end));
    const body = text.slice(end + MARK.length);
    return { binding, body };
  } catch {
    return null;
  }
}

/** 替换消息第一个文本块的内容；保持 id / source / 其它块不变。 */
function replaceMessageText(message, body) {
  const blocks = Array.isArray(message?.content) ? message.content : [];
  if (!blocks.length) return message;
  const first = blocks[0];
  const nextFirst = typeof first === 'string'
    ? body
    : (first && typeof first === 'object' ? { ...first, text: body } : body);
  return { ...message, content: [nextFirst, ...blocks.slice(1)] };
}

function signatureOf(value) {
  if (value == null) return '';
  try { return JSON.stringify(value); } catch { return String(value); }
}

/** FNV-1a 32 位哈希；用于判断绑定是否变化，避免每轮全量重渲染。 */
function hashOf(value) {
  const source = typeof value === 'string' ? value : signatureOf(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${(hash >>> 0).toString(36)}:${source.length}`;
}

function cardKeyOf(card) {
  return [
    card?.name ?? '',
    card?.description?.length ?? 0,
    card?.firstMes?.length ?? 0,
    card?.systemPrompt?.length ?? 0,
    card?.characterBook?.entries?.length ?? 0,
    card?.alternateGreetings?.length ?? 0,
  ].join('|');
}

function presetKeyOf(preset) {
  return [
    preset?.name ?? '',
    preset?.prompts?.length ?? 0,
    preset?.order?.length ?? 0,
  ].join('|');
}

export function apply(ctx, config = {}) {
  if (config.takeover !== true) {
    log('根层实例：只提供客户端模块与资产扫描，不接管提示词（takeover=true 的预设实例才接管）。');
    return;
  }

  const root = config.assetsDir || 'X:\\dsh-tt';
  const roots = [path.join(root, '参考'), path.join(root, 'assets')];
  const maxContext = Number(config.maxContext) || 128000;

  let library;
  try {
    library = loadLibrary(roots);
  } catch (error) {
    log('资产扫描失败：', error?.message || error);
    library = { cards: [], presets: [], lorebooks: [], errors: [] };
  }
  log(`资产：${library.cards.length} 张卡 / ${library.presets.length} 个预设 / ${library.lorebooks.length} 本世界书` +
    (library.errors.length ? ` / ${library.errors.length} 个错误` : ''));

  const state = {
    card: null,
    presetBase: null,
    presetOverrides: null,
    preset: null,
    variables: {},
    variablesHash: '',
    greeting: '',
    systemText: '',
    depthText: '',
    disposeSection: null,
    lastKey: '',
    renders: 0,
  };
  const cardCache = new Map();
  const keyedCards = new Map();

  function composeDepth(depth, injected) {
    const items = [
      ...(injected || []).map((item) => ({ ...item, depth: Number(item.depth) || 0 })),
      ...(depth || []).map((item) => ({ ...item, depth: Number(item.depth) || 0 })),
    ];
    // 深度 0 最靠近对话：追加到 system 末尾时按深度降序排列。
    items.sort((a, b) => (Number(b.depth) || 0) - (Number(a.depth) || 0));
    return items.map((item) => item.content).filter(Boolean).join('\n\n');
  }

  function render(card, preset) {
    const budget = Number(config.worldInfoBudget) || Math.round(maxContext * 0.25);
    const env = createMacroEnv({
      card,
      userName: config.userName || '你',
      maxPrompt: config.maxPrompt,
      maxContext,
    });
    const lorebookByName = new Map();
    const scope = createEjsScope(state.variables, {
      getwi: (entryName) => lorebookByName.get(entryName) ?? '',
      getchar: () => card?.name ?? '',
      resolve: (key) => (env && key in env ? env[key] : undefined),
    });
    // @@if 等装饰器在激活阶段就求值：条件为假的条目不占 token 预算，
    // 激活条目存的是去掉装饰器指令后的最终正文。
    const lorebook = activateEntries({
      entries: bookEntriesOf(card),
      scanText: buildScanText(card),
      budget,
      decorateEntry: (entry) => applyWorldInfoDecorators(entry.content, scope),
    });
    for (const entry of lorebook.activated || []) lorebookByName.set(entry.comment, entry.content);
    const rendered = renderPrompt({ card, preset, lorebook, env, ejsScope: scope });
    state.systemText = [rendered.system, rendered.tail].filter(Boolean).join('\n\n');
    state.depthText = composeDepth(rendered.depth, rendered.injected);
    state.renders += 1;

    const errors = [];
    const combined = `${state.systemText}\n${state.depthText}`;
    for (const match of combined.matchAll(EJS_ERROR_RE)) errors.push(match[1]);
    const tail = [
      `角色「${card?.name ?? '-'}」预设「${preset?.name ?? '默认'}」`,
      `世界书 ${lorebook.stats.activated}/${lorebook.stats.total}（${lorebook.stats.tokens} tokens）`,
      `system ${state.systemText.length} 字 depth ${rendered.depth.length} injected ${rendered.injected.length}`,
    ];
    if (errors.length) tail.push(`EJS 错误 ${errors.length}：${errors[0].slice(0, 160)}`);
    log(tail.join(' · '));
  }

  function installSection() {
    try {
      if (state.disposeSection) {
        try { state.disposeSection(); } catch { /* ignore */ }
        state.disposeSection = null;
      }
      const greetingBlock = state.greeting
        ? `[你的开场白（已作为本局对话的第一条消息发给玩家）]\n${state.greeting}`
        : '';
      const text = [state.systemText, state.depthText, greetingBlock].filter(Boolean).join('\n\n');
      const section = {
        name: 'dsh-tt:roleplay',
        order: 100,
        complete: true,
        interpolate: false,
        text,
      };
      try {
        state.disposeSection = ctx.systemPrompt.section(section);
      } catch (error) {
        log('complete 段被拒，退回普通段：', error?.message || error);
        state.disposeSection = ctx.systemPrompt.section({ ...section, complete: false });
      }
    } catch (error) {
      log('systemPrompt 不可用：', error?.message || error);
    }
  }

  /** 解析信封里的卡；优先按客户端给的 hash 命中缓存。 */
  function resolveCard(binding) {
    if (!binding?.cardJson || typeof binding.cardJson !== 'object') return null;
    const hash = typeof binding.cardHash === 'string' ? binding.cardHash : '';
    if (hash && cardCache.has(hash)) return cardCache.get(hash);
    const normalized = normalizeCard(binding.cardJson);
    if (hash) {
      if (cardCache.size > 8) cardCache.clear();
      cardCache.set(hash, normalized);
    }
    return normalized;
  }

  /** 应用一次客户端绑定。返回是否改变了系统提示词。 */
  function applyBinding(binding) {
    if (!binding || typeof binding !== 'object') return false;
    let changed = false;

    // 卡：优先整卡 JSON（导入的卡）；否则按名字在资产库里找。
    if (binding.cardJson && typeof binding.cardJson === 'object') {
      const parsed = resolveCard(binding);
      if (parsed && cardKeyOf(parsed) !== cardKeyOf(state.card)) {
        state.card = parsed;
        changed = true;
      }
    } else if (binding.cardName && state.card?.name !== binding.cardName) {
      const found = library.cards.find((entry) => entry.card?.name === binding.cardName || entry.id === binding.cardName);
      if (found?.card) {
        state.card = found.card;
        changed = true;
      }
    }

    // 预设：整份 JSON / 名字 / 仅覆盖。
    let baseChanged = false;
    if (binding.presetJson && typeof binding.presetJson === 'object') {
      const parsed = parsePreset(binding.presetJson);
      const key = `${binding.presetHash || ''}|${presetKeyOf(parsed)}`;
      if (key !== state.presetBaseKey) {
        state.presetBase = parsed;
        state.presetBaseKey = key;
        baseChanged = true;
      }
    } else if (binding.presetName) {
      const found = library.presets.find((entry) => entry.name === binding.presetName || entry.id === binding.presetName);
      if (found?.preset) {
        const key = `lib|${found.id}|${presetKeyOf(found.preset)}`;
        if (key !== state.presetBaseKey) {
          state.presetBase = found.preset;
          state.presetBaseKey = key;
          baseChanged = true;
        }
      } else if (!state.presetBase) {
        const fallback = library.presets[0]?.preset ?? null;
        if (fallback) {
          state.presetBase = fallback;
          state.presetBaseKey = `fallback|${presetKeyOf(fallback)}`;
          baseChanged = true;
        }
      }
    }

    let overridesChanged = false;
    if (binding.presetOverrides && typeof binding.presetOverrides === 'object') {
      const key = hashOf(binding.presetOverrides);
      if (key !== state.presetOverridesKey) {
        state.presetOverrides = binding.presetOverrides;
        state.presetOverridesKey = key;
        overridesChanged = true;
      }
    }

    if (baseChanged || overridesChanged || !state.preset) {
      state.preset = state.presetBase ? applyPresetOverrides(state.presetBase, state.presetOverrides) : null;
      changed = true;
    }

    // 变量与开场白。
    if (binding.variables && typeof binding.variables === 'object') {
      const key = hashOf(binding.variables);
      if (key !== state.variablesHash) {
        state.variables = binding.variables;
        state.variablesHash = key;
        changed = true;
      }
    }
    if (typeof binding.greeting === 'string' && binding.greeting !== state.greeting) {
      state.greeting = binding.greeting;
      changed = true;
    }
    if (!state.card) return changed;

    const nextKey = [
      cardKeyOf(state.card),
      state.presetBaseKey || '',
      state.presetOverridesKey || '',
      state.variablesHash,
      state.greeting,
    ].join('|');

    if (changed || state.lastKey !== nextKey) {
      state.lastKey = nextKey;
      render(state.card, state.preset);
      installSection();
      return true;
    }
    return false;
  }

  // 初始绑定：配置里指定的卡，否则第一张。
  const initial = resolveActive(library, config.activeCharacter);
  if (!initial) {
    log('没有找到角色卡；把卡放进 assets/characters 或 参考/ 目录。');
    return;
  }
  state.card = initial.card;
  state.presetBase = config.presetName
    ? library.presets.find((entry) => entry.name === config.presetName || entry.id === config.presetName)?.preset ?? null
    : (library.presets[0]?.preset ?? null);
  state.presetBaseKey = `init|${presetKeyOf(state.presetBase)}`;
  state.preset = state.presetBase;
  render(state.card, state.preset);
  installSection();

  // 消息进入收件箱时，在 system-prompt 组装之前应用绑定。
  try {
    ctx.on('agent/inbox/inserted', (payload) => {
      try {
        const envelope = readEnvelope(payload?.message);
        if (envelope) applyBinding(envelope.binding);
      } catch (error) {
        log('inbox/inserted 处理失败：', error?.message || error);
      }
    });
    log('已挂载 agent/inbox/inserted（绑定切换）。');
  } catch (error) {
    log('agent/inbox/inserted 订阅失败：', error?.message || error);
  }

  // 进入步骤前剥离信封：日志与模型都只看到用户原文。
  try {
    ctx.on('agent/pre-step', async (payload, next) => {
      const decision = await next();
      try {
        if (!decision || decision.kind !== 'enter' || !Array.isArray(decision.messages)) return decision;
        let changed = false;
        let binding = null;
        const messages = decision.messages.map((message) => {
          const envelope = readEnvelope(message);
          if (!envelope) return message;
          changed = true;
          if (!binding) binding = envelope.binding;
          return replaceMessageText(message, envelope.body);
        });
        if (!changed) return decision;
        // 兜底：若 inbox 事件没有触发（例如恢复会话），这里再应用一次。
        if (binding) applyBinding(binding);
        return { ...decision, messages };
      } catch (error) {
        log('pre-step 处理失败：', error?.message || error);
        return decision;
      }
    });
    log('已挂载 agent/pre-step（信封剥离）。');
  } catch (error) {
    log('agent/pre-step 订阅失败：', error?.message || error);
  }
}
