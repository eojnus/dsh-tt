// PNG 文本块读取：从角色卡 PNG 里取出 chara / ccv3 的 base64 JSON。
// 只实现数据兼容所需的最小集合：tEXt 与未压缩的 iTXt。

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function decodeITXt(data) {
  const keywordEnd = data.indexOf(0);
  if (keywordEnd < 0) return null;
  const keyword = data.toString('latin1', 0, keywordEnd);
  let off = keywordEnd + 1;
  const compressionFlag = data[off];
  off += 2; // compression flag + method
  const langEnd = data.indexOf(0, off);
  if (langEnd < 0) return null;
  off = langEnd + 1;
  const translatedEnd = data.indexOf(0, off);
  if (translatedEnd < 0) return null;
  off = translatedEnd + 1;
  if (compressionFlag === 1) return { keyword, text: null, compressed: true };
  return { keyword, text: data.toString('utf8', off), compressed: false };
}

/** 返回 { [keyword]: text }，遇到压缩块时记为 { compressed: true } 单独报告。 */
export function readPngTextChunks(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('不是有效的 PNG 文件');
  }
  const chunks = {};
  const compressed = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > buffer.length) break;
    const data = buffer.subarray(start, end);

    if (type === 'tEXt') {
      const nul = data.indexOf(0);
      if (nul > 0) chunks[data.toString('latin1', 0, nul)] = data.toString('latin1', nul + 1);
    } else if (type === 'iTXt') {
      const parsed = decodeITXt(data);
      if (parsed?.compressed) compressed.push(parsed.keyword);
      else if (parsed?.text != null) chunks[parsed.keyword] = parsed.text;
    }

    offset = end + 4;
    if (type === 'IEND') break;
  }
  return { chunks, compressed };
}

/** 从 PNG Buffer 取出角色卡 JSON（chara 优先，其次 ccv3）。 */
export function extractCardJson(buffer) {
  const { chunks, compressed } = readPngTextChunks(buffer);
  const raw = chunks.chara ?? chunks.ccv3 ?? chunks.Chara ?? chunks.CCV3;
  if (!raw) {
    const hint = compressed.length ? `（发现压缩块 ${compressed.join(', ')}，暂不支持）` : '';
    throw new Error(`PNG 里没有 chara / ccv3 文本块${hint}`);
  }
  const text = Buffer.from(raw, 'base64').toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    // 少数卡直接写 JSON 而不做 base64
    return JSON.parse(raw);
  }
}
