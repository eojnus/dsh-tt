// 构建期快照：把资产库解析成面板可用的 JSON。
// 用法：node tools/snapshot.mjs [资产根目录]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const assetRoot = process.argv[2] || projectRoot;
const load = (relative) => import(pathToFileURL(path.join(projectRoot, relative)).href);

const { loadLibrary, bookEntriesOf, resolveActive } = await load('plugin/lib/library.js');
const { activateEntries } = await load('plugin/lib/lorebook.js');
const { renderPrompt } = await load('plugin/lib/prompt.js');
const { createMacroEnv } = await load('plugin/lib/macros.js');

const roots = [path.join(assetRoot, '参考'), path.join(assetRoot, 'assets')];
const library = loadLibrary(roots);

const active = resolveActive(library, process.env.DSH_TT_ACTIVE || undefined);
let activeSnapshot = null;

if (active) {
  const card = active.card;
  const scanText = [card.description, card.firstMes, ...(card.alternateGreetings ?? []).slice(0, 3), card.scenario]
    .filter(Boolean).join('\n');
  const entries = bookEntriesOf(card);
  const lorebook = activateEntries({ entries, scanText, budget: Number(process.env.DSH_TT_WI_BUDGET) || 32000 });
  const preset = library.presets[0]?.preset ?? null;
  const env = createMacroEnv({ card, userName: '你', maxPrompt: 128000, maxContext: 200000 });
  const rendered = renderPrompt({ card, preset, lorebook, env });
  const systemText = [rendered.system, rendered.tail].filter(Boolean).join('\n\n');

  activeSnapshot = {
    cardId: active.id,
    presetName: preset?.name ?? null,
    systemLength: systemText.length,
    systemPreview: systemText.slice(0, 4000),
    truncated: systemText.length > 4000,
    worldInfo: {
      total: lorebook.stats.total,
      activated: lorebook.stats.activated,
      tokens: lorebook.stats.tokens,
      budget: lorebook.stats.budget,
      constants: lorebook.activated.filter((e) => e.constant).length,
      matched: lorebook.activated.filter((e) => !e.constant).map((e) => e.comment).filter(Boolean).slice(0, 12),
      skipped: lorebook.skipped.slice(0, 12),
    },
  };
}

const snapshot = {
  generatedAt: new Date().toISOString(),
  roots,
  counts: {
    cards: library.cards.length,
    presets: library.presets.length,
    lorebooks: library.lorebooks.length,
    errors: library.errors.length,
  },
  cards: library.cards.map((c) => ({ id: c.id, file: path.basename(c.file), ...c.summary })),
  presets: library.presets.map((p) => ({ id: p.id, file: path.basename(p.file), name: p.name, ...p.summary })),
  lorebooks: library.lorebooks.map((l) => ({ id: l.id, file: path.basename(l.file), name: l.name, ...l.summary })),
  errors: library.errors,
  active: activeSnapshot,
};

const outDir = path.join(projectRoot, 'build');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2), 'utf8');
console.log(
  `snapshot: cards=${snapshot.counts.cards} presets=${snapshot.counts.presets} ` +
  `lorebooks=${snapshot.counts.lorebooks} errors=${snapshot.counts.errors}` +
  (activeSnapshot ? ` | active=${activeSnapshot.cardId} wi=${activeSnapshot.worldInfo.activated}/${activeSnapshot.worldInfo.total} sys=${activeSnapshot.systemLength}` : ''),
);
