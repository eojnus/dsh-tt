// Generated from src/dsh-extensions.ts by tools/build-client.mjs.
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { cardAssetsWasm } from './card-assets-wasm.js';

export const EXTENSIONS_PATH = '/api/dsh-tt.extensions';
const unpack = promisify(gunzip);
const MAX_ARCHIVE = 48 * 1024 * 1024;
const MAX_DOWNLOAD = 16 * 1024 * 1024;














const TYPES = new Map(Object.entries({
  js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', html: 'text/html; charset=utf-8', json: 'application/json',
  txt: 'text/plain; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', ico: 'image/x-icon', avif: 'image/avif',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', wasm: 'application/wasm',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm',
}));
const digest = (value                     ) => createHash('sha256').update(value).digest('hex');
const packageId = ({ owner, repo }            ) => digest(owner + '/' + repo);
const repositoryUrl = ({ owner, repo }            ) => `https://github.com/${owner}/${repo}`;
const validId = (value         )                  => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

class ExtensionError extends Error {
           status        ;
  constructor(message        , status = 400) {
    super(message);
    this.status = status;
  }
}

function parseRepository(url         )             {
  const value = cardAssetsWasm().extensionRepository(url);
  if (!value) throw new ExtensionError('Rust 扩展安装器不可用', 503);
  if (value.error) throw new ExtensionError(value.error);
  return value;
}

function indexArchive(bytes            )          {
  const value = cardAssetsWasm().indexExtensionArchive(bytes);
  if (!value) throw new ExtensionError('Rust 无法读取扩展归档', 503);
  if (value.error) throw new ExtensionError(value.error, 422);
  return value;
}

async function readBounded(body                                   , limit        )                  {
  if (!body) throw new ExtensionError('请求数据为空');
  const reader = body.getReader();
  const chunks               = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ExtensionError('扩展数据超过大小限制', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

async function downloadGitHub(repo            , signal             )                  {
  // The Rust validator admits GitHub owner/repository identifiers only.
  const url = `https://codeload.github.com/${repo.owner}/${repo.repo}/tar.gz/HEAD`;
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]), redirect: 'error' });
  if (!response.ok) {
    await response.body?.cancel();
    throw new ExtensionError(response.status === 404 ? '找不到这个 GitHub 仓库，或它需要登录权限'
      : `GitHub 下载失败（HTTP ${response.status}）`, 502);
  }
  const compressed = await readBounded(response.body, MAX_DOWNLOAD);
  try { return await unpack(compressed, { maxOutputLength: MAX_ARCHIVE }); }
  catch { throw new ExtensionError('GitHub 归档无法解压或展开后超过大小限制', 422); }
}

function assetRoot(id        , revision        ) {
  return `${EXTENSIONS_PATH}/files/${id}/${revision}`;
}

function assetBase(id        , { revision, repo }                                  ) {
  return `${assetRoot(id, revision)}/scripts/extensions/third-party/${repo}`;
}

