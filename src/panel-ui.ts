type NodeRef<T> = { current: T | null };
type PanelContent = ReturnType<typeof h> | null;

const PANEL_THEMES = [
  { id: 'light', label: '浅色' },
  { id: 'white', label: '白色' },
  { id: 'dark', label: '深色' },
] as const;

type PanelTheme = typeof PANEL_THEMES[number]['id'];

function ThemePicker({ value, onChange }: { value: PanelTheme; onChange: (theme: PanelTheme) => void }) {
  return h('fieldset', { className: 'tt-theme-picker' },
    h('legend', null, '界面主题'),
    h('div', { className: 'tt-theme-options' }, PANEL_THEMES.map(({ id, label }) =>
      h('label', { className: 'tt-theme-option', key: id },
        h('input', { type: 'radio', name: 'dsh-tt-theme', checked: value === id,
          value: id, onChange: () => onChange(id) }),
        h('span', { className: 'tt-theme-choice' },
          h('span', { className: 'tt-theme-swatch', 'data-preview': id, 'aria-hidden': true }), label,
        ),
      ),
    )),
  );
}

function AssistantReasoning({ text, active }: { text?: string; active?: boolean }) {
  if (!text) return null;
  return h('details', { className: 'tt-reasoning' },
    h('summary', null, active ? '思考中' : '思考过程'),
    h('div', { className: 'tt-reasoning-text' }, text),
  );
}

const PANEL_NAV = [
  { label: '会话与资料', pages: [['chat', '对话'], ['cards', '角色卡'], ['lore', '世界书'], ['presets', '预设']] },
  { label: '工具', pages: [['preview', '提示词预览'], ['regex', '正则'], ['extensions', '扩展'], ['settings', '设置与诊断']] },
];

const PANEL_TITLES: Record<string, string> = Object.fromEntries(PANEL_NAV.flatMap(({ pages }) => pages));
PANEL_TITLES.preview = '发送前预览';
PANEL_TITLES.regex = '正则脚本';

function ToolButton({ icon, label, id, className, disabled, pressed, expanded, controls, current, initialFocus, onClick, type = 'button' }: {
  icon: string; label: string; className?: string; disabled?: boolean; pressed?: boolean;
  id?: string; expanded?: boolean; controls?: string; current?: 'page'; initialFocus?: boolean; onClick?: () => void; type?: 'button' | 'submit';
}) {
  return h('button', {
    id, type, className: `tt-tool${className ? ' ' + className : ''}`,
    title: label, 'aria-label': label, 'aria-pressed': pressed, 'aria-expanded': expanded, 'aria-controls': controls, 'aria-current': current,
    disabled, onClick, 'data-tt-dialog-focus': initialFocus ? '' : undefined,
  }, h('span', { className: `tt-glyph i-${icon}`, 'aria-hidden': true }));
}

function useCompactPanel(root: NodeRef<HTMLElement>) {
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const update = (width: number) => { if (width > 0) setCompact(width < 760); };
    update(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [root]);
  return compact;
}

function PanelNavigation({ view, onNavigate }: { view: string; onNavigate: (view: string) => void }) {
  return h('nav', { className: 'tt-nav', 'aria-label': '角色扮演页面' }, PANEL_NAV.map((group) =>
    h('div', { className: 'tt-nav-group', role: 'group', 'aria-label': group.label, key: group.label },
      group.pages.map(([key, label]) => h(ToolButton, {
        key, icon: key, label, className: view === key ? 'on' : undefined,
        current: view === key ? 'page' : undefined,
        onClick: () => onNavigate(key),
      })),
    ),
  ));
}

function ChatOptions({ children }: { children: PanelContent[] }) {
  return h('details', {
    className: 'tt-chat-options',
    onBlur(event: { currentTarget: HTMLDetailsElement; relatedTarget: Node | null }) {
      if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
    },
    onKeyDown(event: { key: string; currentTarget: HTMLDetailsElement; preventDefault(): void }) {
      if (event.key !== 'Escape' || !event.currentTarget.open) return;
      event.preventDefault();
      event.currentTarget.open = false;
      event.currentTarget.querySelector('summary')?.focus();
    },
  },
    h('summary', { className: 'tt-tool', title: '对话选项', 'aria-label': '对话选项' },
      h('span', { className: 'tt-glyph i-presets', 'aria-hidden': true })),
    h('div', { className: 'tt-context', role: 'group', 'aria-label': '角色、预设和模型' }, children),
  );
}

