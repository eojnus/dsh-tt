/* 酒馆助手（TavernHelper）兼容运行时的纯状态层。
 *
 * 这里只做数据与语义：变量五个作用域、聊天消息、事件总线、世界书、宏、STScript 子集。
 * DOM / iframe / postMessage 由 shim.js 负责。文件同时能被 Node 直接 require（测试用）。
 */
var TT_CORE = (function () {
  'use strict';

  // ── 通用工具 ────────────────────────────────────────────────
  function clone(value) {
    if (value == null || typeof value !== 'object') return value;
    try { return structuredClone(value); } catch { /* ignore */ }
    try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
  }

  function isPlainObject(value) {
    if (value == null || typeof value !== 'object') return false;
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function toPath(path) {
    if (Array.isArray(path)) return path.slice();
    if (path == null) return [];
    return String(path)
      .replace(/\[(\d+)\]/g, '.$1')
      .replace(/\[["']([^"']+)["']\]/g, '.$1')
      .split('.')
      .filter(function (part) { return part !== ''; });
  }

  function getPath(object, path, fallback) {
    if (object == null) return fallback;
    var parts = toPath(path);
    if (!parts.length) return object;
    var current = object;
    for (var i = 0; i < parts.length; i += 1) {
      if (current == null) return fallback;
      current = current[parts[i]];
    }
    return current === undefined ? fallback : current;
  }

  function setPath(object, path, value) {
    var parts = toPath(path);
    if (!parts.length) return object;
    var current = object;
    for (var i = 0; i < parts.length - 1; i += 1) {
      var part = parts[i];
      if (current[part] == null || typeof current[part] !== 'object') current[part] = {};
      current = current[part];
    }
    current[parts[parts.length - 1]] = value;
    return object;
  }

  function hasPath(object, path) {
    if (object == null) return false;
    var parts = toPath(path);
    if (!parts.length) return false;
    var current = object;
    for (var i = 0; i < parts.length; i += 1) {
      if (current == null || !Object.prototype.hasOwnProperty.call(current, parts[i])) return false;
      current = current[parts[i]];
    }
    return true;
  }

  function deletePath(object, path) {
    var parts = toPath(path);
    if (!parts.length || object == null) return false;
    var current = object;
    for (var i = 0; i < parts.length - 1; i += 1) {
      if (current == null || !Object.prototype.hasOwnProperty.call(current, parts[i])) return false;
      current = current[parts[i]];
    }
    if (current == null) return false;
    return delete current[parts[parts.length - 1]];
  }

  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a == null || b == null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (typeof a !== 'object') return false;
    var keysA = Object.keys(a);
    var keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (var i = 0; i < keysA.length; i += 1) {
      if (!Object.prototype.hasOwnProperty.call(b, keysA[i]) || !deepEqual(a[keysA[i]], b[keysA[i]])) return false;
    }
    return true;
  }

  function hashSignature(value) {
    var source;
    try { source = JSON.stringify(value); } catch { source = String(value); }
    var hash = 2166136261;
    for (var i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36) + ':' + source.length;
  }

  function pad(value) { return String(value).padStart(2, '0'); }

  function randomPick(list, random) {
    if (!list || !list.length) return '';
    return list[Math.floor(random() * list.length)];
  }

  function splitArgs(inner, sep) {
    if (inner.indexOf(sep) >= 0) return inner.split(sep).filter(function (part) { return part !== ''; });
    if (inner.indexOf(' ') >= 0) return inner.split(/\s+/).filter(Boolean);
    return [inner];
  }

  // ── 事件总线 ────────────────────────────────────────────────
  function createEventBus(onError) {
    var listeners = new Map();

    function listOf(type) {
      if (!listeners.has(type)) listeners.set(type, []);
      return listeners.get(type);
    }

    function add(type, listener, mode) {
      if (typeof listener !== 'function') throw new Error('事件监听器必须是函数');
      var entry = { fn: listener, mode: mode || 'normal' };
      var list = listOf(type);
      if (mode === 'first') list.unshift(entry);
      else if (mode === 'last') list.push(entry);
      else {
        // TH 语义：同类型事件里相同函数只注册一次
        if (list.some(function (item) { return item.fn === listener; })) return { stop: function () {} };
        list.push(entry);
      }
      return {
        stop: function () { remove(type, listener); },
      };
    }

    function remove(type, listener) {
      var list = listOf(type);
      var index = list.findIndex(function (item) { return item.fn === listener; });
      if (index >= 0) list.splice(index, 1);
    }

    function emit(type) {
      var args = Array.prototype.slice.call(arguments, 1);
      var list = listOf(type).slice();
      var pending = [];
      for (var i = 0; i < list.length; i += 1) {
        var entry = list[i];
        if (entry.mode === 'once') remove(type, entry.fn);
        try {
          var result = entry.fn.apply(globalThis, args);
          if (result && typeof result.then === 'function') pending.push(result.catch(function (error) { onError(type, error); }));
        } catch (error) {
          onError(type, error);
        }
      }
      return pending.length ? Promise.allSettled(pending) : Promise.resolve();
    }

    return {
      on: function (type, listener) { return add(type, listener, 'normal'); },
      once: function (type, listener) { return add(type, listener, 'once'); },
      makeFirst: function (type, listener) { return add(type, listener, 'first'); },
      makeLast: function (type, listener) { return add(type, listener, 'last'); },
      remove: remove,
      emit: emit,
      emitAndWait: emit,
      clearEvent: function (type) { listeners.set(type, []); },
      clearListener: function (listener) {
        listeners.forEach(function (list, type) {
          var kept = list.filter(function (item) { return item.fn !== listener; });
          listeners.set(type, kept);
        });
      },
      clearAll: function () { listeners.clear(); },
      count: function (type) { return listOf(type).length; },
    };
  }

  // ── 世界书 ──────────────────────────────────────────────────
  var POSITION_MAP = { before_char: 0, after_char: 1, before_an: 2, after_an: 3, at_depth: 4, before_em: 5, after_em: 6 };

  function normalizePosition(value) {
    if (typeof value === 'number') return value;
    return POSITION_MAP[value] == null ? 0 : POSITION_MAP[value];
  }

  function normalizeLogic(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  /** 把角色卡/世界书里的条目摊平成 TH 的 FlattenedWorldInfoEntry。 */
  function flattenEntries(entries) {
    var list = Array.isArray(entries) ? entries : [];
    return list.map(function (entry, index) {
      var ext = entry && typeof entry.extensions === 'object' && entry.extensions ? entry.extensions : {};
      var keys = Array.isArray(entry && entry.keys) ? entry.keys : (Array.isArray(entry && entry.key) ? entry.key : []);
      var secondary = Array.isArray(entry && entry.secondary_keys)
        ? entry.secondary_keys
        : (Array.isArray(entry && entry.keysecondary) ? entry.keysecondary : []);
      return {
        uid: entry && (entry.id != null ? entry.id : entry.uid != null ? entry.uid : index),
        displayIndex: ext.display_index != null ? Number(ext.display_index) : index,
        comment: String((entry && (entry.comment || entry.name)) || ''),
        disable: entry ? (entry.enabled === false || entry.disable === true) : false,
        constant: Boolean(entry && entry.constant),
        selective: entry ? entry.selective !== false : true,
        key: keys.map(String),
        selectiveLogic: normalizeLogic(ext.selectiveLogic != null ? ext.selectiveLogic : (entry && entry.selectiveLogic)),
        keysecondary: secondary.map(String),
        scanDepth: ext.scan_depth == null ? null : Number(ext.scan_depth),
        vectorized: Boolean(ext.vectorized),
        position: normalizePosition(entry && entry.position != null ? entry.position : ext.position),
        role: ext.role == null ? null : Number(ext.role),
        depth: ext.depth == null ? 4 : Number(ext.depth),
        order: Number(entry && entry.insertion_order != null
          ? entry.insertion_order
          : (entry && entry.order != null ? entry.order : 100)),
        content: String((entry && entry.content) || ''),
        useProbability: Boolean(ext.useProbability != null ? ext.useProbability : (entry && entry.useProbability)),
        probability: Number(ext.probability != null ? ext.probability : 100),
        excludeRecursion: Boolean(ext.exclude_recursion),
        preventRecursion: Boolean(ext.prevent_recursion),
        delayUntilRecursion: ext.delay_until_recursion == null ? false : ext.delay_until_recursion,
        sticky: ext.sticky == null ? null : Number(ext.sticky),
        cooldown: ext.cooldown == null ? null : Number(ext.cooldown),
        delay: ext.delay == null ? null : Number(ext.delay),
        extra: clone(ext),
      };
    });
  }

  // ── 主工厂 ──────────────────────────────────────────────────
  /**
   * @param {{
   *   card?: object, userName?: string, charName?: string, chatId?: string,
   *   worldbookName?: string, worldbookEntries?: any[],
   *   variables?: {global?: object, character?: object, chat?: object, preset?: object, script?: object},
   *   messages?: {role: string, text: string, vars?: object, hidden?: boolean, name?: string}[],
   *   extensionSettings?: object,
   *   post?: (message: object) => void,
   *   log?: (level: string, text: string) => void,
   * }} options
   */
  function createCore(options) {
    var settings = options || {};
    var post = typeof settings.post === 'function' ? settings.post : function () {};
    var log = typeof settings.log === 'function' ? settings.log : function () {};
    var card = settings.card && typeof settings.card === 'object' ? settings.card : {};
    var userName = settings.userName || '你';
    var charName = settings.charName || card.name || '角色';
    var chatId = settings.chatId || 'dsh-tt-chat';
    var worldbookName = settings.worldbookName || (card.character_book && card.character_book.name) || '角色世界书';
    var worldbookEntries = flattenEntries(settings.worldbookEntries || (card.character_book && card.character_book.entries) || []);
    var chatWorldbookName = settings.chatWorldbook?.name || null;
    if (chatWorldbookName === worldbookName) chatWorldbookName += '（本局）';
    var chatWorldbookEntries = flattenEntries(settings.chatWorldbook?.entries || []);
    var initialVars = settings.variables || {};

    var globalVars = initialVars.global && typeof initialVars.global === 'object' ? initialVars.global : {};
    var characterVars = initialVars.character && typeof initialVars.character === 'object' ? initialVars.character : {};
    var presetVars = initialVars.preset && typeof initialVars.preset === 'object' ? initialVars.preset : {};
    var scriptVars = initialVars.script && typeof initialVars.script === 'object' ? initialVars.script : {};
    var chatMetadata = { ...settings.chatMetadata, variables: initialVars.chat && typeof initialVars.chat === 'object' ? initialVars.chat : {} };
    var extensionSettings = settings.extensionSettings && typeof settings.extensionSettings === 'object'
      ? settings.extensionSettings
      : {};

    var chat = [];
    var macros = new Map();
    var currentScriptId = 'dsh-tt-script';
    var currentMessageId = -1;

    function reportError(type, error) {
      var message = error && error.stack ? error.stack : String(error);
      log('error', '[' + type + '] ' + message);
      post({ tt: 'log', level: 'error', text: '[' + type + '] ' + (error && error.message ? error.message : String(error)) });
    }

    var bus = createEventBus(reportError);

    function makeMessage(input) {
      var text = String(input && input.text != null ? input.text : '');
      var role = input && input.role === 'user' ? 'user' : (input && input.role === 'system' ? 'system' : 'assistant');
      var vars = input && input.vars && typeof input.vars === 'object' ? clone(input.vars) : {};
      return {
        name: input && input.name ? String(input.name) : (role === 'user' ? userName : charName),
        is_user: role === 'user',
        is_system: Boolean(input && input.hidden) || role === 'system',
        mes: text,
        swipe_id: 0,
        swipes: [text],
        swipe_info: [{}],
        variables: [vars],
        extra: {},
      };
    }

    /** 用父窗口给的聊天记录刷新镜像；保留已有变量与脚本对正文的本地修改。 */
    function applyChat(nextMessages, options) {
      var opts = options || {};
      var list = Array.isArray(nextMessages) ? nextMessages : [];
      var added = [];
      for (var i = 0; i < list.length; i += 1) {
        var input = list[i] || {};
        var text = String(input.text != null ? input.text : '');
        var role = input.role === 'user' ? 'user' : (input.role === 'system' ? 'system' : 'assistant');
        var hidden = Boolean(input.hidden);
        var existing = chat[i];
        if (!existing) {
          existing = makeMessage({ role: role, text: text, vars: input.vars, hidden: hidden, name: input.name });
          chat[i] = existing;
          added.push(i);
          continue;
        }
        var edited = existing.__ttEdited === true;
        var keepLocal = edited && (existing.mes === text || existing.mes.indexOf(text) === 0);
        if (!keepLocal) {
          existing.mes = text;
          existing.swipes[existing.swipe_id || 0] = text;
          existing.__ttEdited = false;
        }
        existing.is_user = role === 'user';
        existing.is_system = hidden || role === 'system';
        if (input.name) existing.name = String(input.name);
        if (opts.initial && input.vars && typeof input.vars === 'object') {
          existing.variables[existing.swipe_id || 0] = clone(input.vars);
        } else if (!existing.variables[existing.swipe_id || 0]) {
          existing.variables[existing.swipe_id || 0] = input.vars && typeof input.vars === 'object' ? clone(input.vars) : {};
        }
      }
      if (chat.length > list.length) chat.length = list.length;
      if (opts.emitAdded) {
        for (var j = 0; j < added.length; j += 1) {
          var index = added[j];
          var message = chat[index];
          if (!message) continue;
          if (message.is_user) bus.emit(TAVERN_EVENTS.MESSAGE_SENT, index);
          else if (!message.is_system) bus.emit(TAVERN_EVENTS.MESSAGE_RECEIVED, index, 'normal');
        }
      }
      return added;
    }

    function roleOf(message) {
      if (message.is_system) return 'system';
      return message.is_user ? 'user' : 'assistant';
    }

    function publicMessage(message, index, includeSwipes) {
      var swipeId = message.swipe_id || 0;
      var swipes = (message.swipes || [message.mes]).slice();
      var data = clone((message.variables && message.variables[swipeId]) || {});
      var info = clone((message.swipe_info && message.swipe_info[swipeId]) || {});
      if (includeSwipes) {
        return {
          message_id: index,
          name: message.name,
          role: roleOf(message),
          is_hidden: Boolean(message.is_system),
          swipe_id: swipeId,
          swipes: swipes,
          swipes_data: (message.variables || [{}]).map(clone),
          swipes_info: (message.swipe_info || [{}]).map(clone),
        };
      }
      return {
        message_id: index,
        name: message.name,
        role: roleOf(message),
        is_hidden: Boolean(message.is_system),
        message: message.mes,
        data: data,
        extra: info,
        swipe_id: swipeId,
        swipes: swipes,
        swipes_data: (message.variables || [{}]).map(clone),
      };
    }

    function parseRange(range) {
      var last = chat.length - 1;
      if (typeof range === 'number') {
        var numeric = normalizeIndex(range, last);
        return { start: numeric, end: numeric };
      }
      var text = String(range == null ? 'latest' : range).trim();
      if (text === '' || text === 'latest') return { start: last, end: last };
      text = text.replace(/\{\{lastMessageId\}\}/g, String(last));
      var match = text.match(/^(-?\d+)\s*-\s*(-?\d+)$/);
      if (match) {
        return {
          start: normalizeIndex(Number(match[1]), last),
          end: normalizeIndex(Number(match[2]), last),
        };
      }
      var single = normalizeIndex(Number(text), last);
      return { start: single, end: single };
    }

    function normalizeIndex(value, last) {
      if (!Number.isFinite(value)) return last;
      if (value < 0) return last + 1 + value;
      return value;
    }

    function getChatMessages(range, option) {
      var opts = option || {};
      var bounds = parseRange(range);
      var start = Math.max(0, Math.min(bounds.start, bounds.end));
      var end = Math.min(chat.length - 1, Math.max(bounds.start, bounds.end));
      var out = [];
      for (var i = start; i <= end; i += 1) {
        var message = chat[i];
        if (!message) continue;
        var role = roleOf(message);
        if (opts.role && opts.role !== 'all' && opts.role !== role) continue;
        if (opts.hide_state === 'hidden' && !message.is_system) continue;
        if (opts.hide_state === 'unhidden' && message.is_system) continue;
        out.push(publicMessage(message, i, Boolean(opts.include_swipes)));
      }
      return out;
    }

    function getLastMessageId() { return chat.length - 1; }

    function scopeObject(option, create) {
      var opts = option || { type: 'chat' };
      switch (opts.type) {
        case 'global': return globalVars;
        case 'character': return characterVars;
        case 'preset': return presetVars;
        case 'chat': return chatMetadata.variables;
        case 'script': {
          var id = opts.script_id || currentScriptId;
          if (!scriptVars[id] || typeof scriptVars[id] !== 'object') {
            if (!create) return {};
            scriptVars[id] = {};
          }
          return scriptVars[id];
        }
        case 'message': {
          var index = opts.message_id;
          if (index === undefined || index === null || index === 'latest') index = chat.length - 1;
          else index = normalizeIndex(Number(index), chat.length - 1);
          var message = chat[index];
          if (!message) return null;
          var swipeId = message.swipe_id || 0;
          if (!message.variables[swipeId] || typeof message.variables[swipeId] !== 'object') {
            if (!create) return {};
            message.variables[swipeId] = {};
          }
          return message.variables[swipeId];
        }
        case 'extension': {
          var extId = opts.extension_id || 'tavern_helper';
          if (!extensionSettings[extId] || typeof extensionSettings[extId] !== 'object') {
            if (!create) return {};
            extensionSettings[extId] = {};
          }
          return extensionSettings[extId];
        }
        default: return chatMetadata.variables;
      }
    }

    function postScope(option) {
      var opts = option || { type: 'chat' };
      var value = clone(scopeObject(opts, true) || {});
      var messageIndex;
      if (opts.type === 'message') {
        messageIndex = opts.message_id === undefined || opts.message_id === null || opts.message_id === 'latest'
          ? getLastMessageId()
          : normalizeIndex(Number(opts.message_id), getLastMessageId());
      }
      post({
        tt: 'vars',
        scope: opts.type || 'chat',
        scriptId: opts.script_id || undefined,
        extensionId: opts.extension_id || undefined,
        messageId: messageIndex,
        value: value,
        hash: hashSignature(value),
      });
      return value;
    }

    function getVariables(option) {
      var value = scopeObject(option || { type: 'chat' }, false);
      return clone(value || {});
    }

    function replaceVariables(value, option) {
      var opts = option || { type: 'chat' };
      var scope = scopeObject(opts, true);
      if (!scope) throw new Error('变量作用域不存在');
      Object.keys(scope).forEach(function (key) { delete scope[key]; });
      Object.assign(scope, clone(value && typeof value === 'object' ? value : {}));
      postScope(opts);
      return getVariables(opts);
    }

    function updateVariablesWith(updater, option) {
      var opts = option || { type: 'chat' };
      var current = getVariables(opts);
      var next = typeof updater === 'function' ? updater(current) : updater;
      return replaceVariables(next === undefined ? current : next, opts);
    }

    function insertOrAssignVariables(vars, option) {
      var opts = option || { type: 'chat' };
      var scope = scopeObject(opts, true);
      Object.keys(vars || {}).forEach(function (key) { scope[key] = clone(vars[key]); });
      postScope(opts);
    }

    function insertVariables(vars, option) {
      var opts = option || { type: 'chat' };
      var scope = scopeObject(opts, true);
      Object.keys(vars || {}).forEach(function (key) {
        if (!Object.prototype.hasOwnProperty.call(scope, key)) scope[key] = clone(vars[key]);
      });
      postScope(opts);
    }

    function deleteVariable(key, option) {
      var opts = option || { type: 'chat' };
      var scope = scopeObject(opts, true);
      deletePath(scope, key);
      postScope(opts);
    }

    function touchMessage(index, edited) {
      var message = chat[index];
      if (!message) return;
      if (edited === true) message.__ttEdited = true;
      var vars = clone((message.variables && message.variables[message.swipe_id || 0]) || {});
      post({
        tt: 'message',
        index: index,
        text: message.mes,
        vars: vars,
        varsHash: hashSignature(vars),
        edited: message.__ttEdited === true,
      });
    }

    async function setChatMessages(updates, options) {
      var opts = options || {};
      var affected = [];
      for (var u = 0; u < (updates || []).length; u += 1) {
        var update = updates[u] || {};
        var index = update.message_id;
        if (index === 'latest') index = chat.length - 1;
        else index = normalizeIndex(Number(index), chat.length - 1);
        var message = chat[index];
        if (!message) throw new Error('提供的消息楼层号 ' + update.message_id + ' 超出了范围');
        if (update.message !== undefined) {
          message.mes = String(update.message);
          message.swipes[message.swipe_id || 0] = message.mes;
          message.__ttEdited = true;
        }
        if (update.data !== undefined) {
          message.variables[message.swipe_id || 0] = clone(update.data);
        }
        if (update.extra !== undefined) {
          message.swipe_info[message.swipe_id || 0] = clone(update.extra);
          message.extra = clone(update.extra);
        }
        if (update.is_hidden !== undefined) message.is_system = Boolean(update.is_hidden);
        if (update.name !== undefined) message.name = String(update.name);
        if (update.swipes !== undefined || update.swipes_data !== undefined || update.swipes_info !== undefined || update.swipe_id !== undefined) {
          var nodes = Math.max(
            Array.isArray(update.swipes) ? update.swipes.length : 0,
            Array.isArray(update.swipes_data) ? update.swipes_data.length : 0,
            Array.isArray(update.swipes_info) ? update.swipes_info.length : 0,
            (message.swipes || []).length,
            1,
          );
          var swipeId = Math.max(0, Math.min(Number(update.swipe_id != null ? update.swipe_id : message.swipe_id || 0), nodes - 1));
          var swipes = [];
          var data = [];
          var info = [];
          for (var s = 0; s < nodes; s += 1) {
            swipes.push(update.swipes && update.swipes[s] != null ? String(update.swipes[s]) : (message.swipes[s] != null ? message.swipes[s] : ''));
            data.push(update.swipes_data && update.swipes_data[s] !== undefined ? clone(update.swipes_data[s]) : clone((message.variables && message.variables[s]) || {}));
            info.push(update.swipes_info && update.swipes_info[s] !== undefined ? clone(update.swipes_info[s]) : clone((message.swipe_info && message.swipe_info[s]) || {}));
          }
          message.swipes = swipes;
          message.variables = data;
          message.swipe_info = info;
          message.swipe_id = swipeId;
          message.mes = swipes[swipeId];
          message.extra = clone(info[swipeId]);
          message.__ttEdited = true;
        }
        affected.push(index);
      }
      for (var a = 0; a < affected.length; a += 1) touchMessage(affected[a]);
      if (opts.refresh !== 'none') {
        for (var b = 0; b < affected.length; b += 1) {
          var msg = chat[affected[b]];
          if (!msg) continue;
          bus.emit(msg.is_user ? TAVERN_EVENTS.USER_MESSAGE_RENDERED : TAVERN_EVENTS.CHARACTER_MESSAGE_RENDERED, affected[b]);
        }
      }
      post({ tt: 'chat-updated', indices: affected });
    }

    async function createChatMessages(creates, options) {
      var opts = options || {};
      var insertBefore = opts.insert_before != null ? opts.insert_before : opts.insert_at;
      var at = insertBefore === 'end' || insertBefore == null ? chat.length : normalizeIndex(Number(insertBefore), chat.length);
      at = Math.max(0, Math.min(at, chat.length));
      var made = [];
      for (var i = 0; i < (creates || []).length; i += 1) {
        var input = creates[i] || {};
        var message = makeMessage(input);
        var index = at + i;
        chat.splice(index, 0, message);
        made.push(index);
      }
      for (var j = 0; j < made.length; j += 1) {
        post({ tt: 'message', index: made[j], text: chat[made[j]].mes, vars: {}, edited: true });
        bus.emit(chat[made[j]].is_user ? TAVERN_EVENTS.MESSAGE_SENT : TAVERN_EVENTS.MESSAGE_RECEIVED, made[j], 'normal');
      }
      return made;
    }

    async function deleteChatMessages(ids, options) {
      var list = (ids || []).map(function (id) { return normalizeIndex(Number(id), chat.length - 1); })
        .filter(function (id) { return id >= 0 && id < chat.length; })
        .sort(function (a, b) { return b - a; });
      for (var i = 0; i < list.length; i += 1) chat.splice(list[i], 1);
      post({ tt: 'chat-reload' });
      if ((options || {}).refresh !== 'none') bus.emit(TAVERN_EVENTS.CHAT_CHANGED, chatId);
    }

    async function rotateChatMessages(begin, middle, end) {
      var from = Math.max(0, normalizeIndex(Number(begin), chat.length - 1));
      var mid = Math.max(0, normalizeIndex(Number(middle), chat.length - 1));
      var to = Math.max(0, normalizeIndex(Number(end), chat.length - 1));
      var slice = chat.splice(from, to - from);
      var head = slice.splice(0, Math.max(0, mid - from));
      chat.splice(from, 0, ...slice, ...head);
      post({ tt: 'chat-reload' });
    }

    function lookupMacro(name) {
      var key = String(name || '');
      if (macros.has(key)) {
        var value = macros.get(key);
        return typeof value === 'function' ? value('') : value;
      }
      switch (key) {
        case 'user': case 'name1': return userName;
        case 'char': case 'name2': return charName;
        case 'charIfNotGroup': return charName;
        case 'group': return '';
        case 'description': return card.description || '';
        case 'personality': return card.personality || '';
        case 'scenario': return card.scenario || '';
        case 'persona': return '';
        case 'time': return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date());
        case 'date': return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
        case 'weekday': return new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(new Date());
        case 'isotime': { var now = new Date(); return pad(now.getHours()) + ':' + pad(now.getMinutes()); }
        case 'isodate': { var today = new Date(); return today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate()); }
        case 'newline': return '\n';
        case 'trim': return '';
        case 'maxContext': return '128000';
        case 'maxResponse': return '8000';
        case 'maxPrompt': return '128000';
        case 'lastMessageId': return String(getLastMessageId());
        case 'lastMessage': {
          var last = chat[chat.length - 1];
          return last ? last.mes : '';
        }
        case 'lastUserMessage': {
          for (var i = chat.length - 1; i >= 0; i -= 1) if (chat[i].is_user) return chat[i].mes;
          return '';
        }
        case 'lastCharMessage': {
          for (var j = chat.length - 1; j >= 0; j -= 1) if (!chat[j].is_user && !chat[j].is_system) return chat[j].mes;
          return '';
        }
        default: return undefined;
      }
    }

    function substituteMacros(text) {
      if (typeof text !== 'string' || !text) return text == null ? '' : String(text);
      var out = text;
      out = out.replace(/\{\{\/\/([\s\S]*?)\}\}/g, '');
      out = out.replace(/\{\{setvar::([^:}\s]+)::([\s\S]*?)\}\}/gi, function (_, key, value) {
        setPath(chatMetadata.variables, key.trim(), value);
        postScope({ type: 'chat' });
        return '';
      });
      out = out.replace(/\{\{getvar::([^:}\s]+)\}\}/gi, function (_, key) {
        var value = hasPath(chatMetadata.variables, key.trim()) ? getPath(chatMetadata.variables, key.trim()) : '';
        return value == null ? '' : String(value);
      });
      out = out.replace(/\{\{addvar::([^:}\s]+)::([\s\S]*?)\}\}/gi, function (_, key, value) {
        var current = getPath(chatMetadata.variables, key.trim(), '');
        setPath(chatMetadata.variables, key.trim(), String(current == null ? '' : current) + value);
        postScope({ type: 'chat' });
        return '';
      });
      out = out.replace(/\{\{random\s?::?([^}]+)\}\}/gi, function (_, inner) {
        return randomPick(splitArgs(inner.trim(), '::'), Math.random);
      });
      out = out.replace(/\{\{pick\s?::?([^}]+)\}\}/gi, function (_, inner) {
        return randomPick(splitArgs(inner.trim(), '::'), Math.random);
      });
      out = out.replace(/\{\{roll[ :]([^}]+)\}\}/gi, function (_, inner) {
        var match = inner.trim().match(/^(\d*)d(\d+)$/i);
        var count = match ? Math.max(1, Number(match[1] || 1)) : 1;
        var sides = match ? Number(match[2]) : Number(inner.trim()) || 6;
        var total = 0;
        for (var i = 0; i < count; i += 1) total += 1 + Math.floor(Math.random() * sides);
        return String(total);
      });
      out = out.replace(/\{\{newline\}\}/gi, '\n');
      out = out.replace(/(?:\r?\n)*\{\{trim\}\}(?:\r?\n)*/gi, '');
      out = out.replace(/\{\{noop\}\}/gi, '');
      // 自定义宏名不受 ASCII 限制（酒馆助手的 registerMacroLike 允许任意名字）。
      out = out.replace(/\{\{([^{}]+)\}\}/g, function (raw, name) {
        var value = lookupMacro(String(name).trim());
        return value === undefined ? raw : String(value);
      });
      // 旧式尖括号
      out = out.replace(/<USER>/gi, userName).replace(/<BOT>/gi, charName).replace(/<CHAR>/gi, charName);
      return out;
    }

    function getLorebookEntries(name) {
      var book = name == null || name === worldbookName ? worldbookEntries
        : (name === chatWorldbookName ? chatWorldbookEntries : []);
      return book.map(clone);
    }

    function getWorldbook(name) {
      var entries = {};
      getLorebookEntries(name).forEach(function (entry) { entries[String(entry.uid)] = entry; });
      return { name: name == null ? worldbookName : name, entries: entries };
    }

    function setExtensionWorldbook(book, character) {
      if (character) worldbookEntries = flattenEntries(book.entries);
      else {
        chatWorldbookName = book.name;
        chatWorldbookEntries = flattenEntries(book.entries);
      }
    }

    function getCharWorldbookNames() {
      return { primary: worldbookName, additional: [] };
    }

    function getWorldbookNames() { return chatWorldbookName ? [worldbookName, chatWorldbookName] : [worldbookName]; }

    function slashCommand(line) {
      var text = String(line || '').trim();
      if (!text) return '';
      if (text[0] === '/') text = text.slice(1);
      var pipe = text.split('|');
      var result = '';
      for (var i = 0; i < pipe.length; i += 1) {
        result = runOneCommand(pipe[i].trim(), result);
      }
      return result;
    }

    function parseNamed(rest) {
      var named = {};
      var positional = [];
      var tokens = String(rest || '').match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
      tokens.forEach(function (token) {
        var eq = token.indexOf('=');
        if (eq > 0) {
          var key = token.slice(0, eq);
          var value = token.slice(eq + 1).replace(/^["']|["']$/g, '');
          named[key] = value;
        } else {
          positional.push(token.replace(/^["']|["']$/g, ''));
        }
      });
      return { named: named, positional: positional };
    }

    function runOneCommand(command, pipeValue, parsed) {
      var text = String(command || '').trim();
      if (text[0] === '/') text = text.slice(1);
      var space = text.indexOf(' ');
      var name = (space < 0 ? text : text.slice(0, space)).toLowerCase();
      var rest = space < 0 ? '' : text.slice(space + 1);
      var args = parsed || parseNamed(rest.replace(/\{\{pipe\}\}/g, pipeValue));
      var namedKeys = Object.keys(args.named);
      var singlePair = namedKeys.length === 1 && args.positional.length === 0 && namedKeys[0] !== 'key' && namedKeys[0] !== 'value';
      var key = args.named.key || (singlePair ? namedKeys[0] : args.positional[0]) || '';
      var value = args.named.value != null
        ? args.named.value
        : singlePair
          ? args.named[namedKeys[0]]
          : (args.positional.slice(args.named.key ? 0 : 1).join(' ') || pipeValue);
      switch (name) {
        case 'setvar': setPath(chatMetadata.variables, key, value); postScope({ type: 'chat' }); return '';
        case 'getvar': {
          var got = getPath(chatMetadata.variables, key, '');
          return got == null ? '' : String(got);
        }
        case 'addvar': setPath(chatMetadata.variables, key, String(getPath(chatMetadata.variables, key, '') + value)); postScope({ type: 'chat' }); return '';
        case 'incvar': setPath(chatMetadata.variables, key, Number(getPath(chatMetadata.variables, key, 0)) + (Number(value) || 1)); postScope({ type: 'chat' }); return '';
        case 'decvar': setPath(chatMetadata.variables, key, Number(getPath(chatMetadata.variables, key, 0)) - (Number(value) || 1)); postScope({ type: 'chat' }); return '';
        case 'delvar': deletePath(chatMetadata.variables, key); postScope({ type: 'chat' }); return '';
        case 'setglobalvar': setPath(globalVars, key, value); postScope({ type: 'global' }); return '';
        case 'getglobalvar': { var g = getPath(globalVars, key, ''); return g == null ? '' : String(g); }
        case 'addglobalvar': setPath(globalVars, key, String(getPath(globalVars, key, '') + value)); postScope({ type: 'global' }); return '';
        case 'setchatvar': setPath(chatMetadata.variables, key, value); postScope({ type: 'chat' }); return '';
        case 'getchatvar': { var c = getPath(chatMetadata.variables, key, ''); return c == null ? '' : String(c); }
        case 'addchatvar': setPath(chatMetadata.variables, key, String(getPath(chatMetadata.variables, key, '') + value)); postScope({ type: 'chat' }); return '';
        case 'setvarname':
        case 'setprompt':
          return '';
        case 'echo':
        case 'pass':
        case 'run': return rest;
        case 'comment': return '';
        case 'sys': post({ tt: 'system-message', text: rest }); return '';
        case 'sendas': {
          var sep = rest.indexOf(' ');
          var payload = sep < 0 ? rest : rest.slice(sep + 1);
          post({ tt: 'user-message', text: payload });
          return '';
        }
        case 'trigger': post({ tt: 'trigger' }); return '';
        default:
          throw new Error('DSH TH 宿主暂不支持斜杠命令 /' + name);
      }
    }

    function makeScriptContext(scriptId, messageId) {
      currentScriptId = scriptId || currentScriptId;
      currentMessageId = messageId == null ? currentMessageId : messageId;
      return currentScriptId;
    }

    function buildCharacters() {
      var data = card.data || card;
      return [{
        name: charName,
        description: card.description || data.description || '',
        personality: card.personality || data.personality || '',
        scenario: card.scenario || data.scenario || '',
        first_mes: card.firstMes || data.first_mes || '',
        mes_example: card.mesExample || data.mes_example || '',
        creatorcomment: card.creatorNotes || data.creator_notes || '',
        tags: card.tags || data.tags || [],
        talkativeness: 0.5,
        fav: false,
        create_date: '',
        data: data,
        chat: chatId,
        avatar: 'dsh-tt.png',
        json_data: '',
      }];
    }

    function getCharacterCardFields() {
      var data = card.data || card;
      return {
        name: charName,
        description: card.description || data.description || '',
        personality: card.personality || data.personality || '',
        scenario: card.scenario || data.scenario || '',
        first_mes: card.firstMes || data.first_mes || '',
        mes_example: card.mesExample || data.mes_example || '',
        system_prompt: card.systemPrompt || data.system_prompt || '',
        post_history_instructions: card.postHistoryInstructions || data.post_history_instructions || '',
        alternate_greetings: card.alternateGreetings || data.alternate_greetings || [],
        creator: card.creator || data.creator || '',
        character_version: card.characterVersion || data.character_version || '',
        tags: card.tags || data.tags || [],
        extensions: card.extensions || data.extensions || {},
      };
    }

    function snapshotForParent() {
      return {
        chat: chat.map(function (message, index) {
          return {
            index: index,
            role: roleOf(message),
            text: message.mes,
            vars: clone((message.variables && message.variables[message.swipe_id || 0]) || {}),
            hidden: Boolean(message.is_system),
          };
        }),
        chatVariables: clone(chatMetadata.variables),
        globalVariables: clone(globalVars),
        characterVariables: clone(characterVars),
        presetVariables: clone(presetVars),
        scriptVariables: clone(scriptVars),
      };
    }

    // 初始聊天
    applyChat(settings.messages || [], { initial: true });

    return {
      // 状态
      card: card,
      chat: chat,
      chatMetadata: chatMetadata,
      extensionSettings: extensionSettings,
      characters: buildCharacters(),
      userName: userName,
      charName: charName,
      chatId: chatId,
      worldbookName: worldbookName,
      // 消息
      applyChat: applyChat,
      getChatMessages: getChatMessages,
      setChatMessages: setChatMessages,
      createChatMessages: createChatMessages,
      deleteChatMessages: deleteChatMessages,
      rotateChatMessages: rotateChatMessages,
      getLastMessageId: getLastMessageId,
      publicMessage: publicMessage,
      snapshotForParent: snapshotForParent,
      touchMessage: touchMessage,
      // 变量
      getVariables: getVariables,
      replaceVariables: replaceVariables,
      updateVariablesWith: updateVariablesWith,
      insertOrAssignVariables: insertOrAssignVariables,
      insertVariables: insertVariables,
      deleteVariable: deleteVariable,
      // 事件
      bus: bus,
      // 宏
      substituteMacros: substituteMacros,
      registerMacro: function (key, value) { macros.set(String(key), value); },
      unregisterMacro: function (key) { macros.delete(String(key)); },
      // 世界书
      getLorebookEntries: getLorebookEntries,
      getWorldbook: getWorldbook,
      setExtensionWorldbook: setExtensionWorldbook,
      getWorldbookNames: getWorldbookNames,
      getGlobalWorldbookNames: function () { return []; },
      getChatWorldbookName: function () { return chatWorldbookName; },
      getCharWorldbookNames: getCharWorldbookNames,
      getCurrentCharPrimaryLorebook: function () { return worldbookName; },
      // 其它
      getCharacterCardFields: getCharacterCardFields,
      slashCommand: slashCommand,
      runParsedCommand: function (command, pipe) { return runOneCommand(command.name, pipe, {
        named: command.named, positional: command.unnamed,
      }); },
      makeScriptContext: makeScriptContext,
      getCurrentScriptId: function () { return currentScriptId; },
      getCurrentMessageId: function () { return currentMessageId; },
    };
  }

  var TAVERN_EVENTS = {
    APP_READY: 'app_ready',
    EXTRAS_CONNECTED: 'extras_connected',
    MESSAGE_SWIPED: 'message_swiped',
    MESSAGE_SENT: 'message_sent',
    MESSAGE_RECEIVED: 'message_received',
    MESSAGE_EDITED: 'message_edited',
    MESSAGE_DELETED: 'message_deleted',
    MESSAGE_UPDATED: 'message_updated',
    MESSAGE_FILE_EMBEDDED: 'message_file_embedded',
    MESSAGE_REASONING_EDITED: 'message_reasoning_edited',
    MESSAGE_REASONING_DELETED: 'message_reasoning_deleted',
    MESSAGE_SWIPE_DELETED: 'message_swipe_deleted',
    MORE_MESSAGES_LOADED: 'more_messages_loaded',
    IMPERSONATE_READY: 'impersonate_ready',
    CHAT_CHANGED: 'chat_id_changed',
    GENERATION_AFTER_COMMANDS: 'GENERATION_AFTER_COMMANDS',
    GENERATION_STARTED: 'generation_started',
    GENERATION_STOPPED: 'generation_stopped',
    GENERATION_ENDED: 'generation_ended',
    SD_PROMPT_PROCESSING: 'sd_prompt_processing',
    EXTENSIONS_FIRST_LOAD: 'extensions_first_load',
    EXTENSION_SETTINGS_LOADED: 'extension_settings_loaded',
    SETTINGS_LOADED: 'settings_loaded',
    SETTINGS_UPDATED: 'settings_updated',
    MOVABLE_PANELS_RESET: 'movable_panels_reset',
    SETTINGS_LOADED_BEFORE: 'settings_loaded_before',
    SETTINGS_LOADED_AFTER: 'settings_loaded_after',
    CHATCOMPLETION_SOURCE_CHANGED: 'chatcompletion_source_changed',
    CHATCOMPLETION_MODEL_CHANGED: 'chatcompletion_model_changed',
    OAI_PRESET_CHANGED_BEFORE: 'oai_preset_changed_before',
    OAI_PRESET_CHANGED_AFTER: 'oai_preset_changed_after',
    OAI_PRESET_EXPORT_READY: 'oai_preset_export_ready',
    OAI_PRESET_IMPORT_READY: 'oai_preset_import_ready',
    WORLDINFO_SETTINGS_UPDATED: 'worldinfo_settings_updated',
    WORLDINFO_UPDATED: 'worldinfo_updated',
    CHARACTER_EDITOR_OPENED: 'character_editor_opened',
    CHARACTER_EDITED: 'character_edited',
    CHARACTER_PAGE_LOADED: 'character_page_loaded',
    USER_MESSAGE_RENDERED: 'user_message_rendered',
    CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
    FORCE_SET_BACKGROUND: 'force_set_background',
    CHAT_DELETED: 'chat_deleted',
    CHAT_CREATED: 'chat_created',
    GENERATE_BEFORE_COMBINE_PROMPTS: 'generate_before_combine_prompts',
    GENERATE_AFTER_COMBINE_PROMPTS: 'generate_after_combine_prompts',
    GENERATE_AFTER_DATA: 'generate_after_data',
    WORLD_INFO_ACTIVATED: 'world_info_activated',
    TEXT_COMPLETION_SETTINGS_READY: 'text_completion_settings_ready',
    CHAT_COMPLETION_SETTINGS_READY: 'chat_completion_settings_ready',
    CHAT_COMPLETION_PROMPT_READY: 'chat_completion_prompt_ready',
    CHARACTER_FIRST_MESSAGE_SELECTED: 'character_first_message_selected',
    CHARACTER_DELETED: 'characterDeleted',
    CHARACTER_DUPLICATED: 'character_duplicated',
    CHARACTER_RENAMED: 'character_renamed',
    CHARACTER_RENAMED_IN_PAST_CHAT: 'character_renamed_in_past_chat',
    SMOOTH_STREAM_TOKEN_RECEIVED: 'stream_token_received',
    STREAM_TOKEN_RECEIVED: 'stream_token_received',
    STREAM_REASONING_DONE: 'stream_reasoning_done',
    FILE_ATTACHMENT_DELETED: 'file_attachment_deleted',
    WORLDINFO_FORCE_ACTIVATE: 'worldinfo_force_activate',
    OPEN_CHARACTER_LIBRARY: 'open_character_library',
    ONLINE_STATUS_CHANGED: 'online_status_changed',
    IMAGE_SWIPED: 'image_swiped',
    CONNECTION_PROFILE_LOADED: 'connection_profile_loaded',
    CONNECTION_PROFILE_CREATED: 'connection_profile_created',
    CONNECTION_PROFILE_DELETED: 'connection_profile_deleted',
    CONNECTION_PROFILE_UPDATED: 'connection_profile_updated',
    TOOL_CALLS_PERFORMED: 'tool_calls_performed',
    TOOL_CALLS_RENDERED: 'tool_calls_rendered',
    CHARACTER_MANAGEMENT_DROPDOWN: 'charManagementDropdown',
    SECRET_WRITTEN: 'secret_written',
    SECRET_DELETED: 'secret_deleted',
    SECRET_ROTATED: 'secret_rotated',
    SECRET_EDITED: 'secret_edited',
    PRESET_CHANGED: 'preset_changed',
    PRESET_DELETED: 'preset_deleted',
    PRESET_RENAMED: 'preset_renamed',
    PRESET_RENAMED_BEFORE: 'preset_renamed_before',
    MAIN_API_CHANGED: 'main_api_changed',
    WORLDINFO_ENTRIES_LOADED: 'worldinfo_entries_loaded',
    WORLDINFO_SCAN_DONE: 'worldinfo_scan_done',
    MEDIA_ATTACHMENT_DELETED: 'media_attachment_deleted',
    MESSAGE_IFRAME_RENDER_STARTED: 'message_iframe_render_started',
    MESSAGE_IFRAME_RENDER_ENDED: 'message_iframe_render_ended',
    GENERATION_REQUESTED: 'js_generation_requested',
    STREAM_TOKEN_RECEIVED_FULLY: 'js_stream_token_received_fully',
    STREAM_TOKEN_RECEIVED_INCREMENTALLY: 'js_stream_token_received_incrementally',
    GENERATION_ENDED_JS: 'js_generation_ended',
  };

  return {
    createCore: createCore,
    createEventBus: createEventBus,
    flattenEntries: flattenEntries,
    TAVERN_EVENTS: TAVERN_EVENTS,
    // 供测试
    getPath: getPath,
    setPath: setPath,
    hasPath: hasPath,
    deletePath: deletePath,
    deepEqual: deepEqual,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = TT_CORE;
