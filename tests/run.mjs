// 测试入口：在同一进程里加载全部 *.test.mjs。
//
// 为什么不用 `node --test tests/`：DSH 的 Windows 沙箱禁止子进程通过管道捕获 stdio，
// 而 node 的测试 runner 会为每个文件 spawn 一个子进程（spawn EPERM）。
// 同进程加载后由 node:test 自己执行并汇报。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = fs.readdirSync(here).filter((name) => name.endsWith('.test.mjs')).sort();

if (!files.length) {
  console.error('tests/ 下没有 *.test.mjs');
  process.exit(1);
}

for (const file of files) {
  await import(pathToFileURL(path.join(here, file)).href);
}
