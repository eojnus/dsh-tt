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

function extractText(event) {
  const data = event.data ?? event;
  const content = data.content ?? data.message?.content ?? data.text;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((block) => (typeof block === 'string' ? block : block?.text ?? '')).join('');
  }
  return '';
}

export function toChatFloors(records) {
  const floors = [];
  for (const record of records || []) {
    const event = record?.type === 'event' ? record.event : record;
    if (event?.type !== 'user/message' && event?.type !== 'assistant/message') continue;
    const text = extractText(event);
    const body = splitChatInput(text)?.body ?? text;
    if (!body) continue;
    floors.push({
      id: `${event.seq ?? floors.length}-${event.type}`,
      role: event.type === 'user/message' ? 'user' : 'assistant',
      text: body,
      seq: event.seq ?? 0,
      time: event.time ?? event.data?.time ?? null,
    });
  }
  return floors;
}
