// 角色扮演（Client）—— 面板：局列表 / 窄顶栏 / 聊天区 / composer / 资产与 TH 宿主
// 构建时由 tools/build-client.mjs 注入资产快照、TH 核心与 shim 源码。
window.__ModuleLoader__.load({
  id: '@dsh-tt/roleplay',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } = React;

    const SNAPSHOT = __SNAPSHOT__;
    const TAVERN_CORE_SRC = __TAVERN_CORE__;
    const TAVERN_PARSER_SRC = __TAVERN_PARSER__;
    const TAVERN_REGEX_SRC = __TAVERN_REGEX__;
    const TAVERN_SHIM_SRC = __TAVERN_SHIM__;
    const TAVERN_ZOD_SRC = __TAVERN_ZOD__;
    const TAVERN_VENDOR_SRC = __TAVERN_VENDOR__;
    const TT_LIB_SRC = __TT_LIB__;
    const STORE_KEY = 'dsh-tt:v3';
    const TH_KEY = 'dsh-tt:th:v1';
    const RP_PREFIX = 'RP · ';
    const POPUP_RESULT = { AFFIRMATIVE: 1, NEGATIVE: 0, CANCELLED: -1 };
    const POPUP_TYPE = { TEXT: 1, CONFIRM: 2, INPUT: 3, DISPLAY: 4 };

    // Host 提示词管线的同构副本（tools/bundle-lib.mjs 生成）。首次预览时才求值。
    let ttLibCache = null;
    function ttLib() {
      if (ttLibCache) return ttLibCache;
      // eslint-disable-next-line no-new-func
      const factory = new Function(TT_LIB_SRC + '\nreturn TT_LIB;');
      ttLibCache = factory();
      return ttLibCache;
    }

    // 与 Host 默认值保持一致（agent.js：maxContext 128000、世界书预算 25%）。
    const PREVIEW_MAX_CONTEXT = 128000;
    const PREVIEW_WI_BUDGET = 32000;

    // ───────────────────────────── 样式 ─────────────────────────────
    const CSS = __PANEL_CSS__;
    /* __DSH_PANEL_UI__ */

    // ───────────────────────────── 通用工具 ─────────────────────────────
    function hashString(text) {
      let hash = 2166136261;
      const source = String(text ?? '');
      for (let i = 0; i < source.length; i += 1) {
        hash ^= source.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(36) + ':' + source.length;
    }

    function hashJson(value) {
      try { return hashString(JSON.stringify(value)); } catch { return hashString(String(value)); }
    }

    function cloneJson(value) {
      try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function sanitizeHtml(html) {
      return String(html ?? '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/javascript:/gi, '');
    }

    function getPath(object, path, fallback) {
      if (object == null) return fallback;
      const parts = Array.isArray(path)
        ? path
        : String(path ?? '').replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
      let current = object;
      for (const part of parts) {
        if (current == null) return fallback;
        current = current[part];
      }
      return current === undefined ? fallback : current;
    }

    function setPath(object, path, value) {
      const parts = Array.isArray(path)
        ? path
        : String(path ?? '').replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
      if (!parts.length) return object;
      let current = object;
      for (let i = 0; i < parts.length - 1; i += 1) {
        if (current[parts[i]] == null || typeof current[parts[i]] !== 'object') current[parts[i]] = {};
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
      return object;
    }

    function innerOf(raw) {
      return raw && typeof raw === 'object' ? (raw.data && typeof raw.data === 'object' ? raw.data : raw) : {};
    }

    function greetingOptionsOf(raw) {
      const inner = innerOf(raw);
      const first = String(inner.first_mes || inner.firstMes || '').trim();
      const alternates = inner.alternate_greetings ?? inner.alternateGreetings;
      const options = first ? [{ id: 'first', label: '首条问候', text: first }] : [];
      if (Array.isArray(alternates)) {
        alternates.forEach((value, index) => {
          const text = typeof value === 'string' ? value.trim() : '';
          if (!text) return;
          const scene = text.match(/^<SceneInfo>\s*地点[：:][ \t]*([^\r\n<]+)/i)?.[1]?.trim();
          options.push({ id: 'alt-' + index, label: scene || `备选 ${index + 1}`, text });
        });
      }
      return options;
    }

    function cardRegexScripts(raw) {
      const inner = innerOf(raw);
      const scripts = inner?.extensions?.regex_scripts;
      return Array.isArray(scripts) ? scripts : [];
    }

    function assetTavernScripts(raw) {
      const inner = innerOf(raw);
      return ttLib().card.flattenTavernScripts(inner?.extensions?.tavern_helper?.scripts)
        .filter((script) => typeof script?.content === 'string');
    }

    function cardBook(raw) {
      const inner = innerOf(raw);
      return inner?.character_book && typeof inner.character_book === 'object' ? inner.character_book : null;
    }

    function bookEntries(book) {
      if (!book) return [];
      if (Array.isArray(book)) return book;
      if (Array.isArray(book.entries)) return book.entries;
      if (book.entries && typeof book.entries === 'object') return Object.values(book.entries);
      return [];
    }

    function normalizeBookEntry(entry, index) {
      const ext = entry && typeof entry.extensions === 'object' && entry.extensions ? entry.extensions : {};
      const keys = Array.isArray(entry?.keys) ? entry.keys : (Array.isArray(entry?.key) ? entry.key : []);
      const secondary = Array.isArray(entry?.secondary_keys)
        ? entry.secondary_keys
        : (Array.isArray(entry?.keysecondary) ? entry.keysecondary : []);
      const positionMap = { before_char: 0, after_char: 1, before_an: 2, after_an: 3, at_depth: 4, before_em: 5, after_em: 6 };
      const position = typeof entry?.position === 'number'
        ? entry.position
        : (positionMap[entry?.position] ?? Number(ext.position)) || 0;
      return {
        uid: entry?.id ?? entry?.uid ?? index,
        comment: String(entry?.comment || entry?.name || ''),
        keys,
        secondary,
        content: String(entry?.content || ''),
        constant: Boolean(entry?.constant),
        enabled: entry?.enabled !== false && entry?.disable !== true,
        position,
        depth: Number(ext.depth ?? entry?.depth ?? 4),
        order: Number(entry?.insertion_order ?? entry?.order ?? 100),
      };
    }

    function presetPrompts(raw) {
      return Array.isArray(raw?.prompts) ? raw.prompts : [];
    }

    function presetOrderSlots(raw) {
      const order = Array.isArray(raw?.prompt_order) ? raw.prompt_order : [];
      if (order[0] && Array.isArray(order[0].order)) return order[0].order;
      return presetPrompts(raw).map((prompt) => ({ identifier: prompt.identifier, enabled: true }));
    }

    function estimateTokens(text) {
      let cjk = 0;
      const source = String(text ?? '');
      for (const ch of source) if (ch.codePointAt(0) >= 0x2e80) cjk += 1;
      return Math.ceil(cjk / 1.6 + (source.length - cjk) / 3.6);
    }

    // ───────────────────────────── 本地存储 ─────────────────────────────
    function seedStore() {
      const st = {
        version: 3,
        cards: (SNAPSHOT.cards || []).map((card) => ({
          id: card.id,
          name: card.name,
          creator: card.creator,
          spec: card.spec,
          counts: card.counts || {},
          worldName: card.worldName,
          source: 'seed',
          filePath: card.filePath,
        })),
        presets: (SNAPSHOT.presets || []).map((preset) => ({
          id: preset.id,
          name: preset.name,
          counts: preset.counts || {},
          source: 'seed',
          filePath: preset.filePath,
        })),
        lorebooks: (SNAPSHOT.lorebooks || []).map((book) => ({
          id: book.id,
          name: book.name,
          counts: book.counts || {},
          source: 'seed',
          filePath: book.filePath,
        })),
        activeCardId: null,
        activePresetId: null,
        theme: 'light',
        presetOverrides: {},
        scriptOverrides: {},
        sessionMeta: {},
      };
      st.activeCardId = st.cards[0]?.id ?? null;
      st.activePresetId = st.presets[0]?.id ?? null;
      return st;
    }

    function loadStore() {
      const seeds = seedStore();
      try {
        const raw = localStorage.getItem(STORE_KEY) || localStorage.getItem('dsh-tt:v2');
        if (!raw) return seeds;
        const parsed = JSON.parse(raw);
        const merge = (seedList, storedList) => {
          const byId = new Map((storedList || []).map((item) => [item.id, item]));
          const out = seedList.map((item) => {
            const stored = byId.get(item.id);
            if (!stored) return item;
            byId.delete(item.id);
            return { ...item, ...stored, filePath: stored.filePath || item.filePath };
          });
          return out.concat(Array.from(byId.values()));
        };
        return {
          ...seeds,
          ...parsed,
          version: 3,
          theme: PANEL_THEMES.some(({ id }) => id === parsed.theme) ? parsed.theme : seeds.theme,
          cards: merge(seeds.cards, parsed.cards),
          presets: merge(seeds.presets, parsed.presets),
          lorebooks: merge(seeds.lorebooks, parsed.lorebooks),
          presetOverrides: parsed.presetOverrides || {},
          scriptOverrides: parsed.scriptOverrides || {},
          sessionMeta: parsed.sessionMeta || {},
        };
      } catch { return seeds; }
    }

    function saveStore(next) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch (error) {
        try { console.warn('[dsh-tt] store save failed', error); } catch { /* ignore */ }
      }
    }

    function presetSelection(store, presetId, sessionId, cardId) {
      if (!sessionId) return { activePresetId: presetId };
      return {
        activePresetId: presetId,
        sessionMeta: {
          ...store.sessionMeta,
          [sessionId]: { cardId, ...store.sessionMeta[sessionId], presetId },
        },
      };
    }

    function emptyTh() {
      return { global: {}, characters: {}, chats: {}, presets: {}, scripts: {}, messages: {}, overrides: {}, settings: {}, extensions: {} };
    }

    function loadTh() {
      try {
        const raw = localStorage.getItem(TH_KEY);
        if (!raw) return emptyTh();
        return { ...emptyTh(), ...JSON.parse(raw) };
      } catch { return emptyTh(); }
    }

    function pruneTh(th) {
      const sessionLimit = 8;
      const messageLimit = 80;
      const sessions = Object.keys(th.messages || {});
      while (sessions.length > sessionLimit) {
        const id = sessions.shift();
        delete th.messages[id];
        delete th.overrides[id];
        delete th.chats[id];
      }
      for (const id of Object.keys(th.messages || {})) {
        const map = th.messages[id] || {};
        const keys = Object.keys(map).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
        while (keys.length > messageLimit) delete map[keys.shift()];
        if (th.overrides && th.overrides[id]) {
          for (const key of Object.keys(th.overrides[id])) {
            if (!map[key] && Object.keys(th.overrides[id]).length > messageLimit) delete th.overrides[id][key];
          }
        }
      }
      return th;
    }

    function saveTh(th) {
      try { localStorage.setItem(TH_KEY, JSON.stringify(pruneTh(th))); } catch (error) {
        try { console.warn('[dsh-tt] th save failed', error); } catch { /* ignore */ }
      }
    }

    // ───────────────────────────── 会话桥 ─────────────────────────────
    function makeBridge(ctx, log) {
      let session = null;
      let files = null;
      let workspace = null;
      let sessionService = null;
      try { session = ctx && ctx.remote ? ctx.remote.session : null; } catch (error) {
        log('ctx.remote.session 访问失败：' + (error && (error.message || error)));
      }
      try { files = ctx && ctx.remote ? ctx.remote.workspaceFiles : null; } catch { files = null; }
      try { workspace = ctx?.workspaces; } catch { /* older host */ }
      try { sessionService = ctx?.sessions; } catch { /* older host */ }
      const ok = Boolean(session);

      const unwrap = (response) => {
        if (response && typeof response === 'object' && 'ok' in response) {
          if (!response.ok) {
            const detail = response.error || {};
            const failure = new Error((detail.code || 'remote/error') + ': ' + (detail.message || ''));
            failure.code = detail.code;
            throw failure;
          }
          return response.value;
        }
        return response;
      };

      const call = async (label, fn) => {
        try {
          return unwrap(await fn());
        } catch (error) {
          log(label + ' 失败：' + (error && (error.code || error.message) || error));
          throw error;
        }
      };

      const rid = () => (globalThis.crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : 'tt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
      const zone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } };
      const readSessionGroups = () => {
        const snapshot = workspace?.list?.getSnapshot();
        return { archived: snapshot?.archivedSessionIds || [], pinned: snapshot?.pinnedSessionIds || [], ready: !workspace || snapshot?.state !== 'loading' };
      };

      return {
        ok,
        hasFiles: Boolean(files),
        retainSession(id) { return sessionService?.retain(id, { source: 'dsh-tt:roleplay' }); },
        canManageSessions: Boolean(workspace?.list),
        readSessionGroups,
        subscribeSessionGroups(listener) {
          if (!workspace?.list) return undefined;
          const update = () => listener(readSessionGroups());
          const stop = workspace.list.subscribe(update);
          update();
          return stop;
        },
        async archiveSession(id) { await workspace.archiveSession(id); return readSessionGroups(); },
        async restoreSession(id) { await workspace.unarchiveSession(id); return readSessionGroups(); },
        async pinSession(id, pinned) {
          await (pinned ? workspace.pinSession(id) : workspace.unpinSession(id));
          return readSessionGroups();
        },
        async list() {
          const value = await call('session/list', () => session.list({}));
          const rows = Array.isArray(value) ? value : (value && (value.sessions || value.rows || value.items)) || [];
          return Array.isArray(rows) ? rows : [];
        },
        async create(presetId) {
          return call('session/create', () => session.create({ agentPreset: presetId, cwd: STORE_ROOT }));
        },
        async rename(sessionId, title) { return call('session/rename', () => session.rename({ sessionId, title })); },
        async prompt(sessionId, text, binding) {
          const wire = ttLib()['chat-wire'].packChatInput(text, binding);
          return call('session/prompt', () => session.prompt({
            requestId: rid(),
            sessionId,
            mode: 'queue',
            content: [{ type: 'text', text: wire }],
            clientTimeZone: zone(),
          }));
        },
        async events(sessionId) {
          const value = await call('session/events', () => session.events({
            address: { kind: 'session', sessionId },
            maxMessages: 300,
          }));
          return (value && value.records) || [];
        },
        async models() {
          try {
            const value = await call('session/modelCatalog', () => session.modelCatalog());
            const groups = (value && value.groups) || [];
            const flat = [];
            for (const group of groups) {
              for (const model of group.models || []) {
                flat.push({
                  provider: group.id || group.provider || '',
                  model: model.id || model.model || '',
                  label: model.label || model.name || model.id || model.model || '',
                });
              }
            }
            return flat;
          } catch { return []; }
        },
        async selectModel(sessionId, provider, model) {
          const bodies = [
            { sessionId, provider, model },
            { sessionId, selection: { provider, model } },
          ];
          for (const body of bodies) {
            try { await call('session/selectModel', () => session.selectModel(body)); return true; }
            catch { /* try next shape */ }
          }
          return false;
        },
        async readBytes(sessionId, path) {
          if (!files) throw new Error('workspaceFiles 不可用');
          const value = await call('workspaceFiles.readBytes', () => files.readBytes(sessionId, path, {}, undefined));
          if (value && value.data instanceof Uint8Array) return value.data;
          if (value instanceof Uint8Array) return value;
          if (value && value.data && Array.isArray(value.data.data)) return new Uint8Array(value.data.data);
          throw new Error('workspaceFiles.readBytes 返回了未知形状');
        },
      };
    }

    // ───────────────────────────── 资产解析 ─────────────────────────────
    function decodeUtf8(bytes) {
      return new TextDecoder('utf-8').decode(bytes);
    }

    function parseJsonText(text) {
      return JSON.parse(String(text ?? '').replace(/^\uFEFF/, ''));
    }

    function parseCardPng(bytes) {
      return ttLib().png.extractCardJson(bytes);
    }

    async function readCardFile(file) {
      const isPng = /\.png$/i.test(file.name) || file.type === 'image/png';
      if (!isPng) return parseJsonText(await file.text());
      return parseCardPng(new Uint8Array(await file.arrayBuffer()));
    }

    function classifyJson(json) {
      if (!json || typeof json !== 'object') return null;
      if (Array.isArray(json.prompts) || Array.isArray(json.prompt_order)) return 'preset';
      if (Array.isArray(json.entries) || (json.entries && typeof json.entries === 'object')) return 'lorebook';
      if (json.spec || (json.data && typeof json.data === 'object')) return 'card';
      if (typeof json.name === 'string' && (json.description || json.first_mes || json.firstMes)) return 'card';
      return null;
    }

    // ───────────────────────────── EJS（输出侧） ─────────────────────────────
    const EJS_CACHE = new Map();

    function compileClientEjs(source) {
      if (EJS_CACHE.has(source)) return EJS_CACHE.get(source);
      const segments = [];
      let index = 0;
      let trimNext = false;
      const TAG = '<%';
      const pushText = (text, slurp) => {
        if (!text) return;
        let value = text;
        if (slurp) value = value.replace(/[ \t]*$/, '');
        if (trimNext) { value = value.replace(/^[ \t]*\r?\n/, ''); trimNext = false; }
        if (value) segments.push({ type: 'text', value });
      };
      while (index < source.length) {
        const open = source.indexOf(TAG, index);
        if (open < 0) { pushText(source.slice(index)); break; }
        let cursor = open + 2;
        pushText(source.slice(index, open));
        if (source[cursor] === '%') { pushText('<%'); index = cursor + 1; continue; }
        let kind = '';
        let slurp = false;
        if (source[cursor] === '_') { slurp = true; cursor += 1; }
        else if (source[cursor] === '=' || source[cursor] === '-' || source[cursor] === '#') { kind = source[cursor]; cursor += 1; }
        const close = source.indexOf('%>', cursor);
        if (close < 0) { segments.push({ type: 'text', value: source.slice(open) }); break; }
        let code = source.slice(cursor, close);
        index = close + 2;
        if (code.endsWith('-') || code.endsWith('_')) { code = code.slice(0, -1); trimNext = true; }
        if (slurp) {
          const last = segments[segments.length - 1];
          if (last?.type === 'text') last.value = last.value.replace(/[ \t]*$/, '');
        }
        if (kind === '#') continue;
        if (kind === '=' || kind === '-') segments.push({ type: kind === '=' ? 'escaped' : 'raw', code });
        else segments.push({ type: 'code', code });
      }
      if (!segments.some((segment) => segment.type !== 'text')) { EJS_CACHE.set(source, null); return null; }
      const body = segments.map((segment) => {
        if (segment.type === 'text') return `__o += ${JSON.stringify(segment.value)};`;
        if (segment.type === 'escaped') return `__o += __esc((${segment.code}));`;
        if (segment.type === 'raw') return `__o += __raw((${segment.code}));`;
        return segment.code;
      }).join('\n');
      let fn = null;
      try {
        // eslint-disable-next-line no-new-func
        fn = new Function('__s', '__esc', '__raw', `var __o = '';\nwith (__s) {\n${body}\n}\nreturn __o;`);
      } catch { fn = null; }
      if (EJS_CACHE.size > 300) EJS_CACHE.clear();
      EJS_CACHE.set(source, fn);
      return fn;
    }

    function makeClientEjsScope(variables) {
      const store = variables && typeof variables === 'object' ? variables : {};
      const lookup = (name) => {
        const key = String(name ?? '');
        if (Object.prototype.hasOwnProperty.call(store, key)) return store[key];
        let value = getPath(store, key, undefined);
        if (value !== undefined) return value;
        if (store.stat_data && typeof store.stat_data === 'object') {
          value = getPath(store.stat_data, key, undefined);
          if (value !== undefined) return value;
        }
        return undefined;
      };
      return {
        getvar: (name, options = {}) => {
          const value = lookup(name);
          if (value !== undefined) return value;
          return Object.prototype.hasOwnProperty.call(options, 'defaults') ? options.defaults : undefined;
        },
        setvar: (name, value) => {
          const key = String(name ?? '');
          if (key.includes('.') && !Object.prototype.hasOwnProperty.call(store, key)) {
            try { setPath(store, key, value); return value; } catch { /* ignore */ }
          }
          store[key] = value;
          return value;
        },
        incvar: (name, delta = 1) => {
          const next = Number(lookup(name) || 0) + Number(delta || 0);
          store[String(name ?? '')] = next;
          return next;
        },
        decvar: (name, delta = 1) => {
          const next = Number(lookup(name) || 0) - Number(delta || 0);
          store[String(name ?? '')] = next;
          return next;
        },
        delvar: (name) => { delete store[String(name ?? '')]; return ''; },
        getwi: () => '',
        getchar: (name) => name || '',
        print: (...args) => args.map((value) => (value == null ? '' : String(value))).join(''),
        readState: () => {
          const stat = store.stat_data && typeof store.stat_data === 'object' ? store.stat_data : {};
          return { ...store, ...stat, stat_data: stat };
        },
        variables: store,
        _: { get: getPath, has: (object, path) => getPath(object, path, undefined) !== undefined, escape: escapeHtml },
      };
    }

    function renderEjsClient(text, variables) {
      const source = String(text ?? '');
      if (!source.includes('<%')) return source;
      const fn = compileClientEjs(source);
      if (!fn) return source;
      try {
        return fn(makeClientEjsScope(variables), (value) => escapeHtml(value), (value) => (value == null ? '' : String(value)));
      } catch {
        return source.replace(/<%[\s\S]*?%>/g, '').replace(/<%[\s\S]*$/, '');
      }
    }

    // ───────────────────────────── Markdown ─────────────────────────────
    /* __DSH_MESSAGE_DISPLAYS__ */

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

    function MessageFrame({ html, context, onCompose }) {
      const frameRef = useRef(null);
      const serializedContext = context ? JSON.stringify(context) : '';
      const srcDoc = useMemo(() => {
        const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)),
          (byte) => byte.toString(16).padStart(2, '0')).join('');
        return ttLib()['message-html'].buildMessageFrame(html, {
          nonce,
          context: serializedContext ? JSON.parse(serializedContext) : null,
          vendorSource: TAVERN_VENDOR_SRC,
        });
      }, [html, serializedContext]);

      useEffect(() => {
        const onFrameMessage = (event) => {
          const frame = frameRef.current;
          if (!frame || event.source !== frame.contentWindow) return;
          const data = event.data;
          if (data?.type === 'dsh-tt:compose' && context?.compose && typeof data.text === 'string') {
            const result = onCompose?.(data.text, data.send === true);
            if (Number.isSafeInteger(data.id)) {
              const reply = (ok) => frame.contentWindow?.postMessage({ type: 'dsh-tt:compose-result', id: data.id, ok }, '*');
              Promise.resolve(result).then((ok) => reply(ok === true), () => reply(false));
            }
          }
          if (data?.type === 'dsh-tt:message-height' && Number.isFinite(data.height)) {
            frame.style.height = `${Math.max(24, Math.min(1200, data.height))}px`;
          }
        };
        window.addEventListener('message', onFrameMessage);
        return () => window.removeEventListener('message', onFrameMessage);
      }, [context?.compose, onCompose]);

      return h('iframe', {
        ref: frameRef, className: 'tt-message-frame', sandbox: 'allow-scripts',
        title: '角色卡界面', referrerPolicy: 'no-referrer', loading: 'lazy', srcDoc,
        onLoad: () => frameRef.current?.contentWindow?.postMessage({ type: 'dsh-tt:measure-message' }, '*'),
      });
    }

    function renderMarkdown(message, keyBase, display) {
      const { text: source, slots } = message;
      if (!source) return null;
      const { splitMessageBlocks, assistantProse } = ttLib()['message-html'];
      const blocks = splitMessageBlocks(source);
      return blocks.flatMap((block, bi) => {
        const key = `${keyBase}-${bi}`;
        if (block.type === 'html' && display) {
          const context = display.greeting || display.literals.has(block.text) || slots.has(block.text) ? display.context : null;
          return h(MessageFrame, { key, html: block.text, context, onCompose: display.onCompose });
        }
        if (block.type !== 'text') return h('pre', { key }, h('code', null, block.text));
        const prose = message.assistant ? assistantProse(block.text) : block.text;
        return prose.trim().split(/\n{2,}/).filter(Boolean).map((paragraph, index) => {
          const paragraphKey = `${key}-${index}`;
          if (/^>\s?/.test(paragraph)) {
            return h('blockquote', { key: paragraphKey }, renderInline(paragraph.replace(/^>\s?/gm, ''), paragraphKey));
          }
          return h('p', { key: paragraphKey }, renderInline(paragraph, paragraphKey));
        });
      });
    }

    function displayMessage(text, rules, placement, depth, variables, templates) {
      const lib = ttLib();
      const markers = new Map();
      let prefix;
      const assistant = placement === 2;
      const source = assistant ? lib['message-html'].hideAssistantControlBlocks(text) : text;
      const output = lib.regex.applyRegexScripts(source, rules, placement, {
        depth,
        replaceRule(input, re, rule) {
          const template = templates.get(rule);
          const replacement = String(rule.replaceString ?? '');
          if (!template) return input.replace(re,
            assistant ? lib['message-html'].fenceDisplayFragment(replacement) : replacement);
          return input.replace(re, (match, capture) => {
            if (typeof capture !== 'string') return match;
            const safeHtml = expandDisplaySlot(template, capture, lib['card-assets-wasm'].cardAssetsWasm());
            if (safeHtml === null) return match;
            prefix ||= `\u0000DSH-TT:${crypto.randomUUID()}:`;
            const marker = prefix + markers.size + '\u0000';
            markers.set(marker, safeHtml);
            return '\n```html\n' + marker + '\n```\n';
          });
        },
      });
      let rendered = renderEjsClient(output, variables)
        .replace(/<StatusPlaceHolderImpl\s*\/>/gi, '')
        .replace(/<status_current_variable>[\s\S]*?<\/status_current_variable>/gi, '');
      const slots = new Set();
      for (const [marker, html] of markers) {
        if (!rendered.includes(marker)) continue;
        rendered = rendered.replace(marker, () => html);
        slots.add(html);
      }
      return { text: rendered, slots, assistant };
    }

    // ───────────────────────────── TH 宿主 ─────────────────────────────
    /* __DSH_GENERATION_TRANSPORT__ */

    function buildTavernSrcdoc(init) {
      const safeJson = JSON.stringify(init).replace(/</g, '\\u003c');
      const core = String(TAVERN_CORE_SRC).replace(/<\/script/gi, '<\\/script');
      const parser = TAVERN_PARSER_SRC.replace(/<\/script/gi, '<\\/script');
      const regex = TAVERN_REGEX_SRC.replace(/<\/script/gi, '<\\/script');
      const shimLiteral = JSON.stringify(String(TAVERN_SHIM_SRC)).replace(/</g, '\\u003c');
      return [
        '<!doctype html><html><head><meta charset="utf-8">',
        '<style>:root{color-scheme:light dark}html,body{margin:0;padding:0;background:Canvas;color:CanvasText;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
        '#tt-fallback{padding:24px;font-size:12px;color:#888;}',
        '.TH-toastr{}</style></head><body>',
        '<div id="chat"></div><div id="extensions_settings"></div><div id="tt-fallback">TH 脚本界面</div>',
        `<script>window.__TT_INIT__ = ${safeJson};<\/script>`,
        `<script>${core}<\/script>`,
        `<script>${parser}<\/script>`,
        `<script>(function () { ${regex}\nwindow.__TT_REGEX__ = TT_LIB.regex; })();<\/script>`,
        ttLib()['message-html'].vendorScript(TAVERN_VENDOR_SRC),
        `<script type="module">import('data:text/javascript;base64,${TAVERN_ZOD_SRC}').then(function(zod){ window.z = zod; window.__TT_IMPORT_MODULE__ = url => import(url); var script = document.createElement('script'); script.textContent = ${shimLiteral}; document.body.appendChild(script); }).catch(function(error){ window.parent.postMessage({__ttChild:true,tt:'log',level:'error',text:'酒馆助手 Zod 4 加载失败：' + String(error)}, '*'); });<\/script>`,
        '</body></html>',
      ].join('\n');
    }

    /**
     * 创建卡内脚本的 iframe 宿主。
     * 隔离策略：sandbox 允许脚本与同源（TH 的 registerScriptPreference 依赖 window.parent，
     * 与 JS-Slash-Runner 的 iframe 行为一致），但通过 RPC 只暴露只读数据与显式回写通道。
     */
    function createTavernHost(options) {
      const {
        container, init, onLog, onVars, onMessage, onChatUpdated, onChatReload,
        onToast, onPopup, onSettings, onUserMessage, onSystemMessage, onTrigger,
        onSave, onRefresh, onReady, onGenerate, onScriptButtons,
      } = options;
      let disposed = false;
      const generations = new Map();
      const promptWaits = new Map();
      let promptSequence = 0;
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals');
      frame.setAttribute('title', '酒馆助手脚本宿主');
      frame.style.cssText = 'width:100%;height:100%;border:0;display:block;background:var(--tt-surface);';
      frame.srcdoc = buildTavernSrcdoc(init);
      container.appendChild(frame);

      const emitLog = (level, text) => { try { onLog(level, text); } catch { /* ignore */ } };

      function generate(data) {
        if (typeof data.id !== 'string' || generations.has(data.id)) return;
        const controller = new AbortController();
        generations.set(data.id, controller);
        const send = (result) => {
          if (disposed || controller.signal.aborted) return;
          frame.contentWindow.postMessage({ __ttParent: true, type: 'generation-frame', id: data.id, frame: result }, '*');
        };
        Promise.resolve().then(() => onGenerate(data, controller.signal, send))
          .catch((error) => send({ type: 'error', message: error?.message || String(error) }))
          .finally(() => {
            if (generations.get(data.id) === controller) generations.delete(data.id);
          });
      }

      function onMessageFromChild(event) {
        if (disposed || event.source !== frame.contentWindow) return;
        const data = event.data;
        if (!data || data.__ttChild !== true) return;
        try {
          switch (data.tt) {
            case 'boot': emitLog('info', `TH 宿主启动：${data.charName || ''}，${data.scriptCount || 0} 个脚本`); break;
            case 'ready': onReady && onReady(data); emitLog('info', `TH 宿主就绪（${data.scripts?.length || 0} 个脚本${data.module ? '，含 module' : ''}${data.errors ? '，错误 ' + data.errors + ' 个' : ''}）`); break;
            case 'log': emitLog(data.level || 'info', data.text); break;
            case 'script-buttons': onScriptButtons?.(data.scripts || []); break;
            case 'vars': onVars && onVars(data); break;
            case 'message': onMessage && onMessage(data); break;
            case 'chat-updated': onChatUpdated && onChatUpdated(data.indices || []); break;
            case 'chat-reload': onChatReload && onChatReload(); break;
            case 'toast': onToast && onToast(data); break;
            case 'popup': onPopup && onPopup(data); break;
            case 'settings': onSettings && onSettings(data.value || {}); break;
            case 'user-message': onUserMessage && onUserMessage(data.text || ''); break;
            case 'system-message': onSystemMessage && onSystemMessage(data.text || ''); break;
            case 'generate': generate(data); break;
            case 'generate-stop':
              generations.get(data.id)?.abort();
              generations.delete(data.id);
              break;
            case 'prompt-injections': promptWaits.get(data.id)?.(Array.isArray(data.items) ? data.items : []); break;
            case 'trigger': onTrigger && onTrigger(); break;
            case 'save': onSave && onSave(); break;
            case 'refresh': onRefresh && onRefresh(data.index); break;
            default: break;
          }
        } catch (error) {
          emitLog('error', '宿主消息处理失败：' + (error && error.message ? error.message : error));
        }
      }

      window.addEventListener('message', onMessageFromChild);

      return {
        collectPrompts() {
          if (disposed) return Promise.resolve([]);
          return new Promise((resolve) => {
            const id = ++promptSequence;
            const settle = (items) => {
              clearTimeout(timer);
              promptWaits.delete(id);
              resolve(items);
            };
            const timer = setTimeout(() => {
              emitLog('warn', '生成前脚本回调等待超时');
              settle([]);
            }, 2500);
            promptWaits.set(id, settle);
            frame.contentWindow.postMessage({ __ttParent: true, type: 'collect-prompts', id }, '*');
          });
        },
        updateChat(messages, options = {}) {
          if (disposed) return;
          try { frame.contentWindow.postMessage({ __ttParent: true, type: 'chat', messages, emitAdded: options.emitAdded !== false }, '*'); }
          catch (error) { emitLog('error', '更新聊天失败：' + (error && error.message ? error.message : error)); }
        },
        emit(event, args) {
          if (disposed) return;
          try { frame.contentWindow.postMessage({ __ttParent: true, type: 'emit', event, args: args || [] }, '*'); }
          catch { /* ignore */ }
        },
        clickScriptButton(id, name) {
          if (disposed) return;
          frame.contentWindow.postMessage({ __ttParent: true, type: 'script-button', id, name }, '*');
        },
        updateSettings(value) {
          if (disposed) return;
          try { frame.contentWindow.postMessage({ __ttParent: true, type: 'settings', value }, '*'); } catch { /* ignore */ }
        },
        popupResult(id, result) {
          if (disposed) return;
          try { frame.contentWindow.postMessage({ __ttParent: true, type: 'popup-result', id, result }, '*'); } catch { /* ignore */ }
        },
        dispose() {
          if (disposed) return;
          disposed = true;
          for (const controller of generations.values()) controller.abort();
          generations.clear();
          for (const settle of promptWaits.values()) settle([]);
          window.removeEventListener('message', onMessageFromChild);
          try { frame.remove(); } catch { /* ignore */ }
        },
      };
    }

    // ───────────────────────────── 主面板 ─────────────────────────────
    function Panel(props) {
      const ctxRef = useRef(props && props.__ctx ? props.__ctx : null);
      const [store, setStore] = useState(loadStore);
      // __initialView 只给冒烟测试用（默认 chat）。
      const [view, setView] = useState(props && props.__initialView ? props.__initialView : 'chat');
      const [sessions, setSessions] = useState([]);
      const [activeId, setActiveId] = useState(null);
      const [floors, setFloors] = useState([]);
      const [liveReply, setLiveReply] = useState(null);
      const [generating, setGenerating] = useState(false);
      const [draft, setDraft] = useState('');
      const [busy, setBusy] = useState(false);
      const [notice, setNotice] = useState('');
      const [models, setModels] = useState([]);
      const [diag, setDiag] = useState([]);
      const [thState, setThState] = useState(loadTh);
      const [thTick, setThTick] = useState(0);
      const [assetTick, setAssetTick] = useState(0);
      const [toasts, setToasts] = useState([]);
      const [modal, setModal] = useState(null);
      const [greetingPick, setGreetingPick] = useState(null);
      const [thReady, setThReady] = useState(false);
      const [thShow, setThShow] = useState(false);
      const [thReload, setThReload] = useState(0);
      const [thButtons, setThButtons] = useState([]);
      const [loreBookId, setLoreBookId] = useState('card');
      const [loreSearch, setLoreSearch] = useState('');
      const [loreOpen, setLoreOpen] = useState(null);
      const [promptSearch, setPromptSearch] = useState('');
      const [promptOpen, setPromptOpen] = useState(null);
      const [varOpen, setVarOpen] = useState(false);
      const [previewSearch, setPreviewSearch] = useState('');
      const [previewCopyHint, setPreviewCopyHint] = useState('');
      const [selfTest, setSelfTest] = useState(null);
      const [drawerOpen, setDrawerOpen] = useState(false);
      const [scrolledAway, setScrolledAway] = useState(false);
      const [sending, setSending] = useState(false);
      const [clearVarsConfirm, setClearVarsConfirm] = useState(null);
      const [sessionGroups, setSessionGroups] = useState({ archived: [], pinned: [], ready: false });
      const [sessionSearch, setSessionSearch] = useState('');
      const [archiveView, setArchiveView] = useState(false);
      const [sessionSelection, setSessionSelection] = useState(null);
      const [sessionMenu, setSessionMenu] = useState(null);
      const [sessionDialog, setSessionDialog] = useState(null);
      const [sessionActionBusy, setSessionActionBusy] = useState(false);

      const rootRef = useRef(null);
      const chatRef = useRef(null);
      const scrollRef = useRef(null);
      const threadRef = useRef(null);
      const followLatestRef = useRef(true);
      const draftRef = useRef(draft);
      const sessionDrafts = useRef(new Map());
      const sendingRef = useRef(false);
      const importCardRef = useRef(null);
      const importPresetRef = useRef(null);
      const importLoreRef = useRef(null);
      const thFrameRef = useRef(null);
      const thHostRef = useRef(null);
      const thSentRef = useRef(false);
      const assetCacheRef = useRef(new Map());
      const activeIdRef = useRef(null);
      const sessionsRef = useRef([]);
      const thStateRef = useRef(thState);
      const toastIdRef = useRef(0);
      const saveTimerRef = useRef(null);
      const bindingRef = useRef(null);
      const openingChangeRef = useRef(null);
      const sessionActionRef = useRef(false);

      const compact = useCompactPanel(rootRef);
      draftRef.current = draft;

      useEffect(() => {
        if (!compact) setDrawerOpen(false);
      }, [compact]);

      const log = useCallback((line) => {
        setDiag((prev) => [...prev.slice(-79), `${new Date().toLocaleTimeString()}  ${line}`]);
      }, []);

      const bridge = useMemo(() => (ctxRef.current ? makeBridge(ctxRef.current, log) : null), [log]);
      const canManageSessions = bridge?.canManageSessions;

      useEffect(() => bridge?.subscribeSessionGroups(setSessionGroups), [bridge]);

      const updateTh = useCallback((mutator) => {
        setThState((prev) => {
          const next = mutator(prev) || prev;
          thStateRef.current = next;
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => saveTh(thStateRef.current), 500);
          return next;
        });
        setThTick((tick) => tick + 1);
      }, []);

      const patchStore = useCallback((patch) => {
        setStore((prev) => {
          const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
          saveStore(next);
          return next;
        });
      }, []);

      const pushToast = useCallback((level, message, title) => {
        const id = ++toastIdRef.current;
        setToasts((prev) => [...prev.slice(-4), { id, level: level || 'info', message: String(message ?? ''), title: title ? String(title) : '' }]);
        setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 4200);
      }, []);

      // refs
      useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
      useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
      useEffect(() => { thStateRef.current = thState; }, [thState]);

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
          })).filter((row) => row.id);
          normalized.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
          setSessions(normalized);
        } catch (error) {
          log(`会话列表读取失败：${error?.code || error?.message || error}`);
        }
      }, [bridge, log]);

      useEffect(() => { refreshSessions(); }, [refreshSessions]);

      useEffect(() => {
        if (!bridge) return;
        bridge.models().then((list) => setModels(Array.isArray(list) ? list.slice(0, 40) : []));
      }, [bridge]);

      // DSH 的会话对象负责重连、重试及增量结算。旧宿主继续走历史查询。
      useEffect(() => {
        if (!activeId || !bridge?.ok) return;
        const { toChatFloors, liveAssistantReply } = ttLib()['chat-wire'];
        const isCurrent = () => !disposed && activeIdRef.current === activeId;
        let disposed = false;
        let frame = null;
        let fallbackTimer;
        let reference;
        let session;
        let stopEvents;
        let stopSession;
        let history = [];
        let durable = [];
        let latestEntries;

        const publishFloors = () => {
          const recent = toChatFloors(durable);
          const start = recent[0]?.seq;
          const end = recent.at(-1)?.seq;
          setFloors(start == null ? history : [...history.filter((floor) => floor.seq < start), ...recent,
            ...history.filter((floor) => floor.seq > end)].slice(-300));
          setLiveReply((reply) => reply && history.some((floor) => floor.replyKey === reply.key) ? null : reply);
        };
        const readHistory = async () => {
          try {
            const records = await bridge.events(activeId);
            if (!isCurrent()) return;
            history = toChatFloors(records);
            publishFloors();
          } catch { /* The live connection can still deliver its own history. */ }
          if (isCurrent()) fallbackTimer = setTimeout(checkHistory, 1200);
        };
        function checkHistory() {
          if (!isCurrent()) return;
          if (session?.getSnapshot().openState === 'open') fallbackTimer = setTimeout(checkHistory, 1200);
          else readHistory();
        }
        try {
          reference = bridge.retainSession(activeId);
          if (reference) {
            const { eventSource, session: boundSession } = reference.binding;
            session = boundSession;
            const update = () => {
              if (!isCurrent() || frame != null) return;
              frame = requestAnimationFrame(() => {
                frame = null;
                if (!isCurrent()) return;
                setGenerating(Boolean(session.getSnapshot().running));
                const entries = eventSource.getSnapshot().entries;
                if (entries === latestEntries) return;
                latestEntries = entries;
                const next = entries.filter(({ event }) => event?.type === 'user/message' || event?.type === 'assistant/message');
                if (next.length !== durable.length || next.some((entry, index) => entry !== durable[index])) {
                  durable = next;
                  publishFloors();
                }
                const reply = liveAssistantReply(entries);
                setLiveReply(reply && !history.some((floor) => floor.replyKey === reply.key) ? reply : null);
              });
            };
            reference.ready.catch(() => { /* Recovery belongs to the DSH session service. */ });
            stopEvents = eventSource.subscribe(update);
            stopSession = session.subscribe(update);
            update();
          }
        } catch (error) {
          stopEvents?.();
          stopSession?.();
          reference?.release();
          reference = session = stopEvents = stopSession = undefined;
          log('实时会话连接失败：' + (error?.message || error));
        }
        readHistory();
        return () => {
          disposed = true;
          clearTimeout(fallbackTimer);
          if (frame != null) cancelAnimationFrame(frame);
          stopEvents?.();
          stopSession?.();
          reference?.release();
        };
      }, [activeId, bridge, log]);

      const scrollToLatest = useCallback(() => {
        followLatestRef.current = true;
        setScrolledAway(false);
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }, []);

      useLayoutEffect(() => {
        if (view === 'chat') scrollToLatest();
      }, [activeId, view, scrollToLatest]);

      useLayoutEffect(() => {
        if (followLatestRef.current && scrollRef.current) scrollToLatest();
      }, [floors.length, scrollToLatest]);

      useEffect(() => {
        if (view !== 'chat' || !threadRef.current) return;
        const observer = new ResizeObserver(() => {
          if (followLatestRef.current && scrollRef.current) scrollToLatest();
        });
        observer.observe(threadRef.current);
        return () => observer.disconnect();
      }, [view, scrollToLatest]);

      const trackScroll = useCallback((event) => {
        const el = event.currentTarget;
        const nearEnd = el.scrollHeight - el.clientHeight - el.scrollTop < 72;
        followLatestRef.current = nearEnd;
        setScrolledAway(!nearEnd);
      }, []);

      // ── 资产加载 ───────────────────────────────────────────────
      const readScopeSession = useCallback(() => {
        return activeIdRef.current || sessionsRef.current[0]?.id || null;
      }, []);

      const loadAsset = useCallback(async (item, kind, sessionId = readScopeSession()) => {
        if (!item) return null;
        const key = `${kind}:${item.id}`;
        if (assetCacheRef.current.has(key)) return assetCacheRef.current.get(key);
        let data = item.raw || null;
        if (!data && item.filePath && bridge?.hasFiles) {
          if (sessionId) {
            try {
              const bytes = await bridge.readBytes(sessionId, item.filePath);
              data = /\.png$/i.test(item.filePath) ? parseCardPng(bytes) : parseJsonText(decodeUtf8(bytes));
            } catch (error) {
              log(`读取资产失败 ${item.filePath}：${error?.code || error?.message || error}`);
              data = null;
            }
          }
        }
        if (data) assetCacheRef.current.set(key, data);
        return data;
      }, [bridge, readScopeSession, log]);

      const ensureCard = useCallback(async (card, sessionId) => {
        const data = await loadAsset(card, 'card', sessionId);
        if (data) setAssetTick((tick) => tick + 1);
        return data;
      }, [loadAsset]);

      const ensurePreset = useCallback(async (preset) => {
        const data = await loadAsset(preset, 'preset');
        if (data) setAssetTick((tick) => tick + 1);
        return data;
      }, [loadAsset]);

      const ensureLorebook = useCallback(async (book) => {
        const data = await loadAsset(book, 'lore');
        if (data) setAssetTick((tick) => tick + 1);
        return data;
      }, [loadAsset]);

      const activeCard = store.cards.find((card) => card.id === store.activeCardId) || null;
      const activePreset = store.presets.find((preset) => preset.id === store.activePresetId) || null;
      const activeSession = sessions.find((session) => session.id === activeId) || null;

      const activeCardRaw = useMemo(() => {
        if (!activeCard) return null;
        return assetCacheRef.current.get(`card:${activeCard.id}`) || activeCard.raw || null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [activeCard, assetTick]);

      const activePresetRaw = useMemo(() => {
        if (!activePreset) return null;
        return assetCacheRef.current.get(`preset:${activePreset.id}`) || activePreset.raw || null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [activePreset, assetTick]);
      const displayRules = useMemo(() => ttLib().regex.collectRegexRules(activeCardRaw, activePresetRaw),
        [activeCardRaw, activePresetRaw]);
      const alternateOpenings = useMemo(() => greetingOptionsOf(activeCardRaw).filter(({ id }) => id !== 'first'),
        [activeCardRaw]);

      useEffect(() => {
        if (activeCard && !assetCacheRef.current.has(`card:${activeCard.id}`)) ensureCard(activeCard);
      }, [activeCard, ensureCard, sessions.length]);

      useEffect(() => {
        if (activePreset && !assetCacheRef.current.has(`preset:${activePreset.id}`)) ensurePreset(activePreset);
      }, [activePreset, ensurePreset, sessions.length]);

      // ── 会话元数据 ─────────────────────────────────────────────
      const sessionMeta = activeId ? (store.sessionMeta[activeId] || null) : null;
      const greeting = sessionMeta?.greeting || '';
      const isRoleplaySession = Boolean(sessionMeta) || Boolean(activeSession?.title?.startsWith(RP_PREFIX));
      const chatWorldbook = store.lorebooks.find((book) => book.id === sessionMeta?.lorebookId);
      const chatWorldbookRaw = useMemo(() => chatWorldbook
        ? assetCacheRef.current.get(`lore:${chatWorldbook.id}`) || chatWorldbook.raw || null
        : null, [chatWorldbook, assetTick]);
      useEffect(() => {
        if (chatWorldbook && !chatWorldbookRaw) ensureLorebook(chatWorldbook);
      }, [activeId, chatWorldbook, chatWorldbookRaw, ensureLorebook]);
      const selectChatWorldbook = useCallback((lorebookId) => {
        if (!activeId || !isRoleplaySession) return;
        patchStore((prev) => ({
          sessionMeta: {
            ...prev.sessionMeta,
            [activeId]: { cardId: activeCard?.id, presetId: activePreset?.id, ...prev.sessionMeta[activeId], lorebookId },
          },
        }));
      }, [activeId, activeCard?.id, activePreset?.id, isRoleplaySession, patchStore]);
      const presetSessionId = isRoleplaySession ? activeId : null;
      const selectPreset = useCallback((presetId) => {
        patchStore((prev) => presetSelection(prev, presetId, presetSessionId, activeCard?.id));
      }, [activeCard?.id, patchStore, presetSessionId]);

      const inferMetaFromTitle = useCallback((title) => {
        if (!title || !title.startsWith(RP_PREFIX)) return null;
        const rest = title.slice(RP_PREFIX.length);
        const card = store.cards.find((item) => rest.startsWith(item.name));
        return card ? { cardId: card.id, presetId: store.activePresetId } : null;
      }, [store.cards, store.activePresetId]);

      const switchConversation = useCallback((id) => {
        const previousId = activeIdRef.current;
        if (previousId !== id) {
          if (previousId && draftRef.current) sessionDrafts.current.set(previousId, draftRef.current);
          else if (previousId) sessionDrafts.current.delete(previousId);
          const next = sessionDrafts.current.get(id) || '';
          draftRef.current = next;
          setDraft(next);
          setFloors([]);
          setLiveReply(null);
          setGenerating(false);
          setNotice('');
        }
        activeIdRef.current = id;
        setActiveId(id);
      }, []);

      const selectSession = useCallback((session) => {
        setDrawerOpen(false);
        setSessionMenu(null);
        switchConversation(session.id);
        setView('chat');
        const meta = store.sessionMeta[session.id] || inferMetaFromTitle(session.title);
        if (meta?.cardId && store.cards.some((card) => card.id === meta.cardId)) {
          patchStore({ activeCardId: meta.cardId });
        }
        if (meta && Object.hasOwn(meta, 'presetId') &&
            (meta.presetId == null || store.presets.some((preset) => preset.id === meta.presetId))) {
          patchStore({ activePresetId: meta.presetId });
        }
        if (meta && !store.sessionMeta[session.id]) {
          patchStore({ sessionMeta: { ...store.sessionMeta, [session.id]: meta } });
        }
      }, [store.sessionMeta, store.cards, store.presets, inferMetaFromTitle, patchStore, switchConversation]);

      useEffect(() => {
        if (sessionActionBusy || (canManageSessions && !sessionGroups.ready)) return;
        const active = activeIdRef.current;
        if (active && !sessionGroups.archived.includes(active)) return;
        const latest = sessions.find((session) => !sessionGroups.archived.includes(session.id) && session.title.startsWith(RP_PREFIX));
        if (latest) selectSession(latest);
        else if (active) switchConversation(null);
      }, [sessions, sessionGroups, canManageSessions, sessionActionBusy, selectSession, switchConversation]);

      /** 新局默认使用角色卡的首条消息。 */
      const openChat = useCallback(async (card, greetingText) => {
        if (!card) return;
        if (!bridge?.ok) { setNotice('会话通道不可用：请重启应用后重试'); return; }
        setNotice('');
        patchStore({ activeCardId: card.id });
        const stamp = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        const title = RP_PREFIX + card.name + ' · ' + stamp;
        setBusy(true);
        try {
          const created = await bridge.create('roleplay');
          const id = created?.sessionId ?? created?.id ?? created?.address?.sessionId ?? null;
          if (!id) { log('已创建会话但没拿到 id：' + JSON.stringify(created).slice(0, 240)); return; }
          const greeting = greetingText ?? greetingOptionsOf(await ensureCard(card, id))[0]?.text ?? '';
          switchConversation(id);
          if (created?.sessionId) await bridge.rename(id, title).catch(() => {});
          setView('chat');
          setDrawerOpen(false);
          thSentRef.current = false;
          patchStore((prev) => ({
            activeCardId: card.id,
            sessionMeta: {
              ...prev.sessionMeta,
              [id]: { cardId: card.id, presetId: prev.activePresetId, greeting },
            },
          }));
          log(greeting ? `已新建会话，开场白 ${greeting.length} 字（只显示，不发送）` : '已新建会话（这张卡没有开场白）');
          await refreshSessions();
        } catch (error) {
          const message = '开局失败：' + (error && (error.code || error.message) || error);
          log(message);
          setNotice(message);
        } finally { setBusy(false); }
      }, [bridge, ensureCard, patchStore, refreshSessions, log, switchConversation]);

      const navigate = useCallback((nextView) => {
        setView(nextView);
        setDrawerOpen(false);
      }, []);
      const newChat = useCallback(() => activeCard ? openChat(activeCard) : navigate('cards'), [openChat, activeCard, navigate]);

      const canChooseOpening = bridge?.ok && activeId && sessionMeta?.cardId === activeCard?.id
        && alternateOpenings.length > 0 && !floors.length;

      const chooseOpening = async (pick, option) => {
        setGreetingPick(null);
        if (!pick.sessionId) return openChat(pick.card, option.text);
        const id = pick.sessionId;
        if (!canChooseOpening || busy || openingChangeRef.current || activeIdRef.current !== id || option.text === greeting) return;
        openingChangeRef.current = id;
        setBusy(true);
        try {
          const records = await bridge.events(id);
          if (activeIdRef.current !== id) return;
          const started = records.some((record) => ['user/message', 'assistant/message', 'turn/start']
            .includes((record?.type === 'event' ? record.event : record)?.type));
          if (started) {
            setNotice('这局已经开始对话。可在「角色」页从备选开场新建一局。');
            return;
          }
          const saved = thStateRef.current;
          if (Object.hasOwn(saved.messages?.[id] || {}, 0) || Object.hasOwn(saved.overrides?.[id] || {}, 0)) {
            updateTh((prev) => {
              const messages = { ...prev.messages?.[id] };
              const overrides = { ...prev.overrides?.[id] };
              delete messages[0];
              delete overrides[0];
              return { ...prev, messages: { ...prev.messages, [id]: messages }, overrides: { ...prev.overrides, [id]: overrides } };
            });
          }
          patchStore((prev) => ({ sessionMeta: {
            ...prev.sessionMeta, [id]: { ...prev.sessionMeta[id], greeting: option.text },
          } }));
          setNotice('');
          log(`已进入剧情开场「${option.label}」`);
        } catch (error) {
          setNotice('无法切换开场：' + (error?.message || error));
        } finally {
          openingChangeRef.current = null;
          setBusy(false);
        }
      };

      // ── TH 宿主生命周期 ────────────────────────────────────────
      const configuredScripts = useMemo(() => [
        ...assetTavernScripts(activeCardRaw).map((script) => ({ script, assetKey: activeCard.id, source: '角色卡' })),
        ...assetTavernScripts(activePresetRaw).map((script) => ({ script, assetKey: 'preset:' + activePreset.id, source: '预设' })),
      ], [activeCardRaw, activeCard, activePresetRaw, activePreset]);
      const scriptEnabled = useCallback(({ assetKey, script }) => {
        const override = store.scriptOverrides?.[assetKey]?.[script.id];
        if (override === undefined) return script.enabled !== false;
        return override;
      }, [store.scriptOverrides]);

      const enabledScripts = useMemo(() => {
        const seen = new Set();
        return configuredScripts.filter((entry) => {
          if (!scriptEnabled(entry) || seen.has(entry.script.id)) return false;
          seen.add(entry.script.id);
          return true;
        });
      }, [configuredScripts, scriptEnabled]);
      const scriptSignature = enabledScripts.map(({ assetKey, script }) => `${assetKey}:${script.id}`).join(',');

      const hostKey = [
        activeId || '',
        activeCard?.id || '',
        activeCardRaw ? 'raw' : 'noraw',
        activePreset?.id || '',
        activePresetRaw ? 'preset-raw' : 'preset-loading',
        chatWorldbook?.id || '',
        chatWorldbookRaw ? 'book-raw' : '',
        hashString(greeting),
        isRoleplaySession ? 'rp' : 'plain',
        scriptSignature,
        thReload,
      ].join('|');

      useEffect(() => {
        setThButtons([]);
        const container = thFrameRef.current;
        if (!container || !bridge?.ok || !activeId || !isRoleplaySession || !activeCard || !activeCardRaw) {
          setThReady(false);
          return undefined;
        }
        const scripts = enabledScripts.map(({ script }) => script);
        if (!scripts.length) { setThReady(false); return undefined; }

        const inner = innerOf(activeCardRaw);
        const cardForIframe = {
          spec: activeCardRaw.spec || 'chara_card_v2',
          data: {
            name: inner.name || activeCard.name,
            description: inner.description || '',
            personality: inner.personality || '',
            scenario: inner.scenario || '',
            first_mes: inner.first_mes || inner.firstMes || '',
            mes_example: inner.mes_example || inner.mesExample || '',
            system_prompt: inner.system_prompt || inner.systemPrompt || '',
            post_history_instructions: inner.post_history_instructions || inner.postHistoryInstructions || '',
            alternate_greetings: inner.alternate_greetings || inner.alternateGreetings || [],
            creator: inner.creator || '',
            character_version: inner.character_version || inner.characterVersion || '',
            tags: inner.tags || [],
            character_book: cardBook(activeCardRaw),
            extensions: sanitizeExtensions(inner.extensions || {}),
          },
        };
        const entries = bookEntries(cardBook(activeCardRaw));
        const thSession = thStateRef.current;
        const chatMessages = buildTavernChat(greeting, floors, thSession.messages?.[activeId] || {}, thSession.overrides?.[activeId] || {});
        const init = {
          card: cardForIframe,
          userName: '你',
          charName: inner.name || activeCard.name,
          chatId: 'dsh-' + activeId,
          worldbookName: cardBook(activeCardRaw)?.name || (inner.extensions?.world) || '角色世界书',
          worldbookEntries: entries,
          chatWorldbook: chatWorldbookRaw ? { name: chatWorldbook.name, entries: bookEntries(chatWorldbookRaw) } : null,
          messages: chatMessages,
          variables: {
            global: thSession.global || {},
            character: thSession.characters?.[activeCard.id] || {},
            chat: thSession.chats?.[activeId] || {},
            preset: thSession.presets?.[activePreset?.id] || {},
            script: thSession.scripts || {},
          },
          extensionSettings: thSession.settings?.[activeCard.id] || {},
          scripts: scripts.map((script) => ({
            id: script.id,
            name: script.name,
            content: String(script.content || ''),
            enabled: true,
            buttons: Array.isArray(script.button?.buttons) ? script.button.buttons : [],
          })),
          regexScripts: displayRules,
          presetName: activePresetRaw?.name || activePreset?.name || '',
        };

        thSentRef.current = false;
        const host = createTavernHost({
          container,
          init,
          onLog: (level, text) => {
            log(`[TH/${level}] ${text}`);
            if (level === 'error') pushToast('error', text, '酒馆助手');
          },
          onVars: (data) => {
            updateTh((prev) => {
              const next = { ...prev, messages: { ...(prev.messages || {}) }, chats: { ...(prev.chats || {}) } };
              if (data.scope === 'global') next.global = data.value || {};
              else if (data.scope === 'character') next.characters = { ...(next.characters || {}), [activeCard.id]: data.value || {} };
              else if (data.scope === 'chat') next.chats[activeId] = data.value || {};
              else if (data.scope === 'preset') next.presets = { ...(next.presets || {}), [activePreset?.id || 'default']: data.value || {} };
              else if (data.scope === 'script') next.scripts = { ...(next.scripts || {}), [data.scriptId || 'default']: data.value || {} };
              else if (data.scope === 'message') {
                const index = Number(data.messageId);
                if (Number.isFinite(index)) {
                  next.messages[activeId] = { ...(next.messages[activeId] || {}), [index]: data.value || {} };
                }
              } else if (data.scope === 'extension') {
                next.extensions = { ...(next.extensions || {}) };
                const cardExt = { ...(next.extensions[activeCard.id] || {}) };
                cardExt[data.extensionId || 'tavern_helper'] = data.value || {};
                next.extensions[activeCard.id] = cardExt;
              }
              return next;
            });
          },
          onMessage: (data) => {
            const index = Number(data.index);
            if (!Number.isFinite(index)) return;
            updateTh((prev) => {
              const next = { ...prev, messages: { ...(prev.messages || {}) }, overrides: { ...(prev.overrides || {}) } };
              next.messages[activeId] = { ...(next.messages[activeId] || {}), [index]: data.vars || {} };
              if (data.edited && typeof data.text === 'string') {
                next.overrides[activeId] = { ...(next.overrides[activeId] || {}), [index]: data.text };
              }
              return next;
            });
          },
          onChatReload: () => { refreshSessions(); },
          onChatUpdated: () => {},
          onToast: (data) => pushToast(data.level, data.message, data.title),
          onPopup: (data) => setModal({ ...data, resolve: (result) => setModal(null) }),
          onSettings: (value) => {
            updateTh((prev) => ({ ...prev, settings: { ...(prev.settings || {}), [activeCard.id]: value || {} } }));
          },
          onUserMessage: (text) => {
            if (!text || activeIdRef.current !== activeId || openingChangeRef.current === activeId) return;
            Promise.resolve(bindingRef.current?.(activeId, true))
              .then((binding) => {
                if (activeIdRef.current === activeId && openingChangeRef.current !== activeId) return bridge.prompt(activeId, text, binding);
              })
              .catch((error) => log('脚本发送失败：' + (error?.message || error)));
          },
          onSystemMessage: (text) => log('[TH/sys] ' + text),
          onGenerate: async (data, signal, sendFrame) => {
            if (activeIdRef.current !== activeId) throw new Error('生成会话已经切换');
            const lib = ttLib();
            const card = lib.card.normalizeCard(activeCardRaw);
            const options = { ...data.options };
            if (options.preset_name && !['in_use', init.presetName].includes(options.preset_name)) {
              throw new Error('辅助生成可使用本局选中的预设');
            }
            const builtins = {
              char_description: card.description, char_personality: card.personality,
              scenario: card.scenario, dialogue_examples: card.mesExample,
            };
            const usesWorldbook = !Array.isArray(options.ordered_prompts) || options.ordered_prompts.some(
              (item) => item === 'world_info_before' || item === 'world_info_after');
            const injections = Array.isArray(data.injections) ? data.injections : [];
            let depth;
            if (data.mode === 'generate' || usesWorldbook) {
              const binding = await bindingRef.current(activeId);
              signal.throwIfAborted();
              const preset = data.mode === 'generate'
                ? lib.prompt.applyPresetOverrides(lib.prompt.parsePreset(binding.presetJson), binding.presetOverrides)
                : null;
              const result = lib.pipeline.runPromptPipeline({ card, preset, variables: binding.variables,
                chatMessages: [...data.history.map((message) => message.content), options.user_input || ''],
                chatWorldbook: chatWorldbookRaw, scriptPrompts: injections,
                maxContext: PREVIEW_MAX_CONTEXT, worldInfoBudget: PREVIEW_WI_BUDGET });
              builtins.world_info_before = result.lorebook.buckets.before.join('\n');
              builtins.world_info_after = result.lorebook.buckets.after.join('\n');
              depth = [...result.rendered.depth, ...result.rendered.injected];
              if (data.mode === 'generate') options.ordered_prompts = [
                { role: 'system', content: result.rendered.system }, 'chat_history',
                { role: 'system', content: result.rendered.tail },
              ];
            } else if (injections.length) depth = lib['card-assets-wasm'].cardAssetsWasm().partitionPromptInjections(injections)?.depth;
            await forwardAuxiliaryGeneration({ sessionId: activeId, options, history: data.history, builtins, depth }, signal, sendFrame);
          },
          onTrigger: () => log('[TH] trigger 请求（DSH 侧未接通生成触发）'),
          onSave: () => log('[TH] saveChat 请求（会话由 DSH 管理，无需保存）'),
          onRefresh: () => {},
          onReady: () => setThReady(true),
          onScriptButtons: setThButtons,
        });
        thHostRef.current = host;
        log(`TH 宿主已创建：${scripts.length} 个脚本（${scripts.map((s) => s.name || s.id).join('、')}）`);
        return () => {
          host.dispose();
          thHostRef.current = null;
          thSentRef.current = false;
          setThReady(false);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [hostKey]);

      // 变量快照/会话 id 变化时不需要重建宿主，但要更新 ref
      useEffect(() => {
        if (thReady) log('TH 宿主就绪，脚本变量将随消息更新。');
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [thReady]);

      const buildTavernChat = useCallback((greetingText, floorList, messageVars, overrides) => {
        const list = [];
        if (greetingText) {
          list.push({ role: 'assistant', text: greetingText, vars: messageVars[0] || {} });
        }
        const offset = greetingText ? 1 : 0;
        floorList.forEach((floor, index) => {
          const varIndex = index + offset;
          const text = overrides[varIndex] || floor.text;
          list.push({ role: floor.role, text, vars: messageVars[varIndex] || {} });
        });
        return list;
      }, []);

      const ttChat = useMemo(() => {
        const vars = thState.messages?.[activeId] || {};
        const overrides = thState.overrides?.[activeId] || {};
        return buildTavernChat(greeting, floors, vars, overrides);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [greeting, floors, activeId, thState.messages, thState.overrides, thTick, buildTavernChat]);

      const ttChatSignature = useMemo(() => ttChat.map((message) => message.role + ':' + hashString(message.text)).join('|') + '|' + hashString(greeting), [ttChat, greeting]);

      useEffect(() => {
        const host = thHostRef.current;
        if (!host || !thReady) return;
        const emitAdded = thSentRef.current;
        host.updateChat(ttChat, { emitAdded });
        thSentRef.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [ttChatSignature, thReady]);

      const ttVars = useMemo(() => {
        const map = thState.messages?.[activeId] || {};
        const keys = Object.keys(map).map(Number).filter(Number.isFinite).sort((a, b) => b - a);
        for (const key of keys) {
          const vars = map[key];
          if (vars && typeof vars === 'object' && Object.keys(vars).length) return vars;
        }
        return {};
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [activeId, thState.messages, thTick]);

      const presetOverridesOf = useCallback((presetId) => {
        return store.presetOverrides?.[presetId] || {};
      }, [store.presetOverrides]);

      // ── 发送前预览 ─────────────────────────────────────────────
      // 与 Host 同源（TT_LIB 同构包）：同样的卡、预设、变量与开场白 → 同样的 system 段。
      // 只在「预览」页打开时计算，避免每回合都跑一遍 2 MB 的卡。
      const previewState = useMemo(() => {
        if (view !== 'preview') return { status: 'idle' };
        if (!activeCardRaw) return { status: 'empty', message: '还没有读到角色卡（先选一张卡，或等资产加载完成）' };
        const started = Date.now();
        try {
          const lib = ttLib();
          const card = lib.card.normalizeCard(activeCardRaw);
          const presetBase = activePresetRaw ? lib.prompt.parsePreset(activePresetRaw) : null;
          const overrides = activePreset?.id ? { prompts: presetOverridesOf(activePreset.id) } : null;
          const preset = presetBase && overrides
            ? lib.prompt.applyPresetOverrides(presetBase, overrides)
            : presetBase;
          const result = lib.pipeline.runPromptPipeline({
            card,
            preset,
            variables: ttVars,
            greeting,
            chatMessages: [greeting, ...floors.map((floor) => floor.text), draft.trim()],
            chatWorldbook: chatWorldbookRaw,
            userName: '你',
            maxContext: PREVIEW_MAX_CONTEXT,
            worldInfoBudget: PREVIEW_WI_BUDGET,
          });
          return { status: 'ok', result, card, preset, ms: Date.now() - started };
        } catch (error) {
          return { status: 'error', message: String((error && (error.stack || error.message)) || error) };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [view, assetTick, thTick, activeCardRaw, activePresetRaw, activePreset, presetOverridesOf, ttVars, greeting, floors, draft, chatWorldbookRaw]);

      const previewRows = useMemo(() => {
        if (previewState.status !== 'ok') return [];
        const { lorebook } = previewState.result;
        const skippedByUid = new Map();
        for (const item of lorebook.skipped) {
          if (!skippedByUid.has(item.uid)) skippedByUid.set(item.uid, item.why);
        }
        const rows = [];
        for (const item of lorebook.activated) {
          rows.push({
            uid: item.uid,
            comment: item.comment,
            active: true,
            by: item.activatedBy,
            position: item.position,
            role: item.role,
            depth: item.depth,
            chars: item.content.length,
            why: '',
          });
        }
        for (const entry of previewState.result.entries) {
          if (rows.some((row) => row.uid === entry.uid)) continue;
          const why = skippedByUid.get(entry.uid) || (entry.enabled === false ? 'disabled' : 'no-match');
          rows.push({
            uid: entry.uid,
            comment: entry.comment,
            active: false,
            by: '',
            position: entry.position,
            role: entry.role,
            depth: entry.depth,
            chars: entry.content ? entry.content.length : 0,
            why,
          });
        }
        const needle = previewSearch.trim().toLowerCase();
        return needle
          ? rows.filter((row) => String(row.comment || '').toLowerCase().includes(needle))
          : rows;
      }, [previewState, previewSearch]);

      // ── 自检 ────────────────────────────────────────────────
      // 重启后一键确认：通道、资产、管线、TH 宿主四条链路是否都活着。
      const runSelfTest = useCallback(() => {
        const checks = [];
        const add = (label, ok, detail) => checks.push({ label, ok: Boolean(ok), detail: detail == null ? '' : String(detail) });
        try {
          const lib = ttLib();
          const wasm = lib['card-assets-wasm'].cardAssetsWasm();
          const result = wasm.normalizeText({ name: '角色卡😀', tags: [null, '自检'] });
          const matches = result?.name === '角色卡😀' && result.tags.length === 1 && result.tags[0] === '自检';
          add('浏览器角色卡 WASM', matches,
            matches ? '已加载，字段归一化通过' : (wasm.error || '字段归一化结果不一致'));
        } catch (error) {
          add('浏览器角色卡 WASM', false, String(error?.message || error));
        }
        try {
          add('会话通道', bridge?.ok, bridge?.ok ? 'ctx.remote.session 可用' : 'ctx.remote.session 不可用');
          add('资产读取通道', bridge?.hasFiles, bridge?.hasFiles ? 'workspaceFiles 可用' : 'workspaceFiles 不可用（卡片正文读不到）');
          add('角色卡已加载', Boolean(activeCard), activeCard ? activeCard.name : '还没选卡');
          add('角色卡正文', Boolean(activeCardRaw), activeCardRaw ? `${(JSON.stringify(activeCardRaw).length / 1024).toFixed(1)} KB` : '正文未加载');
          add('预设已加载', Boolean(activePreset), activePreset ? activePreset.name : '没有预设');
          add('当前是角色扮演局', isRoleplaySession, isRoleplaySession ? '有 sessionMeta / RP · 前缀' : '普通 DSH 会话（只读）');
          add('TH 宿主', Boolean(thReady), thReady ? '已就绪' : '未启动（没有启用的脚本或未进局）');

          if (activeCardRaw) {
            const lib = ttLib();
            const card = lib.card.normalizeCard(activeCardRaw);
            const presetBase = activePresetRaw ? lib.prompt.parsePreset(activePresetRaw) : null;
            const overrides = activePreset?.id ? { prompts: presetOverridesOf(activePreset.id) } : null;
            const preset = presetBase && overrides ? lib.prompt.applyPresetOverrides(presetBase, overrides) : presetBase;
            const result = lib.pipeline.runPromptPipeline({
              card, preset, variables: ttVars, greeting, userName: '你',
              chatMessages: [greeting, ...floors.map((floor) => floor.text), draft.trim()],
              chatWorldbook: chatWorldbookRaw,
              maxContext: PREVIEW_MAX_CONTEXT, worldInfoBudget: PREVIEW_WI_BUDGET,
            });
            add('世界书条目', result.lorebook.stats.total > 0, `${result.lorebook.stats.total} 条`);
            add('世界书激活', result.lorebook.stats.activated > 0,
              `${result.lorebook.stats.activated} 条 · ${result.lorebook.stats.tokens} tokens · 递归 ${result.lorebook.stats.recursion} 轮`);
            add('system 段非空', result.systemText.length > 0, `${result.systemText.length} 字`);
            add('无 EJS 残留', !/<%|%>/.test(result.sectionText), (result.sectionText.match(/<%/g) || []).length + ' 处');
            add('无装饰器残留', !/@@(if|activate|dont_activate)/.test(result.sectionText));
            add('无 EJS 错误', result.errors.ejs.length === 0, result.errors.ejs[0] || '');
            add('无正则错误', result.errors.regex.length === 0, result.errors.regex[0] || '');
            add('音色数量', true, `${result.entries.length} 条条目 · ${result.regexRules.length} 条正则`);
          } else {
            add('管线', false, '没有卡正文，跳过管线自检');
          }
        } catch (error) {
          add('自检过程抛错', false, String((error && (error.message || error)) || error));
        }
        setSelfTest({ at: new Date().toLocaleTimeString(), checks });
        const failed = checks.filter((check) => !check.ok).length;
        log(`自检：${checks.length - failed}/${checks.length} 通过` + (failed ? `，${failed} 项失败` : ''));
      }, [bridge, activeCard, activeCardRaw, activePreset, activePresetRaw, isRoleplaySession, thReady,
        presetOverridesOf, ttVars, greeting, floors, draft, chatWorldbookRaw, log]);

      const buildBinding = useCallback(async (sessionId, collectPrompts = false) => {
        const card = activeCard;
        const preset = activePreset;
        const [cardJson, presetJson, bookJson, records, scriptPrompts] = await Promise.all([
          activeCardRaw || (card ? ensureCard(card) : null),
          activePresetRaw || (preset ? ensurePreset(preset) : null),
          chatWorldbookRaw || (chatWorldbook ? ensureLorebook(chatWorldbook) : null),
          bridge.events(sessionId).catch(() => []),
          collectPrompts && thReady ? thHostRef.current?.collectPrompts() : undefined,
        ]);
        if (preset && !presetJson) throw new Error(`无法读取当前预设「${preset.name}」`);
        if (chatWorldbook && !bookJson) throw new Error(`无法读取本局世界书「${chatWorldbook.name}」`);
        const historyLimit = ttLib().pipeline.worldInfoHistoryLimit(innerOf(cardJson).character_book, bookJson) - 1;
        const overrides = preset?.id ? presetOverridesOf(preset.id) : {};
        const binding = {
          cardName: card?.name,
          presetName: preset?.name,
          cardJson,
          cardHash: cardJson ? (card.hash || hashJson(cardJson)) : undefined,
          presetJson,
          presetHash: presetJson ? (preset.hash || hashJson(presetJson)) : undefined,
          // 始终发送覆盖对象（哪怕是空的），好让 Host 在清空覆盖时也能回到预设原状。
          presetOverrides: preset ? { prompts: overrides } : undefined,
          variables: ttVars,
          greeting: greeting || undefined,
          worldInfoHistory: historyLimit > 0
            ? ttLib()['chat-wire'].toChatFloors(records).slice(-historyLimit).map((floor) => floor.text)
            : [],
          chatWorldbook: bookJson ? { id: chatWorldbook.id, name: chatWorldbook.name, book: bookJson } : null,
          scriptPrompts,
        };
        return binding;
      }, [activeCard, activeCardRaw, activePreset, activePresetRaw, chatWorldbook, chatWorldbookRaw,
        ensureCard, ensurePreset, ensureLorebook, bridge, presetOverridesOf, ttVars, greeting, thReady]);

      bindingRef.current = buildBinding;

      // ── 发送 ──────────────────────────────────────────────────
      const send = useCallback(async (input) => {
        const draftAtStart = draftRef.current;
        const text = (typeof input === 'string' ? input : draftAtStart).trim();
        if (!text || !activeId || !bridge?.ok || busy || sendingRef.current || openingChangeRef.current === activeId) return false;
        if (!isRoleplaySession) {
          setNotice('这不是角色扮演会话：信封会被写进普通会话的日志。请点「新建对话」创建一局，或切换到 RP · 开头的会话。');
          return false;
        }
        sendingRef.current = true;
        setSending(true);
        setBusy(true);
        try {
          const binding = await buildBinding(activeId, true);
          if (activeIdRef.current !== activeId) return false;
          await bridge.prompt(activeId, text, binding);
          if (activeIdRef.current === activeId) {
            setDraft((current) => current === draftAtStart ? '' : current);
            setNotice('');
            scrollToLatest();
          } else if (sessionDrafts.current.get(activeId) === draftAtStart) {
            sessionDrafts.current.delete(activeId);
          }
          return true;
        } catch (error) {
          log(`发送失败：${error?.code || error?.message || error}`);
          if (activeIdRef.current === activeId) {
            if (typeof input === 'string') setDraft((current) => current === draftAtStart ? text : current);
            setNotice('发送失败，草稿已保留。' + String(error?.message || error));
          }
          return false;
        } finally {
          sendingRef.current = false;
          setSending(false);
          setBusy(false);
        }
      }, [activeId, busy, bridge, buildBinding, log, isRoleplaySession, scrollToLatest]);

      const composeFromMessage = useCallback((text, submit) => {
        if (activeIdRef.current !== activeId || !isRoleplaySession || !text.trim()) return false;
        const compose = (current) => [current.trim(), text.trim()].filter(Boolean).join('\n');
        if (submit && !busy) return send(compose(draftRef.current));
        setDraft(compose);
        return !submit;
      }, [activeId, isRoleplaySession, busy, send]);

      // ── 导入 / 导出 ───────────────────────────────────────────
      const importFiles = useCallback(async (event) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        for (const file of files) {
          try {
            const json = await readCardFile(file);
            const kind = classifyJson(json);
            if (kind === 'preset') {
              const id = `preset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              patchStore((prev) => ({
                presets: [...prev.presets, {
                  id,
                  name: json.name || file.name,
                  counts: { prompts: presetPrompts(json).length, enabled: presetOrderSlots(json).filter((slot) => slot.enabled !== false).length },
                  source: 'import',
                  raw: json,
                  hash: hashJson(json),
                }],
                ...(!prev.activePresetId ? presetSelection(prev, id, presetSessionId, activeCard?.id) : {}),
              }));
              log(`已导入预设 ${json.name || file.name}`);
            } else if (kind === 'lorebook') {
              const id = `book-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              const entries = bookEntries(json);
              patchStore({
                lorebooks: [...store.lorebooks, {
                  id,
                  name: json.name || file.name,
                  counts: { entries: entries.length, constant: entries.filter((entry) => entry.constant).length },
                  source: 'import',
                  raw: json,
                }],
              });
              log(`已导入世界书 ${json.name || file.name}`);
            } else {
              const inner = innerOf(json);
              const id = `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              const card = {
                id,
                name: inner.name || file.name,
                creator: inner.creator || '',
                spec: json.spec || 'chara_card_v2',
                counts: {
                  lorebookEntries: bookEntries(inner.character_book).length,
                  thScripts: assetTavernScripts(json).length,
                  regexScripts: cardRegexScripts(json).length,
                },
                worldName: inner.character_book?.name ?? '',
                source: 'import',
                raw: json,
                hash: hashJson(json),
              };
              const next = { cards: [...store.cards, card], activeCardId: card.id };
              assetCacheRef.current.set(`card:${id}`, json);
              patchStore(next);
              setAssetTick((tick) => tick + 1);
              log(`已导入角色卡 ${card.name}`);
            }
          } catch (error) {
            log(`导入失败 ${file.name}：${error?.message || error}`);
          }
        }
      }, [store, patchStore, log, presetSessionId, activeCard?.id]);

      const exportActive = useCallback(async (kind) => {
        const asset = kind === 'preset' ? activePreset : activeCard;
        const payload = await (kind === 'preset' ? ensurePreset(asset) : ensureCard(asset));
        if (!payload) { log('导出失败：资产没有加载'); return; }
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${asset?.name || 'export'}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }, [activePreset, activeCard, ensurePreset, ensureCard, log]);

      // ── 渲染 ──────────────────────────────────────────────────
      const literalDisplays = useMemo(() => ttLib()['message-html'].literalAssetDisplays(displayRules), [displayRules]);
      const dynamicDisplays = useMemo(() => compileDisplaySlots(displayRules, ttLib()['message-html']), [displayRules]);

      const renderedFloors = useMemo(() => {
        if (view !== 'chat') return null;
        const nodes = [];
        if (greeting) {
          const rawGreeting = (thState.overrides?.[activeId] || {})[0] || greeting;
          const greetingVars = { ...((thState.messages?.[activeId] || {})[0] || ttVars) };
          const greetingText = displayMessage(rawGreeting, displayRules, 2, floors.length, greetingVars, dynamicDisplays);
          const display = isRoleplaySession && {
            greeting: true, context: { index: 0, variables: greetingVars, compose: true }, literals: literalDisplays,
            onCompose: composeFromMessage,
          };
          nodes.push(h('article', { key: 'greeting', className: 'tt-fl' },
            h('div', { className: 'tt-av', 'aria-hidden': true }, String(activeCard?.name ?? 'AI').slice(0, 1)),
            h('div', { className: 'tt-msg-content tt-opening' },
              h('header', { className: 'tt-meta' },
                h('span', null, h('b', null, activeCard?.name ?? '角色'), ' · 开场白'),
                canChooseOpening ? h('button', {
                  className: 'tt-btn tt-primary', disabled: busy,
                  onClick: () => setGreetingPick({ card: activeCard, options: alternateOpenings, sessionId: activeId }),
                }, alternateOpenings.some((option) => option.text === greeting) ? '更换剧情开场' : '开始剧情') : null,
              ),
              h('div', { className: 'tt-bub' }, renderMarkdown(greetingText, 'greeting', display)),
            ),
          ));
        }
        const greetingOffset = greeting ? 1 : 0;
        floors.forEach((floor, floorIndex) => {
          if (floor.role === 'system') return;
          const varIndex = floorIndex + greetingOffset;
          const override = (thState.overrides?.[activeId] || {})[varIndex] || null;
          const floorVars = { ...((thState.messages?.[activeId] || {})[varIndex] || ttVars) };
          const placement = floor.role === 'user' ? 1 : 2;
          const text = displayMessage(override || floor.text, displayRules, placement, floors.length - 1 - floorIndex, floorVars, dynamicDisplays);
          const display = isRoleplaySession && floor.role === 'assistant' && {
            context: { index: varIndex, variables: floorVars, compose: true }, literals: literalDisplays,
            onCompose: composeFromMessage,
          };
          const user = floor.role === 'user';
          nodes.push(h('article', { key: floor.replyKey || floor.id, className: 'tt-fl' + (user ? ' user' : '') },
            user ? null : h('div', { className: 'tt-av', 'aria-hidden': true }, String(activeCard?.name ?? 'AI').slice(0, 1)),
            h('div', { className: 'tt-msg-content' },
              h('header', { className: 'tt-meta' }, h('b', null, user ? '你' : (activeCard?.name ?? '角色')),
                floor.time ? h('span', null, new Date(floor.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })) : null),
              user ? null : h(AssistantReasoning, { text: floor.reasoning }),
              h('div', { className: 'tt-bub' }, renderMarkdown(text, floor.id, display)),
            ),
          ));
        });
        return nodes;
      }, [view, activeId, activeCard, alternateOpenings, busy, canChooseOpening, composeFromMessage, displayRules,
        dynamicDisplays, floors, greeting, isRoleplaySession, literalDisplays, thState.messages, thState.overrides, ttVars]);

      const visibleSessions = useMemo(() => {
        const query = sessionSearch.trim().toLocaleLowerCase();
        const byId = new Map(sessions.map((row) => [row.id, row]));
        const archived = new Set(sessionGroups.archived);
        const pinned = new Set(sessionGroups.pinned);
        const rows = archiveView
          ? sessionGroups.archived.map((id) => byId.get(id) || { id, title: '' })
          : [...sessionGroups.pinned.filter((id) => byId.has(id) && !archived.has(id)).map((id) => byId.get(id)),
            ...sessions.filter(({ id }) => !archived.has(id) && !pinned.has(id))];
        return rows.filter((row) => !query || sessionTitle(row).toLocaleLowerCase().includes(query)).slice(0, 200);
      }, [sessions, sessionGroups, archiveView, sessionSearch]);

      const allVisibleSelected = visibleSessions.length > 0 && visibleSessions.every(({ id }) => sessionSelection?.has(id));
      const toggleSelectedSession = (id) => setSessionSelection((previous) => {
        if (!previous) return null;
        const next = new Set(previous);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      const toggleAllVisibleSessions = () => setSessionSelection((previous) => {
        if (!previous) return null;
        const next = new Set(previous);
        for (const { id } of visibleSessions) {
          if (allVisibleSelected) next.delete(id); else next.add(id);
        }
        return next;
      });

      const runSessionAction = async (action) => {
        if (sessionActionRef.current) return;
        sessionActionRef.current = true;
        setSessionActionBusy(true);
        try { await action(); }
        catch (error) { pushToast('error', error?.message || String(error), '会话操作失败'); }
        finally { sessionActionRef.current = false; setSessionActionBusy(false); }
      };

      const archiveSelectedSessions = () => runSessionAction(async () => {
        const ids = sessionDialog.ids;
        const completed = [];
        const failed = [];
        for (const id of ids) {
          try {
            setSessionGroups(await bridge.archiveSession(id));
            completed.push(id);
          } catch (error) {
            const code = error?.rpcError?.code || error?.code;
            failed.push({ id, message: code === 'workspace/session-active' ? '该会话仍有任务在运行' : error?.message || String(error) });
          }
        }
        setSessionDialog(null);
        setSessionMenu(null);
        setSessionSelection((current) => current && (failed.length ? new Set(failed.map(({ id }) => id)) : null));
        if (completed.length) pushToast('success', `已归档 ${completed.length} 个会话，可从归档记录恢复。`);
        if (failed.length) pushToast('error', `${failed.length} 个会话归档失败。${failed[0].message}`);
      });

      const renameSelectedSession = () => runSessionAction(async () => {
        const { row, title } = sessionDialog;
        const prefix = row.title.startsWith(RP_PREFIX) ? RP_PREFIX : '';
        if (!title.trim()) return;
        const result = await bridge.rename(row.id, prefix + title.trim());
        setSessions((previous) => previous.map((item) => item.id === row.id ? { ...item, title: result?.title ?? prefix + title.trim() } : item));
        setSessionDialog(null);
        setSessionMenu(null);
        pushToast('success', '会话名称已更新。');
      });

      const sidebar = h('aside', { className: 'tt-side', 'aria-label': '会话和页面' },
        h('div', { className: 'tt-side-head' },
          h('div', { className: 'tt-session-toolbar' },
            h('div', { className: 'tt-side-label' }, archiveView ? '归档记录' : '会话'),
            canManageSessions && !archiveView ? h(ToolButton, { icon: 'select', label: sessionSelection ? '退出批量选择' : '批量选择',
              pressed: Boolean(sessionSelection), disabled: sessionActionBusy, onClick: () => {
                setSessionSelection(sessionSelection ? null : new Set());
                setSessionMenu(null);
              } }) : null,
            canManageSessions ? h(ToolButton, { icon: 'archive', label: archiveView ? '返回会话列表' : '归档记录', pressed: archiveView,
              disabled: sessionActionBusy, onClick: () => {
                setArchiveView(!archiveView);
                setSessionSelection(null);
                setSessionMenu(null);
                setSessionSearch('');
              } }) : null,
            h(ToolButton, { icon: 'plus', label: '新建对话', className: 'tt-tool-primary', onClick: newChat, disabled: busy }),
          ),
          h('div', { className: 'tt-session-filter' },
            h('span', { className: 'tt-glyph i-search', 'aria-hidden': true }),
            h('input', { className: 'tt-search tt-session-search', type: 'search', 'aria-label': '搜索会话',
              placeholder: archiveView ? '搜索归档…' : '搜索会话…', value: sessionSearch, onChange: (event) => setSessionSearch(event.target.value) }),
          ),
          sessionSelection ? h('div', { className: 'tt-selection-bar' },
            h('span', { role: 'status' }, `已选 ${sessionSelection.size}`),
            h(ToolButton, { icon: 'all', label: allVisibleSelected ? '取消选择当前结果' : '全选当前结果', pressed: allVisibleSelected,
              disabled: !visibleSessions.length || sessionActionBusy, onClick: toggleAllVisibleSessions }),
            h(ToolButton, { icon: 'archive', label: '批量归档', disabled: !sessionSelection.size || sessionActionBusy,
              onClick: () => setSessionDialog({ ids: [...sessionSelection] }) }),
          ) : null,
        ),
        h('div', { className: 'tt-list' }, visibleSessions.length
          ? h(SessionList, {
            rows: visibleSessions, activeId: view === 'chat' ? activeId : null, archived: archiveView,
            selection: sessionSelection, pinnedIds: sessionGroups.pinned, menu: sessionMenu,
            disabled: sessionActionBusy, canArchive: canManageSessions, canPin: canManageSessions,
            onSelect: selectSession, onToggle: toggleSelectedSession, onMenu: (id) => setSessionMenu(sessionMenu === id ? null : id),
            onRename: (row) => setSessionDialog({ row, title: sessionTitle(row) }),
            onPin: (row) => runSessionAction(async () => {
              setSessionGroups(await bridge.pinSession(row.id, !sessionGroups.pinned.includes(row.id)));
              setSessionMenu(null);
            }),
            onArchive: (row) => setSessionDialog({ ids: [row.id], title: sessionTitle(row) }),
            onRestore: (id) => runSessionAction(async () => {
              setSessionGroups(await bridge.restoreSession(id));
              await refreshSessions();
              pushToast('success', '会话已恢复。');
            }),
          }) : h('div', { className: 'tt-empty' }, sessionSearch.trim() ? '没有匹配的会话' : archiveView ? '还没有归档会话' : '还没有对话')),
        h(PanelNavigation, { view, onNavigate: navigate }),
      );

      const canSend = Boolean(isRoleplaySession && activeId && bridge?.ok);
      const liveNode = liveReply ? h('article', { key: liveReply.key, className: 'tt-fl tt-stream' },
        h('div', { className: 'tt-av', 'aria-hidden': true }, String(activeCard?.name ?? 'AI').slice(0, 1)),
        h('div', { className: 'tt-msg-content' },
          h('header', { className: 'tt-meta' },
            h('b', null, activeCard?.name ?? '角色'),
            h('span', { className: 'tt-stream-label' }, '生成中'),
          ),
          h(AssistantReasoning, { text: liveReply.reasoning, active: !liveReply.text }),
          h('div', { className: 'tt-bub tt-stream-body' }, ttLib()['message-html'].streamingAssistantProse(liveReply.text)),
        ),
      ) : null;
      const chatPane = view === 'chat' ? h('section', { className: 'tt-chat-pane', 'aria-label': '对话内容' },
        h('div', { className: 'tt-timeline' },
          h('div', { className: 'tt-chat', ref: scrollRef, onScroll: trackScroll },
            h('div', { className: 'tt-thread', ref: threadRef }, !floors.length && !greeting && !liveNode
              ? h('div', { className: 'tt-chat-empty' },
                h('div', { className: 'tt-empty-mark', 'aria-hidden': true }, h('span', { className: 'tt-glyph i-chat' })),
                h('h2', null, canSend ? '开始对话' : activeId ? '这个会话还没有消息' : activeCard ? '与「' + activeCard.name + '」开始对话' : '选择角色，开始对话'),
                !activeId ? h('button', { className: 'tt-btn tt-primary', onClick: newChat, disabled: busy }, activeCard ? '开始对话' : '浏览角色卡') : null,
              ) : [...renderedFloors, liveNode],
            ),
          ),
          scrolledAway ? h(ToolButton, { icon: 'import', label: '回到最新消息', className: 'tt-latest', onClick: scrollToLatest }) : null,
        ),
        notice || activeId || draft ? h('div', { className: 'tt-compose-area' },
          notice ? h('p', { className: 'tt-notice', role: 'status' }, notice) : null,
          !canSend && activeId ? h('p', { className: 'tt-notice' }, bridge?.ok ? '这是普通 DSH 会话，当前可查看消息。' : '会话通道暂不可用。') : null,
          canSend || draft ? h(ChatComposer, {
            inputRef: chatRef, value: draft, sending, enabled: canSend && (!busy || sending),
            status: sending ? '正在提交消息…' : liveReply ? (liveReply.text ? '正在接收回复…' : '模型正在思考…')
              : generating ? '等待模型回复…' : 'Enter 发送 · Shift+Enter 换行',
            onChange: setDraft, onSubmit: send,
          }) : null,
        ) : null,
      ) : null;

      const cardsPane = h('div', { className: 'tt-pane' },
        h('h2', { className: 'tt-h' }, '角色卡'),
        h('p', { className: 'tt-sub' }, '支持导入 Character Card V2/V3 的 PNG 和 JSON。'),
        h('div', { className: 'tt-inline', style: { marginBottom: '14px' } },
          h(ToolButton, { icon: 'import', label: '导入角色卡', className: 'tt-tool-primary', onClick: () => importCardRef.current?.click() }),
          h('input', { ref: importCardRef, type: 'file', accept: '.json,.png', multiple: true, hidden: true, onChange: importFiles }),
          h(ToolButton, { icon: 'export', label: '导出当前角色卡', disabled: !activeCard, onClick: () => exportActive('card') }),
          alternateOpenings.length ? h('button', {
            className: 'tt-btn', disabled: busy,
            onClick: () => setGreetingPick({ card: activeCard, options: alternateOpenings }),
          }, '从备选开场新建') : null,
        ),
        h('div', { className: 'tt-grid' },
          store.cards.map((card) => {
            const selected = card.id === store.activeCardId;
            return h('article', { key: card.id, className: 'tt-card' + (selected ? ' on' : '') },
              h('div', { className: 'tt-card-title' },
                h('div', { className: 'tt-card-mark', 'aria-hidden': true }, card.name.slice(0, 1)),
                h('div', null, h('b', null, card.name), h('small', null, card.creator || (card.source === 'seed' ? '内置角色卡' : '已导入'))),
              ),
              h('div', { className: 'tt-inline' },
                h('button', { className: 'tt-btn tt-primary', disabled: busy, onClick: () => openChat(card),
                  'aria-label': `与${card.name}开始对话` }, '开始对话'),
                selected ? h('span', { className: 'tt-note' }, '当前角色') : h('button', { className: 'tt-btn', onClick: () => {
                  patchStore({ activeCardId: card.id });
                  ensureCard(card);
                } }, '设为当前角色'),
              ),
            );
          })),
        !store.cards.length ? h('p', { className: 'tt-empty' }, '还没有角色卡。') : null,
      );

      // ── 世界书 ────────────────────────────────────────────────
      const loreOptions = [];
      if (activeCard) loreOptions.push({ id: 'card', name: activeCard.name + '（卡内世界书）' });
      store.lorebooks.forEach((book) => loreOptions.push({ id: book.id, name: book.name }));

      const activeLoreBook = loreBookId === 'card'
        ? cardBook(activeCardRaw)
        : (() => {
          const item = store.lorebooks.find((book) => book.id === loreBookId);
          const raw = item ? (assetCacheRef.current.get(`lore:${item.id}`) || item.raw) : null;
          return raw;
        })();

      const loreEntries = useMemo(() => {
        const raw = bookEntries(activeLoreBook).map(normalizeBookEntry);
        const query = loreSearch.trim().toLowerCase();
        if (!query) return raw;
        return raw.filter((entry) =>
          entry.comment.toLowerCase().includes(query)
          || entry.content.toLowerCase().includes(query)
          || entry.keys.some((key) => String(key).toLowerCase().includes(query)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [activeLoreBook, loreSearch, assetTick]);

      const lorePane = h('div', { className: 'tt-pane' },
        h('h2', { className: 'tt-h' }, '世界书'),
        h('p', { className: 'tt-sub' }, '查看条目，或为当前会话绑定一份独立世界书。'),
        isRoleplaySession ? h('label', { className: 'tt-inline', style: { marginBottom: '10px' } },
          '本局世界书',
          h('select', {
            className: 'tt-search',
            value: chatWorldbook?.id || '',
            onChange: (event) => selectChatWorldbook(event.target.value || null),
          }, h('option', { value: '' }, '无额外世界书'),
          store.lorebooks.map((book) => h('option', { key: book.id, value: book.id }, book.name)))) : null,
        h('div', { className: 'tt-inline', style: { marginBottom: '10px' } },
          h('select', {
            className: 'tt-search', 'aria-label': '浏览的世界书',
            value: loreBookId,
            onChange: (e) => { setLoreBookId(e.target.value); setLoreOpen(null); const item = store.lorebooks.find((book) => book.id === e.target.value); if (item) ensureLorebook(item); },
          }, loreOptions.map((option) => h('option', { key: option.id, value: option.id }, option.name))),
          h('input', { className: 'tt-search', 'aria-label': '搜索世界书', placeholder: '搜索注释、关键词或内容…', value: loreSearch, onChange: (e) => setLoreSearch(e.target.value) }),
          h('span', { className: 'tt-note' }, `${loreEntries.length} 条`),
          h(ToolButton, { icon: 'import', label: '导入世界书', className: 'tt-tool-primary', onClick: () => importLoreRef.current?.click() }),
          h('input', { ref: importLoreRef, type: 'file', accept: '.json', multiple: true, hidden: true, onChange: importFiles }),
        ),
        !activeLoreBook
          ? h('div', { className: 'tt-empty', style: { height: 'auto', padding: '40px 0' } }, '这个来源还没有加载；若资产在磁盘上，等会话就绪后会自动读取。')
          : h('div', null, loreEntries.slice(0, 200).map((entry) => h('div', {
            key: entry.uid,
            className: 'tt-line tt-lore-entry' + (loreOpen === entry.uid ? ' on' : ''),
          },
            h('button', { className: 'tt-disclosure', 'aria-expanded': loreOpen === entry.uid,
              onClick: () => setLoreOpen(loreOpen === entry.uid ? null : entry.uid) },
              h('span', { className: 'tt-grow' },
                h('b', null, entry.comment || `条目 #${entry.uid}`),
                h('span', { className: 'tt-tagline' },
                  entry.keys.length ? `主关键词：${entry.keys.join('、')}` : '无主关键词',
                  entry.secondary.length ? ` · 次关键词：${entry.secondary.join('、')}` : '',
                ),
              ),
              h('span', { className: 'tt-tag' + (entry.constant ? ' acc' : '') }, entry.constant ? '常驻' : `位置 ${entry.position}`),
              h('span', { className: 'tt-tag' }, `${entry.content.length} 字`),
            ),
            loreOpen === entry.uid ? h('pre', { className: 'tt-pre' }, entry.content) : null,
          ))),
      );

      // ── 预设 ──────────────────────────────────────────────────
      const presetRows = useMemo(() => {
        if (!activePresetRaw) return [];
        const prompts = presetPrompts(activePresetRaw);
        const overrides = presetOverridesOf(activePreset?.id);
        const order = presetOrderSlots(activePresetRaw);
        const byId = new Map(prompts.map((prompt) => [prompt.identifier, prompt]));
        const rows = order.map((slot) => {
          const prompt = byId.get(slot.identifier) || null;
          byId.delete(slot.identifier);
          const baseEnabled = (slot.enabled !== false) && (!prompt || prompt.enabled !== false);
          const override = overrides[slot.identifier];
          return { identifier: slot.identifier, prompt, baseEnabled, enabled: override === undefined ? baseEnabled : override, marker: !prompt || Boolean(prompt.marker) };
        });
        Array.from(byId.values()).forEach((prompt) => {
          const override = overrides[prompt.identifier];
          const baseEnabled = prompt.enabled !== false;
          rows.push({ identifier: prompt.identifier, prompt, baseEnabled, enabled: override === undefined ? baseEnabled : override, marker: Boolean(prompt.marker) });
        });
        const query = promptSearch.trim().toLowerCase();
        if (!query) return rows;
        return rows.filter((row) => String(row.prompt?.name || row.identifier).toLowerCase().includes(query)
          || String(row.prompt?.content || '').toLowerCase().includes(query));
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [activePresetRaw, activePreset?.id, presetOverridesOf, promptSearch, assetTick]);

      const togglePrompt = useCallback((row) => {
        if (!activePreset?.id) return;
        const nextValue = !row.enabled;
        setStore((prev) => {
          const all = { ...(prev.presetOverrides || {}) };
          const own = { ...(all[activePreset.id] || {}) };
          if (nextValue === row.baseEnabled) delete own[row.identifier];
          else own[row.identifier] = nextValue;
          all[activePreset.id] = own;
          const next = { ...prev, presetOverrides: all };
          saveStore(next);
          return next;
        });
      }, [activePreset?.id]);

      const presetsPane = h('div', { className: 'tt-pane' },
        h('h2', { className: 'tt-h' }, '预设'),
        h('p', { className: 'tt-sub' }, '导入 ST 预设 JSON（全量保留字段），查看 prompt 顺序并逐条启停。'),
        h('div', { className: 'tt-inline', style: { marginBottom: '12px' } },
          h(ToolButton, { icon: 'import', label: '导入预设', className: 'tt-tool-primary', onClick: () => importPresetRef.current?.click() }),
          h('input', { ref: importPresetRef, type: 'file', accept: '.json', multiple: true, hidden: true, onChange: importFiles }),
          h(ToolButton, { icon: 'export', label: '导出当前预设', disabled: !activePreset, onClick: () => exportActive('preset') }),
          h('input', { className: 'tt-search', 'aria-label': '筛选提示词', placeholder: '筛选提示词…', value: promptSearch, onChange: (e) => setPromptSearch(e.target.value) }),
          activePresetRaw ? h('span', { className: 'tt-note' }, `${presetPrompts(activePresetRaw).length} 条 prompt · ${presetOrderSlots(activePresetRaw).filter((slot) => slot.enabled !== false).length} 项启用`) : null,
        ),
        h('div', { className: 'tt-grid', style: { marginBottom: '14px' } },
          store.presets.map((preset) => h('button', {
            key: preset.id,
            className: 'tt-card' + (preset.id === store.activePresetId ? ' on' : ''),
            'aria-pressed': preset.id === store.activePresetId,
            onClick: () => selectPreset(preset.id),
          },
            h('b', null, preset.name),
            h('small', null, `prompts ${preset.counts?.prompts ?? 0} · 启用 ${preset.counts?.enabled ?? '-'}`),
            h('small', null, `temperature ${preset.counts?.temperature ?? '-'} · max ${preset.counts?.maxTokens ?? '-'}`),
          ))),
        !activePresetRaw
          ? h('div', { className: 'tt-empty' }, activePreset ? '预设正文尚未就绪。' : '选择或导入一个预设。')
          : h('div', null,
            h('div', { className: 'tt-section' }, 'Prompt 顺序'),
            presetRows.map((row, index) => h('div', { key: row.identifier + index, className: 'tt-line' },
              h('span', { className: 'tt-tag' }, String(index + 1)),
              h('div', { className: 'tt-grow' },
                h('button', { className: 'tt-disclosure', disabled: !row.prompt?.content, 'aria-expanded': promptOpen === row.identifier,
                  onClick: () => setPromptOpen(promptOpen === row.identifier ? null : row.identifier) },
                  h('span', { className: 'tt-grow' }, h('b', null, row.prompt?.name || row.identifier),
                    h('span', { className: 'tt-tagline' },
                      row.marker ? '位置占位' : `角色 ${row.prompt?.role || 'system'}`,
                      row.prompt?.content ? ` · ${row.prompt.content.length} 字` : '',
                      row.prompt?.injection_position === 1 ? ` · 深度注入 ${row.prompt?.injection_depth ?? 0}` : '',
                    )),
                ),
                promptOpen === row.identifier && row.prompt?.content
                  ? h('pre', { className: 'tt-pre' }, String(row.prompt.content).slice(0, 20000))
                  : null,
              ),
              h('button', {
                className: 'tt-switch' + (row.enabled ? ' on' : ''),
                role: 'switch', 'aria-checked': row.enabled, 'aria-label': row.prompt?.name || row.identifier,
                title: row.enabled ? '已启用' : '已停用',
                onClick: () => togglePrompt(row),
              }),
            )),
          ),
      );

      // ── 扩展 ──────────────────────────────────────────────────
      const toggleScript = useCallback((entry) => {
        const { assetKey, script } = entry;
        const nextValue = !scriptEnabled(entry);
        patchStore((prev) => {
          const all = { ...(prev.scriptOverrides || {}) };
          all[assetKey] = { ...(all[assetKey] || {}), [script.id]: nextValue };
          return { scriptOverrides: all };
        });
      }, [patchStore, scriptEnabled]);

      const statData = ttVars?.stat_data && typeof ttVars.stat_data === 'object' ? ttVars.stat_data : null;

      const extPane = h('div', { className: 'tt-pane' },
        h('h2', { className: 'tt-h' }, '扩展'),
        h('p', { className: 'tt-sub' }, '管理当前角色卡和预设的酒馆助手脚本。'),
        h('div', { className: 'tt-inline', style: { marginBottom: '12px' } },
          h(ToolButton, { icon: 'preview', label: '打开脚本界面', onClick: () => setThShow(true) }),
          h(ToolButton, { icon: 'refresh', label: '重启宿主', onClick: () => setThReload((tick) => tick + 1) }),
          h(ToolButton, { icon: 'trash', label: '清空本局变量', disabled: !activeId || !isRoleplaySession, onClick: () => setClearVarsConfirm(activeId) }),
          h('span', { className: 'tt-note' }, thReady ? '宿主运行中' : (configuredScripts.length ? '宿主未启动（检查卡/会话）' : '当前卡和预设没有 TH 脚本')),
        ),
        h('div', { className: 'tt-section' }, `酒馆助手脚本（${enabledScripts.length}/${configuredScripts.length} 启用）`),
        configuredScripts.map((entry) => {
          const { script, assetKey, source } = entry;
          const visibleButtons = thReady && scriptEnabled(entry) ? thButtons.find((row) => row.id === script.id)?.names : null;
          return h('div', { key: `${assetKey}:${script.id}`, className: 'tt-line' },
            h('div', { className: 'tt-grow' },
              h('b', null, script.name || script.id),
              h('div', { className: 'tt-tagline' },
                `${source} · ${script.content.length} 字`,
                Array.isArray(script.button?.buttons) && script.button.buttons.length ? ` · ${script.button.buttons.length} 个按钮` : '',
                script.enabled === false ? ' · 默认停用' : '',
              ),
              visibleButtons?.length ? h('div', { className: 'tt-inline' }, [...new Set(visibleButtons)].map((name) => h('button', {
                key: name, className: 'tt-btn', onClick: () => thHostRef.current?.clickScriptButton(script.id, name),
              }, name))) : null,
            ),
            h('button', {
              className: 'tt-switch' + (scriptEnabled(entry) ? ' on' : ''),
              role: 'switch', 'aria-checked': scriptEnabled(entry), 'aria-label': script.name || script.id,
              onClick: () => toggleScript(entry),
            }),
          );
        }),
        h('div', { className: 'tt-section' }, '状态变量'),
        h('div', { className: 'tt-inline', style: { marginBottom: '6px' } },
          h('button', { className: 'tt-btn', 'aria-expanded': varOpen, onClick: () => setVarOpen(!varOpen) }, varOpen ? '收起' : '展开'),
          h('span', { className: 'tt-note' }, statData ? `${Object.keys(statData).length} 个顶层键` : '还没有 stat_data（等 MVU 初始化）'),
        ),
        varOpen ? h('pre', { className: 'tt-pre' }, JSON.stringify(ttVars, null, 2).slice(0, 40000)) : null,
        h('div', { className: 'tt-section' }, '提示词模板（ST-Prompt-Template）'),
        h('div', { className: 'tt-note' }, 'EJS 模板由内置兼容引擎处理；目前没有可配置的扩展设置。'),
        h('div', { className: 'tt-note', style: { marginTop: 8 } }, '当前为兼容实现，尚未接入酒馆助手或提示词模板的原版设置面板。'),
        h('p', { className: 'tt-note', style: { marginTop: '12px' } },
          '安全提示：脚本与 JS-Slash-Runner 同级别，可读取本局聊天与变量。宿主使用 iframe 隔离，但为了兼容 TH 的 window.parent 偏好存储，iframe 与页面同源；只运行你自己信任的角色卡脚本。'),
      );

      // ── 设置 ──────────────────────────────────────────────────
      const settingsPane = h('div', { className: 'tt-pane' },
        h('h2', { className: 'tt-h' }, '设置与诊断'),
        h(ThemePicker, { value: store.theme, onChange: (theme) => patchStore({ theme }) }),
        h('h3', { className: 'tt-section' }, '诊断'),
        h('div', { className: 'tt-inline', style: { marginBottom: '10px' } },
          h(ToolButton, { icon: 'refresh', label: '重新读取会话', onClick: refreshSessions }),
          h(ToolButton, { icon: 'trash', label: '清空诊断', onClick: () => setDiag([]) }),
          h(ToolButton, { icon: 'check', label: '运行自检', onClick: runSelfTest }),
          selfTest ? h('span', { className: 'tt-note' },
            `${selfTest.at} · ${selfTest.checks.filter((check) => check.ok).length}/${selfTest.checks.length} 通过`) : null,
        ),
        selfTest ? h('div', { style: { marginBottom: '10px' } },
          selfTest.checks.map((check, index) => h('div', {
            key: index,
            style: { fontSize: 11.5, lineHeight: 1.85, display: 'flex', gap: 6, alignItems: 'baseline' },
          },
            h('span', { style: { width: 14, flex: 'none' } }, check.ok ? '✅' : '❌'),
            h('span', { style: { minWidth: 108, flex: 'none', opacity: 0.72 } }, check.label),
            h('span', { style: { flex: 1, minWidth: 0, wordBreak: 'break-word' } }, check.detail),
          ))) : null,
        h('div', { className: 'tt-note', style: { marginBottom: '8px' } },
          `session remote: ${bridge?.ok ? '可用' : '不可用'} · workspaceFiles: ${bridge?.hasFiles ? '可用' : '不可用'} · 会话数 ${sessions.length} · 模型 ${models.length} · TH ${thReady ? '运行中' : '未运行'}`),
        h('div', { className: 'tt-note', style: { marginBottom: '8px' } },
          `资产：卡 ${store.cards.length} / 预设 ${store.presets.length} / 世界书 ${store.lorebooks.length} · 当前卡 ${activeCardRaw ? '已加载' : '未加载'} · 当前预设 ${activePresetRaw ? '已加载' : '未加载'}`),
        h('div', { className: 'tt-diag' }, diag.length ? diag.join('\n') : '（暂无诊断信息）'),
        h('div', { className: 'tt-section' }, '变量作用域'),
        h('pre', { className: 'tt-pre', style: { maxHeight: 180 } },
          JSON.stringify({
            global: thState.global || {},
            character: thState.characters?.[activeCard?.id] || {},
            chat: thState.chats?.[activeId] || {},
            messageCount: Object.keys(thState.messages?.[activeId] || {}).length,
            overrideCount: Object.keys(thState.overrides?.[activeId] || {}).length,
          }, null, 2)),
      );

      // ── 预览 ────────────────────────────────────────────────
      const previewChip = (label, value) => h('span', {
        key: label,
        className: 'tt-chip',
        title: label + '：' + value,
      }, h('b', { style: { fontWeight: 600 } }, label), ' ', String(value));

      const previewBody = () => {
        if (previewState.status === 'idle') return h('div', { className: 'tt-note' }, '打开本页即可计算…');
        if (previewState.status === 'empty') return h('div', { className: 'tt-note' }, previewState.message);
        if (previewState.status === 'error') {
          return h('div', null,
            h('div', { className: 'tt-note', style: { color: 'var(--tt-danger)', marginBottom: 6 } }, '管线计算失败：'),
            h('pre', { className: 'tt-pre', style: { whiteSpace: 'pre-wrap', fontSize: 11.5 } }, previewState.message));
        }
        const { result, card, preset } = previewState;
        const wi = result.lorebook.stats;
        const activeCount = result.lorebook.activated.length;
        return h('div', null,
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 } },
            previewChip('卡', card.name),
            previewChip('预设', preset?.name || '(无)'),
            previewChip('世界书', `${wi.activated}/${wi.total}`),
            previewChip('tokens', `${wi.tokens}/${wi.budget}`),
            previewChip('递归', `${wi.recursion} 轮`),
            previewChip('system', `${result.stats.systemChars} 字`),
            previewChip('完整段', `${result.stats.sectionChars} 字`),
            previewChip('耗时', `${previewState.ms} ms`)),
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 } },
            h('input', {
              className: 'tt-search',
              'aria-label': '搜索世界书条目',
              placeholder: '搜索世界书条目…',
              value: previewSearch,
              onChange: (e) => setPreviewSearch(e.target.value),
            }),
            h('span', { className: 'tt-note' }, `${previewRows.length} 条（激活 ${activeCount}）`),
            h('div', { className: 'tt-spacer' }),
            h('button', {
              className: 'tt-btn',
              onClick: () => {
                try {
                  navigator.clipboard.writeText(result.sectionText);
                  setPreviewCopyHint('已复制');
                } catch (error) {
                  setPreviewCopyHint('复制失败');
                }
                setTimeout(() => setPreviewCopyHint(''), 1600);
              },
            }, '复制完整段'),
            previewCopyHint ? h('span', { className: 'tt-note' }, previewCopyHint) : null),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: 12, alignItems: 'start' } },
            h('div', {
              className: 'tt-card',
              style: { maxHeight: '60vh', overflow: 'auto', padding: 4, background: 'var(--dsw-alias-background-primary,#fff)' },
            },
              previewRows.map((row) => h('div', {
                key: row.uid,
                style: {
                  display: 'flex', gap: 6, alignItems: 'baseline', padding: '4px 6px', fontSize: 11.5,
                  borderBottom: '1px solid var(--dsw-alias-border-secondary, rgba(0,0,0,.06))',
                  opacity: row.active ? 1 : 0.55,
                },
                title: `${row.comment || '#' + row.uid}\n位置 ${row.position}` +
                  `${row.depth != null ? ' 深度 ' + row.depth : ''} · ${row.role} · ${row.chars} 字`,
              },
                h('span', { style: { width: 10, textAlign: 'center', opacity: row.active ? 1 : 0.35 } }, row.active ? '●' : '○'),
                h('span', {
                  style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                }, row.comment || `#${row.uid}`),
                h('span', {
                  className: 'tt-badge',
                  title: row.active ? '激活来源：' + row.by : '跳过原因：' + row.why,
                }, row.active ? String(row.by || '') : String(row.why || '')),
              )),
              previewRows.length ? null : h('div', { className: 'tt-note', style: { padding: 10 } }, '没有匹配的条目')),
            h('div', null,
              h('div', { className: 'tt-note', style: { marginBottom: 4 } }, '系统提示词（= 模型收到的 system 段，含深度注入与开场白块）'),
              h('pre', {
                className: 'tt-pre',
                style: {
                  maxHeight: '56vh', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  margin: 0, padding: 10, fontSize: 11.5, lineHeight: 1.65, borderRadius: 8,
                  background: 'var(--dsw-alias-background-tertiary, rgba(0,0,0,.04))',
                },
              }, result.sectionText))),
          (result.errors.ejs.length || result.errors.regex.length)
            ? h('div', { className: 'tt-note', style: { marginTop: 8, color: 'var(--tt-danger)' } },
              `错误：EJS ${result.errors.ejs.length} · 正则 ${result.errors.regex.length}` +
              (result.errors.ejs[0] ? ` · ${String(result.errors.ejs[0]).slice(0, 120)}` : ''))
            : null);
      };

      const previewPane = h('div', { className: 'tt-pane' },
        h('h2', { className: 'tt-h' }, '发送前预览'),
        h('p', { className: 'tt-sub' },
          '与 Host 用同一份管线代码（同构包）计算：卡 + 预设 + 当前变量 + 开场白 → 实际的 system 段。' +
          '开场白只显示、不发送；深度注入按 D-020 追加在末尾。'),
        previewBody());

      // ── 正则 ────────────────────────────────────────────────
      const regexState = useMemo(() => {
        if (view !== 'regex') return { status: 'idle' };
        try {
          const lib = ttLib();
          const cardRules = lib.regex.collectRegexRules(activeCardRaw, null).map((rule) => ({ ...rule, source: '卡' }));
          const presetRules = lib.regex.collectRegexRules(null, activePresetRaw).map((rule) => ({ ...rule, source: '预设' }));
          return { status: 'ok', rows: [...cardRules, ...presetRules] };
        } catch (error) {
          return { status: 'error', message: String((error && (error.message || error)) || error) };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [view, assetTick, activeCardRaw, activePresetRaw]);

      const placementName = (value) => ({
        1: '用户输入',
        2: 'AI 输出',
        3: '斜杠命令',
        4: '仅显示',
        5: '世界书',
        6: '推理',
      }[Number(value)] || String(value));

      const regexPane = h('div', { className: 'tt-pane' },
        h('h2', { className: 'tt-h' }, '正则脚本'),
        h('p', { className: 'tt-sub' },
          '显示正则在面板渲染时生效。提示词正则处理用户输入和世界书，辅助生成也会处理助手历史。'),
        regexState.status === 'error'
          ? h('div', { className: 'tt-note', style: { color: 'var(--tt-danger)' } }, regexState.message)
          : regexState.status !== 'ok'
            ? h('div', { className: 'tt-note' }, '打开本页即可读取规则…')
            : (() => {
              const rows = regexState.rows;
              const disabled = rows.filter((row) => row.disabled).length;
              return h('div', null,
                h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 } },
                  previewChip('合计', `${rows.length} 条`),
                  previewChip('启用', `${rows.length - disabled}`),
                  previewChip('卡内', `${rows.filter((row) => row.source === '卡').length}`),
                  previewChip('预设', `${rows.filter((row) => row.source === '预设').length}`)),
                rows.map((row, index) => {
                  const promptSide = !row.disabled && (!row.markdownOnly || row.promptOnly);
                  const displaySide = !row.disabled && (!row.promptOnly || row.markdownOnly);
                  const where = [];
                  if (promptSide && row.placement.includes(1)) where.push('用户输入');
                  if (promptSide && row.placement.includes(5)) where.push('世界书');
                  if (promptSide && row.placement.includes(2)) where.push('助手历史（辅助生成）');
                  if (displaySide && row.placement.includes(2)) where.push('显示');
                  return h('div', {
                    key: row.id + ':' + index,
                    className: 'tt-card',
                    style: { padding: '8px 10px', marginBottom: 6, opacity: row.disabled ? 0.5 : 1 },
                  },
                    h('div', { style: { display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 4 } },
                      h('span', { className: 'tt-badge' }, row.source),
                      h('b', { style: { fontSize: 12.5 } }, row.name),
                      h('div', { className: 'tt-spacer' }),
                      h('span', { className: 'tt-note' }, row.disabled ? '已禁用' : (where.join(' / ') || '不生效'))),
                    h('div', { className: 'tt-note', style: { fontFamily: 'var(--dsw-font-family-mono, ui-monospace, monospace)', fontSize: 11 } },
                      `${row.findRegex || '(空)'}  →  ${JSON.stringify(row.replaceString || '')}`),
                    h('div', { className: 'tt-note' },
                      `placement ${JSON.stringify(row.placement)}` +
                      (row.markdownOnly ? ' · markdownOnly' : '') +
                      (row.promptOnly ? ' · promptOnly' : '') +
                      (row.minDepth != null ? ` · 深度 ${row.minDepth}~${row.maxDepth ?? '∞'}` : '')),
                  );
                }));
            })());

      const pane = view === 'cards' ? cardsPane
        : view === 'lore' ? lorePane
          : view === 'presets' ? presetsPane
            : view === 'preview' ? previewPane
              : view === 'regex' ? regexPane
                : view === 'extensions' ? extPane
                : view === 'settings' ? settingsPane
                  : chatPane;

      const toastNodes = toasts.map((toast) => h('div', { key: toast.id, className: 'tt-toast ' + toast.level },
        toast.title ? h('b', null, toast.title) : null,
        toast.message));

      const finishPopup = (result) => {
        setModal(null);
        thHostRef.current?.popupResult(modal.id, result);
      };
      const modalNode = modal ? h(PanelDialog, { key: modal.id, id: 'tt-script-dialog', title: modal.options?.title || '酒馆助手',
        onDismiss: () => finishPopup(POPUP_RESULT.CANCELLED) },
        h('div', { className: 'tt-dialog-body' },
          h('div', { dangerouslySetInnerHTML: { __html: sanitizeHtml(modal.content || '') } }),
          modal.type === POPUP_TYPE.INPUT ? h('input', {
            'data-tt-dialog-focus': '', className: 'tt-search', 'aria-label': '弹窗输入',
            defaultValue: modal.inputValue || '',
            onChange: (e) => { modal.__value = e.target.value; },
            onKeyDown(e) {
              if (!shouldSubmit(e)) return;
              e.preventDefault();
              finishPopup(e.target.value);
            },
          }) : null,
          h('div', { className: 'tt-dialog-actions' },
            h('button', { className: 'tt-btn', onClick: () => finishPopup(POPUP_RESULT.CANCELLED) }, '取消'),
            h('button', { className: 'tt-btn tt-primary', onClick: () => finishPopup(
              modal.type === POPUP_TYPE.INPUT ? (modal.__value ?? modal.inputValue ?? '') : POPUP_RESULT.AFFIRMATIVE,
            ) }, '确定'),
          ),
        ),
      ) : null;

      const header = h('header', { className: 'tt-top' },
        h('div', { className: 'tt-heading' },
          compact ? h(ToolButton, { icon: 'menu', label: '会话与页面', expanded: drawerOpen,
            onClick: () => setDrawerOpen(true) }) : null,
          h('h1', { className: 'tt-brand' }, view === 'chat' ? '对话' : '角色扮演'),
        ),
        h('div', { className: 'tt-context', 'aria-label': '角色、预设和模型' },
          h('label', { className: 'tt-chip' },
            h('span', null, '角色'),
            h('select', {
              value: store.activeCardId || '',
              onChange: (e) => {
                patchStore({ activeCardId: e.target.value });
                const card = store.cards.find((item) => item.id === e.target.value);
                if (card) ensureCard(card);
              },
            }, h('option', { value: '', disabled: true }, '未选择'), store.cards.map((card) => h('option', { key: card.id, value: card.id }, card.name))),
          ),
          h('label', { className: 'tt-chip' },
            h('span', null, '预设'),
            h('select', {
              value: store.activePresetId || '',
              onChange: (e) => selectPreset(e.target.value || null),
            }, h('option', { value: '', disabled: true }, '未选择'),
            store.presets.map((preset) => h('option', { key: preset.id, value: preset.id }, preset.name))),
          ),
          h('label', { className: 'tt-chip' },
            h('span', null, '模型'),
            h('select', {
              key: activeId, defaultValue: '', disabled: !activeId || !bridge?.ok || !models.length,
              onChange: async (e) => {
                const raw = e.target.value;
                if (!raw || !activeId) { log('先选一局再切模型'); return; }
                const cut = raw.indexOf('/');
                const provider = cut > 0 ? raw.slice(0, cut) : '';
                const model = cut > 0 ? raw.slice(cut + 1) : raw;
                const done = await bridge.selectModel(activeId, provider, model);
                log(done ? `模型已切到 ${raw}` : `模型切换失败：${raw}`);
              },
            },
            h('option', { value: '', disabled: true }, models.length ? '跟随会话' : '默认模型'),
            models.map((model) => {
              const value = model && model.provider ? model.provider + '/' + model.model : String(model);
              const label = (model && (model.label || model.model)) || value;
              return h('option', { key: value, value }, String(label));
            })),
          ),
        ),
      );

      return h('div', { className: 'tt-root' + (compact ? ' compact' : ''), 'data-tt-theme': store.theme, ref: rootRef },
        h('style', null, CSS),
        compact ? null : sidebar,
        h('main', { className: 'tt-main' }, header, pane),
        compact && drawerOpen ? h(PanelDialog, { id: 'tt-navigation', title: archiveView ? '归档记录' : '会话与页面', drawer: true,
          onDismiss: () => setDrawerOpen(false) }, sidebar) : null,
        h('div', { className: 'tt-thframe' + (thShow ? ' on' : '') },
          h('div', { className: 'tt-thbar' },
            h('span', null, '酒馆助手脚本界面'),
            h('span', { className: 'tt-badge' }, thReady ? '运行中' : '未就绪'),
            h('div', { className: 'tt-spacer' }),
            h(ToolButton, { icon: 'close', label: '关闭脚本界面', onClick: () => setThShow(false) }),
          ),
          h('div', { className: 'tt-thbox', ref: thFrameRef }),
        ),
        h('div', { className: 'tt-toasts', role: 'status' }, toastNodes),
        greetingPick ? h(PanelDialog, { id: 'tt-greeting', title: `选择开场白 · ${greetingPick.card.name}`,
          onDismiss: () => setGreetingPick(null) },
            greetingPick.options.map((option) => h('button', {
                key: option.id,
                className: 'tt-greet',
                onClick: () => chooseOpening(greetingPick, option),
              },
                h('b', null, option.label),
                h('div', { className: 'tt-greet-text' }, openingPreview(option.text)),
              )),
            h('div', { className: 'tt-dialog-actions' },
              h('button', { className: 'tt-btn', onClick: () => setGreetingPick(null) }, '取消')),
          ) : null,
        modalNode,
        sessionDialog ? h(PanelDialog, { id: 'tt-session-dialog', title: sessionDialog.ids ? '归档会话' : '重命名会话',
          onDismiss: () => { if (!sessionActionRef.current) setSessionDialog(null); } },
          sessionDialog.ids
            ? h('p', { className: 'tt-dialog-body' }, sessionDialog.title
              ? `将「${sessionDialog.title}」移出列表。你可以从归档记录恢复。`
              : `将 ${sessionDialog.ids.length} 个会话移出列表。你可以从归档记录恢复。`)
            : h('input', { className: 'tt-search tt-session-search', 'data-tt-dialog-focus': '', 'aria-label': '会话名称',
              value: sessionDialog.title, disabled: sessionActionBusy, onChange: (event) => setSessionDialog({ ...sessionDialog, title: event.target.value }),
              onKeyDown: (event) => { if (shouldSubmit(event)) { event.preventDefault(); renameSelectedSession(); } },
            }),
          h('div', { className: 'tt-dialog-actions' },
            h('button', { className: 'tt-btn', disabled: sessionActionBusy, onClick: () => setSessionDialog(null) }, '取消'),
            h('button', { className: 'tt-btn tt-primary', disabled: sessionActionBusy || (!sessionDialog.ids && !sessionDialog.title.trim()),
              onClick: sessionDialog.ids ? archiveSelectedSessions : renameSelectedSession,
            }, sessionActionBusy ? '处理中…' : sessionDialog.ids ? '确认归档' : '保存名称'),
          ),
        ) : null,
        clearVarsConfirm ? h(PanelDialog, { id: 'tt-clear-vars', title: '清空本局变量', onDismiss: () => setClearVarsConfirm(null) },
          h('div', null, '本局的消息变量和脚本对楼层的改写将被清空。'),
          h('div', { className: 'tt-dialog-actions' },
            h('button', { className: 'tt-btn', onClick: () => setClearVarsConfirm(null) }, '取消'),
            h('button', { className: 'tt-btn', onClick: () => {
              setClearVarsConfirm(null);
              if (activeIdRef.current !== clearVarsConfirm) return;
              updateTh((prev) => ({ ...prev,
                messages: { ...prev.messages, [clearVarsConfirm]: {} }, overrides: { ...prev.overrides, [clearVarsConfirm]: {} },
              }));
            } }, '确认清空'),
          ),
        ) : null,
      );
    }

    function sanitizeExtensions(extensions) {
      const copy = extensions && typeof extensions === 'object' ? { ...extensions } : {};
      delete copy.tavern_helper;
      delete copy.regex_scripts;
      return copy;
    }

    const STORE_ROOT = (() => {
      const first = Array.isArray(SNAPSHOT.roots) ? String(SNAPSHOT.roots[0] || '') : '';
      // 快照的根是 <项目根>/参考；会话的 cwd 用项目根（workspaceFiles 的作用域）。
      return first.replace(/[\\/][^\\/]*$/, '');
    })();

    const BUILTIN_EXTENSIONS = [
      {
        id: 'js-slash-runner',
        name: '酒馆助手（JS-Slash-Runner）',
        repo: 'N0VI028/JS-Slash-Runner',
        description: 'ST 扩展宿主：运行卡内脚本、变量与前端 UI。内置只读兼容层。',
      },
      {
        id: 'st-prompt-template',
        name: '提示词模板（ST-Prompt-Template）',
        repo: 'zonde306/ST-Prompt-Template',
        description: '在 prompt / 角色卡 / 世界书里渲染 EJS（<% %>）。Host 侧内置 EJS 引擎。',
      },
    ];

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
        } catch { /* ignore */ }
      }
      render() {
        const error = this.state.error;
        if (error) {
          const detail = error.stack || error.message || String(error);
          try { window.__dshTT = { error: detail, at: Date.now() }; } catch { /* ignore */ }
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
      inject: ['slots', 'remote', 'remote.session', 'remote.workspaceFiles', 'workspaces', 'sessions'],
      apply(ctx) {
        try {
          ctx.slots.inject('main', () => ctx.slots.register(
            { name: 'main', key: 'roleplay' },
            // 把槽位传入的 props 透传给 Panel：宿主目前不传业务 props，
            // 但测试可以借 `__initialView` 把面板渲染到指定页签。
            (slotProps) => h('div', { style: { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' } },
              h(Boundary, null, h(Panel, { __ctx: ctx, __initialView: slotProps && slotProps.__initialView }))),
          ));
          ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist', id: 'roleplay', order: 20, label: () => '角色扮演',
          }, PanelIcon));
          console.info('[dsh-tt] client module loaded');
        } catch (error) {
          console.error('[dsh-tt] client activation failed', error);
          try { window.__dshTT = { error: String(error && error.stack || error), at: Date.now(), phase: 'apply' }; } catch { /* ignore */ }
          throw error;
        }
      },
    };
  },
});
