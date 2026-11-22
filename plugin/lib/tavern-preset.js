import { applyPresetOverrides, parsePreset } from './prompt.js';
import { cardAssetsWasm } from './card-assets-wasm.js';

export function tavernPresetView(raw, overrides) {
  const preset = applyPresetOverrides(parsePreset(raw), overrides);
  if (!preset) return null;
  const view = cardAssetsWasm().viewScriptPreset({ prompts: preset.prompts, order: preset.order });
  if (!view) throw new Error('Rust 无法生成酒馆助手预设视图');
  const { tavern_helper, ...extensions } = raw.extensions || {};
  return { ...view, extensions: structuredClone(extensions), settings: {
    max_context: raw.openai_max_context, max_completion_tokens: raw.openai_max_tokens,
    should_stream: raw.stream_openai, temperature: raw.temp_openai, top_p: raw.top_p_openai,
  } };
}

export function tavernPresetPromptEdit(raw, preset) {
  const edited = cardAssetsWasm().editScriptPreset({
    originals: raw.prompts, original_regex: raw.extensions?.regex_scripts,
    view: { prompts: preset?.prompts, prompts_unused: preset?.prompts_unused,
      extensions: { regex_scripts: preset?.extensions?.regex_scripts }, settings: preset?.settings },
  });
  if (!edited || edited.error) throw new Error(edited?.error || 'Rust 无法保存酒馆助手预设');
  const [first, ...others] = Array.isArray(raw.prompt_order) ? raw.prompt_order : [];
  return {
    ...edited.settings,
    ...(edited.extensions ? { extensions: edited.extensions } : {}),
    prompts: edited.prompts,
    prompt_order: [{ ...first, order: edited.order }, ...others],
  };
}

export function applyTavernPresetScriptEdit(raw, edits) {
  if (!edits) return raw;
  return { ...raw, ...edits, ...(edits.extensions ? { extensions: { ...raw.extensions, ...edits.extensions } } : {}) };
}
