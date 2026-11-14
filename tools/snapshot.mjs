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

const { loadLibrary, bookEntriesOf, resolveActive } = await load('plugin/lib/library.js');
const { activateEntries } = await load('plugin/lib/lorebook.js');
const { renderPrompt } = await load('plugin/lib/prompt.js');
const { createMacroEnv } = await load('plugin/lib/macros.js');
const { createEjsScope } = await load('plugin/lib/ejs.js');
const { applyWorldInfoDecorators } = await load('plugin/lib/decorators.js');

const roots = [path.join(assetRoot, '参考'), path.join(assetRoot, 'assets')];
const library = loadLibrary(roots);

const active = resolveActive(library, process.env.DSH_TT_ACTIVE || undefined);
let activeSnapshot = null;

if (active) {
  const card = active.card;
  const scanText = [card.description, card.firstMes, ...(card.alternateGreetings ?? []).slice(0, 3), card.scenario]
    .filter(Boolean).join('\n');
  const entries = bookEntriesOf(card);
  const env = createMacroEnv({ card, userName: '你', maxPrompt: 128000, maxContext: 200000 });
  const lorebookByName = new Map();
  const ejsScope = createEjsScope({}, {
    getwi: (name) => lorebookByName.get(name) ?? '',
    getchar: () => card.name,
    resolve: (key) => (env && key in env ? env[key] : undefined),
  });
  const lorebook = activateEntries({
    entries,
    scanText,
    budget: Number(process.env.DSH_TT_WI_BUDGET) || 32000,
    decorateEntry: (entry) => applyWorldInfoDecorators(entry.content, ejsScope),
  });
  for (const entry of lorebook.activated) lorebookByName.set(entry.comment, entry.content);
  const preset = library.presets[0]?.preset ?? null;
  const rendered = renderPrompt({ card, preset, lorebook, env, ejsScope });
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
    // 面板只用这些元数据；正文由客户端按需从磁盘读。
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
  (activeSnapshot ? ` | active=${activeSnapshot.cardId} wi=${activeSnapshot.worldInfo.activated}/${activeSnapshot.worldInfo.total} sys=${activeSnapshot.systemLength}` : ''),
);
