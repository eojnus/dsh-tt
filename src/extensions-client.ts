type InstalledExtension = {
  id: string;
  name: string;
  repository: string;
  version: string | null;
  enabled: boolean;
  revision: string;
  assetRoot: string;
  assetBase: string;
  js: string | null;
  css: string | null;
  requires: string[];
};

type ExtensionBook = { name: string; entries: Record<string, object> };
type ExtensionSession = { metadata?: object; worldbook?: ExtensionBook; characterBook?: ExtensionBook; characterCard?: string };
type ExtensionState = { sessions: Record<string, ExtensionSession>; cards: Record<string, Record<string, unknown>>; settings?: object };
const EXTENSION_STATE_KEY = 'dsh-tt:extensions:data:v1';

function readExtensionState(): ExtensionState {
  try {
    const state = JSON.parse(localStorage.getItem(EXTENSION_STATE_KEY) || '{}');
    return { sessions: state.sessions || {}, cards: state.cards || {}, settings: state.settings };
  } catch { return { sessions: {}, cards: {} }; }
}

function saveExtensionState(state: ExtensionState) {
  try { localStorage.setItem(EXTENSION_STATE_KEY, JSON.stringify(state)); }
  catch { throw new Error('无法写入扩展数据，请检查 DSH 桌面端本地存储空间'); }
}

function extensionBook(name: string, raw: object): ExtensionBook {
  return { ...raw, name, entries: Object.fromEntries(bookEntries(raw).map((entry, index) => {
    const normalized = normalizeBookEntry(entry, index);
    return [normalized.uid, { ...entry, uid: normalized.uid, key: normalized.keys,
      keysecondary: normalized.secondary, disable: !normalized.enabled, position: normalized.position,
      depth: normalized.depth, order: normalized.order }];
  })) };
}

function applyExtensionCard(raw, fields, book) {
  if (!raw || (!fields && !book)) return raw;
  const inner = innerOf(raw);
  const extensions = { ...inner.extensions };
  for (const [key, value] of Object.entries(fields || {})) {
    if (value === null) delete extensions[key]; else extensions[key] = value;
  }
  const updated = { ...inner, extensions, ...(book ? { character_book: book } : {}) };
  return inner === raw ? updated : { ...raw, data: updated };
}

async function requestExtensions(action?: object): Promise<{ extensions: InstalledExtension[]; warnings: string[] }> {
  const response = await fetch(new URL('api/dsh-tt.extensions', document.baseURI), {
    ...(action ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(action) } : {}),
    credentials: 'same-origin',
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(result?.extensions)) {
    throw new Error(result?.error || `扩展安装服务不可用（HTTP ${response.status}）`);
  }
  return result;
}

// These modules run inside the same frame as the extension. The browser still
// resolves the package's own imports and CSS URLs against its installed paths.
function extensionImportMap(extensions: InstalledExtension[]) {
  const context = 'const getContext = () => globalThis.SillyTavern.getContext(); const c = getContext();';
  const modules: Record<string, string> = {
    '/script.js': context + `
      export {getContext};
      export const eventSource=c.eventSource, event_types=c.eventTypes, chat=c.chat, characters=c.characters,
        chat_metadata=c.chatMetadata, getRequestHeaders=c.getRequestHeaders, getCurrentChatId=c.getCurrentChatId,
        saveChat=c.saveChat, saveChatConditional=c.saveChat, saveSettingsDebounced=c.saveSettingsDebounced,
        substituteParams=c.substituteParams, addOneMessage=c.addOneMessage, updateMessageBlock=c.updateMessageBlock,
        setExtensionPrompt=c.setExtensionPrompt, generateRaw=c.generateRaw, generateQuietPrompt=c.generateQuietPrompt,
        extension_prompt_types=c.extension_prompt_types, extension_prompt_roles=c.extension_prompt_roles,
        name1=c.name1, name2=c.name2, this_chid=c.characterId, main_api=c.mainApi;
    `,
    '/scripts/extensions.js': context + `
      export {getContext};
      export const extension_settings=c.extensionSettings, renderExtensionTemplateAsync=c.renderExtensionTemplateAsync,
        saveMetadataDebounced=c.saveMetadata, extensionNames=c.extensionNames, extensionTypes=c.extensionTypes;
    `,
    '/scripts/st-context.js': context + 'export {getContext};',
    '/scripts/popup.js': context + 'export const POPUP_TYPE=c.POPUP_TYPE, POPUP_RESULT=c.POPUP_RESULT, callGenericPopup=c.callGenericPopup;',
    '/scripts/slash-commands.js': context + 'export const executeSlashCommandsWithOptions=c.executeSlashCommandsWithOptions;',
    '/scripts/slash-commands/SlashCommandParser.js': context + 'export const SlashCommandParser=c.SlashCommandParser;',
    '/scripts/slash-commands/SlashCommand.js': context + 'export const SlashCommand=c.SlashCommand;',
    '/scripts/slash-commands/SlashCommandArgument.js': context + `
      export const SlashCommandArgument=c.SlashCommandArgument, SlashCommandNamedArgument=c.SlashCommandNamedArgument,
        ARGUMENT_TYPE=c.ARGUMENT_TYPE;
    `,
    '/scripts/utils.js': context + `
      export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      export const debounce = globalThis._.debounce, uuidv4=c.uuidv4, sanitizeSelector=CSS.escape;
      export function escapeHtml(value) {
        const node=document.createElement('span'); node.textContent=String(value??''); return node.innerHTML;
      }
      export function download(data, name, type='text/plain') {
        const href=URL.createObjectURL(new Blob([data], {type})), link=document.createElement('a');
        link.href=href; link.download=name; link.click(); setTimeout(()=>URL.revokeObjectURL(href), 1000);
      }
    `,
    '/lib.js': 'export const $=globalThis.jQuery, jQuery=$, lodash=globalThis._, _=lodash, Vue=globalThis.Vue;',
  };
  const imports: Record<string, string> = {};
  for (const [path, body] of Object.entries(modules)) {
    const url = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(body);
    imports[path] = url;
    for (const item of extensions) imports[item.assetRoot + path] = url;
  }
  return { imports };
}
