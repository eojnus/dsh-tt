// 世界书条目装饰器：ST 的 `@@if (...)` / `@@dont_activate` / `@@activate`。
//
// 参考卡的 33 条节庆条目以 `@@if (<IIFE>)` 开头：表达式为真才把条目正文放进提示词，
// 指令行本身必须被移除。表达式与 EJS 共用同一个作用域（getvar/stat_data/v…）。

const DIRECTIVE = /^\s*@@(if|dont_activate|activate)\b([\s\S]*)$/;

/** 从字符串开头读一个平衡括号表达式；返回 [expr, rest]。 */
function readBalancedExpression(text) {
  const source = String(text ?? '');
  let index = 0;
  while (index < source.length && /\s/.test(source[index])) index += 1;
  if (source[index] !== '(') {
    // 没有括号：按行取表达式
    const end = source.indexOf('\n', index);
    const line = source.slice(index, end < 0 ? source.length : end).trim();
    return line ? [line, end < 0 ? '' : source.slice(end + 1)] : null;
  }
  let depth = 0;
  let quote = null;
  for (let cursor = index; cursor < source.length; cursor += 1) {
    const ch = source[cursor];
    if (quote) {
      if (ch === '\\') cursor += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '(') { depth += 1; continue; }
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) return [source.slice(index, cursor + 1), source.slice(cursor + 1)];
    }
  }
  return null;
}

function evaluate(expr, scope) {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('__scope', `with (__scope) { return (${expr}); }`);
    return Boolean(fn(scope));
  } catch {
    // 表达式失败时保守地保留条目正文，至少不让整段世界书消失。
    return true;
  }
}

function compiles(expr, scope) {
  try {
    // eslint-disable-next-line no-new-func
    new Function('__scope', `with (__scope) { return (${expr}); }`);
    return true;
  } catch {
    return false;
  }
}

/**
 * 处理一段世界书条目正文里的装饰器。
 * @param {string} text
 * @param {Record<string, unknown>} scope EJS 作用域
 * @returns {string}
 */
export function applyWorldInfoDecorators(text, scope = {}) {
  let out = String(text ?? '');
  for (let guard = 0; guard < 8; guard += 1) {
    const match = out.match(DIRECTIVE);
    if (!match) break;
    const directive = match[1];
    const rest = match[2];
    if (directive === 'dont_activate') return '';
    if (directive === 'activate') {
      out = rest.replace(/^\r?\n/, '');
      continue;
    }
    // 常见形态：`@@if (function(){...})()` 整行；优先按行求值，才能把末尾的调用括号算进去。
    const newline = rest.indexOf('\n');
    const line = (newline < 0 ? rest : rest.slice(0, newline)).trim();
    if (line && compiles(line, scope)) {
      if (!evaluate(line, scope)) return '';
      out = newline < 0 ? '' : rest.slice(newline + 1);
      continue;
    }
    const parsed = readBalancedExpression(rest);
    if (!parsed) {
      // 无法解析：去掉指令行，保留正文。
      out = rest.replace(/^\r?\n/, '');
      break;
    }
    const [expr, after] = parsed;
    if (!evaluate(expr, scope)) return '';
    out = after.replace(/^\r?\n/, '');
  }
  // 未知的 @@ 指令行（只删行首那一行）
  return out.replace(/^(?:\s*@@[^\n]*\r?\n)/, '');
}

/**
 * 对一组世界书条目逐条处理装饰器，再拼接。
 * @param {string[]} list
 * @param {Record<string, unknown>} scope
 * @param {string} [separator]
 */
export function joinDecorated(list, scope = {}, separator = '\n') {
  if (!Array.isArray(list) || !list.length) return '';
  return list
    .map((item) => applyWorldInfoDecorators(item, scope).trim())
    .filter(Boolean)
    .join(separator);
}
