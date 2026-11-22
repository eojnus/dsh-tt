import { CARD_ASSETS_WASM_BASE64 } from './card-assets-wasm-bytes.js';

export function createCardAssetsWasm(bytes) {
  let wasm;
  let memory;
  let decoder;
  let encoder;
  let error = null;
  let lorebookContext;
  let templateContext;
  function withHook(context, fallback, action) {
    if (!context || context.failed) return fallback;
    try { return action(context.hooks); }
    catch (cause) {
      context.failed = true;
      context.error = cause;
      return fallback;
    }
  }
  try {
    wasm = new WebAssembly.Instance(new WebAssembly.Module(bytes), { dsh_tt: {
      start_lorebook_round: (ptr, len) => withHook(lorebookContext, undefined, (hooks) => {
        const text = decoder.decode(new Uint8Array(memory.buffer, ptr, len));
        hooks.startRound(text);
      }),
      match_lorebook_entry: (index) => withHook(lorebookContext, 0, (hooks) => hooks.matchEntry(index)),
      lorebook_random: () => withHook(lorebookContext, 1, (hooks) => hooks.random()),
      sort_legacy_lorebook_entries: (ptr, len, grouped) => withHook(lorebookContext, undefined, (hooks) => {
        const entries = new Uint32Array(memory.buffer, ptr, len);
        entries.set(hooks.sortLegacy(Array.from(entries), Boolean(grouped)));
      }),
      decorate_chat_source: (ptr, len) => withHook(templateContext, 0n, (decorate) => {
        const source = decoder.decode(new Uint8Array(memory.buffer, ptr, len));
        const bytes = encoder.encode(decorate(source));
        if (!bytes.length) return 0n;
        const output = wasm.alloc(bytes.length) >>> 0;
        new Uint8Array(memory.buffer, output, bytes.length).set(bytes);
        return (BigInt(bytes.length) << 32n) | BigInt(output);
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

  function callValue(operation, value) {
    if (typeof wasm?.[operation] !== 'function') return null;
    return callJson(operation, encoder.encode(JSON.stringify(value)));
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
    projectMessageProse(blocks, hidden) {
      return callValue('project_message_prose', { blocks, hidden });
    },
    normalizeGroupedChoices(text) {
      return callValue('normalize_grouped_choices', text);
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
    prepareChatTemplates(input, decorate) {
      const previous = templateContext;
      const context = { hooks: decorate, failed: false, error: null };
      templateContext = context;
      try {
        const result = callValue('prepare_chat_templates', input);
        if (context.failed) throw context.error;
        return result;
      } finally {
        templateContext = previous;
      }
    },
    assembleChatPrompt(input) {
      if (typeof wasm?.assemble_chat_prompt !== 'function') return null;
      return callJson('assemble_chat_prompt', encoder.encode(JSON.stringify(input)));
    },
    encodeDisplayCapture(kind, value) {
      if (typeof wasm?.encode_display_capture !== 'function') return null;
      return callJson('encode_display_capture', encoder.encode(JSON.stringify({ kind, value })));
    },
    partitionPromptInjections(input) {
      if (typeof wasm?.partition_prompt_injections !== 'function') return null;
      return callJson('partition_prompt_injections', encoder.encode(JSON.stringify(input)));
    },
    normalizePreset(input) {
      return callValue('normalize_preset', input);
    },
    extensionRepository(input) {
      return callValue('extension_repository', input);
    },
    indexExtensionArchive(bytes) {
      if (typeof wasm?.index_extension_archive !== 'function') return null;
      return callJson('index_extension_archive', bytes);
    },
    parseExtensionCommands(text) {
      return callValue('parse_extension_commands', text);
    },
    planMessageAction(command) {
      return callValue('plan_message_action', command);
    },
    editExtensionWorldbook(input) {
      return callValue('edit_extension_worldbook', input);
    },
    applyPresetOverrides(input) {
      return callValue('apply_preset_overrides', input);
    },
    viewScriptPreset(input) {
      return callValue('view_script_preset', input);
    },
    editScriptPreset(input) {
      return callValue('edit_script_preset', input);
    },
    projectChatFloors(input) {
      return callValue('project_chat_floors', input);
    },
    projectLiveReply(input) {
      return callValue('project_live_reply', input);
    },
    mergeFloorWindow(input) {
      return callValue('merge_floor_window', input);
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
