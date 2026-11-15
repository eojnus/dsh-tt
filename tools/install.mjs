// DSH profile 安装器：把插件装进一个 profile（目录联接 + 补丁层），或卸载/查看状态。
//
// 用法：
//   node tools/install.mjs status    [--profile desktop | --profile-dir <路径>]
//   node tools/install.mjs install   [--profile desktop | --profile-dir <路径>]
//   node tools/install.mjs uninstall [--profile desktop | --profile-dir <路径>]
//
// 为什么不是 `dsh plugin add`：desktop profile 被桌面应用独占；把包写进 dsh.profile.bundles
// 会绕过 pnpm 锁文件导致应用起不来（设计文档 §15.6 记录过）。这里只做三件事：
//   1) profile/node_modules/@dsh-tt/roleplay → 本仓库 plugin/（目录联接）
//   2) profile/cordis.patch.yml 追加两条 insert（根层发现客户端模块 + roleplay preset）
//   3) profile/.dsh-tt-install.json 写安装标记（卸载时确认归属，避免误删真实目录）
// 改完必须完全退出并重开 DSH：Loader 图在启动时组合。
//
// 注意：本机的 Node 把目录联接当成普通目录（lstat 不报 symlink、readlink 抛 EINVAL），
// 但通过联接读取文件与 require.resolve 都正常。所以判定一律走「读 package.json 的 name」
// 与「解析成功」，不用 symlink 判定。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const pluginDir = path.join(projectRoot, 'plugin');
const PACKAGE_NAME = '@dsh-tt/roleplay';
const PACKAGE_SCOPE = '@dsh-tt';
const MARKER_NAME = '.dsh-tt-install.json';
const BEGIN_MARK = '# --- dsh-tt roleplay (managed by tools/install.mjs) ---';
const END_MARK = '# --- end dsh-tt roleplay ---';

const PATCH_BLOCK = `${BEGIN_MARK}
- insert:
    - id: tt-roleplay
      name: '${PACKAGE_NAME}'
      config:
        takeover: false
    - id: preset-roleplay
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: roleplay
        name: 角色扮演
        description: 只聊天。没有工具、没有工作区上下文，提示词由角色扮演插件接管。
        order: 20
        plugins:
          - id: tt-roleplay-agent
            name: '${PACKAGE_NAME}/agent'
            config:
              takeover: true
${END_MARK}
`;

function parseArgs(argv) {
  const options = {
    command: argv[2] || 'status',
    profile: process.env.DSH_PROFILE || 'desktop',
    profileDir: null,
    quiet: false,
  };
  for (let index = 3; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') options.profile = argv[++index];
    else if (arg === '--profile-dir') options.profileDir = argv[++index];
    else if (arg === '--quiet') options.quiet = true;
    else if (arg === '--help' || arg === '-h') options.command = 'help';
    else throw new Error(`未知参数：${arg}`);
  }
  return options;
}

function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

function resolveProfileDir(options = {}) {
  if (options.profileDir) return path.resolve(options.profileDir);
  return path.join(dshHome(), 'profiles', options.profile || process.env.DSH_PROFILE || 'desktop');
}

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function writeTextNoBom(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

function patchPath(profileDir) { return path.join(profileDir, 'cordis.patch.yml'); }
function markerPath(profileDir) { return path.join(profileDir, MARKER_NAME); }
function linkPath(profileDir) { return path.join(profileDir, 'node_modules', PACKAGE_SCOPE, 'roleplay'); }

function normalizePath(value) {
  return String(value || '').replace(/^\\\\\?\\/, '').replace(/\\/g, '/').toLowerCase();
}

/** 读联接指向的包名（读不到就是 null）。 */
function linkedPackageName(profileDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(linkPath(profileDir), 'package.json'), 'utf8')).name || null;
  } catch {
    return null;
  }
}

function linkExists(profileDir) {
  try {
    return fs.statSync(linkPath(profileDir)).isDirectory();
  } catch {
    return false;
  }
}

function readMarker(profileDir) {
  try {
    return JSON.parse(fs.readFileSync(markerPath(profileDir), 'utf8'));
  } catch {
    return null;
  }
}

