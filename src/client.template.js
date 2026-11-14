// 角色扮演（Client）—— v2 面板：局列表 / 窄顶栏 / 聊天区 / composer / 资产管理
// 构建时由 tools/build-client.mjs 注入资产快照。
window.__ModuleLoader__.load({
  id: '@dsh-tt/roleplay',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useMemo, useRef, useCallback } = React;

    const SNAPSHOT = __SNAPSHOT__;
    const STORE_KEY = 'dsh-tt:v2';
    const RP_PREFIX = 'RP · ';

    // ───────────────────────────── 样式 ─────────────────────────────
    const CSS = `
      .tt-root{height:100%;display:flex;flex-direction:column;overflow:hidden;
        color:var(--dsw-alias-text-primary,#1c1c1e);background:var(--dsw-alias-background-primary,#fff);
        font-family:var(--dsw-font-family-ui,-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif);
        -webkit-font-smoothing:antialiased;}
      .tt-top{height:44px;flex:none;display:flex;align-items:center;gap:10px;padding:0 12px;
        border-bottom:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.08));
        background:var(--dsw-alias-background-secondary,rgba(246,246,248,.86));
        backdrop-filter:saturate(180%) blur(18px);-webkit-backdrop-filter:saturate(180%) blur(18px);}
      .tt-brand{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;letter-spacing:-.01em;}
      .tt-spacer{flex:1;}
      .tt-chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 9px;border-radius:7px;
        border:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.1));
        background:var(--dsw-alias-background-primary,#fff);font-size:12px;color:inherit;cursor:pointer;
        max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        transition:transform 140ms cubic-bezier(.23,1,.32,1),background 140ms ease;}
      .tt-chip:hover{background:var(--dsw-alias-background-tertiary,rgba(0,0,0,.04));}
      .tt-chip:active{transform:scale(.97);}
      .tt-chip select{border:0;background:transparent;font:inherit;color:inherit;outline:none;max-width:150px;}
      .tt-body{flex:1;display:flex;min-height:0;}
      .tt-side{width:248px;flex:none;display:flex;flex-direction:column;min-height:0;
        border-right:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.08));
        background:var(--dsw-alias-background-secondary,rgba(250,250,252,.9));}
      .tt-new{margin:10px 10px 6px;height:30px;border-radius:8px;border:0;cursor:pointer;font:inherit;font-size:12.5px;
        background:var(--dsw-alias-background-accent,#0a84ff);color:#fff;font-weight:500;
        transition:transform 140ms cubic-bezier(.23,1,.32,1),filter 140ms ease;}
      .tt-new:active{transform:scale(.98);filter:brightness(.95);}
      .tt-list{flex:1;overflow-y:auto;padding:0 6px 6px;}
      .tt-row{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;border:0;border-radius:8px;
        padding:7px 9px;margin:1px 0;background:transparent;cursor:pointer;font:inherit;color:inherit;}
      .tt-row:hover{background:var(--dsw-alias-background-tertiary,rgba(0,0,0,.05));}
      .tt-row.on{background:var(--dsw-alias-background-primary,#fff);box-shadow:0 1px 3px rgba(0,0,0,.08),0 0 0 1px rgba(0,0,0,.06);}
      .tt-row b{font-size:12.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .tt-row span{font-size:11px;opacity:.55;}
      .tt-tabs{display:flex;gap:2px;padding:6px;border-top:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.08));}
      .tt-tab{flex:1;height:26px;border:0;border-radius:6px;background:transparent;font:inherit;font-size:11px;
        color:inherit;opacity:.7;cursor:pointer;}
      .tt-tab:hover{background:var(--dsw-alias-background-tertiary,rgba(0,0,0,.05));opacity:1;}
      .tt-tab.on{background:var(--dsw-alias-background-primary,#fff);opacity:1;font-weight:600;
        box-shadow:0 1px 2px rgba(0,0,0,.08);}
      .tt-main{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;}
      .tt-pane{flex:1;overflow:auto;padding:18px 22px;}
      .tt-chat{flex:1;overflow-y:auto;padding:16px 22px 8px;scroll-behavior:smooth;}
      .tt-fl{display:flex;gap:10px;margin-bottom:14px;align-items:flex-start;}
      .tt-av{width:26px;height:26px;flex:none;border-radius:50%;display:grid;place-items:center;
        font-size:11px;font-weight:600;color:#fff;background:var(--dsw-alias-background-accent,#0a84ff);
        box-shadow:0 1px 2px rgba(0,0,0,.15);}
      .tt-bub{min-width:0;flex:1;font-size:13.5px;line-height:1.72;word-break:break-word;}
      .tt-bub p{margin:0 0 .6em;}
      .tt-bub p:last-child{margin-bottom:0;}
      .tt-bub code{font-family:var(--dsw-font-family-mono,ui-monospace,Menlo,monospace);font-size:12px;
        background:var(--dsw-alias-background-tertiary,rgba(0,0,0,.05));padding:1px 4px;border-radius:4px;}
      .tt-bub pre{background:var(--dsw-alias-background-tertiary,rgba(0,0,0,.05));padding:10px 12px;border-radius:8px;
        overflow:auto;font-size:12px;line-height:1.55;}
      .tt-bub blockquote{margin:.4em 0;padding-left:10px;border-left:3px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.15));opacity:.8;}
      .tt-meta{font-size:11px;opacity:.45;margin-bottom:3px;}
      .tt-comp{flex:none;padding:8px 16px 14px;border-top:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.06));}
      .tt-box{border-radius:12px;border:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.12));
        background:var(--dsw-alias-background-primary,#fff);padding:8px 10px;display:flex;flex-direction:column;gap:6px;
        box-shadow:0 1px 2px rgba(0,0,0,.04);}
      .tt-ta{width:100%;min-height:38px;max-height:180px;resize:none;border:0;outline:none;background:transparent;
        font:inherit;font-size:13.5px;line-height:1.6;color:inherit;}
      .tt-bar{display:flex;align-items:center;gap:4px;}
      .tt-ic{width:26px;height:26px;border:0;border-radius:6px;background:transparent;cursor:pointer;font-size:14px;
        color:inherit;opacity:.6;display:grid;place-items:center;}
      .tt-ic:hover{background:var(--dsw-alias-background-tertiary,rgba(0,0,0,.05));opacity:1;}
      .tt-send{height:26px;padding:0 12px;border:0;border-radius:6px;background:var(--dsw-alias-background-accent,#0a84ff);
        color:#fff;font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;}
      .tt-send:disabled{opacity:.4;cursor:default;}
      .tt-h{font-size:16px;font-weight:600;margin:0 0 4px;letter-spacing:-.01em;}
      .tt-sub{font-size:12px;opacity:.55;margin:0 0 18px;}
      .tt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;}
      .tt-card{border:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.1));border-radius:10px;padding:12px;
        background:var(--dsw-alias-background-primary,#fff);cursor:pointer;transition:transform 140ms cubic-bezier(.23,1,.32,1);}
      .tt-card:hover{box-shadow:0 2px 10px rgba(0,0,0,.07);}
      .tt-card:active{transform:scale(.99);}
      .tt-card.on{border-color:var(--dsw-alias-background-accent,#0a84ff);box-shadow:0 0 0 1px var(--dsw-alias-background-accent,#0a84ff);}
      .tt-card b{display:block;font-size:13px;margin-bottom:2px;}
      .tt-card small{font-size:11px;opacity:.55;display:block;line-height:1.5;}
      .tt-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;
        font-size:12.5px;opacity:.5;text-align:center;padding:0 30px;line-height:1.7;}
      .tt-diag{font-family:var(--dsw-font-family-mono,ui-monospace,monospace);font-size:11px;line-height:1.6;
        background:var(--dsw-alias-background-tertiary,rgba(0,0,0,.04));border-radius:8px;padding:10px;overflow:auto;max-height:260px;}
      .tt-btn{height:28px;padding:0 12px;border-radius:7px;border:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.12));
        background:var(--dsw-alias-background-primary,#fff);font:inherit;font-size:12px;cursor:pointer;color:inherit;}
      .tt-btn:hover{background:var(--dsw-alias-background-tertiary,rgba(0,0,0,.04));}
      .tt-btn:active{transform:scale(.98);}
      .tt-inline{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
      .tt-note{font-size:11.5px;opacity:.55;line-height:1.65;}
      @media (prefers-reduced-motion: reduce){.tt-root *{transition:none !important;scroll-behavior:auto !important;}}
    `;

    // ───────────────────────────── 本地存储 ─────────────────────────────
    function seedStore() {
      const st = { cards: [], presets: [], activeCardId: null, activePresetId: null, extensions: {}, diag: [] };
      const seeded = new Set();
      (SNAPSHOT.cards || []).forEach((c) => {
        st.cards.push({ id: c.id, name: c.name, creator: c.creator, spec: c.spec, counts: c.counts, worldName: c.worldName, source: 'seed' });
        seeded.add(c.id);
      });
      (SNAPSHOT.presets || []).forEach((p) => {
        st.presets.push({ id: p.id, name: p.name, counts: p, source: 'seed' });
      });
      st.activeCardId = st.cards[0]?.id ?? null;
      st.activePresetId = st.presets[0]?.id ?? null;
      return st;
    }

    function loadStore() {
      try {
        const raw = localStorage.getItem(STORE_KEY);
        if (!raw) return seedStore();
        const parsed = JSON.parse(raw);
        return { ...seedStore(), ...parsed };
      } catch { return seedStore(); }
    }

    function saveStore(next) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch {}
    }

    // ───────────────────────────── 会话桥 ─────────────────────────────
    function makeBridge(ctx, log) {
      let remote = null;
      let session = null;
      try {
        remote = ctx ? ctx.remote : null;
        session = remote ? remote.session : null;
      } catch (error) {
        log(`ctx.remote.session 访问失败：${error && (error.message || error)}`);
      }
      const ok = Boolean(session);

      async function attempt(label, fns) {
        let last;
        for (const fn of fns) {
          try { return await fn(); } catch (error) { last = error; }
        }
        log(`${label} 失败：${last && (last.code || last.message) || last}`);
        throw last;
      }

      return {
        ok,
        async list() {
          const r = await attempt('session.list', [
            () => session.list(),
            () => session.list({}),
          ]);
          if (Array.isArray(r)) return r;
          return r?.sessions ?? r?.rows ?? r?.items ?? [];
        },
        async create(title, presetId) {
          const payloads = [
            { agentPreset: presetId, title },
            { preset: presetId, title },
            { title },
          ];
          return attempt('session.create', payloads.map((p) => () => session.create(p)));
        },
        async prompt(sessionId, text, attachments) {
          const content = [{ type: 'text', text }];
          const bodies = [
            { sessionId, content },
            { sessionId, content, mode: 'queue' },
            { address: { sessionId }, content },
          ];
          return attempt('session.prompt', bodies.map((b) => () => session.prompt(b)));
        },
        async events(sessionId, throughSeq) {
          const r = await attempt('session.events', [
            () => session.events({ sessionId, throughSeq }),
            () => session.events({ address: { sessionId }, throughSeq }),
            () => session.events({ sessionId, address: { sessionId } }),
          ]);
          return r?.records ?? r?.events ?? r ?? [];
        },
        async models() {
          try {
            const r = await Promise.race([
              session.listModels ? session.listModels() : Promise.reject(new Error('no listModels')),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
            ]);
            return r?.models ?? r ?? [];
          } catch { return []; }
        },
      };
    }

    // ───────────────────────────── Markdown ─────────────────────────────
    function renderInline(text, keyBase) {
      const nodes = [];
      const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
      let last = 0, m, i = 0;
      while ((m = re.exec(text))) {
        if (m.index > last) nodes.push(text.slice(last, m.index));
        const token = m[0];
        if (token.startsWith('`')) nodes.push(h('code', { key: keyBase + i++ }, token.slice(1, -1)));
        else if (token.startsWith('**')) nodes.push(h('strong', { key: keyBase + i++ }, token.slice(2, -2)));
        else nodes.push(h('em', { key: keyBase + i++ }, token.slice(1, -1)));
        last = m.index + token.length;
      }
      if (last < text.length) nodes.push(text.slice(last));
      return nodes;
    }

    function renderMarkdown(source, keyBase) {
      if (!source) return null;
      const blocks = String(source).split(/\n{2,}/);
      return blocks.map((block, bi) => {
        const key = `${keyBase}-${bi}`;
        if (block.startsWith('```')) {
          const body = block.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '');
          return h('pre', { key }, h('code', null, body));
        }
        if (/^>\s?/.test(block)) {
          return h('blockquote', { key }, renderInline(block.replace(/^>\s?/gm, ''), key));
        }
        return h('p', { key }, renderInline(block, key));
      });
    }

    // 显示作用域正则：把 ST 正则脚本应用到展示文本（markdownOnly 的那批）。
    function applyDisplayRegex(text, rules) {
      let out = String(text ?? '');
      for (const rule of rules || []) {
        if (!rule || rule.disabled || !rule.markdownOnly) continue;
        try {
          const re = new RegExp(rule.findRegex.replace(/^\/(.*)\/([a-z]*)$/s, '$1'), rule.findRegex.match(/\/([a-z]*)$/)?.[1] || 'g');
          out = out.replace(re, rule.replaceString ?? '');
        } catch {}
      }
      return out;
    }

    // ───────────────────────────── 事件 → 楼层 ─────────────────────────────
    function extractText(event) {
      const data = event?.data ?? event;
      const content = data?.content ?? data?.message?.content ?? data?.text;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content.map((block) => (typeof block === 'string' ? block : block?.text ?? '')).filter(Boolean).join('');
      }
      return '';
    }

    function toFloors(records) {
      const out = [];
      for (const record of records || []) {
        const event = record?.type === 'event' ? record.event : record;
        if (!event) continue;
        const type = event.type;
        if (type === 'user/message' || type === 'assistant/message') {
          const text = extractText(event);
          if (!text) continue;
          out.push({
            id: `${event.seq ?? out.length}-${type}`,
            role: type === 'user/message' ? 'user' : 'assistant',
            text,
            seq: event.seq ?? 0,
            time: event.time ?? event.data?.time ?? null,
          });
        }
      }
      return out;
    }

    // ───────────────────────────── 主面板 ─────────────────────────────
    function Panel(props) {
      const ctxRef = useRef(props && props.__ctx ? props.__ctx : null);
      const [store, setStore] = useState(loadStore);
      const [view, setView] = useState('chat');
      const [sessions, setSessions] = useState([]);
      const [activeId, setActiveId] = useState(null);
      const [floors, setFloors] = useState([]);
      const [draft, setDraft] = useState('');
      const [busy, setBusy] = useState(false);
      const [diag, setDiag] = useState([]);
      const [models, setModels] = useState([]);
      const chatRef = useRef(null);
      const scrollRef = useRef(null);

      const patchStore = useCallback((patch) => {
        setStore((prev) => {
          const next = { ...prev, ...patch };
          saveStore(next);
          return next;
        });
      }, []);

      const log = useCallback((line) => {
        setDiag((prev) => [...prev.slice(-39), `${new Date().toLocaleTimeString()}  ${line}`]);
      }, []);

      const bridge = useMemo(() => (ctxRef.current ? makeBridge(ctxRef.current, log) : null), [log]);

      const activeCard = store.cards.find((c) => c.id === store.activeCardId) || null;
      const activePreset = store.presets.find((p) => p.id === store.activePresetId) || null;

      // 会话列表
      const refreshSessions = useCallback(async () => {
        if (!bridge?.ok) { log('ctx.remote.session 不可用，会话功能停用'); return; }
        try {
          const rows = await bridge.list();
          const normalized = rows.map((row) => ({
            id: row.sessionId ?? row.id ?? row.address?.sessionId,
            title: row.title ?? row.name ?? '',
            updatedAt: row.updatedAt ?? row.lastActivity ?? row.time ?? null,
            raw: row,
          })).filter((r) => r.id);
          normalized.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
          setSessions(normalized);
          setActiveId((current) => current ?? normalized[0]?.id ?? null);
        } catch (error) {
          log(`会话列表读取失败：${error?.code || error?.message || error}`);
        }
      }, [bridge, log]);

      useEffect(() => { refreshSessions(); }, [refreshSessions]);

      useEffect(() => {
        if (!bridge) return;
        bridge.models().then((list) => setModels(Array.isArray(list) ? list.slice(0, 40) : []));
      }, [bridge]);

      // 拉取当前会话事件（轮询；follow 未接通前的兜底）
      useEffect(() => {
        if (!activeId || !bridge?.ok) return;
        let cancelled = false;
        let timer = null;
        const tick = async () => {
          try {
            const records = await bridge.events(activeId);
            if (cancelled) return;
            setFloors(toFloors(records));
          } catch {}
          if (!cancelled) timer = setTimeout(tick, 1200);
        };
        tick();
        return () => { cancelled = true; if (timer) clearTimeout(timer); };
      }, [activeId, bridge]);

      useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }, [floors.length]);

      const newChat = useCallback(async () => {
        if (!bridge?.ok) { log('无法新建：会话通道不可用'); return; }
        const stamp = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        const title = `${RP_PREFIX}${activeCard?.name ?? '角色扮演'} · ${stamp}`;
        setBusy(true);
        try {
          const created = typeof bridge.create === 'function' ? await bridge.create(title, 'roleplay') : null;
          const id = created?.sessionId ?? created?.id ?? created?.address?.sessionId ?? null;
          if (id) { setActiveId(id); setView('chat'); }
          await refreshSessions();
          log(`已新建会话 ${id || '(未知 id)'}`);
        } catch (error) {
          log(`新建失败：${error?.code || error?.message || error}`);
        } finally { setBusy(false); }
      }, [bridge, activeCard, refreshSessions, log]);

      const send = useCallback(async () => {
        const text = draft.trim();
        if (!text || !activeId || busy) return;
        setBusy(true);
        setDraft('');
        setFloors((prev) => [...prev, { id: `local-${Date.now()}`, role: 'user', text, seq: -1, time: Date.now() }]);
        try {
          await bridge.prompt(activeId, text, []);
        } catch (error) {
          log(`发送失败：${error?.code || error?.message || error}`);
        } finally { setBusy(false); }
      }, [draft, activeId, busy, bridge, log]);

      const importFiles = useCallback(async (event) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        for (const file of files) {
          try {
            const text = await file.text();
            const json = JSON.parse(text);
            if (Array.isArray(json.prompts) || Array.isArray(json.prompt_order)) {
              const id = `preset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              patchStore({ presets: [...store.presets, { id, name: json.name || file.name, counts: { prompts: json.prompts?.length ?? 0 }, source: 'import', raw: json }] });
              log(`已导入预设 ${json.name || file.name}`);
            } else {
              const inner = json.data ?? json;
              const id = `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              const card = {
                id,
                name: inner.name || file.name,
                creator: inner.creator || '',
                spec: json.spec || 'chara_card_v2',
                counts: { lorebookEntries: inner.character_book?.entries?.length ?? 0 },
                worldName: inner.character_book?.name ?? '',
                source: 'import',
                raw: json,
              };
              patchStore({ cards: [...store.cards, card], activeCardId: card.id });
              log(`已导入角色卡 ${card.name}`);
            }
          } catch (error) {
            log(`导入失败 ${file.name}：${error?.message || error}`);
          }
        }
      }, [store, patchStore, log]);

      const exportActive = useCallback(() => {
        const payload = activePreset ? (activePreset.raw ?? activePreset) : rawOf(activeCard);
        if (!payload) return;
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(activePreset || activeCard).name || 'export'}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }, [activePreset, activeCard]);

      const rawOf = useCallback((item) => {
        if (!item) return null;
        if (item.raw) return item.raw;
        const seed = (SNAPSHOT.cards || []).find((c) => c.id === item.id);
        return seed?.rawLite ?? null;
      }, []);

      const displayRules = useMemo(() => {
        const card = rawOf(activeCard);
        const inner = card?.data ?? card;
        return inner?.extensions?.regex_scripts ?? [];
      }, [activeCard, rawOf]);

      const renderFloors = () =>
        floors.map((floor) => {
          if (floor.role === 'system') return null;
          const text = applyDisplayRegex(floor.text, displayRules);
          return h('div', { key: floor.id, className: 'tt-fl' },
            h('div', { className: 'tt-av' },
              floor.role === 'user' ? '你' : String(activeCard?.name ?? 'AI').slice(0, 1)),
            h('div', { style: { minWidth: 0, flex: 1 } },
              h('div', { className: 'tt-meta' },
                `${floor.role === 'user' ? '你' : (activeCard?.name ?? '角色')}${floor.time ? ' · ' + new Date(floor.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}`),
              h('div', { className: 'tt-bub' }, renderMarkdown(text, floor.id)),
            ),
          );
        });

      const sidebar = h('div', { className: 'tt-side' },
        h('button', { className: 'tt-new', onClick: newChat, disabled: busy }, '+ 新建对话'),
        h('div', { className: 'tt-list' },
          sessions.length === 0
            ? h('div', { className: 'tt-empty', style: { height: 'auto', padding: '24px 12px' } }, '还没有对话')
            : sessions.slice(0, 200).map((s) => h('button', {
              key: s.id,
              className: 'tt-row' + (s.id === activeId ? ' on' : ''),
              onClick: () => { setActiveId(s.id); setView('chat'); },
            },
              h('b', null, s.title || `${RP_PREFIX}未命名`),
              h('span', null, s.updatedAt ? new Date(s.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''),
            )),
        ),
        h('div', { className: 'tt-tabs' },
          [['chat', '对话'], ['cards', '角色'], ['presets', '预设'], ['extensions', '扩展'], ['settings', '设置']].map(([key, label]) =>
            h('button', {
              key, className: 'tt-tab' + (view === key ? ' on' : ''),
              onClick: () => setView(key),
            }, label)),
        ),
      );

      const chatPane = view === 'chat'
        ? h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } },
          h('div', { className: 'tt-chat', ref: scrollRef },
            floors.length === 0
              ? h('div', { className: 'tt-empty' },
                h('div', null, activeCard ? `正在与「${activeCard.name}」对话` : '先在「角色」里选一张卡'),
                h('div', { className: 'tt-note' }, '把开场白或任何剧情推进写进下面的输入框。'))
              : renderFloors()),
          h('div', { className: 'tt-comp' },
            h('div', { className: 'tt-box' },
              h('textarea', {
                className: 'tt-ta',
                ref: chatRef,
                value: draft,
                placeholder: '写点什么…（Enter 发送，Shift+Enter 换行）',
                onChange: (e) => setDraft(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } },
              }),
              h('div', { className: 'tt-bar' },
                h('button', { className: 'tt-ic', title: '附件（占位）', onClick: () => log('附件上传待接通') }, '📎'),
                h('button', { className: 'tt-ic', title: '语音输入（占位）', onClick: () => log('语音输入待接通') }, '🎙'),
                h('div', { className: 'tt-spacer' }),
                h('button', { className: 'tt-send', disabled: busy || !draft.trim() || !activeId, onClick: send }, busy ? '生成中…' : '发送'),
              ),
            ),
          ))
        : null;

      const cardsPane = h('div', { className: 'tt-pane' },
        h('h2', { className: 'tt-h' }, '角色卡'),
        h('p', { className: 'tt-sub' }, '点击切换当前角色。导入支持 Character Card V2/V3 的 JSON。'),
        h('div', { className: 'tt-inline', style: { marginBottom: '14px' } },
          h('label', { className: 'tt-btn' }, '导入角色卡',
            h('input', { type: 'file', accept: '.json', multiple: true, style: { display: 'none' }, onChange: importFiles })),
          h('button', { className: 'tt-btn', onClick: exportActive }, '导出当前'),
        ),
        h('div', { className: 'tt-grid' },
          store.cards.map((card) => h('div', {
            key: card.id,
            className: 'tt-card' + (card.id === store.activeCardId ? ' on' : ''),
            onClick: () => patchStore({ activeCardId: card.id }),
          },
            h('b', null, card.name),
            h('small', null, `${card.spec || ''} · 世界书 ${card.counts?.lorebookEntries ?? 0} 条`),
            h('small', null, card.creator || '—'),
          ))),
      );

      const presetsPane = h('div', { className: 'tt-pane' },
        h('h2', { className: 'tt-h' }, '预设'),
        h('p', { className: 'tt-sub' }, '导入 ST 预设 JSON（保留全部字段，不丢扩展配置）。'),
        h('div', { className: 'tt-inline', style: { marginBottom: '14px' } },
          h('label', { className: 'tt-btn' }, '导入预设',
            h('input', { type: 'file', accept: '.json', multiple: true, style: { display: 'none' }, onChange: importFiles })),
          h('button', { className: 'tt-btn', onClick: exportActive }, '导出当前'),
        ),
        h('div', { className: 'tt-grid' },
          store.presets.map((preset) => h('div', {
            key: preset.id,
            className: 'tt-card' + (preset.id === store.activePresetId ? ' on' : ''),
            onClick: () => patchStore({ activePresetId: preset.id }),
          },
            h('b', null, preset.name),
            h('small', null, `prompts ${preset.counts?.prompts ?? preset.counts?.counts?.prompts ?? 0}`),
          ))),
      );

      const extPane = h('div', { className: 'tt-pane' },
        h('h2', { className: 'tt-h' }, '扩展'),
        h('p', { className: 'tt-sub' }, '酒馆助手（JS-Slash-Runner）以扩展形式安装，可更新、可卸载。'),
        h('div', { className: 'tt-inline', style: { marginBottom: '12px' } },
          h('button', { className: 'tt-btn', onClick: () => log('扩展下载器待接通（GitHub tree → 本地缓存）') }, '安装最新版'),
          h('button', { className: 'tt-btn', onClick: () => log('扩展运行器待接通') }, '启动'),
        ),
        Object.keys(store.extensions || {}).length === 0
          ? h('div', { className: 'tt-note' }, '尚未安装扩展。')
          : h('div', { className: 'tt-diag' }, JSON.stringify(store.extensions, null, 2)),
      );

      const settingsPane = h('div', { className: 'tt-pane' },
        h('h2', { className: 'tt-h' }, '设置与诊断'),
        h('p', { className: 'tt-sub' }, '会话通道的连接状态与最近错误都显示在这里。'),
        h('div', { className: 'tt-inline', style: { marginBottom: '10px' } },
          h('button', { className: 'tt-btn', onClick: refreshSessions }, '重新读取会话'),
          h('button', { className: 'tt-btn', onClick: () => setDiag([]) }, '清空诊断'),
        ),
        h('div', { className: 'tt-note', style: { marginBottom: '8px' } },
          `session remote: ${bridge?.ok ? '可用' : '不可用'} · 会话数 ${sessions.length} · 模型 ${models.length}`),
        h('div', { className: 'tt-diag' }, diag.length ? diag.join('\n') : '（暂无诊断信息）'),
      );

      const pane = view === 'cards' ? cardsPane : view === 'presets' ? presetsPane : view === 'extensions' ? extPane : view === 'settings' ? settingsPane : chatPane;

      return h('div', { className: 'tt-root' },
        h('style', null, CSS),
        h('div', { className: 'tt-top' },
          h('div', { className: 'tt-brand' }, '角色扮演'),
          h('div', { className: 'tt-spacer' }),
          h('div', { className: 'tt-chip', title: '当前角色' },
            h('span', null, '🎭'),
            h('select', {
              value: store.activeCardId || '',
              onChange: (e) => patchStore({ activeCardId: e.target.value }),
            }, store.cards.map((c) => h('option', { key: c.id, value: c.id }, c.name))),
          ),
          h('div', { className: 'tt-chip', title: '当前预设' },
            h('span', null, '📋'),
            h('select', {
              value: store.activePresetId || '',
              onChange: (e) => patchStore({ activePresetId: e.target.value }),
            }, store.presets.map((p) => h('option', { key: p.id, value: p.id }, p.name))),
          ),
          h('div', { className: 'tt-chip', title: '模型' },
            h('span', null, '⚙️'),
            h('select', {
              defaultValue: '',
              onChange: (e) => log(`模型切换请求：${e.target.value}（待接通 selectModel）`),
            },
            h('option', { value: '' }, models.length ? '跟随会话' : '默认模型'),
            models.map((m) => {
              const value = typeof m === 'string' ? m : (m.id ?? m.model ?? `${m.provider}/${m.model}`);
              const label = typeof m === 'string' ? m : (m.label ?? m.name ?? value);
              return h('option', { key: String(value), value: String(value) }, String(label));
            })),
          ),
        ),
        h('div', { className: 'tt-body' }, sidebar, h('div', { className: 'tt-main' }, pane)),
      );
    }

    // 面板兜底：任何渲染异常都显示成可读的错误，而不是白屏。
    class Boundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }
      static getDerivedStateFromError(error) {
        return { error };
      }
      componentDidCatch(error, info) {
        console.error('[dsh-tt] panel crashed', error, info);
        try {
          window.__dshTT = { error: String(error && error.stack || error), at: Date.now() };
        } catch {}
      }
      render() {
        const error = this.state.error;
        if (error) {
          const detail = error.stack || error.message || String(error);
          try { window.__dshTT = { error: detail, at: Date.now() }; } catch {}
          return h('div', {
            style: {
              padding: '24px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '12px',
              lineHeight: 1.7, whiteSpace: 'pre-wrap', overflow: 'auto', height: '100%',
              color: 'var(--dsw-alias-text-primary, #eee)', background: 'var(--dsw-alias-background-primary, #141414)',
            },
          }, '角色扮演面板出错：\n\n' + detail);
        }
        return this.props.children;
      }
    }

    function PanelIcon({ size }) {
      const px = size || 16;
      return h('svg', {
        width: px, height: px, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, style: { display: 'block' },
      },
        h('path', { d: 'M4 5.5h16v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z' }),
        h('path', { d: 'M8 9.5h8M8 13h5' }),
        h('path', { d: 'M12 18.5V21' }),
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        try {
          ctx.slots.inject('main', () => ctx.slots.register(
            { name: 'main', key: 'roleplay' },
            () => h(Boundary, null, h(Panel, { __ctx: ctx })),
          ));
          ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist', id: 'roleplay', order: 20, label: () => '角色扮演',
          }, PanelIcon));
          console.info('[dsh-tt] client module loaded');
        } catch (error) {
          console.error('[dsh-tt] client activation failed', error);
          try { window.__dshTT = { error: String(error && error.stack || error), at: Date.now(), phase: 'apply' }; } catch {}
          throw error;
        }
      },
    };
  },
});
