// 角色扮演（Client）—— 面板：局列表 / 窄顶栏 / 聊天区 / composer / 资产与 TH 宿主
// 构建时由 tools/build-client.mjs 注入资产快照、TH 核心与 shim 源码。
window.__ModuleLoader__.load({
  id: '@dsh-tt/roleplay',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useMemo, useRef, useCallback } = React;

    const SNAPSHOT = __SNAPSHOT__;
    const TAVERN_CORE_SRC = __TAVERN_CORE__;
    const TAVERN_SHIM_SRC = __TAVERN_SHIM__;
    const TAVERN_ZOD_SRC = __TAVERN_ZOD__;
    const WASM_PROTOTYPE_BASE64 = __WASM_PROTOTYPE__;
    /* __WASM_ADAPTER__ */
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
    const CSS = `
      .tt-root{position:relative;height:100%;display:flex;flex-direction:column;overflow:hidden;
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
        background:var(--dsw-alias-background-primary,#fff);font-size:12px;color:inherit;
        max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .tt-chip select{border:0;background:transparent;font:inherit;color:inherit;outline:none;max-width:170px;}
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
        color:inherit;opacity:.7;cursor:pointer;padding:0 2px;}
      .tt-tab:hover{background:var(--dsw-alias-background-tertiary,rgba(0,0,0,.05));opacity:1;}
      .tt-tab.on{background:var(--dsw-alias-background-primary,#fff);opacity:1;font-weight:600;
        box-shadow:0 1px 2px rgba(0,0,0,.08);}
      .tt-main{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;}
      .tt-pane{flex:1;overflow:auto;padding:18px 22px;min-height:0;}
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
      .tt-sub{font-size:12px;opacity:.55;margin:0 0 14px;}
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
      .tt-section{font-size:12px;font-weight:600;margin:18px 0 8px;letter-spacing:-.01em;}
      .tt-line{display:flex;align-items:flex-start;gap:10px;padding:7px 8px;border-radius:8px;border:1px solid transparent;}
      .tt-line:hover{background:var(--dsw-alias-background-tertiary,rgba(0,0,0,.035));}
      .tt-line.on{border-color:var(--dsw-alias-border-secondary,rgba(0,0,0,.1));background:var(--dsw-alias-background-primary,#fff);}
      .tt-line .tt-grow{flex:1;min-width:0;}
      .tt-line b{font-size:12.5px;font-weight:500;display:block;}
      .tt-line .tt-tagline{font-size:11px;opacity:.55;margin-top:2px;line-height:1.5;overflow:hidden;text-overflow:ellipsis;}
      .tt-tag{display:inline-flex;align-items:center;height:18px;padding:0 5px;border-radius:5px;font-size:10px;
        background:var(--dsw-alias-background-tertiary,rgba(0,0,0,.06));opacity:.8;margin-right:4px;}
      .tt-tag.acc{background:rgba(10,132,255,.14);color:var(--dsw-alias-text-primary,inherit);opacity:1;}
      .tt-pre{font-family:var(--dsw-font-family-mono,ui-monospace,monospace);font-size:11px;line-height:1.6;
        white-space:pre-wrap;word-break:break-word;background:var(--dsw-alias-background-tertiary,rgba(0,0,0,.04));
        border-radius:8px;padding:10px;margin:6px 0 0;max-height:260px;overflow:auto;}
      .tt-switch{position:relative;width:30px;height:18px;flex:none;border-radius:9px;border:0;cursor:pointer;
        background:var(--dsw-alias-border-secondary,rgba(0,0,0,.18));transition:background 140ms ease;}
      .tt-switch:after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;
        box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform 140ms cubic-bezier(.23,1,.32,1);}
      .tt-switch.on{background:var(--dsw-alias-background-accent,#0a84ff);}
      .tt-switch.on:after{transform:translateX(12px);}
      .tt-search{height:28px;border-radius:7px;border:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.12));
        background:var(--dsw-alias-background-primary,#fff);font:inherit;font-size:12px;padding:0 10px;outline:none;color:inherit;}
      .tt-cols{display:grid;grid-template-columns:220px minmax(0,1fr);gap:14px;align-items:start;}
      .tt-col-list{max-height:calc(100vh - 250px);overflow:auto;border-right:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.08));padding-right:8px;}
      .tt-meta-line{font-size:11px;opacity:.6;margin:0 0 8px;line-height:1.6;}
      .tt-toasts{position:fixed;right:18px;bottom:18px;z-index:60;display:flex;flex-direction:column;gap:8px;max-width:360px;}
      .tt-toast{padding:9px 12px;border-radius:10px;font-size:12px;line-height:1.5;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.18);
        background:rgba(28,28,30,.92);animation:tt-in 160ms cubic-bezier(.23,1,.32,1);}
      .tt-toast.error{background:rgba(215,45,45,.94);}
      .tt-toast.warning{background:rgba(190,120,10,.94);}
      .tt-toast.success{background:rgba(28,140,80,.94);}
      .tt-toast b{display:block;font-size:11px;opacity:.8;margin-bottom:2px;}
      @keyframes tt-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
      .tt-modal-bg{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.32);display:flex;align-items:center;justify-content:center;padding:24px;}
      .tt-modal{width:min(680px,92vw);max-height:80vh;overflow:auto;border-radius:12px;padding:16px;
        background:var(--dsw-alias-background-primary,#fff);box-shadow:0 18px 60px rgba(0,0,0,.28);font-size:12.5px;line-height:1.65;}
      .tt-modal h3{font-size:13px;margin:0 0 8px;}
      .tt-modal .tt-modal-body{margin:0 0 12px;max-height:52vh;overflow:auto;}
      .tt-modal input{width:100%;height:30px;border-radius:7px;border:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.12));
        padding:0 9px;font:inherit;margin-bottom:10px;}
      .tt-greet{display:flex;flex-direction:column;gap:3px;width:100%;text-align:left;border:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.1));
        border-radius:9px;padding:10px 12px;margin:0 0 8px;background:var(--dsw-alias-background-primary,#fff);cursor:pointer;font:inherit;color:inherit;
        transition:background 140ms ease,transform 140ms cubic-bezier(.23,1,.32,1);}
      .tt-greet:hover{background:var(--dsw-alias-background-secondary,rgba(0,0,0,.03));}
      .tt-greet:active{transform:scale(.995);}
      .tt-greet b{font-size:12.5px;font-weight:600;}
      .tt-greet span{font-size:11px;opacity:.5;}
      .tt-greet-text{font-size:12.5px;line-height:1.6;opacity:.85;white-space:pre-wrap;margin-top:2px;}
      .tt-search{height:26px;border-radius:7px;border:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.12));
        background:var(--dsw-alias-background-primary,#fff);padding:0 8px;font:inherit;font-size:12px;min-width:180px;outline:none;}
      .tt-search:focus{border-color:var(--dsw-alias-border-accent,#0a84ff);}
      .tt-thframe{position:absolute;left:-12000px;top:0;width:900px;height:700px;z-index:30;display:flex;flex-direction:column;
        background:var(--dsw-alias-background-primary,#fff);overflow:hidden;}
      .tt-thframe.on{left:0;top:0;right:0;bottom:0;width:auto;height:auto;}
      .tt-thbar{height:36px;flex:none;display:flex;align-items:center;gap:8px;padding:0 10px;
        border-bottom:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.08));
        background:var(--dsw-alias-background-secondary,rgba(246,246,248,.9));font-size:12px;}
      .tt-thbox{flex:1;min-height:0;background:#fff;}
      .tt-thbox iframe{width:100%;height:100%;border:0;display:block;background:#fff;}
      .tt-badge{display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:9px;font-size:10px;
        background:rgba(10,132,255,.14);}
      @media (prefers-reduced-motion: reduce){.tt-root *{transition:none !important;scroll-behavior:auto !important;animation:none !important;}}
    `;

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

    function cardRegexScripts(raw) {
      const inner = innerOf(raw);
      const scripts = inner?.extensions?.regex_scripts;
      return Array.isArray(scripts) ? scripts : [];
    }

    function cardTavernScripts(raw) {
      const inner = innerOf(raw);
      const scripts = inner?.extensions?.tavern_helper?.scripts;
      return Array.isArray(scripts) ? scripts : [];
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
      try { session = ctx && ctx.remote ? ctx.remote.session : null; } catch (error) {
        log('ctx.remote.session 访问失败：' + (error && (error.message || error)));
      }
      try { files = ctx && ctx.remote ? ctx.remote.workspaceFiles : null; } catch { files = null; }
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

      return {
        ok,
        hasFiles: Boolean(files),
        async list() {
          const value = await call('session/list', () => session.list({}));
          const rows = Array.isArray(value) ? value : (value && (value.sessions || value.rows || value.items)) || [];
          return Array.isArray(rows) ? rows : [];
        },
        async create(presetId) {
          return call('session/create', () => session.create({ agentPreset: presetId, cwd: STORE_ROOT }));
        },
        async rename(sessionId, title) {
          try { return await call('session/rename', () => session.rename({ sessionId, title })); }
          catch { return null; }
        },
        async prompt(sessionId, text, binding) {
          const wire = (binding ? '\u0000TT\u0000' + JSON.stringify(binding) + '\u0000TT\u0000' : '') + text;
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
    function bytesToString(bytes) {
      let out = '';
      const step = 0x8000;
      for (let i = 0; i < bytes.length; i += step) {
        out += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
      }
      return out;
    }

    function decodeUtf8(bytes) {
      return new TextDecoder('utf-8').decode(bytes);
    }

    function parseJsonText(text) {
      return JSON.parse(String(text ?? '').replace(/^\uFEFF/, ''));
    }

    function parseCardPng(bytes) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const chunkText = (data) => {
        const nul = data.indexOf(0);
        if (nul <= 0) return null;
        const keyword = bytesToString(data.subarray(0, nul));
        const payload = bytesToString(data.subarray(nul + 1));
        return { keyword, payload };
      };
      const decode = (payload, isUtf8) => {
        const text = isUtf8 ? payload : new TextDecoder('utf-8').decode(Uint8Array.from(atob(payload), (c) => c.charCodeAt(0)));
        return JSON.parse(text);
      };

      let offset = 8;
      while (offset + 12 <= bytes.length) {
        const length = view.getUint32(offset);
        const type = bytesToString(bytes.subarray(offset + 4, offset + 8));
        const start = offset + 8;
        const data = bytes.subarray(start, start + length);
        if (type === 'tEXt') {
          const parsed = chunkText(data);
          if (parsed && (parsed.keyword === 'chara' || parsed.keyword === 'ccv3')) return decode(parsed.payload, false);
        } else if (type === 'iTXt') {
          const nul = data.indexOf(0);
          if (nul > 0) {
            const keyword = bytesToString(data.subarray(0, nul));
            if (keyword === 'chara' || keyword === 'ccv3') {
              const flag = data[nul + 1];
              if (flag === 0) {
                const langEnd = data.indexOf(0, nul + 3);
                const transEnd = data.indexOf(0, langEnd + 1);
                return decode(new TextDecoder('utf-8').decode(data.subarray(transEnd + 1)), true);
              }
              throw new Error('PNG 里的角色卡是压缩块，暂不支持');
            }
          }
        }
        offset = start + length + 4;
        if (type === 'IEND') break;
      }
      throw new Error('这个 PNG 里没有 chara / ccv3 文本块');
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

    function applyDisplayRegex(text, rules, placement = 2) {
      let out = String(text ?? '');
      for (const rule of rules || []) {
        if (!rule || rule.disabled) continue;
        if (rule.promptOnly === true && rule.markdownOnly !== true) continue;
        const placements = Array.isArray(rule.placement) ? rule.placement : [];
        if (placements.length && placements.indexOf(Number(placement)) < 0) continue;
        try {
          const raw = String(rule.findRegex || '');
          const match = raw.match(/^\/([\s\S]*)\/([a-z]*)$/);
          const re = match ? new RegExp(match[1], match[2]) : new RegExp(raw, 'g');
          out = out.replace(re, String(rule.replaceString ?? ''));
        } catch { /* ignore */ }
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

    // ───────────────────────────── TH 宿主 ─────────────────────────────
    function buildTavernSrcdoc(init) {
      const safeJson = JSON.stringify(init).replace(/</g, '\\u003c');
      const core = String(TAVERN_CORE_SRC).replace(/<\/script/gi, '<\\/script');
      const shimLiteral = JSON.stringify(String(TAVERN_SHIM_SRC)).replace(/</g, '\\u003c');
      return [
        '<!doctype html><html><head><meta charset="utf-8">',
        '<style>html,body{margin:0;padding:0;background:#fff;color:#1c1c1e;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
        '#tt-fallback{padding:24px;font-size:12px;color:#888;}',
        '.TH-toastr{}</style></head><body>',
        '<div id="chat"></div><div id="extensions_settings"></div><div id="tt-fallback">TH 脚本界面</div>',
        `<script>window.__TT_INIT__ = ${safeJson};<\/script>`,
        `<script>${core}<\/script>`,
        `<script type="module">import('data:text/javascript;base64,${TAVERN_ZOD_SRC}').then(function(zod){ window.z = zod; var script = document.createElement('script'); script.textContent = ${shimLiteral}; document.body.appendChild(script); }).catch(function(error){ window.parent.postMessage({__ttChild:true,tt:'log',level:'error',text:'酒馆助手 Zod 4 加载失败：' + String(error)}, '*'); });<\/script>`,
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
        onSave, onRefresh, onReady,
      } = options;
      let disposed = false;
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals');
      frame.setAttribute('title', '酒馆助手脚本宿主');
      frame.style.cssText = 'width:100%;height:100%;border:0;display:block;background:#fff;';
      frame.srcdoc = buildTavernSrcdoc(init);
      container.appendChild(frame);

      const emitLog = (level, text) => { try { onLog(level, text); } catch { /* ignore */ } };

      function onMessageFromChild(event) {
        if (disposed || event.source !== frame.contentWindow) return;
        const data = event.data;
        if (!data || data.__ttChild !== true) return;
        try {
          switch (data.tt) {
            case 'boot': emitLog('info', `TH 宿主启动：${data.charName || ''}，${data.scriptCount || 0} 个脚本`); break;
            case 'ready': onReady && onReady(data); emitLog('info', `TH 宿主就绪（${data.scriptCount || 0} 个脚本${data.module ? '，含 module' : ''}${data.errors ? '，错误 ' + data.errors + ' 个' : ''}）`); break;
            case 'log': emitLog(data.level || 'info', data.text); break;
            case 'vars': onVars && onVars(data); break;
            case 'message': onMessage && onMessage(data); break;
            case 'chat-updated': onChatUpdated && onChatUpdated(data.indices || []); break;
            case 'chat-reload': onChatReload && onChatReload(); break;
            case 'toast': onToast && onToast(data); break;
            case 'popup': onPopup && onPopup(data); break;
            case 'settings': onSettings && onSettings(data.value || {}); break;
            case 'user-message': onUserMessage && onUserMessage(data.text || ''); break;
            case 'system-message': onSystemMessage && onSystemMessage(data.text || ''); break;
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
      const [loreBookId, setLoreBookId] = useState('card');
      const [loreSearch, setLoreSearch] = useState('');
      const [loreOpen, setLoreOpen] = useState(null);
      const [promptSearch, setPromptSearch] = useState('');
      const [promptOpen, setPromptOpen] = useState(null);
      const [varOpen, setVarOpen] = useState(false);
      const [previewSearch, setPreviewSearch] = useState('');
      const [previewCopyHint, setPreviewCopyHint] = useState('');
      const [selfTest, setSelfTest] = useState(null);

      const chatRef = useRef(null);
      const scrollRef = useRef(null);
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

      const log = useCallback((line) => {
        setDiag((prev) => [...prev.slice(-79), `${new Date().toLocaleTimeString()}  ${line}`]);
      }, []);

      const bridge = useMemo(() => (ctxRef.current ? makeBridge(ctxRef.current, log) : null), [log]);

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
          const next = { ...prev, ...patch };
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
          // 默认只自动选中 RP · 开头的局；普通会话留给用户在列表里显式打开（只读）。
          setActiveId((current) => current ?? normalized.find((session) => session.title.startsWith(RP_PREFIX))?.id ?? null);
        } catch (error) {
          log(`会话列表读取失败：${error?.code || error?.message || error}`);
        }
      }, [bridge, log]);

      useEffect(() => { refreshSessions(); }, [refreshSessions]);

      useEffect(() => {
        if (!bridge) return;
        bridge.models().then((list) => setModels(Array.isArray(list) ? list.slice(0, 40) : []));
      }, [bridge]);

      // 拉取当前会话事件
      useEffect(() => {
        if (!activeId || !bridge?.ok) return;
        let cancelled = false;
        let timer = null;
        const tick = async () => {
          try {
            const records = await bridge.events(activeId);
            if (cancelled) return;
            setFloors(toFloors(records));
          } catch { /* keep polling */ }
          if (!cancelled) timer = setTimeout(tick, 1200);
        };
        tick();
        return () => { cancelled = true; if (timer) clearTimeout(timer); };
      }, [activeId, bridge]);

      useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }, [floors.length]);

      // ── 资产加载 ───────────────────────────────────────────────
      const readScopeSession = useCallback(() => {
        return activeIdRef.current || sessionsRef.current[0]?.id || null;
      }, []);

      const loadAsset = useCallback(async (item, kind) => {
        if (!item) return null;
        const key = `${kind}:${item.id}`;
        if (assetCacheRef.current.has(key)) return assetCacheRef.current.get(key);
        let data = item.raw || null;
        if (!data && item.filePath && bridge?.hasFiles) {
          const sessionId = readScopeSession();
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

      const ensureCard = useCallback(async (card) => {
        const data = await loadAsset(card, 'card');
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

      const inferMetaFromTitle = useCallback((title) => {
        if (!title || !title.startsWith(RP_PREFIX)) return null;
        const rest = title.slice(RP_PREFIX.length);
        const card = store.cards.find((item) => rest.startsWith(item.name));
        return card ? { cardId: card.id, presetId: store.activePresetId } : null;
      }, [store.cards, store.activePresetId]);

      const selectSession = useCallback((session) => {
        setActiveId(session.id);
        setView('chat');
        const meta = store.sessionMeta[session.id] || inferMetaFromTitle(session.title);
        if (meta?.cardId && store.cards.some((card) => card.id === meta.cardId)) {
          patchStore({ activeCardId: meta.cardId });
        }
        if (meta?.presetId && store.presets.some((preset) => preset.id === meta.presetId)) {
          patchStore({ activePresetId: meta.presetId });
        }
        if (meta && !store.sessionMeta[session.id]) {
          patchStore({ sessionMeta: { ...store.sessionMeta, [session.id]: meta } });
        }
      }, [store.sessionMeta, inferMetaFromTitle, patchStore]);

      // 开场白选项：first_mes 在前，alternate_greetings 依次在后（空白的丢掉）。
      const greetingOptionsOf = useCallback(async (card) => {
        if (!card) return [];
        const raw = await ensureCard(card);
        const inner = innerOf(raw);
        const first = String(inner.first_mes || inner.firstMes || '').trim();
        const alternates = (Array.isArray(inner.alternate_greetings)
          ? inner.alternate_greetings
          : (Array.isArray(inner.alternateGreetings) ? inner.alternateGreetings : []))
          .map((text) => String(text || '').trim())
          .filter(Boolean);
        const options = [];
        if (first) options.push({ id: 'first', label: '首条问候', text: first });
        alternates.forEach((text, index) => {
          options.push({ id: 'alt-' + index, label: `备选 ${index + 1}`, text });
        });
        return options;
      }, [ensureCard]);

      /** 真正建局：给定卡与开场白。 */
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
          // 先让 activeIdRef 指向新会话：资产读取需要用它解析 workspaceFiles 的作用域。
          setActiveId(id);
          activeIdRef.current = id;
          if (created?.sessionId) await bridge.rename(id, title);
          setView('chat');
          setFloors([]);
          thSentRef.current = false;
          patchStore({
            activeCardId: card.id,
            sessionMeta: {
              ...store.sessionMeta,
              [id]: { cardId: card.id, presetId: store.activePresetId, greeting: String(greetingText || '') },
            },
          });
          log(greetingText ? `已新建会话，开场白 ${String(greetingText).length} 字（只显示，不发送）` : '已新建会话（这张卡没有开场白）');
          await refreshSessions();
        } catch (error) {
          const message = '开局失败：' + (error && (error.code || error.message) || error);
          log(message);
          setNotice(message);
        } finally { setBusy(false); }
      }, [bridge, patchStore, refreshSessions, log, store.sessionMeta, store.activePresetId]);

      const startChat = useCallback(async (card) => {
        if (!card) return;
        if (!bridge?.ok) { setNotice('会话通道不可用：请重启应用后重试'); return; }
        setNotice('');
        try {
          const options = await greetingOptionsOf(card);
          // 有多条开场白时先让用户挑一条（ST 的 alternate_greetings 语义）。
          if (options.length > 1) {
            setGreetingPick({ card, options });
            return;
          }
          await openChat(card, options[0]?.text || '');
        } catch (error) {
          const message = '读取开场白失败：' + (error && (error.code || error.message) || error);
          log(message);
          setNotice(message);
        }
      }, [bridge, greetingOptionsOf, openChat, log]);

      const newChat = useCallback(() => { startChat(activeCard); }, [startChat, activeCard]);

      // ── TH 宿主生命周期 ────────────────────────────────────────
      const scriptEnabled = useCallback((cardId, script) => {
        const override = store.scriptOverrides?.[cardId]?.[script.id];
        if (override === undefined) return script.enabled !== false;
        return override;
      }, [store.scriptOverrides]);

      const scriptSignature = useMemo(() => {
        if (!activeCard || !activeCardRaw) return '';
        return cardTavernScripts(activeCardRaw)
          .map((script) => `${script.id}:${scriptEnabled(activeCard.id, script) ? 1 : 0}`)
          .join(',');
      }, [activeCard, activeCardRaw, scriptEnabled]);

      const hostKey = [
        activeId || '',
        activeCard?.id || '',
        activeCardRaw ? 'raw' : 'noraw',
        greeting ? 'greet' : 'nogreet',
        isRoleplaySession ? 'rp' : 'plain',
        scriptSignature,
        thReload,
      ].join('|');

      useEffect(() => {
        const container = thFrameRef.current;
        if (!container || !bridge?.ok || !activeId || !isRoleplaySession || !activeCard || !activeCardRaw) {
          setThReady(false);
          return undefined;
        }
        const scripts = cardTavernScripts(activeCardRaw).filter((script) => scriptEnabled(activeCard.id, script));
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
          regexScripts: cardRegexScripts(activeCardRaw),
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
            if (!text) return;
            const binding = bindingRef.current ? bindingRef.current() : null;
            bridge.prompt(activeId, text, binding).catch((error) => log('脚本发送失败：' + (error?.message || error)));
          },
          onSystemMessage: (text) => log('[TH/sys] ' + text),
          onTrigger: () => log('[TH] trigger 请求（DSH 侧未接通生成触发）'),
          onSave: () => log('[TH] saveChat 请求（会话由 DSH 管理，无需保存）'),
          onRefresh: () => {},
          onReady: () => setThReady(true),
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
            userName: '你',
            maxContext: PREVIEW_MAX_CONTEXT,
            worldInfoBudget: PREVIEW_WI_BUDGET,
          });
          return { status: 'ok', result, card, preset, ms: Date.now() - started };
        } catch (error) {
          return { status: 'error', message: String((error && (error.stack || error.message)) || error) };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [view, assetTick, thTick, activeCardRaw, activePresetRaw, activePreset, presetOverridesOf, ttVars, greeting]);

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
          if (!WASM_PROTOTYPE_BASE64) throw new Error('构建时未包含 WASM 原型');
          const binary = atob(WASM_PROTOTYPE_BASE64);
          const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
          const probe = createCardLengthPrototype(bytes);
          const samples = ['', '角色卡😀', '\ud800'];
          const matches = samples.every((text) => probe.length(text) === text.length);
          add('浏览器 WASM 原型', probe.mode === 'wasm' && matches,
            probe.mode === 'wasm' && matches ? '加载和 Unicode 计算通过' : (probe.error || '计算结果不一致'));
        } catch (error) {
          add('浏览器 WASM 原型', false, String(error?.message || error));
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
        presetOverridesOf, ttVars, greeting, log]);

      const buildBinding = useCallback(() => {
        const card = activeCard;
        const preset = activePreset;
        const overrides = preset?.id ? presetOverridesOf(preset.id) : {};
        const binding = {
          cardName: card?.name,
          presetName: preset?.name,
          cardJson: card?.raw || null,
          cardHash: card?.raw ? (card.hash || hashJson(card.raw)) : undefined,
          presetJson: preset?.raw || null,
          presetHash: preset?.raw ? (preset.hash || hashJson(preset.raw)) : undefined,
          // 始终发送覆盖对象（哪怕是空的），好让 Host 在清空覆盖时也能回到预设原状。
          presetOverrides: preset ? { prompts: overrides } : undefined,
          variables: ttVars,
          greeting: greeting || undefined,
        };
        return binding;
      }, [activeCard, activePreset, presetOverridesOf, ttVars, greeting]);

      bindingRef.current = buildBinding;

      // ── 发送 ──────────────────────────────────────────────────
      const send = useCallback(async () => {
        const text = draft.trim();
        if (!text || !activeId || busy) return;
        if (!isRoleplaySession) {
          setNotice('这不是角色扮演会话：信封会被写进普通会话的日志。请点「新建对话」创建一局，或切换到 RP · 开头的会话。');
          return;
        }
        setBusy(true);
        setDraft('');
        setFloors((prev) => [...prev, { id: `local-${Date.now()}`, role: 'user', text, seq: -1, time: Date.now() }]);
        try {
          await bridge.prompt(activeId, text, buildBinding());
        } catch (error) {
          log(`发送失败：${error?.code || error?.message || error}`);
          pushToast('error', String(error?.message || error), '发送失败');
        } finally { setBusy(false); }
      }, [draft, activeId, busy, bridge, buildBinding, log, pushToast, isRoleplaySession]);

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
              patchStore({
                presets: [...store.presets, {
                  id,
                  name: json.name || file.name,
                  counts: { prompts: presetPrompts(json).length, enabled: presetOrderSlots(json).filter((slot) => slot.enabled !== false).length },
                  source: 'import',
                  raw: json,
                  hash: hashJson(json),
                }],
              });
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
                  thScripts: cardTavernScripts(json).length,
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
      }, [store, patchStore, log]);

      const exportActive = useCallback(async () => {
        const payload = activePreset ? (await ensurePreset(activePreset)) : (await ensureCard(activeCard));
        if (!payload) { log('导出失败：资产没有加载'); return; }
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(activePreset || activeCard)?.name || 'export'}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }, [activePreset, activeCard, ensurePreset, ensureCard, log]);

      // ── 渲染 ──────────────────────────────────────────────────
      const displayRules = cardRegexScripts(activeCardRaw);

      const renderFloors = () => {
        const nodes = [];
        if (greeting) {
          const rawGreeting = (thState.overrides?.[activeId] || {})[0] || greeting;
          const greetingVars = { ...((thState.messages?.[activeId] || {})[0] || ttVars) };
          const greetingText = renderEjsClient(
            applyDisplayRegex(String(rawGreeting)
              .replace(/<StatusPlaceHolderImpl\s*\/>/gi, '')
              .replace(/<status_current_variable>[\s\S]*?<\/status_current_variable>/gi, ''), displayRules, 2),
            greetingVars,
          );
          nodes.push(h('div', { key: 'greeting', className: 'tt-fl' },
            h('div', { className: 'tt-av' }, String(activeCard?.name ?? 'AI').slice(0, 1)),
            h('div', { style: { minWidth: 0, flex: 1 } },
              h('div', { className: 'tt-meta' }, `${activeCard?.name ?? '角色'} · 开场白`),
              h('div', { className: 'tt-bub' }, renderMarkdown(greetingText, 'greeting')),
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
          let text = override || floor.text;
          text = String(text).replace(/<StatusPlaceHolderImpl\s*\/>/gi, '').replace(/<status_current_variable>[\s\S]*?<\/status_current_variable>/gi, '');
          text = renderEjsClient(applyDisplayRegex(text, displayRules, placement), floorVars);
          nodes.push(h('div', { key: floor.id, className: 'tt-fl' },
            h('div', { className: 'tt-av' }, floor.role === 'user' ? '你' : String(activeCard?.name ?? 'AI').slice(0, 1)),
            h('div', { style: { minWidth: 0, flex: 1 } },
              h('div', { className: 'tt-meta' },
                `${floor.role === 'user' ? '你' : (activeCard?.name ?? '角色')}${floor.time ? ' · ' + new Date(floor.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}`),
              h('div', { className: 'tt-bub' }, renderMarkdown(text, floor.id)),
            ),
          ));
        });
        return nodes;
      };

      const sidebar = h('div', { className: 'tt-side' },
        h('button', { className: 'tt-new', onClick: newChat, disabled: busy }, '+ 新建对话'),
        h('div', { className: 'tt-list' },
          sessions.length === 0
            ? h('div', { className: 'tt-empty', style: { height: 'auto', padding: '24px 12px' } }, '还没有对话')
            : sessions.slice(0, 200).map((session) => h('button', {
              key: session.id,
              className: 'tt-row' + (session.id === activeId ? ' on' : ''),
              onClick: () => selectSession(session),
            },
              h('b', null, session.title || `${RP_PREFIX}未命名`),
              h('span', null, session.updatedAt ? new Date(session.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''),
            )),
        ),
        h('div', { className: 'tt-tabs' },
          [['chat', '对话'], ['cards', '角色'], ['lore', '世界书'], ['presets', '预设'], ['preview', '预览'], ['regex', '正则'], ['extensions', '扩展'], ['settings', '设置']].map(([key, label]) =>
            h('button', {
              key, className: 'tt-tab' + (view === key ? ' on' : ''),
              onClick: () => setView(key),
            }, label)),
        ),
      );

      const chatPane = view === 'chat'
        ? h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } },
          h('div', { className: 'tt-chat', ref: scrollRef },
            (floors.length === 0 && !greeting)
              ? h('div', { className: 'tt-empty' },
                h('div', null, activeCard ? `正在与「${activeCard.name}」对话` : '先在「角色」里选一张卡'),
                h('div', { className: 'tt-note' }, '开场白只显示不发送；你的第一条消息会连同开场白一起进入模型上下文。'))
              : renderFloors()),
          notice ? h('div', { style: { margin: '0 22px 6px', padding: '8px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.6, background: 'rgba(255,59,48,.10)', color: 'var(--dsw-alias-text-primary, inherit)' } }, notice) : null,
          activeId && !isRoleplaySession
            ? h('div', { className: 'tt-note', style: { margin: '0 22px 6px' } }, '这是普通 DSH 会话：只读。点「新建对话」创建角色扮演局后再发送。')
            : null,
          h('div', { className: 'tt-comp' },
            h('div', { className: 'tt-box' },
              h('textarea', {
                className: 'tt-ta',
                ref: chatRef,
                value: draft,
                placeholder: isRoleplaySession ? '写点什么…（Enter 发送，Shift+Enter 换行）' : '先新建一局角色扮演对话…',
                onChange: (e) => setDraft(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } },
              }),
              h('div', { className: 'tt-bar' },
                h('button', { className: 'tt-ic', title: '附件（占位）', onClick: () => log('附件上传待接通') }, '📎'),
                h('button', { className: 'tt-ic', title: '语音输入（占位）', onClick: () => log('语音输入待接通') }, '🎙'),
                h('div', { className: 'tt-spacer' }),
                thReady ? h('span', { className: 'tt-note', title: '酒馆助手脚本已运行' }, 'TH ✓') : null,
                h('button', { className: 'tt-send', disabled: busy || !draft.trim() || !activeId || !isRoleplaySession, onClick: send }, busy ? '生成中…' : '发送'),
              ),
            ),
          ))
        : null;

      const cardsPane = h('div', { className: 'tt-pane' },
        h('h2', { className: 'tt-h' }, '角色卡'),
        h('p', { className: 'tt-sub' }, '点击开始对话。导入支持 Character Card V2/V3 的 JSON 与 PNG。'),
        h('div', { className: 'tt-inline', style: { marginBottom: '14px' } },
          h('label', { className: 'tt-btn' }, '导入角色卡',
            h('input', { type: 'file', accept: '.json,.png', multiple: true, style: { display: 'none' }, onChange: importFiles })),
          h('button', { className: 'tt-btn', onClick: exportActive }, '导出当前'),
          activeCardRaw ? h('span', { className: 'tt-note' },
            `${cardTavernScripts(activeCardRaw).length} 个脚本 · ${bookEntries(cardBook(activeCardRaw)).length} 条世界书 · ${cardRegexScripts(activeCardRaw).length} 条正则`) : null,
        ),
        h('div', { className: 'tt-grid' },
          store.cards.map((card) => h('div', {
            key: card.id,
            className: 'tt-card' + (card.id === store.activeCardId ? ' on' : ''),
            onClick: () => { patchStore({ activeCardId: card.id }); ensureCard(card); },
            onDoubleClick: () => startChat(card),
          },
            h('b', null, card.name),
            h('small', null, `${card.spec || ''} · 世界书 ${card.counts?.lorebookEntries ?? 0} 条 · 脚本 ${card.counts?.thScripts ?? 0}`),
            h('small', null, card.creator || (card.source === 'seed' ? '内置资产' : '导入')),
          ))),
        h('p', { className: 'tt-note', style: { marginTop: '14px' } }, '双击卡片直接开新局；单击切换当前角色。'),
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
        h('p', { className: 'tt-sub' }, '查看卡内世界书与独立世界书条目。这里是只读视图；条目触发由 Host 的激活引擎负责。'),
        h('div', { className: 'tt-inline', style: { marginBottom: '10px' } },
          h('select', {
            className: 'tt-search',
            value: loreBookId,
            onChange: (e) => { setLoreBookId(e.target.value); setLoreOpen(null); const item = store.lorebooks.find((book) => book.id === e.target.value); if (item) ensureLorebook(item); },
          }, loreOptions.map((option) => h('option', { key: option.id, value: option.id }, option.name))),
          h('input', { className: 'tt-search', placeholder: '搜索注释 / 关键词 / 内容', value: loreSearch, onChange: (e) => setLoreSearch(e.target.value) }),
          h('span', { className: 'tt-note' }, `${loreEntries.length} 条`),
          h('label', { className: 'tt-btn' }, '导入世界书',
            h('input', { type: 'file', accept: '.json', multiple: true, style: { display: 'none' }, onChange: importFiles })),
        ),
        !activeLoreBook
          ? h('div', { className: 'tt-empty', style: { height: 'auto', padding: '40px 0' } }, '这个来源还没有加载；若资产在磁盘上，等会话就绪后会自动读取。')
          : h('div', null, loreEntries.slice(0, 200).map((entry) => h('div', {
            key: entry.uid,
            className: 'tt-line' + (loreOpen === entry.uid ? ' on' : ''),
            onClick: () => setLoreOpen(loreOpen === entry.uid ? null : entry.uid),
            style: { cursor: 'pointer', flexDirection: 'column' },
          },
            h('div', { style: { display: 'flex', gap: '8px', width: '100%' } },
              h('div', { className: 'tt-grow' },
                h('b', null, entry.comment || `条目 #${entry.uid}`),
                h('div', { className: 'tt-tagline' },
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
          h('label', { className: 'tt-btn' }, '导入预设',
            h('input', { type: 'file', accept: '.json', multiple: true, style: { display: 'none' }, onChange: importFiles })),
          h('button', { className: 'tt-btn', onClick: exportActive }, '导出当前'),
          h('input', { className: 'tt-search', placeholder: '筛选 prompt', value: promptSearch, onChange: (e) => setPromptSearch(e.target.value) }),
          activePresetRaw ? h('span', { className: 'tt-note' }, `${presetPrompts(activePresetRaw).length} 条 prompt · ${presetOrderSlots(activePresetRaw).filter((slot) => slot.enabled !== false).length} 项启用`) : null,
        ),
        h('div', { className: 'tt-grid', style: { marginBottom: '14px' } },
          store.presets.map((preset) => h('div', {
            key: preset.id,
            className: 'tt-card' + (preset.id === store.activePresetId ? ' on' : ''),
            onClick: () => patchStore({ activePresetId: preset.id }),
          },
            h('b', null, preset.name),
            h('small', null, `prompts ${preset.counts?.prompts ?? 0} · 启用 ${preset.counts?.enabled ?? '-'}`),
            h('small', null, `temperature ${preset.counts?.temperature ?? '-'} · max ${preset.counts?.maxTokens ?? '-'}`),
          ))),
        !activePresetRaw
          ? h('div', { className: 'tt-empty', style: { height: 'auto', padding: '30px 0' } }, '预设正文读取中…（读取完成后可查看/启停）')
          : h('div', null,
            h('div', { className: 'tt-section' }, 'Prompt 顺序'),
            presetRows.map((row, index) => h('div', { key: row.identifier + index, className: 'tt-line' },
              h('span', { className: 'tt-tag' }, String(index + 1)),
              h('div', { className: 'tt-grow', style: { cursor: 'pointer' }, onClick: () => setPromptOpen(promptOpen === row.identifier ? null : row.identifier) },
                h('b', null, row.prompt?.name || row.identifier),
                h('div', { className: 'tt-tagline' },
                  row.marker ? 'marker / 位置占位' : `role ${row.prompt?.role || 'system'}`,
                  row.prompt?.content ? ` · ${row.prompt.content.length} 字` : '',
                  row.prompt?.injection_position === 1 ? ` · 深度注入 ${row.prompt?.injection_depth ?? 0}` : '',
                ),
                promptOpen === row.identifier && row.prompt?.content
                  ? h('pre', { className: 'tt-pre' }, String(row.prompt.content).slice(0, 20000))
                  : null,
              ),
              h('button', {
                className: 'tt-switch' + (row.enabled ? ' on' : ''),
                title: row.enabled ? '已启用' : '已停用',
                onClick: () => togglePrompt(row),
              }),
            )),
          ),
      );

      // ── 扩展 ──────────────────────────────────────────────────
      const cardScripts = activeCardRaw ? cardTavernScripts(activeCardRaw) : [];
      const enabledScripts = cardScripts.filter((script) => scriptEnabled(activeCard.id, script));

      const toggleScript = useCallback((script) => {
        if (!activeCard?.id) return;
        const nextValue = !scriptEnabled(activeCard.id, script);
        setStore((prev) => {
          const all = { ...(prev.scriptOverrides || {}) };
          const own = { ...(all[activeCard.id] || {}) };
          own[script.id] = nextValue;
          all[activeCard.id] = own;
          const next = { ...prev, scriptOverrides: all };
          saveStore(next);
          return next;
        });
        setThReload((tick) => tick + 1);
      }, [activeCard?.id, scriptEnabled]);

      const statData = ttVars?.stat_data && typeof ttVars.stat_data === 'object' ? ttVars.stat_data : null;

      const extPane = h('div', { className: 'tt-pane' },
        h('h2', { className: 'tt-h' }, '扩展'),
        h('p', { className: 'tt-sub' }, '酒馆助手兼容宿主：管理卡内脚本并使用脚本按钮。提示词模板由内置 EJS 引擎承担。'),
        h('div', { className: 'tt-inline', style: { marginBottom: '12px' } },
          h('button', { className: 'tt-btn', onClick: () => setThShow(true) }, '打开脚本界面'),
          h('button', { className: 'tt-btn', onClick: () => setThReload((tick) => tick + 1) }, '重启宿主'),
          h('button', { className: 'tt-btn', onClick: () => { updateTh((prev) => ({ ...prev, messages: { ...(prev.messages || {}), [activeId]: {} }, overrides: { ...(prev.overrides || {}), [activeId]: {} } })); } }, '清空本局变量'),
          h('span', { className: 'tt-note' }, thReady ? '宿主运行中' : (cardScripts.length ? '宿主未启动（检查卡/会话）' : '这张卡没有 TH 脚本')),
        ),
        h('div', { className: 'tt-section' }, `酒馆助手 · 卡内脚本设置（${enabledScripts.length}/${cardScripts.length} 启用）`),
        cardScripts.length === 0
          ? h('div', { className: 'tt-note' }, '当前卡没有 extensions.tavern_helper.scripts。')
          : cardScripts.map((script) => h('div', { key: script.id, className: 'tt-line' },
            h('div', { className: 'tt-grow' },
              h('b', null, script.name || script.id),
              h('div', { className: 'tt-tagline' },
                `${script.content ? String(script.content).length : 0} 字`,
                Array.isArray(script.button?.buttons) && script.button.buttons.length ? ` · ${script.button.buttons.length} 个按钮` : '',
                script.enabled === false ? ' · 卡内默认停用' : '',
              ),
            ),
            h('button', {
              className: 'tt-switch' + (scriptEnabled(activeCard.id, script) ? ' on' : ''),
              onClick: () => toggleScript(script),
            }),
          )),
        h('div', { className: 'tt-section' }, '状态变量'),
        h('div', { className: 'tt-inline', style: { marginBottom: '6px' } },
          h('button', { className: 'tt-btn', onClick: () => setVarOpen(!varOpen) }, varOpen ? '收起' : '展开'),
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
        h('p', { className: 'tt-sub' }, '会话通道、资产读取、TH 宿主与最近错误的连接状态。'),
        h('div', { className: 'tt-inline', style: { marginBottom: '10px' } },
          h('button', { className: 'tt-btn', onClick: refreshSessions }, '重新读取会话'),
          h('button', { className: 'tt-btn', onClick: () => setDiag([]) }, '清空诊断'),
          h('button', { className: 'tt-btn', onClick: runSelfTest }, '运行自检'),
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
            h('div', { className: 'tt-note', style: { color: '#c00', marginBottom: 6 } }, '管线计算失败：'),
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
            ? h('div', { className: 'tt-note', style: { marginTop: 8, color: '#c00' } },
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
          'ST 的 regex_scripts：显示侧在面板渲染时生效；提示词侧当前只做 placement=1（用户输入）与 5（世界书），' +
          'placement=2 的 prompt 规则需要改写 assistant 历史，暂不支持。'),
        regexState.status === 'error'
          ? h('div', { className: 'tt-note', style: { color: '#c00' } }, regexState.message)
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
                  if (promptSide && row.placement.includes(2)) where.push('助手历史（暂不支持）');
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

      const modalNode = modal ? h('div', { className: 'tt-modal-bg', onClick: (e) => { if (e.target === e.currentTarget) { setModal(null); if (thHostRef.current) thHostRef.current.popupResult(modal.id, POPUP_RESULT.CANCELLED); } } },
        h('div', { className: 'tt-modal' },
          h('h3', null, modal.options?.title || '酒馆助手'),
          h('div', { className: 'tt-modal-body', dangerouslySetInnerHTML: { __html: sanitizeHtml(modal.content || '') } }),
          modal.type === POPUP_TYPE.INPUT ? h('input', {
            autoFocus: true,
            defaultValue: modal.inputValue || '',
            onChange: (e) => { modal.__value = e.target.value; },
            onKeyDown: (e) => {
              if (e.key === 'Enter') {
                const value = e.target.value;
                setModal(null);
                if (thHostRef.current) thHostRef.current.popupResult(modal.id, value);
              }
            },
          }) : null,
          h('div', { className: 'tt-inline', style: { justifyContent: 'flex-end' } },
            h('button', { className: 'tt-btn', onClick: () => { setModal(null); if (thHostRef.current) thHostRef.current.popupResult(modal.id, POPUP_RESULT.CANCELLED); } }, '取消'),
            h('button', {
              className: 'tt-btn',
              onClick: () => {
                let result = POPUP_RESULT.AFFIRMATIVE;
                if (modal.type === POPUP_TYPE.INPUT) result = modal.__value ?? modal.inputValue ?? '';
                setModal(null);
                if (thHostRef.current) thHostRef.current.popupResult(modal.id, result);
              },
            }, '确定'),
          ),
        ),
      ) : null;

      return h('div', { className: 'tt-root', style: { minHeight: 0 } },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('div', { className: 'tt-top' },
          h('div', { className: 'tt-brand' }, '角色扮演'),
          h('div', { className: 'tt-spacer' }),
          h('div', { className: 'tt-chip', title: '当前角色' },
            h('span', null, '🎭'),
            h('select', {
              value: store.activeCardId || '',
              onChange: (e) => {
                patchStore({ activeCardId: e.target.value });
                const card = store.cards.find((item) => item.id === e.target.value);
                if (card) ensureCard(card);
              },
            }, store.cards.map((card) => h('option', { key: card.id, value: card.id }, card.name))),
          ),
          h('div', { className: 'tt-chip', title: '当前预设' },
            h('span', null, '📋'),
            h('select', {
              value: store.activePresetId || '',
              onChange: (e) => {
                patchStore({ activePresetId: e.target.value });
                const preset = store.presets.find((item) => item.id === e.target.value);
                if (preset) ensurePreset(preset);
              },
            }, store.presets.map((preset) => h('option', { key: preset.id, value: preset.id }, preset.name))),
          ),
          h('div', { className: 'tt-chip', title: '模型' },
            h('span', null, '⚙️'),
            h('select', {
              defaultValue: '',
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
            h('option', { value: '' }, models.length ? '跟随会话' : '默认模型'),
            models.map((model) => {
              const value = model && model.provider ? model.provider + '/' + model.model : String(model);
              const label = (model && (model.label || model.model)) || value;
              return h('option', { key: value, value }, String(label));
            })),
          ),
        ),
        h('div', { className: 'tt-body' }, sidebar, h('div', { className: 'tt-main' }, pane)),
        h('div', { className: 'tt-thframe' + (thShow ? ' on' : '') },
          h('div', { className: 'tt-thbar' },
            h('span', null, '酒馆助手脚本界面'),
            h('span', { className: 'tt-badge' }, thReady ? '运行中' : '未就绪'),
            h('div', { className: 'tt-spacer' }),
            h('button', { className: 'tt-btn', onClick: () => setThShow(false) }, '关闭界面'),
          ),
          h('div', { className: 'tt-thbox', ref: thFrameRef }),
        ),
        h('div', { className: 'tt-toasts' }, toastNodes),
        greetingPick ? h('div', {
          className: 'tt-modal-bg',
          onClick: (e) => { if (e.target === e.currentTarget) setGreetingPick(null); },
        },
          h('div', { className: 'tt-modal' },
            h('h3', null, `选择开场白 · ${greetingPick.card.name}`),
            h('div', { className: 'tt-modal-body' },
              greetingPick.options.map((option) => h('button', {
                key: option.id,
                className: 'tt-greet',
                onClick: () => {
                  const pick = greetingPick;
                  setGreetingPick(null);
                  openChat(pick.card, option.text).catch((error) => log('开局失败：' + (error?.message || error)));
                },
              },
                h('b', null, option.label),
                h('span', null, option.text.length + ' 字'),
                h('div', { className: 'tt-greet-text' },
                  option.text.length > 180 ? option.text.slice(0, 180) + '…' : option.text),
              )),
            ),
            h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
              h('button', { className: 'tt-btn', onClick: () => setGreetingPick(null) }, '取消')),
          )) : null,
        modalNode,
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
      inject: ['slots', 'remote', 'remote.session', 'remote.workspaceFiles'],
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
