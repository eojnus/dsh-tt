import { cardAssetsWasm } from './card-assets-wasm.js';

export const MESSAGE_FONTS = Object.freeze({
  preset: { label: '跟随预设', family: '"PingFang SC", "Microsoft YaHei UI", system-ui, sans-serif' },
  sans: { label: '无衬线', family: '"Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif' },
  serif: { label: '宋体', family: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, serif' },
  kai: { label: '楷体', family: '"Kaiti SC", STKaiti, KaiTi, "Noto Serif SC", serif' },
  mono: { label: '等宽', family: '"Sarasa Mono SC", "Cascadia Mono", Consolas, "Microsoft YaHei", monospace' },
});

const BODY = /<body(?:\s[^>]*)?>[\s\S]*<\/body\s*>/i;
const HTML_START = /^\s*(?:<!doctype\s+html\b|<[a-z][\w:-]*(?:\s|\/?>))/i;
const ASSISTANT_CONTROL = 'think|thinking|analysis|reasoning|dream_think|dream_after_thinking|simple_thinking|UpdateVariable|JSONPatch|status_current_variable';
const CLOSED_CONTROL_BLOCK = new RegExp(`<(${ASSISTANT_CONTROL})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, 'gi');
const HIDDEN_MESSAGE_TAGS = [
  ...ASSISTANT_CONTROL.toLowerCase().split('|'), 'script', 'style', 'template', 'head',
  'sceneinfo', 'statusplaceholderimpl', 'dream_scene', 'dream_option', 'dream_rpg', 'rpg_check',
  'dream_summary', 'dream_discuss', 'dream_big_discuss', 'dream_parallel_event', 'dream_self_check',
  'dream_delete', 'dream_done', 'dream_check_done',
  'thinkfox', 'think_fox', 'thinkfox~', 'think_fox~', 'draft', 'fox_selc', 'fox_input', 'fox_tip',
  'fox_hugou', 'fox_front', 'fox_phone_log', 'fox_social', 'fox_letter', 'fox_system',
];

export function hideAssistantControlBlocks(text) {
  return text.replace(CLOSED_CONTROL_BLOCK, '');
}

export function assistantProse(text) {
  return text.replace(/<\/?(?:dream_plot|dream_body|dream_after_format)\b[^>]*>/gi, '');
}

export function streamingAssistantProse(text) {
  return roleplayMessageBlocks(text, true).map((block) => block.text).join('\n')
    .replace(/<(?:[!/]|!-)?$/, '').trim();
}

// The client still displays history if the packaged WASM cannot be loaded.
function projectProseFallback(blocks) {
  let hidden = '';
  let depth = 0;
  let inComment = false;
  return blocks.map((block) => {
    if (block === null) return !depth && !inComment;
    const source = block;
    let output = '';
    const tags = /<!--|<\/?([a-z][\w:~-]*)(?=[\s/>]|$)(?:[^"'<>]|"[^"]*(?:"|$)|'[^']*(?:'|$))*(?:>|$)/gi;
    let start = 0;
    while (start < source.length) {
      if (inComment) {
        const end = source.indexOf('-->', start);
        if (end === -1) break;
        inComment = false;
        start = end + 3;
      }
      tags.lastIndex = start;
      const match = tags.exec(source);
      if (!depth) output += source.slice(start, match?.index ?? source.length);
      if (!match) break;
      start = tags.lastIndex;
      if (match[0] === '<!--') {
        if (!depth) inComment = true;
        continue;
      }
      const name = match[1].toLowerCase();
      const closing = match[0].startsWith('</');
      const empty = /\/\s*>$/.test(match[0]);
      if (!depth && !closing && !empty && HIDDEN_MESSAGE_TAGS.includes(name)) {
        hidden = name;
        depth = 1;
      } else if (depth && name === hidden) {
        if (closing) depth--;
        else if (!empty && name !== 'style' && name !== 'script') depth++;
      } else if (!depth && (name === 'br' || (closing && ['p', 'div'].includes(name)))) {
        output += '\n\n';
      }
    }
    return output;
  });
}

// Preset rules also produce HTML fragments without a Markdown fence.
export function fenceDisplayFragment(replacement) {
  const source = replacement.trim();
  if (/^(?:`{3,}|~{3,})/.test(source)) return '\n' + source + '\n';
  if (!/^<(?:div|details|section|main|aside|table|span|style)\b/i.test(source)
      || !/<\/(?:div|details|section|main|aside|table|span|style)\s*>$/i.test(source)) return replacement;
  const longest = (source.match(/^ {0,3}`{3,}/gm) || []).reduce((max, line) => Math.max(max, line.trim().length), 2);
  const fence = '`'.repeat(longest + 1);
  return `\n${fence}html\n${source}\n${fence}\n`;
}

function languageOf(info) {
  return info.trim().toLowerCase().split(/\s+/)[0];
}

function codeBlock(text, lang, closed) {
  const html = closed && (lang === 'html' ? HTML_START.test(text) : !lang && BODY.test(text));
  return { type: html ? 'html' : 'code', text, lang };
}

export function splitMessageBlocks(text, wasm = cardAssetsWasm()) {
  const source = String(text || '').replace(/\r\n/g, '\n');
  if (/^\s*(?:<!doctype\s+html\b|<html[\s>]|<body[\s>])/i.test(source) && BODY.test(source)) {
    return [{ type: 'html', text: source, lang: 'html' }];
  }
  if (!source.includes('```') && !source.includes('~~~')) return [{ type: 'text', text: source }];
  const layout = wasm?.layoutMessageFences?.(source);
  if (layout) return layout.map(([kind, start, end, infoStart, infoEnd]) => {
    const value = source.slice(start, end);
    return kind === 0 ? { type: 'text', text: value } : codeBlock(value, languageOf(source.slice(infoStart, infoEnd)), kind === 1);
  });
  const lines = source.split('\n');
  const blocks = [];
  let prose = [];
  let fence;
  function flushProse() {
    if (prose.length) blocks.push({ type: 'text', text: prose.join('\n') });
    prose = [];
  }

  for (const line of lines) {
    const match = /^ {0,3}(`{3,}|~{3,})[ \t]*(.*)$/.exec(line);
    if (fence) {
      if (!match || match[1][0] !== fence.marker[0] || match[1].length < fence.marker.length || match[2].trim()) {
        fence.lines.push(line);
        continue;
      }
      const body = fence.lines.join('\n');
      blocks.push(codeBlock(body, fence.lang, true));
      fence = undefined;
    } else if (match) {
      flushProse();
      fence = { marker: match[1], lang: languageOf(match[2]), lines: [] };
    } else {
      prose.push(line);
    }
  }
  if (fence) blocks.push(codeBlock(fence.lines.join('\n'), fence.lang, false));
  flushProse();
  return blocks;
}

export function roleplayMessageBlocks(text, streaming = false, wasm = cardAssetsWasm()) {
  const blocks = splitMessageBlocks(text, wasm);
  const prose = blocks.map((block) => block.type === 'text' ? block.text : null);
  const cleaned = prose.some((part) => part?.includes('<'))
    ? (wasm?.projectMessageProse?.(prose, HIDDEN_MESSAGE_TAGS) ?? projectProseFallback(prose))
    : prose.map((part) => part ?? true);
  return blocks.flatMap((block, index) => {
    const value = cleaned[index];
    if (block.type === 'text') return value.trim() ? [{ ...block, text: value }] : [];
    return !streaming && value && block.type === 'html' ? [block] : [];
  });
}

export function literalAssetDisplays(rules) {
  const displays = new Set();
  for (const rule of rules) {
    if (rule?.disabled || (rule?.promptOnly && !rule?.markdownOnly)) continue;
    if (Array.isArray(rule?.placement) && rule.placement.length && !rule.placement.some((placement) => placement === 1 || placement === 2)) continue;
    const replacement = String(rule?.replaceString || '');
    for (const block of splitMessageBlocks(fenceDisplayFragment(replacement))) {
      if (block.type === 'html' && !/\$(?:[&`'\d]|<)|<%|{{match}}/i.test(block.text)) displays.add(block.text);
    }
  }
  return displays;
}

export function vendorScript(source) {
  const code = String(source || '').replace(/<\/script/gi, '<\\/script');
  return `<script>${code}\nwindow.YAML = { parse: window.jsyaml.load, stringify: window.jsyaml.dump };<\/script>`;
}

function frameRuntime(context) {
  if (context) {
    window.getMessageId = window.getCurrentMessageId = () => context.index;
    window.getChatMessages = (id = context.index) => context.message && (String(id) === String(context.index) || String(id) === '-1')
      ? [structuredClone(context.message)] : [];
    window.getVariables = (option) => {
      if (!option || option.type === 'message' || option.type === 'chat') return structuredClone(context.variables);
      return {};
    };
    window.Mvu = { getMvuData: window.getVariables };
    window.waitGlobalInitialized = (name) => Promise.resolve(window[name]);
  }
  if (context?.compose) {
    let queued = [];
    let sequence = 0;
    const pending = new Map();
    window.createChatMessages = async (messages) => {
      if (!Array.isArray(messages) || messages.some((message) => message?.role !== 'user' || typeof message.message !== 'string')) {
        throw new Error('楼层界面支持提交用户消息');
      }
      queued.push(...messages.map((message) => message.message));
    };
    function requestAction(action) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('角色扮演消息发送超时'));
        }, 30000);
        pending.set(id, (ok) => {
          clearTimeout(timer);
          pending.delete(id);
          if (ok) resolve({ pipe: '' });
          else reject(new Error('角色扮演消息没有发送成功'));
        });
        window.parent.postMessage({ type: 'dsh-tt:compose', id, ...action }, '*');
      });
    }
    window.triggerSlash = async (command) => {
      const line = String(command).trim();
      if (line !== '/trigger') return requestAction({ command: line });
      const text = queued.join('\n').trim();
      if (!text) throw new Error('没有待提交的用户消息');
      queued = [];
      return requestAction({ text, send: true });
    };
    window.addEventListener('message', (event) => {
      if (event.source === window.parent && event.data?.type === 'dsh-tt:compose-result') {
        pending.get(event.data.id)?.(event.data.ok === true);
      }
    });
  }
  window.addEventListener('DOMContentLoaded', () => {
    if (context?.compose && !document.getElementById('send_textarea') && !document.getElementById('send_but')) {
      const controls = document.createElement('div');
      controls.hidden = true;
      const input = document.createElement('textarea');
      input.id = 'send_textarea';
      const button = document.createElement('button');
      button.id = 'send_but';
      controls.append(input, button);
      document.body.append(controls);
      let timer;
      const compose = (send) => {
        clearTimeout(timer);
        const text = input.value.trim();
        input.value = '';
        if (text) window.parent.postMessage({ type: 'dsh-tt:compose', text, send }, '*');
      };
      input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => compose(false), 0);
      });
      button.addEventListener('click', () => compose(true));
    }
    const report = () => {
      const height = Math.ceil(Math.max(document.body.getBoundingClientRect().height, document.body.scrollHeight));
      window.parent.postMessage({ type: 'dsh-tt:message-height', height }, '*');
    };
    new ResizeObserver(report).observe(document.body);
    window.addEventListener('message', (event) => {
      if (event.source === window.parent && event.data?.type === 'dsh-tt:measure-message') report();
    });
    window.addEventListener('load', report);
    report();
  });
}

export function buildMessageFrame(html, { context, vendorSource, nonce, font } = {}) {
  const source = html.replace(/^\s*<!doctype\s+html[^>]*>/i, '');
  const data = JSON.stringify(context ?? null).replace(/</g, '\\u003c');
  const policy = context ? '' : `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'">`;
  const bootstrap = `<script nonce="${nonce}">(${frameRuntime.toString()})(${data});<\/script>`;
  const family = Object.hasOwn(MESSAGE_FONTS, font) ? MESSAGE_FONTS[font].family : MESSAGE_FONTS.preset.family;
  return [
    '<!doctype html><meta charset="utf-8">',
    policy,
    `<style>:where(html){font-family:${family}}body{margin:0;display:flow-root;overflow-wrap:anywhere}</style>`,
    context ? vendorScript(vendorSource) : '',
    bootstrap,
    source,
  ].join('\n');
}
