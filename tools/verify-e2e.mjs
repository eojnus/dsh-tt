// 端到端验证：对着一台正在运行的 `dsh web` 发一次带信封的 prompt，
// 检查 system 段是否由插件组装、用户日志是否只剩正文。
//
// 用法：
//   node tools/verify-e2e.mjs "http://127.0.0.1:PORT/?token=TOKEN" [--card 春日] [--wait 120]
//
// 需要一个「装了插件」的 profile 在跑（推荐克隆 desktop → desktop-verify：
//   robocopy %USERPROFILE%\.dsh\profiles\desktop %USERPROFILE%\.dsh\profiles\desktop-verify /E /XJ
//   node tools/install.mjs install --profile-dir %USERPROFILE%\.dsh\profiles\desktop-verify
//   ELECTRON_RUN_AS_NODE=1 "…\DeepSeek Harness.exe" "…\app.asar\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js" \
//     --profile desktop-verify --port 7788 --no-open
// 验证完记得先 `cmd /c rmdir` 掉 junction 再删克隆，避免跟随联接删到 plugin/。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MARK = '\u0000TT\u0000';
const argv = process.argv.slice(2);
const baseUrl = argv[0];
if (!baseUrl) {
  console.error('用法：node tools/verify-e2e.mjs http://127.0.0.1:PORT/?token=TOKEN');
  process.exit(2);
}
function option(name, fallback) {
  const index = argv.indexOf('--' + name);
  return index >= 0 ? argv[index + 1] : fallback;
}
const cardFilter = option('card', '春日');
const waitSeconds = Number(option('wait', '120'));

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (relative) => import(pathToFileURL(path.join(projectRoot, relative)).href);
const { loadLibrary } = await load('plugin/lib/library.js');

const library = loadLibrary([path.join(projectRoot, '参考'), path.join(projectRoot, 'assets')]);
const cardEntry = library.cards.find((entry) => entry.card.name.includes(cardFilter)) || library.cards[0];
const presetEntry = library.presets[0];
if (!cardEntry) throw new Error('没有找到角色卡');

let cookie = '';
let rpcId = 0;

async function login() {
  const response = await fetch(baseUrl, { redirect: 'manual' });
  const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [response.headers.get('set-cookie')];
  cookie = (setCookie || []).filter(Boolean).map((item) => item.split(';')[0]).join('; ');
  if (!cookie) throw new Error('登录没有拿到 cookie：status ' + response.status);
  console.log('登录 OK（status ' + response.status + '）');
}

async function rpc(namespace, method, request) {
  rpcId += 1;
  const body = {
    type: 'client-request',
    rpcId: 'verify-' + rpcId,
    method: `${namespace}/${method}`,
    payload: { args: { request } },
  };
  const response = await fetch(new URL(`/api/${namespace}/${method}`, baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`${method} 返回非 JSON：${text.slice(0, 300)}`); }
  const result = json.result ?? json;
  if (result && result.ok === false) throw new Error(`${method} 失败：${JSON.stringify(result.error).slice(0, 400)}`);
  return result && 'value' in result ? result.value : result;
}

function textOf(event) {
  const data = event?.data ?? event;
  const content = data?.content ?? data?.message?.content ?? data?.text;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((block) => (typeof block === 'string' ? block : block?.text ?? '')).filter(Boolean).join('');
  }
  return '';
}

await login();

const created = await rpc('session', 'create', { agentPreset: 'roleplay' });
const sessionId = created?.sessionId ?? created?.id;
if (!sessionId) throw new Error('create 没有返回 sessionId：' + JSON.stringify(created).slice(0, 300));
console.log('会话 ' + sessionId + '（agentPreset=' + (created.agentPreset ?? '未回显') + '）');

const binding = {
  cardJson: cardEntry.card.raw,
  cardName: cardEntry.card.name,
  presetJson: presetEntry?.preset?.raw ?? null,
  presetName: presetEntry?.name,
  variables: { 牛头: true },
  greeting: '（验证用的开场白）',
};
const wire = MARK + JSON.stringify(binding) + MARK + '测试正文';
console.log(`信封 ${(wire.length / 1024 / 1024).toFixed(2)} MB`);

await rpc('session', 'prompt', {
  requestId: 'req-' + Date.now(),
  sessionId,
  mode: 'queue',
  content: [{ type: 'text', text: wire }],
  clientTimeZone: 'Asia/Shanghai',
});
console.log('prompt 已提交，等待事件…');

const deadline = Date.now() + waitSeconds * 1000;
let records = [];
let system = null;
let userMessages = [];
let assistant = null;
let sawError = null;
while (Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const page = await rpc('session', 'events', { address: { kind: 'session', sessionId }, maxMessages: 400 });
  records = page?.records ?? [];
  system = null;
  userMessages = [];
  assistant = null;
  sawError = null;
  for (const record of records) {
    const event = record?.type === 'event' ? record.event : record;
    const type = event?.type;
    if (type === 'system/message') system = textOf(event);
    else if (type === 'user/message') userMessages.push(textOf(event));
    else if (type === 'assistant/message') assistant = textOf(event);
    else if (type === 'error' || type === 'session/error' || type === 'turn/error') sawError = JSON.stringify(event).slice(0, 400);
  }
  if (system || sawError) break;
}

console.log('\n== 事件统计 ==');
const counts = {};
for (const record of records) {
  const event = record?.type === 'event' ? record.event : record;
  counts[event?.type] = (counts[event?.type] || 0) + 1;
}
console.log(JSON.stringify(counts));

const bodyMessages = userMessages.filter((text) => text.trim() === '测试正文');
console.log(`user/message 共 ${userMessages.length} 条，其中正文匹配 ${bodyMessages.length} 条`);

console.log('\n== 断言 ==');
const checks = [];
checks.push(['system 段存在', Boolean(system), system ? `${system.length} 字` : '（无）']);
if (system) {
  checks.push(['system 含卡内容（青岚/春日）', /青岚|春日/.test(system)]);
  checks.push(['system 含 Main Prompt 特征', /扮演|角色|叙事/.test(system)]);
  checks.push(['system 无信封', !system.includes(MARK)]);
  checks.push(['system 无 @@ 装饰器残留', !/@@(if|activate|dont_activate)/.test(system)]);
  checks.push(['system 无 EJS 标签残留', !system.includes('<%') && !system.includes('%>')]);
}
checks.push(['user 日志里有用户原文', bodyMessages.length === 1, bodyMessages[0] ? JSON.stringify(bodyMessages[0]) : `（${userMessages.length} 条都不是正文）`]);
checks.push(['所有 user 日志都不含信封', userMessages.every((text) => !text.includes(MARK))]);
if (assistant) checks.push(['assistant 回复', true, assistant.slice(0, 60) + '…']);
if (sawError) checks.push(['LLM 调用报错（不影响提示词验证）', false, sawError]);

let failed = 0;
for (const [label, ok, detail] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? '：' + detail : ''}`);
}
console.log(failed ? `\n${failed} 项未通过` : '\n全部通过');
process.exitCode = failed ? 1 : 0;