function verifyResolve(profileDir) {
  try {
    const require = createRequire(path.join(profileDir, 'package.json'));
    return {
      ok: true,
      rootPath: require.resolve(PACKAGE_NAME),
      agentPath: require.resolve(`${PACKAGE_NAME}/agent`),
      clientPath: require.resolve(`${PACKAGE_NAME}/client`),
    };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

function patchHasBlock(text) {
  return text.includes(BEGIN_MARK) || text.includes(PACKAGE_NAME);
}

function stripBlock(text) {
  const begin = text.indexOf(BEGIN_MARK);
  if (begin < 0) return text;
  const end = text.indexOf(END_MARK);
  const after = end < 0 ? '' : text.slice(end + END_MARK.length);
  return (text.slice(0, begin) + after).replace(/\n{3,}/g, '\n\n');
}

function backup(profileDir) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(projectRoot, 'build', 'profile-backup', stamp);
  fs.mkdirSync(dir, { recursive: true });
  const copied = [];
  for (const name of ['cordis.patch.yml', 'package.json', MARKER_NAME]) {
    const source = path.join(profileDir, name);
    if (!fs.existsSync(source)) continue;
    fs.copyFileSync(source, path.join(dir, name));
    copied.push(name);
  }
  writeTextNoBom(path.join(dir, 'MANIFEST.json'), JSON.stringify({
    at: new Date().toISOString(),
    profileDir,
    files: copied,
    restore: copied.map((name) => `Copy-Item "${path.join(dir, name)}" "${profileDir}\\${name}" -Force`),
  }, null, 2));
  return dir;
}

function statusFor(profileDir) {
  const patch = readText(patchPath(profileDir));
  const marker = readMarker(profileDir);
  const link = { path: linkPath(profileDir), exists: linkExists(profileDir), name: linkedPackageName(profileDir) };
  link.looksLikeOurs = link.name === PACKAGE_NAME;
  link.pointsToThisRepo = Boolean(marker && normalizePath(marker.target) === normalizePath(pluginDir));
  const resolve = verifyResolve(profileDir);
  const ok = Boolean(link.exists && link.looksLikeOurs && resolve.ok && patchHasBlock(patch));
  return {
    profileDir,
    profileExists: fs.existsSync(profileDir),
    patchExists: Boolean(patch),
    patchHasInstall: patchHasBlock(patch),
    patchLines: patch ? patch.split(/\r?\n/).length : 0,
    link,
    marker,
    resolve,
    installed: ok,
  };
}

function printStatus(status) {
  const mark = (value) => (value ? '✅' : '❌');
  console.log(`profile      ${status.profileDir}${status.profileExists ? '' : '（不存在）'}`);
  console.log(`${mark(status.link.looksLikeOurs)} 目录联接   ${status.link.exists
    ? `→ ${status.link.path}${status.link.name ? `（包名 ${status.link.name}）` : '（读不到 package.json）'}`
    : '不存在'}`);
  console.log(`${mark(status.patchHasInstall)} 补丁条目   ${status.patchExists ? `${status.patchLines} 行` : '没有 cordis.patch.yml'}`);
  console.log(`${mark(status.resolve?.ok)} 模块解析   ${status.resolve?.ok ? status.resolve.rootPath : status.resolve?.error}`);
  if (status.marker) console.log(`   安装标记   ${status.marker.installedAt} → ${status.marker.target}`);
  console.log(`${status.installed ? '✅ 已安装（重开 DSH 生效）' : '❌ 未安装'}`);
}

function ensureJunction(profileDir) {
  const link = linkPath(profileDir);
  if (linkExists(profileDir)) {
    if (linkedPackageName(profileDir) === PACKAGE_NAME) return { action: 'unchanged', link };
    throw new Error(`${link} 已存在且不是本插件（读到的包名：${linkedPackageName(profileDir) ?? '无'}）；请先手动移走它`);
  }
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(pluginDir, link, 'junction');
  return { action: 'created', link };
}

/**
 * 删除目录联接。`fs.rmdirSync` 走 RemoveDirectoryW：对联接只删链接本身，
 * 对真实目录则在非空时失败（所以不会误删拷贝进来的插件副本）。
 */
function removeJunction(profileDir) {
  const link = linkPath(profileDir);
  if (!linkExists(profileDir)) return 'absent';
  const name = linkedPackageName(profileDir);
  if (name !== PACKAGE_NAME) {
    throw new Error(`${link} 里的包名是 ${name ?? '（读不到）'}，不是 ${PACKAGE_NAME}；拒绝删除`);
  }
  try {
    fs.rmdirSync(link);
  } catch (error) {
    throw new Error(`删除 ${link} 失败（可能是真实目录）：${error?.message || error}`);
  }
  try {
    const scopeDir = path.dirname(link);
    if (fs.readdirSync(scopeDir).length === 0) fs.rmdirSync(scopeDir);
  } catch { /* 非空或不存在都无所谓 */ }
  return 'removed';
}

function writeMarker(profileDir, action) {
  writeTextNoBom(markerPath(profileDir), JSON.stringify({
    package: PACKAGE_NAME,
    target: pluginDir,
    link: linkPath(profileDir),
    profileDir,
    action,
    installedAt: new Date().toISOString(),
  }, null, 2));
}

export function install(options = {}) {
  const profileDir = resolveProfileDir(options);
  const say = (...args) => { if (!options.quiet) console.log(...args); };
  if (!fs.existsSync(profileDir)) throw new Error(`profile 目录不存在：${profileDir}`);
  const before = statusFor(profileDir);
  if (before.installed && before.link.pointsToThisRepo) {
    say('已经装好了，没有改动。');
    if (!options.quiet) printStatus(before);
    return before;
  }

  const backupDir = backup(profileDir);
  say(`已备份到 ${backupDir}`);

  const link = ensureJunction(profileDir);
  say(`目录联接 ${link.action}：${link.link} → ${pluginDir}`);

  let patch = readText(patchPath(profileDir));
  if (!patchHasBlock(patch)) {
    if (patch && !patch.endsWith('\n')) patch += '\n';
    if (patch.trim()) patch += '\n';
    patch += PATCH_BLOCK;
    writeTextNoBom(patchPath(profileDir), patch);
    say('补丁层已追加两条 insert（tt-roleplay + preset-roleplay）');
  } else {
    say('补丁层已经包含插件条目，跳过');
  }

  const resolve = verifyResolve(profileDir);
  if (!resolve.ok) throw new Error(`安装后模块解析失败：${resolve.error}`);
  writeMarker(profileDir, 'install');

  const after = statusFor(profileDir);
  if (!options.quiet) printStatus(after);
  say('\n下一步：完全退出并重开 DSH（Loader 图与客户端模块只在启动时组合）。');
  say(`回滚：node tools/install.mjs uninstall --profile-dir "${profileDir}"，或从 ${backupDir} 拷回。`);
  return after;
}

export function uninstall(options = {}) {
  const profileDir = resolveProfileDir(options);
  const say = (...args) => { if (!options.quiet) console.log(...args); };
  const backupDir = backup(profileDir);
  say(`已备份到 ${backupDir}`);
  say(`目录联接：${removeJunction(profileDir)}`);
  const patch = readText(patchPath(profileDir));
  if (patchHasBlock(patch)) {
    writeTextNoBom(patchPath(profileDir), stripBlock(patch));
    say('补丁层的插件条目已移除');
  } else {
    say('补丁层没有插件条目');
  }
  if (fs.existsSync(markerPath(profileDir))) {
    fs.rmSync(markerPath(profileDir), { force: true });
    say('安装标记已删除');
  }
  if (!options.quiet) printStatus(statusFor(profileDir));
  say('\n重开 DSH 后侧栏入口才会消失。');
}

export { statusFor, resolveProfileDir, printStatus, stripBlock, patchHasBlock, pluginDir };

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const options = parseArgs(process.argv);
  try {
    if (options.command === 'install') install(options);
    else if (options.command === 'uninstall') uninstall(options);
    else if (options.command === 'status') printStatus(statusFor(options.profileDir ? resolveProfileDir(options) : resolveProfileDir(options)));
    else {
      console.log('用法：node tools/install.mjs status|install|uninstall [--profile <名字>] [--profile-dir <路径>]');
      process.exitCode = 2;
    }
  } catch (error) {
    console.error('失败：' + (error?.message || error));
    process.exitCode = 1;
  }
}
