type DisplayRule = { findRegex?: string; replaceString?: string; disabled?: boolean; promptOnly?: boolean; markdownOnly?: boolean };
type HtmlSlot = { html: string; kind: 'literal' } | { html: string; kind: 'tree' | 'script' | 'text' | 'fox-thought'; marker: string };
type DataNode = string | { name: string; children: DataNode[] };

function compileDisplaySlots(rules: DisplayRule[], html: {
  splitMessageBlocks(source: string): { type: string; text: string }[];
  fenceDisplayFragment(source: string): string;
}) {
  const slots = new Map<DisplayRule, HtmlSlot>();
  for (const rule of rules) {
    if (rule.disabled || (rule.promptOnly && !rule.markdownOnly) || !rule.replaceString || /<%|{{match}}/i.test(rule.replaceString)) continue;
    const tokens = rule.replaceString.match(/\$(?:[0-9]+|[&`']|<)/g);
    const blocks = html.splitMessageBlocks(html.fenceDisplayFragment(rule.replaceString)).filter((block) => block.text.trim());
    if (blocks.length !== 1 || blocks[0].type !== 'html') continue;
    const source = blocks[0].text;
    if (!tokens) {
      slots.set(rule, { html: source, kind: 'literal' });
      continue;
    }
    if (tokens.length !== 1 || tokens[0] !== '$1' || typeof document === 'undefined') continue;
    const template = document.createElement('template');
    template.innerHTML = source;
    if (Array.from(template.content.querySelectorAll('template')).some((node) => node.content.textContent === '$1')) {
      slots.set(rule, { html: source, kind: 'tree', marker: '$1' });
    } else if (Array.from(template.content.querySelectorAll('textarea,div,span,p')).some((node) =>
      Array.from(node.childNodes).some((child) => child.nodeType === 3 && child.textContent?.trim() === '$1'))) {
      const kind = rule.findRegex?.includes('(think_?fox~?)') ? 'fox-thought' : 'text';
      slots.set(rule, { html: source, kind, marker: '$1' });
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
  if (slot.kind === 'literal') return slot.html;
  const value = slot.kind === 'tree' ? readCaptureTree(capture) : capture;
  const encoded = wasm.encodeDisplayCapture(slot.kind, value);
  return encoded === null ? null : slot.html.replace(slot.marker, () => encoded);
}

// DreamRpg observes these two decorations in the parent message DOM. Project
// just their presentation nodes; all other HTML goes through the frame path.
function inlineRpgDisplay(html: string) {
  if (typeof document === 'undefined' || !/\bdata-drpg-(?:answer|check)\b/i.test(html)) return null;
  const template = document.createElement('template');
  template.innerHTML = html;
  const nodes = Array.from(template.content.childNodes).filter((node) =>
    node.nodeType === 1 ? (node as Element).localName !== 'style' : node.nodeType === 3 && node.textContent?.trim());
  if (nodes.length !== 1 || nodes[0].nodeType !== 1) return null;
  const root = nodes[0] as Element;
  if (!root.matches('span[data-drpg-answer], span[data-drpg-check]')) return null;

  const tags = new Set(['span', 'q', 'br', 'b', 'strong', 'i', 'em', 'button']);
  const omit = new Set(['style', 'script', 'template', 'iframe', 'object']);
  const attributes = ['hidden', 'role', 'aria-label', 'aria-hidden', 'aria-live'];
  function copyChildren(from: Element, to: Element, depth: number) {
    if (depth > 48) return;
    for (const child of Array.from(from.childNodes)) {
      if (child.nodeType === 3) to.append(document.createTextNode(child.textContent || ''));
      if (child.nodeType !== 1) continue;
      const element = child as Element;
      if (omit.has(element.localName)) continue;
      if (tags.has(element.localName)) to.append(copyElement(element, depth));
      else copyChildren(element, to, depth + 1);
    }
  }
  function copyElement(from: Element, depth: number) {
    const to = document.createElement(from.localName);
    const classes = Array.from(from.classList).filter((name) => /^(?:custom-)?drpg-[\w-]+$/.test(name));
    if (classes.length) to.className = classes.join(' ');
    for (const name of attributes) {
      const value = from.getAttribute(name);
      if (value !== null) to.setAttribute(name, value);
    }
    if (depth === 0) {
      for (const name of ['data-drpg-answer', 'data-drpg-check']) {
        if (from.hasAttribute(name)) to.setAttribute(name, '');
      }
    }
    if (from.localName === 'button') to.setAttribute('type', 'button');
    copyChildren(from, to, depth + 1);
    return to;
  }
  return copyElement(root, 0).outerHTML;
}
