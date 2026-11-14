// 宏替换：覆盖 ST 最常用的一批（见设计文档 §14.6）。
// 顺序：注释剥离 → 旧式尖括号 → 内置 → 传入 env。

const pad = (n) => String(n).padStart(2, '0');

function formatTime(date, locale) {
  return new Intl.DateTimeFormat(locale || 'zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatDate(date, locale) {
  return new Intl.DateTimeFormat(locale || 'zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

function pickRandom(list, rand) {
  if (!list.length) return '';
  return list[Math.floor(rand() * list.length)];
}

function splitArgs(inner, sep = '::') {
  if (inner.includes(sep)) return inner.split(sep).filter((s) => s !== '');
  if (inner.includes(' ')) return inner.split(/\s+/).filter(Boolean);
  return [inner];
}

/**
 * @param {string} text
 * @param {Record<string, unknown>} env
 * @param {{ random?: () => number, now?: Date, locale?: string }} [options]
 */
export function substitute(text, env = {}, options = {}) {
  if (typeof text !== 'string' || !text) return '';
  const rand = options.random ?? Math.random;
  const now = options.now ?? new Date();
  const locale = options.locale ?? 'zh-CN';
  const get = (k) => {
    const v = env[k];
    return typeof v === 'function' ? v() : v == null ? '' : String(v);
  };

  let out = text;

  // 1. {{//注释}}：整段删除（参考卡的 mes_example 里就有加密备注）
  out = out.replace(/\{\{\/\/([\s\S]*?)\}\}/g, '');

  // 1.5 变量宏：{{setvar::k::v}} 写入且不产出文本；{{getvar::k}} 读回（同一次渲染内可见）
  const store = Object.assign(Object.create(null), env.__vars ?? {});
  out = out.replace(/\{\{setvar::([^:}\s]+)::([\s\S]*?)\}\}/gi, (_, key, value) => {
    store[key.trim()] = value;
    return '';
  });
  out = out.replace(/\{\{addvar::([^:}\s]+)::([\s\S]*?)\}\}/gi, (_, key, value) => {
    const k = key.trim();
    store[k] = String(store[k] ?? '') + value;
    return '';
  });
  out = out.replace(/\{\{getvar::([^:}\s]+)\}\}/gi, (_, key) => {
    const k = key.trim();
    return store[k] == null ? '' : String(store[k]);
  });

  // 2. 旧式尖括号
  out = out.replace(/<USER>/gi, () => get('user'));
  out = out.replace(/<BOT>/gi, () => get('char'));
  out = out.replace(/<CHAR>/gi, () => get('char'));
  out = out.replace(/<CHARIFNOTGROUP>/gi, () => get('group') || get('char'));
  out = out.replace(/<GROUP>/gi, () => get('group'));

  // 3. 结构类
  out = out.replace(/\{\{newline\}\}/gi, '\n');
  out = out.replace(/(?:\r?\n)*\{\{trim\}\}(?:\r?\n)*/gi, '');
  out = out.replace(/\{\{noop\}\}/gi, '');

  // 4. 随机类
  out = out.replace(/\{\{random\s?::?([^}]+)\}\}/gi, (_, inner) => pickRandom(splitArgs(inner.trim(), '::'), rand) || pickRandom(splitArgs(inner.trim(), ' '), rand));
  out = out.replace(/\{\{pick\s?::?([^}]+)\}\}/gi, (_, inner) => pickRandom(splitArgs(inner.trim(), '::'), rand));
  out = out.replace(/\{\{roll[ :]([^}]+)\}\}/gi, (_, inner) => {
    const m = inner.trim().match(/^(\d*)d(\d+)$/i);
    const count = m ? Math.max(1, Number(m[1] || 1)) : 1;
    const sides = m ? Number(m[2]) : Number(inner.trim()) || 6;
    let total = 0;
    for (let i = 0; i < count; i++) total += 1 + Math.floor(rand() * sides);
    return String(total);
  });

  // 5. 时间类
  out = out.replace(/\{\{time\}\}/gi, () => formatTime(now, locale));
  out = out.replace(/\{\{date\}\}/gi, () => formatDate(now, locale));
  out = out.replace(/\{\{weekday\}\}/gi, () => new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(now));
  out = out.replace(/\{\{isotime\}\}/gi, () => `${pad(now.getHours())}:${pad(now.getMinutes())}`);
  out = out.replace(/\{\{isodate\}\}/gi, () => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
  out = out.replace(/\{\{idle_duration\}\}/gi, () => get('idleDuration') || '刚刚');

  // 6. 派生类
  out = out.replace(/\{\{reverse:([^}]+)\}\}/gi, (_, inner) => Array.from(inner).reverse().join(''));
  out = out.replace(/\{\{lastMessage\}\}/gi, () => get('lastMessage'));

  // 7. env（含 char / user / personality / scenario / description / input / maxPrompt …）
  for (const key of Object.keys(env)) {
    const re = new RegExp(`\\{\\{${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'gi');
    out = out.replace(re, () => get(key));
  }

  return out;
}

/** 构建 ST 语义下的宏环境。 */
export function createMacroEnv({ card, userName, userDescription, lastMessage, lastMessageId, maxPrompt, maxContext, maxResponse, input }) {
  return {
    char: card?.name ?? '',
    user: userName || '你',
    group: '',
    description: card?.description ?? '',
    personality: card?.personality ?? '',
    scenario: card?.scenario ?? '',
    persona: userDescription ?? '',
    lastMessage: lastMessage ?? '',
    lastMessageId: lastMessageId == null ? '' : String(lastMessageId),
    input: input ?? '',
    maxPrompt: maxPrompt == null ? '' : String(maxPrompt),
    maxContext: maxContext == null ? '' : String(maxContext),
    maxResponse: maxResponse == null ? '' : String(maxResponse),
  };
}
