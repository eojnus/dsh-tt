import { randomUUID } from 'node:crypto';
import { cardAssetsWasm } from './card-assets-wasm.js';

export const GENERATION_PATH = '/api/dsh-tt.generate';

type Prompt = { role: 'system' | 'user' | 'assistant'; content: string };
type ModelSelection = { provider: string; model: string; reasoningEffort?: string };
type Agent = { model: { current(): ModelSelection | undefined } };
type Chunk = {
  type: string;
  text?: string;
  reason?: { kind: string; failure?: { message?: string } };
};
type Host = {
  sessionController: { resolveAgent(id: string): Promise<{ agent?: Agent; error?: Error }> };
  llm: { stream(request: object): AsyncIterable<Chunk> };
};

const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const responseHeaders = { 'cache-control': 'no-store' };

function failure(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: responseHeaders });
}

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('请求正文为空');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let body = '';
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) return JSON.parse(body + decoder.decode());
      size += part.value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new Error('辅助生成请求超过 2 MiB');
      }
      body += decoder.decode(part.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

function modelMessage({ role, content: text }: Prompt, selection: ModelSelection) {
  const content = [{ type: 'text', text }];
  if (role === 'user') return { role, content };
  const source = role === 'system' ? { kind: 'system-prompt' }
    : { kind: 'model', provider: selection.provider, model: selection.model };
  return { id: randomUUID(), role, content, source };
}

async function* modelFrames(host: Host, request: object, signal: AbortSignal) {
  for await (const chunk of host.llm.stream(request)) {
    signal.throwIfAborted();
    if (chunk.type === 'text-delta' && chunk.text) yield { type: 'text', text: chunk.text };
    if (chunk.type === 'reasoning-delta' && chunk.text) yield { type: 'reasoning', text: chunk.text };
    if (chunk.type !== 'finish') continue;
    if (chunk.reason?.kind === 'error' || chunk.reason?.kind === 'aborted') {
      throw new Error(chunk.reason.failure?.message || '模型生成失败');
    }
    yield { type: 'done' };
    return;
  }
  throw new Error('模型流提前结束');
}

export async function handleAuxiliaryGeneration(host: Host, request: Request) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return failure('需要 application/json 请求正文', 415);
  }
  let input;
  try {
    input = await readBody(request);
  } catch (error) {
    return failure(error instanceof Error ? error.message : '无法读取生成请求', 400);
  }
  if (typeof input?.sessionId !== 'string' || !input.sessionId) return failure('会话 ID 不能为空', 400);
  const options = input.options || {};
  if (options.custom_api || options.tools || options.tool_choice || options.json_schema || options.image) {
    return failure('辅助生成当前支持会话模型的文本请求', 400);
  }
  const plan = cardAssetsWasm().assembleGeneration(input);
  if (!plan) return failure('无法运行 Rust 提示词组装', 503);
  if (plan.error) return failure(plan.error, 400);

  const { agent, error } = await host.sessionController.resolveAgent(input.sessionId);
  if (!agent) return failure(error?.message || '会话不可用', 404);
  const selection = agent.model.current();
  if (!selection) return failure('请给当前 DSH 会话选择模型', 409);

  const cancel = new AbortController();
  const signal = AbortSignal.any([request.signal, cancel.signal, AbortSignal.timeout(5 * 60_000)]);
  const modelRequest = {
    ...selection, sessionId: input.sessionId, signal, purpose: 'dsh-tt-auxiliary',
    messages: plan.messages.map((message: Prompt) => modelMessage(message, selection)),
  };
  const frames = modelFrames(host, modelRequest, signal);
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    async pull(controller) {
      try {
        const result = await frames.next();
        if (result.done) controller.close();
        else controller.enqueue(encoder.encode(JSON.stringify(result.value) + '\n'));
      } catch (error) {
        if (cancel.signal.aborted) return;
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error',
          message: error instanceof Error ? error.message : '模型生成失败' }) + '\n'));
        controller.close();
      }
    },
    async cancel() {
      cancel.abort();
      await frames.return();
    },
  }), { headers: { ...responseHeaders, 'content-type': 'application/x-ndjson; charset=utf-8' } });
}
