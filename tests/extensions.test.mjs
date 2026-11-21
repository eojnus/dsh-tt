import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { cardAssetsWasm } from '../plugin/lib/card-assets-wasm.js';
import { EXTENSIONS_PATH, mountExtensionManager } from '../plugin/lib/dsh-extensions.js';

function makeArchive(files) {
  const archive = [];
  for (const [name, text] of Object.entries(files)) {
    const header = Buffer.alloc(512);
    const bytes = Buffer.from(text, 'utf8');
    header.write(name, 0);
    header.write(bytes.length.toString(8).padStart(11, '0'), 124);
    header.fill(32, 148, 156);
    header.write('0', 156);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);
    archive.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  return Buffer.concat([...archive, Buffer.alloc(1024)]);
}

function catalog(directory, download) {
  const routes = new Map();
  const serveAssets = mountExtensionManager((route) => {
    assert.equal(routes.has(route.path), false, route.path);
    routes.set(route.path, route);
    return () => routes.delete(route.path);
  }, directory, download);
  const action = (body) => routes.get(EXTENSIONS_PATH).fetch(new Request('http://fixture' + EXTENSIONS_PATH, body
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined));
  return { action, routes, serveAssets };
}

test('第三方扩展：从 GitHub 地址安装，模块与 CSS 本地可读，并保留更新和启停状态', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsh-tt-testing-extension-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let version = '1.0';
  let corrupt = false;
  const download = async (repo) => {
    assert.deepEqual(repo, { owner: 'example', repo: 'module.test' });
    return corrupt ? Buffer.alloc(1024) : makeArchive({
      'archive/manifest.json': JSON.stringify({ display_name: '扩展测试', version, js: 'index.js', css: 'style.css' }),
      'archive/index.js': 'import "./src/module.js";',
      'archive/src/module.js': 'export const answer = 42;',
      'archive/style.css': 'body { color: navy; }',
      'archive/画 片.svg': '<svg/>',
    });
  };
  const first = catalog(directory, download);
  assert.equal((await first.action({ action: 'install', url: 'https://github.com.invalid/example/module.test' })).status, 400);
  const installed = await first.action({ action: 'install', url: 'https://github.com/Example/Module.test.git' });
  assert.equal(installed.status, 200);
  const [entry] = (await installed.json()).extensions;
  assert.equal(entry.enabled, true);
  const module = new URL('./src/module.js', 'http://fixture' + entry.js).pathname;
  const js = await first.routes.get(module).fetch();
  assert.match(js.headers.get('content-type'), /javascript/);
  assert.equal(await js.text(), 'export const answer = 42;');
  const css = await first.routes.get(entry.css).fetch();
  assert.match(css.headers.get('content-type'), /text\/css/);
  await css.text();
  const unicode = new URL('./画 片.svg', 'http://fixture' + entry.js).pathname;
  assert.equal(first.routes.has(unicode), false);
  const output = new PassThrough();
  const chunks = [];
  output.on('data', (data) => chunks.push(data));
  output.writeHead = (status, headers) => {
    assert.equal(status, 200);
    assert.equal(headers['content-type'], 'image/svg+xml');
  };
  await first.serveAssets({ method: 'GET', url: unicode }, output, () => assert.fail('资源未命中'));
  assert.equal(Buffer.concat(chunks).toString(), '<svg/>');
  assert.equal((await first.action({ action: 'enable', id: entry.id, enabled: false })).status, 200);

  const reopened = catalog(directory, download);
  assert.equal((await (await reopened.action()).json()).extensions[0].enabled, false);
  corrupt = true;
  assert.equal((await reopened.action({ action: 'update', id: entry.id })).status, 422);
  assert.equal(reopened.routes.has(entry.js), true);
  corrupt = false;
  version = '1.1';
  const updated = (await (await reopened.action({ action: 'update', id: entry.id })).json()).extensions[0];
  assert.equal(updated.version, '1.1');
  assert.equal(updated.enabled, false);
  assert.notEqual(updated.js, entry.js);
  assert.equal(reopened.routes.has(entry.js), false);
  assert.equal((await (await reopened.action({ action: 'uninstall', id: entry.id })).json()).extensions.length, 0);
  assert.equal(reopened.routes.has(updated.js), false);
});

test('Rust 扩展安装器拒绝归档路径逃逸并解析扩展命令中的带引号管道', () => {
  const wasm = cardAssetsWasm();
  const archive = makeArchive({ 'archive/../../outside.js': 'test' });
  assert.match(wasm.indexExtensionArchive(archive).error, /路径/);
  assert.deepEqual(wasm.parseExtensionCommands('/memo key="a | b" "带空格" | /next'), {
    commands: [
      { name: 'memo', raw: '/memo key="a | b" "带空格"', named: { key: 'a | b' }, unnamed: ['带空格'] },
      { name: 'next', raw: '/next', named: {}, unnamed: [] },
    ],
  });
  assert.match(wasm.parseExtensionCommands('/memo "bad').error, /引号/);
});
