type DisplayRule = { replaceString?: string; disabled?: boolean };
type HtmlSlot = { html: string; kind: 'tree' | 'script' | 'text'; marker: string };
type DataNode = string | { name: string; children: DataNode[] };

function compileDisplaySlots(rules: DisplayRule[], html: {
  splitMessageBlocks(source: string): { type: string; text: string }[];
}) {
  const slots = new Map<DisplayRule, HtmlSlot>();
  for (const rule of rules) {
    if (rule.disabled || !rule.replaceString?.includes('$1')) continue;
    const tokens = rule.replaceString.match(/\$(?:[0-9]{1,2}|[&`']|<)/g);
    if (tokens?.length !== 1 || tokens[0] !== '$1') continue;
    const blocks = html.splitMessageBlocks(rule.replaceString).filter((block) => block.text.trim());
    if (blocks.length !== 1 || blocks[0].type !== 'html') continue;
    const source = blocks[0].text;
    const template = document.createElement('template');
    template.innerHTML = source;
    if (Array.from(template.content.querySelectorAll('template')).some((node) => node.content.textContent === '$1')) {
      slots.set(rule, { html: source, kind: 'tree', marker: '$1' });
    } else if (Array.from(template.content.querySelectorAll('textarea')).some((node) => node.textContent === '$1')) {
      slots.set(rule, { html: source, kind: 'text', marker: '$1' });
    } else if (Array.from(template.content.querySelectorAll('script:not([src])')).some((node) => node.textContent?.includes('`$1`'))) {
      slots.set(rule, { html: source, kind: 'script', marker: '`$1`' });
    }
  }
  return slots;
}

function readCaptureTree(text: string): DataNode[] {
  const template = document.createElement('template');
  template.innerHTML = text;
  function read(nodes: NodeListOf<ChildNode>, depth: number): DataNode[] {
    if (depth > 64) return [];
    return Array.from(nodes).flatMap((node): DataNode[] => {
      if (node.nodeType === 3) return [node.textContent || ''];
      if (node.nodeType !== 1) return [];
      const element = node as Element;
      return [{ name: element.localName, children: read(node.childNodes, depth + 1) }];
    });
  }
  return read(template.content.childNodes, 0);
}

function expandDisplaySlot(slot: HtmlSlot, capture: string, wasm: {
  encodeDisplayCapture(kind: string, value: string | DataNode[]): string | null;
}) {
  const value = slot.kind === 'tree' ? readCaptureTree(capture) : capture;
  const encoded = wasm.encodeDisplayCapture(slot.kind, value);
  return encoded === null ? null : slot.html.replace(slot.marker, () => encoded);
}
