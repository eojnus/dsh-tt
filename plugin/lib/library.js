// 资产库：扫描目录、识别类型、归一化。v1 只读内存，不做持久化。
import fs from 'node:fs';
import path from 'node:path';
import { extractCardJson } from './png.js';
import { normalizeCard, summarizeCard } from './card.js';
import { parsePreset } from './prompt.js';
import { normalizeCharacterBookEntries } from './lorebook.js';

const IMAGE_EXT = new Set(['.png']);
const JSON_EXT = new Set(['.json']);

function listFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

function classifyJson(json) {
  if (!json || typeof json !== 'object') return null;
  if (Array.isArray(json.prompts) || Array.isArray(json.prompt_order)) return 'preset';
  if (Array.isArray(json.entries) || json.entries && typeof json.entries === 'object') return 'lorebook';
  if (json.spec || (json.data && typeof json.data === 'object')) return 'card';
  if (typeof json.name === 'string' && (json.description || json.first_mes || json.firstMes)) return 'card';
  return null;
}

function slug(text, index) {
  const base = String(text || 'item').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return `${base || 'item'}-${index}`;
}

/**
 * @param {string[]} dirs 资产根目录（会递归扫描）
 */
export function loadLibrary(dirs) {
  const cards = [];
  const presets = [];
  const lorebooks = [];
  const errors = [];

  for (const root of dirs.filter(Boolean)) {
    for (const file of listFiles(root)) {
      const ext = path.extname(file).toLowerCase();
      try {
        if (IMAGE_EXT.has(ext)) {
          const raw = extractCardJson(fs.readFileSync(file));
          const card = normalizeCard(raw);
          cards.push({ id: slug(card.name, cards.length), file, summary: summarizeCard(card), card });
        } else if (JSON_EXT.has(ext)) {
          const json = JSON.parse(fs.readFileSync(file, 'utf8'));
          const kind = classifyJson(json);
          if (kind === 'card') {
            const card = normalizeCard(json);
            cards.push({ id: slug(card.name, cards.length), file, summary: summarizeCard(card), card });
          } else if (kind === 'preset') {
            const preset = parsePreset(json);
            presets.push({
              id: slug(preset.name, presets.length),
              file,
              name: preset.name,
              summary: {
                prompts: preset.prompts.length,
                enabled: preset.order.filter((o) => o.enabled !== false).length,
                markers: preset.prompts.filter((p) => p.marker).length,
                chars: preset.prompts.reduce((n, p) => n + String(p.content || '').length, 0),
                temperature: json.temperature,
                maxTokens: json.openai_max_tokens,
              },
              preset,
            });
          } else if (kind === 'lorebook') {
            const entries = normalizeCharacterBookEntries(json);
            lorebooks.push({
              id: slug(json.name || path.basename(file, ext), lorebooks.length),
              file,
              name: json.name || path.basename(file, ext),
              summary: { entries: entries.length, constant: entries.filter((e) => e.constant).length },
              entries,
            });
          }
        }
      } catch (error) {
        errors.push({ file, message: error?.message || String(error) });
      }
    }
  }

  return { cards, presets, lorebooks, errors };
}

/** 把卡内嵌世界书当作独立世界书使用。 */
export function bookEntriesOf(card) {
  return normalizeCharacterBookEntries(card?.characterBook);
}

export function resolveActive(library, activeName) {
  if (!library.cards.length) return null;
  if (!activeName) return library.cards[0];
  return library.cards.find((c) => c.card.name === activeName || c.id === activeName) ?? library.cards[0];
}
