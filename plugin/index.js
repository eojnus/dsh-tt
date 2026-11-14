// DSH 角色扮演插件（Host 侧）
//
// 职责：
// 1) 扫描资产（卡 / 预设 / 世界书）；
// 2) 接受客户端通过 prompt 信封传来的绑定（卡 + 预设），据此重建 ST 语义的系统提示词；
// 3) 在 agent/pre-step 里剥离信封、注入 @depth 条目，保证会话日志只留用户原文。

import path from 'node:path';
import { loadLibrary, bookEntriesOf, resolveActive } from './lib/library.js';
import { activateEntries } from './lib/lorebook.js';
import { renderPrompt } from './lib/prompt.js';
import { createMacroEnv } from './lib/macros.js';

export const name = 'dsh-tt-roleplay';

const MARK = '\u0000TT\u0000';

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
    return { binding, body, blocks, index: 0 };
  } catch {
    return null;
  }
}

export function apply(ctx, config = {}) {
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

  const state = {
    card: null,
    preset: null,
    systemText: '',
    disposeSection: null,
  };

  function render(card, preset) {
    const budget = Number(config.worldInfoBudget) || Math.round(maxContext * 0.25);
    const lorebook = activateEntries({ entries: bookEntriesOf(card), scanText: buildScanText(card), budget });
    const env = createMacroEnv({
      card,
      userName: config.userName || '你',
      maxPrompt: config.maxPrompt,
      maxContext,
    });
    const rendered = renderPrompt({ card, preset, lorebook, env });
    state.systemText = [rendered.system, rendered.tail].filter(Boolean).join('\n\n');
    state.depth = [...(rendered.depth ?? []), ...(rendered.injected ?? [])];
    log(
      `角色「${card?.name ?? '-'}」预设「${preset?.name ?? '默认'}」` +
      `世界书 ${lorebook.stats.activated}/${lorebook.stats.total}（${lorebook.stats.tokens} tokens）` +
      `system ${state.systemText.length} 字 depth ${state.depth.length} 条`,
    );
  }

  function installSection() {
    try {
      if (state.disposeSection) {
        try { state.disposeSection(); } catch { /* ignore */ }
        state.disposeSection = null;
      }
      const section = {
        name: 'dsh-tt:roleplay',
        order: 100,
        complete: true,
        interpolate: false,
        text: state.systemText,
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

  // 初始绑定：配置里指定的卡，否则第一张。
  const initial = resolveActive(library, config.activeCharacter);
  if (initial) {
    state.card = initial.card;
    state.preset = config.presetName
      ? library.presets.find((p) => p.name === config.presetName || p.id === config.presetName)?.preset ?? null
      : (library.presets[0]?.preset ?? null);
    render(state.card, state.preset);
    installSection();
  } else {
    log('没有找到角色卡；把卡放进 assets/characters 或 参考/ 目录。');
  }

  // 信封：客户端每次发言都会带上 { card, preset } 的标识（或整卡），这里据此切换绑定。
  try {
    ctx.on('agent/pre-step', (decision, next) => {
      try {
        const messages = decision?.messages;
        if (Array.isArray(messages) && messages.length) {
          for (const message of messages) {
            const envelope = readEnvelope(message);
            if (!envelope) continue;
            const { binding, body, blocks } = envelope;

            // 1) 剥离信封，只留用户原文
            blocks[0] = typeof blocks[0] === 'string'
              ? body
              : { ...blocks[0], text: body };

            // 2) 绑定
            const cardEntry = binding?.cardJson
              ? { card: binding.cardJson }
              : (library.cards.find((c) => c.card?.name === binding?.cardName) ?? null);
            const preset = binding?.presetJson
              ?? library.presets.find((p) => p.name === binding?.presetName)?.preset
              ?? state.preset;

            let changed = false;
            if (cardEntry?.card && cardEntry.card !== state.card) {
              state.card = cardEntry.card;
              changed = true;
            }
            if (preset && preset !== state.preset) {
              state.preset = preset;
              changed = true;
            }
            if (changed) {
              render(state.card, state.preset);
              installSection();
            }

            // 3) 深度注入
            const depthItems = state.depth ?? [];
            for (const item of depthItems) {
              const at = Math.max(0, messages.length - 1 - (Number(item.depth) || 0));
              messages.splice(at, 0, {
                role: item.role === 'user' || item.role === 'assistant' ? item.role : 'system',
                content: [{ type: 'text', text: item.content }],
              });
            }
            break;
          }
        }
      } catch (error) {
        log('pre-step 处理失败：', error?.message || error);
      }
      return typeof next === 'function' ? next(decision) : decision;
    });
    log('已挂载 agent/pre-step（信封剥离 + 深度注入）。');
  } catch (error) {
    log('agent/pre-step 订阅失败：', error?.message || error);
  }
}
