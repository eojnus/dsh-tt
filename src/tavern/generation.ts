type AuxOptions = {
  prompt?: string | { role: string; content: string }[];
  generation_id?: string;
  user_input?: string;
  should_stream?: boolean;
  should_return_reasoning?: boolean;
  overrides?: { chat_history?: { prompts?: unknown } };
  injects?: PromptInjection[];
};
type PromptInjection = { id?: string; content: string; role?: string; position: string; depth?: number;
  should_scan?: boolean; filter?: () => boolean | Promise<boolean> };
type ChatEntry = { mes: string; is_system?: boolean; is_user?: boolean };
type GenerationFrame = { id: string; frame: { type: string; text?: string; message?: string } };

function createPromptInjections() {
  const active = new Map<string, { prompt: PromptInjection; once: boolean }>();

  function inject(prompts: PromptInjection[], options: { once?: boolean } = {}) {
    const added: [string, { prompt: PromptInjection; once: boolean }][] = [];
    for (const prompt of prompts) {
      if (!prompt?.id || typeof prompt.content !== 'string') continue;
      const entry = { prompt: { ...prompt }, once: options.once === true };
      active.set(prompt.id, entry);
      added.push([prompt.id, entry]);
    }
    return { uninject() {
      for (const [id, entry] of added) if (active.get(id) === entry) active.delete(id);
    } };
  }

  async function collect(extra: PromptInjection[] = []) {
    const result = [];
    for (const [id, entry] of Array.from(active)) {
      const { filter, ...prompt } = entry.prompt;
      if (typeof filter === 'function' && !await filter()) continue;
      if (active.get(id) !== entry) continue;
      if (entry.once) active.delete(id);
      result.push(prompt);
    }
    for (const item of extra) {
      const { filter, ...prompt } = item;
      if (typeof filter !== 'function' || await filter()) result.push(prompt);
    }
    return result;
  }

  return { inject, collect, uninject: (ids: string[]) => ids.forEach((id) => active.delete(id)) };
}

function createGenerationBridge({ post, emit, chat, format, events, collectInjections }: {
  post: (message: object) => void;
  emit: (type: string, ...args: unknown[]) => void;
  chat: ChatEntry[];
  format: (text: string, source: string, destination: string, options: { depth: number }) => string;
  events: Record<string, string>;
  collectInjections: (injects?: PromptInjection[]) => Promise<PromptInjection[]>;
}) {
  const pending = new Map<string, {
    config: AuxOptions;
    text: string;
    reasoning: string;
    resolve: (result: string | { text: string; reasoning: string }) => void;
    reject: (error: Error) => void;
  }>();
  let sequence = 0;

  function generate(mode: 'generate' | 'generateRaw', options: AuxOptions = {}) {
    const config = { ...options };
    const id = config.generation_id || `dsh-tt-generation-${++sequence}`;
    if (pending.has(id)) return Promise.reject(new Error(`生成 ID 已在使用：${id}`));
    emit(events.GENERATION_REQUESTED, id, mode, config);
    const history = mode === 'generateRaw' && config.prompt != null ? [] : chat.filter((message) => !message.is_system);
    const offset = typeof config.user_input === 'string' && config.user_input.length > 0 ? 1 : 0;
    const messages = history.map((message, index) => ({
      role: message.is_user ? 'user' : 'assistant',
      content: format(message.mes, message.is_user ? 'user_input' : 'ai_output', 'prompt', {
        depth: history.length - 1 - index + offset,
      }),
    }));
    if (offset) config.user_input = format(config.user_input!, 'user_input', 'prompt', { depth: 0 });
    return new Promise<string | { text: string; reasoning: string }>((resolve, reject) => {
      pending.set(id, { config, text: '', reasoning: '', resolve, reject });
      // Validate structured-clone input before using the shim's best-effort message channel.
      collectInjections(config.injects).then((injections) => {
        if (pending.get(id)?.config !== config) return;
        delete config.injects;
        post(structuredClone({ tt: 'generate', id, mode, options: config, history: messages, injections }));
      }).catch((error) => {
        if (pending.get(id)?.config !== config) return;
        pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  function receive({ id, frame }: GenerationFrame) {
    const entry = pending.get(id);
    if (!entry) return;
    switch (frame.type) {
      case 'start':
        emit(events.GENERATION_STARTED, id);
        break;
      case 'text':
        entry.text += frame.text || '';
        if (entry.config.should_stream && frame.text) {
          emit(events.STREAM_TOKEN_RECEIVED_FULLY, entry.text, id);
          emit(events.STREAM_TOKEN_RECEIVED_INCREMENTALLY, frame.text, id);
        }
        break;
      case 'reasoning':
        entry.reasoning += frame.text || '';
        break;
      case 'done':
        pending.delete(id);
        emit(events.GENERATION_ENDED, entry.text, id);
        entry.resolve(entry.config.should_return_reasoning ? { text: entry.text, reasoning: entry.reasoning } : entry.text);
        break;
      case 'error':
        pending.delete(id);
        entry.reject(new Error(frame.message || '辅助生成失败'));
        break;
    }
  }

  function stop(id: string) {
    const entry = pending.get(id);
    if (!entry) return false;
    pending.delete(id);
    post({ tt: 'generate-stop', id });
    emit('generation_stopped', id);
    entry.reject(new DOMException('辅助生成已停止', 'AbortError'));
    return true;
  }

  return { generate, receive, stop, stopAll() {
    const ids = Array.from(pending.keys());
    ids.forEach(stop);
    return ids.length > 0;
  } };
}
