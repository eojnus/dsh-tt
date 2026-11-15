import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const { install, uninstall, statusFor, resolveProfileDir, stripBlock, patchHasBlock, pluginDir } =
  await import('../tools/install.mjs');

const tmpRoot = path.join(ROOT, 'tests', '.tmp');
const profileDir = path.join(tmpRoot, 'profile-under-test');

function resetProfile() {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-under-test',
    private: true,
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
  }, null, 2), 'utf8');
  fs.writeFileSync(path.join(profileDir, 'cordis.patch.yml'),
    '- id: ui-theme\n  name: "@deepseek-ai/dsh-client-ui-theme"\n  config:\n    fontSize: 16\n', 'utf8');
}

test.after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test('install：建联接 + 追加补丁 + 写标记，且可重复执行', () => {
  resetProfile();
  const before = statusFor(profileDir);
  assert.equal(before.installed, false);
  assert.equal(before.patchHasInstall, false);

  install({ profileDir, quiet: true });
  const after = statusFor(profileDir);
  assert.equal(after.installed, true);
  assert.equal(after.link.looksLikeOurs, true);
  assert.equal(after.link.pointsToThisRepo, true);
  assert.equal(after.patchHasInstall, true);
  assert.equal(after.resolve.ok, true, after.resolve.error);
  // 解析路径穿过 profile 的联接；指向本仓库 plugin 下的文件。
  assert.match(after.resolve.rootPath.replace(/\\/g, '/'), /profile-under-test\/node_modules\/@dsh-tt\/roleplay\/index\.js$/);
  assert.equal(fs.readFileSync(after.resolve.rootPath, 'utf8'), fs.readFileSync(path.join(pluginDir, 'index.js'), 'utf8'));

  const patch1 = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
  assert.match(patch1, /id: tt-roleplay/);
  assert.match(patch1, /id: preset-roleplay/);
  assert.match(patch1, /takeover: true/);
  assert.ok(patch1.includes('ui-theme'), '原有补丁内容必须保留');

  install({ profileDir, quiet: true });
  const patch2 = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
  assert.equal((patch2.match(/id: tt-roleplay\n/g) || []).length, 1);
});

test('uninstall：删联接、移除补丁块与标记，不碰别的条目', () => {
  resetProfile();
  install({ profileDir, quiet: true });
  uninstall({ profileDir, quiet: true });
  const status = statusFor(profileDir);
  assert.equal(status.link.exists, false);
  assert.equal(status.patchHasInstall, false);
  assert.equal(status.marker, null);
  assert.equal(status.installed, false);
  const patch = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
  assert.ok(patch.includes('ui-theme'));
  assert.equal(patch.includes('tt-roleplay'), false);
  // 卸载绝不能碰到插件本体。
  assert.ok(fs.existsSync(path.join(pluginDir, 'index.js')));
});

test('uninstall 不会删除不是本插件的目录', () => {
  resetProfile();
  const link = path.join(profileDir, 'node_modules', '@dsh-tt', 'roleplay');
  fs.mkdirSync(link, { recursive: true });
  fs.writeFileSync(path.join(link, 'keep.txt'), 'real directory', 'utf8');
  assert.throws(() => uninstall({ profileDir, quiet: true }), /拒绝删除/);
  assert.ok(fs.existsSync(path.join(link, 'keep.txt')));
});

test('install 遇到别的包占位时拒绝覆盖', () => {
  resetProfile();
  const link = path.join(profileDir, 'node_modules', '@dsh-tt', 'roleplay');
  fs.mkdirSync(link, { recursive: true });
  fs.writeFileSync(path.join(link, 'package.json'), JSON.stringify({ name: '@other/thing' }), 'utf8');
  assert.throws(() => install({ profileDir, quiet: true }), /不是本插件/);
});

test('install 会建 build/profile-backup 备份', () => {
  resetProfile();
  install({ profileDir, quiet: true });
  const backupRoot = path.join(ROOT, 'build', 'profile-backup');
  const entries = fs.readdirSync(backupRoot);
  assert.ok(entries.length > 0);
  const latest = entries.sort().at(-1);
  const manifest = JSON.parse(fs.readFileSync(path.join(backupRoot, latest, 'MANIFEST.json'), 'utf8'));
  assert.ok(manifest.files.includes('cordis.patch.yml'));
});

test('resolveProfileDir：显式路径优先于名称', () => {
  assert.equal(resolveProfileDir({ profileDir: 'C:/x/y' }).replace(/\\/g, '/'), 'C:/x/y');
  assert.match(resolveProfileDir({ profile: 'desktop' }).replace(/\\/g, '/'), /profiles\/desktop$/);
});

test('patchHasBlock / stripBlock：清理只动自己的块', () => {
  const text = '- id: a\n  name: a\n\n'
    + '# --- dsh-tt roleplay (managed by tools/install.mjs) ---\n- insert:\n    - id: tt-roleplay\n'
    + '# --- end dsh-tt roleplay ---\n';
  assert.equal(patchHasBlock(text), true);
  assert.equal(stripBlock(text).includes('tt-roleplay'), false);
  assert.equal(stripBlock(text).includes('id: a'), true);
  assert.equal(stripBlock('- id: b\n'), '- id: b\n');
});
