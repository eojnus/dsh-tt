const BODY = /<body(?:\s[^>]*)?>[\s\S]*<\/body\s*>/i;
const HTML_START = /^\s*(?:<!doctype\s+html\b|<[a-z][\w:-]*(?:\s|\/?>))/i;

export function splitMessageBlocks(text) {
  const source = String(text || '').replace(/\r\n/g, '\n');
  if (/^\s*(?:<!doctype\s+html\b|<html[\s>]|<body[\s>])/i.test(source) && BODY.test(source)) {
    return [{ type: 'html', text: source, lang: 'html' }];
  }
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
      const html = fence.lang === 'html' ? HTML_START.test(body) : !fence.lang && BODY.test(body);
      blocks.push({ type: html ? 'html' : 'code', text: body, lang: fence.lang });
      fence = undefined;
    } else if (match) {
      flushProse();
      fence = { marker: match[1], lang: match[2].trim().toLowerCase().split(/\s+/)[0], lines: [] };
    } else {
      prose.push(line);
    }
  }
  if (fence) blocks.push({ type: 'code', text: fence.lines.join('\n'), lang: fence.lang });
  flushProse();
  return blocks;
}

export function literalAssetDisplays(rules) {
  const displays = new Set();
  for (const rule of rules) {
    if (rule?.disabled || (rule?.promptOnly && !rule?.markdownOnly)) continue;
    if (Array.isArray(rule?.placement) && rule.placement.length && !rule.placement.includes(2)) continue;
    const replacement = String(rule?.replaceString || '');
    for (const block of splitMessageBlocks(replacement)) {
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
    window.triggerSlash = async (command) => {
      if (String(command).trim() !== '/trigger') throw new Error('该楼层斜杠命令未接通');
      const text = queued.join('\n').trim();
      if (!text) throw new Error('没有待提交的用户消息');
      queued = [];
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
        window.parent.postMessage({ type: 'dsh-tt:compose', id, text, send: true }, '*');
      });
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

export function buildMessageFrame(html, { context, vendorSource, nonce } = {}) {
  const source = html.replace(/^\s*<!doctype\s+html[^>]*>/i, '');
  const data = JSON.stringify(context ?? null).replace(/</g, '\\u003c');
  const policy = context ? '' : `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">`;
  const bootstrap = `<script nonce="${nonce}">(${frameRuntime.toString()})(${data});<\/script>`;
  return [
    '<!doctype html><meta charset="utf-8">',
    policy,
    '<style>body{margin:0;display:flow-root;overflow-wrap:anywhere}</style>',
    context ? vendorScript(vendorSource) : '',
    bootstrap,
    source,
  ].join('\n');
}