function assetRoute(id        , item       , file        ) {
  const pathname = file.replace(/[%?#]/g, encodeURIComponent);
  return new URL(`${assetBase(id, item)}/${pathname}`, 'http://dsh.local').pathname;
}

function fileResponse(archive        , file        , offset        , size        ) {
  const type = TYPES.get(path.posix.extname(file).slice(1).toLowerCase()) ?? 'application/octet-stream';
  const headers = {
    'content-type': type, 'content-length': String(size), 'x-content-type-options': 'nosniff',
    'cache-control': 'private, max-age=3600, immutable',
    ...(type.startsWith('text/html') || type === 'image/svg+xml' ? { 'content-security-policy': 'sandbox' } : {}),
  };
  return new Response(size ? Readable.toWeb(createReadStream(archive, { start: offset, end: offset + size - 1 })) : null, { headers });
}

async function atomicWrite(file        , bytes                     ) {
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temp, bytes, { flag: 'wx' });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
}

export function mountExtensionManager(register          , directory        ,
  download                        = downloadGitHub) {
  const packages = new Map                    ();
  const assets = new Map                        ();
  const warnings           = [];
  const recordPath = (id        ) => path.join(directory, id + '.json');
  const archivePath = (id        , revision        ) => path.join(directory, id + '.' + revision + '.tar');

  async function mount(id        , saved       , archive         )                      {
    const file = archivePath(id, saved.revision);
    const routes                         = [];
    const paths           = [];
    const dispose = async () => {
      paths.forEach((path) => assets.delete(path));
      await Promise.allSettled(routes.map(async (route) => route()));
    };
    try {
      for (const [name, [offset, size]] of Object.entries(archive.files)) {
        const pathname = assetRoute(id, saved, name);
        const fetch = () => fileResponse(file, name, offset, size);
        if (assets.has(pathname)) throw new ExtensionError('扩展含有重复的资源地址', 422);
        assets.set(pathname, fetch);
        paths.push(pathname);
        // The carrier's exact route registry accepts ASCII path segments only.
        // The authenticated HTTP waterfall can serve every original filename.
        if (/^[A-Za-z0-9_$./-]+$/.test(pathname)) routes.push(register({ path: pathname, methods: ['GET'], fetch }));
      }
    } catch (error) {
      await dispose();
      throw error;
    }
    return { ...saved, manifest: archive.manifest, dispose };
  }

  function list() {
    return {
      extensions: [...packages].map(([id, item]) => ({
        id, slug: item.repo, repository: repositoryUrl(item), name: item.manifest.name || item.repo, version: item.manifest.version,
        enabled: item.enabled, revision: item.revision, loadingOrder: item.manifest.loadingOrder, requires: item.manifest.requires,
        assetRoot: assetRoot(id, item.revision), assetBase: assetBase(id, item),
        js: item.manifest.js && assetRoute(id, item, item.manifest.js),
        css: item.manifest.css && assetRoute(id, item, item.manifest.css),
        generateInterceptor: item.manifest.generateInterceptor,
      })).sort((a, b) => a.loadingOrder - b.loadingOrder || a.name.localeCompare(b.name)),
      warnings,
    };
  }

  const ready = (async () => {
    await mkdir(directory, { recursive: true });
    for (const filename of await readdir(directory)) {
      if (!filename.endsWith('.json')) continue;
      const id = filename.slice(0, -5);
      if (!validId(id)) continue;
      try {
        const saved = JSON.parse(await readFile(recordPath(id), 'utf8'))         ;
        const repo = parseRepository(repositoryUrl(saved));
        if (packageId(repo) !== id || !validId(saved.revision) || typeof saved.enabled !== 'boolean') {
          throw new Error('扩展登记信息无效');
        }
        const file = archivePath(id, saved.revision);
        if ((await stat(file)).size > MAX_ARCHIVE) throw new Error('已缓存的扩展归档过大');
        const bytes = await readFile(file);
        if (digest(bytes) !== saved.revision) throw new Error('已缓存的扩展归档已变更');
        packages.set(id, await mount(id, saved, indexArchive(bytes)));
      } catch (error) {
        warnings.push(`读取已安装扩展失败（${id.slice(0, 8)}）：${error instanceof Error ? error.message : '未知错误'}`);
      }
    }
  })();
  ready.catch(() => {}); // Requests report initialization failures through the same response path.

  async function install(repo            , signal             , enable = false) {
    const id = packageId(repo);
    const previous = packages.get(id);
    const bytes = await download({ owner: repo.owner, repo: repo.repo }, signal);
    signal.throwIfAborted();
    if (bytes.length > MAX_ARCHIVE) throw new ExtensionError('扩展归档过大', 413);
    const revision = digest(bytes);
    const enabled = enable || previous?.enabled !== false;
    const saved = { owner: repo.owner, repo: repo.repo, revision, enabled };
    if (previous?.revision === revision) {
      if (previous.enabled !== enabled) {
        await atomicWrite(recordPath(id), JSON.stringify(saved));
        previous.enabled = enabled;
      }
      return;
    }
    const index = indexArchive(bytes);
    const file = archivePath(id, revision);
    await atomicWrite(file, bytes);
    let registered                        ;
    try {
      registered = await mount(id, saved, index);
      await atomicWrite(recordPath(id), JSON.stringify(saved));
      packages.set(id, registered);
    } catch (error) {
      await registered?.dispose();
      await rm(file, { force: true }).catch(() => {});
      throw error;
    }
    if (previous) {
      await previous.dispose();
      await rm(archivePath(id, previous.revision), { force: true }).catch(() => {});
    }
  }

  let mutation = Promise.resolve();
  register({ path: EXTENSIONS_PATH, methods: ['GET', 'POST'], requestBody: 'streaming', async fetch(request) {
    const headers = { 'cache-control': 'no-store' };
    try {
      await ready;
      if (request.method === 'GET') return Response.json(list(), { headers });
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
        throw new ExtensionError('需要 JSON 请求正文', 415);
      }
      let input;
      try { input = JSON.parse((await readBounded(request.body, 8192)).toString('utf8')); }
      catch (error) { throw error instanceof ExtensionError ? error : new ExtensionError('扩展操作 JSON 无效'); }
      const handle = mutation.then(async () => {
        request.signal.throwIfAborted();
        if (input?.action === 'install') return install(parseRepository(input.url), request.signal, true);
        const id = input?.id;
        const current = validId(id) ? packages.get(id) : undefined;
        if (!current) throw new ExtensionError('没有找到这个扩展', 404);
        if (input.action === 'update') return install(current, request.signal);
        if (input.action === 'enable' && typeof input.enabled === 'boolean') {
          const { owner, repo, revision } = current;
          await atomicWrite(recordPath(id), JSON.stringify({ owner, repo, revision, enabled: input.enabled }));
          current.enabled = input.enabled;
          return;
        }
        if (input.action === 'uninstall') {
          await rm(recordPath(id), { force: true });
          packages.delete(id);
          await current.dispose();
          await rm(archivePath(id, current.revision), { force: true }).catch(() => {});
          return;
        }
        throw new ExtensionError('未知的扩展操作');
      });
      mutation = handle.catch(() => {});
      await handle;
      return Response.json(list(), { headers });
    } catch (error) {
      const message = error instanceof ExtensionError ? error.message
        : error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? '扩展操作超时或已取消'
        : '扩展管理失败，请检查 GitHub 连接或 DSH 配置目录权限';
      return Response.json({ error: message }, { headers, status: error instanceof ExtensionError ? error.status : 502 });
    }
  } });

  return async function serveAssets(request                 , response                , next                     ) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return next();
    const pathname = new URL(request.url || '/', 'http://dsh.local').pathname;
    const asset = assets.get(pathname);
    if (!asset) return next();
    const result = asset();
    response.writeHead(result.status, Object.fromEntries(result.headers));
    if (request.method === 'HEAD' || !result.body) {
      await result.body?.cancel();
      response.end();
      return;
    }
    await pipeline(Readable.fromWeb(result.body), response);
  };
}
