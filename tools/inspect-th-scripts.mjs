// 静态盘点：卡里启用的酒馆助手脚本到底用了哪些 API，我们覆盖了没有。
//
// 做法：正则扫描脚本正文里的 TH 调用面 / SillyTavern 上下文成员 / 事件名 / 远程 import，
// 再对照 shim.js 里出现过的实现名，给出「已覆盖 / 未覆盖」清单。
// 用法：node tools/inspect-th-scripts.mjs [资产根目录] [卡名过滤]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const assetRoot = process.argv[2] || projectRoot;
const filter = process.argv[3] || '';
const load = (relative) => import(pathToFileURL(path.join(projectRoot, relative)).href);

const { loadLibrary } = await load('plugin/lib/library.js');

const SHIM = fs.readFileSync(path.join(projectRoot, 'src', 'tavern', 'shim.js'), 'utf8');
const CORE = fs.readFileSync(path.join(projectRoot, 'src', 'tavern', 'core.js'), 'utf8');
const SHIM_TEXT = SHIM + '\n' + CORE;

/** 酒馆助手（TavernHelper）对外 API 的常用面。 */
const TH_API = [
  // 变量
  'getVariables', 'replaceVariables', 'updateVariablesWith', 'insertOrAssignVariables',
  'insertVariables', 'deleteVariable', 'getVariable', 'setVariable',
  // 消息
  'getChatMessages', 'setChatMessages', 'createChatMessages', 'deleteChatMessages',
  'rotateChatMessages', 'getLastMessageId', 'setChatMessage',
  // 事件
  'eventOn', 'eventOnce', 'eventEmit', 'eventEmitAndWait', 'eventRemoveListener',
  'eventMakeFirst', 'eventMakeLast', 'eventClearEvent', 'eventClearListener', 'eventClearAll',
  // 生成
  'generate', 'generateRaw', 'stopGenerationById', 'stopAllGeneration',
  'injectPrompts', 'uninjectPrompts', 'getInjectedPrompts', 'registerMacroLike',
  // 世界书
  'getWorldbook', 'getWorldbookNames', 'getCharWorldbookNames', 'getGlobalWorldbookNames',
  'getLorebookEntries', 'getLorebookEntry', 'createWorldbook', 'createWorldbookEntries',
  'replaceWorldbook', 'setLorebookEntries', 'deleteLorebookEntries',
  // 正则 / 显示
  'formatAsTavernRegexedString', 'getTavernRegexes', 'formatAsDisplayedMessage',
  'retrieveDisplayedMessage', 'refreshOneMessage', 'getDisplayedMessage',
  // 其它
  'substitudeMacros', 'getMessageId', 'errorCatched', 'triggerSlash', 'getTavernHelperVersion',
  'getCharData', 'getCharAvatarPath', 'getChatHistoryBrief', 'getChatHistoryDetail',
  'getCurrentCharName', 'setChatMessages', 'getTavernHelperVersion',
];

/** MVU 实测用到的 SillyTavern 上下文成员（设计文档 §17.2）。 */
const ST_CONTEXT = [
  'chat', 'chatMetadata', 'characters', 'characterId', 'name1', 'name2', 'getCurrentChatId',
  'getRequestHeaders', 'saveChat', 'saveSettingsDebounced', 'chatCompletionSettings',
  'extensionSettings', 'getCharacterCardFields', 'callGenericPopup', 'POPUP_TYPE',
  'POPUP_RESULT', 'ToolManager', 'registerFunctionTool', 'unregisterFunctionTool',
  'loadWorldInfo', 'registerMacro', 'unregisterMacro', 'getChatCompletionModel',
  'getCurrentLocale', 'eventSource', 'event_types', 'getContext', 'substituteParams',
  'this_chid', 'characters', 'getThumbnailUrl', 'addOneMessage', 'updateMessageBlock',
];

