// 测试公共工具：夹具读取与项目路径。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const FIXTURES = path.join(HERE, 'fixtures');

export function fixtureText(...parts) {
  return fs.readFileSync(path.join(FIXTURES, ...parts), 'utf8');
}

export function fixtureJson(...parts) {
  return JSON.parse(fixtureText(...parts));
}

export const cardFixture = () => fixtureJson('characters', '青岚.json');
export const secondCardFixture = () => fixtureJson('characters', '听雪.json');
export const presetFixture = () => fixtureJson('presets', '测试预设.json');
export const lorebookFixture = () => fixtureJson('lorebooks', '夜雨客栈.json');
