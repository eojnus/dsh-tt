// 提示词管线自检：把资产库跑一遍，报告与文档验收口径一致的指标。
//
// 用法：
//   node tools/check.mjs [资产根目录] [卡名]
//   环境变量：
//     DSH_TT_ACTIVE   按名字选卡（否则资产库第一张）
//     DSH_TT_VARS     变量 JSON，例如 '{"牛头":true}'
//     DSH_TT_GREETING 开场白文本（会按 agent.js 的方式拼在 system 末尾）
//     DSH_TT_WI_BUDGET 世界书预算（默认 32000）
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

function parseVariables() {
  if (!process.env.DSH_TT_VARS) return {};
  try {
    return JSON.parse(process.env.DSH_TT_VARS);
  } catch {
    console.error('DSH_TT_VARS 不是合法 JSON，按空变量处理');
    return {};
  }
}

function countMatches(text, re) {
  return (text.match(re) || []).length;
}

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

const scanText = [card.description, card.firstMes, ...(card.alternateGreetings ?? []).slice(0, 3), card.scenario]
  .filter(Boolean).join('\n');
const entries = bookEntriesOf(card);
const env = createMacroEnv({ card, userName: '你', maxPrompt: 128000, maxContext: 200000 });
const lorebookByName = new Map();
const scope = createEjsScope(variables, {
  getwi: (name) => lorebookByName.get(name) ?? '',
  getchar: () => card.name,
  resolve: (key) => (env && key in env ? env[key] : undefined),
});

const lorebook = activateEntries({
  entries,
  scanText,
  budget,
  decorateEntry: (entry) => applyWorldInfoDecorators(entry.content, scope),
});
for (const entry of lorebook.activated) lorebookByName.set(entry.comment, entry.content);

const rendered = renderPrompt({ card, preset, lorebook, env, ejsScope: scope });
const systemText = [rendered.system, rendered.tail].filter(Boolean).join('\n\n');
// 模型实际看到的 system 段 = system + tail + 深度注入 + 绝对注入（agent.js 的拼法）。
const depthText = [...rendered.injected, ...rendered.depth]
  .sort((a, b) => (Number(b.depth) || 0) - (Number(a.depth) || 0))
  .map((item) => item.content)
  .join('\n\n');
const effective = [systemText, depthText].filter(Boolean).join('\n\n');
const withGreeting = [effective, greeting ? `[你的开场白（已作为本局对话的第一条消息发给玩家）]\n${greeting}` : '']
  .filter(Boolean).join('\n\n');

// 模板统计：解释字符数变化的可能来源。
const joined = [
  card.description, card.personality, card.scenario, card.firstMes, card.systemPrompt,
  card.postHistoryInstructions, card.mesExample, ...(card.alternateGreetings ?? []),
  ...entries.map((entry) => entry.content),
  ...(preset?.prompts ?? []).map((prompt) => prompt.content),
].join('\n');

const leftovers = {
  ejsOpen: countMatches(effective, /<%/g),
  ejsClose: countMatches(effective, /%>/g),
  ejsError: countMatches(effective, /dsh-tt EJS error/g),
  decorator: countMatches(effective, /@@(?:if|activate|dont_activate)/g),
  macroLeft: countMatches(effective, /\{\{[^}]{0,40}\}\}/g),
  commentMacro: countMatches(effective, /\{\{\/\//g),
};
const lines = withGreeting.split('\n');

console.log('== 资产 ==');
console.log(`根目录      ${roots.join(' ; ')}`);
console.log(`卡          ${card.name}（${card.spec}，${card.characterBook?.entries?.length ?? 0} 条内嵌条目）`);
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
console.log(`有效提示词  ${effective.length} 字（system + 深度/绝对注入）`);
console.log(`含开场白    ${withGreeting.length} 字（agent.js 的实际拼接）`);
console.log(`system 段   ${rendered.system.length} 字，tail ${rendered.tail.length} 字`);
console.log(`depth       ${rendered.depth.length} 组：${rendered.depth.map((item) => `d${item.depth}/${item.role}/${item.content.length}`).join(' ')}`);
console.log(`injected    ${rendered.injected.length} 条：${rendered.injected.map((item) => `d${item.depth}/${item.content.length}`).join(' ')}`);
console.log(`trace       ${rendered.trace.parts.length} 段`);
console.log('== 模板统计 ==');
console.log(`trim 标记   <%_ ${countMatches(joined, /<%_/g)} 个，_%> ${countMatches(joined, /_%>/g)} 个，-%> ${countMatches(joined, /-%>/g)} 个，<%% ${countMatches(joined, /<%%/g)} 个`);
console.log(`EJS 标记    ${countMatches(joined, /<%/g)} 个；宏 {{…}} ${countMatches(joined, /\{\{[^}]{0,40}\}\}/g)} 个，{{//}} ${countMatches(joined, /\{\{\/\//g)} 个`);
console.log('== 残留检查 ==');
console.log(JSON.stringify(leftovers));
const bad = Object.entries(leftovers).filter(([key, value]) => value > 0 && key !== 'macroLeft');
if (bad.length) {
  console.log('!! 有残留：' + bad.map(([key, value]) => `${key}=${value}`).join(' '));
  const sample = effective.match(/<%.{0,120}/);
  if (sample) console.log('样例：' + sample[0]);
} else {
  console.log('OK：无 EJS/装饰器残留');
}
