import { cardAssetsWasm } from './card-assets-wasm.js';

const MARK = '\u0000TT\u0000';

export function packChatInput(text, binding) {
  return binding ? MARK + JSON.stringify(binding) + MARK + text : text;
}

export function splitChatInput(text) {
  if (typeof text !== 'string' || !text.startsWith(MARK)) return null;
  const boundary = text.indexOf(MARK, MARK.length);
  if (boundary < 0) return { header: null, body: '' };
  return { header: text.slice(MARK.length, boundary), body: text.slice(boundary + MARK.length) };
}

function extractContent(event) {
  const data = event.data ?? event;
  return data.content ?? data.message?.content ?? data.text;
}

export function toChatFloors(records) {
  const packets = [];
  for (const record of records || []) {
    const event = record?.event ?? record;
    if (event?.type !== 'user/message' && event?.type !== 'assistant/message') continue;
    const content = extractContent(event);
    const blocks = Array.isArray(content) ? content : typeof content === 'string' ? [content] : [];
    packets.push({ event, blocks });
  }
  const plan = cardAssetsWasm().projectChatFloors(packets.map(({ event, blocks }) => ({
    kind: event.type, append: event.surfaceOp === 'append',
    turn: event.data?.turn, step: event.data?.step,
    source: (event.data?.source ?? event.data?.message?.source ?? event.source)?.kind,
    blocks: blocks.map((block) => typeof block === 'string' ? 'text'
      : typeof block?.text === 'string' ? block.type ?? 'text' : null),
  })));
  if (!plan) throw new Error('Rust 无法读取聊天楼层');
  const floors = [];
  for (const item of plan) {
    const { event, blocks } = packets[item.index];
    const blockText = (index) => typeof blocks[index] === 'string' ? blocks[index] : blocks[index].text;
    const text = item.text.map(blockText).join('');
    const body = splitChatInput(text)?.body ?? text;
    if (!body) continue;
    floors.push({
      id: `${event.seq ?? floors.length}-${event.type}`,
      role: item.role,
      text: body,
      reasoning: item.reasoning.map(blockText).join('\n\n'),
      replyKey: item.replyKey ?? undefined,
      seq: event.seq ?? 0,
      time: event.time ?? event.data?.time ?? null,
    });
  }
  return floors;
}

export function liveAssistantReply(entries) {
  const packets = [];
  const chunks = [];
  for (const entry of entries) {
    const event = entry?.event ?? entry;
    const kind = event?.type;
    if (kind !== 'assistant/live-chunk' && kind !== 'assistant/message' && kind !== 'assistant/attempt' && kind !== 'step/end') continue;
    const data = event.data;
    packets.push({ kind, turn: data?.turn, step: data?.step, attemptId: data?.attemptId, chunk: data?.chunk?.type });
    chunks.push(event);
  }
  const plan = cardAssetsWasm().projectLiveReply(packets);
  if (!plan) return null;
  const first = chunks[plan.index];
  const textAt = (index) => chunks[index].data?.chunk?.text;
  return { attemptId: first.data?.attemptId, key: plan.replyKey || `live-${first.data?.attemptId}`, time: first.time,
    text: plan.text.map(textAt).join(''), reasoning: plan.reasoning.map(textAt).join('') };
}

export function mergeChatFloors(history, recent, limit) {
  if (!recent.length) return history;
  const indices = cardAssetsWasm().mergeFloorWindow({
    history: history.map((floor) => Number(floor.seq)), recent: recent.map((floor) => Number(floor.seq)), limit,
  });
  if (!indices) throw new Error('Rust 无法合并聊天楼层');
  return indices.map((index) => index < history.length ? history[index] : recent[index - history.length]);
}
