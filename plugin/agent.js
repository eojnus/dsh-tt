// DSH 角色扮演插件（Host 侧）
//
// 职责（仅 takeover=true 的实例，即「角色扮演」preset 内的实例）：
// 1) 扫描资产（卡 / 预设 / 世界书），作为没有绑定时用的默认值；
// 2) 在 agent/inbox/inserted 里读客户端通过 prompt 信封传来的绑定（卡 + 预设 + 变量），
//    在下一次 system-prompt 组装之前更新**该会话自己的**提示词状态；
// 3) 在 agent/pre-step 里把信封从进入步骤的消息中剥离，保证会话日志只留用户原文。
//
// 会话隔离：preset 的插件树由所有使用该 preset 的 agent 共享（dsh-agent-preset-registry
// 的 mountPreset），因此提示词段必须注册在 `agent.ctx` 上——它只对该 agent 生效，
// 并在 agent 释放时自动撤销。段文本是函数，每次组装时读取该会话的最新状态，
// 所以换卡/改变量不需要重新注册段（也就不会触发 system-prompt/change 风暴）。
//
// 根层实例只负责让客户端模块被发现，不接管任何提示词。

import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLibrary, resolveActive } from './lib/library.js';
import { createWorldInfoSession } from './lib/lorebook.js';
import { normalizeCard } from './lib/card.js';
import { parsePreset, applyPresetOverrides } from './lib/prompt.js';
import { runPromptPipeline, worldInfoHistoryLimit } from './lib/pipeline.js';
import { applyUserInputRegex } from './lib/regex.js';
import { splitChatInput } from './lib/chat-wire.js';

export const name = 'dsh-tt-roleplay-agent';

// systemPrompt 是 agent 作用域服务；不声明 inject 时 Cordis 会拒绝属性访问。
export const inject = ['systemPrompt'];

/** 插件目录（…/dsh-tt/plugin），项目根是它的上一级。 */
const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(PLUGIN_DIR, '..');

function log(...args) {
  try { console.log('[dsh-tt]', ...args); } catch { /* ignore */ }
}

function shortId(agent) {
  const raw = String(agent?.id ?? '');
  return raw ? raw.slice(-8) : 'shared';
}

