import { CARD_ASSETS_WASM_BASE64 } from './card-assets-wasm-bytes.js';

export function createCardAssetsWasm(bytes) {
  let wasm;
  let decoder;
  let encoder;
  let error = null;
  try {
    wasm = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
    if (!(wasm.memory instanceof WebAssembly.Memory) ||
        !['alloc', 'dealloc', 'normalize_card_text', 'scan_png'].every((key) => typeof wasm[key] === 'function')) {
      throw new Error('角色卡 WASM 接口不匹配');
    }
    encoder = new TextEncoder();
    decoder = new TextDecoder('utf-8', { fatal: true });
  } catch (cause) {
    wasm = null;
    error = String(cause?.message || cause);
  }

  function callJson(operation, input) {
    if (!wasm) return null;
    try {
      const ptr = wasm.alloc(input.length) >>> 0;
      try {
        new Uint8Array(wasm.memory.buffer, ptr, input.length).set(input);
        const result = wasm[operation](ptr, input.length);
        if (result === 0n) return null;
        const outPtr = Number(result & 0xffffffffn);
        const outLen = Number(BigInt.asUintN(64, result) >> 32n);
        try {
          const output = new Uint8Array(wasm.memory.buffer, outPtr, outLen);
          return JSON.parse(decoder.decode(output));
        } finally {
          wasm.dealloc(outPtr, outLen);
        }
      } finally {
        wasm.dealloc(ptr, input.length);
      }
    } catch (cause) {
      wasm = null;
      error = String(cause?.message || cause);
      return null;
    }
  }

  return {
    get mode() { return wasm ? 'wasm' : 'javascript'; },
    get error() { return error; },
    normalizeText(fields) {
      if (!wasm) return null;
      return callJson('normalize_card_text', encoder.encode(JSON.stringify(fields)));
    },
    scanPng(bytes) {
      return callJson('scan_png', bytes);
    },
    matchLorebookKeywords(batches) {
      if (typeof wasm?.match_lorebook_keywords !== 'function') return null;
      return callJson('match_lorebook_keywords', encoder.encode(JSON.stringify(batches)));
    },
    assembleGeneration(input) {
      if (typeof wasm?.assemble_generation !== 'function') return null;
      return callJson('assemble_generation', encoder.encode(JSON.stringify(input)));
    },
    encodeDisplayCapture(kind, value) {
      if (typeof wasm?.encode_display_capture !== 'function') return null;
      return callJson('encode_display_capture', encoder.encode(JSON.stringify({ kind, value })));
    },
    partitionPromptInjections(input) {
      if (typeof wasm?.partition_prompt_injections !== 'function') return null;
      return callJson('partition_prompt_injections', encoder.encode(JSON.stringify(input)));
    },
  };
}

let instance;

export function cardAssetsWasm() {
  if (!instance) {
    let bytes;
    try {
      bytes = Uint8Array.from(atob(CARD_ASSETS_WASM_BASE64), (char) => char.charCodeAt(0));
    } catch {
      // Missing or invalid Base64 leaves the JavaScript implementation available.
    }
    instance = createCardAssetsWasm(bytes);
  }
  return instance;
}
