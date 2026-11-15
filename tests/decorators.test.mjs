import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWorldInfoDecorators, joinDecorated } from '../plugin/lib/decorators.js';
import { createEjsScope } from '../plugin/lib/ejs.js';

test('@@dont_activate：整条丢弃', () => {
  assert.equal(applyWorldInfoDecorators('@@dont_activate\n正文', {}), '');
});

test('@@activate：去掉指令行，保留正文', () => {
  assert.equal(applyWorldInfoDecorators('@@activate\n正文', {}), '正文');
});

test('@@if 为真：去掉指令行', () => {
  const out = applyWorldInfoDecorators('@@if (1 === 1)\n正文', {});
  assert.equal(out, '正文');
});

test('@@if 为假：整条丢弃', () => {
  assert.equal(applyWorldInfoDecorators('@@if (1 === 2)\n正文', {}), '');
});

test('@@if 读 EJS 作用域里的变量', () => {
  const scope = createEjsScope({ stat_data: { 节日: '元日' } });
  assert.equal(applyWorldInfoDecorators('@@if (stat_data.节日 === "元日")\n灯会', scope), '灯会');
  assert.equal(applyWorldInfoDecorators('@@if (stat_data.节日 === "上元")\n灯会', scope), '');
});

test('@@if 的 IIFE 形态（参考卡的写法）', () => {
  const expr = '@@if (function () { return 3 > 2 })()\n出现';
  assert.equal(applyWorldInfoDecorators(expr, {}), '出现');
});

test('表达式抛错时保守保留正文', () => {
  const out = applyWorldInfoDecorators('@@if (没有这个变量.x)\n正文', {});
  assert.equal(out, '正文');
});

test('未知 @@ 指令只删该行', () => {
  assert.equal(applyWorldInfoDecorators('@@unknown thing\n正文', {}), '正文');
});

test('没有装饰器时原样返回', () => {
  assert.equal(applyWorldInfoDecorators('正文', {}), '正文');
});

test('joinDecorated：逐条处理再拼接', () => {
  const list = ['@@if (1)\n一', '@@if (0)\n二', '@@activate\n三'];
  assert.equal(joinDecorated(list, {}, '\n'), '一\n三');
  assert.equal(joinDecorated([], {}, '\n'), '');
});
