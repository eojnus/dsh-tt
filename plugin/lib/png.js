// 读取角色卡 PNG 中的 tEXt 和未压缩 iTXt，供 Host 和面板共用。
import { cardAssetsWasm } from './card-assets-wasm.js';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CARD_KEYWORDS = ['chara', 'ccv3', 'Chara', 'CCV3'];

function latin1(bytes) {
  let text = '';
  const step = 0x8000;
  for (let start = 0; start < bytes.length; start += step) {
    text += String.fromCharCode(...bytes.subarray(start, start + step));
  }
  return text;
}

function scanPngJs(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ranges = [];
  let offset = SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const start = offset + 8;
    const end = start + view.getUint32(offset);
    if (end + 4 > bytes.length) break;
    const kind = latin1(bytes.subarray(offset + 4, start));
    if (kind === 'IEND') break;
    offset = end + 4;

    if (kind !== 'tEXt' && kind !== 'iTXt') continue;
    const data = bytes.subarray(start, end);
    const keywordEnd = data.indexOf(0);
    if (keywordEnd < 0) continue;
    if (kind === 'tEXt') {
      if (keywordEnd > 0) ranges.push([start, start + keywordEnd, start + keywordEnd + 1, end, 'latin1']);
      continue;
    }
    const languageEnd = data.indexOf(0, keywordEnd + 3);
    if (languageEnd < 0) continue;
    const translatedEnd = data.indexOf(0, languageEnd + 1);
    if (translatedEnd < 0) continue;
    const encoding = data[keywordEnd + 1] === 1 ? 'compressed' : 'utf8';
    ranges.push([start, start + keywordEnd, start + translatedEnd + 1, end, encoding]);
  }
  return ranges;
}

/** 读取文本块，后出现的同名文本块覆盖前面的。 */
export function readPngTextChunks(bytes, wasm = cardAssetsWasm()) {
  if (!SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    throw new Error('不是有效的 PNG 文件');
  }
  const text = new Map();
  const compressed = [];
  const utf8 = new TextDecoder('utf-8', { ignoreBOM: true });
  for (const [start, keywordEnd, payloadStart, end, encoding] of wasm.scanPng(bytes) ?? scanPngJs(bytes)) {
    const keyword = latin1(bytes.subarray(start, keywordEnd));
    if (encoding === 'compressed') {
      compressed.push(keyword);
      continue;
    }
    const payload = bytes.subarray(payloadStart, end);
    text.set(keyword, encoding === 'utf8' ? utf8.decode(payload) : latin1(payload));
  }
  return { chunks: Object.fromEntries(text), compressed };
}

function decodeBase64(text) {
  // Match the Host's previous Buffer decoding, including URL-safe characters
  // and missing padding, using the same API in Node and the browser.
  const clean = text.split('=', 1)[0].replace(/[^A-Za-z0-9+/_-]/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(clean.length % 4 === 1 ? clean.slice(0, -1) : clean);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export function extractCardJson(bytes, wasm = cardAssetsWasm()) {
  const { chunks, compressed } = readPngTextChunks(bytes, wasm);
  const key = CARD_KEYWORDS.find((keyword) => Object.hasOwn(chunks, keyword));
  const payload = key && chunks[key];
  if (!payload) {
    const hint = compressed.length ? `（发现压缩块 ${compressed.join(', ')}，暂不支持）` : '';
    throw new Error(`PNG 里没有 chara / ccv3 文本块${hint}`);
  }
  try {
    return JSON.parse(decodeBase64(payload));
  } catch {
    // Some cards store JSON directly, especially in an uncompressed iTXt chunk.
    return JSON.parse(payload.replace(/^\uFEFF/, ''));
  }
}
