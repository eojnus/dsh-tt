// 提示词管线自检：把资产库跑一遍，报告与文档验收口径一致的指标。
// 与 Host 使用同一个 runPromptPipeline（plugin/lib/pipeline.js），所以数字可以直接对账。
//
// 用法：
//   node tools/check.mjs [资产根目录] [卡名]
//   环境变量：
//     DSH_TT_ACTIVE   按名字选卡（否则资产库第一张）
//     DSH_TT_VARS     变量 JSON，例如 '{"牛头":true}'
//     DSH_TT_GREETING 开场白文本
//     DSH_TT_WI_BUDGET 世界书预算（默认 32000）
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const assetRoot = process.argv[2] || projectRoot;
const load = (relative) => import(pathToFileURL(path.join(projectRoot, relative)).href);

const { loadLibrary, resolveActive } = await load('plugin/lib/library.js');
const { runPromptPipeline } = await load('plugin/lib/pipeline.js');
const { normalizeCharacterBookEntries } = await load('plugin/lib/lorebook.js');

function parseVariables() {
  if (!process.env.DSH_TT_VARS) return {};
  try {
    return JSON.parse(process.env.DSH_TT_VARS);
  } catch {
    console.error('DSH_TT_VARS 不是合法 JSON，按空变量处理');
    return {};
  }
}

const countMatches = (text, re) => (text.match(re) || []).length;

const roots = [path.join(assetRoot, '参考'), path.join(assetRoot, 'assets')];
const library = loadLibrary(roots);

console.log('== 资产库 ==');
for (const entry of library.cards) {
  const summary = entry.summary || {};
  console.log(`卡    ${entry.id}  ${path.basename(entry.file)}  ${summary.name}（${summary.spec}，` +
    `${summary.counts?.lorebookEntries ?? 0} 条目 / ${summary.counts?.firstMes ?? 0} 首条开场白 / ${summary.counts?.greetings ?? 0} 备选）`);
}
for (const entry of library.presets) console.log(`预设  ${entry.id}  ${path.basename(entry.file)}  ${entry.name}`);
for (const error of library.errors) console.log(`错误  ${error.file}: ${error.message}`);
console.log('');

const active = resolveActive(library, process.env.DSH_TT_ACTIVE || process.argv[3] || undefined);
if (!active) {
  console.error('没有找到角色卡');
  process.exit(1);
}

const card = active.card;
const preset = library.presets[0]?.preset ?? null;
const variables = parseVariables();
const greeting = process.env.DSH_TT_GREETING || '';
const budget = Number(process.env.DSH_TT_WI_BUDGET) || 32000;
const entries = normalizeCharacterBookEntries(card.characterBook);

const result = runPromptPipeline({
  card,
  preset,
  variables,
  greeting,
  maxContext: 200000,
  worldInfoBudget: budget,
});
const { lorebook, rendered, systemText, depthText, sectionText, errors, stats } = result;
const lines = sectionText.split('\n');

// 模板统计：解释字符数变化的可能来源。
const joined = [
  card.description, card.personality, card.scenario, card.firstMes, card.systemPrompt,
  card.postHistoryInstructions, card.mesExample, ...(card.alternateGreetings ?? []),
  ...entries.map((entry) => entry.content),
  ...(preset?.prompts ?? []).map((prompt) => prompt.content),
].join('\n');

const leftovers = {
  ejsOpen: countMatches(sectionText, /<%/g),
  ejsClose: countMatches(sectionText, /%>/g),
  ejsError: countMatches(sectionText, /dsh-tt EJS error/g),
  decorator: countMatches(sectionText, /@@(?:if|activate|dont_activate)/g),
  macroLeft: countMatches(sectionText, /\{\{[^}]{0,40}\}\}/g),
  commentMacro: countMatches(sectionText, /\{\{\/\//g),
};

console.log('== 资产 ==');
console.log(`根目录      ${roots.join(' ; ')}`);
console.log(`卡          ${card.name}（${card.spec}，${entries.length} 条内嵌条目）`);
console.log(`预设        ${preset?.name ?? '(无)'}（${preset?.prompts?.length ?? 0} prompts / ${preset?.order?.length ?? 0} order）`);
console.log(`变量        ${JSON.stringify(variables)}${greeting ? `，开场白 ${greeting.length} 字` : ''}`);
console.log('== 世界书 ==');
console.log(`激活        ${lorebook.stats.activated}/${lorebook.stats.total}，${lorebook.stats.tokens} tokens / 预算 ${budget}`);
console.log(`递归        ${lorebook.stats.recursion} 轮（共扫描 ${lorebook.stats.rounds} 轮），按来源 ${JSON.stringify(lorebook.stats.byActivation)}`);
console.log(`常量/关键词  ${lorebook.activated.filter((entry) => entry.constant).length} / ${lorebook.activated.filter((entry) => !entry.constant).length}`);
console.log(`分桶        before=${lorebook.buckets.before.length} after=${lorebook.buckets.after.length} ` +
  `depth=${lorebook.buckets.depth.length} outlet=${lorebook.buckets.outlet.length}`);
const skipReasons = {};
for (const item of lorebook.skipped) skipReasons[item.why] = (skipReasons[item.why] || 0) + 1;
console.log(`跳过原因    ${JSON.stringify(skipReasons)}`);
console.log('== 提示词 ==');
console.log(`system 段   ${systemText.length} 字（${lines.length} 行）`);
console.log(`深度注入    ${depthText.length} 字（${rendered.depth.length} 组 + ${rendered.injected.length} 绝对注入）`);
console.log(`完整段      ${sectionText.length} 字（含开场白块 ${result.greetingBlock.length} 字）`);
console.log(`trace       ${rendered.trace.parts.length} 段；EJS 错误 ${errors.ejs.length}、正则错误 ${errors.regex.length}`);
console.log(`正则规则    ${result.regexRules.length} 条（placement 5：${result.regexRules.filter((rule) => rule.placement.includes(5)).length}）`);
console.log('== 模板统计 ==');
console.log(`trim 标记   <%_ ${countMatches(joined, /<%_/g)} 个，_%> ${countMatches(joined, /_%>/g)} 个，-%> ${countMatches(joined, /-%>/g)} 个，<%% ${countMatches(joined, /<%%/g)} 个`);
console.log(`EJS 标记    ${countMatches(joined, /<%/g)} 个；宏 {{…}} ${countMatches(joined, /\{\{[^}]{0,40}\}\}/g)} 个，{{//}} ${countMatches(joined, /\{\{\/\//g)} 个`);
console.log('== 残留检查 ==');
console.log(JSON.stringify(leftovers));
const bad = Object.entries(leftovers).filter(([key, value]) => value > 0 && key !== 'macroLeft');
if (bad.length) {
  console.log('!! 有残留：' + bad.map(([key, value]) => `${key}=${value}`).join(' '));
  const sample = sectionText.match(/<%.{0,120}/);
  if (sample) console.log('样例：' + sample[0]);
} else {
  console.log('OK：无 EJS/装饰器残留');
}
console.log(`== 汇总 ==\n${JSON.stringify(stats)}`);
