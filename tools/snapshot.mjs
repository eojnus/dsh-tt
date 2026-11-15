// 构建期快照：把资产库解析成面板可用的元数据。
// v3：不再把卡/预设正文塞进客户端包——客户端通过 workspaceFiles 远程读取原件。
// 用法：node tools/snapshot.mjs [资产根目录]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const assetRoot = process.argv[2] || projectRoot;
const load = (relative) => import(pathToFileURL(path.join(projectRoot, relative)).href);

const { loadLibrary, resolveActive } = await load('plugin/lib/library.js');
const { runPromptPipeline } = await load('plugin/lib/pipeline.js');

const roots = [path.join(assetRoot, '参考'), path.join(assetRoot, 'assets')];
const library = loadLibrary(roots);

const active = resolveActive(library, process.env.DSH_TT_ACTIVE || undefined);
let activeSnapshot = null;

if (active) {
  const card = active.card;
  const preset = library.presets[0]?.preset ?? null;
  const result = runPromptPipeline({
    card,
    preset,
    userName: '你',
    maxContext: 200000,
    worldInfoBudget: Number(process.env.DSH_TT_WI_BUDGET) || 32000,
  });
  const { lorebook, systemText, sectionText } = result;

  activeSnapshot = {
    cardId: active.id,
    presetName: preset?.name ?? null,
    systemLength: systemText.length,
    effectiveLength: sectionText.length,
    depthGroups: result.rendered.depth.length,
    injectedCount: result.rendered.injected.length,
    systemPreview: systemText.slice(0, 4000),
    truncated: systemText.length > 4000,
    worldInfo: {
      total: lorebook.stats.total,
      activated: lorebook.stats.activated,
      tokens: lorebook.stats.tokens,
      budget: lorebook.stats.budget,
      recursion: lorebook.stats.recursion,
      constants: lorebook.activated.filter((entry) => entry.constant).length,
      matched: lorebook.activated.filter((entry) => !entry.constant).map((entry) => entry.comment).filter(Boolean).slice(0, 12),
      skipped: lorebook.skipped.slice(0, 12),
    },
  };
}

const snapshot = {
  generatedAt: new Date().toISOString(),
  version: 3,
  roots,
  counts: {
    cards: library.cards.length,
    presets: library.presets.length,
    lorebooks: library.lorebooks.length,
    errors: library.errors.length,
  },
  cards: library.cards.map((entry) => ({
    id: entry.id,
    file: path.basename(entry.file),
    filePath: entry.file,
    ...entry.summary,
    hasFilePath: true,
  })),
  presets: library.presets.map((entry) => ({
    id: entry.id,
    file: path.basename(entry.file),
    filePath: entry.file,
    name: entry.name,
    counts: entry.summary,
  })),
  lorebooks: library.lorebooks.map((entry) => ({
    id: entry.id,
    file: path.basename(entry.file),
    filePath: entry.file,
    name: entry.name,
    counts: entry.summary,
  })),
  errors: library.errors,
  active: activeSnapshot,
};

const outDir = path.join(projectRoot, 'build');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2), 'utf8');
console.log(
  `snapshot: cards=${snapshot.counts.cards} presets=${snapshot.counts.presets} ` +
  `lorebooks=${snapshot.counts.lorebooks} errors=${snapshot.counts.errors}` +
  (activeSnapshot
    ? ` | active=${activeSnapshot.cardId} wi=${activeSnapshot.worldInfo.activated}/${activeSnapshot.worldInfo.total}` +
      ` sys=${activeSnapshot.systemLength} effective=${activeSnapshot.effectiveLength}`
    : ''),
);