// Keep the trusted script document at layout size. Only the painted floating
// regions of its iframe take pointer events away from the chat underneath.
function observeFloatingScriptUi(frame: HTMLIFrameElement) {
  let disconnect = () => {};
  function connect() {
    disconnect();
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc?.body || !win) return;
    const { body, documentElement } = doc;
    let pending: number | null = null;
    let clip = '';
    let measured = new Set<Element>();
    const ignored = new Set(['script', 'style', 'link', 'template', 'meta']);
    const schedule = () => { pending ??= requestAnimationFrame(update); };
    const resize = new ResizeObserver(schedule);
    const mutation = new MutationObserver(schedule);

    function update() {
      pending = null;
      const width = documentElement.clientWidth;
      const height = documentElement.clientHeight;
      const surfaces = new Set<Element>();
      const paths: string[] = [];
      const nodes = Array.from(body.children, (node) => ({ node, floating: false }));
      while (nodes.length) {
        const entry = nodes.pop()!;
        const { node } = entry;
        if (ignored.has(node.localName)) continue;
        const style = win.getComputedStyle(node);
        if (style.display === 'none' || style.opacity === '0') continue;
        const floating = entry.floating || style.position === 'fixed' || node.matches('dialog[open], [role="dialog"], [data-tt-mobile-surface]');
        if (floating && style.visibility === 'visible' && style.pointerEvents !== 'none') {
          const rect = node.getBoundingClientRect();
          surfaces.add(node);
          if (rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < width && rect.top < height) {
            const left = Math.max(0, Math.floor(rect.left) - 6);
            const top = Math.max(0, Math.floor(rect.top) - 6);
            const right = Math.min(width, Math.ceil(rect.right) + 6);
            const bottom = Math.min(height, Math.ceil(rect.bottom) + 6);
            paths.push(`M${left} ${top}H${right}V${bottom}H${left}Z`);
            continue;
          }
        }
        for (const child of node.children) nodes.push({ node: child, floating });
      }
      for (const node of measured) if (!surfaces.has(node)) resize.unobserve(node);
      for (const node of surfaces) if (!measured.has(node)) resize.observe(node);
      measured = surfaces;
      const next = paths.length ? `path("${paths.join(' ')}")` : 'inset(50%)';
      if (next !== clip) {
        clip = next;
        frame.toggleAttribute('data-tt-floating', paths.length > 0);
        frame.style.setProperty('--tt-script-clip', clip);
      }
    }

    mutation.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    resize.observe(frame);
    doc.addEventListener('transitionend', schedule);
    doc.addEventListener('animationend', schedule);
    schedule();
    disconnect = () => {
      if (pending !== null) cancelAnimationFrame(pending);
      mutation.disconnect();
      resize.disconnect();
      doc.removeEventListener('transitionend', schedule);
      doc.removeEventListener('animationend', schedule);
      frame.removeAttribute('data-tt-floating');
      frame.style.removeProperty('--tt-script-clip');
    };
  }
  frame.addEventListener('load', connect);
  return () => { frame.removeEventListener('load', connect); disconnect(); };
}

