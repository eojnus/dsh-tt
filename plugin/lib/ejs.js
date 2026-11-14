// EJS 子集：复刻 ST-Prompt-Template 的模板语义（<%= %> / <%- %> / <% %>）。
// 只处理"发送前渲染"这一段；作用域提供 getvar/setvar/getwi/getchar 等函数。
//
// 安全性说明：模板来自用户自己的角色卡/预设，等价于 TH 脚本的可信级别；
// 这里在 Host 进程内执行，因此只暴露白名单函数，不提供 require/process/fs。

const TAG = /<%([=_#-]?)([\s\S]*?)%>/g;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {Record<string, unknown>} variables 变量存储（getvar/setvar 读写这里）
 * @param {{ getwi?: (name: string) => string, getchar?: (name: string) => string, resolve?: (name: string) => string }} helpers
 */
export function createEjsScope(variables = {}, helpers = {}) {
  const scope = {
    getvar(name, options = {}) {
      const key = String(name ?? '');
      if (Object.prototype.hasOwnProperty.call(variables, key)) return variables[key];
      if (helpers.resolve) {
        const resolved = helpers.resolve(key);
        if (resolved !== undefined) return resolved;
      }
      return options && 'defaults' in options ? options.defaults : '';
    },
    setvar(name, value) {
      variables[String(name ?? '')] = value;
      return '';
    },
    incvar(name, delta = 1) {
      const key = String(name ?? '');
      variables[key] = Number(variables[key] || 0) + Number(delta);
      return variables[key];
    },
    decvar(name, delta = 1) {
      return scope.incvar(name, -Number(delta));
    },
    delvar(name) {
      delete variables[String(name ?? '')];
      return '';
    },
    getwi(name) {
      return helpers.getwi ? helpers.getwi(String(name ?? '')) : '';
    },
    getchar(name) {
      return helpers.getchar ? helpers.getchar(String(name ?? '')) : '';
    },
    print(...args) {
      return args.map((a) => String(a)).join('');
    },
    variables,
  };
  return scope;
}

/**
 * 渲染一段模板。语法与 EJS 一致：
 *   <% 代码 %>   执行语句
 *   <%= 表达式 %> 输出（HTML 转义）
 *   <%- 表达式 %> 输出（原样）
 *   <%# 注释 %>
 * @param {string} template
 * @param {Record<string, unknown>} scope
 * @returns {string}
 */
export function renderEjs(template, scope = {}) {
  const source = String(template ?? '');
  if (!source || !source.includes('<%')) return source;

  const parts = [];
  let last = 0;
  let match;
  TAG.lastIndex = 0;

  const body = [];
  let counter = 0;
  const pushText = (text) => {
    if (!text) return;
    body.push(`__out += ${JSON.stringify(text)};`);
  };

  while ((match = TAG.exec(source))) {
    pushText(source.slice(last, match.index));
    last = match.index + match[0].length;
    const kind = match[1];
    const code = match[2];

    if (kind === '#') continue;
    if (kind === '-' || kind === '=') {
      counter += 1;
      body.push(`__v${counter} = (${code});`);
      body.push(`__out += __render(__v${counter});`);
      continue;
    }
    // `<%` 普通语句块
    body.push(`${code}`);
  }
  pushText(source.slice(last));

  if (!body.length) return source;

  const program = `
    var __out = '';
    var __render = arguments[1];
    with (__scope) {
      ${body.join('\n')}
    }
    return __out;
  `;

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('__scope', '__render', program);
    const rendered = fn(scope, (value) => (value == null ? '' : String(value)));
    return rendered;
  } catch (error) {
    // 模板出错时保留原文并附上错误，便于诊断，绝不让整轮请求失败。
    return `${source}\n<!-- dsh-tt EJS error: ${String(error && error.message || error)} -->`;
  }
}

export { escapeHtml };
