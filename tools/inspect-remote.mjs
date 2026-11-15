// 拉取卡里 import 的远程 MVU bundle，静态扫描它用到的 ST/TH 面，和我们的 shim 对照。
// 用法：node tools/inspect-remote.mjs [url...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const cacheDir = path.join(projectRoot, 'build', 'remote-cache');
fs.mkdirSync(cacheDir, { recursive: true });

const urls = process.argv.slice(2);
const targets = urls.length ? urls : [
  'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js',
  'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js',
];

const SHIM = fs.readFileSync(path.join(projectRoot, 'src', 'tavern', 'shim.js'), 'utf8') + '\n'
  + fs.readFileSync(path.join(projectRoot, 'src', 'tavern', 'core.js'), 'utf8');

const TH_API = [
  'getVariables', 'replaceVariables', 'updateVariablesWith', 'insertOrAssignVariables', 'insertVariables',
  'deleteVariable', 'getChatMessages', 'setChatMessages', 'createChatMessages', 'deleteChatMessages',
  'rotateChatMessages', 'getLastMessageId', 'eventOn', 'eventOnce', 'eventEmit', 'eventEmitAndWait',
  'eventRemoveListener', 'eventMakeFirst', 'eventMakeLast', 'generate', 'generateRaw', 'stopGenerationById',
  'stopAllGeneration', 'injectPrompts', 'uninjectPrompts', 'registerMacroLike', 'getWorldbook',
  'getWorldbookNames', 'getCharWorldbookNames', 'getGlobalWorldbookNames', 'getLorebookEntries',
  'getLorebookEntry', 'formatAsTavernRegexedString', 'getTavernRegexes', 'formatAsDisplayedMessage',
  'retrieveDisplayedMessage', 'refreshOneMessage', 'substitudeMacros', 'getMessageId', 'errorCatched',
  'triggerSlash', 'getTavernHelperVersion', 'getCharData',
];

const ST_MEMBERS = [
  'chat', 'chatMetadata', 'characters', 'characterId', 'name1', 'name2', 'getCurrentChatId',
  'getRequestHeaders', 'saveChat', 'saveSettingsDebounced', 'chatCompletionSettings', 'extensionSettings',
  'getCharacterCardFields', 'callGenericPopup', 'POPUP_TYPE', 'POPUP_RESULT', 'ToolManager',
  'registerFunctionTool', 'unregisterFunctionTool', 'loadWorldInfo', 'registerMacro', 'unregisterMacro',
  'getChatCompletionModel', 'getCurrentLocale', 'eventSource', 'event_types', 'getContext',
  'substituteParams', 'this_chid', 'addOneMessage', 'updateMessageBlock', 'getThumbnailUrl',
];

function covered(name) {
  return new RegExp(`\\b${name}\\b`).test(SHIM);
}

async function fetchText(url) {
  const name = url.replace(/[^\w.-]+/g, '_').slice(-80);
  const file = path.join(cacheDir, name);
  if (fs.existsSync(file)) return { text: fs.readFileSync(file, 'utf8'), from: 'cache' };
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}：${url}`);
  const text = await response.text();
  fs.writeFileSync(file, text, 'utf8');
  return { text, from: 'network' };
}

for (const url of targets) {
  try {
    const { text, from } = await fetchText(url);
    console.log(`\n=== ${url} ===`);
    console.log(`大小 ${(text.length / 1024).toFixed(1)} KB（${from}）`);
    const th = TH_API.filter((name) => new RegExp(`\\b${name}\\s*\\(`).test(text));
    const st = new Set();
    for (const match of text.matchAll(/SillyTavern\s*\.\s*([A-Za-z_$][\w$]*)/g)) st.add(match[1]);
    for (const match of text.matchAll(/const\s*\{([^}]{0,500})\}\s*=\s*(?:SillyTavern\s*\.\s*)?(?:window\.)?getContext\s*\(\s*\)/g)) {
      for (const raw of match[1].split(',')) {
        const name = raw.trim().split(':').pop().trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name)) st.add(name);
      }
    }
    const thMissing = th.filter((name) => !covered(name));
    const stMissing = [...st].filter((name) => ST_MEMBERS.includes(name) && !covered(name));
    console.log(`TH 调用：${th.sort().join(', ') || '（无）'}`);
    console.log(`TH 覆盖：${th.length - thMissing.length}/${th.length}${thMissing.length ? '，缺：' + thMissing.join(', ') : ''}`);
    console.log(`ST 成员：${[...st].sort().join(', ') || '（无）'}`);
    console.log(`ST 覆盖：${[...st].length - stMissing.length}/${[...st].length}` +
      (stMissing.length ? '，缺：' + stMissing.join(', ') : ''));
    const imports = [...text.matchAll(/\bimport\s*(?:[\w${},*\s]+from\s*)?['"](https?:[^'"]+)['"]/g)].map((m) => m[1]);
    if (imports.length) console.log(`其它 import：${imports.slice(0, 6).join(' ')}`);
  } catch (error) {
    console.log(`\n=== ${url} ===\n失败：${error.message}`);
  }
}
