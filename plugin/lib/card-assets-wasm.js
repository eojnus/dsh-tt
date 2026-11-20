import { CARD_ASSETS_WASM_BASE64 } from './card-assets-wasm-bytes.js';

export function createCardAssetsWasm(bytes) {
  let wasm;
  let memory;
  let decoder;
  let encoder;
  let error = null;
  let lorebookContext;
  function withLorebookHook(fallback, action) {
    if (!lorebookContext || lorebookContext.failed) return fallback;
    try { return action(lorebookContext.hooks); }
    catch (cause) {
      lorebookContext.failed = true;
      lorebookContext.error = cause;
      return fallback;
    }
  }
  try {
    wasm = new WebAssembly.Instance(new WebAssembly.Module(bytes), { dsh_tt: {
      start_lorebook_round: (ptr, len) => withLorebookHook(undefined, (hooks) => {
        const text = decoder.decode(new Uint8Array(memory.buffer, ptr, len));
        hooks.startRound(text);
      }),
      match_lorebook_entry: (index) => withLorebookHook(0, (hooks) => hooks.matchEntry(index)),
      lorebook_random: () => withLorebookHook(1, (hooks) => hooks.random()),
      sort_legacy_lorebook_entries: (ptr, len, grouped) => withLorebookHook(undefined, (hooks) => {
        const entries = new Uint32Array(memory.buffer, ptr, len);
        entries.set(hooks.sortLegacy(Array.from(entries), Boolean(grouped)));
      }),
    } }).exports;
    if (!(wasm.memory instanceof WebAssembly.Memory) ||
        !['alloc', 'dealloc', 'normalize_card_text', 'scan_png'].every((key) => typeof wasm[key] === 'function')) {
      throw new Error('角色卡 WASM 接口不匹配');
    }
    memory = wasm.memory;
    encoder = new TextEncoder();
    decoder = new TextDecoder('utf-8', { fatal: true });
  } catch (cause) {
    wasm = null;
    error = String(cause?.message || cause);
  }

  function callJson(operation, input) {
    const active = wasm;
    if (!active) return null;
    try {
      const ptr = active.alloc(input.length) >>> 0;
      try {
        new Uint8Array(active.memory.buffer, ptr, input.length).set(input);
        const result = active[operation](ptr, input.length);
        if (result === 0n) return null;
        const outPtr = Number(result & 0xffffffffn);
        const outLen = Number(BigInt.asUintN(64, result) >> 32n);
        try {
          const output = new Uint8Array(active.memory.buffer, outPtr, outLen);
          return JSON.parse(decoder.decode(output));
        } finally {
          active.dealloc(outPtr, outLen);
        }
      } finally {
        active.dealloc(ptr, input.length);
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
    activateLorebook(input, hooks) {
      if (typeof wasm?.activate_lorebook !== 'function') return null;
      const previous = lorebookContext;
      const context = { hooks, failed: false, error: null };
      lorebookContext = context;
      try {
        const result = callJson('activate_lorebook', encoder.encode(JSON.stringify(input)));
        if (context.failed) throw context.error;
        return result;
      } finally {
        lorebookContext = previous;
      }
    },
    layoutLorebookBuckets(input) {
      if (typeof wasm?.layout_lorebook_buckets !== 'function') return null;
      return callJson('layout_lorebook_buckets', encoder.encode(JSON.stringify(input)));
    },
    layoutMessageFences(text) {
      if (typeof wasm?.layout_message_fences !== 'function') return null;
      return callJson('layout_message_fences', encoder.encode(JSON.stringify(text)));
    },
    buildLorebookScanWindows(input) {
      if (typeof wasm?.build_lorebook_scan_windows !== 'function') return null;
      return callJson('build_lorebook_scan_windows', encoder.encode(JSON.stringify(input)));
    },
    planMainPrompt(input) {
      if (typeof wasm?.plan_main_prompt !== 'function') return null;
      return callJson('plan_main_prompt', encoder.encode(JSON.stringify(input)));
    },
    orderPromptDepth(depths) {
      if (typeof wasm?.order_prompt_depth !== 'function') return null;
      return callJson('order_prompt_depth', encoder.encode(JSON.stringify(depths)));
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
