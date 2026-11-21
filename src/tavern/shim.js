/* 酒馆助手兼容 iframe 的浏览器适配层。
 *
 * 依赖：window.__TT_INIT__（父窗口注入的初始数据）与 TT_CORE（同文档先加载的核心）。
 * 负责：ST/TavernHelper 全局、toastr、jQuery 子集、lodash 子集、事件、弹窗桥、
 *       卡内脚本执行。
 */
(function () {
  'use strict';

  var INIT = window.__TT_INIT__ || {};
  var TT = window.TT_CORE;
  if (!TT) throw new Error('TT_CORE 未加载');
  var parseScript = window.acorn.parse;
  var formatScriptRegex = window.__TT_REGEX__.formatScriptRegex;

  function post(message) {
    try {
      var payload = Object.assign({ __ttChild: true }, message);
      window.parent.postMessage(payload, '*');
    } catch (error) {
      try { console.error('[dsh-tt] postMessage failed', error); } catch { /* ignore */ }
    }
  }

  function log(level, text) {
    post({ tt: 'log', level: level || 'info', text: String(text == null ? '' : text) });
  }

  var core = TT.createCore({
    card: INIT.card || {},
    userName: INIT.userName || '你',
    charName: INIT.charName || (INIT.card && INIT.card.name) || '角色',
    chatId: INIT.chatId || 'dsh-tt-chat',
    worldbookName: INIT.worldbookName || '角色世界书',
    worldbookEntries: INIT.worldbookEntries || [],
    chatWorldbook: INIT.chatWorldbook,
    chatMetadata: INIT.extensionMetadata || {},
    variables: INIT.variables || {},
    messages: INIT.messages || [],
    extensionSettings: INIT.extensionSettings || {},
    post: post,
    log: log,
  });

  var TAVERN_EVENTS = TT.TAVERN_EVENTS;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function textToHtml(text) {
    return escapeHtml(text).replace(/\n/g, '<br>');
  }

  // ── 正则脚本（显示/提示词作用域） ─────────────────────────────
  function applyRegexes(text, source, destination, options) {
    return formatScriptRegex(text, INIT.regexScripts, source, destination, options);
  }

  // ── jQuery 子集 ────────────────────────────────────────────
  var JQ = function (elements) {
    this.elements = elements || [];
    this.length = this.elements.length;
    for (var i = 0; i < this.elements.length; i += 1) this[i] = this.elements[i];
    this.prevObject = null;
  };

  function wrap(elements) { return new JQ(elements); }

  function toElements(value) {
    if (!value) return [];
    if (value instanceof JQ) return value.elements;
    if (value.nodeType || value === window || value === document) return [value];
    if (typeof value === 'string') {
      var html = value.trim();
      if (html[0] === '<' && html[1] !== '/') {
        var template = document.createElement('template');
        template.innerHTML = html;
        return Array.prototype.slice.call(template.content.childNodes);
      }
      return Array.prototype.slice.call(document.querySelectorAll(value));
    }
    if (typeof value.length === 'number') return Array.prototype.slice.call(value);
    return [];
  }

  function $(selector) {
    if (typeof selector === 'function') {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', selector, { once: true });
      else setTimeout(selector, 0);
      return wrap([]);
    }
    return wrap(toElements(selector));
  }

  JQ.prototype.each = function (fn) {
    for (var i = 0; i < this.elements.length; i += 1) {
      if (fn.call(this.elements[i], i, this.elements[i]) === false) break;
    }
    return this;
  };
  JQ.prototype.map = function (fn) {
    var out = [];
    for (var i = 0; i < this.elements.length; i += 1) {
      var value = fn.call(this.elements[i], i, this.elements[i]);
      if (value != null) out.push(value);
    }
    return wrap(out);
  };
  JQ.prototype.toArray = function () { return this.elements.slice(); };
  JQ.prototype.get = function (index) { return index == null ? this.elements.slice() : this.elements[index]; };
  JQ.prototype.eq = function (index) { return wrap(index < 0 ? [this.elements[this.elements.length + index]] : [this.elements[index]]); };
  JQ.prototype.first = function () { return wrap(this.elements.slice(0, 1)); };
  JQ.prototype.last = function () { return wrap(this.elements.slice(-1)); };
  JQ.prototype.filter = function (selector) {
    if (typeof selector === 'function') return wrap(this.elements.filter(function (el, index) { return selector.call(el, index, el); }));
    return wrap(this.elements.filter(function (el) { return el.matches && el.matches(selector); }));
  };
  JQ.prototype.is = function (selector) {
    if (typeof selector === 'function') return this.elements.some(function (el, index) { return selector.call(el, index, el); });
    return this.elements.some(function (el) { return el.matches && el.matches(selector); });
  };
  JQ.prototype.find = function (selector) {
    var out = [];
    this.elements.forEach(function (el) {
      if (el.querySelectorAll) out = out.concat(Array.prototype.slice.call(el.querySelectorAll(selector)));
    });
    return wrap(out);
  };
  JQ.prototype.parent = function () { return wrap(this.elements.map(function (el) { return el.parentElement; }).filter(Boolean)); };
  JQ.prototype.children = function (selector) {
    var out = [];
    this.elements.forEach(function (el) {
      if (!el.children) return;
      var list = Array.prototype.slice.call(el.children);
      out = out.concat(selector ? list.filter(function (child) { return child.matches && child.matches(selector); }) : list);
    });
    return wrap(out);
  };
  JQ.prototype.closest = function (selector) { return wrap(this.elements.map(function (el) { return el.closest && el.closest(selector); }).filter(Boolean)); };
  JQ.prototype.next = function () { return wrap(this.elements.map(function (el) { return el.nextElementSibling; }).filter(Boolean)); };
  JQ.prototype.prev = function () { return wrap(this.elements.map(function (el) { return el.previousElementSibling; }).filter(Boolean)); };
  JQ.prototype.siblings = function () {
    var out = [];
    this.elements.forEach(function (el) {
      if (!el.parentElement) return;
      Array.prototype.slice.call(el.parentElement.children).forEach(function (child) { if (child !== el) out.push(child); });
    });
    return wrap(out);
  };
  JQ.prototype.attr = function (name, value) {
    if (value === undefined) return this.elements.length ? this.elements[0].getAttribute(name) : undefined;
    return this.each(function (_, el) { if (value === null) el.removeAttribute(name); else el.setAttribute(name, String(value)); });
  };
  JQ.prototype.removeAttr = function (name) { return this.each(function (_, el) { el.removeAttribute(name); }); };
  JQ.prototype.prop = function (name, value) {
    if (value === undefined) return this.elements.length ? this.elements[0][name] : undefined;
    return this.each(function (_, el) { el[name] = value; });
  };
  JQ.prototype.data = function (name, value) {
    if (value === undefined) {
      if (!this.elements.length) return undefined;
      var raw = this.elements[0].getAttribute('data-' + name);
      if (raw == null) return undefined;
      try { return JSON.parse(raw); } catch { return raw; }
    }
    return this.attr('data-' + name, typeof value === 'string' ? value : JSON.stringify(value));
  };
  JQ.prototype.text = function (value) {
    if (value === undefined) return this.elements.map(function (el) { return el.textContent; }).join('');
    return this.each(function (_, el) { el.textContent = String(value); });
  };
  JQ.prototype.html = function (value) {
    if (value === undefined) return this.elements.length ? this.elements[0].innerHTML : undefined;
    return this.each(function (_, el) { el.innerHTML = String(value); });
  };
  JQ.prototype.val = function (value) {
    if (value === undefined) return this.elements.length ? this.elements[0].value : undefined;
    return this.each(function (_, el) { el.value = value; });
  };
  JQ.prototype.append = function (child) {
    var nodes = toElements(child);
    return this.each(function (_, el) {
      nodes.forEach(function (node) {
        if (typeof node === 'string') el.insertAdjacentHTML('beforeend', node);
        else el.appendChild(node);
      });
    });
  };
  JQ.prototype.appendTo = function (target) {
    var parents = toElements(target);
    this.elements.forEach(function (el) {
      parents.forEach(function (parent) {
        if (typeof parent === 'string') parent = document.querySelector(parent);
        if (parent && parent.appendChild) parent.appendChild(el);
      });
    });
    return this;
  };
  JQ.prototype.prepend = function (child) {
    var nodes = toElements(child);
    return this.each(function (_, el) {
      nodes.forEach(function (node) {
        if (typeof node === 'string') el.insertAdjacentHTML('afterbegin', node);
        else el.insertBefore(node, el.firstChild);
      });
    });
  };
  JQ.prototype.before = function (child) {
    var nodes = toElements(child);
    return this.each(function (_, el) {
      nodes.forEach(function (node) { if (el.parentNode) el.parentNode.insertBefore(typeof node === 'string' ? document.createTextNode(node) : node, el); });
    });
  };
  JQ.prototype.after = function (child) {
    var nodes = toElements(child);
    return this.each(function (_, el) {
      nodes.forEach(function (node) { if (el.parentNode) el.parentNode.insertBefore(typeof node === 'string' ? document.createTextNode(node) : node, el.nextSibling); });
    });
  };
  JQ.prototype.remove = function () { return this.each(function (_, el) { if (el.parentNode) el.parentNode.removeChild(el); }); };
  JQ.prototype.empty = function () { return this.each(function (_, el) { el.innerHTML = ''; }); };
  JQ.prototype.addClass = function (name) { return this.each(function (_, el) { el.classList && el.classList.add.apply(el.classList, String(name).split(/\s+/)); }); };
  JQ.prototype.removeClass = function (name) { return this.each(function (_, el) { el.classList && el.classList.remove.apply(el.classList, String(name).split(/\s+/)); }); };
  JQ.prototype.toggleClass = function (name) { return this.each(function (_, el) { if (el.classList) el.classList.toggle(name); }); };
  JQ.prototype.hasClass = function (name) { return this.elements.some(function (el) { return el.classList && el.classList.contains(name); }); };
  JQ.prototype.css = function (name, value) {
    if (typeof name === 'object') {
      var styles = name;
      return this.each(function (_, el) { Object.keys(styles).forEach(function (key) { el.style[key] = styles[key]; }); });
    }
    if (value === undefined) return this.elements.length && this.elements[0].style ? this.elements[0].style[name] : undefined;
    return this.each(function (_, el) { if (el.style) el.style[name] = value; });
  };
  JQ.prototype.on = function (events, handler) {
    var list = String(events).split(/\s+/).filter(Boolean);
    return this.each(function (_, el) {
      list.forEach(function (eventName) {
        var dot = eventName.lastIndexOf('.');
        var type = dot > 0 ? eventName.slice(0, dot) : eventName;
        var listener = function (event) {
          event = event || {};
          if (!event.preventDefault) event.preventDefault = function () {};
          if (!event.stopPropagation) event.stopPropagation = function () {};
          var result = handler.call(el, event);
          if (result === false) event.preventDefault();
        };
        el.__ttListeners = el.__ttListeners || [];
        el.__ttListeners.push({ type: type, handler: handler, listener: listener });
        el.addEventListener(type, listener);
      });
    });
  };
  JQ.prototype.one = function (events, handler) {
    var self = this;
    var wrapped = function (event) { self.off(events, wrapped); return handler.apply(this, arguments); };
    return this.on(events, wrapped);
  };
  JQ.prototype.off = function (events, handler) {
    var list = events ? String(events).split(/\s+/).filter(Boolean) : [];
    return this.each(function (_, el) {
      (el.__ttListeners || []).forEach(function (entry) {
        if (list.length && list.indexOf(entry.type) < 0) return;
        if (handler && entry.handler !== handler) return;
        el.removeEventListener(entry.type, entry.listener);
      });
    });
  };
  JQ.prototype.trigger = function (eventName) {
    return this.each(function (_, el) {
      if (typeof el[eventName] === 'function') el[eventName]();
      else el.dispatchEvent(new CustomEvent(eventName, { bubbles: true }));
    });
  };
  ['click', 'dblclick', 'focus', 'blur', 'change', 'input', 'submit', 'keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'mousemove', 'mouseenter', 'mouseleave', 'scroll'].forEach(function (type) {
    JQ.prototype[type] = function (handler) { return handler ? this.on(type, handler) : this.trigger(type); };
  });
  JQ.prototype.show = function () { return this.each(function (_, el) { if (el.style) el.style.display = ''; }); };
  JQ.prototype.hide = function () { return this.each(function (_, el) { if (el.style) el.style.display = 'none'; }); };
  JQ.prototype.scrollTop = function (value) {
    if (value === undefined) return this.elements.length ? this.elements[0].scrollTop : 0;
    return this.each(function (_, el) { el.scrollTop = value; });
  };
  JQ.prototype.height = function (value) {
    if (value === undefined) return this.elements.length ? this.elements[0].clientHeight : 0;
    return this.css('height', typeof value === 'number' ? value + 'px' : value);
  };
  JQ.prototype.width = function (value) {
    if (value === undefined) return this.elements.length ? this.elements[0].clientWidth : 0;
    return this.css('width', typeof value === 'number' ? value + 'px' : value);
  };
  JQ.prototype.offset = function () {
    if (!this.elements.length) return { top: 0, left: 0 };
    var rect = this.elements[0].getBoundingClientRect();
    return { top: rect.top + window.scrollY, left: rect.left + window.scrollX };
  };

  $ .fn = JQ.prototype;
  $ = window.jQuery || $;
  window.$ = $;
  window.jQuery = $;
  var startupCallbacks = null;
  if ($.fn && typeof $.fn.ready === 'function') {
    var jqueryReady = $.fn.ready;
    $.fn.ready = function (callback) {
      if (!startupCallbacks || typeof callback !== 'function') return jqueryReady.call(this, callback);
      var script = currentScript;
      var selection = this;
      startupCallbacks.push(new Promise(function (resolve) {
        jqueryReady.call(selection, function () {
          var element = this;
          var args = arguments;
          Promise.resolve().then(function () { return callback.apply(element, args); })
            .catch(function (error) { scriptError(script, error); }).then(resolve);
        });
      }));
      return this;
    };
  }

  // ── lodash 子集 ────────────────────────────────────────────
  var _ = window._ || (function () {
    function isPlainObject(value) {
      if (value == null || typeof value !== 'object') return false;
      var proto = Object.getPrototypeOf(value);
      return proto === Object.prototype || proto === null;
    }
    function clone(value) {
      if (value == null || typeof value !== 'object') return value;
      try { return structuredClone(value); } catch { /* ignore */ }
      try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
    }
    function iteratee(source) {
      if (source == null) return function (value) { return value; };
      if (typeof source === 'function') return source;
      if (typeof source === 'string' || typeof source === 'number') return function (value) { return _.get(value, source); };
      if (Array.isArray(source)) return function (value) { return _.isEqual(_.get(value, source[0]), source[1]); };
      if (typeof source === 'object') return function (value) { return Object.keys(source).every(function (key) { return _.isEqual(_.get(value, key), source[key]); }); };
      return function (value) { return value; };
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
      return keysA.every(function (key) { return Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]); });
    }
    var lib = {
      get: TT.getPath,
      set: TT.setPath,
      has: TT.hasPath,
      unset: TT.deletePath,
      isEqual: deepEqual,
      isMatch: function (object, source) { return iteratee(source)(object); },
      isNil: function (value) { return value == null; },
      isNull: function (value) { return value === null; },
      isUndefined: function (value) { return value === undefined; },
      isArray: Array.isArray,
      isString: function (value) { return typeof value === 'string'; },
      isNumber: function (value) { return typeof value === 'number'; },
      isBoolean: function (value) { return typeof value === 'boolean'; },
      isFunction: function (value) { return typeof value === 'function'; },
      isObject: function (value) { return value != null && (typeof value === 'object' || typeof value === 'function'); },
      isPlainObject: isPlainObject,
      isEmpty: function (value) {
        if (value == null) return true;
        if (typeof value === 'string' || Array.isArray(value)) return value.length === 0;
        if (typeof value === 'object') return Object.keys(value).length === 0;
        return true;
      },
      clone: clone,
      cloneDeep: clone,
      toNumber: function (value) { var n = parseFloat(value); return Number.isFinite(n) ? n : 0; },
      toInteger: function (value) { return Math.trunc(lib.toNumber(value)); },
      toString: function (value) { return value == null ? '' : String(value); },
      defaultTo: function (value, fallback) { return value == null || Number.isNaN(value) ? fallback : value; },
      clamp: function (value, lower, upper) { return Math.min(Math.max(lib.toNumber(value), lower), upper); },
      round: function (value, precision) { var factor = Math.pow(10, precision || 0); return Math.round(lib.toNumber(value) * factor) / factor; },
      floor: function (value) { return Math.floor(lib.toNumber(value)); },
      ceil: function (value) { return Math.ceil(lib.toNumber(value)); },
      random: function (lower, upper, floating) {
        if (Array.isArray(lower)) return lower[Math.floor(Math.random() * lower.length)];
        if (typeof lower === 'boolean') return Math.random() < 0.5;
        if (upper === undefined) { upper = lower; lower = 0; }
        if (floating) return lower + Math.random() * (upper - lower);
        return lower + Math.floor(Math.random() * (upper - lower + 1));
      },
      sample: function (list) { return Array.isArray(list) && list.length ? list[Math.floor(Math.random() * list.length)] : undefined; },
      shuffle: function (list) { return (list || []).slice().sort(function () { return Math.random() - 0.5; }); },
      times: function (count, fn) { var out = []; for (var i = 0; i < count; i += 1) out.push(typeof fn === 'function' ? fn(i) : fn); return out; },
      range: function (start, end, step) {
        var from = start; var to = end; var by = step || 1;
        if (to === undefined) { to = from; from = 0; }
        var out = [];
        if (by > 0) for (var i = from; i < to; i += by) out.push(i);
        else for (var j = from; j > to; j += by) out.push(j);
        return out;
      },
      uniqueId: (function () { var id = 0; return function () { id += 1; return String(id); }; })(),
      escape: escapeHtml,
      unescape: function (text) { return String(text == null ? '' : text).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'); },
      upperFirst: function (text) { var s = String(text == null ? '' : text); return s ? s[0].toUpperCase() + s.slice(1) : s; },
      lowerFirst: function (text) { var s = String(text == null ? '' : text); return s ? s[0].toLowerCase() + s.slice(1) : s; },
      capitalize: function (text) { var s = String(text == null ? '' : text).toLowerCase(); return s ? s[0].toUpperCase() + s.slice(1) : s; },
      trim: function (text) { return String(text == null ? '' : text).trim(); },
      split: function (text, separator) { return String(text == null ? '' : text).split(separator); },
      join: function (list, separator) { return (list || []).join(separator == null ? ',' : separator); },
      includes: function (collection, value) { return typeof collection === 'string' ? collection.indexOf(value) >= 0 : Array.isArray(collection) ? collection.indexOf(value) >= 0 : false; },
      startsWith: function (text, target) { return String(text == null ? '' : text).indexOf(target) === 0; },
      endsWith: function (text, target) { var s = String(text == null ? '' : text); return s.slice(-String(target).length) === String(target); },
      replace: function (text, pattern, replacement) { return String(text == null ? '' : text).replace(pattern, replacement); },
      keys: function (object) { return Object.keys(object || {}); },
      values: function (object) { return Object.values(object || {}); },
      toPairs: function (object) { return Object.entries(object || {}); },
      assign: function () { return Object.assign.apply(Object, [{}].concat(Array.prototype.slice.call(arguments))); },
      merge: function (target) {
        for (var i = 1; i < arguments.length; i += 1) {
          var source = arguments[i] || {};
          Object.keys(source).forEach(function (key) {
            if (isPlainObject(source[key]) && isPlainObject(target[key])) lib.merge(target[key], source[key]);
            else target[key] = clone(source[key]);
          });
        }
        return target;
      },
      mergeWith: function (target, source) {
        Object.keys(source || {}).forEach(function (key) { target[key] = clone(source[key]); });
        return target;
      },
      update: function (object, path, updater) {
        var current = lib.get(object, path);
        var next = typeof updater === 'function' ? updater(current) : updater;
        lib.set(object, path, next);
        return object;
      },
      map: function (collection, fn) {
        var iterate = iteratee(fn);
        return Array.isArray(collection) ? collection.map(iterate) : Object.values(collection || {}).map(iterate);
      },
      filter: function (collection, fn) {
        var iterate = iteratee(fn);
        return Array.isArray(collection) ? collection.filter(iterate) : Object.values(collection || {}).filter(iterate);
      },
      reject: function (collection, fn) {
        var iterate = iteratee(fn);
        return (collection || []).filter(function (item) { return !iterate(item); });
      },
      find: function (collection, fn) {
        var iterate = iteratee(fn);
        return Array.isArray(collection) ? collection.find(iterate) : Object.values(collection || {}).find(iterate);
      },
      findIndex: function (collection, fn) {
        var iterate = iteratee(fn);
        return Array.isArray(collection) ? collection.findIndex(iterate) : -1;
      },
      some: function (collection, fn) {
        var iterate = iteratee(fn);
        return Array.isArray(collection) ? collection.some(iterate) : Object.values(collection || {}).some(iterate);
      },
      every: function (collection, fn) {
        var iterate = iteratee(fn);
        return Array.isArray(collection) ? collection.every(iterate) : Object.values(collection || {}).every(iterate);
      },
      forEach: function (collection, fn) {
        if (Array.isArray(collection)) collection.forEach(fn);
        else Object.keys(collection || {}).forEach(function (key) { fn(collection[key], key, collection); });
        return collection;
      },
      each: function (collection, fn) { return lib.forEach(collection, fn); },
      reduce: function (collection, fn, initial) {
        return Array.isArray(collection) ? collection.reduce(fn, initial) : Object.values(collection || {}).reduce(fn, initial);
      },
      groupBy: function (collection, fn) {
        var iterate = iteratee(fn);
        var out = {};
        (collection || []).forEach(function (item) {
          var key = iterate(item);
          (out[key] = out[key] || []).push(item);
        });
        return out;
      },
      keyBy: function (collection, fn) {
        var iterate = iteratee(fn);
        var out = {};
        (collection || []).forEach(function (item) { out[iterate(item)] = item; });
        return out;
      },
      sortBy: function (collection, fn) {
        var iterate = iteratee(fn);
        return (collection || []).slice().sort(function (a, b) {
          var va = iterate(a); var vb = iterate(b);
          return va < vb ? -1 : va > vb ? 1 : 0;
        });
      },
      uniq: function (list) { return Array.from(new Set(list || [])); },
      union: function () { return Array.from(new Set(Array.prototype.concat.apply([], arguments))); },
      flatten: function (list) { return (list || []).flat(); },
      flattenDeep: function (list) { return (list || []).flat(Infinity); },
      compact: function (list) { return (list || []).filter(Boolean); },
      first: function (list) { return (list || [])[0]; },
      head: function (list) { return (list || [])[0]; },
      last: function (list) { return (list || [])[(list || []).length - 1]; },
      nth: function (list, index) { return (list || [])[index < 0 ? (list || []).length + index : index]; },
      take: function (list, count) { return (list || []).slice(0, count == null ? 1 : count); },
      drop: function (list, count) { return (list || []).slice(count == null ? 1 : count); },
      debounce: function (fn) {
        var timer = null;
        var wrapped = function () {
          var args = arguments;
          if (timer) clearTimeout(timer);
          timer = setTimeout(function () { timer = null; fn.apply(null, args); }, 0);
        };
        wrapped.cancel = function () { if (timer) clearTimeout(timer); timer = null; };
        return wrapped;
      },
      throttle: function (fn) {
        var last = 0;
        var wrapped = function () {
          var now = Date.now();
          if (now - last >= 16) { last = now; return fn.apply(null, arguments); }
          return undefined;
        };
        wrapped.cancel = function () {};
        return wrapped;
      },
      once: function (fn) {
        var called = false; var result;
        return function () { if (!called) { called = true; result = fn.apply(null, arguments); } return result; };
      },
      identity: function (value) { return value; },
      noop: function () {},
      stubTrue: function () { return true; },
      stubFalse: function () { return false; },
      constant: function (value) { return function () { return value; }; },
    };
    function makeChain(value) {
      return {
        value: function () { return value; },
        valueOf: function () { return value; },
        toString: function () { return String(value); },
        map: function (fn) { return makeChain(lib.map(value, fn)); },
        filter: function (fn) { return makeChain(lib.filter(value, fn)); },
        reject: function (fn) { return makeChain(lib.reject(value, fn)); },
        sortBy: function (fn) { return makeChain(lib.sortBy(value, fn)); },
        uniq: function () { return makeChain(lib.uniq(value)); },
        flatten: function () { return makeChain(lib.flatten(value)); },
        take: function (count) { return makeChain(lib.take(value, count)); },
        last: function () { return lib.last(value); },
        first: function () { return lib.first(value); },
        head: function () { return lib.first(value); },
        toArray: function () { return value; },
      };
    }
    var callable = new Proxy(function (value) { return makeChain(value); }, {
      get: function (target, prop) {
        if (prop === 'prototype') return undefined;
        return lib[prop];
      },
      apply: function (target, thisArg, args) { return makeChain(args[0]); },
    });
    return callable;
  })();
  window._ = _;
  window.lodash = _;

  // ── toastr 与弹窗 ──────────────────────────────────────────
  var toastr = {
    options: {},
    success: function (message, title, options) { post({ tt: 'toast', level: 'success', message: String(message == null ? '' : message), title: title == null ? '' : String(title), options: options || {} }); },
    info: function (message, title, options) { post({ tt: 'toast', level: 'info', message: String(message == null ? '' : message), title: title == null ? '' : String(title), options: options || {} }); },
    warning: function (message, title, options) { post({ tt: 'toast', level: 'warning', message: String(message == null ? '' : message), title: title == null ? '' : String(title), options: options || {} }); },
    error: function (message, title, options) { post({ tt: 'toast', level: 'error', message: String(message == null ? '' : message), title: title == null ? '' : String(title), options: options || {} }); },
    clear: function () { post({ tt: 'toast-clear' }); },
    remove: function () { post({ tt: 'toast-clear' }); },
  };
  window.toastr = toastr;

  var POPUP_TYPE = { TEXT: 1, CONFIRM: 2, INPUT: 3, DISPLAY: 4, CROP: 5 };
  var POPUP_RESULT = {
    AFFIRMATIVE: 1, NEGATIVE: 0, CANCELLED: -1,
    CUSTOM1: 2, CUSTOM2: 3, CUSTOM3: 4, CUSTOM4: 5, CUSTOM5: 6, CUSTOM6: 7, CUSTOM7: 8, CUSTOM8: 9, CUSTOM9: 10,
  };
  var popupSeq = 0;
  var popupPending = new Map();

  function callGenericPopup(content, type, inputValue, options) {
    return new Promise(function (resolve) {
      var id = ++popupSeq;
      popupPending.set(id, resolve);
      post({
        tt: 'popup',
        id: id,
        content: typeof content === 'string' ? content : (content && content.outerHTML ? content.outerHTML : String(content == null ? '' : content)),
        type: type == null ? POPUP_TYPE.TEXT : type,
        inputValue: inputValue == null ? '' : String(inputValue),
        options: options || {},
      });
      setTimeout(function () {
        if (popupPending.has(id)) {
          popupPending.delete(id);
          resolve(POPUP_RESULT.CANCELLED);
        }
      }, 120000);
    });
  }

  window.callGenericPopup = callGenericPopup;
  window.POPUP_TYPE = POPUP_TYPE;
  window.POPUP_RESULT = POPUP_RESULT;

  // ── 事件全局 ───────────────────────────────────────────────
  function eventOn(type, listener) { return core.bus.on(type, listener); }
  function eventOnce(type, listener) { return core.bus.once(type, listener); }
  function eventMakeFirst(type, listener) { return core.bus.makeFirst(type, listener); }
  function eventMakeLast(type, listener) { return core.bus.makeLast(type, listener); }
  function eventRemoveListener(type, listener) { return core.bus.remove(type, listener); }
  function eventEmit(type) { return core.bus.emit.apply(core.bus, arguments); }
  function eventEmitAndWait(type) { return core.bus.emitAndWait.apply(core.bus, arguments); }
  function eventClearEvent(type) { return core.bus.clearEvent(type); }
  function eventClearListener(listener) { return core.bus.clearListener(listener); }
  function eventClearAll() { return core.bus.clearAll(); }

  window.eventOn = eventOn;
  window.eventOnce = eventOnce;
  window.eventMakeFirst = eventMakeFirst;
  window.eventMakeLast = eventMakeLast;
  window.eventRemoveListener = eventRemoveListener;
  window.eventEmit = eventEmit;
  window.eventEmitAndWait = eventEmitAndWait;
  window.eventClearEvent = eventClearEvent;
  window.eventClearListener = eventClearListener;
  window.eventClearAll = eventClearAll;
  window.tavern_events = TAVERN_EVENTS;
  window.event_types = TAVERN_EVENTS;
  window.iframe_events = {
    MESSAGE_IFRAME_RENDER_STARTED: 'message_iframe_render_started',
    MESSAGE_IFRAME_RENDER_ENDED: 'message_iframe_render_ended',
    GENERATION_REQUESTED: 'js_generation_requested',
    GENERATION_STARTED: 'js_generation_started',
    STREAM_TOKEN_RECEIVED_FULLY: 'js_stream_token_received_fully',
    STREAM_TOKEN_RECEIVED_INCREMENTALLY: 'js_stream_token_received_incrementally',
    GENERATION_ENDED: 'js_generation_ended',
  };

  // ── TH 变量 / 消息 / 宏 / 世界书全局 ────────────────────────
  window.getVariables = function (option) { return core.getVariables(option); };
  window.replaceVariables = function (variables, option) { return core.replaceVariables(variables, option); };
  window.updateVariablesWith = function (updater, option) { return core.updateVariablesWith(updater, option); };
  window.insertOrAssignVariables = function (variables, option) { return core.insertOrAssignVariables(variables, option); };
  window.insertVariables = function (variables, option) { return core.insertVariables(variables, option); };
  window.deleteVariable = function (key, option) { return core.deleteVariable(key, option); };
  window.getChatMessages = function (range, option) { return core.getChatMessages(range, option); };
  window.setChatMessages = function (messages, option) { return core.setChatMessages(messages, option); };
  window.createChatMessages = function (messages, option) { return core.createChatMessages(messages, option); };
  window.deleteChatMessages = function (ids, option) { return core.deleteChatMessages(ids, option); };
  window.rotateChatMessages = function (begin, middle, end, option) { return core.rotateChatMessages(begin, middle, end, option); };
  window.getLastMessageId = function () { return core.getLastMessageId(); };
  window.substitudeMacros = function (text) { return core.substituteMacros(text); };
  window.substituteParams = function (text) { return core.substituteMacros(text); };
  window.substituteParamsExtended = function (text) { return core.substituteMacros(text); };
  window.getTavernHelperVersion = function () { return '4.12.1'; };
  window.getTavernHelperExtensionId = function () { return 'JS-Slash-Runner'; };
  window.getTavernVersion = function () { return '1.13.4'; };
  window.getCurrentLocale = function () { return 'zh-CN'; };
  window.getMessageId = function () { return core.getCurrentMessageId(); };
  window.getScriptId = function () { return core.getCurrentScriptId(); };
  window.getButtonEvent = function (name) { return 'th_button_' + JSON.stringify([core.getCurrentScriptId(), String(name || '')]); };
  window.getScriptInfo = function () { return { id: core.getCurrentScriptId(), name: INIT.scriptName || '' }; };
  window.errorCatched = function (fn) {
    return function () {
      try { return fn.apply(this, arguments); } catch (error) {
        toastr.error(String(error && error.message ? error.message : error), '脚本错误');
        return undefined;
      }
    };
  };
  window.formatAsDisplayedMessage = function (messageId) {
    var list = core.getChatMessages(messageId == null ? -1 : messageId);
    var message = list[0];
    if (!message) return '';
    return textToHtml(applyRegexes(message.message, 2));
  };
  window.retrieveDisplayedMessage = window.formatAsDisplayedMessage;
  window.refreshOneMessage = function (messageId) { post({ tt: 'refresh', index: messageId }); };
  window.triggerSlash = function (command) {
    if (hostExtensions?.length) return executeExtensionCommands(command).then(function (result) {
      if (result.isError) throw new Error(result.errorMessage);
      return result.pipe;
    });
    try { return core.slashCommand(command); } catch (error) {
      toastr.error(String(error && error.message ? error.message : error), '命令失败');
      throw error;
    }
  };
  window.getLorebookEntries = async function (name) { return core.getLorebookEntries(name); };
  window.getWorldbook = function (name) { return core.getWorldbook(name); };
  window.getWorldbookNames = function () { return core.getWorldbookNames(); };
  window.getGlobalWorldbookNames = function () { return core.getGlobalWorldbookNames(); };
  window.getChatWorldbookName = function () { return core.getChatWorldbookName(); };
  window.getChatLorebook = window.getChatWorldbookName;
  window.getCharWorldbookNames = function () { return core.getCharWorldbookNames(); };
  window.getCurrentCharPrimaryLorebook = function () { return core.getCurrentCharPrimaryLorebook(); };
  window.getCharLorebooks = function (type) {
    var names = core.getCharWorldbookNames();
    if (type === 'primary') return names.primary;
    if (type === 'additional') return names.additional;
    return names;
  };
  window.getLorebooks = function () { return core.getWorldbookNames().map(function (name) { return core.getWorldbook(name); }); };
  // Legacy TavernHelper options are local to this script host. The core owns
  // the actual book bindings, and the DSH agent owns its activation pipeline.
  var lorebookOptions = {
    scan_depth: 4,
    context_percentage: 25,
    budget_cap: 0,
    min_activations: 0,
    max_depth: 0,
    max_recursion_steps: 5,
    insertion_strategy: 'character_first',
    include_names: false,
    recursive: true,
    case_sensitive: false,
    match_whole_words: false,
    use_group_scoring: false,
    overflow_alert: false,
  };
  window.getLorebookSettings = function () {
    var globals = core.getGlobalWorldbookNames();
    return {
      ...lorebookOptions,
      selected_global_lorebooks: globals,
      chatLorebook: core.getChatWorldbookName(),
      selectedGlobalLorebooks: globals.slice(),
      selectedCharLorebooks: core.getCharWorldbookNames(),
    };
  };
  window.setLorebookSettings = function (settings) {
    if (!settings || typeof settings !== 'object') return;
    Object.keys(lorebookOptions).forEach(function (key) {
      if (Object.hasOwn(settings, key) && typeof settings[key] === typeof lorebookOptions[key]) {
        lorebookOptions[key] = settings[key];
      }
    });
  };
  window.getTavernRegexes = function () { return (INIT.regexScripts || []).slice(); };
  window.formatAsTavernRegexedString = applyRegexes;
  window.isCharacterTavernRegexesEnabled = function () { return true; };
  window.registerMacroLike = function (name, fn) { core.registerMacro(name, fn); };
  var buttonsByScript = new Map((INIT.scripts || []).map(function (script) {
    return [script.id, script.buttons || []];
  }));
  function postScriptButtons() {
    post({ tt: 'script-buttons', scripts: Array.from(buttonsByScript, function (entry) {
      return { id: entry[0], names: (Array.isArray(entry[1]) ? entry[1] : []).filter(function (button) {
        return button?.visible !== false && typeof button?.name === 'string' && button.name;
      }).map(function (button) { return button.name; }) };
    }) });
  }
  window.getScriptButtons = function () {
    return structuredClone(buttonsByScript.get(core.getCurrentScriptId()) || []);
  };
  window.replaceScriptButtons = function (buttons) {
    buttonsByScript.set(core.getCurrentScriptId(), structuredClone(buttons));
    postScriptButtons();
  };
  window.updateScriptButtonsWith = function (updater) {
    var owner = core.getCurrentScriptId();
    var result = updater(window.getScriptButtons());
    function commit(buttons) {
      buttonsByScript.set(owner, structuredClone(buttons));
      postScriptButtons();
      return buttons;
    }
    return result && typeof result.then === 'function' ? Promise.resolve(result).then(commit) : commit(result);
  };
  window.appendInexistentScriptButtons = function (buttons) {
    var current = window.getScriptButtons();
    var existing = new Set(current.map(function (button) { return button.name; }));
    for (var button of buttons) {
      if (existing.has(button.name)) continue;
      existing.add(button.name);
      current.push(button);
    }
    window.replaceScriptButtons(current);
  };
  window.registerScriptButton = function (button) {
    window.replaceScriptButtons(window.getScriptButtons().concat(button));
  };
  window.getAllEnabledScriptButtons = function () {
    return Array.from(buttonsByScript.values()).flat().filter(function (button) { return button.visible !== false; });
  };
  /* __DSH_GENERATION_SHIM__ */
  var promptInjections = createPromptInjections();
  window.injectPrompts = promptInjections.inject;
  window.uninjectPrompts = promptInjections.uninject;
  var generation = createGenerationBridge({ post: post, emit: eventEmit, chat: core.chat,
    format: applyRegexes, events: window.iframe_events, collectInjections: promptInjections.collect });
  window.generate = function (options) { return generation.generate('generate', options); };
  window.generateRaw = function (options) { return generation.generate('generateRaw', options); };

  async function stGenerateRaw(options) {
    if (options?.prompt == null) return window.generateRaw(options);
    var data = { messages: Array.isArray(options.prompt) ? options.prompt : [{ role: 'user', content: options.prompt }],
      max_tokens: options.responseLength };
    await eventEmitAndWait(TAVERN_EVENTS.CHAT_COMPLETION_SETTINGS_READY, data);
    return window.generateRaw(Object.assign({}, options, {
      prompt: data.messages, temperature: data.temperature, max_tokens: data.max_tokens, stop: data.stop,
    }));
  }
  window.stopGenerationById = generation.stop;
  window.stopAllGeneration = generation.stopAll;
  window.getModelList = function () { return Promise.resolve([]); };
  window.getProxyPresetNames = function () { return Promise.resolve([]); };
  var presetViews = INIT.presetViews || {};
  var presetWrites = new Map();
  var presetSequence = 0;
  window.getPresetNames = function () { return INIT.presetName ? [INIT.presetName] : []; };
  window.getLoadedPresetName = function () { return INIT.presetName || '默认'; };
  window.getPreset = function (name) {
    var preset = name === 'in_use' ? presetViews.active : name === INIT.presetName ? presetViews.saved : null;
    if (!preset) throw new Error('DSH TH 宿主：找不到预设「' + name + '」');
    return structuredClone(preset);
  };
  window.loadPreset = function () { return Promise.resolve(); };
  window.replacePreset = async function (name, preset) {
    if (!((name === 'in_use' && presetViews.active) || (name === INIT.presetName && presetViews.saved))) {
      throw new Error('DSH TH 宿主：找不到预设「' + name + '」');
    }
    return new Promise(function (resolve, reject) {
      var id = ++presetSequence;
      var timer = setTimeout(function () {
        presetWrites.delete(id);
        reject(new Error('DSH TH 宿主：预设写入超时'));
      }, 5000);
      presetWrites.set(id, function (error, views) {
        clearTimeout(timer);
        presetWrites.delete(id);
        if (error) reject(new Error(error));
        else { presetViews = views; resolve(); }
      });
      post({ tt: 'preset-write', id: id, name: name, preset: preset });
    });
  };
  window.updatePresetWith = async function (name, updater, options) {
    var next = await updater(window.getPreset(name));
    await window.replacePreset(name, next, options);
    return window.getPreset(name);
  };
  window.createPreset = function () { throw new Error('DSH TH 宿主：预设写入未接通'); };
  window.createOrReplacePreset = function () { throw new Error('DSH TH 宿主：预设写入未接通'); };
  window.deletePreset = function () { throw new Error('DSH TH 宿主：预设写入未接通'); };
  window.renamePreset = function () { throw new Error('DSH TH 宿主：预设写入未接通'); };
  window.setPreset = function () { throw new Error('DSH TH 宿主：预设写入未接通'); };
  window.getCharacterNames = function () { return [core.charName]; };
  window.getCharacterIds = function () { return ['0']; };
  window.getCurrentCharacterName = function () { return core.charName; };
  window.getCurrentCharacterId = function () { return '0'; };
  window.getCharData = function () { return INIT.card || {}; };
  window.getCharAvatarPath = function () { return ''; };
  window.getChatHistoryBrief = function () { return core.getChatMessages('0-{{lastMessageId}}'); };
  window.getChatHistoryDetail = function () { return core.getChatMessages('0-{{lastMessageId}}', { include_swipes: true }); };
  window.getPersonaNames = function () { return [core.userName]; };
  window.getPersonaIds = function () { return ['0']; };
  window.getCurrentPersonaName = function () { return core.userName; };
  window.getCurrentPersonaId = function () { return '0'; };
  window.getPersonaAvatarPath = function () { return ''; };
  window.builtin = {};
  window.isAdmin = function () { return false; };
  window.getModelList = function () { return Promise.resolve([]); };
  window.initializeGlobal = function (name) { window[name] = window[name] || {}; return window[name]; };
  window.waitGlobalInitialized = function (name) {
    function readGlobal() { return window[name] ?? window.parent[name]; }
    var current = readGlobal();
    if (current != null) return Promise.resolve(current);
    return new Promise(function (resolve) {
      core.bus.once('global_' + name + '_initialized', function () { resolve(readGlobal()); });
    });
  };
  window.getTavernHelperExtensionId = function () { return 'JS-Slash-Runner'; };
  var hostExtensions = Array.isArray(INIT.extensions) ? INIT.extensions : [];
  function findHostExtension(name) {
    var key = String(name || '').toLowerCase().replace(/^third-party\//, '');
    return hostExtensions.find(function (item) { return item.slug === key || item.id === key; });
  }
  window.getExtensionType = function (name) { return findHostExtension(name) ? 'local' : 'system'; };
  window.getExtensionStatus = function (name) {
    var item = findHostExtension(name);
    return Promise.resolve({ installed: Boolean(item || ['JS-Slash-Runner', 'ST-Prompt-Template'].includes(name)),
      enabled: Boolean(item || ['JS-Slash-Runner', 'ST-Prompt-Template'].includes(name)) });
  };
  window.isInstalledExtension = async function (name) { return (await window.getExtensionStatus(name)).installed; };
  window.tavern_events = TAVERN_EVENTS;

  // 世界书写入 API：明确拒绝，避免脚本以为写成功了。
  ['createWorldbook', 'createOrReplaceWorldbook', 'deleteWorldbook', 'replaceWorldbook', 'updateWorldbookWith',
    'createWorldbookEntries', 'deleteWorldbookEntries', 'rebindGlobalWorldbooks', 'rebindCharWorldbooks',
    'rebindChatWorldbook', 'createLorebook', 'deleteLorebook',
    'replaceLorebookEntries', 'updatelorebookEntriesWith', 'setLorebookEntries', 'createLorebookEntries',
    'deleteLorebookEntries', 'createCharacter', 'createOrReplaceCharacter', 'deleteCharacter',
    'replaceCharacter', 'updateCharacterWith', 'createOrReplacePersona', 'deletePersona', 'replacePersona',
    'updatePersonaWith', 'replaceTavernRegexes', 'updateTavernRegexesWith', 'installExtension',
    'uninstallExtension', 'reinstallExtension', 'updateExtension', 'uploadTavernFile', 'deleteTavernFile'].forEach(function (name) {
    window[name] = function () { throw new Error('DSH TH 宿主：' + name + ' 是只读兼容层，未实现写入'); };
  });

  // ── SillyTavern 上下文 ────────────────────────────────────
  var headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': 'dsh-tt' };
  var extensionPrompts = Object.create(null);
  var extensionPromptTypes = { NONE: -1, IN_PROMPT: 0, IN_CHAT: 1, BEFORE_PROMPT: 2 };
  var extensionPromptRoles = { SYSTEM: 0, USER: 1, ASSISTANT: 2 };
  function collectExtensionPrompts() {
    return Object.keys(extensionPrompts).sort().flatMap(function (id) {
      var prompt = extensionPrompts[id];
      if (prompt.position !== extensionPromptTypes.IN_CHAT && prompt.position !== extensionPromptTypes.NONE) return [];
      return [{ id: id, content: prompt.value, depth: Math.max(0, Math.trunc(Number(prompt.depth) || 0)),
        role: ['system', 'user', 'assistant'][prompt.role] || (['user', 'assistant'].includes(prompt.role) ? prompt.role : 'system'),
        position: prompt.position === extensionPromptTypes.IN_CHAT ? 'in_chat' : 'none',
        should_scan: prompt.scan === true, filter: prompt.filter }];
    });
  }
  var functionTools = new Map();
  var extensionCalls = new Map();
  var extensionCallSequence = 0;
  var slashCommands = new Map();
  var slashCommandProps = { fromProps: function (props) { return props; } };
  var slashCommandParser = {
    addCommandObject: function (command) {
      if (!command || typeof command.name !== 'string' || typeof command.callback !== 'function') {
        throw new Error('扩展斜杠命令格式无效');
      }
      for (var alias of [command.name].concat(command.aliases || [])) {
        slashCommands.set(String(alias).toLowerCase(), command.callback);
      }
      post({ tt: 'extension-commands', names: Array.from(slashCommands.keys()) });
    },
  };
  var compatibilityBooks = new Map();
  for (var suppliedBook of [INIT.extensionBooks?.character, INIT.extensionBooks?.chat]) {
    if (suppliedBook) compatibilityBooks.set(suppliedBook.name, suppliedBook);
  }
  function extensionCall(method, args) {
    return new Promise(function (resolve, reject) {
      var id = ++extensionCallSequence;
      var timer = setTimeout(function () {
        extensionCalls.delete(id);
        reject(new Error('扩展宿主操作超时'));
      }, 8000);
      extensionCalls.set(id, function (error, value) {
        clearTimeout(timer);
        extensionCalls.delete(id);
        if (error) reject(new Error(error)); else resolve(value);
      });
      post({ tt: 'extension-call', id: id, method: method, args: args });
    });
  }

  function saveExtensionMetadata() {
    if (!hostExtensions.length) return Promise.resolve();
    var metadata = { ...core.chatMetadata };
    delete metadata.variables;
    return extensionCall('save-metadata', metadata);
  }

  function setCompatibilityBook(book, character) {
    compatibilityBooks.set(book.name, book);
    core.setExtensionWorldbook(book, character);
    if (!character) core.chatMetadata.world_info = book.name;
  }

  async function editCompatibilityBook(name, action, args) {
    var edited = await extensionCall('edit-worldbook', { ...args, name: name, action: action });
    if (action !== 'get-field') setCompatibilityBook(edited.book, edited.character);
    return edited.pipe;
  }

  async function worldbookCommand(name, named, text) {
    if (name === 'getcharbook') return core.getCharWorldbookNames().primary || '';
    if (name === 'getchatbook') {
      var bound = core.getChatWorldbookName();
      if (bound || named.create === 'false' || named.create === '0') return bound || '';
      var created = await extensionCall('create-chat-worldbook', named.name || text);
      setCompatibilityBook(created, false);
      await saveExtensionMetadata();
      return created.name;
    }
    var action = { createentry: 'create-entry', setentryfield: 'set-field', getentryfield: 'get-field' }[name];
    return editCompatibilityBook(named.file || core.getChatWorldbookName(), action,
      { uid: named.uid, field: named.field, key: named.key, text: text });
  }

  async function executeExtensionCommands(text) {
    try {
      if (!hostExtensions.length) return { pipe: core.slashCommand(text), isError: false, interrupt: false };
      var commands = await extensionCall('parse-slash', String(text || ''));
      var pipe = '';
      for (var command of commands) {
        var callback = slashCommands.get(command.name);
        var expand = function (content) { return String(content).replace(/\{\{pipe\}\}/g, function () { return pipe; }); };
        var named = Object.fromEntries(Object.entries(command.named).map(function ([key, value]) { return [key, expand(value)]; }));
        var unnamed = command.unnamed.map(expand);
        if (callback) {
          pipe = await callback(named, unnamed.length ? unnamed.join(' ') : pipe);
        } else if (['getcharbook', 'getchatbook', 'createentry', 'setentryfield', 'getentryfield'].includes(command.name)) {
          pipe = await worldbookCommand(command.name, named, unnamed.length ? unnamed.join(' ') : pipe);
        } else if (['echo', 'pass', 'run', 'comment', 'sys', 'sendas', 'trigger'].includes(command.name)) {
          pipe = core.slashCommand(command.raw.replace(/\{\{pipe\}\}/g, function () { return pipe; }));
        } else {
          pipe = core.runParsedCommand({ name: command.name, named: named, unnamed: unnamed }, pipe);
        }
        pipe = pipe == null ? '' : String(pipe);
      }
      return { pipe: pipe, isError: false, interrupt: false };
    } catch (error) {
      return { pipe: '', isError: true, interrupt: false, errorMessage: String(error?.message || error) };
    }
  }

  function characterCardFields() { return core.getCharacterCardFields(); }

  var ToolManager = {
    isToolCallingSupported: function () { return false; },
    canPerformToolCalls: function () { return false; },
    registerFunctionTool: function (tool) { functionTools.set(tool && tool.name, tool); },
    unregisterFunctionTool: function (name) { functionTools.delete(name); },
    getFunctionTools: function () { return Array.from(functionTools.values()); },
  };

  var ST = {
    chat: core.chat,
    chatMetadata: core.chatMetadata,
    extensionSettings: core.extensionSettings,
    characters: core.characters,
    name1: core.userName,
    name2: core.charName,
    characterId: '0',
    groupId: '',
    chatId: core.chatId,
    maxContext: 128000,
    onlineStatus: 'connected',
    streamingProcessor: null,
    mainApi: 'openai',
    menuType: 0,
    tags: [],
    tagMap: {},
    createCharacterData: {},
    extensionPrompts: extensionPrompts,
    extension_prompt_types: extensionPromptTypes,
    extension_prompt_roles: extensionPromptRoles,
    extensionNames: hostExtensions.map(function (item) { return 'third-party/' + item.slug; }),
    extensionTypes: Object.fromEntries(hostExtensions.map(function (item) { return ['third-party/' + item.slug, 'local']; })),
    chatCompletionSettings: { openai_model: 'dsh', chat_completion_source: 'dsh', temperature: 1, openai_max_tokens: 8000 },
    textCompletionSettings: {},
    powerUserSettings: {},
    symbols: { ignore: Symbol('ignore') },
    POPUP_TYPE: POPUP_TYPE,
    POPUP_RESULT: POPUP_RESULT,
    callGenericPopup: callGenericPopup,
    ToolManager: ToolManager,
    eventSource: {
      on: eventOn,
      makeLast: eventMakeLast,
      makeFirst: eventMakeFirst,
      removeListener: eventRemoveListener,
      emit: eventEmit,
      emitAndWait: eventEmitAndWait,
      once: eventOnce,
    },
    eventTypes: TAVERN_EVENTS,
    getCurrentChatId: function () { return core.chatId; },
    getRequestHeaders: function () { return Object.assign({}, headers); },
    saveChat: function () { post({ tt: 'save' }); return saveExtensionMetadata(); },
    saveSettingsDebounced: function () { post({ tt: 'settings', value: JSON.parse(JSON.stringify(core.extensionSettings)) }); return Promise.resolve(); },
    saveMetadata: saveExtensionMetadata,
    getCharacterCardFields: characterCardFields,
    getCharacters: function () { return Promise.resolve(core.characters); },
    loadWorldInfo: function (name) { return Promise.resolve(structuredClone(compatibilityBooks.get(name) || core.getWorldbook(name))); },
    saveWorldInfo: function (name, data) {
      if (!hostExtensions.length) throw new Error('DSH TH 宿主：世界书写入未接通');
      return editCompatibilityBook(name, 'replace', { data: data });
    },
    reloadWorldInfoEditor: function () {},
    updateWorldInfoList: function () { return Promise.resolve(); },
    convertCharacterBook: function (book) { return core.getWorldbook(book && book.name); },
    getWorldInfoPrompt: function () {
      return Promise.resolve({ worldInfoString: '', worldInfoBefore: '', worldInfoAfter: '', worldInfoExamples: [], worldInfoDepth: [], anBefore: [], anAfter: [] });
    },
    registerMacro: function (key, value) { core.registerMacro(key, value); },
    unregisterMacro: function (key) { core.unregisterMacro(key); },
    getChatCompletionModel: function () { return 'dsh'; },
    getCurrentLocale: function () { return 'zh-CN'; },
    translate: function (text) { return text; },
    t: function (strings) {
      var values = Array.prototype.slice.call(arguments, 1);
      return String(strings || '').replace(/\{(\w+)\}/g, function (raw, key) {
        var index = Number(key);
        return Number.isFinite(index) && values[index] !== undefined ? values[index] : raw;
      });
    },
    addLocaleData: function () {},
    registerFunctionTool: ToolManager.registerFunctionTool,
    unregisterFunctionTool: ToolManager.unregisterFunctionTool,
    isToolCallingSupported: ToolManager.isToolCallingSupported,
    canPerformToolCalls: ToolManager.canPerformToolCalls,
    registerDebugFunction: function () {},
    setExtensionPrompt: function (id, content, position, depth, scan, role, filter) {
      extensionPrompts[id] = { value: String(content == null ? '' : content), position: position, depth: depth, scan: scan, role: role, filter: filter };
      return Promise.resolve();
    },
    unsetExtensionPrompt: function (id) { delete extensionPrompts[id]; return Promise.resolve(); },
    generate: window.generate,
    generateQuietPrompt: function (text) { return window.generate({ user_input: String(text || '') }); },
    generateRaw: stGenerateRaw,
    stopGeneration: window.stopAllGeneration,
    sendSystemMessage: function (type, text) { post({ tt: 'system-message', text: String(text == null ? '' : text), type: type }); return Promise.resolve(); },
    addOneMessage: function (message) {
      return core.createChatMessages([{
        role: message && message.is_user ? 'user' : 'assistant',
        message: String(message && (message.mes || message.message) || ''),
        name: message && message.name,
      }]);
    },
    deleteLastMessage: function () { return core.deleteChatMessages([core.getLastMessageId()]); },
    updateMessageBlock: function (id) { core.touchMessage(id, true); },
    messageFormatting: function (message) { return textToHtml(applyRegexes(message, 2)); },
    uuidv4: function () {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) {
        var value = (Math.random() * 16) | 0;
        return (ch === 'x' ? value : (value & 0x3) | 0x8).toString(16);
      });
    },
    humanizedDateTime: function () { return new Date().toLocaleString('zh-CN'); },
    getTokenizerModel: function () { return 'dsh'; },
    getTextTokens: function (type, text) { return Promise.resolve(Math.ceil(String(text || '').length / 3.2)); },
    getTokenCountAsync: function (text) { return Promise.resolve(Math.ceil(String(text || '').length / 3.2)); },
    substituteParams: function (text) { return core.substituteMacros(text); },
    substituteParamsExtended: function (text) { return core.substituteMacros(text); },
    renderExtensionTemplateAsync: async function (extension, template) {
      var item = findHostExtension(extension);
      var parts = String(template || '').split('/');
      if (!item || parts.some(function (part) { return !part || part === '.' || part === '..' || /[\\:]/.test(part); })) {
        throw new Error('扩展模板路径无效');
      }
      var url = item.assetBase + '/' + parts.map(encodeURIComponent).join('/') + '.html';
      var response = await fetch(url);
      if (!response.ok) throw new Error('找不到扩展模板（HTTP ' + response.status + '）');
      return response.text();
    },
    getPresetManager: function () { return null; },
    showLoader: function () {}, hideLoader: function () { return Promise.resolve(); },
    isMobile: function () { return false; },
    shouldSendOnEnter: function () { return true; },
    timestampToMoment: function (value) { return new Date(value); },
    executeSlashCommandsWithOptions: executeExtensionCommands,
    SlashCommandParser: slashCommandParser,
    SlashCommand: slashCommandProps,
    SlashCommandArgument: slashCommandProps,
    SlashCommandNamedArgument: slashCommandProps,
    ARGUMENT_TYPE: { STRING: 'string', NUMBER: 'number', BOOLEAN: 'boolean', LIST: 'list', DICTIONARY: 'dictionary' },
    clearChat: function () { return core.deleteChatMessages(Array.from({ length: core.getLastMessageId() + 1 }, function (_, index) { return index; })); },
    printMessages: function () { return Promise.resolve(); },
    updateChatMetadata: function (values) { Object.assign(core.chatMetadata, values || {}); },
    saveReply: function () { return Promise.resolve(); },
    timestamp: function () { return Date.now(); },
    ChatCompletionService: {},
    TextCompletionService: {},
    ConnectionManagerRequestService: {},
    registerDataBankScraper: function () { return Promise.resolve(); },
    getThumbnailUrl: function () { return ''; },
    writeExtensionField: async function (characterId, key, value) {
      var character = core.characters[Number(characterId)];
      if (!hostExtensions.length || !character) throw new Error('找不到扩展正在操作的角色卡');
      await extensionCall('write-card-extension', { key: key, value: value });
      var fields = character.data.extensions ||= {};
      if (value == null) delete fields[key]; else fields[key] = structuredClone(value);
    },
    unshallowCharacter: function () { return Promise.resolve(); },
    getTextGenServer: function () { return ''; },
    extractMessageFromData: function (data) { return String(data && data.content || ''); },
  };
  ST.getContext = function () {
    var context = {};
    Object.keys(ST).forEach(function (key) { context[key] = ST[key]; });
    context.getContext = ST.getContext;
    ['getVariables', 'replaceVariables', 'updateVariablesWith', 'insertOrAssignVariables', 'insertVariables',
      'deleteVariable', 'getChatMessages', 'setChatMessages', 'createChatMessages', 'deleteChatMessages',
      'rotateChatMessages', 'getLastMessageId', 'substitudeMacros', 'eventOn', 'eventOnce', 'eventEmit',
      'eventEmitAndWait', 'eventRemoveListener', 'formatAsDisplayedMessage', 'retrieveDisplayedMessage',
      'refreshOneMessage', 'triggerSlash', 'getLorebookEntries', 'getWorldbook', 'getWorldbookNames',
      'getCharWorldbookNames', 'getCurrentCharPrimaryLorebook', 'getTavernHelperVersion', 'getTavernVersion',
      'getScriptId', 'getButtonEvent', 'getMessageId', 'errorCatched', 'registerMacroLike'].forEach(function (key) {
      context[key] = window[key];
    });
    return context;
  };
  Object.defineProperty(ST, 'chat', { get: function () { return core.chat; }, enumerable: true, configurable: true });
  Object.defineProperty(ST, 'chatMetadata', { get: function () { return core.chatMetadata; }, enumerable: true, configurable: true });
  Object.defineProperty(ST, 'extensionSettings', { get: function () { return core.extensionSettings; }, enumerable: true, configurable: true });
  Object.defineProperty(ST, 'characters', { get: function () { return core.characters; }, enumerable: true, configurable: true });
  Object.defineProperty(ST, 'chatCompletionSettings', { value: ST.chatCompletionSettings, writable: true, enumerable: true, configurable: true });
  window.SillyTavern = ST;
  window.getContext = ST.getContext;

  // ── TavernHelper 对象 ─────────────────────────────────────
  var TavernHelper = {};
  ['playAudio', 'pauseAudio', 'getAudioList', 'replaceAudioList', 'appendAudioList', 'getAudioSettings',
    'setAudioSettings', 'getCurrentAudio', 'getVariables', 'replaceVariables', 'updateVariablesWith',
    'insertOrAssignVariables', 'insertVariables', 'deleteVariable', 'getChatMessages', 'setChatMessages',
    'createChatMessages', 'deleteChatMessages', 'rotateChatMessages', 'getLastMessageId', 'substitudeMacros',
    'eventOn', 'eventOnce', 'eventEmit', 'eventEmitAndWait', 'eventRemoveListener', 'eventMakeFirst',
    'eventMakeLast', 'eventClearEvent', 'eventClearListener', 'eventClearAll', 'getTavernHelperVersion',
    'getTavernHelperExtensionId', 'getTavernVersion', 'formatAsDisplayedMessage', 'retrieveDisplayedMessage',
    'refreshOneMessage', 'triggerSlash', 'getLorebookEntries', 'getWorldbook', 'getWorldbookNames',
    'getGlobalWorldbookNames', 'getChatWorldbookName', 'getChatLorebook',
    'getCharWorldbookNames', 'getCurrentCharPrimaryLorebook', 'getCharLorebooks',
    'getLorebooks', 'getLorebookSettings', 'setLorebookSettings', 'getTavernRegexes', 'formatAsTavernRegexedString',
    'isCharacterTavernRegexesEnabled', 'registerMacroLike', 'injectPrompts', 'uninjectPrompts', 'generate',
    'generateRaw', 'getModelList', 'getProxyPresetNames', 'stopGenerationById', 'stopAllGeneration',
    'getPresetNames', 'getLoadedPresetName', 'getPreset', 'loadPreset', 'replacePreset', 'updatePresetWith', 'getCharacterNames',
    'getCharacterIds', 'getCurrentCharacterName', 'getCurrentCharacterId', 'getCharData', 'getCharAvatarPath',
    'getChatHistoryBrief', 'getChatHistoryDetail', 'getPersonaNames', 'getPersonaIds', 'getCurrentPersonaName',
    'getCurrentPersonaId', 'getPersonaAvatarPath', 'getMessageId', 'errorCatched', 'getScriptId',
    'getButtonEvent', 'getScriptButtons', 'replaceScriptButtons', 'updateScriptButtonsWith', 'appendInexistentScriptButtons',
    'getAllEnabledScriptButtons', 'initializeGlobal', 'waitGlobalInitialized', 'builtin',
    'isAdmin', 'getExtensionType', 'getExtensionStatus', 'isInstalledExtension', 'builtin_prompt_default_order',
    'default_preset', 'RawCharacter'].forEach(function (key) {
    if (window[key] !== undefined) TavernHelper[key] = window[key];
  });
  TavernHelper.builtin_prompt_default_order = [];
  TavernHelper.default_preset = null;
  TavernHelper.RawCharacter = { from: function () { throw new Error('DSH TH 宿主：RawCharacter 未实现'); } };
  window.TavernHelper = TavernHelper;

  // ── 脚本执行 ──────────────────────────────────────────────
  var evaluateModule = window.__TT_IMPORT_MODULE__;
  delete window.__TT_IMPORT_MODULE__;
  var moduleSequence = 0;
  var currentScript = null;
  var scriptErrors = [];
  var helperRoot = document.createElement('div');
  helperRoot.id = 'tavern_helper';
  helperRoot.style.display = 'none';
  document.body.appendChild(helperRoot);

  function scriptError(script, error) {
    var text = String(error && (error.stack || error.message) || error)
      .replace(/data:text\/javascript;charset=utf-8,[^\s)]*/g, '角色脚本');
    scriptErrors.push({ id: script && script.id, name: script && script.name, error: text });
    log('error', '脚本「' + (script?.name || script?.id || '?') + '」出错：' + text.slice(0, 800));
  }

  window.addEventListener('error', function (event) {
    if (event && event.message) {
      scriptError(currentScript, event.error || event.message);
    }
  }, true);
  // 资源加载失败（module import / img / link）不会冒泡成 message 错误，
  // 用捕获阶段把它们记下来——MVU 依赖 jsdelivr，失败时这条日志是唯一线索。
  window.addEventListener('error', function (event) {
    var target = event && event.target;
    var url = target && (target.src || target.href);
    if (!url || target.rel === 'modulepreload') return;
    if (event.message) return;
    scriptErrors.push({ id: currentScript && currentScript.id, name: currentScript && currentScript.name, error: '资源加载失败：' + url });
    log('error', '资源加载失败：' + url);
  }, true);
  window.addEventListener('unhandledrejection', function (event) {
    scriptError(currentScript, event.reason);
  });

  function scriptMode(content) {
    var program;
    try {
      program = parseScript(content, { ecmaVersion: 'latest', sourceType: 'script' });
    } catch {
      // A module can declare imports anywhere in its top-level statement list.
      // Parse before executing so a syntax error cannot cause a script to run twice.
      program = parseScript(content, { ecmaVersion: 'latest', sourceType: 'module' });
      var specifiers = program.body.filter(function (node) { return node.source; }).map(function (node) { return node.source; });
      return { module: true, specifiers: specifiers, dependencies: program.body.filter(function (node) {
        return node.source && !node.attributes?.length;
      }).map(function (node) { return node.source.value; }) };
    }
    var statement = program.body[0];
    if (program.body.length !== 1 || statement.type !== 'ExpressionStatement') return { module: false };
    var expression = statement.expression;
    if (expression.type === 'ImportExpression' && !expression.options) {
      var source = expression.source;
      if (source.type === 'Literal' && typeof source.value === 'string') {
        return { module: true, importUrl: source.value };
      }
      if (source.type === 'TemplateLiteral' && source.expressions.length === 0) {
        return { module: true, importUrl: source.quasis[0].value.cooked };
      }
    }
    return { module: false };
  }

  function inlineModuleUrl(content, specifiers) {
    // A data module has no relative base. Keep document-relative static imports
    // and re-exports pointing at the same URLs as an inline script element.
    for (var source of specifiers.slice().reverse()) {
      if (!/^(?:\/|\.{1,2}\/)/.test(source.value)) continue;
      var url = new URL(source.value, document.baseURI).href;
      content = content.slice(0, source.start) + JSON.stringify(url) + content.slice(source.end);
    }
    return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(content) + '#dsh-tt-' + (++moduleSequence);
  }

  function preloadDependencies(modes) {
    var preloads = new Map();
    for (var mode of modes) {
      for (var url of (mode?.dependencies || (mode?.importUrl ? [mode.importUrl] : []))) {
        if (!/^https:\/\//i.test(url) || preloads.has(url)) continue;
        var link = document.createElement('link');
        link.rel = 'modulepreload';
        link.href = url;
        preloads.set(url, link);
        link.onload = function () { this.ttPreloadStatus = 'ready'; };
        link.onerror = function () { this.ttPreloadStatus = 'error'; };
        document.head.appendChild(link);
      }
    }
    return preloads;
  }

  /** 在脚本启动瞬间让它看到「只有自己」的 #tavern_helper，复刻 TH 的每脚本 iframe 语义。 */
  function markCurrentScript(script) {
    helperRoot.innerHTML = '';
    var marker = document.createElement('div');
    marker.setAttribute('data-script-id', String(script.id || ''));
    helperRoot.appendChild(marker);
  }

  function runScript(script, mode, preloads) {
    var content = String(script.content);
    return new Promise(function (resolve) {
      currentScript = script;
      var callbacks = [];
      startupCallbacks = callbacks;
      core.makeScriptContext(script.id, -1);
      markCurrentScript(script);
      var settled = false;
      var timer;
      var dependencies = mode.dependencies || (mode.importUrl ? [mode.importUrl] : []);
      function moduleSource() {
        var pending = dependencies.filter(function (url) {
          return preloads.has(url) && preloads.get(url).ttPreloadStatus !== 'ready';
        });
        if (pending.length) return '，预载未就绪 ' + pending.slice(0, 3).join('、').slice(0, 420);
        if (!dependencies.length) return '';
        return '，入口 ' + dependencies[0].slice(0, 240);
      }
      function settle() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        currentScript = null;
        startupCallbacks = null;
        resolve(mode.module);
      }
      function finish() {
        if (settled) return;
        clearTimeout(timer);
        if (!callbacks.length) {
          settle();
          return;
        }
        // Give ready callbacks time to use their script context. A callback
        // may await APP_READY or an event from a script later in the queue.
        timer = setTimeout(function () {
          log('warn', '脚本「' + (script.name || script.id) + '」初始化仍在等待，继续加载其余脚本');
          settle();
        }, 2000);
        Promise.all(callbacks).then(settle);
      }
      function fail(error) {
        if (settled) return;
        var detail = String(error?.message || error || '').replace(/data:text\/javascript;charset=utf-8,[^\s)]*/g, '角色脚本');
        scriptError(script, '脚本模块加载或执行失败（' + detail.slice(0, 300) + moduleSource() + '）');
        settle();
      }
      log('info', '执行脚本「' + (script.name || script.id) + '」' + (mode.module ? '（module）' : ''));
      if (mode.module) {
        timer = setTimeout(function () {
          scriptError(script, '脚本模块加载超时（60 秒，等待导入依赖或模块执行' + moduleSource() + '）');
          settle();
        }, 60000);
        try {
          // Inline module elements do not fire load. The import promise settles
          // after dependencies and top-level await have finished executing.
          evaluateModule(mode.importUrl ?? inlineModuleUrl(content, mode.specifiers)).then(finish, fail);
        } catch (error) { fail(error); }
        return;
      }
      try {
        var element = document.createElement('script');
        element.setAttribute('data-tt-script', String(script.id || ''));
        element.textContent = content;
        document.body.appendChild(element);
      } catch (error) {
        scriptError(script, error);
        settle();
        return;
      }
      finish();
    });
  }

  function loadExtensionStyle(url) {
    return new Promise(function (resolve, reject) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      var timeout = setTimeout(function () { reject(new Error('样式加载超时')); }, 10000);
      link.onload = function () { clearTimeout(timeout); resolve(); };
      link.onerror = function () { clearTimeout(timeout); reject(new Error('样式加载失败')); };
      document.head.appendChild(link);
    });
  }

  async function runExtensions() {
    // Load in manifest order. A failed extension must not block card scripts.
    for (var item of hostExtensions) {
      var error = '';
      try {
        if (item.requires?.length) throw new Error('宿主缺少依赖：' + item.requires.join('、'));
        if (item.css) await loadExtensionStyle(item.css);
        if (item.js) {
          var timer;
          try {
            await Promise.race([
              evaluateModule(new URL(item.js, document.baseURI).href),
              new Promise(function (_, reject) { timer = setTimeout(function () { reject(new Error('模块启动超时')); }, 15000); }),
            ]);
          } finally { clearTimeout(timer); }
        }
      } catch (cause) {
        error = String(cause?.message || cause).slice(0, 400);
        log('warn', '扩展「' + item.name + '」启动失败：' + error);
      }
      post({ tt: 'extension-status', id: item.id, error: error });
    }
  }

  async function runScripts() {
    await runExtensions();
    var scripts = Array.isArray(INIT.scripts) ? INIT.scripts : [];
    var modes = scripts.map(function (script) {
      if (!script?.content) return null;
      try { return scriptMode(String(script.content)); }
      catch (error) { return { error: error }; }
    });
    var preloads = preloadDependencies(modes);
    var hasModule = false;
    for (var i = 0; i < scripts.length; i += 1) {
      var item = scripts[i];
      var mode = modes[i];
      if (!mode) continue;
      try {
        if (mode.error) throw mode.error;
        if (await runScript(item, mode, preloads)) hasModule = true;
      } catch (error) {
        scriptError(item, error);
      }
    }
    currentScript = null;
    // 脚本可能异步注册监听；稍后补发一次就绪事件。
    setTimeout(function () {
      try {
        core.bus.emit(TAVERN_EVENTS.CHAT_CHANGED, core.chatId);
        core.bus.emit(TAVERN_EVENTS.APP_READY);
        core.bus.emit(TAVERN_EVENTS.SETTINGS_LOADED);
        core.bus.emit(TAVERN_EVENTS.EXTENSIONS_FIRST_LOAD);
        // 让 MVU 在玩家发出第一条消息之前就完成 [InitVar] 初始化。
        if (core.getLastMessageId() >= 0) {
          core.bus.emit(TAVERN_EVENTS.GENERATION_STARTED, 'dsh-tt-init', {}, false);
        }
      } catch (error) { scriptError(null, error); }
      post({ tt: 'ready', scripts: scripts.map(function (item) { return { id: item.id, name: item.name }; }), module: hasModule, errors: scriptErrors.length });
    }, 800);
  }

  // ── 父窗口 → iframe ──────────────────────────────────────
  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data || data.__ttParent !== true) return;
    try {
      switch (data.type) {
        case 'chat': {
          var previousLength = core.chat.length;
          core.applyChat(data.messages || [], { emitAdded: data.emitAdded !== false });
          var ended = data.generationEnded ?? core.chat.slice(previousLength).some(function (message) {
            return !message.is_user && !message.is_system;
          });
          if (data.emitAdded !== false && ended) core.bus.emit(TAVERN_EVENTS.GENERATION_ENDED, core.chat.length, 'normal');
          break;
        }
        case 'emit':
          core.bus.emit.apply(core.bus, [data.event].concat(data.args || []));
          break;
        case 'script-button': {
          var script = (INIT.scripts || []).find(function (item) { return item.id === data.id; });
          var buttons = buttonsByScript.get(data.id) || [];
          if (!script || !buttons.some(function (button) { return button?.name === data.name && button.visible !== false; })) break;
          core.makeScriptContext(script.id, -1);
          markCurrentScript(script);
          core.bus.emit(window.getButtonEvent(data.name));
          break;
        }
        case 'generation-frame':
          generation.receive(data);
          break;
        case 'collect-prompts':
          eventEmitAndWait(TAVERN_EVENTS.GENERATION_AFTER_COMMANDS, 'normal', {}, false)
            .then(function () { return promptInjections.collect(collectExtensionPrompts()); })
            .then(function (items) { post({ tt: 'prompt-injections', id: data.id, items: items }); })
            .catch(function (error) {
              scriptError(null, error);
              post({ tt: 'prompt-injections', id: data.id, items: [] });
            });
          break;
        case 'popup-result': {
          var resolve = popupPending.get(data.id);
          if (resolve) {
            popupPending.delete(data.id);
            resolve(data.result);
          }
          break;
        }
        case 'preset-views':
          presetViews = data.views || {};
          break;
        case 'preset-write-result':
          presetWrites.get(data.id)?.(data.error, data.views);
          break;
        case 'extension-call-result':
          extensionCalls.get(data.id)?.(data.error, data.value);
          break;
        case 'extension-run-slash':
          executeExtensionCommands(data.text).then(function (result) {
            post({ tt: 'extension-slash-result', id: data.id, result: result });
          });
          break;
        case 'settings':
          Object.keys(core.extensionSettings).forEach(function (key) { delete core.extensionSettings[key]; });
          Object.assign(core.extensionSettings, data.value || {});
          break;
        case 'refresh':
          post({ tt: 'chat-reload' });
          break;
        case 'dispose':
          core.bus.clearAll();
          break;
        default:
          break;
      }
    } catch (error) {
      scriptError(null, error);
    }
  });

  post({ tt: 'boot', chatId: core.chatId, charName: core.charName, scriptCount: (INIT.scripts || []).length });
  postScriptButtons();
  runScripts();
})();
