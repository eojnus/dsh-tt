import { randomUUID } from 'node:crypto';
import { cardAssetsWasm } from './card-assets-wasm.js';

const requests = new Map();
const purpose = 'dsh-tt-roleplay';

export function rememberRoleplayRequest(agent, request) {
  const sessionId = agent?.session?.id;
  if (sessionId && request.userId) requests.set(sessionId, { agent, request });
}

export function forgetRoleplayRequest(agent) {
  const sessionId = agent?.session?.id;
  if (requests.get(sessionId)?.agent === agent) requests.delete(sessionId);
}

function makeMessage(item, { provider, model }) {
  const { role, content: text } = item;
  if (role === 'user') return {
    role: 'user', content: [{ type: 'text', text }],
  };
  const source = role === 'system' ? { kind: 'system-prompt' } : { kind: 'model', provider, model };
  return { id: randomUUID(), role, source, content: [{ type: 'text', text }] };
}

export function mountRoleplayStream(scope) {
  scope.on('llm/stream', (options, next) => {
    if (options.purpose || !Array.isArray(options.messages)) return next();
    const saved = requests.get(options.sessionId)?.request;
    if (!saved || options.messages.findLast((message) =>
      message.role === 'user' && message.source?.kind !== 'runtime-context')?.id !== saved.userId) {
      return next();
    }
    return streamRoleplay(scope.llm, options, saved);
  });
}

async function* streamRoleplay(llm, options, saved) {
  const history = options.messages.filter((message) =>
    !(message.role === 'system' && message.source?.kind === 'system-prompt'
      && (saved.complete || message.content?.map((block) => block.text ?? '').join('') === saved.sectionText)));
  // The DeepSeek Messages adapter treats each system snapshot as a
  // replacement on older routes. Keep its leading prompt and use an
  // in-place user instruction when that model cannot accept system updates.
  const deepSeek = options.provider === 'deepseek-official';
  const model = deepSeek && typeof llm.resolveModelInfo === 'function'
    ? await llm.resolveModelInfo(options.provider, options.model, options.signal)
    : null;
  const plan = cardAssetsWasm().assembleChatPrompt({
    sequence: saved.sequence, depth: saved.depth, greeting: saved.greeting,
    historyRoles: history.map(({ role }) => role),
    presetSettings: saved.presetSettings,
    systemMode: deepSeek ? (model?.systemPromptUpdate === 'in-history' ? 'snapshot' : 'leading-only') : 'native',
  });
  if (!plan) throw new Error('无法运行 Rust 对话消息组装');
  const { controls, entries } = plan;
  const messages = entries.map((item) => Object.hasOwn(item, 'index') ? history[item.index] : makeMessage(item, options));
  yield* llm.stream({ ...options, ...controls, messages, purpose });
}
