// Experimental only: this module is not loaded by the production plugin.
// The caller supplies bytes so both Node and browsers can use the same adapter.
export function createCardLengthPrototype(bytes) {
  let wasm;
  let failure = null;
  try {
    const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes), {});
    wasm = instance.exports;
    if (!(wasm.memory instanceof WebAssembly.Memory) ||
        !['alloc', 'dealloc', 'utf16_len'].every((key) => typeof wasm[key] === 'function')) {
      throw new Error('WASM prototype exports are incompatible');
    }
  } catch (error) {
    wasm = null;
    failure = String(error?.message || error);
  }
  const encoder = new TextEncoder();
  return {
    get mode() { return wasm ? 'wasm' : 'javascript'; },
    get error() { return failure; },
    length(value) {
      const text = typeof value === 'string' ? value : '';
      if (!wasm) return text.length;
      try {
        const input = encoder.encode(text);
        const ptr = wasm.alloc(input.length);
        try {
          new Uint8Array(wasm.memory.buffer, ptr, input.length).set(input);
          const length = wasm.utf16_len(ptr, input.length);
          if (length < 0) throw new Error('WASM text length failed');
          return length;
        } finally {
          wasm.dealloc(ptr, input.length);
        }
      } catch (error) {
        failure = String(error?.message || error);
        wasm = null;
        return text.length;
      }
    },
  };
}
