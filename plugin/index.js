// DSH 角色扮演插件（Host 侧）：加载 ST 资产 → 激活世界书 → 组装 ST 语义的系统提示词。
//
// v1 边界（与设计文档 v0.8 对应）：
// - 只接管 system 段（ctx.systemPrompt.section + complete），不动 messages；
// - 世界书只做"常量 + 关键词 + 次关键词 + 概率 + 预算 + 位置分桶"，递归与计时效果留到 v2；
// - 资产来自磁盘目录扫描，不落库（denormalized 也不需要）。

import path from 'node:path';
import { loadLibrary, bookEntriesOf, resolveActive } from './lib/library.js';
import { activateEntries } from './lib/lorebook.js';
import { renderPrompt } from './lib/prompt.js';
import { createMacroEnv } from './lib/macros.js';

export const name = 'dsh-tt-roleplay';

function log(...args) {
  // Host 进程日志；不依赖 harness 的 logger 服务，避免服务缺失时抛错。
  console.log('[dsh-tt]', ...args);
}

function buildScanText(card) {
  const parts = [
    card?.description,
    card?.firstMes,
    ...(card?.alternateGreetings?.slice(0, 3) ?? []),
    card?.scenario,
  ];
  return parts.filter(Boolean).join('\n');
}

export function apply(ctx, config = {}) {
  const root = config.assetsDir || 'X:\\dsh-tt';
  const roots = [path.join(root, '参考'), path.join(root, 'assets')];
  const maxContext = Number(config.maxContext) || 128000;
  const budget = Number(config.worldInfoBudget) || Math.round(maxContext * 0.25);

  let library;
  try {
    library = loadLibrary(roots);
  } catch (error) {
    log('资产扫描失败：', error?.message || error);
    library = { cards: [], presets: [], lorebooks: [], errors: [] };
  }

  const active = resolveActive(library, config.activeCharacter);
  if (!active) {
    log('没有找到角色卡，系统提示词接管已跳过。把卡放进 assets/characters 或 参考/ 后重启即可。');
    return;
  }

  const card = active.card;
  const preset = config.presetName
    ? library.presets.find((p) => p.name === config.presetName || p.id === config.presetName)?.preset ?? null
    : (library.presets[0]?.preset ?? null);

  const scanText = buildScanText(card);
  const entries = bookEntriesOf(card);
  const lorebook = activateEntries({ entries, scanText, budget });

  const env = createMacroEnv({
    card,
    userName: config.userName || '你',
    lastMessage: '',
    maxPrompt: config.maxPrompt,
    maxContext: config.maxContext,
  });
  const rendered = renderPrompt({ card, preset, lorebook, env });
  const systemText = [rendered.system, rendered.tail].filter(Boolean).join('\n\n');

  log(
    `已加载 ${library.cards.length} 张卡 / ${library.presets.length} 个预设 / ${library.lorebooks.length} 本世界书；` +
    `当前角色「${card.name}」；世界书命中 ${lorebook.stats.activated}/${lorebook.stats.total} 条（${lorebook.stats.tokens}/${budget} tokens）；` +
    `system ${systemText.length} 字`,
  );
  if (library.errors.length) log('有文件解析失败：', library.errors.map((e) => e.file));

  const section = {
    name: 'dsh-tt:roleplay',
    order: 100,
    complete: true,
    interpolate: false,
    text: systemText,
  };

  // 只有 takeover 明确为 true 的实例（预设内那一行）才接管系统提示词；
  // 根层那一行只负责让客户端模块被发现。
  if (config.takeover !== true) {
    log('根层实例：只提供客户端模块与资产扫描，不接管提示词（takeover=true 的预设实例才接管）。');
    return;
  }

  try {
    let disposer;
    try {
      disposer = ctx.systemPrompt.section(section);
    } catch (error) {
      log('complete 段注册失败，退回普通段：', error?.message || error);
      disposer = ctx.systemPrompt.section({ ...section, complete: false });
    }
    ctx.effect?.(() => () => { if (typeof disposer === 'function') disposer(); });
    log('系统提示词已接管（complete 段）。');
  } catch (error) {
    log('systemPrompt 服务不可用，未接管提示词：', error?.message || error);
  }
}