function PanelDialog({ id, title, drawer, onDismiss, children }: {
  id: string;
  title: string;
  drawer?: boolean;
  onDismiss: () => void;
  children: PanelContent | PanelContent[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previousFocus = element.ownerDocument.activeElement;
    element.showModal();
    const input = element.querySelector<HTMLElement>('[data-tt-dialog-focus]');
    (input || content.current)?.focus();
    return () => {
      if (element.open) element.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return h('dialog', {
    ref: dialog, id, className: 'tt-dialog' + (drawer ? ' tt-drawer' : ''),
    'aria-labelledby': `${id}-title`,
    onCancel(event: Event) { event.preventDefault(); onDismiss(); },
    onClick(event: Event) { if (event.target === event.currentTarget) onDismiss(); },
  },
    h('header', { className: 'tt-dialog-header' },
      h('h2', { id: `${id}-title` }, title),
      drawer ? h(ToolButton, { icon: 'close', label: '关闭会话与页面', initialFocus: true, onClick: onDismiss }) : null,
    ),
    h('div', { className: 'tt-dialog-content', ref: content, tabIndex: -1 }, children),
  );
}

type EnterEvent = { key: string; shiftKey?: boolean; repeat?: boolean; nativeEvent?: { isComposing?: boolean; keyCode?: number }; preventDefault(): void };

function shouldSubmit(event: EnterEvent) {
  return event.key === 'Enter' && !event.shiftKey && !event.repeat && !event.nativeEvent?.isComposing && event.nativeEvent?.keyCode !== 229;
}

function ChatComposer({ inputRef, value, sending, enabled, status, onChange, onSubmit }: {
  inputRef: NodeRef<HTMLTextAreaElement>;
  value: string;
  sending: boolean;
  enabled: boolean;
  status: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return h('form', { className: 'tt-box', onSubmit(event: Event) { event.preventDefault(); if (enabled && !sending && value.trim()) onSubmit(); } },
    h('textarea', {
      id: 'send_textarea', className: 'tt-ta', ref: inputRef, rows: 2, value,
      'aria-label': '对话消息', placeholder: '写下你的回应…',
      onChange: (event: { target: HTMLTextAreaElement }) => onChange(event.target.value),
      onInput: (event: { currentTarget: HTMLTextAreaElement; nativeEvent: Event }) => {
        if (!event.nativeEvent.isTrusted) onChange(event.currentTarget.value);
      },
      onKeyDown(event: EnterEvent) {
        if (!shouldSubmit(event)) return;
        event.preventDefault();
        if (enabled && !sending && value.trim()) onSubmit();
      },
    }),
    h(ToolButton, { id: 'send_but', icon: 'send', className: 'tt-tool-primary tt-send', type: 'submit', label: sending ? '发送中…' : '发送', disabled: !enabled || sending || !value.trim() }),
    h('span', { className: 'tt-note tt-compose-status', role: 'status' }, status),
  );
}

type SessionItem = { id: string; title: string; updatedAt?: number; raw?: { running?: boolean } };

function sessionTitle(session: SessionItem) {
  return (session.title.startsWith(RP_PREFIX) ? session.title.slice(RP_PREFIX.length) : session.title) || '未命名对话';
}

function SessionList({ rows, activeId, archived, selection, pinnedIds, menu, disabled, canArchive, canPin,
  onSelect, onToggle, onMenu, onRename, onPin, onArchive, onRestore }: {
  rows: SessionItem[]; activeId?: string; archived: boolean; selection: Set<string> | null; pinnedIds: string[];
  menu: string | null; disabled: boolean; canArchive: boolean; canPin: boolean;
  onSelect: (row: SessionItem) => void; onToggle: (id: string) => void; onMenu: (id: string) => void;
  onRename: (row: SessionItem) => void; onPin: (row: SessionItem) => void;
  onArchive: (row: SessionItem) => void; onRestore: (id: string) => void;
}) {
  return rows.map((row) => {
    const selected = selection?.has(row.id) === true;
    const pinned = pinnedIds.includes(row.id);
    const title = sessionTitle(row);
    const content = h('span', { className: 'tt-row-content' },
      h('b', { title }, title),
      row.updatedAt ? h('span', { className: 'tt-row-date' }, new Date(row.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })) : null,
    );
    return h('div', { key: row.id, className: 'tt-session-item' + (row.id === activeId ? ' active' : '') + (selected ? ' selected' : '') },
      h('div', { className: 'tt-session-line' },
        selection ? h('label', { className: 'tt-row tt-row-select' },
          h('input', { type: 'checkbox', checked: selected, disabled, onChange: () => onToggle(row.id), 'aria-label': `选择${title}` }), content,
        ) : archived ? h('div', { className: 'tt-row' }, content)
          : h('button', { type: 'button', className: 'tt-row', 'aria-current': row.id === activeId ? 'true' : undefined,
            onClick: () => onSelect(row) },
              h('span', { className: 'tt-glyph i-' + (pinned ? 'pin tt-is-pinned' : 'chat'), 'aria-hidden': true }), content),
        archived ? h(ToolButton, { icon: 'restore', label: `恢复${title}`, disabled, onClick: () => onRestore(row.id) })
          : !selection ? h(ToolButton, { icon: 'more', label: `管理${title}`, expanded: menu === row.id, disabled, onClick: () => onMenu(row.id) }) : null,
      ),
      !archived && !selection && menu === row.id ? h('div', { className: 'tt-session-actions', role: 'group', 'aria-label': `${title}的操作` },
        h(ToolButton, { icon: 'edit', label: '重命名', disabled, onClick: () => onRename(row) }),
        canPin ? h(ToolButton, { icon: 'pin', label: pinned ? '取消置顶' : '置顶', pressed: pinned, disabled, onClick: () => onPin(row) }) : null,
        canArchive ? h(ToolButton, { icon: 'archive', label: '归档会话', disabled, onClick: () => onArchive(row) }) : null,
      ) : null,
    );
  });
}

function openingPreview(text: string) {
  const plain = text.replace(/<SceneInfo>[\s\S]*?<\/SceneInfo>/gi, '').replace(/<\/?[a-z][^>]*>/gi, '').trim();
  return plain.length > 155 ? `${plain.slice(0, 155)}…` : plain;
}
