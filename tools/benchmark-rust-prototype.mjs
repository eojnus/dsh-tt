// Diagnostic benchmark; prints timings and counts only, never private asset contents.
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { loadLibrary } from '../plugin/lib/library.js';
import { runPromptPipeline } from '../plugin/lib/pipeline.js';
import { extractCardJson } from '../plugin/lib/png.js';
import { normalizeCard } from '../plugin/lib/card.js';
import { activateEntries, normalizeCharacterBookEntries } from '../plugin/lib/lorebook.js';
import { createCardLengthPrototype } from '../prototype/wasm-card-length.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wasmPath = path.join(root, 'build/rust-target/wasm32-unknown-unknown/release/dsh_tt_prototype.wasm');
if (!fs.existsSync(wasmPath)) throw new Error('请先编译 Rust WASM 原型，参见 rust/README.md');
const bytes = fs.readFileSync(wasmPath);
const measure = (fn, warm = 5, count = 30) => {
  for (let i = 0; i < warm; i++) fn();
  const values = [];
  for (let i = 0; i < count; i++) { const t = performance.now(); fn(); values.push(performance.now() - t); }
  values.sort((a, b) => a - b);
  return { n: count, median_ms: +values[Math.floor(count / 2)].toFixed(4), p95_ms: +values[Math.ceil(count * .95) - 1].toFixed(4) };
};
const loadStart = performance.now();
const library = loadLibrary([path.join(root, '参考'), path.join(root, 'assets')]);
const loadMs = performance.now() - loadStart;
const selected = library.cards.find((item) => item.card.name.includes('天极')) || library.cards[0];
const card = selected?.card;
const preset = library.presets[0]?.preset || null;
const prototype = createCardLengthPrototype(bytes);
if (prototype.mode !== 'wasm') throw new Error(prototype.error);
const text = card?.description || '中文😀'.repeat(1000);
const result = {
  node: process.version, platform: process.platform, arch: process.arch,
  wasm_bytes: bytes.length,
  instantiate: measure(() => createCardLengthPrototype(bytes)),
  text_utf16_units: text.length,
  js_length: measure(() => text.length, 100, 1000),
  wasm_length_including_encoding: measure(() => prototype.length(text), 100, 1000),
  assets: { cards: library.cards.length, presets: library.presets.length, load_ms: +loadMs.toFixed(2) },
  process_memory_bytes: process.memoryUsage(),
};
if (card) {
  result.pipeline = measure(() => runPromptPipeline({ card, preset, maxContext: 200000, worldInfoBudget: 32000 }), 5, 20);
  const entries = normalizeCharacterBookEntries(card.characterBook);
  result.worldbook_scan = measure(() => activateEntries({ entries, scanText: card.description || '', budget: 32000, random: () => 0.5 }), 5, 20);
  result.card_normalize = measure(() => normalizeCard(card.raw), 20, 100);
  if (selected.file && /\.png$/i.test(selected.file)) {
    const png = fs.readFileSync(selected.file);
    result.png_bytes = png.length;
    result.png_extract = measure(() => extractCardJson(png), 3, 20);
  }
}
console.log(JSON.stringify(result, null, 2));