function scanScript(content) {
  const text = String(content || '');
  const calls = new Set();
  for (const api of TH_API) {
    const re = new RegExp(`(?:^|[^\\w$.])${api}\\s*\\(`, 'm');
    if (re.test(text)) calls.add(api);
  }
  const context = new Set();
  for (const member of ST_CONTEXT) {
    const re = new RegExp(`(?:SillyTavern|getContext\\(\\))\\s*\\??\\.\\s*${member}\\b`);
    if (re.test(text)) context.add(member);
  }
  // 裸写的 SillyTavern.xxx（不经过 destructuring）
  for (const match of text.matchAll(/SillyTavern\s*\.\s*([A-Za-z_$][\w$]*)/g)) context.add(match[1]);
  // 从 getContext() 解构出来的成员
  for (const match of text.matchAll(/const\s*\{([^}]{0,400})\}\s*=\s*(?:SillyTavern\s*\.\s*)?getContext\s*\(\s*\)/g)) {
    for (const raw of match[1].split(',')) {
      const name = raw.trim().split(':').pop().trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) context.add(name);
    }
  }
  const events = new Set();
  for (const match of text.matchAll(/\b(?:eventOn|eventOnce|eventEmit|eventRemoveListener|eventEmitAndWait)\s*\(\s*['"]([^'"]+)['"]/g)) {
    events.add(match[1]);
  }
  for (const match of text.matchAll(/\bevent_types\s*\.\s*([A-Z_]+)/g)) events.add(match[1]);
  const imports = new Set();
  for (const match of text.matchAll(/\bimport\s*(?:[\w${},*\s]+from\s*)?['"]([^'"]+)['"]/g)) {
    if (/^https?:/.test(match[1])) imports.add(match[1]);
  }
  const slash = new Set();
  for (const match of text.matchAll(/triggerSlash\s*\(\s*['"`]\/([\w-]+)/g)) slash.add(match[1]);
  return { calls, context, events, imports, slash, size: text.length };
}

function coverage(name) {
  // shim/core 里出现过名字就算"有实现"（粗粒度，人工复核用）
  const re = new RegExp(`\\b${name.replace(/[$]/g, '\\$')}\\b`);
  return re.test(SHIM_TEXT);
}

const library = loadLibrary([path.join(assetRoot, '参考'), path.join(assetRoot, 'assets')]);

for (const entry of library.cards) {
  const card = entry.card;
  if (filter && !card.name.includes(filter)) continue;
  const scripts = (card.thScripts || []).filter((script) => script && script.enabled);
  if (!scripts.length) continue;
  console.log(`\n=== ${card.name}：${scripts.length} 个启用脚本 ===`);
  const allCalls = new Set();
  const allContext = new Set();
  const allEvents = new Set();
  const allImports = new Set();
  const allSlash = new Set();
  for (const script of scripts) {
    const scanned = scanScript(script.content);
    for (const item of scanned.calls) allCalls.add(item);
    for (const item of scanned.context) allContext.add(item);
    for (const item of scanned.events) allEvents.add(item);
    for (const item of scanned.imports) allImports.add(item);
    for (const item of scanned.slash) allSlash.add(item);
    console.log(`  · ${String(script.name || script.id).slice(0, 28).padEnd(30)} ${String(scanned.size).padStart(7)} 字符` +
      `  TH ${scanned.calls.size} 个 / ST ${scanned.context.size} 个 / 事件 ${scanned.events.size} 个` +
      (scanned.imports.size ? ` / 远程 import ${scanned.imports.size}` : ''));
  }

  const missingCalls = [...allCalls].filter((name) => !coverage(name));
  const missingContext = [...allContext].filter((name) => !coverage(name));
  console.log(`  TH 调用面：${[...allCalls].sort().join(', ') || '（无）'}`);
  if (missingCalls.length) console.log(`  ⚠ 未见实现：${missingCalls.join(', ')}`);
  console.log(`  ST 上下文：${[...allContext].sort().join(', ') || '（无）'}`);
  if (missingContext.length) console.log(`  ⚠ 未见实现：${missingContext.join(', ')}`);
  console.log(`  事件：${[...allEvents].sort().join(', ') || '（无）'}`);
  if (allSlash.size) console.log(`  triggerSlash：/${[...allSlash].join(', /')}`);
  if (allImports.size) console.log(`  远程 import：${[...allImports].join('\n                 ')}`);
}
