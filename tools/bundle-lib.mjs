// 把 Host 的提示词管线打成同构脚本，供面板做"发送前预览"。
//
// 做法：把 plugin/lib 下不依赖 Node API 的模块（EJS / 宏 / 装饰器 / 世界书 / 提示词 /
// 正则 / 管线 / 卡归一化）转成一个自带的模块注册表脚本：
//   - `export function f` → `function f`，并收集导出名；
//   - `import { a, b } from './x.js'` → `const { a, b } = __require('x')`；
// 生成物定义全局 `TT_LIB`（浏览器里由面板 `new Function` 执行）。
//
// 为什么不用打包器：仓库没有 npm 依赖，这几个模块的写法固定（只用具名导出 + 相对导入），
// 一个小转换就够，而且脚本可读、可 diff。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const LIB = path.join(projectRoot, 'plugin', 'lib');

/** 打包顺序即定义顺序（__require 会按需解析，顺序只影响可读性）。 */
export const MODULES = [
  'ejs', 'macros', 'decorators', 'lorebook', 'regex', 'prompt', 'tavern-preset', 'pipeline',
  'card-assets-wasm-bytes', 'card-assets-wasm', 'card', 'png',
  'message-html', 'chat-wire',
];

const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*['"]\.\/([\w-]+)\.js['"];?/g;
const EXPORT_FN_RE = /^(\s*)export\s+(function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

/** 把一个 ESM 模块转成工厂函数体。 */
export function transformModule(name, source) {
  const exported = new Set();
  let body = String(source);

  body = body.replace(EXPORT_FN_RE, (match, indent, kind, identifier) => {
    exported.add(identifier);
    return `${indent}${kind} ${identifier}`;
  });

  // 少数模块用 `export { a, b };` 的写法
  body = body.replace(/^export\s*\{([^}]*)\};?$/gm, (match, names) => {
    for (const item of names.split(',')) {
      const identifier = item.trim().split(/\s+as\s+/).pop();
      if (identifier) exported.add(identifier.trim());
    }
    return '';
  });

  body = body.replace(IMPORT_RE, (match, names, target) => {
    const list = names.split(',').map((item) => item.trim()).filter(Boolean);
    return `const { ${list.join(', ')} } = __require('${target}');`;
  });

  if (/^\s*(import|export)\b/m.test(body)) {
    const leftover = body.match(/^\s*(?:import|export)\b.*$/m);
    throw new Error(`模块 ${name} 还有未处理的 import/export：${leftover && leftover[0]}`);
  }
  if (/from\s*['"]node:/.test(body)) throw new Error(`模块 ${name} 依赖 node: 内置，不能进浏览器`);

  return { body, exported: [...exported].sort() };
}

/** 生成整份同构脚本（不写文件）。 */
export function bundleLibSource(modules = MODULES) {
  const parts = [];
  for (const name of modules) {
    const source = fs.readFileSync(path.join(LIB, `${name}.js`), 'utf8');
    const { body, exported } = transformModule(name, source);
    const returns = exported.map((identifier) => `${identifier}: ${identifier}`).join(', ');
    parts.push(`  define('${name}', function (__require) {\n${body.trim()}\n\n  return { ${returns} };\n  });`);
  }

  return `// 由 tools/bundle-lib.mjs 生成：Host 提示词管线的同构副本（面板预览用）。
// 同一份源码在 Host 与浏览器里各跑一次，预览与实际请求不会漂移。
var TT_LIB = (function () {
  'use strict';
  var registry = Object.create(null);
  var cache = Object.create(null);
  function define(name, factory) { registry[name] = factory; }
  function __require(name) {
    if (cache[name]) return cache[name];
    var factory = registry[name];
    if (!factory) throw new Error('dsh-tt lib: unknown module "' + name + '"');
    cache[name] = factory(__require);
    return cache[name];
  }

${parts.join('\n\n')}

  return {
${modules.map((name) => `    '${name}': __require('${name}')`).join(',\n')}
  };
})();
`;
}

/** 在 Node 里求值同构脚本（测试与 CLI 用）。 */
export async function loadBundledLib(source) {
  const script = `${source || bundleLibSource()}\nreturn TT_LIB;`;
  // eslint-disable-next-line no-new-func
  return new Function(script)();
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const source = bundleLibSource();
  const outFile = path.join(projectRoot, 'build', 'tt-lib.js');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, source, 'utf8');
  console.log(`tt-lib.js 已生成（${(source.length / 1024).toFixed(1)} KB，${MODULES.length} 个模块）→ ${outFile}`);
}