/** 从一条消息里取出信封；没有则返回 null。 */
function readEnvelope(message) {
  const first = Array.isArray(message?.content) ? message.content[0] : null;
  const parts = splitChatInput(typeof first === 'string' ? first : first?.text);
  if (!parts) return null;
  let binding = null;
  try {
    const value = JSON.parse(parts.header);
    if (value && typeof value === 'object' && !Array.isArray(value)) binding = value;
  } catch { /* Preserve the body even if the internal header is malformed. */ }
  return { binding, body: parts.body };
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

function assetKeyOf(raw) {
  return createHash('sha256').update(signatureOf(raw)).digest('hex');
}

/** 资产根目录：显式配置优先，否则用项目根下的 参考/ 与 assets/。 */
export function resolveAssetRoots(config = {}) {
  const base = config.assetsDir ? path.resolve(String(config.assetsDir)) : PROJECT_ROOT;
  const roots = [path.join(base, '参考'), path.join(base, 'assets')];
  for (const extra of Array.isArray(config.assetDirs) ? config.assetDirs : []) {
    if (typeof extra === 'string' && extra.trim()) roots.push(path.resolve(extra.trim()));
  }
  return roots;
}

export function apply(ctx, config = {}) {
  if (config.takeover !== true) {
    log('根层实例：只提供客户端模块与资产扫描，不接管提示词（takeover=true 的预设实例才接管）。');
    return;
  }

  const roots = resolveAssetRoots(config);
  const maxContext = Number(config.maxContext) || 128000;
  const userName = config.userName || '你';

  let library;
  try {
    library = loadLibrary(roots);
  } catch (error) {
    log('资产扫描失败：', error?.message || error);
    library = { cards: [], presets: [], lorebooks: [], errors: [] };
  }
  log(`资产：${library.cards.length} 张卡 / ${library.presets.length} 个预设 / ${library.lorebooks.length} 本世界书` +
    (library.errors.length ? ` / ${library.errors.length} 个错误` : '') + `（根：${roots.join(' ; ')}）`);

  const cardCache = new Map();
  /** agentId → { agent, state, disposeSection } */
  const records = new Map();
  /** 没有 agent 时的兜底记录（正常路径不会用到）。 */
  let sharedRecord = null;

  function createState() {
    return {
      card: null,
      cardKey: '',
      presetBase: null,
      presetBaseKey: '',
      presetOverrides: null,
      presetOverridesKey: '',
      preset: null,
      variables: {},
      variablesHash: '',
      greeting: '',
      systemText: '',
      depthText: '',
      sectionText: '',
      lastKey: '',
      renders: 0,
      // 世界书计时状态（sticky/cooldown/delay）按会话独立推进。
      worldInfo: createWorldInfoSession(),
      chatWorldbook: null,
      chatWorldbookKey: '',
      worldInfoChat: undefined,
      worldInfoChatKey: '',
      scriptPrompts: [],
      scriptPromptsKey: '',
      // 卡 + 预设自带的 ST 正则脚本（prompt 作用域用）。
      regexRules: [],
    };
  }

  function render(record) {
    const state = record.state;
    if (!state.card) return;
    const result = runPromptPipeline({
      card: state.card,
      preset: state.preset,
      variables: state.variables,
      userName,
      maxContext,
      worldInfoBudget: config.worldInfoBudget,
      session: state.worldInfo,
      recursive: config.worldInfoRecursive !== false,
      maxRecursionSteps: config.worldInfoMaxRecursion,
      minActivations: config.worldInfoMinActivations,
      greeting: state.greeting,
      chatMessages: state.worldInfoChat,
      chatWorldbook: state.chatWorldbook,
      scriptPrompts: state.scriptPrompts,
    });
    state.regexRules = result.regexRules;
    state.systemText = result.systemText;
    state.depthText = result.depthText;
    state.sectionText = result.sectionText;
    state.renders += 1;

    const worldInfo = result.lorebook.stats;
    const tail = [
      `[${shortId(record.agent)}] 角色「${state.card?.name ?? '-'}」预设「${state.preset?.name ?? '默认'}」`,
      `世界书 ${worldInfo.activated}/${worldInfo.total}（${worldInfo.tokens} tokens）` +
        ` 递归 ${worldInfo.recursion} 轮 · turn ${state.worldInfo.turn}`,
      `system ${state.systemText.length} 字 depth ${result.rendered.depth.length} injected ${result.rendered.injected.length}`,
    ];
    if (result.errors.ejs.length) tail.push(`EJS 错误 ${result.errors.ejs.length}：${result.errors.ejs[0].slice(0, 160)}`);
    if (result.errors.regex.length) tail.push(`正则错误 ${result.errors.regex.length}：${result.errors.regex[0]}`);
    log(tail.join(' · '));
  }

  /** 组装一段系统提示词文本（每次组装时调用，读到的是该会话最新状态）。 */
  function composeSectionText(record) {
    return record.state.sectionText || '';
  }

  function resolveCard(raw, key) {
    if (cardCache.has(key)) return cardCache.get(key);
    const normalized = normalizeCard(raw);
    if (cardCache.size >= 8) cardCache.clear();
    cardCache.set(key, normalized);
    return normalized;
  }

  function bindCard(state, card, key) {
    state.card = card;
    state.cardKey = key;
    state.worldInfo = { ...createWorldInfoSession(), turn: state.worldInfo.turn };
  }

  function findPresetByName(name) {
    return library.presets.find((entry) => entry.name === name || entry.id === name)?.preset ?? null;
  }

  /** 应用一次客户端绑定。返回是否改变了该会话的提示词状态。 */
  function applyBinding(record, binding, body) {
    if (!binding || typeof binding !== 'object') return false;
    const state = record.state;
    let changed = false;

    // 卡：优先整卡 JSON（导入的卡）；否则按名字在资产库里找。
    if (binding.cardJson && typeof binding.cardJson === 'object') {
      const key = assetKeyOf(binding.cardJson);
      if (key !== state.cardKey) {
        bindCard(state, resolveCard(binding.cardJson, key), key);
        changed = true;
      }
    } else if (binding.cardName && state.card?.name !== binding.cardName) {
      const found = library.cards.find((entry) => entry.card?.name === binding.cardName || entry.id === binding.cardName);
      if (found?.card) {
        bindCard(state, found.card, assetKeyOf(found.card.raw));
        changed = true;
      }
    }

    // 预设：整份 JSON / 名字 / 仅覆盖。
    let baseChanged = false;
    if (binding.presetJson && typeof binding.presetJson === 'object') {
      const key = assetKeyOf(binding.presetJson);
      if (key !== state.presetBaseKey) {
        state.presetBase = parsePreset(binding.presetJson);
        state.presetBaseKey = key;
        baseChanged = true;
      }
    } else if (binding.presetName) {
      const found = findPresetByName(binding.presetName);
      if (found) {
        const key = assetKeyOf(found.raw);
        if (key !== state.presetBaseKey) {
          state.presetBase = found;
          state.presetBaseKey = key;
          baseChanged = true;
        }
      } else if (!state.presetBase) {
        const fallback = library.presets[0]?.preset ?? null;
        if (fallback) {
          state.presetBase = fallback;
          state.presetBaseKey = assetKeyOf(fallback.raw);
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

    if (baseChanged || overridesChanged) {
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
    if (Object.hasOwn(binding, 'chatWorldbook')) {
      const book = binding.chatWorldbook?.book;
      const key = book && typeof book === 'object' ? assetKeyOf(binding.chatWorldbook) : '';
      if (key !== state.chatWorldbookKey) {
        state.chatWorldbook = key ? book : null;
        state.chatWorldbookKey = key;
        for (const uid of Object.keys(state.worldInfo.entries)) {
          if (uid.startsWith('chat:')) delete state.worldInfo.entries[uid];
        }
        changed = true;
      }
    }
    if (!state.card) return changed;

    const scriptPrompts = Array.isArray(binding.scriptPrompts) ? binding.scriptPrompts : [];
    const promptsKey = scriptPrompts.length ? assetKeyOf(scriptPrompts) : '';
    if (promptsKey !== state.scriptPromptsKey) {
      state.scriptPrompts = scriptPrompts;
      state.scriptPromptsKey = promptsKey;
      changed = true;
    }

    if (typeof body === 'string') {
      const depth = worldInfoHistoryLimit(state.card.characterBook, state.chatWorldbook);
      const history = Array.isArray(binding.worldInfoHistory)
        ? binding.worldInfoHistory.filter((text) => typeof text === 'string')
        : [];
      const chat = [state.greeting, ...history, body].filter(Boolean).slice(-depth);
      const key = assetKeyOf(chat);
      if (key !== state.worldInfoChatKey) {
        state.worldInfoChat = chat;
        state.worldInfoChatKey = key;
        changed = true;
      }
    }
    const nextKey = [
      state.cardKey,
      state.presetBaseKey || '',
      state.presetOverridesKey || '',
      state.variablesHash,
      state.greeting,
      state.worldInfoChatKey,
      state.chatWorldbookKey,
      state.scriptPromptsKey,
      // turn 参与 key：sticky/cooldown/delay 随回合推进，必须每回合重算。
      String(state.worldInfo.turn),
    ].join('|');

    if (changed || state.lastKey !== nextKey) {
      state.lastKey = nextKey;
      render(record);
      return true;
    }
    return false;
  }

  /** 为该 agent 建立状态与它自己的提示词段。 */
  function ensureRecord(agent) {
    const id = agent?.id ?? '__shared__';
    if (agent?.id) {
      const existing = records.get(id);
      if (existing) return existing;
    } else if (sharedRecord) {
      return sharedRecord;
    }

    const record = { agent: agent ?? null, state: createState(), disposeSection: null };
    // 初始绑定：配置指定的卡，否则资产库第一张。
    const initial = resolveActive(library, config.activeCharacter);
    if (initial?.card) {
      record.state.card = initial.card;
      record.state.cardKey = assetKeyOf(initial.card.raw);
    }
    const base = config.presetName ? findPresetByName(config.presetName) : (library.presets[0]?.preset ?? null);
    if (base) {
      record.state.presetBase = base;
      record.state.presetBaseKey = assetKeyOf(base.raw);
      record.state.preset = base;
    }
    if (record.state.card) render(record);

    const section = {
      name: 'dsh-tt:roleplay',
      order: 100,
      complete: true,
      interpolate: false,
      text: () => composeSectionText(record),
    };
    const target = agent?.ctx;
    if (target?.systemPrompt) {
      try {
        record.disposeSection = target.systemPrompt.section(section);
      } catch (error) {
        log(`[${shortId(agent)}] complete 段被拒，退回普通段：`, error?.message || error);
        try {
          record.disposeSection = target.systemPrompt.section({ ...section, complete: false });
        } catch (inner) {
          log(`[${shortId(agent)}] 提示词段注册失败：`, inner?.message || inner);
        }
      }
      // agent 释放时清掉记录（段的撤销由 agent.ctx 自己负责）。
      try {
        target.effect(() => () => {
          if (agent?.id && records.get(agent.id) === record) records.delete(agent.id);
          if (sharedRecord === record) sharedRecord = null;
        }, 'dsh-tt.roleplay.record');
      } catch { /* 记录清理是尽力而为 */ }
    } else {
      log(`[${shortId(agent)}] agent.ctx.systemPrompt 不可用；本次会话没有提示词段（检查 agent 作用域）。`);
    }

    if (agent?.id) records.set(id, record);
    else sharedRecord = record;
    return record;
  }

  function recordFor(agent) {
    if (!agent?.id) return sharedRecord ?? ensureRecord(agent);
    return records.get(agent.id) ?? ensureRecord(agent);
  }

  // 每个使用本 preset 的 agent 一建立就注册它自己的段。
  try {
    ctx.on('agent/created', ({ agent } = {}) => {
      try { ensureRecord(agent); } catch (error) { log('agent/created 处理失败：', error?.message || error); }
    });
    log('已挂载 agent/created（按会话注册提示词段）。');
  } catch (error) {
    log('agent/created 订阅失败：', error?.message || error);
  }

  // 消息进入收件箱时，在 system-prompt 组装之前应用绑定。
  try {
    ctx.on('agent/inbox/inserted', (payload) => {
      try {
        const envelope = readEnvelope(payload?.message);
        if (!envelope?.binding) return;
        const record = recordFor(payload?.agent);
        // 一条带信封的用户消息 = 一个回合；世界书计时按它推进。
        record.state.worldInfo.turn += 1;
        applyBinding(record, envelope.binding, envelope.body);
      } catch (error) {
        log('inbox/inserted 处理失败：', error?.message || error);
      }
    });
    log('已挂载 agent/inbox/inserted（绑定切换）。');
  } catch (error) {
    log('agent/inbox/inserted 订阅失败：', error?.message || error);
  }

  // 进入步骤前剥离信封：日志与模型都只看到用户原文。
  // 注意：DSH 先 assemble 系统提示词、再发 agent/pre-step（agent-loop preStep），
  // 所以这里的绑定应用只是兜底，真正的时机是 inbox/inserted。
  // 用户输入的 prompt 作用域正则（placement=1）也在这里生效。
  try {
    ctx.on('agent/pre-step', async (payload, next) => {
      const decision = await next();
      if (decision?.kind !== 'enter' || !Array.isArray(decision.messages)) return decision;
      const entries = decision.messages.map((message) => ({ message, envelope: readEnvelope(message) }));
      if (!entries.some(({ envelope }) => envelope)) return decision;
      const clean = entries.map(({ message, envelope }) => envelope ? replaceMessageText(message, envelope.body) : message);
      try {
        const record = recordFor(payload?.agent);
        // 兜底：若 inbox 事件没有触发（例如恢复会话），这里再应用一次绑定，
        // 同时让 state.regexRules 与当前卡/预设对齐。
        const firstEnvelope = entries.find(({ envelope }) => envelope?.binding)?.envelope;
        if (firstEnvelope) applyBinding(record, firstEnvelope.binding, firstEnvelope.body);
        const rules = record.state.regexRules;
        const messages = rules.length
          ? entries.map(({ message, envelope }, index) => envelope?.binding
            ? replaceMessageText(message, applyUserInputRegex(envelope.body, rules))
            : clean[index])
          : clean;
        return { ...decision, messages };
      } catch (error) {
        log('pre-step 处理失败：', error?.message || error);
        return { ...decision, messages: clean };
      }
    });
    log('已挂载 agent/pre-step（信封剥离 + 用户输入正则）。');
  } catch (error) {
    log('agent/pre-step 订阅失败：', error?.message || error);
  }
}
