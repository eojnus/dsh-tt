import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ROOT } from './helpers.mjs';
import path from 'node:path';

test('TH Zod 4：模块提供天极桥接所需的命名空间与 schema 行为', async () => {
  const bytes = fs.readFileSync(path.join(ROOT, 'src/tavern/zod4.bundle.mjs'));
  const z = await import('data:text/javascript;base64,' + bytes.toString('base64'));
  const schema = z.object({ count: z.number().default(1) });
  assert.ok(schema instanceof z.z.ZodObject);
  assert.equal(z.z.looseObject(schema.shape).parse({}).count, 1);
  assert.equal(z.string().safeParse(42).success, false);
  assert.equal(typeof z.z.prettifyError, 'function');
});
