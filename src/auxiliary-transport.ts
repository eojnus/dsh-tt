async function forwardAuxiliaryGeneration(input: object, signal: AbortSignal, send: (frame: object) => void) {
  const response = await fetch(new URL('api/dsh-tt.generate', document.baseURI), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    credentials: 'same-origin', signal, body: JSON.stringify(input),
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null);
    throw new Error(details?.error || `DSH 辅助生成接口返回 HTTP ${response.status}`);
  }
  if (!response.body || !response.headers.get('content-type')?.startsWith('application/x-ndjson')) {
    throw new Error('DSH 辅助生成接口没有返回模型流');
  }
  send({ type: 'start' });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) throw new Error('DSH 辅助生成接口提前关闭');
      buffer += decoder.decode(part.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line) continue;
        const frame = JSON.parse(line);
        send(frame);
        if (frame.type === 'done' || frame.type === 'error') return;
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* Abort may already have closed the response. */ }
    reader.releaseLock();
  }
}
