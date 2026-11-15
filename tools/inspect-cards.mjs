// 卡体检：逐张卡报告"用到哪些 ST 能力"，用来判断这张卡在我们这里能跑到什么程度。
// 用法：node tools/inspect-cards.mjs [资产根目录] [卡名过滤]
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const assetRoot = process.argv[2] || projectRoot;
const filter = process.argv[3] || '';
const load = (relative) => import(pathToFileURL(path.join(projectRoot, relative)).href);

const { loadLibrary } = await load('plugin/lib/library.js');
const { runPromptPipeline } = await load('plugin/lib/pipeline.js');
const { normalizeCharacterBookEntries } = await load('plugin/lib/lorebook.js');

const roots = [path.join(assetRoot, '参考'), path.join(assetRoot, 'assets')];
const library = loadLibrary(roots);
const preset = library.presets[0]?.preset ?? null;

const yes = (value) => (value ? '✅' : '—');

for (const entry of library.cards) {
  const card = entry.card;
  if (filter && !card.name.includes(filter)) continue;
  const entries = normalizeCharacterBookEntries(card.characterBook);
  const rawExtensions = card.extensions || {};
  const thScripts = card.thScripts || [];
  const enabledScripts = thScripts.filter((script) => script && script.enabled);
  const bookEntries = card.characterBook?.entries || [];
  const initVar = entries.filter((item) => /\[InitVar\]/i.test(String(item.comment || '')));
  const constant = entries.filter((item) => item.constant === true);
  const atDepth = entries.filter((item) => item.position === 4);
  const decorated = entries.filter((item) => /^\s*@@/.test(String(item.content || '')));
  const regex = card.regexScripts || [];

  const result = runPromptPipeline({
    card,
    preset,
    maxContext: 128000,
    worldInfoBudget: 32000,
  });

  console.log(`\n=== ${card.name} ===`);
  console.log(`文件        ${path.basename(entry.file)}（${card.spec}，v${card.characterVersion || '?'}）`);
  console.log(`卡面        description ${card.description.length} / first_mes ${card.firstMes.length} / 备选 ${card.alternateGreetings.length} / 示例 ${card.mesExample.length}`);
  console.log(`提示词      system_prompt ${card.systemPrompt.length} / post_history ${card.postHistoryInstructions.length} / depth_prompt ${card.depthPrompt ? `${card.depthPrompt.depth}/${card.depthPrompt.role}/${card.depthPrompt.prompt.length}` : '—'}`);
  console.log(`世界书      ${entries.length} 条（数组 ${Array.isArray(bookEntries) ? '是' : '否'}），常量 ${constant.length}，atDepth ${atDepth.length}，装饰器 ${decorated.length}`);
  console.log(`InitVar     ${yes(initVar.length)} ${initVar.map((item) => item.comment).join(' / ')}`);
  console.log(`TH 脚本     ${yes(thScripts.length)} 共 ${thScripts.length} 个，启用 ${enabledScripts.length}：${enabledScripts.map((script) => String(script.name || script.id).slice(0, 24)).join(' / ') || '—'}`);
  console.log(`TH 变量     ${rawExtensions.tavern_helper?.variables ? Object.keys(rawExtensions.tavern_helper.variables).length + ' 个' : '—'}`);
  console.log(`正则        ${yes(regex.length)} ${regex.length} 条，placement 分布 ${JSON.stringify(regex.reduce((acc, rule) => {
    const key = JSON.stringify(rule.placement ?? []);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {}))}`);
  const worldInfo = result.lorebook.stats;
  console.log(`管线        system ${result.stats.systemChars} 字 + 深度 ${result.stats.depthChars} 字 = ${result.stats.sectionChars} 字`);
  console.log(`世界书激活  ${worldInfo.activated}/${worldInfo.total}，${worldInfo.tokens}/${worldInfo.budget} tokens，递归 ${worldInfo.recursion} 轮，溢出 ${worldInfo.overflowed ? '是' : '否'}`);
  const skip = result.lorebook.skipped.reduce((acc, item) => {
    acc[item.why] = (acc[item.why] || 0) + 1;
    return acc;
  }, {});
  console.log(`跳过          ${JSON.stringify(skip)}`);
  console.log(`残留          EJS ${result.errors.ejs.length} / 正则错误 ${result.errors.regex.length} / <%% ${(result.sectionText.match(/<%/g) || []).length} / @@ ${(result.sectionText.match(/@@(if|activate|dont_activate)/g) || []).length}`);
}
