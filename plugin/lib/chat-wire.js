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

function replyKey(event) {
  const { turn, step } = event.data || {};
  return Number.isInteger(turn) && Number.isInteger(step) ? `reply-${turn}-${step}` : undefined;
}

export function toChatFloors(records) {
  const floors = [];
  for (const record of records || []) {
    const event = record?.event ?? record;
    if (event?.type !== 'user/message' && event?.type !== 'assistant/message') continue;
    const user = event.type === 'user/message';
    const content = extractContent(event);
    const text = Array.isArray(content) ? content.map((block) => {
      if (typeof block === 'string') return block;
      return (block?.type == null || block.type === 'text') && typeof block?.text === 'string' ? block.text : '';
    }).join('') : typeof content === 'string' ? content : '';
    const body = splitChatInput(text)?.body ?? text;
    if (!body) continue;
    const reasoning = !user && Array.isArray(content)
      ? content.filter((block) => block?.type === 'reasoning' && typeof block.text === 'string').map((block) => block.text).join('\n\n')
      : '';
    floors.push({
      id: `${event.seq ?? floors.length}-${event.type}`,
      role: user ? 'user' : 'assistant',
      text: body,
      reasoning,
      replyKey: !user && event.surfaceOp === 'append' ? replyKey(event) : undefined,
      seq: event.seq ?? 0,
      time: event.time ?? event.data?.time ?? null,
    });
  }
  return floors;
}

export function liveAssistantReply(entries) {
  let reply = null;
  const text = [];
  const reasoning = [];
  for (const entry of entries) {
    const event = entry.event ?? entry;
    if (!event) continue;
    if (event.type === 'assistant/live-chunk') {
      const { attemptId, chunk } = event.data;
      if (!reply || reply.attemptId !== attemptId) {
        reply = { attemptId, key: replyKey(event) || `live-${attemptId}`, time: event.time };
        text.length = 0;
        reasoning.length = 0;
      }
      if (chunk.type === 'text-delta') text.push(chunk.text);
      else if (chunk.type === 'reasoning-delta') reasoning.push(chunk.text);
    } else if (reply && reply.key === replyKey(event) && (event.type === 'assistant/message'
      || event.type === 'assistant/attempt' || event.type === 'step/end')) {
      reply = null;
    }
  }
  return reply && (text.length || reasoning.length) ? { ...reply, text: text.join(''), reasoning: reasoning.join('') } : null;
}
