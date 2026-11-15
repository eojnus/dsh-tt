import test from 'node:test';
import assert from 'node:assert/strict';
import { renderEjs, createEjsScope } from '../plugin/lib/ejs.js';

const scope = () => createEjsScope({
  stat_data: { 主要角色: { 名: '青岚', 好感: 3 }, 天气: '雨' },
  全局: { 已初始化: true },
});

test('<%= %> 转义，<%- %> 原样', () => {
  assert.equal(renderEjs('<%= "<b>" %>', {}), '&lt;b&gt;');
  assert.equal(renderEjs('<%- "<b>" %>', {}), '<b>');
  assert.equal(renderEjs('a<%= 1 + 1 %>b', {}), 'a2b');
});

test('没有 EJS 标记时原样返回', () => {
  assert.equal(renderEjs('纯文本', {}), '纯文本');
});

test('<%% 输出字面量 <%', () => {
  assert.equal(renderEjs('<%%= 1 %>', {}), '<%= 1 %>');
});

test('跨块：if 的 { 与 } 分在不同位置也能配对', () => {
  const source = '<% if (getvar("天气") === "雨") { %>\n雨还在下\n<% } %>';
  const out = renderEjs(source, scope());
  assert.match(out, /雨还在下/);
});

test('trim 标记：-%> 吃掉后续换行，<%_ 吃掉前面空白', () => {
  assert.equal(renderEjs('A<%= 1 -%>\nB', {}), 'A1B');
  assert.equal(renderEjs('A\n<%_ if (true) { %>B<% } %>', {}), 'AB');
});

test('getvar：点路径与 stat_data 顶层都能读', () => {
  assert.equal(renderEjs('<%= getvar("主要角色.名") %>', scope()), '青岚');
  assert.equal(renderEjs('<%= getvar("stat_data.主要角色.名") %>', scope()), '青岚');
  assert.equal(renderEjs('<%= getvar("不存在的", { defaults: "兜底" }) %>', scope()), '兜底');
});

test('setvar 写回同一份变量', () => {
  const s = scope();
  renderEjs('<% setvar("心情", "好") %>', s);
  assert.equal(s.variables.心情, '好');
  assert.equal(renderEjs('<%= getvar("心情") %>', s), '好');
});

test('stat_data 与 v 直接可见（装饰器/EJS 共用作用域）', () => {
  const s = scope();
  assert.equal(renderEjs('<%= stat_data.天气 %>', s), '雨');
  assert.equal(renderEjs('<%= v.全局.已初始化 %>', s), 'true');
});

test('lodash 子集：_.get / _.has / _.map', () => {
  const s = scope();
  assert.equal(renderEjs('<%= _.get(stat_data, "主要角色.名") %>', s), '青岚');
  assert.equal(renderEjs('<%= _.has(stat_data, "天气") %>', s), 'true');
  assert.match(renderEjs('<%= _.map([1,2,3], n => n * 2).join(",") %>', s), /2,4,6/);
});

test('出错时回退为去掉标签的原文，不让请求失败', () => {
  const out = renderEjs('正文<% throw new Error("boom") %>尾部', {});
  assert.match(out, /正文/);
  assert.match(out, /dsh-tt EJS error: boom/);
  assert.equal(out.includes('<%'), false);
});

test('HTML 注释里的错误标记不会被后续错误吞掉', () => {
  const out = renderEjs('<% nope() %>', {});
  assert.match(out, /<!-- dsh-tt EJS error:/);
});
