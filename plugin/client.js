// 角色扮演（Client）—— 面板：局列表 / 窄顶栏 / 聊天区 / composer / 资产与 TH 宿主
// 构建时由 tools/build-client.mjs 注入资产快照、TH 核心与 shim 源码。
window.__ModuleLoader__.load({
  id: '@dsh-tt/roleplay',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useMemo, useRef, useCallback } = React;

    const SNAPSHOT = {"version":3,"generatedAt":"2026-11-15T09:59:00.204Z","roots":["C:\\coding\\dsh-tt\\参考","C:\\coding\\dsh-tt\\assets"],"counts":{"cards":3,"presets":1,"lorebooks":0,"errors":0},"cards":[{"id":"天极1-5-0","file":"1.5.png","filePath":"C:\\coding\\dsh-tt\\参考\\1.5.png","name":"天极1.5","creator":"TavernWeave","spec":"chara_card_v3","version":"1.5","tags":["仙武","大世界","MVU","Zod","EJS","开放探索"],"counts":{"description":136,"firstMes":9,"greetings":2,"examples":0,"lorebookEntries":203,"lorebookChars":443313,"regexScripts":9,"thScripts":3,"thScriptsEnabled":3},"worldName":"天极1.5世界书","hasTavernHelper":true,"depthPrompt":{"prompt":"","depth":4,"role":"system"},"hasFilePath":true},{"id":"天元录-1","file":"688e49680bc24949a25daf3f636721a8.png","filePath":"C:\\coding\\dsh-tt\\参考\\688e49680bc24949a25daf3f636721a8.png","name":"天元录","creator":"时之写卡器","spec":"chara_card_v3","version":"","tags":[],"counts":{"description":0,"firstMes":118,"greetings":0,"examples":849,"lorebookEntries":161,"lorebookChars":242424,"regexScripts":4,"thScripts":6,"thScriptsEnabled":6},"worldName":"天元录","hasTavernHelper":true,"depthPrompt":{"prompt":"","depth":4,"role":"system"},"hasFilePath":true},{"id":"春日狂想曲-统一版-玩家通道-2","file":"IMG_4552.PNG","filePath":"C:\\coding\\dsh-tt\\参考\\IMG_4552.PNG","name":"春日狂想曲·统一版（玩家通道）","creator":"时之写卡器","spec":"chara_card_v3","version":"unified-v1.22-player","tags":[],"counts":{"description":20,"firstMes":33,"greetings":3,"examples":827,"lorebookEntries":126,"lorebookChars":282547,"regexScripts":14,"thScripts":15,"thScriptsEnabled":2},"worldName":"同层版-春日狂想曲","hasTavernHelper":true,"depthPrompt":{"prompt":"","depth":4,"role":"system"},"hasFilePath":true}],"presets":[{"id":"导入的预设-0","file":"梦鲸思客V5-1030-exp.json","filePath":"C:\\coding\\dsh-tt\\参考\\梦鲸思客V5-1030-exp.json","name":"导入的预设","counts":{"prompts":122,"enabled":44,"markers":8,"chars":32084,"temperature":1,"maxTokens":30000}}],"lorebooks":[],"errors":[]};
    const TAVERN_CORE_SRC = "/* 酒馆助手（TavernHelper）兼容运行时的纯状态层。\r\n *\r\n * 这里只做数据与语义：变量五个作用域、聊天消息、事件总线、世界书、宏、STScript 子集。\r\n * DOM / iframe / postMessage 由 shim.js 负责。文件同时能被 Node 直接 require（测试用）。\r\n */\r\nvar TT_CORE = (function () {\r\n  'use strict';\r\n\r\n  // ── 通用工具 ────────────────────────────────────────────────\r\n  function clone(value) {\r\n    if (value == null || typeof value !== 'object') return value;\r\n    try { return structuredClone(value); } catch { /* ignore */ }\r\n    try { return JSON.parse(JSON.stringify(value)); } catch { return value; }\r\n  }\r\n\r\n  function isPlainObject(value) {\r\n    if (value == null || typeof value !== 'object') return false;\r\n    var proto = Object.getPrototypeOf(value);\r\n    return proto === Object.prototype || proto === null;\r\n  }\r\n\r\n  function toPath(path) {\r\n    if (Array.isArray(path)) return path.slice();\r\n    if (path == null) return [];\r\n    return String(path)\r\n      .replace(/\\[(\\d+)\\]/g, '.$1')\r\n      .replace(/\\[[\"']([^\"']+)[\"']\\]/g, '.$1')\r\n      .split('.')\r\n      .filter(function (part) { return part !== ''; });\r\n  }\r\n\r\n  function getPath(object, path, fallback) {\r\n    if (object == null) return fallback;\r\n    var parts = toPath(path);\r\n    if (!parts.length) return object;\r\n    var current = object;\r\n    for (var i = 0; i < parts.length; i += 1) {\r\n      if (current == null) return fallback;\r\n      current = current[parts[i]];\r\n    }\r\n    return current === undefined ? fallback : current;\r\n  }\r\n\r\n  function setPath(object, path, value) {\r\n    var parts = toPath(path);\r\n    if (!parts.length) return object;\r\n    var current = object;\r\n    for (var i = 0; i < parts.length - 1; i += 1) {\r\n      var part = parts[i];\r\n      if (current[part] == null || typeof current[part] !== 'object') current[part] = {};\r\n      current = current[part];\r\n    }\r\n    current[parts[parts.length - 1]] = value;\r\n    return object;\r\n  }\r\n\r\n  function hasPath(object, path) {\r\n    if (object == null) return false;\r\n    var parts = toPath(path);\r\n    if (!parts.length) return false;\r\n    var current = object;\r\n    for (var i = 0; i < parts.length; i += 1) {\r\n      if (current == null || !Object.prototype.hasOwnProperty.call(current, parts[i])) return false;\r\n      current = current[parts[i]];\r\n    }\r\n    return true;\r\n  }\r\n\r\n  function deletePath(object, path) {\r\n    var parts = toPath(path);\r\n    if (!parts.length || object == null) return false;\r\n    var current = object;\r\n    for (var i = 0; i < parts.length - 1; i += 1) {\r\n      if (current == null || !Object.prototype.hasOwnProperty.call(current, parts[i])) return false;\r\n      current = current[parts[i]];\r\n    }\r\n    if (current == null) return false;\r\n    return delete current[parts[parts.length - 1]];\r\n  }\r\n\r\n  function deepEqual(a, b) {\r\n    if (a === b) return true;\r\n    if (typeof a !== typeof b) return false;\r\n    if (a == null || b == null) return false;\r\n    if (Array.isArray(a) !== Array.isArray(b)) return false;\r\n    if (typeof a !== 'object') return false;\r\n    var keysA = Object.keys(a);\r\n    var keysB = Object.keys(b);\r\n    if (keysA.length !== keysB.length) return false;\r\n    for (var i = 0; i < keysA.length; i += 1) {\r\n      if (!Object.prototype.hasOwnProperty.call(b, keysA[i]) || !deepEqual(a[keysA[i]], b[keysA[i]])) return false;\r\n    }\r\n    return true;\r\n  }\r\n\r\n  function hashSignature(value) {\r\n    var source;\r\n    try { source = JSON.stringify(value); } catch { source = String(value); }\r\n    var hash = 2166136261;\r\n    for (var i = 0; i < source.length; i += 1) {\r\n      hash ^= source.charCodeAt(i);\r\n      hash = Math.imul(hash, 16777619);\r\n    }\r\n    return (hash >>> 0).toString(36) + ':' + source.length;\r\n  }\r\n\r\n  function pad(value) { return String(value).padStart(2, '0'); }\r\n\r\n  function randomPick(list, random) {\r\n    if (!list || !list.length) return '';\r\n    return list[Math.floor(random() * list.length)];\r\n  }\r\n\r\n  function splitArgs(inner, sep) {\r\n    if (inner.indexOf(sep) >= 0) return inner.split(sep).filter(function (part) { return part !== ''; });\r\n    if (inner.indexOf(' ') >= 0) return inner.split(/\\s+/).filter(Boolean);\r\n    return [inner];\r\n  }\r\n\r\n  // ── 事件总线 ────────────────────────────────────────────────\r\n  function createEventBus(onError) {\r\n    var listeners = new Map();\r\n\r\n    function listOf(type) {\r\n      if (!listeners.has(type)) listeners.set(type, []);\r\n      return listeners.get(type);\r\n    }\r\n\r\n    function add(type, listener, mode) {\r\n      if (typeof listener !== 'function') throw new Error('事件监听器必须是函数');\r\n      var entry = { fn: listener, mode: mode || 'normal' };\r\n      var list = listOf(type);\r\n      if (mode === 'first') list.unshift(entry);\r\n      else if (mode === 'last') list.push(entry);\r\n      else {\r\n        // TH 语义：同类型事件里相同函数只注册一次\r\n        if (list.some(function (item) { return item.fn === listener; })) return { stop: function () {} };\r\n        list.push(entry);\r\n      }\r\n      return {\r\n        stop: function () { remove(type, listener); },\r\n      };\r\n    }\r\n\r\n    function remove(type, listener) {\r\n      var list = listOf(type);\r\n      var index = list.findIndex(function (item) { return item.fn === listener; });\r\n      if (index >= 0) list.splice(index, 1);\r\n    }\r\n\r\n    function emit(type) {\r\n      var args = Array.prototype.slice.call(arguments, 1);\r\n      var list = listOf(type).slice();\r\n      var pending = [];\r\n      for (var i = 0; i < list.length; i += 1) {\r\n        var entry = list[i];\r\n        if (entry.mode === 'once') remove(type, entry.fn);\r\n        try {\r\n          var result = entry.fn.apply(globalThis, args);\r\n          if (result && typeof result.then === 'function') pending.push(result.catch(function (error) { onError(type, error); }));\r\n        } catch (error) {\r\n          onError(type, error);\r\n        }\r\n      }\r\n      return pending.length ? Promise.allSettled(pending) : Promise.resolve();\r\n    }\r\n\r\n    return {\r\n      on: function (type, listener) { return add(type, listener, 'normal'); },\r\n      once: function (type, listener) { return add(type, listener, 'once'); },\r\n      makeFirst: function (type, listener) { return add(type, listener, 'first'); },\r\n      makeLast: function (type, listener) { return add(type, listener, 'last'); },\r\n      remove: remove,\r\n      emit: emit,\r\n      emitAndWait: emit,\r\n      clearEvent: function (type) { listeners.set(type, []); },\r\n      clearListener: function (listener) {\r\n        listeners.forEach(function (list, type) {\r\n          var kept = list.filter(function (item) { return item.fn !== listener; });\r\n          listeners.set(type, kept);\r\n        });\r\n      },\r\n      clearAll: function () { listeners.clear(); },\r\n      count: function (type) { return listOf(type).length; },\r\n    };\r\n  }\r\n\r\n  // ── 世界书 ──────────────────────────────────────────────────\r\n  var POSITION_MAP = { before_char: 0, after_char: 1, before_an: 2, after_an: 3, at_depth: 4, before_em: 5, after_em: 6 };\r\n\r\n  function normalizePosition(value) {\r\n    if (typeof value === 'number') return value;\r\n    return POSITION_MAP[value] == null ? 0 : POSITION_MAP[value];\r\n  }\r\n\r\n  function normalizeLogic(value) {\r\n    var number = Number(value);\r\n    return Number.isFinite(number) ? number : 0;\r\n  }\r\n\r\n  /** 把角色卡/世界书里的条目摊平成 TH 的 FlattenedWorldInfoEntry。 */\r\n  function flattenEntries(entries) {\r\n    var list = Array.isArray(entries) ? entries : [];\r\n    return list.map(function (entry, index) {\r\n      var ext = entry && typeof entry.extensions === 'object' && entry.extensions ? entry.extensions : {};\r\n      var keys = Array.isArray(entry && entry.keys) ? entry.keys : (Array.isArray(entry && entry.key) ? entry.key : []);\r\n      var secondary = Array.isArray(entry && entry.secondary_keys)\r\n        ? entry.secondary_keys\r\n        : (Array.isArray(entry && entry.keysecondary) ? entry.keysecondary : []);\r\n      return {\r\n        uid: entry && (entry.id != null ? entry.id : entry.uid != null ? entry.uid : index),\r\n        displayIndex: ext.display_index != null ? Number(ext.display_index) : index,\r\n        comment: String((entry && (entry.comment || entry.name)) || ''),\r\n        disable: entry ? (entry.enabled === false || entry.disable === true) : false,\r\n        constant: Boolean(entry && entry.constant),\r\n        selective: entry ? entry.selective !== false : true,\r\n        key: keys.map(String),\r\n        selectiveLogic: normalizeLogic(ext.selectiveLogic != null ? ext.selectiveLogic : (entry && entry.selectiveLogic)),\r\n        keysecondary: secondary.map(String),\r\n        scanDepth: ext.scan_depth == null ? null : Number(ext.scan_depth),\r\n        vectorized: Boolean(ext.vectorized),\r\n        position: normalizePosition(entry && entry.position != null ? entry.position : ext.position),\r\n        role: ext.role == null ? null : Number(ext.role),\r\n        depth: ext.depth == null ? 4 : Number(ext.depth),\r\n        order: Number(entry && entry.insertion_order != null\r\n          ? entry.insertion_order\r\n          : (entry && entry.order != null ? entry.order : 100)),\r\n        content: String((entry && entry.content) || ''),\r\n        useProbability: Boolean(ext.useProbability != null ? ext.useProbability : (entry && entry.useProbability)),\r\n        probability: Number(ext.probability != null ? ext.probability : 100),\r\n        excludeRecursion: Boolean(ext.exclude_recursion),\r\n        preventRecursion: Boolean(ext.prevent_recursion),\r\n        delayUntilRecursion: ext.delay_until_recursion == null ? false : ext.delay_until_recursion,\r\n        sticky: ext.sticky == null ? null : Number(ext.sticky),\r\n        cooldown: ext.cooldown == null ? null : Number(ext.cooldown),\r\n        delay: ext.delay == null ? null : Number(ext.delay),\r\n        extra: clone(ext),\r\n      };\r\n    });\r\n  }\r\n\r\n  // ── 主工厂 ──────────────────────────────────────────────────\r\n  /**\r\n   * @param {{\r\n   *   card?: object, userName?: string, charName?: string, chatId?: string,\r\n   *   worldbookName?: string, worldbookEntries?: any[],\r\n   *   variables?: {global?: object, character?: object, chat?: object, preset?: object, script?: object},\r\n   *   messages?: {role: string, text: string, vars?: object, hidden?: boolean, name?: string}[],\r\n   *   extensionSettings?: object,\r\n   *   post?: (message: object) => void,\r\n   *   log?: (level: string, text: string) => void,\r\n   * }} options\r\n   */\r\n  function createCore(options) {\r\n    var settings = options || {};\r\n    var post = typeof settings.post === 'function' ? settings.post : function () {};\r\n    var log = typeof settings.log === 'function' ? settings.log : function () {};\r\n    var card = settings.card && typeof settings.card === 'object' ? settings.card : {};\r\n    var userName = settings.userName || '你';\r\n    var charName = settings.charName || card.name || '角色';\r\n    var chatId = settings.chatId || 'dsh-tt-chat';\r\n    var worldbookName = settings.worldbookName || (card.character_book && card.character_book.name) || '角色世界书';\r\n    var worldbookEntries = flattenEntries(settings.worldbookEntries || (card.character_book && card.character_book.entries) || []);\r\n    var initialVars = settings.variables || {};\r\n\r\n    var globalVars = initialVars.global && typeof initialVars.global === 'object' ? initialVars.global : {};\r\n    var characterVars = initialVars.character && typeof initialVars.character === 'object' ? initialVars.character : {};\r\n    var presetVars = initialVars.preset && typeof initialVars.preset === 'object' ? initialVars.preset : {};\r\n    var scriptVars = initialVars.script && typeof initialVars.script === 'object' ? initialVars.script : {};\r\n    var chatMetadata = { variables: initialVars.chat && typeof initialVars.chat === 'object' ? initialVars.chat : {} };\r\n    var extensionSettings = settings.extensionSettings && typeof settings.extensionSettings === 'object'\r\n      ? settings.extensionSettings\r\n      : {};\r\n\r\n    var chat = [];\r\n    var macros = new Map();\r\n    var currentScriptId = 'dsh-tt-script';\r\n    var currentMessageId = -1;\r\n\r\n    function reportError(type, error) {\r\n      var message = error && error.stack ? error.stack : String(error);\r\n      log('error', '[' + type + '] ' + message);\r\n      post({ tt: 'log', level: 'error', text: '[' + type + '] ' + (error && error.message ? error.message : String(error)) });\r\n    }\r\n\r\n    var bus = createEventBus(reportError);\r\n\r\n    function makeMessage(input) {\r\n      var text = String(input && input.text != null ? input.text : '');\r\n      var role = input && input.role === 'user' ? 'user' : (input && input.role === 'system' ? 'system' : 'assistant');\r\n      var vars = input && input.vars && typeof input.vars === 'object' ? clone(input.vars) : {};\r\n      return {\r\n        name: input && input.name ? String(input.name) : (role === 'user' ? userName : charName),\r\n        is_user: role === 'user',\r\n        is_system: Boolean(input && input.hidden) || role === 'system',\r\n        mes: text,\r\n        swipe_id: 0,\r\n        swipes: [text],\r\n        swipe_info: [{}],\r\n        variables: [vars],\r\n        extra: {},\r\n      };\r\n    }\r\n\r\n    /** 用父窗口给的聊天记录刷新镜像；保留已有变量与脚本对正文的本地修改。 */\r\n    function applyChat(nextMessages, options) {\r\n      var opts = options || {};\r\n      var list = Array.isArray(nextMessages) ? nextMessages : [];\r\n      var added = [];\r\n      for (var i = 0; i < list.length; i += 1) {\r\n        var input = list[i] || {};\r\n        var text = String(input.text != null ? input.text : '');\r\n        var role = input.role === 'user' ? 'user' : (input.role === 'system' ? 'system' : 'assistant');\r\n        var hidden = Boolean(input.hidden);\r\n        var existing = chat[i];\r\n        if (!existing) {\r\n          existing = makeMessage({ role: role, text: text, vars: input.vars, hidden: hidden, name: input.name });\r\n          chat[i] = existing;\r\n          added.push(i);\r\n          continue;\r\n        }\r\n        var edited = existing.__ttEdited === true;\r\n        var keepLocal = edited && (existing.mes === text || existing.mes.indexOf(text) === 0);\r\n        if (!keepLocal) {\r\n          existing.mes = text;\r\n          existing.swipes[existing.swipe_id || 0] = text;\r\n          existing.__ttEdited = false;\r\n        }\r\n        existing.is_user = role === 'user';\r\n        existing.is_system = hidden || role === 'system';\r\n        if (input.name) existing.name = String(input.name);\r\n        if (opts.initial && input.vars && typeof input.vars === 'object') {\r\n          existing.variables[existing.swipe_id || 0] = clone(input.vars);\r\n        } else if (!existing.variables[existing.swipe_id || 0]) {\r\n          existing.variables[existing.swipe_id || 0] = input.vars && typeof input.vars === 'object' ? clone(input.vars) : {};\r\n        }\r\n      }\r\n      if (chat.length > list.length) chat.length = list.length;\r\n      if (opts.emitAdded) {\r\n        for (var j = 0; j < added.length; j += 1) {\r\n          var index = added[j];\r\n          var message = chat[index];\r\n          if (!message) continue;\r\n          if (message.is_user) bus.emit(TAVERN_EVENTS.MESSAGE_SENT, index);\r\n          else if (!message.is_system) bus.emit(TAVERN_EVENTS.MESSAGE_RECEIVED, index, 'normal');\r\n        }\r\n      }\r\n      return added;\r\n    }\r\n\r\n    function roleOf(message) {\r\n      if (message.is_system) return 'system';\r\n      return message.is_user ? 'user' : 'assistant';\r\n    }\r\n\r\n    function publicMessage(message, index, includeSwipes) {\r\n      var swipeId = message.swipe_id || 0;\r\n      var swipes = (message.swipes || [message.mes]).slice();\r\n      var data = clone((message.variables && message.variables[swipeId]) || {});\r\n      var info = clone((message.swipe_info && message.swipe_info[swipeId]) || {});\r\n      if (includeSwipes) {\r\n        return {\r\n          message_id: index,\r\n          name: message.name,\r\n          role: roleOf(message),\r\n          is_hidden: Boolean(message.is_system),\r\n          swipe_id: swipeId,\r\n          swipes: swipes,\r\n          swipes_data: (message.variables || [{}]).map(clone),\r\n          swipes_info: (message.swipe_info || [{}]).map(clone),\r\n        };\r\n      }\r\n      return {\r\n        message_id: index,\r\n        name: message.name,\r\n        role: roleOf(message),\r\n        is_hidden: Boolean(message.is_system),\r\n        message: message.mes,\r\n        data: data,\r\n        extra: info,\r\n        swipe_id: swipeId,\r\n        swipes: swipes,\r\n        swipes_data: (message.variables || [{}]).map(clone),\r\n      };\r\n    }\r\n\r\n    function parseRange(range) {\r\n      var last = chat.length - 1;\r\n      if (typeof range === 'number') {\r\n        var numeric = normalizeIndex(range, last);\r\n        return { start: numeric, end: numeric };\r\n      }\r\n      var text = String(range == null ? 'latest' : range).trim();\r\n      if (text === '' || text === 'latest') return { start: last, end: last };\r\n      text = text.replace(/\\{\\{lastMessageId\\}\\}/g, String(last));\r\n      var match = text.match(/^(-?\\d+)\\s*-\\s*(-?\\d+)$/);\r\n      if (match) {\r\n        return {\r\n          start: normalizeIndex(Number(match[1]), last),\r\n          end: normalizeIndex(Number(match[2]), last),\r\n        };\r\n      }\r\n      var single = normalizeIndex(Number(text), last);\r\n      return { start: single, end: single };\r\n    }\r\n\r\n    function normalizeIndex(value, last) {\r\n      if (!Number.isFinite(value)) return last;\r\n      if (value < 0) return last + 1 + value;\r\n      return value;\r\n    }\r\n\r\n    function getChatMessages(range, option) {\r\n      var opts = option || {};\r\n      var bounds = parseRange(range);\r\n      var start = Math.max(0, Math.min(bounds.start, bounds.end));\r\n      var end = Math.min(chat.length - 1, Math.max(bounds.start, bounds.end));\r\n      var out = [];\r\n      for (var i = start; i <= end; i += 1) {\r\n        var message = chat[i];\r\n        if (!message) continue;\r\n        var role = roleOf(message);\r\n        if (opts.role && opts.role !== 'all' && opts.role !== role) continue;\r\n        if (opts.hide_state === 'hidden' && !message.is_system) continue;\r\n        if (opts.hide_state === 'unhidden' && message.is_system) continue;\r\n        out.push(publicMessage(message, i, Boolean(opts.include_swipes)));\r\n      }\r\n      return out;\r\n    }\r\n\r\n    function getLastMessageId() { return chat.length - 1; }\r\n\r\n    function scopeObject(option, create) {\r\n      var opts = option || { type: 'chat' };\r\n      switch (opts.type) {\r\n        case 'global': return globalVars;\r\n        case 'character': return characterVars;\r\n        case 'preset': return presetVars;\r\n        case 'chat': return chatMetadata.variables;\r\n        case 'script': {\r\n          var id = opts.script_id || currentScriptId;\r\n          if (!scriptVars[id] || typeof scriptVars[id] !== 'object') {\r\n            if (!create) return {};\r\n            scriptVars[id] = {};\r\n          }\r\n          return scriptVars[id];\r\n        }\r\n        case 'message': {\r\n          var index = opts.message_id;\r\n          if (index === undefined || index === null || index === 'latest') index = chat.length - 1;\r\n          else index = normalizeIndex(Number(index), chat.length - 1);\r\n          var message = chat[index];\r\n          if (!message) return null;\r\n          var swipeId = message.swipe_id || 0;\r\n          if (!message.variables[swipeId] || typeof message.variables[swipeId] !== 'object') {\r\n            if (!create) return {};\r\n            message.variables[swipeId] = {};\r\n          }\r\n          return message.variables[swipeId];\r\n        }\r\n        case 'extension': {\r\n          var extId = opts.extension_id || 'tavern_helper';\r\n          if (!extensionSettings[extId] || typeof extensionSettings[extId] !== 'object') {\r\n            if (!create) return {};\r\n            extensionSettings[extId] = {};\r\n          }\r\n          return extensionSettings[extId];\r\n        }\r\n        default: return chatMetadata.variables;\r\n      }\r\n    }\r\n\r\n    function postScope(option) {\r\n      var opts = option || { type: 'chat' };\r\n      var value = clone(scopeObject(opts, true) || {});\r\n      var messageIndex;\r\n      if (opts.type === 'message') {\r\n        messageIndex = opts.message_id === undefined || opts.message_id === null || opts.message_id === 'latest'\r\n          ? getLastMessageId()\r\n          : normalizeIndex(Number(opts.message_id), getLastMessageId());\r\n      }\r\n      post({\r\n        tt: 'vars',\r\n        scope: opts.type || 'chat',\r\n        scriptId: opts.script_id || undefined,\r\n        extensionId: opts.extension_id || undefined,\r\n        messageId: messageIndex,\r\n        value: value,\r\n        hash: hashSignature(value),\r\n      });\r\n      return value;\r\n    }\r\n\r\n    function getVariables(option) {\r\n      var value = scopeObject(option || { type: 'chat' }, false);\r\n      return clone(value || {});\r\n    }\r\n\r\n    function replaceVariables(value, option) {\r\n      var opts = option || { type: 'chat' };\r\n      var scope = scopeObject(opts, true);\r\n      if (!scope) throw new Error('变量作用域不存在');\r\n      Object.keys(scope).forEach(function (key) { delete scope[key]; });\r\n      Object.assign(scope, clone(value && typeof value === 'object' ? value : {}));\r\n      postScope(opts);\r\n      return getVariables(opts);\r\n    }\r\n\r\n    function updateVariablesWith(updater, option) {\r\n      var opts = option || { type: 'chat' };\r\n      var current = getVariables(opts);\r\n      var next = typeof updater === 'function' ? updater(current) : updater;\r\n      return replaceVariables(next === undefined ? current : next, opts);\r\n    }\r\n\r\n    function insertOrAssignVariables(vars, option) {\r\n      var opts = option || { type: 'chat' };\r\n      var scope = scopeObject(opts, true);\r\n      Object.keys(vars || {}).forEach(function (key) { scope[key] = clone(vars[key]); });\r\n      postScope(opts);\r\n    }\r\n\r\n    function insertVariables(vars, option) {\r\n      var opts = option || { type: 'chat' };\r\n      var scope = scopeObject(opts, true);\r\n      Object.keys(vars || {}).forEach(function (key) {\r\n        if (!Object.prototype.hasOwnProperty.call(scope, key)) scope[key] = clone(vars[key]);\r\n      });\r\n      postScope(opts);\r\n    }\r\n\r\n    function deleteVariable(key, option) {\r\n      var opts = option || { type: 'chat' };\r\n      var scope = scopeObject(opts, true);\r\n      deletePath(scope, key);\r\n      postScope(opts);\r\n    }\r\n\r\n    function touchMessage(index) {\r\n      var message = chat[index];\r\n      if (!message) return;\r\n      var vars = clone((message.variables && message.variables[message.swipe_id || 0]) || {});\r\n      post({\r\n        tt: 'message',\r\n        index: index,\r\n        text: message.mes,\r\n        vars: vars,\r\n        varsHash: hashSignature(vars),\r\n        edited: message.__ttEdited === true,\r\n      });\r\n    }\r\n\r\n    async function setChatMessages(updates, options) {\r\n      var opts = options || {};\r\n      var affected = [];\r\n      for (var u = 0; u < (updates || []).length; u += 1) {\r\n        var update = updates[u] || {};\r\n        var index = update.message_id;\r\n        if (index === 'latest') index = chat.length - 1;\r\n        else index = normalizeIndex(Number(index), chat.length - 1);\r\n        var message = chat[index];\r\n        if (!message) throw new Error('提供的消息楼层号 ' + update.message_id + ' 超出了范围');\r\n        if (update.message !== undefined) {\r\n          message.mes = String(update.message);\r\n          message.swipes[message.swipe_id || 0] = message.mes;\r\n          message.__ttEdited = true;\r\n        }\r\n        if (update.data !== undefined) {\r\n          message.variables[message.swipe_id || 0] = clone(update.data);\r\n        }\r\n        if (update.extra !== undefined) {\r\n          message.swipe_info[message.swipe_id || 0] = clone(update.extra);\r\n          message.extra = clone(update.extra);\r\n        }\r\n        if (update.is_hidden !== undefined) message.is_system = Boolean(update.is_hidden);\r\n        if (update.name !== undefined) message.name = String(update.name);\r\n        if (update.swipes !== undefined || update.swipes_data !== undefined || update.swipes_info !== undefined || update.swipe_id !== undefined) {\r\n          var nodes = Math.max(\r\n            Array.isArray(update.swipes) ? update.swipes.length : 0,\r\n            Array.isArray(update.swipes_data) ? update.swipes_data.length : 0,\r\n            Array.isArray(update.swipes_info) ? update.swipes_info.length : 0,\r\n            (message.swipes || []).length,\r\n            1,\r\n          );\r\n          var swipeId = Math.max(0, Math.min(Number(update.swipe_id != null ? update.swipe_id : message.swipe_id || 0), nodes - 1));\r\n          var swipes = [];\r\n          var data = [];\r\n          var info = [];\r\n          for (var s = 0; s < nodes; s += 1) {\r\n            swipes.push(update.swipes && update.swipes[s] != null ? String(update.swipes[s]) : (message.swipes[s] != null ? message.swipes[s] : ''));\r\n            data.push(update.swipes_data && update.swipes_data[s] !== undefined ? clone(update.swipes_data[s]) : clone((message.variables && message.variables[s]) || {}));\r\n            info.push(update.swipes_info && update.swipes_info[s] !== undefined ? clone(update.swipes_info[s]) : clone((message.swipe_info && message.swipe_info[s]) || {}));\r\n          }\r\n          message.swipes = swipes;\r\n          message.variables = data;\r\n          message.swipe_info = info;\r\n          message.swipe_id = swipeId;\r\n          message.mes = swipes[swipeId];\r\n          message.extra = clone(info[swipeId]);\r\n          message.__ttEdited = true;\r\n        }\r\n        affected.push(index);\r\n      }\r\n      for (var a = 0; a < affected.length; a += 1) touchMessage(affected[a]);\r\n      if (opts.refresh !== 'none') {\r\n        for (var b = 0; b < affected.length; b += 1) {\r\n          var msg = chat[affected[b]];\r\n          if (!msg) continue;\r\n          bus.emit(msg.is_user ? TAVERN_EVENTS.USER_MESSAGE_RENDERED : TAVERN_EVENTS.CHARACTER_MESSAGE_RENDERED, affected[b]);\r\n        }\r\n      }\r\n      post({ tt: 'chat-updated', indices: affected });\r\n    }\r\n\r\n    async function createChatMessages(creates, options) {\r\n      var opts = options || {};\r\n      var insertBefore = opts.insert_before != null ? opts.insert_before : opts.insert_at;\r\n      var at = insertBefore === 'end' || insertBefore == null ? chat.length : normalizeIndex(Number(insertBefore), chat.length);\r\n      at = Math.max(0, Math.min(at, chat.length));\r\n      var made = [];\r\n      for (var i = 0; i < (creates || []).length; i += 1) {\r\n        var input = creates[i] || {};\r\n        var message = makeMessage(input);\r\n        var index = at + i;\r\n        chat.splice(index, 0, message);\r\n        made.push(index);\r\n      }\r\n      for (var j = 0; j < made.length; j += 1) {\r\n        post({ tt: 'message', index: made[j], text: chat[made[j]].mes, vars: {}, edited: true });\r\n        bus.emit(chat[made[j]].is_user ? TAVERN_EVENTS.MESSAGE_SENT : TAVERN_EVENTS.MESSAGE_RECEIVED, made[j], 'normal');\r\n      }\r\n      return made;\r\n    }\r\n\r\n    async function deleteChatMessages(ids, options) {\r\n      var list = (ids || []).map(function (id) { return normalizeIndex(Number(id), chat.length - 1); })\r\n        .filter(function (id) { return id >= 0 && id < chat.length; })\r\n        .sort(function (a, b) { return b - a; });\r\n      for (var i = 0; i < list.length; i += 1) chat.splice(list[i], 1);\r\n      post({ tt: 'chat-reload' });\r\n      if ((options || {}).refresh !== 'none') bus.emit(TAVERN_EVENTS.CHAT_CHANGED, chatId);\r\n    }\r\n\r\n    async function rotateChatMessages(begin, middle, end) {\r\n      var from = Math.max(0, normalizeIndex(Number(begin), chat.length - 1));\r\n      var mid = Math.max(0, normalizeIndex(Number(middle), chat.length - 1));\r\n      var to = Math.max(0, normalizeIndex(Number(end), chat.length - 1));\r\n      var slice = chat.splice(from, to - from);\r\n      var head = slice.splice(0, Math.max(0, mid - from));\r\n      chat.splice(from, 0, ...slice, ...head);\r\n      post({ tt: 'chat-reload' });\r\n    }\r\n\r\n    function lookupMacro(name) {\r\n      var key = String(name || '');\r\n      if (macros.has(key)) {\r\n        var value = macros.get(key);\r\n        return typeof value === 'function' ? value('') : value;\r\n      }\r\n      switch (key) {\r\n        case 'user': case 'name1': return userName;\r\n        case 'char': case 'name2': return charName;\r\n        case 'charIfNotGroup': return charName;\r\n        case 'group': return '';\r\n        case 'description': return card.description || '';\r\n        case 'personality': return card.personality || '';\r\n        case 'scenario': return card.scenario || '';\r\n        case 'persona': return '';\r\n        case 'time': return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date());\r\n        case 'date': return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());\r\n        case 'weekday': return new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(new Date());\r\n        case 'isotime': { var now = new Date(); return pad(now.getHours()) + ':' + pad(now.getMinutes()); }\r\n        case 'isodate': { var today = new Date(); return today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate()); }\r\n        case 'newline': return '\\n';\r\n        case 'trim': return '';\r\n        case 'maxContext': return '128000';\r\n        case 'maxResponse': return '8000';\r\n        case 'maxPrompt': return '128000';\r\n        case 'lastMessageId': return String(getLastMessageId());\r\n        case 'lastMessage': {\r\n          var last = chat[chat.length - 1];\r\n          return last ? last.mes : '';\r\n        }\r\n        case 'lastUserMessage': {\r\n          for (var i = chat.length - 1; i >= 0; i -= 1) if (chat[i].is_user) return chat[i].mes;\r\n          return '';\r\n        }\r\n        case 'lastCharMessage': {\r\n          for (var j = chat.length - 1; j >= 0; j -= 1) if (!chat[j].is_user && !chat[j].is_system) return chat[j].mes;\r\n          return '';\r\n        }\r\n        default: return undefined;\r\n      }\r\n    }\r\n\r\n    function substituteMacros(text) {\r\n      if (typeof text !== 'string' || !text) return text == null ? '' : String(text);\r\n      var out = text;\r\n      out = out.replace(/\\{\\{\\/\\/([\\s\\S]*?)\\}\\}/g, '');\r\n      out = out.replace(/\\{\\{setvar::([^:}\\s]+)::([\\s\\S]*?)\\}\\}/gi, function (_, key, value) {\r\n        setPath(chatMetadata.variables, key.trim(), value);\r\n        postScope({ type: 'chat' });\r\n        return '';\r\n      });\r\n      out = out.replace(/\\{\\{getvar::([^:}\\s]+)\\}\\}/gi, function (_, key) {\r\n        var value = hasPath(chatMetadata.variables, key.trim()) ? getPath(chatMetadata.variables, key.trim()) : '';\r\n        return value == null ? '' : String(value);\r\n      });\r\n      out = out.replace(/\\{\\{addvar::([^:}\\s]+)::([\\s\\S]*?)\\}\\}/gi, function (_, key, value) {\r\n        var current = getPath(chatMetadata.variables, key.trim(), '');\r\n        setPath(chatMetadata.variables, key.trim(), String(current == null ? '' : current) + value);\r\n        postScope({ type: 'chat' });\r\n        return '';\r\n      });\r\n      out = out.replace(/\\{\\{random\\s?::?([^}]+)\\}\\}/gi, function (_, inner) {\r\n        return randomPick(splitArgs(inner.trim(), '::'), Math.random);\r\n      });\r\n      out = out.replace(/\\{\\{pick\\s?::?([^}]+)\\}\\}/gi, function (_, inner) {\r\n        return randomPick(splitArgs(inner.trim(), '::'), Math.random);\r\n      });\r\n      out = out.replace(/\\{\\{roll[ :]([^}]+)\\}\\}/gi, function (_, inner) {\r\n        var match = inner.trim().match(/^(\\d*)d(\\d+)$/i);\r\n        var count = match ? Math.max(1, Number(match[1] || 1)) : 1;\r\n        var sides = match ? Number(match[2]) : Number(inner.trim()) || 6;\r\n        var total = 0;\r\n        for (var i = 0; i < count; i += 1) total += 1 + Math.floor(Math.random() * sides);\r\n        return String(total);\r\n      });\r\n      out = out.replace(/\\{\\{newline\\}\\}/gi, '\\n');\r\n      out = out.replace(/(?:\\r?\\n)*\\{\\{trim\\}\\}(?:\\r?\\n)*/gi, '');\r\n      out = out.replace(/\\{\\{noop\\}\\}/gi, '');\r\n      // 自定义宏名不受 ASCII 限制（酒馆助手的 registerMacroLike 允许任意名字）。\r\n      out = out.replace(/\\{\\{([^{}]+)\\}\\}/g, function (raw, name) {\r\n        var value = lookupMacro(String(name).trim());\r\n        return value === undefined ? raw : String(value);\r\n      });\r\n      // 旧式尖括号\r\n      out = out.replace(/<USER>/gi, userName).replace(/<BOT>/gi, charName).replace(/<CHAR>/gi, charName);\r\n      return out;\r\n    }\r\n\r\n    function getLorebookEntries(name) {\r\n      var book = name == null || name === worldbookName ? worldbookEntries : [];\r\n      return book.map(clone);\r\n    }\r\n\r\n    function getWorldbook(name) {\r\n      var entries = {};\r\n      getLorebookEntries(name).forEach(function (entry) { entries[String(entry.uid)] = entry; });\r\n      return { name: name == null ? worldbookName : name, entries: entries };\r\n    }\r\n\r\n    function getCharWorldbookNames() {\r\n      return { primary: worldbookName, additional: [] };\r\n    }\r\n\r\n    function getWorldbookNames() { return [worldbookName]; }\r\n\r\n    function slashCommand(line) {\r\n      var text = String(line || '').trim();\r\n      if (!text) return '';\r\n      if (text[0] === '/') text = text.slice(1);\r\n      var pipe = text.split('|');\r\n      var result = '';\r\n      for (var i = 0; i < pipe.length; i += 1) {\r\n        result = runOneCommand(pipe[i].trim(), result);\r\n      }\r\n      return result;\r\n    }\r\n\r\n    function parseNamed(rest) {\r\n      var named = {};\r\n      var positional = [];\r\n      var tokens = String(rest || '').match(/(?:[^\\s\"']+|\"[^\"]*\"|'[^']*')+/g) || [];\r\n      tokens.forEach(function (token) {\r\n        var eq = token.indexOf('=');\r\n        if (eq > 0) {\r\n          var key = token.slice(0, eq);\r\n          var value = token.slice(eq + 1).replace(/^[\"']|[\"']$/g, '');\r\n          named[key] = value;\r\n        } else {\r\n          positional.push(token.replace(/^[\"']|[\"']$/g, ''));\r\n        }\r\n      });\r\n      return { named: named, positional: positional };\r\n    }\r\n\r\n    function runOneCommand(command, pipeValue) {\r\n      var text = String(command || '').trim();\r\n      if (text[0] === '/') text = text.slice(1);\r\n      var space = text.indexOf(' ');\r\n      var name = (space < 0 ? text : text.slice(0, space)).toLowerCase();\r\n      var rest = space < 0 ? '' : text.slice(space + 1);\r\n      var args = parseNamed(rest.replace(/\\{\\{pipe\\}\\}/g, pipeValue));\r\n      var namedKeys = Object.keys(args.named);\r\n      var singlePair = namedKeys.length === 1 && args.positional.length === 0 && namedKeys[0] !== 'key' && namedKeys[0] !== 'value';\r\n      var key = args.named.key || (singlePair ? namedKeys[0] : args.positional[0]) || '';\r\n      var value = args.named.value != null\r\n        ? args.named.value\r\n        : singlePair\r\n          ? args.named[namedKeys[0]]\r\n          : (args.positional.slice(1).join(' ') || pipeValue);\r\n      switch (name) {\r\n        case 'setvar': setPath(chatMetadata.variables, key, value); postScope({ type: 'chat' }); return '';\r\n        case 'getvar': {\r\n          var got = getPath(chatMetadata.variables, key, '');\r\n          return got == null ? '' : String(got);\r\n        }\r\n        case 'addvar': setPath(chatMetadata.variables, key, String(getPath(chatMetadata.variables, key, '') + value)); postScope({ type: 'chat' }); return '';\r\n        case 'incvar': setPath(chatMetadata.variables, key, Number(getPath(chatMetadata.variables, key, 0)) + (Number(value) || 1)); postScope({ type: 'chat' }); return '';\r\n        case 'decvar': setPath(chatMetadata.variables, key, Number(getPath(chatMetadata.variables, key, 0)) - (Number(value) || 1)); postScope({ type: 'chat' }); return '';\r\n        case 'delvar': deletePath(chatMetadata.variables, key); postScope({ type: 'chat' }); return '';\r\n        case 'setglobalvar': setPath(globalVars, key, value); postScope({ type: 'global' }); return '';\r\n        case 'getglobalvar': { var g = getPath(globalVars, key, ''); return g == null ? '' : String(g); }\r\n        case 'addglobalvar': setPath(globalVars, key, String(getPath(globalVars, key, '') + value)); postScope({ type: 'global' }); return '';\r\n        case 'setchatvar': setPath(chatMetadata.variables, key, value); postScope({ type: 'chat' }); return '';\r\n        case 'getchatvar': { var c = getPath(chatMetadata.variables, key, ''); return c == null ? '' : String(c); }\r\n        case 'addchatvar': setPath(chatMetadata.variables, key, String(getPath(chatMetadata.variables, key, '') + value)); postScope({ type: 'chat' }); return '';\r\n        case 'setvarname':\r\n        case 'setprompt':\r\n          return '';\r\n        case 'echo':\r\n        case 'pass':\r\n        case 'run': return rest;\r\n        case 'comment': return '';\r\n        case 'sys': post({ tt: 'system-message', text: rest }); return '';\r\n        case 'sendas': {\r\n          var sep = rest.indexOf(' ');\r\n          var payload = sep < 0 ? rest : rest.slice(sep + 1);\r\n          post({ tt: 'user-message', text: payload });\r\n          return '';\r\n        }\r\n        case 'trigger': post({ tt: 'trigger' }); return '';\r\n        default:\r\n          throw new Error('DSH TH 宿主暂不支持斜杠命令 /' + name);\r\n      }\r\n    }\r\n\r\n    function makeScriptContext(scriptId, messageId) {\r\n      currentScriptId = scriptId || currentScriptId;\r\n      currentMessageId = messageId == null ? currentMessageId : messageId;\r\n      return currentScriptId;\r\n    }\r\n\r\n    function buildCharacters() {\r\n      var data = card.data || card;\r\n      return [{\r\n        name: charName,\r\n        description: card.description || data.description || '',\r\n        personality: card.personality || data.personality || '',\r\n        scenario: card.scenario || data.scenario || '',\r\n        first_mes: card.firstMes || data.first_mes || '',\r\n        mes_example: card.mesExample || data.mes_example || '',\r\n        creatorcomment: card.creatorNotes || data.creator_notes || '',\r\n        tags: card.tags || data.tags || [],\r\n        talkativeness: 0.5,\r\n        fav: false,\r\n        create_date: '',\r\n        data: data,\r\n        chat: chatId,\r\n        avatar: 'dsh-tt.png',\r\n        json_data: '',\r\n      }];\r\n    }\r\n\r\n    function getCharacterCardFields() {\r\n      var data = card.data || card;\r\n      return {\r\n        name: charName,\r\n        description: card.description || data.description || '',\r\n        personality: card.personality || data.personality || '',\r\n        scenario: card.scenario || data.scenario || '',\r\n        first_mes: card.firstMes || data.first_mes || '',\r\n        mes_example: card.mesExample || data.mes_example || '',\r\n        system_prompt: card.systemPrompt || data.system_prompt || '',\r\n        post_history_instructions: card.postHistoryInstructions || data.post_history_instructions || '',\r\n        alternate_greetings: card.alternateGreetings || data.alternate_greetings || [],\r\n        creator: card.creator || data.creator || '',\r\n        character_version: card.characterVersion || data.character_version || '',\r\n        tags: card.tags || data.tags || [],\r\n        extensions: card.extensions || data.extensions || {},\r\n      };\r\n    }\r\n\r\n    function snapshotForParent() {\r\n      return {\r\n        chat: chat.map(function (message, index) {\r\n          return {\r\n            index: index,\r\n            role: roleOf(message),\r\n            text: message.mes,\r\n            vars: clone((message.variables && message.variables[message.swipe_id || 0]) || {}),\r\n            hidden: Boolean(message.is_system),\r\n          };\r\n        }),\r\n        chatVariables: clone(chatMetadata.variables),\r\n        globalVariables: clone(globalVars),\r\n        characterVariables: clone(characterVars),\r\n        presetVariables: clone(presetVars),\r\n        scriptVariables: clone(scriptVars),\r\n      };\r\n    }\r\n\r\n    // 初始聊天\r\n    applyChat(settings.messages || [], { initial: true });\r\n\r\n    return {\r\n      // 状态\r\n      card: card,\r\n      chat: chat,\r\n      chatMetadata: chatMetadata,\r\n      extensionSettings: extensionSettings,\r\n      characters: buildCharacters(),\r\n      userName: userName,\r\n      charName: charName,\r\n      chatId: chatId,\r\n      worldbookName: worldbookName,\r\n      // 消息\r\n      applyChat: applyChat,\r\n      getChatMessages: getChatMessages,\r\n      setChatMessages: setChatMessages,\r\n      createChatMessages: createChatMessages,\r\n      deleteChatMessages: deleteChatMessages,\r\n      rotateChatMessages: rotateChatMessages,\r\n      getLastMessageId: getLastMessageId,\r\n      publicMessage: publicMessage,\r\n      snapshotForParent: snapshotForParent,\r\n      touchMessage: touchMessage,\r\n      // 变量\r\n      getVariables: getVariables,\r\n      replaceVariables: replaceVariables,\r\n      updateVariablesWith: updateVariablesWith,\r\n      insertOrAssignVariables: insertOrAssignVariables,\r\n      insertVariables: insertVariables,\r\n      deleteVariable: deleteVariable,\r\n      // 事件\r\n      bus: bus,\r\n      // 宏\r\n      substituteMacros: substituteMacros,\r\n      registerMacro: function (key, value) { macros.set(String(key), value); },\r\n      unregisterMacro: function (key) { macros.delete(String(key)); },\r\n      // 世界书\r\n      getLorebookEntries: getLorebookEntries,\r\n      getWorldbook: getWorldbook,\r\n      getWorldbookNames: getWorldbookNames,\r\n      getGlobalWorldbookNames: function () { return []; },\r\n      getCharWorldbookNames: getCharWorldbookNames,\r\n      getCurrentCharPrimaryLorebook: function () { return worldbookName; },\r\n      // 其它\r\n      getCharacterCardFields: getCharacterCardFields,\r\n      slashCommand: slashCommand,\r\n      makeScriptContext: makeScriptContext,\r\n      getCurrentScriptId: function () { return currentScriptId; },\r\n      getCurrentMessageId: function () { return currentMessageId; },\r\n    };\r\n  }\r\n\r\n  var TAVERN_EVENTS = {\r\n    APP_READY: 'app_ready',\r\n    EXTRAS_CONNECTED: 'extras_connected',\r\n    MESSAGE_SWIPED: 'message_swiped',\r\n    MESSAGE_SENT: 'message_sent',\r\n    MESSAGE_RECEIVED: 'message_received',\r\n    MESSAGE_EDITED: 'message_edited',\r\n    MESSAGE_DELETED: 'message_deleted',\r\n    MESSAGE_UPDATED: 'message_updated',\r\n    MESSAGE_FILE_EMBEDDED: 'message_file_embedded',\r\n    MESSAGE_REASONING_EDITED: 'message_reasoning_edited',\r\n    MESSAGE_REASONING_DELETED: 'message_reasoning_deleted',\r\n    MESSAGE_SWIPE_DELETED: 'message_swipe_deleted',\r\n    MORE_MESSAGES_LOADED: 'more_messages_loaded',\r\n    IMPERSONATE_READY: 'impersonate_ready',\r\n    CHAT_CHANGED: 'chat_id_changed',\r\n    GENERATION_AFTER_COMMANDS: 'GENERATION_AFTER_COMMANDS',\r\n    GENERATION_STARTED: 'generation_started',\r\n    GENERATION_STOPPED: 'generation_stopped',\r\n    GENERATION_ENDED: 'generation_ended',\r\n    SD_PROMPT_PROCESSING: 'sd_prompt_processing',\r\n    EXTENSIONS_FIRST_LOAD: 'extensions_first_load',\r\n    EXTENSION_SETTINGS_LOADED: 'extension_settings_loaded',\r\n    SETTINGS_LOADED: 'settings_loaded',\r\n    SETTINGS_UPDATED: 'settings_updated',\r\n    MOVABLE_PANELS_RESET: 'movable_panels_reset',\r\n    SETTINGS_LOADED_BEFORE: 'settings_loaded_before',\r\n    SETTINGS_LOADED_AFTER: 'settings_loaded_after',\r\n    CHATCOMPLETION_SOURCE_CHANGED: 'chatcompletion_source_changed',\r\n    CHATCOMPLETION_MODEL_CHANGED: 'chatcompletion_model_changed',\r\n    OAI_PRESET_CHANGED_BEFORE: 'oai_preset_changed_before',\r\n    OAI_PRESET_CHANGED_AFTER: 'oai_preset_changed_after',\r\n    OAI_PRESET_EXPORT_READY: 'oai_preset_export_ready',\r\n    OAI_PRESET_IMPORT_READY: 'oai_preset_import_ready',\r\n    WORLDINFO_SETTINGS_UPDATED: 'worldinfo_settings_updated',\r\n    WORLDINFO_UPDATED: 'worldinfo_updated',\r\n    CHARACTER_EDITOR_OPENED: 'character_editor_opened',\r\n    CHARACTER_EDITED: 'character_edited',\r\n    CHARACTER_PAGE_LOADED: 'character_page_loaded',\r\n    USER_MESSAGE_RENDERED: 'user_message_rendered',\r\n    CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',\r\n    FORCE_SET_BACKGROUND: 'force_set_background',\r\n    CHAT_DELETED: 'chat_deleted',\r\n    CHAT_CREATED: 'chat_created',\r\n    GENERATE_BEFORE_COMBINE_PROMPTS: 'generate_before_combine_prompts',\r\n    GENERATE_AFTER_COMBINE_PROMPTS: 'generate_after_combine_prompts',\r\n    GENERATE_AFTER_DATA: 'generate_after_data',\r\n    WORLD_INFO_ACTIVATED: 'world_info_activated',\r\n    TEXT_COMPLETION_SETTINGS_READY: 'text_completion_settings_ready',\r\n    CHAT_COMPLETION_SETTINGS_READY: 'chat_completion_settings_ready',\r\n    CHAT_COMPLETION_PROMPT_READY: 'chat_completion_prompt_ready',\r\n    CHARACTER_FIRST_MESSAGE_SELECTED: 'character_first_message_selected',\r\n    CHARACTER_DELETED: 'characterDeleted',\r\n    CHARACTER_DUPLICATED: 'character_duplicated',\r\n    CHARACTER_RENAMED: 'character_renamed',\r\n    CHARACTER_RENAMED_IN_PAST_CHAT: 'character_renamed_in_past_chat',\r\n    SMOOTH_STREAM_TOKEN_RECEIVED: 'stream_token_received',\r\n    STREAM_TOKEN_RECEIVED: 'stream_token_received',\r\n    STREAM_REASONING_DONE: 'stream_reasoning_done',\r\n    FILE_ATTACHMENT_DELETED: 'file_attachment_deleted',\r\n    WORLDINFO_FORCE_ACTIVATE: 'worldinfo_force_activate',\r\n    OPEN_CHARACTER_LIBRARY: 'open_character_library',\r\n    ONLINE_STATUS_CHANGED: 'online_status_changed',\r\n    IMAGE_SWIPED: 'image_swiped',\r\n    CONNECTION_PROFILE_LOADED: 'connection_profile_loaded',\r\n    CONNECTION_PROFILE_CREATED: 'connection_profile_created',\r\n    CONNECTION_PROFILE_DELETED: 'connection_profile_deleted',\r\n    CONNECTION_PROFILE_UPDATED: 'connection_profile_updated',\r\n    TOOL_CALLS_PERFORMED: 'tool_calls_performed',\r\n    TOOL_CALLS_RENDERED: 'tool_calls_rendered',\r\n    CHARACTER_MANAGEMENT_DROPDOWN: 'charManagementDropdown',\r\n    SECRET_WRITTEN: 'secret_written',\r\n    SECRET_DELETED: 'secret_deleted',\r\n    SECRET_ROTATED: 'secret_rotated',\r\n    SECRET_EDITED: 'secret_edited',\r\n    PRESET_CHANGED: 'preset_changed',\r\n    PRESET_DELETED: 'preset_deleted',\r\n    PRESET_RENAMED: 'preset_renamed',\r\n    PRESET_RENAMED_BEFORE: 'preset_renamed_before',\r\n    MAIN_API_CHANGED: 'main_api_changed',\r\n    WORLDINFO_ENTRIES_LOADED: 'worldinfo_entries_loaded',\r\n    WORLDINFO_SCAN_DONE: 'worldinfo_scan_done',\r\n    MEDIA_ATTACHMENT_DELETED: 'media_attachment_deleted',\r\n    MESSAGE_IFRAME_RENDER_STARTED: 'message_iframe_render_started',\r\n    MESSAGE_IFRAME_RENDER_ENDED: 'message_iframe_render_ended',\r\n    GENERATION_REQUESTED: 'js_generation_requested',\r\n    STREAM_TOKEN_RECEIVED_FULLY: 'js_stream_token_received_fully',\r\n    STREAM_TOKEN_RECEIVED_INCREMENTALLY: 'js_stream_token_received_incrementally',\r\n    GENERATION_ENDED_JS: 'js_generation_ended',\r\n  };\r\n\r\n  return {\r\n    createCore: createCore,\r\n    createEventBus: createEventBus,\r\n    flattenEntries: flattenEntries,\r\n    TAVERN_EVENTS: TAVERN_EVENTS,\r\n    // 供测试\r\n    getPath: getPath,\r\n    setPath: setPath,\r\n    hasPath: hasPath,\r\n    deletePath: deletePath,\r\n    deepEqual: deepEqual,\r\n  };\r\n})();\r\n\r\nif (typeof module !== 'undefined' && module.exports) module.exports = TT_CORE;\r\n";
    const TAVERN_SHIM_SRC = "/* 酒馆助手兼容 iframe 的浏览器适配层。\r\n *\r\n * 依赖：window.__TT_INIT__（父窗口注入的初始数据）与 TT_CORE（同文档先加载的核心）。\r\n * 负责：ST/TavernHelper 全局、toastr、jQuery 子集、lodash 子集、事件、弹窗桥、\r\n *       卡内脚本执行。\r\n */\r\n(function () {\r\n  'use strict';\r\n\r\n  var INIT = window.__TT_INIT__ || {};\r\n  var TT = window.TT_CORE;\r\n  if (!TT) throw new Error('TT_CORE 未加载');\r\n\r\n  function post(message) {\r\n    try {\r\n      var payload = Object.assign({ __ttChild: true }, message);\r\n      window.parent.postMessage(payload, '*');\r\n    } catch (error) {\r\n      try { console.error('[dsh-tt] postMessage failed', error); } catch { /* ignore */ }\r\n    }\r\n  }\r\n\r\n  function log(level, text) {\r\n    post({ tt: 'log', level: level || 'info', text: String(text == null ? '' : text) });\r\n  }\r\n\r\n  var core = TT.createCore({\r\n    card: INIT.card || {},\r\n    userName: INIT.userName || '你',\r\n    charName: INIT.charName || (INIT.card && INIT.card.name) || '角色',\r\n    chatId: INIT.chatId || 'dsh-tt-chat',\r\n    worldbookName: INIT.worldbookName || '角色世界书',\r\n    worldbookEntries: INIT.worldbookEntries || [],\r\n    variables: INIT.variables || {},\r\n    messages: INIT.messages || [],\r\n    extensionSettings: INIT.extensionSettings || {},\r\n    post: post,\r\n    log: log,\r\n  });\r\n\r\n  var TAVERN_EVENTS = TT.TAVERN_EVENTS;\r\n\r\n  function escapeHtml(value) {\r\n    return String(value == null ? '' : value)\r\n      .replace(/&/g, '&amp;')\r\n      .replace(/</g, '&lt;')\r\n      .replace(/>/g, '&gt;')\r\n      .replace(/\"/g, '&quot;')\r\n      .replace(/'/g, '&#39;');\r\n  }\r\n\r\n  function textToHtml(text) {\r\n    return escapeHtml(text).replace(/\\n/g, '<br>');\r\n  }\r\n\r\n  // ── 正则脚本（显示/提示词作用域） ─────────────────────────────\r\n  function compileRegex(rule) {\r\n    if (!rule || rule.disabled) return null;\r\n    var find = String(rule.findRegex || '');\r\n    if (!find) return null;\r\n    var match = find.match(/^\\/([\\s\\S]*)\\/([a-z]*)$/);\r\n    var source = match ? match[1] : find;\r\n    var flags = match ? match[2] : 'g';\r\n    try { return new RegExp(source, flags); } catch { return null; }\r\n  }\r\n\r\n  function applyRegexes(text, placement, options) {\r\n    var out = String(text == null ? '' : text);\r\n    var rules = Array.isArray(INIT.regexScripts) ? INIT.regexScripts : [];\r\n    var isPrompt = Boolean(options && options.isPrompt);\r\n    for (var i = 0; i < rules.length; i += 1) {\r\n      var rule = rules[i];\r\n      if (!rule || rule.disabled) continue;\r\n      var placements = Array.isArray(rule.placement) ? rule.placement : [];\r\n      if (placement != null && placements.length && placements.indexOf(Number(placement)) < 0) continue;\r\n      if (isPrompt && rule.markdownOnly) continue;\r\n      if (!isPrompt && rule.promptOnly) continue;\r\n      var regex = compileRegex(rule);\r\n      if (!regex) continue;\r\n      try {\r\n        out = out.replace(regex, String(rule.replaceString == null ? '' : rule.replaceString));\r\n      } catch { /* ignore */ }\r\n    }\r\n    return out;\r\n  }\r\n\r\n  // ── jQuery 子集 ────────────────────────────────────────────\r\n  var JQ = function (elements) {\r\n    this.elements = elements || [];\r\n    this.length = this.elements.length;\r\n    for (var i = 0; i < this.elements.length; i += 1) this[i] = this.elements[i];\r\n    this.prevObject = null;\r\n  };\r\n\r\n  function wrap(elements) { return new JQ(elements); }\r\n\r\n  function toElements(value) {\r\n    if (!value) return [];\r\n    if (value instanceof JQ) return value.elements;\r\n    if (value.nodeType || value === window || value === document) return [value];\r\n    if (typeof value === 'string') {\r\n      var html = value.trim();\r\n      if (html[0] === '<' && html[1] !== '/') {\r\n        var template = document.createElement('template');\r\n        template.innerHTML = html;\r\n        return Array.prototype.slice.call(template.content.childNodes);\r\n      }\r\n      return Array.prototype.slice.call(document.querySelectorAll(value));\r\n    }\r\n    if (typeof value.length === 'number') return Array.prototype.slice.call(value);\r\n    return [];\r\n  }\r\n\r\n  function $(selector) {\r\n    if (typeof selector === 'function') {\r\n      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', selector, { once: true });\r\n      else setTimeout(selector, 0);\r\n      return wrap([]);\r\n    }\r\n    return wrap(toElements(selector));\r\n  }\r\n\r\n  JQ.prototype.each = function (fn) {\r\n    for (var i = 0; i < this.elements.length; i += 1) {\r\n      if (fn.call(this.elements[i], i, this.elements[i]) === false) break;\r\n    }\r\n    return this;\r\n  };\r\n  JQ.prototype.map = function (fn) {\r\n    var out = [];\r\n    for (var i = 0; i < this.elements.length; i += 1) {\r\n      var value = fn.call(this.elements[i], i, this.elements[i]);\r\n      if (value != null) out.push(value);\r\n    }\r\n    return wrap(out);\r\n  };\r\n  JQ.prototype.toArray = function () { return this.elements.slice(); };\r\n  JQ.prototype.get = function (index) { return index == null ? this.elements.slice() : this.elements[index]; };\r\n  JQ.prototype.eq = function (index) { return wrap(index < 0 ? [this.elements[this.elements.length + index]] : [this.elements[index]]); };\r\n  JQ.prototype.first = function () { return wrap(this.elements.slice(0, 1)); };\r\n  JQ.prototype.last = function () { return wrap(this.elements.slice(-1)); };\r\n  JQ.prototype.filter = function (selector) {\r\n    if (typeof selector === 'function') return wrap(this.elements.filter(function (el, index) { return selector.call(el, index, el); }));\r\n    return wrap(this.elements.filter(function (el) { return el.matches && el.matches(selector); }));\r\n  };\r\n  JQ.prototype.is = function (selector) {\r\n    if (typeof selector === 'function') return this.elements.some(function (el, index) { return selector.call(el, index, el); });\r\n    return this.elements.some(function (el) { return el.matches && el.matches(selector); });\r\n  };\r\n  JQ.prototype.find = function (selector) {\r\n    var out = [];\r\n    this.elements.forEach(function (el) {\r\n      if (el.querySelectorAll) out = out.concat(Array.prototype.slice.call(el.querySelectorAll(selector)));\r\n    });\r\n    return wrap(out);\r\n  };\r\n  JQ.prototype.parent = function () { return wrap(this.elements.map(function (el) { return el.parentElement; }).filter(Boolean)); };\r\n  JQ.prototype.children = function (selector) {\r\n    var out = [];\r\n    this.elements.forEach(function (el) {\r\n      if (!el.children) return;\r\n      var list = Array.prototype.slice.call(el.children);\r\n      out = out.concat(selector ? list.filter(function (child) { return child.matches && child.matches(selector); }) : list);\r\n    });\r\n    return wrap(out);\r\n  };\r\n  JQ.prototype.closest = function (selector) { return wrap(this.elements.map(function (el) { return el.closest && el.closest(selector); }).filter(Boolean)); };\r\n  JQ.prototype.next = function () { return wrap(this.elements.map(function (el) { return el.nextElementSibling; }).filter(Boolean)); };\r\n  JQ.prototype.prev = function () { return wrap(this.elements.map(function (el) { return el.previousElementSibling; }).filter(Boolean)); };\r\n  JQ.prototype.siblings = function () {\r\n    var out = [];\r\n    this.elements.forEach(function (el) {\r\n      if (!el.parentElement) return;\r\n      Array.prototype.slice.call(el.parentElement.children).forEach(function (child) { if (child !== el) out.push(child); });\r\n    });\r\n    return wrap(out);\r\n  };\r\n  JQ.prototype.attr = function (name, value) {\r\n    if (value === undefined) return this.elements.length ? this.elements[0].getAttribute(name) : undefined;\r\n    return this.each(function (_, el) { if (value === null) el.removeAttribute(name); else el.setAttribute(name, String(value)); });\r\n  };\r\n  JQ.prototype.removeAttr = function (name) { return this.each(function (_, el) { el.removeAttribute(name); }); };\r\n  JQ.prototype.prop = function (name, value) {\r\n    if (value === undefined) return this.elements.length ? this.elements[0][name] : undefined;\r\n    return this.each(function (_, el) { el[name] = value; });\r\n  };\r\n  JQ.prototype.data = function (name, value) {\r\n    if (value === undefined) {\r\n      if (!this.elements.length) return undefined;\r\n      var raw = this.elements[0].getAttribute('data-' + name);\r\n      if (raw == null) return undefined;\r\n      try { return JSON.parse(raw); } catch { return raw; }\r\n    }\r\n    return this.attr('data-' + name, typeof value === 'string' ? value : JSON.stringify(value));\r\n  };\r\n  JQ.prototype.text = function (value) {\r\n    if (value === undefined) return this.elements.map(function (el) { return el.textContent; }).join('');\r\n    return this.each(function (_, el) { el.textContent = String(value); });\r\n  };\r\n  JQ.prototype.html = function (value) {\r\n    if (value === undefined) return this.elements.length ? this.elements[0].innerHTML : undefined;\r\n    return this.each(function (_, el) { el.innerHTML = String(value); });\r\n  };\r\n  JQ.prototype.val = function (value) {\r\n    if (value === undefined) return this.elements.length ? this.elements[0].value : undefined;\r\n    return this.each(function (_, el) { el.value = value; });\r\n  };\r\n  JQ.prototype.append = function (child) {\r\n    var nodes = toElements(child);\r\n    return this.each(function (_, el) {\r\n      nodes.forEach(function (node) {\r\n        if (typeof node === 'string') el.insertAdjacentHTML('beforeend', node);\r\n        else el.appendChild(node);\r\n      });\r\n    });\r\n  };\r\n  JQ.prototype.appendTo = function (target) {\r\n    var parents = toElements(target);\r\n    this.elements.forEach(function (el) {\r\n      parents.forEach(function (parent) {\r\n        if (typeof parent === 'string') parent = document.querySelector(parent);\r\n        if (parent && parent.appendChild) parent.appendChild(el);\r\n      });\r\n    });\r\n    return this;\r\n  };\r\n  JQ.prototype.prepend = function (child) {\r\n    var nodes = toElements(child);\r\n    return this.each(function (_, el) {\r\n      nodes.forEach(function (node) {\r\n        if (typeof node === 'string') el.insertAdjacentHTML('afterbegin', node);\r\n        else el.insertBefore(node, el.firstChild);\r\n      });\r\n    });\r\n  };\r\n  JQ.prototype.before = function (child) {\r\n    var nodes = toElements(child);\r\n    return this.each(function (_, el) {\r\n      nodes.forEach(function (node) { if (el.parentNode) el.parentNode.insertBefore(typeof node === 'string' ? document.createTextNode(node) : node, el); });\r\n    });\r\n  };\r\n  JQ.prototype.after = function (child) {\r\n    var nodes = toElements(child);\r\n    return this.each(function (_, el) {\r\n      nodes.forEach(function (node) { if (el.parentNode) el.parentNode.insertBefore(typeof node === 'string' ? document.createTextNode(node) : node, el.nextSibling); });\r\n    });\r\n  };\r\n  JQ.prototype.remove = function () { return this.each(function (_, el) { if (el.parentNode) el.parentNode.removeChild(el); }); };\r\n  JQ.prototype.empty = function () { return this.each(function (_, el) { el.innerHTML = ''; }); };\r\n  JQ.prototype.addClass = function (name) { return this.each(function (_, el) { el.classList && el.classList.add.apply(el.classList, String(name).split(/\\s+/)); }); };\r\n  JQ.prototype.removeClass = function (name) { return this.each(function (_, el) { el.classList && el.classList.remove.apply(el.classList, String(name).split(/\\s+/)); }); };\r\n  JQ.prototype.toggleClass = function (name) { return this.each(function (_, el) { if (el.classList) el.classList.toggle(name); }); };\r\n  JQ.prototype.hasClass = function (name) { return this.elements.some(function (el) { return el.classList && el.classList.contains(name); }); };\r\n  JQ.prototype.css = function (name, value) {\r\n    if (typeof name === 'object') {\r\n      var styles = name;\r\n      return this.each(function (_, el) { Object.keys(styles).forEach(function (key) { el.style[key] = styles[key]; }); });\r\n    }\r\n    if (value === undefined) return this.elements.length && this.elements[0].style ? this.elements[0].style[name] : undefined;\r\n    return this.each(function (_, el) { if (el.style) el.style[name] = value; });\r\n  };\r\n  JQ.prototype.on = function (events, handler) {\r\n    var list = String(events).split(/\\s+/).filter(Boolean);\r\n    return this.each(function (_, el) {\r\n      list.forEach(function (eventName) {\r\n        var dot = eventName.lastIndexOf('.');\r\n        var type = dot > 0 ? eventName.slice(0, dot) : eventName;\r\n        var listener = function (event) {\r\n          event = event || {};\r\n          if (!event.preventDefault) event.preventDefault = function () {};\r\n          if (!event.stopPropagation) event.stopPropagation = function () {};\r\n          var result = handler.call(el, event);\r\n          if (result === false) event.preventDefault();\r\n        };\r\n        el.__ttListeners = el.__ttListeners || [];\r\n        el.__ttListeners.push({ type: type, handler: handler, listener: listener });\r\n        el.addEventListener(type, listener);\r\n      });\r\n    });\r\n  };\r\n  JQ.prototype.one = function (events, handler) {\r\n    var self = this;\r\n    var wrapped = function (event) { self.off(events, wrapped); return handler.apply(this, arguments); };\r\n    return this.on(events, wrapped);\r\n  };\r\n  JQ.prototype.off = function (events, handler) {\r\n    var list = events ? String(events).split(/\\s+/).filter(Boolean) : [];\r\n    return this.each(function (_, el) {\r\n      (el.__ttListeners || []).forEach(function (entry) {\r\n        if (list.length && list.indexOf(entry.type) < 0) return;\r\n        if (handler && entry.handler !== handler) return;\r\n        el.removeEventListener(entry.type, entry.listener);\r\n      });\r\n    });\r\n  };\r\n  JQ.prototype.trigger = function (eventName) {\r\n    return this.each(function (_, el) {\r\n      if (typeof el[eventName] === 'function') el[eventName]();\r\n      else el.dispatchEvent(new CustomEvent(eventName, { bubbles: true }));\r\n    });\r\n  };\r\n  ['click', 'dblclick', 'focus', 'blur', 'change', 'input', 'submit', 'keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'mousemove', 'mouseenter', 'mouseleave', 'scroll'].forEach(function (type) {\r\n    JQ.prototype[type] = function (handler) { return handler ? this.on(type, handler) : this.trigger(type); };\r\n  });\r\n  JQ.prototype.show = function () { return this.each(function (_, el) { if (el.style) el.style.display = ''; }); };\r\n  JQ.prototype.hide = function () { return this.each(function (_, el) { if (el.style) el.style.display = 'none'; }); };\r\n  JQ.prototype.scrollTop = function (value) {\r\n    if (value === undefined) return this.elements.length ? this.elements[0].scrollTop : 0;\r\n    return this.each(function (_, el) { el.scrollTop = value; });\r\n  };\r\n  JQ.prototype.height = function (value) {\r\n    if (value === undefined) return this.elements.length ? this.elements[0].clientHeight : 0;\r\n    return this.css('height', typeof value === 'number' ? value + 'px' : value);\r\n  };\r\n  JQ.prototype.width = function (value) {\r\n    if (value === undefined) return this.elements.length ? this.elements[0].clientWidth : 0;\r\n    return this.css('width', typeof value === 'number' ? value + 'px' : value);\r\n  };\r\n  JQ.prototype.offset = function () {\r\n    if (!this.elements.length) return { top: 0, left: 0 };\r\n    var rect = this.elements[0].getBoundingClientRect();\r\n    return { top: rect.top + window.scrollY, left: rect.left + window.scrollX };\r\n  };\r\n\r\n  $ .fn = JQ.prototype;\r\n  window.$ = $;\r\n  window.jQuery = $;\r\n\r\n  // ── lodash 子集 ────────────────────────────────────────────\r\n  var _ = (function () {\r\n    function isPlainObject(value) {\r\n      if (value == null || typeof value !== 'object') return false;\r\n      var proto = Object.getPrototypeOf(value);\r\n      return proto === Object.prototype || proto === null;\r\n    }\r\n    function clone(value) {\r\n      if (value == null || typeof value !== 'object') return value;\r\n      try { return structuredClone(value); } catch { /* ignore */ }\r\n      try { return JSON.parse(JSON.stringify(value)); } catch { return value; }\r\n    }\r\n    function iteratee(source) {\r\n      if (source == null) return function (value) { return value; };\r\n      if (typeof source === 'function') return source;\r\n      if (typeof source === 'string' || typeof source === 'number') return function (value) { return _.get(value, source); };\r\n      if (Array.isArray(source)) return function (value) { return _.isEqual(_.get(value, source[0]), source[1]); };\r\n      if (typeof source === 'object') return function (value) { return Object.keys(source).every(function (key) { return _.isEqual(_.get(value, key), source[key]); }); };\r\n      return function (value) { return value; };\r\n    }\r\n    function deepEqual(a, b) {\r\n      if (a === b) return true;\r\n      if (typeof a !== typeof b) return false;\r\n      if (a == null || b == null) return false;\r\n      if (Array.isArray(a) !== Array.isArray(b)) return false;\r\n      if (typeof a !== 'object') return false;\r\n      var keysA = Object.keys(a);\r\n      var keysB = Object.keys(b);\r\n      if (keysA.length !== keysB.length) return false;\r\n      return keysA.every(function (key) { return Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]); });\r\n    }\r\n    var lib = {\r\n      get: TT.getPath,\r\n      set: TT.setPath,\r\n      has: TT.hasPath,\r\n      unset: TT.deletePath,\r\n      isEqual: deepEqual,\r\n      isMatch: function (object, source) { return iteratee(source)(object); },\r\n      isNil: function (value) { return value == null; },\r\n      isNull: function (value) { return value === null; },\r\n      isUndefined: function (value) { return value === undefined; },\r\n      isArray: Array.isArray,\r\n      isString: function (value) { return typeof value === 'string'; },\r\n      isNumber: function (value) { return typeof value === 'number'; },\r\n      isBoolean: function (value) { return typeof value === 'boolean'; },\r\n      isFunction: function (value) { return typeof value === 'function'; },\r\n      isObject: function (value) { return value != null && (typeof value === 'object' || typeof value === 'function'); },\r\n      isPlainObject: isPlainObject,\r\n      isEmpty: function (value) {\r\n        if (value == null) return true;\r\n        if (typeof value === 'string' || Array.isArray(value)) return value.length === 0;\r\n        if (typeof value === 'object') return Object.keys(value).length === 0;\r\n        return true;\r\n      },\r\n      clone: clone,\r\n      cloneDeep: clone,\r\n      toNumber: function (value) { var n = parseFloat(value); return Number.isFinite(n) ? n : 0; },\r\n      toInteger: function (value) { return Math.trunc(lib.toNumber(value)); },\r\n      toString: function (value) { return value == null ? '' : String(value); },\r\n      defaultTo: function (value, fallback) { return value == null || Number.isNaN(value) ? fallback : value; },\r\n      clamp: function (value, lower, upper) { return Math.min(Math.max(lib.toNumber(value), lower), upper); },\r\n      round: function (value, precision) { var factor = Math.pow(10, precision || 0); return Math.round(lib.toNumber(value) * factor) / factor; },\r\n      floor: function (value) { return Math.floor(lib.toNumber(value)); },\r\n      ceil: function (value) { return Math.ceil(lib.toNumber(value)); },\r\n      random: function (lower, upper, floating) {\r\n        if (Array.isArray(lower)) return lower[Math.floor(Math.random() * lower.length)];\r\n        if (typeof lower === 'boolean') return Math.random() < 0.5;\r\n        if (upper === undefined) { upper = lower; lower = 0; }\r\n        if (floating) return lower + Math.random() * (upper - lower);\r\n        return lower + Math.floor(Math.random() * (upper - lower + 1));\r\n      },\r\n      sample: function (list) { return Array.isArray(list) && list.length ? list[Math.floor(Math.random() * list.length)] : undefined; },\r\n      shuffle: function (list) { return (list || []).slice().sort(function () { return Math.random() - 0.5; }); },\r\n      times: function (count, fn) { var out = []; for (var i = 0; i < count; i += 1) out.push(typeof fn === 'function' ? fn(i) : fn); return out; },\r\n      range: function (start, end, step) {\r\n        var from = start; var to = end; var by = step || 1;\r\n        if (to === undefined) { to = from; from = 0; }\r\n        var out = [];\r\n        if (by > 0) for (var i = from; i < to; i += by) out.push(i);\r\n        else for (var j = from; j > to; j += by) out.push(j);\r\n        return out;\r\n      },\r\n      uniqueId: (function () { var id = 0; return function () { id += 1; return String(id); }; })(),\r\n      escape: escapeHtml,\r\n      unescape: function (text) { return String(text == null ? '' : text).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '\"').replace(/&#39;/g, \"'\").replace(/&amp;/g, '&'); },\r\n      upperFirst: function (text) { var s = String(text == null ? '' : text); return s ? s[0].toUpperCase() + s.slice(1) : s; },\r\n      lowerFirst: function (text) { var s = String(text == null ? '' : text); return s ? s[0].toLowerCase() + s.slice(1) : s; },\r\n      capitalize: function (text) { var s = String(text == null ? '' : text).toLowerCase(); return s ? s[0].toUpperCase() + s.slice(1) : s; },\r\n      trim: function (text) { return String(text == null ? '' : text).trim(); },\r\n      split: function (text, separator) { return String(text == null ? '' : text).split(separator); },\r\n      join: function (list, separator) { return (list || []).join(separator == null ? ',' : separator); },\r\n      includes: function (collection, value) { return typeof collection === 'string' ? collection.indexOf(value) >= 0 : Array.isArray(collection) ? collection.indexOf(value) >= 0 : false; },\r\n      startsWith: function (text, target) { return String(text == null ? '' : text).indexOf(target) === 0; },\r\n      endsWith: function (text, target) { var s = String(text == null ? '' : text); return s.slice(-String(target).length) === String(target); },\r\n      replace: function (text, pattern, replacement) { return String(text == null ? '' : text).replace(pattern, replacement); },\r\n      keys: function (object) { return Object.keys(object || {}); },\r\n      values: function (object) { return Object.values(object || {}); },\r\n      toPairs: function (object) { return Object.entries(object || {}); },\r\n      assign: function () { return Object.assign.apply(Object, [{}].concat(Array.prototype.slice.call(arguments))); },\r\n      merge: function (target) {\r\n        for (var i = 1; i < arguments.length; i += 1) {\r\n          var source = arguments[i] || {};\r\n          Object.keys(source).forEach(function (key) {\r\n            if (isPlainObject(source[key]) && isPlainObject(target[key])) lib.merge(target[key], source[key]);\r\n            else target[key] = clone(source[key]);\r\n          });\r\n        }\r\n        return target;\r\n      },\r\n      mergeWith: function (target, source) {\r\n        Object.keys(source || {}).forEach(function (key) { target[key] = clone(source[key]); });\r\n        return target;\r\n      },\r\n      update: function (object, path, updater) {\r\n        var current = lib.get(object, path);\r\n        var next = typeof updater === 'function' ? updater(current) : updater;\r\n        lib.set(object, path, next);\r\n        return object;\r\n      },\r\n      map: function (collection, fn) {\r\n        var iterate = iteratee(fn);\r\n        return Array.isArray(collection) ? collection.map(iterate) : Object.values(collection || {}).map(iterate);\r\n      },\r\n      filter: function (collection, fn) {\r\n        var iterate = iteratee(fn);\r\n        return Array.isArray(collection) ? collection.filter(iterate) : Object.values(collection || {}).filter(iterate);\r\n      },\r\n      reject: function (collection, fn) {\r\n        var iterate = iteratee(fn);\r\n        return (collection || []).filter(function (item) { return !iterate(item); });\r\n      },\r\n      find: function (collection, fn) {\r\n        var iterate = iteratee(fn);\r\n        return Array.isArray(collection) ? collection.find(iterate) : Object.values(collection || {}).find(iterate);\r\n      },\r\n      findIndex: function (collection, fn) {\r\n        var iterate = iteratee(fn);\r\n        return Array.isArray(collection) ? collection.findIndex(iterate) : -1;\r\n      },\r\n      some: function (collection, fn) {\r\n        var iterate = iteratee(fn);\r\n        return Array.isArray(collection) ? collection.some(iterate) : Object.values(collection || {}).some(iterate);\r\n      },\r\n      every: function (collection, fn) {\r\n        var iterate = iteratee(fn);\r\n        return Array.isArray(collection) ? collection.every(iterate) : Object.values(collection || {}).every(iterate);\r\n      },\r\n      forEach: function (collection, fn) {\r\n        if (Array.isArray(collection)) collection.forEach(fn);\r\n        else Object.keys(collection || {}).forEach(function (key) { fn(collection[key], key, collection); });\r\n        return collection;\r\n      },\r\n      each: function (collection, fn) { return lib.forEach(collection, fn); },\r\n      reduce: function (collection, fn, initial) {\r\n        return Array.isArray(collection) ? collection.reduce(fn, initial) : Object.values(collection || {}).reduce(fn, initial);\r\n      },\r\n      groupBy: function (collection, fn) {\r\n        var iterate = iteratee(fn);\r\n        var out = {};\r\n        (collection || []).forEach(function (item) {\r\n          var key = iterate(item);\r\n          (out[key] = out[key] || []).push(item);\r\n        });\r\n        return out;\r\n      },\r\n      keyBy: function (collection, fn) {\r\n        var iterate = iteratee(fn);\r\n        var out = {};\r\n        (collection || []).forEach(function (item) { out[iterate(item)] = item; });\r\n        return out;\r\n      },\r\n      sortBy: function (collection, fn) {\r\n        var iterate = iteratee(fn);\r\n        return (collection || []).slice().sort(function (a, b) {\r\n          var va = iterate(a); var vb = iterate(b);\r\n          return va < vb ? -1 : va > vb ? 1 : 0;\r\n        });\r\n      },\r\n      uniq: function (list) { return Array.from(new Set(list || [])); },\r\n      union: function () { return Array.from(new Set(Array.prototype.concat.apply([], arguments))); },\r\n      flatten: function (list) { return (list || []).flat(); },\r\n      flattenDeep: function (list) { return (list || []).flat(Infinity); },\r\n      compact: function (list) { return (list || []).filter(Boolean); },\r\n      first: function (list) { return (list || [])[0]; },\r\n      head: function (list) { return (list || [])[0]; },\r\n      last: function (list) { return (list || [])[(list || []).length - 1]; },\r\n      nth: function (list, index) { return (list || [])[index < 0 ? (list || []).length + index : index]; },\r\n      take: function (list, count) { return (list || []).slice(0, count == null ? 1 : count); },\r\n      drop: function (list, count) { return (list || []).slice(count == null ? 1 : count); },\r\n      debounce: function (fn) {\r\n        var timer = null;\r\n        var wrapped = function () {\r\n          var args = arguments;\r\n          if (timer) clearTimeout(timer);\r\n          timer = setTimeout(function () { timer = null; fn.apply(null, args); }, 0);\r\n        };\r\n        wrapped.cancel = function () { if (timer) clearTimeout(timer); timer = null; };\r\n        return wrapped;\r\n      },\r\n      throttle: function (fn) {\r\n        var last = 0;\r\n        var wrapped = function () {\r\n          var now = Date.now();\r\n          if (now - last >= 16) { last = now; return fn.apply(null, arguments); }\r\n          return undefined;\r\n        };\r\n        wrapped.cancel = function () {};\r\n        return wrapped;\r\n      },\r\n      once: function (fn) {\r\n        var called = false; var result;\r\n        return function () { if (!called) { called = true; result = fn.apply(null, arguments); } return result; };\r\n      },\r\n      identity: function (value) { return value; },\r\n      noop: function () {},\r\n      stubTrue: function () { return true; },\r\n      stubFalse: function () { return false; },\r\n      constant: function (value) { return function () { return value; }; },\r\n    };\r\n    function makeChain(value) {\r\n      return {\r\n        value: function () { return value; },\r\n        valueOf: function () { return value; },\r\n        toString: function () { return String(value); },\r\n        map: function (fn) { return makeChain(lib.map(value, fn)); },\r\n        filter: function (fn) { return makeChain(lib.filter(value, fn)); },\r\n        reject: function (fn) { return makeChain(lib.reject(value, fn)); },\r\n        sortBy: function (fn) { return makeChain(lib.sortBy(value, fn)); },\r\n        uniq: function () { return makeChain(lib.uniq(value)); },\r\n        flatten: function () { return makeChain(lib.flatten(value)); },\r\n        take: function (count) { return makeChain(lib.take(value, count)); },\r\n        last: function () { return lib.last(value); },\r\n        first: function () { return lib.first(value); },\r\n        head: function () { return lib.first(value); },\r\n        toArray: function () { return value; },\r\n      };\r\n    }\r\n    var callable = new Proxy(function (value) { return makeChain(value); }, {\r\n      get: function (target, prop) {\r\n        if (prop === 'prototype') return undefined;\r\n        return lib[prop];\r\n      },\r\n      apply: function (target, thisArg, args) { return makeChain(args[0]); },\r\n    });\r\n    return callable;\r\n  })();\r\n  window._ = _;\r\n  window.lodash = _;\r\n\r\n  // ── toastr 与弹窗 ──────────────────────────────────────────\r\n  var toastr = {\r\n    options: {},\r\n    success: function (message, title, options) { post({ tt: 'toast', level: 'success', message: String(message == null ? '' : message), title: title == null ? '' : String(title), options: options || {} }); },\r\n    info: function (message, title, options) { post({ tt: 'toast', level: 'info', message: String(message == null ? '' : message), title: title == null ? '' : String(title), options: options || {} }); },\r\n    warning: function (message, title, options) { post({ tt: 'toast', level: 'warning', message: String(message == null ? '' : message), title: title == null ? '' : String(title), options: options || {} }); },\r\n    error: function (message, title, options) { post({ tt: 'toast', level: 'error', message: String(message == null ? '' : message), title: title == null ? '' : String(title), options: options || {} }); },\r\n    clear: function () { post({ tt: 'toast-clear' }); },\r\n    remove: function () { post({ tt: 'toast-clear' }); },\r\n  };\r\n  window.toastr = toastr;\r\n\r\n  var POPUP_TYPE = { TEXT: 1, CONFIRM: 2, INPUT: 3, DISPLAY: 4, CROP: 5 };\r\n  var POPUP_RESULT = {\r\n    AFFIRMATIVE: 1, NEGATIVE: 0, CANCELLED: -1,\r\n    CUSTOM1: 2, CUSTOM2: 3, CUSTOM3: 4, CUSTOM4: 5, CUSTOM5: 6, CUSTOM6: 7, CUSTOM7: 8, CUSTOM8: 9, CUSTOM9: 10,\r\n  };\r\n  var popupSeq = 0;\r\n  var popupPending = new Map();\r\n\r\n  function callGenericPopup(content, type, inputValue, options) {\r\n    return new Promise(function (resolve) {\r\n      var id = ++popupSeq;\r\n      popupPending.set(id, resolve);\r\n      post({\r\n        tt: 'popup',\r\n        id: id,\r\n        content: typeof content === 'string' ? content : (content && content.outerHTML ? content.outerHTML : String(content == null ? '' : content)),\r\n        type: type == null ? POPUP_TYPE.TEXT : type,\r\n        inputValue: inputValue == null ? '' : String(inputValue),\r\n        options: options || {},\r\n      });\r\n      setTimeout(function () {\r\n        if (popupPending.has(id)) {\r\n          popupPending.delete(id);\r\n          resolve(POPUP_RESULT.CANCELLED);\r\n        }\r\n      }, 120000);\r\n    });\r\n  }\r\n\r\n  window.callGenericPopup = callGenericPopup;\r\n  window.POPUP_TYPE = POPUP_TYPE;\r\n  window.POPUP_RESULT = POPUP_RESULT;\r\n\r\n  // ── 事件全局 ───────────────────────────────────────────────\r\n  function eventOn(type, listener) { return core.bus.on(type, listener); }\r\n  function eventOnce(type, listener) { return core.bus.once(type, listener); }\r\n  function eventMakeFirst(type, listener) { return core.bus.makeFirst(type, listener); }\r\n  function eventMakeLast(type, listener) { return core.bus.makeLast(type, listener); }\r\n  function eventRemoveListener(type, listener) { return core.bus.remove(type, listener); }\r\n  function eventEmit(type) { return core.bus.emit.apply(core.bus, arguments); }\r\n  function eventEmitAndWait(type) { return core.bus.emitAndWait.apply(core.bus, arguments); }\r\n  function eventClearEvent(type) { return core.bus.clearEvent(type); }\r\n  function eventClearListener(listener) { return core.bus.clearListener(listener); }\r\n  function eventClearAll() { return core.bus.clearAll(); }\r\n\r\n  window.eventOn = eventOn;\r\n  window.eventOnce = eventOnce;\r\n  window.eventMakeFirst = eventMakeFirst;\r\n  window.eventMakeLast = eventMakeLast;\r\n  window.eventRemoveListener = eventRemoveListener;\r\n  window.eventEmit = eventEmit;\r\n  window.eventEmitAndWait = eventEmitAndWait;\r\n  window.eventClearEvent = eventClearEvent;\r\n  window.eventClearListener = eventClearListener;\r\n  window.eventClearAll = eventClearAll;\r\n  window.tavern_events = TAVERN_EVENTS;\r\n  window.event_types = TAVERN_EVENTS;\r\n  window.iframe_events = {\r\n    MESSAGE_IFRAME_RENDER_STARTED: 'message_iframe_render_started',\r\n    MESSAGE_IFRAME_RENDER_ENDED: 'message_iframe_render_ended',\r\n    GENERATION_REQUESTED: 'js_generation_requested',\r\n    GENERATION_STARTED: 'js_generation_started',\r\n    STREAM_TOKEN_RECEIVED_FULLY: 'js_stream_token_received_fully',\r\n    STREAM_TOKEN_RECEIVED_INCREMENTALLY: 'js_stream_token_received_incrementally',\r\n    GENERATION_ENDED: 'js_generation_ended',\r\n  };\r\n\r\n  // ── TH 变量 / 消息 / 宏 / 世界书全局 ────────────────────────\r\n  window.getVariables = function (option) { return core.getVariables(option); };\r\n  window.replaceVariables = function (variables, option) { return core.replaceVariables(variables, option); };\r\n  window.updateVariablesWith = function (updater, option) { return core.updateVariablesWith(updater, option); };\r\n  window.insertOrAssignVariables = function (variables, option) { return core.insertOrAssignVariables(variables, option); };\r\n  window.insertVariables = function (variables, option) { return core.insertVariables(variables, option); };\r\n  window.deleteVariable = function (key, option) { return core.deleteVariable(key, option); };\r\n  window.getChatMessages = function (range, option) { return core.getChatMessages(range, option); };\r\n  window.setChatMessages = function (messages, option) { return core.setChatMessages(messages, option); };\r\n  window.createChatMessages = function (messages, option) { return core.createChatMessages(messages, option); };\r\n  window.deleteChatMessages = function (ids, option) { return core.deleteChatMessages(ids, option); };\r\n  window.rotateChatMessages = function (begin, middle, end, option) { return core.rotateChatMessages(begin, middle, end, option); };\r\n  window.getLastMessageId = function () { return core.getLastMessageId(); };\r\n  window.substitudeMacros = function (text) { return core.substituteMacros(text); };\r\n  window.substituteParams = function (text) { return core.substituteMacros(text); };\r\n  window.substituteParamsExtended = function (text) { return core.substituteMacros(text); };\r\n  window.getTavernHelperVersion = function () { return '4.12.1'; };\r\n  window.getTavernHelperExtensionId = function () { return 'JS-Slash-Runner'; };\r\n  window.getTavernVersion = function () { return '1.13.4'; };\r\n  window.getCurrentLocale = function () { return 'zh-CN'; };\r\n  window.getMessageId = function () { return core.getCurrentMessageId(); };\r\n  window.getScriptId = function () { return core.getCurrentScriptId(); };\r\n  window.getButtonEvent = function (name) { return 'th_button_' + String(name || ''); };\r\n  window.getScriptInfo = function () { return { id: core.getCurrentScriptId(), name: INIT.scriptName || '' }; };\r\n  window.errorCatched = function (fn) {\r\n    return function () {\r\n      try { return fn.apply(this, arguments); } catch (error) {\r\n        toastr.error(String(error && error.message ? error.message : error), '脚本错误');\r\n        return undefined;\r\n      }\r\n    };\r\n  };\r\n  window.formatAsDisplayedMessage = function (messageId) {\r\n    var list = core.getChatMessages(messageId == null ? -1 : messageId);\r\n    var message = list[0];\r\n    if (!message) return '';\r\n    return textToHtml(applyRegexes(message.message, 2));\r\n  };\r\n  window.retrieveDisplayedMessage = window.formatAsDisplayedMessage;\r\n  window.refreshOneMessage = function (messageId) { post({ tt: 'refresh', index: messageId }); };\r\n  window.triggerSlash = function (command) {\r\n    try { return core.slashCommand(command); } catch (error) {\r\n      toastr.error(String(error && error.message ? error.message : error), '命令失败');\r\n      throw error;\r\n    }\r\n  };\r\n  window.getLorebookEntries = function (name) { return core.getLorebookEntries(name); };\r\n  window.getWorldbook = function (name) { return core.getWorldbook(name); };\r\n  window.getWorldbookNames = function () { return core.getWorldbookNames(); };\r\n  window.getGlobalWorldbookNames = function () { return core.getGlobalWorldbookNames(); };\r\n  window.getCharWorldbookNames = function () { return core.getCharWorldbookNames(); };\r\n  window.getCurrentCharPrimaryLorebook = function () { return core.getCurrentCharPrimaryLorebook(); };\r\n  window.getCharLorebooks = function (type) {\r\n    var names = core.getCharWorldbookNames();\r\n    if (type === 'primary') return names.primary;\r\n    if (type === 'additional') return names.additional;\r\n    return names;\r\n  };\r\n  window.getLorebooks = function () { return core.getWorldbookNames().map(function (name) { return core.getWorldbook(name); }); };\r\n  window.getLorebookSettings = function () { return { chatLorebook: null, selectedGlobalLorebooks: [], selectedCharLorebooks: { primary: core.worldbookName, additional: [] } }; };\r\n  window.getTavernRegexes = function () { return (INIT.regexScripts || []).slice(); };\r\n  window.formatAsTavernRegexedString = function (text, placement, options) { return applyRegexes(text, placement, options); };\r\n  window.isCharacterTavernRegexesEnabled = function () { return true; };\r\n  window.registerMacroLike = function (name, fn) { core.registerMacro(name, fn); };\r\n  window.injectPrompts = function () { return {}; };\r\n  window.uninjectPrompts = function () { return {}; };\r\n  window.registerScriptButton = function (button) {\r\n    if (!window.__ttButtons) window.__ttButtons = [];\r\n    window.__ttButtons.push(button);\r\n  };\r\n  window.getAllEnabledScriptButtons = function () { return window.__ttButtons || []; };\r\n  window.generate = function () { return Promise.reject(new Error('DSH 的 TH 宿主尚未接通 generate：需要 Host 侧的生成桥。')); };\r\n  window.generateRaw = function () { return Promise.reject(new Error('DSH 的 TH 宿主尚未接通 generateRaw：需要 Host 侧的生成桥。')); };\r\n  window.stopGenerationById = function () { return true; };\r\n  window.stopAllGeneration = function () { return true; };\r\n  window.getModelList = function () { return Promise.resolve([]); };\r\n  window.getProxyPresetNames = function () { return Promise.resolve([]); };\r\n  window.getPresetNames = function () { return Promise.resolve(INIT.presetName ? [INIT.presetName] : []); };\r\n  window.getLoadedPresetName = function () { return INIT.presetName || '默认'; };\r\n  window.getPreset = function () { return Promise.resolve(null); };\r\n  window.loadPreset = function () { return Promise.resolve(); };\r\n  window.replacePreset = function () { throw new Error('DSH TH 宿主：预设写入未接通'); };\r\n  window.updatePresetWith = function () { throw new Error('DSH TH 宿主：预设写入未接通'); };\r\n  window.createPreset = function () { throw new Error('DSH TH 宿主：预设写入未接通'); };\r\n  window.createOrReplacePreset = function () { throw new Error('DSH TH 宿主：预设写入未接通'); };\r\n  window.deletePreset = function () { throw new Error('DSH TH 宿主：预设写入未接通'); };\r\n  window.renamePreset = function () { throw new Error('DSH TH 宿主：预设写入未接通'); };\r\n  window.setPreset = function () { throw new Error('DSH TH 宿主：预设写入未接通'); };\r\n  window.getCharacterNames = function () { return [core.charName]; };\r\n  window.getCharacterIds = function () { return ['0']; };\r\n  window.getCurrentCharacterName = function () { return core.charName; };\r\n  window.getCurrentCharacterId = function () { return '0'; };\r\n  window.getCharData = function () { return INIT.card || {}; };\r\n  window.getCharAvatarPath = function () { return ''; };\r\n  window.getChatHistoryBrief = function () { return core.getChatMessages('0-{{lastMessageId}}'); };\r\n  window.getChatHistoryDetail = function () { return core.getChatMessages('0-{{lastMessageId}}', { include_swipes: true }); };\r\n  window.getPersonaNames = function () { return [core.userName]; };\r\n  window.getPersonaIds = function () { return ['0']; };\r\n  window.getCurrentPersonaName = function () { return core.userName; };\r\n  window.getCurrentPersonaId = function () { return '0'; };\r\n  window.getPersonaAvatarPath = function () { return ''; };\r\n  window.builtin = {};\r\n  window.isAdmin = function () { return false; };\r\n  window.getModelList = function () { return Promise.resolve([]); };\r\n  window.initializeGlobal = function (name) { window[name] = window[name] || {}; return window[name]; };\r\n  window.waitGlobalInitialized = function (name) { return Promise.resolve(window[name] || {}); };\r\n  window.getTavernHelperExtensionId = function () { return 'JS-Slash-Runner'; };\r\n  window.getExtensionType = function () { return 'local'; };\r\n  window.getExtensionStatus = function () { return Promise.resolve({ installed: true }); };\r\n  window.isInstalledExtension = function () { return Promise.resolve(true); };\r\n  window.tavern_events = TAVERN_EVENTS;\r\n\r\n  // 世界书写入 API：明确拒绝，避免脚本以为写成功了。\r\n  ['createWorldbook', 'createOrReplaceWorldbook', 'deleteWorldbook', 'replaceWorldbook', 'updateWorldbookWith',\r\n    'createWorldbookEntries', 'deleteWorldbookEntries', 'rebindGlobalWorldbooks', 'rebindCharWorldbooks',\r\n    'rebindChatWorldbook', 'createLorebook', 'deleteLorebook', 'setLorebookSettings',\r\n    'replaceLorebookEntries', 'updatelorebookEntriesWith', 'setLorebookEntries', 'createLorebookEntries',\r\n    'deleteLorebookEntries', 'createCharacter', 'createOrReplaceCharacter', 'deleteCharacter',\r\n    'replaceCharacter', 'updateCharacterWith', 'createOrReplacePersona', 'deletePersona', 'replacePersona',\r\n    'updatePersonaWith', 'replaceTavernRegexes', 'updateTavernRegexesWith', 'installExtension',\r\n    'uninstallExtension', 'reinstallExtension', 'updateExtension', 'uploadTavernFile', 'deleteTavernFile'].forEach(function (name) {\r\n    window[name] = function () { throw new Error('DSH TH 宿主：' + name + ' 是只读兼容层，未实现写入'); };\r\n  });\r\n\r\n  // ── SillyTavern 上下文 ────────────────────────────────────\r\n  var headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': 'dsh-tt' };\r\n  var extensionPrompts = {};\r\n  var scriptButtons = window.__ttButtons || [];\r\n  var functionTools = new Map();\r\n\r\n  function characterCardFields() { return core.getCharacterCardFields(); }\r\n\r\n  var ToolManager = {\r\n    isToolCallingSupported: function () { return false; },\r\n    canPerformToolCalls: function () { return false; },\r\n    registerFunctionTool: function (tool) { functionTools.set(tool && tool.name, tool); },\r\n    unregisterFunctionTool: function (name) { functionTools.delete(name); },\r\n    getFunctionTools: function () { return Array.from(functionTools.values()); },\r\n  };\r\n\r\n  var ST = {\r\n    chat: core.chat,\r\n    chatMetadata: core.chatMetadata,\r\n    extensionSettings: core.extensionSettings,\r\n    characters: core.characters,\r\n    name1: core.userName,\r\n    name2: core.charName,\r\n    characterId: '0',\r\n    groupId: '',\r\n    chatId: core.chatId,\r\n    maxContext: 128000,\r\n    onlineStatus: 'connected',\r\n    streamingProcessor: null,\r\n    mainApi: 'openai',\r\n    menuType: 0,\r\n    tags: [],\r\n    tagMap: {},\r\n    createCharacterData: {},\r\n    extensionPrompts: extensionPrompts,\r\n    chatCompletionSettings: { openai_model: 'dsh', chat_completion_source: 'dsh', temperature: 1, openai_max_tokens: 8000 },\r\n    textCompletionSettings: {},\r\n    powerUserSettings: {},\r\n    symbols: { ignore: Symbol('ignore') },\r\n    POPUP_TYPE: POPUP_TYPE,\r\n    POPUP_RESULT: POPUP_RESULT,\r\n    callGenericPopup: callGenericPopup,\r\n    ToolManager: ToolManager,\r\n    eventSource: {\r\n      on: eventOn,\r\n      makeLast: eventMakeLast,\r\n      makeFirst: eventMakeFirst,\r\n      removeListener: eventRemoveListener,\r\n      emit: eventEmit,\r\n      emitAndWait: eventEmitAndWait,\r\n      once: eventOnce,\r\n    },\r\n    eventTypes: TAVERN_EVENTS,\r\n    getCurrentChatId: function () { return core.chatId; },\r\n    getRequestHeaders: function () { return Object.assign({}, headers); },\r\n    saveChat: function () { post({ tt: 'save' }); return Promise.resolve(); },\r\n    saveSettingsDebounced: function () { post({ tt: 'settings', value: JSON.parse(JSON.stringify(core.extensionSettings)) }); return Promise.resolve(); },\r\n    saveMetadata: function () { return Promise.resolve(); },\r\n    getCharacterCardFields: characterCardFields,\r\n    getCharacters: function () { return Promise.resolve(core.characters); },\r\n    loadWorldInfo: function (name) { return Promise.resolve(core.getWorldbook(name)); },\r\n    saveWorldInfo: function () { throw new Error('DSH TH 宿主：世界书写入未接通'); },\r\n    reloadWorldInfoEditor: function () {},\r\n    updateWorldInfoList: function () { return Promise.resolve(); },\r\n    convertCharacterBook: function (book) { return core.getWorldbook(book && book.name); },\r\n    getWorldInfoPrompt: function () {\r\n      return Promise.resolve({ worldInfoString: '', worldInfoBefore: '', worldInfoAfter: '', worldInfoExamples: [], worldInfoDepth: [], anBefore: [], anAfter: [] });\r\n    },\r\n    registerMacro: function (key, value) { core.registerMacro(key, value); },\r\n    unregisterMacro: function (key) { core.unregisterMacro(key); },\r\n    getChatCompletionModel: function () { return 'dsh'; },\r\n    getCurrentLocale: function () { return 'zh-CN'; },\r\n    translate: function (text) { return text; },\r\n    t: function (strings) {\r\n      var values = Array.prototype.slice.call(arguments, 1);\r\n      return String(strings || '').replace(/\\{(\\w+)\\}/g, function (raw, key) {\r\n        var index = Number(key);\r\n        return Number.isFinite(index) && values[index] !== undefined ? values[index] : raw;\r\n      });\r\n    },\r\n    addLocaleData: function () {},\r\n    registerFunctionTool: ToolManager.registerFunctionTool,\r\n    unregisterFunctionTool: ToolManager.unregisterFunctionTool,\r\n    isToolCallingSupported: ToolManager.isToolCallingSupported,\r\n    canPerformToolCalls: ToolManager.canPerformToolCalls,\r\n    registerDebugFunction: function () {},\r\n    setExtensionPrompt: function (id, content, position, depth, scan, role, filter) {\r\n      extensionPrompts[id] = { value: String(content == null ? '' : content), position: position, depth: depth, scan: scan, role: role, filter: filter };\r\n      return Promise.resolve();\r\n    },\r\n    unsetExtensionPrompt: function (id) { delete extensionPrompts[id]; return Promise.resolve(); },\r\n    generate: window.generate,\r\n    generateQuietPrompt: function () { return window.generate; },\r\n    generateRaw: window.generateRaw,\r\n    stopGeneration: function () { return true; },\r\n    sendSystemMessage: function (type, text) { post({ tt: 'system-message', text: String(text == null ? '' : text), type: type }); return Promise.resolve(); },\r\n    addOneMessage: function (message) {\r\n      return core.createChatMessages([{\r\n        role: message && message.is_user ? 'user' : 'assistant',\r\n        message: String(message && (message.mes || message.message) || ''),\r\n        name: message && message.name,\r\n      }]);\r\n    },\r\n    deleteLastMessage: function () { return core.deleteChatMessages([core.getLastMessageId()]); },\r\n    updateMessageBlock: function (id) { core.touchMessage(id); },\r\n    messageFormatting: function (message) { return textToHtml(applyRegexes(message, 2)); },\r\n    uuidv4: function () {\r\n      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) {\r\n        var value = (Math.random() * 16) | 0;\r\n        return (ch === 'x' ? value : (value & 0x3) | 0x8).toString(16);\r\n      });\r\n    },\r\n    humanizedDateTime: function () { return new Date().toLocaleString('zh-CN'); },\r\n    getTokenizerModel: function () { return 'dsh'; },\r\n    getTextTokens: function (type, text) { return Promise.resolve(Math.ceil(String(text || '').length / 3.2)); },\r\n    getTokenCountAsync: function (text) { return Promise.resolve(Math.ceil(String(text || '').length / 3.2)); },\r\n    substituteParams: function (text) { return core.substituteMacros(text); },\r\n    substituteParamsExtended: function (text) { return core.substituteMacros(text); },\r\n    renderExtensionTemplateAsync: function () { return Promise.resolve(''); },\r\n    getPresetManager: function () { return null; },\r\n    showLoader: function () {}, hideLoader: function () { return Promise.resolve(); },\r\n    isMobile: function () { return false; },\r\n    shouldSendOnEnter: function () { return true; },\r\n    timestampToMoment: function (value) { return new Date(value); },\r\n    executeSlashCommandsWithOptions: function (text) { return Promise.resolve({ pipe: core.slashCommand(text), isError: false, interrupt: false }); },\r\n    clearChat: function () { return core.deleteChatMessages(Array.from({ length: core.getLastMessageId() + 1 }, function (_, index) { return index; })); },\r\n    printMessages: function () { return Promise.resolve(); },\r\n    updateChatMetadata: function (values) { Object.assign(core.chatMetadata, values || {}); },\r\n    saveReply: function () { return Promise.resolve(); },\r\n    timestamp: function () { return Date.now(); },\r\n    ChatCompletionService: {},\r\n    TextCompletionService: {},\r\n    ConnectionManagerRequestService: {},\r\n    registerDataBankScraper: function () { return Promise.resolve(); },\r\n    getThumbnailUrl: function () { return ''; },\r\n    writeExtensionField: function () { return Promise.resolve(); },\r\n    unshallowCharacter: function () { return Promise.resolve(); },\r\n    getTextGenServer: function () { return ''; },\r\n    extractMessageFromData: function (data) { return String(data && data.content || ''); },\r\n  };\r\n  ST.getContext = function () {\r\n    var context = {};\r\n    Object.keys(ST).forEach(function (key) { context[key] = ST[key]; });\r\n    context.getContext = ST.getContext;\r\n    ['getVariables', 'replaceVariables', 'updateVariablesWith', 'insertOrAssignVariables', 'insertVariables',\r\n      'deleteVariable', 'getChatMessages', 'setChatMessages', 'createChatMessages', 'deleteChatMessages',\r\n      'rotateChatMessages', 'getLastMessageId', 'substitudeMacros', 'eventOn', 'eventOnce', 'eventEmit',\r\n      'eventEmitAndWait', 'eventRemoveListener', 'formatAsDisplayedMessage', 'retrieveDisplayedMessage',\r\n      'refreshOneMessage', 'triggerSlash', 'getLorebookEntries', 'getWorldbook', 'getWorldbookNames',\r\n      'getCharWorldbookNames', 'getCurrentCharPrimaryLorebook', 'getTavernHelperVersion', 'getTavernVersion',\r\n      'getScriptId', 'getButtonEvent', 'getMessageId', 'errorCatched', 'registerMacroLike'].forEach(function (key) {\r\n      context[key] = window[key];\r\n    });\r\n    return context;\r\n  };\r\n  Object.defineProperty(ST, 'chat', { get: function () { return core.chat; }, enumerable: true, configurable: true });\r\n  Object.defineProperty(ST, 'chatMetadata', { get: function () { return core.chatMetadata; }, enumerable: true, configurable: true });\r\n  Object.defineProperty(ST, 'extensionSettings', { get: function () { return core.extensionSettings; }, enumerable: true, configurable: true });\r\n  Object.defineProperty(ST, 'characters', { get: function () { return core.characters; }, enumerable: true, configurable: true });\r\n  Object.defineProperty(ST, 'chatCompletionSettings', { value: ST.chatCompletionSettings, writable: true, enumerable: true, configurable: true });\r\n  window.SillyTavern = ST;\r\n  window.getContext = ST.getContext;\r\n\r\n  // ── TavernHelper 对象 ─────────────────────────────────────\r\n  var TavernHelper = {};\r\n  ['playAudio', 'pauseAudio', 'getAudioList', 'replaceAudioList', 'appendAudioList', 'getAudioSettings',\r\n    'setAudioSettings', 'getCurrentAudio', 'getVariables', 'replaceVariables', 'updateVariablesWith',\r\n    'insertOrAssignVariables', 'insertVariables', 'deleteVariable', 'getChatMessages', 'setChatMessages',\r\n    'createChatMessages', 'deleteChatMessages', 'rotateChatMessages', 'getLastMessageId', 'substitudeMacros',\r\n    'eventOn', 'eventOnce', 'eventEmit', 'eventEmitAndWait', 'eventRemoveListener', 'eventMakeFirst',\r\n    'eventMakeLast', 'eventClearEvent', 'eventClearListener', 'eventClearAll', 'getTavernHelperVersion',\r\n    'getTavernHelperExtensionId', 'getTavernVersion', 'formatAsDisplayedMessage', 'retrieveDisplayedMessage',\r\n    'refreshOneMessage', 'triggerSlash', 'getLorebookEntries', 'getWorldbook', 'getWorldbookNames',\r\n    'getGlobalWorldbookNames', 'getCharWorldbookNames', 'getCurrentCharPrimaryLorebook', 'getCharLorebooks',\r\n    'getLorebooks', 'getLorebookSettings', 'getTavernRegexes', 'formatAsTavernRegexedString',\r\n    'isCharacterTavernRegexesEnabled', 'registerMacroLike', 'injectPrompts', 'uninjectPrompts', 'generate',\r\n    'generateRaw', 'getModelList', 'getProxyPresetNames', 'stopGenerationById', 'stopAllGeneration',\r\n    'getPresetNames', 'getLoadedPresetName', 'getPreset', 'loadPreset', 'getCharacterNames',\r\n    'getCharacterIds', 'getCurrentCharacterName', 'getCurrentCharacterId', 'getCharData', 'getCharAvatarPath',\r\n    'getChatHistoryBrief', 'getChatHistoryDetail', 'getPersonaNames', 'getPersonaIds', 'getCurrentPersonaName',\r\n    'getCurrentPersonaId', 'getPersonaAvatarPath', 'getMessageId', 'errorCatched', 'getScriptId',\r\n    'getButtonEvent', 'getAllEnabledScriptButtons', 'initializeGlobal', 'waitGlobalInitialized', 'builtin',\r\n    'isAdmin', 'getExtensionType', 'getExtensionStatus', 'isInstalledExtension', 'builtin_prompt_default_order',\r\n    'default_preset', 'RawCharacter'].forEach(function (key) {\r\n    if (window[key] !== undefined) TavernHelper[key] = window[key];\r\n  });\r\n  TavernHelper.builtin_prompt_default_order = [];\r\n  TavernHelper.default_preset = null;\r\n  TavernHelper.RawCharacter = { from: function () { throw new Error('DSH TH 宿主：RawCharacter 未实现'); } };\r\n  window.TavernHelper = TavernHelper;\r\n\r\n  // ── 脚本执行 ──────────────────────────────────────────────\r\n  var currentScript = null;\r\n  var scriptErrors = [];\r\n  var helperRoot = document.createElement('div');\r\n  helperRoot.id = 'tavern_helper';\r\n  helperRoot.style.display = 'none';\r\n  document.body.appendChild(helperRoot);\r\n\r\n  function scriptError(script, error) {\r\n    var text = String(error && (error.stack || error.message) || error);\r\n    scriptErrors.push({ id: script && script.id, name: script && script.name, error: text });\r\n    log('error', '脚本「' + (script && script.name ? script.name : '?') + '」出错：' + text.slice(0, 800));\r\n  }\r\n\r\n  window.addEventListener('error', function (event) {\r\n    if (event && event.message) {\r\n      scriptError(currentScript, event.error || event.message);\r\n    }\r\n  });\r\n  window.addEventListener('unhandledrejection', function (event) {\r\n    scriptError(currentScript, event.reason);\r\n  });\r\n\r\n  function classifyModule(content) {\r\n    var trimmed = String(content || '').replace(/^\\s*(?:\\/\\*[\\s\\S]*?\\*\\/\\s*|\\/\\/[^\\n]*\\n\\s*)*/, '');\r\n    return /^(?:import|export)\\s/.test(trimmed);\r\n  }\r\n\r\n  /** 在脚本启动瞬间让它看到「只有自己」的 #tavern_helper，复刻 TH 的每脚本 iframe 语义。 */\r\n  function markCurrentScript(script) {\r\n    helperRoot.innerHTML = '';\r\n    var marker = document.createElement('div');\r\n    marker.setAttribute('data-script-id', String(script.id || ''));\r\n    helperRoot.appendChild(marker);\r\n  }\r\n\r\n  function runScript(script) {\r\n    return new Promise(function (resolve) {\r\n      if (!script || !script.content) { resolve(); return; }\r\n      currentScript = script;\r\n      core.makeScriptContext(script.id, -1);\r\n      markCurrentScript(script);\r\n      var element = document.createElement('script');\r\n      var isModule = classifyModule(script.content);\r\n      if (isModule) element.type = 'module';\r\n      element.setAttribute('data-tt-script', String(script.id || ''));\r\n      element.textContent = String(script.content);\r\n      var settled = false;\r\n      var finish = function () {\r\n        if (settled) return;\r\n        settled = true;\r\n        currentScript = null;\r\n        resolve();\r\n      };\r\n      element.onerror = function () {\r\n        scriptError(script, '脚本加载失败（可能是 import 网络错误或语法错误）');\r\n        finish();\r\n      };\r\n      element.onload = function () { finish(); };\r\n      document.body.appendChild(element);\r\n      log('info', '执行脚本「' + (script.name || script.id) + '」' + (isModule ? '（module）' : ''));\r\n      // 内联 classic 脚本同步执行；module 脚本要等 import 完成。给一个安全上限。\r\n      setTimeout(finish, isModule ? 20000 : 0);\r\n    });\r\n  }\r\n\r\n  async function runScripts() {\r\n    var scripts = Array.isArray(INIT.scripts) ? INIT.scripts : [];\r\n    for (var i = 0; i < scripts.length; i += 1) {\r\n      await runScript(scripts[i]);\r\n    }\r\n    currentScript = null;\r\n    // 脚本可能异步注册监听；稍后补发一次就绪事件。\r\n    setTimeout(function () {\r\n      try {\r\n        core.bus.emit(TAVERN_EVENTS.CHAT_CHANGED, core.chatId);\r\n        core.bus.emit(TAVERN_EVENTS.APP_READY);\r\n        core.bus.emit(TAVERN_EVENTS.SETTINGS_LOADED);\r\n        core.bus.emit(TAVERN_EVENTS.EXTENSIONS_FIRST_LOAD);\r\n        // 让 MVU 在玩家发出第一条消息之前就完成 [InitVar] 初始化。\r\n        if (core.getLastMessageId() >= 0) {\r\n          core.bus.emit(TAVERN_EVENTS.GENERATION_STARTED, 'dsh-tt-init', {}, false);\r\n        }\r\n      } catch (error) { scriptError(null, error); }\r\n      post({ tt: 'ready', scripts: scripts.map(function (item) { return { id: item.id, name: item.name }; }), module: scripts.some(function (item) { return classifyModule(item.content); }), errors: scriptErrors.length });\r\n    }, 800);\r\n  }\r\n\r\n  // ── 父窗口 → iframe ──────────────────────────────────────\r\n  window.addEventListener('message', function (event) {\r\n    if (event.source !== window.parent) return;\r\n    var data = event.data;\r\n    if (!data || data.__ttParent !== true) return;\r\n    try {\r\n      switch (data.type) {\r\n        case 'chat':\r\n          core.applyChat(data.messages || [], { emitAdded: data.emitAdded !== false });\r\n          break;\r\n        case 'emit':\r\n          core.bus.emit.apply(core.bus, [data.event].concat(data.args || []));\r\n          break;\r\n        case 'popup-result': {\r\n          var resolve = popupPending.get(data.id);\r\n          if (resolve) {\r\n            popupPending.delete(data.id);\r\n            resolve(data.result);\r\n          }\r\n          break;\r\n        }\r\n        case 'settings':\r\n          Object.keys(core.extensionSettings).forEach(function (key) { delete core.extensionSettings[key]; });\r\n          Object.assign(core.extensionSettings, data.value || {});\r\n          break;\r\n        case 'refresh':\r\n          post({ tt: 'chat-reload' });\r\n          break;\r\n        case 'dispose':\r\n          core.bus.clearAll();\r\n          break;\r\n        default:\r\n          break;\r\n      }\r\n    } catch (error) {\r\n      scriptError(null, error);\r\n    }\r\n  });\r\n\r\n  post({ tt: 'boot', chatId: core.chatId, charName: core.charName, scriptCount: (INIT.scripts || []).length });\r\n  runScripts();\r\n})();\r\n";
    const TT_LIB_SRC = "// 由 tools/bundle-lib.mjs 生成：Host 提示词管线的同构副本（面板预览用）。\n// 同一份源码在 Host 与浏览器里各跑一次，预览与实际请求不会漂移。\nvar TT_LIB = (function () {\n  'use strict';\n  var registry = Object.create(null);\n  var cache = Object.create(null);\n  function define(name, factory) { registry[name] = factory; }\n  function __require(name) {\n    if (cache[name]) return cache[name];\n    var factory = registry[name];\n    if (!factory) throw new Error('dsh-tt lib: unknown module \"' + name + '\"');\n    cache[name] = factory(__require);\n    return cache[name];\n  }\n\n  define('ejs', function (__require) {\n// EJS 子集 + ST-Prompt-Template 兼容作用域。\r\n//\r\n// 语法：<% %> / <%= %>（HTML 转义）/ <%- %>（原样）/ <%# %>（注释）\r\n// 兼容 EJS 的 trim 标记：-%> 与 _%> 吃掉紧随其后的换行；<%_ 吃掉前面的空白。\r\n//\r\n// 安全性：模板来自用户自己的角色卡/预设，等价于 TH 脚本的可信级别；这里在 Host\r\n// 进程内执行，只暴露白名单函数（getvar/setvar/getwi/getchar/_/faker 等），不提供\r\n// require/process/fs。\r\n\r\nconst TAG_OPEN = '<%';\r\n\r\nconst ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' };\r\n\r\nfunction escapeHtml(value) {\r\n  return String(value ?? '').replace(/[&<>\"']/g, (ch) => ESCAPE_MAP[ch]);\r\n}\r\n\r\nfunction unescapeHtml(value) {\r\n  return String(value ?? '')\r\n    .replace(/&lt;/g, '<')\r\n    .replace(/&gt;/g, '>')\r\n    .replace(/&quot;/g, '\"')\r\n    .replace(/&#39;/g, \"'\")\r\n    .replace(/&amp;/g, '&');\r\n}\r\n\r\n/** 把 `a.b[0].c` 拆成路径数组；数组直接返回。 */\r\nfunction toPath(path) {\r\n  if (Array.isArray(path)) return path;\r\n  if (path == null) return [];\r\n  return String(path)\r\n    .replace(/\\[(\\d+)\\]/g, '.$1')\r\n    .replace(/\\[[\"']([^\"']+)[\"']\\]/g, '.$1')\r\n    .split('.')\r\n    .filter((part) => part !== '');\r\n}\r\n\r\nfunction own(obj, key) {\r\n  return obj != null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);\r\n}\r\n\r\n/** 读取嵌套路径；路径不存在时返回 fallback。 */\r\nfunction getPath(object, path, fallback) {\r\n  if (object == null) return fallback;\r\n  const parts = toPath(path);\r\n  if (!parts.length) return object;\r\n  let current = object;\r\n  for (const part of parts) {\r\n    if (current == null) return fallback;\r\n    current = current[part];\r\n  }\r\n  return current === undefined ? fallback : current;\r\n}\r\n\r\n/** 按点路径写值；中间对象不存在时创建。 */\r\nfunction setPath(object, path, value) {\r\n  const parts = toPath(path);\r\n  if (!parts.length) return object;\r\n  let current = object;\r\n  for (let i = 0; i < parts.length - 1; i += 1) {\r\n    const part = parts[i];\r\n    if (current[part] == null || typeof current[part] !== 'object') current[part] = {};\r\n    current = current[part];\r\n  }\r\n  current[parts[parts.length - 1]] = value;\r\n  return object;\r\n}\r\n\r\nfunction hasPath(object, path) {\r\n  if (object == null) return false;\r\n  const parts = toPath(path);\r\n  if (!parts.length) return false;\r\n  let current = object;\r\n  for (const part of parts) {\r\n    if (!own(current, part)) return false;\r\n    current = current[part];\r\n  }\r\n  return true;\r\n}\r\n\r\nfunction deletePath(object, path) {\r\n  const parts = toPath(path);\r\n  if (!parts.length || object == null) return false;\r\n  let current = object;\r\n  for (let i = 0; i < parts.length - 1; i += 1) {\r\n    if (!own(current, parts[i])) return false;\r\n    current = current[parts[i]];\r\n  }\r\n  return delete current[parts[parts.length - 1]];\r\n}\r\n\r\nfunction isPlainObject(value) {\r\n  if (value == null || typeof value !== 'object') return false;\r\n  const proto = Object.getPrototypeOf(value);\r\n  return proto === Object.prototype || proto === null;\r\n}\r\n\r\nfunction deepClone(value) {\r\n  if (value == null || typeof value !== 'object') return value;\r\n  try { return structuredClone(value); } catch { /* fall through */ }\r\n  try { return JSON.parse(JSON.stringify(value)); } catch { return value; }\r\n}\r\n\r\nfunction deepEqual(a, b) {\r\n  if (a === b) return true;\r\n  if (typeof a !== typeof b) return false;\r\n  if (a == null || b == null) return a === b;\r\n  if (Array.isArray(a) !== Array.isArray(b)) return false;\r\n  if (typeof a !== 'object') return false;\r\n  if (Array.isArray(a)) {\r\n    if (a.length !== b.length) return false;\r\n    return a.every((item, index) => deepEqual(item, b[index]));\r\n  }\r\n  const keysA = Object.keys(a);\r\n  const keysB = Object.keys(b);\r\n  if (keysA.length !== keysB.length) return false;\r\n  return keysA.every((key) => own(b, key) && deepEqual(a[key], b[key]));\r\n}\r\n\r\nfunction propertyIteratee(source) {\r\n  if (source == null) return (value) => value;\r\n  if (typeof source === 'function') return source;\r\n  if (typeof source === 'string' || typeof source === 'number') {\r\n    return (value) => getPath(value, source);\r\n  }\r\n  if (Array.isArray(source)) {\r\n    const [path, expected] = source;\r\n    return (value) => deepEqual(getPath(value, path), expected);\r\n  }\r\n  if (typeof source === 'object') {\r\n    return (value) => Object.keys(source).every((key) => deepEqual(getPath(value, key), source[key]));\r\n  }\r\n  return (value) => value;\r\n}\r\n\r\nfunction toNumber(value, fallback = 0) {\r\n  if (typeof value === 'number' && Number.isFinite(value)) return value;\r\n  const parsed = parseFloat(value);\r\n  return Number.isFinite(parsed) ? parsed : fallback;\r\n}\r\n\r\nfunction randomInt(min, max) {\r\n  return min + Math.floor(Math.random() * (max - min + 1));\r\n}\r\n\r\nfunction splitWords(text) {\r\n  return String(text ?? '')\r\n    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')\r\n    .replace(/[^\\p{L}\\p{N}]+/gu, ' ')\r\n    .trim()\r\n    .split(/\\s+/)\r\n    .filter(Boolean);\r\n}\r\n\r\nfunction chainable(value) {\r\n  const wrapper = {\r\n    value: () => value,\r\n    valueOf: () => value,\r\n    toString: () => String(value),\r\n    map: (fn) => chainable([...value].map(propertyIteratee(fn))),\r\n    filter: (fn) => chainable([...value].filter(propertyIteratee(fn))),\r\n    sortBy: (fn) => chainable([...value].sort((a, b) => {\r\n      const pa = propertyIteratee(fn)(a);\r\n      const pb = propertyIteratee(fn)(b);\r\n      return pa < pb ? -1 : pa > pb ? 1 : 0;\r\n    })),\r\n    uniq: () => chainable([...new Set(value)]),\r\n    first: () => value?.[0],\r\n    last: () => value?.[value.length - 1],\r\n    size: () => value?.length ?? Object.keys(value ?? {}).length,\r\n  };\r\n  return wrapper;\r\n}\r\n\r\n/** 紧凑版 lodash；覆盖角色卡 EJS 里常见的集合/字符串工具。 */\r\nfunction createLodash() {\r\n  const _ = {\r\n    get: getPath,\r\n    set: setPath,\r\n    has: hasPath,\r\n    unset: deletePath,\r\n    update(object, path, updater) {\r\n      const current = getPath(object, path);\r\n      const next = typeof updater === 'function' ? updater(current) : updater;\r\n      setPath(object, path, next);\r\n      return object;\r\n    },\r\n    result(object, path, fallback) {\r\n      const value = getPath(object, path, fallback);\r\n      return typeof value === 'function' ? value.call(object) : value;\r\n    },\r\n    isEqual: deepEqual,\r\n    isMatch: (object, source) => propertyIteratee(source)(object),\r\n    isNil: (value) => value == null,\r\n    isNull: (value) => value === null,\r\n    isUndefined: (value) => value === undefined,\r\n    isArray: Array.isArray,\r\n    isString: (value) => typeof value === 'string',\r\n    isNumber: (value) => typeof value === 'number',\r\n    isBoolean: (value) => typeof value === 'boolean',\r\n    isFunction: (value) => typeof value === 'function',\r\n    isObject: (value) => value != null && (typeof value === 'object' || typeof value === 'function'),\r\n    isPlainObject,\r\n    isDate: (value) => value instanceof Date,\r\n    isInteger: Number.isInteger,\r\n    isFinite: Number.isFinite,\r\n    isEmpty(value) {\r\n      if (value == null) return true;\r\n      if (typeof value === 'string' || Array.isArray(value)) return value.length === 0;\r\n      if (value instanceof Map || value instanceof Set) return value.size === 0;\r\n      if (typeof value === 'object') return Object.keys(value).length === 0;\r\n      return true;\r\n    },\r\n    clone: deepClone,\r\n    cloneDeep: deepClone,\r\n    toNumber: (value) => toNumber(value),\r\n    toInteger: (value) => Math.trunc(toNumber(value)),\r\n    toString: (value) => (value == null ? '' : String(value)),\r\n    defaultTo: (value, fallback) => (value == null || Number.isNaN(value) ? fallback : value),\r\n    clamp: (value, lower, upper) => Math.min(Math.max(toNumber(value), lower), upper),\r\n    round: (value, precision = 0) => {\r\n      const factor = 10 ** precision;\r\n      return Math.round(toNumber(value) * factor) / factor;\r\n    },\r\n    floor: (value) => Math.floor(toNumber(value)),\r\n    ceil: (value) => Math.ceil(toNumber(value)),\r\n    abs: (value) => Math.abs(toNumber(value)),\r\n    min: (list) => Math.min(...(Array.isArray(list) ? list.map((v) => toNumber(v)) : [])),\r\n    max: (list) => Math.max(...(Array.isArray(list) ? list.map((v) => toNumber(v)) : [])),\r\n    sum: (list) => (Array.isArray(list) ? list.reduce((n, v) => n + toNumber(v), 0) : 0),\r\n    sumBy: (list, fn) => (Array.isArray(list) ? list.reduce((n, v) => n + toNumber(propertyIteratee(fn)(v)), 0) : 0),\r\n    mean: (list) => (Array.isArray(list) && list.length ? list.reduce((n, v) => n + toNumber(v), 0) / list.length : 0),\r\n    maxBy: (list, fn) => (Array.isArray(list) && list.length\r\n      ? list.reduce((best, item) => (propertyIteratee(fn)(item) > propertyIteratee(fn)(best) ? item : best))\r\n      : undefined),\r\n    minBy: (list, fn) => (Array.isArray(list) && list.length\r\n      ? list.reduce((best, item) => (propertyIteratee(fn)(item) < propertyIteratee(fn)(best) ? item : best))\r\n      : undefined),\r\n    random(lower = 0, upper = 1, floating = false) {\r\n      if (typeof lower === 'boolean') return Math.random() < 0.5;\r\n      if (Array.isArray(lower)) return lower[randomInt(0, lower.length - 1)];\r\n      if (typeof upper === 'boolean') { floating = upper; upper = 1; }\r\n      if (!floating && Number.isInteger(lower) && Number.isInteger(upper)) return randomInt(lower, upper);\r\n      return lower + Math.random() * (upper - lower);\r\n    },\r\n    sample: (list) => (Array.isArray(list) && list.length ? list[randomInt(0, list.length - 1)] : undefined),\r\n    sampleSize(list, count = 1) {\r\n      if (!Array.isArray(list)) return [];\r\n      const copy = [...list];\r\n      const out = [];\r\n      for (let i = 0; i < Math.min(count, copy.length); i += 1) out.push(copy.splice(randomInt(0, copy.length - 1), 1)[0]);\r\n      return out;\r\n    },\r\n    shuffle: (list) => (Array.isArray(list) ? _.sampleSize(list, list.length) : []),\r\n    times(count, fn) {\r\n      const out = [];\r\n      for (let i = 0; i < count; i += 1) out.push(typeof fn === 'function' ? fn(i) : fn);\r\n      return out;\r\n    },\r\n    range(start, end, step = 1) {\r\n      let from = start;\r\n      let to = end;\r\n      if (to === undefined) { to = from; from = 0; }\r\n      const out = [];\r\n      if (step === 0) return out;\r\n      if (step > 0) for (let i = from; i < to; i += step) out.push(i);\r\n      else for (let i = from; i > to; i += step) out.push(i);\r\n      return out;\r\n    },\r\n    uniqueId: (() => { let id = 0; return (prefix = '') => { id += 1; return `${prefix}${id}`; }; })(),\r\n    escape: escapeHtml,\r\n    unescape: unescapeHtml,\r\n    truncate(text, options = {}) {\r\n      const source = String(text ?? '');\r\n      const length = options.length ?? 30;\r\n      const omission = options.omission ?? '...';\r\n      return source.length > length ? `${source.slice(0, Math.max(0, length - omission.length))}${omission}` : source;\r\n    },\r\n    pad: (text, length, chars = ' ') => String(text ?? '').padStart(length, chars),\r\n    padStart: (text, length, chars = ' ') => String(text ?? '').padStart(length, chars),\r\n    padEnd: (text, length, chars = ' ') => String(text ?? '').padEnd(length, chars),\r\n    repeat: (text, count = 1) => String(text ?? '').repeat(Math.max(0, count)),\r\n    trim: (text, chars) => (chars ? String(text ?? '').replace(new RegExp(`^[${chars}]+|[${chars}]+$`, 'g'), '') : String(text ?? '').trim()),\r\n    upperFirst: (text) => { const s = String(text ?? ''); return s ? s[0].toUpperCase() + s.slice(1) : s; },\r\n    lowerFirst: (text) => { const s = String(text ?? ''); return s ? s[0].toLowerCase() + s.slice(1) : s; },\r\n    capitalize: (text) => { const s = String(text ?? '').toLowerCase(); return s ? s[0].toUpperCase() + s.slice(1) : s; },\r\n    camelCase: (text) => splitWords(text).map((word, index) => (index === 0 ? word.toLowerCase() : _.upperFirst(word.toLowerCase()))).join(''),\r\n    kebabCase: (text) => splitWords(text).map((word) => word.toLowerCase()).join('-'),\r\n    snakeCase: (text) => splitWords(text).map((word) => word.toLowerCase()).join('_'),\r\n    startCase: (text) => splitWords(text).map((word) => _.upperFirst(word.toLowerCase())).join(' '),\r\n    lowerCase: (text) => String(text ?? '').toLowerCase(),\r\n    upperCase: (text) => String(text ?? '').toUpperCase(),\r\n    words: (text) => splitWords(text),\r\n    split: (text, separator) => String(text ?? '').split(separator),\r\n    join: (list, separator = ',') => (Array.isArray(list) ? list.join(separator) : ''),\r\n    includes: (collection, value) => (typeof collection === 'string' ? collection.includes(value) : Array.isArray(collection) ? collection.includes(value) : false),\r\n    startsWith: (text, target) => String(text ?? '').startsWith(target),\r\n    endsWith: (text, target) => String(text ?? '').endsWith(target),\r\n    replace: (text, pattern, replacement) => String(text ?? '').replace(pattern, replacement),\r\n    slice: (list, start, end) => (typeof list === 'string' || Array.isArray(list) ? list.slice(start, end) : []),\r\n    head: (list) => list?.[0],\r\n    first: (list) => list?.[0],\r\n    last: (list) => list?.[list.length - 1],\r\n    nth: (list, index = 0) => (index < 0 ? list?.[list.length + index] : list?.[index]),\r\n    take: (list, count = 1) => (Array.isArray(list) ? list.slice(0, count) : []),\r\n    drop: (list, count = 1) => (Array.isArray(list) ? list.slice(count) : []),\r\n    compact: (list) => (Array.isArray(list) ? list.filter(Boolean) : []),\r\n    chunk: (list, size = 1) => {\r\n      const out = [];\r\n      for (let i = 0; i < (list?.length ?? 0); i += size) out.push(list.slice(i, i + size));\r\n      return out;\r\n    },\r\n    flatten: (list) => (Array.isArray(list) ? list.flat() : []),\r\n    flattenDeep: (list) => (Array.isArray(list) ? list.flat(Infinity) : []),\r\n    uniq: (list) => (Array.isArray(list) ? [...new Set(list)] : []),\r\n    union: (...lists) => [...new Set(lists.flat())],\r\n    difference: (list, ...others) => (Array.isArray(list) ? list.filter((item) => !others.flat().some((other) => deepEqual(item, other))) : []),\r\n    intersection: (list, ...others) => (Array.isArray(list) ? list.filter((item) => others.every((other) => (other || []).some((entry) => deepEqual(item, entry)))) : []),\r\n    zip: (...lists) => (lists[0] || []).map((_, index) => lists.map((list) => list?.[index])),\r\n    fromPairs: (pairs) => Object.fromEntries(pairs || []),\r\n    toPairs: (object) => Object.entries(object || {}),\r\n    keys: (object) => Object.keys(object || {}),\r\n    values: (object) => Object.values(object || {}),\r\n    map: (collection, fn) => (Array.isArray(collection) ? collection.map(propertyIteratee(fn)) : Object.values(collection || {}).map(propertyIteratee(fn))),\r\n    filter: (collection, fn) => (Array.isArray(collection) ? collection.filter(propertyIteratee(fn)) : Object.values(collection || {}).filter(propertyIteratee(fn))),\r\n    reject: (collection, fn) => (Array.isArray(collection) ? collection.filter((item) => !propertyIteratee(fn)(item)) : []),\r\n    find: (collection, fn) => (Array.isArray(collection) ? collection.find(propertyIteratee(fn)) : Object.values(collection || {}).find(propertyIteratee(fn))),\r\n    findIndex: (collection, fn) => (Array.isArray(collection) ? collection.findIndex(propertyIteratee(fn)) : -1),\r\n    some: (collection, fn) => (Array.isArray(collection) ? collection.some(propertyIteratee(fn)) : Object.values(collection || {}).some(propertyIteratee(fn))),\r\n    every: (collection, fn) => (Array.isArray(collection) ? collection.every(propertyIteratee(fn)) : Object.values(collection || {}).every(propertyIteratee(fn))),\r\n    forEach(collection, fn) {\r\n      if (Array.isArray(collection)) collection.forEach(fn);\r\n      else Object.entries(collection || {}).forEach(([key, value]) => fn(value, key, collection));\r\n      return collection;\r\n    },\r\n    each(collection, fn) { return _.forEach(collection, fn); },\r\n    reduce: (collection, fn, initial) => (Array.isArray(collection) ? collection.reduce(fn, initial) : Object.values(collection || {}).reduce(fn, initial)),\r\n    groupBy(collection, fn) {\r\n      const keyed = propertyIteratee(fn);\r\n      const out = {};\r\n      for (const item of Array.isArray(collection) ? collection : Object.values(collection || {})) {\r\n        const key = keyed(item);\r\n        (out[key] ??= []).push(item);\r\n      }\r\n      return out;\r\n    },\r\n    keyBy(collection, fn) {\r\n      const keyed = propertyIteratee(fn);\r\n      const out = {};\r\n      for (const item of Array.isArray(collection) ? collection : Object.values(collection || {})) out[keyed(item)] = item;\r\n      return out;\r\n    },\r\n    countBy(collection, fn) {\r\n      const keyed = propertyIteratee(fn);\r\n      const out = {};\r\n      for (const item of Array.isArray(collection) ? collection : Object.values(collection || {})) {\r\n        const key = keyed(item);\r\n        out[key] = (out[key] ?? 0) + 1;\r\n      }\r\n      return out;\r\n    },\r\n    sortBy(collection, ...fns) {\r\n      const keyed = fns.map(propertyIteratee);\r\n      return [...(collection || [])].sort((a, b) => {\r\n        for (const fn of keyed) {\r\n          const va = fn(a);\r\n          const vb = fn(b);\r\n          if (va < vb) return -1;\r\n          if (va > vb) return 1;\r\n        }\r\n        return 0;\r\n      });\r\n    },\r\n    orderBy(collection, fns, orders) {\r\n      const list = Array.isArray(fns) ? fns : [fns];\r\n      const dirs = Array.isArray(orders) ? orders : [orders];\r\n      const keyed = list.map(propertyIteratee);\r\n      return [...(collection || [])].sort((a, b) => {\r\n        for (let i = 0; i < keyed.length; i += 1) {\r\n          const va = keyed[i](a);\r\n          const vb = keyed[i](b);\r\n          if (va === vb) continue;\r\n          const direction = dirs[i] === 'desc' ? -1 : 1;\r\n          return (va < vb ? -1 : 1) * direction;\r\n        }\r\n        return 0;\r\n      });\r\n    },\r\n    mapValues(object, fn) {\r\n      const out = {};\r\n      for (const [key, value] of Object.entries(object || {})) out[key] = propertyIteratee(fn)(value, key);\r\n      return out;\r\n    },\r\n    pick(object, ...paths) {\r\n      const out = {};\r\n      for (const path of paths.flat()) if (hasPath(object, path)) setPath(out, path, deepClone(getPath(object, path)));\r\n      return out;\r\n    },\r\n    omit(object, ...paths) {\r\n      const out = deepClone(object) || {};\r\n      for (const path of paths.flat()) deletePath(out, path);\r\n      return out;\r\n    },\r\n    assign: (...objects) => Object.assign({}, ...objects),\r\n    defaults: (object, ...sources) => Object.assign({}, ...[...sources].reverse(), object),\r\n    merge(target, ...sources) {\r\n      const apply = (destination, source) => {\r\n        for (const [key, value] of Object.entries(source || {})) {\r\n          if (isPlainObject(value) && isPlainObject(destination[key])) apply(destination[key], value);\r\n          else destination[key] = deepClone(value);\r\n        }\r\n        return destination;\r\n      };\r\n      return sources.reduce((acc, source) => apply(acc, source), target || {});\r\n    },\r\n    mergeWith(target, source, customizer) {\r\n      for (const [key, value] of Object.entries(source || {})) {\r\n        const result = customizer?.(target[key], value, key);\r\n        target[key] = result === undefined ? deepClone(value) : result;\r\n      }\r\n      return target;\r\n    },\r\n    debounce(fn) {\r\n      let timer = null;\r\n      const wrapped = (...args) => {\r\n        if (timer) clearTimeout(timer);\r\n        timer = setTimeout(() => { timer = null; fn(...args); }, 0);\r\n      };\r\n      wrapped.cancel = () => { if (timer) clearTimeout(timer); timer = null; };\r\n      wrapped.flush = () => {};\r\n      return wrapped;\r\n    },\r\n    throttle(fn) {\r\n      let last = 0;\r\n      const wrapped = (...args) => {\r\n        const now = Date.now();\r\n        if (now - last >= 16) { last = now; return fn(...args); }\r\n        return undefined;\r\n      };\r\n      wrapped.cancel = () => {};\r\n      return wrapped;\r\n    },\r\n    once(fn) {\r\n      let called = false;\r\n      let result;\r\n      return (...args) => {\r\n        if (!called) { called = true; result = fn(...args); }\r\n        return result;\r\n      };\r\n    },\r\n    identity: (value) => value,\r\n    noop: () => undefined,\r\n    stubTrue: () => true,\r\n    stubFalse: () => false,\r\n    constant: (value) => () => value,\r\n    chain: (value) => chainable(value),\r\n  };\r\n  return _;\r\n}\r\n\r\nconst FAKE_FIRST = ['林', '苏', '顾', '沈', '陆', '叶', '白', '江', '温', '许', '黎', '程', '秦', '夏', '唐'];\r\nconst FAKE_LAST = ['清和', '雨眠', '知夏', '书言', '念', '昭', '岚', '舟', '遥', '星野', '静姝', '之遥'];\r\nconst FAKE_WORDS = ['月色', '晚风', '旧梦', '青石', '烟火', '细雨', '远方', '灯火', '长街', '故人', '山海', '浮光'];\r\n\r\n/** 极简 faker：ST-Prompt-Template 里替一些卡生成随机内容。 */\r\nfunction createFaker(random = Math.random) {\r\n  const pick = (list) => list[Math.floor(random() * list.length)];\r\n  const int = (min = 0, max = 100) => min + Math.floor(random() * (max - min + 1));\r\n  const float = (options = {}) => {\r\n    const min = options.min ?? 0;\r\n    const max = options.max ?? 1;\r\n    const precision = options.precision ?? 2;\r\n    const factor = 10 ** precision;\r\n    return Math.round((min + random() * (max - min)) * factor) / factor;\r\n  };\r\n  const words = (count = 3) => Array.from({ length: count }, () => pick(FAKE_WORDS));\r\n  const sentence = () => `${words(int(3, 6)).join('')}。`;\r\n  const paragraph = () => Array.from({ length: int(2, 4) }, () => sentence()).join('');\r\n  const name = () => pick(FAKE_FIRST) + pick(FAKE_LAST);\r\n  const faker = {\r\n    name,\r\n    firstName: () => pick(FAKE_FIRST),\r\n    lastName: () => pick(FAKE_LAST),\r\n    fullName: name,\r\n    word: () => pick(FAKE_WORDS),\r\n    words,\r\n    sentence,\r\n    sentences: (count = 2) => Array.from({ length: count }, () => sentence()).join(''),\r\n    paragraph,\r\n    paragraphs: (count = 2) => Array.from({ length: count }, () => paragraph()).join('\\n\\n'),\r\n    lorem: { words, sentence, sentences: (count = 2) => Array.from({ length: count }, () => sentence()).join(''), paragraph },\r\n    number: int,\r\n    int,\r\n    float,\r\n    boolean: () => random() < 0.5,\r\n    date: { past: () => new Date(Date.now() - int(1, 365) * 86400000), future: () => new Date(Date.now() + int(1, 365) * 86400000), recent: () => new Date(Date.now() - int(1, 24) * 3600000) },\r\n    time: () => `${String(int(0, 23)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}`,\r\n    uuid: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {\r\n      const value = (random() * 16) | 0;\r\n      return (ch === 'x' ? value : (value & 0x3) | 0x8).toString(16);\r\n    }),\r\n    pick,\r\n    helpers: { arrayElement: pick },\r\n    location: { city: () => `${pick(['临安', '云梦', '青川', '白露', '望舒', '南屿'])}市`, country: () => '夏越国' },\r\n    internet: { email: () => `${words(1)[0]}@example.com`, userName: () => `user_${int(1000, 9999)}` },\r\n    company: { name: () => `${pick(FAKE_WORDS)}${pick(['堂', '阁', '社', '馆'])}` },\r\n  };\r\n  return faker;\r\n}\r\n\r\n/**\r\n * 建立 EJS 作用域。变量按引用共享，setvar 会写回 variables。\r\n * @param {Record<string, unknown>} variables\r\n * @param {{ getwi?: (name: string) => string, getchar?: (name: string) => string, resolve?: (name: string) => unknown, card?: object }} helpers\r\n */\r\nfunction createEjsScope(variables = {}, helpers = {}) {\r\n  const store = variables && typeof variables === 'object' ? variables : {};\r\n\r\n  function exact(name) {\r\n    return own(store, name) ? store[name] : undefined;\r\n  }\r\n\r\n  function lookup(name) {\r\n    const key = String(name ?? '');\r\n    const direct = exact(key);\r\n    if (direct !== undefined) return direct;\r\n    if (hasPath(store, key)) return getPath(store, key);\r\n    const stat = store.stat_data;\r\n    if (stat && typeof stat === 'object') {\r\n      if (hasPath(stat, key)) return getPath(stat, key);\r\n      if (key.startsWith('stat_data.')) {\r\n        const inner = key.slice('stat_data.'.length);\r\n        if (hasPath(stat, inner)) return getPath(stat, inner);\r\n      }\r\n    }\r\n    return undefined;\r\n  }\r\n\r\n  function write(name, value) {\r\n    const key = String(name ?? '');\r\n    if (!key) return value;\r\n    if (key.includes('.') && !own(store, key)) {\r\n      const root = key.split('.')[0];\r\n      if (store[root] != null && typeof store[root] === 'object') {\r\n        setPath(store, key, value);\r\n        return value;\r\n      }\r\n    }\r\n    store[key] = value;\r\n    return value;\r\n  }\r\n\r\n  function readState() {\r\n    const stat = store.stat_data && typeof store.stat_data === 'object' ? store.stat_data : {};\r\n    return { ...store, ...stat, stat_data: stat };\r\n  }\r\n\r\n  const lodash = createLodash();\r\n  const faker = createFaker();\r\n\r\n  const scope = {\r\n    getvar(name, options = {}) {\r\n      const value = lookup(name);\r\n      if (value !== undefined) return value;\r\n      if (helpers.resolve) {\r\n        const resolved = helpers.resolve(String(name ?? ''));\r\n        if (resolved !== undefined) return resolved;\r\n      }\r\n      if (options && Object.prototype.hasOwnProperty.call(options, 'defaults')) return options.defaults;\r\n      return undefined;\r\n    },\r\n    setvar(name, value) { return write(name, value); },\r\n    incvar(name, delta = 1) {\r\n      const next = toNumber(lookup(name), 0) + toNumber(delta, 0);\r\n      write(name, next);\r\n      return next;\r\n    },\r\n    decvar(name, delta = 1) { return scope.incvar(name, -toNumber(delta, 0)); },\r\n    delvar(name) {\r\n      const key = String(name ?? '');\r\n      if (own(store, key)) { delete store[key]; return ''; }\r\n      deletePath(store, key);\r\n      return '';\r\n    },\r\n    getwi(name) {\r\n      return helpers.getwi ? helpers.getwi(String(name ?? '')) : '';\r\n    },\r\n    getchar(name) {\r\n      return helpers.getchar ? helpers.getchar(String(name ?? '')) : '';\r\n    },\r\n    print(...args) { return args.map((value) => (value == null ? '' : String(value))).join(''); },\r\n    readState,\r\n    variables: store,\r\n    _: lodash,\r\n    lodash,\r\n    faker,\r\n  };\r\n  // 世界书 @@if 装饰器直接引用 stat_data / v；用 getter 暴露同一份变量。\r\n  Object.defineProperty(scope, 'stat_data', {\r\n    get() { return store.stat_data && typeof store.stat_data === 'object' ? store.stat_data : {}; },\r\n    enumerable: true,\r\n    configurable: true,\r\n  });\r\n  Object.defineProperty(scope, 'v', {\r\n    get() { return store; },\r\n    enumerable: true,\r\n    configurable: true,\r\n  });\r\n  return scope;\r\n}\r\n\r\nconst TEMPLATE_CACHE = new Map();\r\nconst TEMPLATE_CACHE_LIMIT = 400;\r\n\r\nfunction stripTags(source) {\r\n  return String(source ?? '').replace(/<%[\\s\\S]*?%>/g, '').replace(/<%[\\s\\S]*$/, '');\r\n}\r\n\r\n/**\r\n * 把模板编译成函数。返回 `null` 表示模板里没有 EJS 标记。\r\n * @param {string} source\r\n */\r\nfunction compileTemplate(source) {\r\n  if (TEMPLATE_CACHE.has(source)) return TEMPLATE_CACHE.get(source);\r\n\r\n  const segments = [];\r\n  let index = 0;\r\n  /** 'line' = `-%>`（吃掉紧跟的一个换行）；'all' = `_%>`（吃掉后面所有空白）。 */\r\n  let pendingTrim = null;\r\n  /** 见过至少一个 EJS 标记（即使它只产出文本，例如 `<%%`）。 */\r\n  let sawTag = false;\r\n\r\n  const pushText = (text) => {\r\n    if (!text) return;\r\n    let value = text;\r\n    if (pendingTrim === 'line') value = value.replace(/^[ \\t]*\\r?\\n/, '');\r\n    else if (pendingTrim === 'all') value = value.replace(/^\\s+/, '');\r\n    pendingTrim = null;\r\n    if (!value) return;\r\n    segments.push({ type: 'text', value });\r\n  };\r\n\r\n  /** `<%_`：吃掉标签前面的所有空白（含换行）。 */\r\n  const slurpTrailing = () => {\r\n    const last = segments[segments.length - 1];\r\n    if (last?.type === 'text') last.value = last.value.replace(/\\s+$/, '');\r\n  };\r\n\r\n  while (index < source.length) {\r\n    const open = source.indexOf(TAG_OPEN, index);\r\n    if (open < 0) {\r\n      pushText(source.slice(index));\r\n      break;\r\n    }\r\n    sawTag = true;\r\n    let cursor = open + 2;\r\n    pushText(source.slice(index, open));\r\n\r\n    // <%% 输出字面量 <%\r\n    if (source[cursor] === '%') {\r\n      pushText('<%');\r\n      index = cursor + 1;\r\n      continue;\r\n    }\r\n\r\n    let kind = '';\r\n    let slurpBefore = false;\r\n    if (source[cursor] === '_') { slurpBefore = true; cursor += 1; }\r\n    else if (source[cursor] === '=' || source[cursor] === '-' || source[cursor] === '#') {\r\n      kind = source[cursor];\r\n      cursor += 1;\r\n    }\r\n\r\n    const close = source.indexOf('%>', cursor);\r\n    if (close < 0) {\r\n      // 未闭合：原样保留剩余文本（EJS 的行为是报错；这里选择不丢内容）\r\n      if (slurpBefore) slurpTrailing();\r\n      segments.push({ type: 'text', value: source.slice(open) });\r\n      index = source.length;\r\n      break;\r\n    }\r\n\r\n    let code = source.slice(cursor, close);\r\n    index = close + 2;\r\n    if (code.endsWith('-')) {\r\n      code = code.slice(0, -1);\r\n      pendingTrim = 'line';\r\n    } else if (code.endsWith('_')) {\r\n      code = code.slice(0, -1);\r\n      pendingTrim = 'all';\r\n    }\r\n    if (slurpBefore) slurpTrailing();\r\n\r\n    if (kind === '#') continue;\r\n    if (kind === '=' || kind === '-') {\r\n      segments.push({ type: kind === '=' ? 'escaped' : 'raw', code });\r\n    } else {\r\n      segments.push({ type: 'code', code });\r\n    }\r\n  }\r\n\r\n  if (!sawTag) {\r\n    TEMPLATE_CACHE.set(source, null);\r\n    return null;\r\n  }\r\n\r\n  const body = [];\r\n  for (const segment of segments) {\r\n    if (segment.type === 'text') {\r\n      if (segment.value) body.push(`__out += ${JSON.stringify(segment.value)};`);\r\n    } else if (segment.type === 'escaped') {\r\n      body.push(`__out += __esc((${segment.code}));`);\r\n    } else if (segment.type === 'raw') {\r\n      body.push(`__out += __raw((${segment.code}));`);\r\n    } else {\r\n      body.push(segment.code);\r\n    }\r\n  }\r\n\r\n  const program = `\r\n    var __out = '';\r\n    with (__scope) {\r\n      ${body.join('\\n')}\r\n    }\r\n    return __out;\r\n  `;\r\n\r\n  let fn;\r\n  try {\r\n    // eslint-disable-next-line no-new-func\r\n    fn = new Function('__scope', '__esc', '__raw', program);\r\n  } catch {\r\n    fn = null;\r\n  }\r\n  if (TEMPLATE_CACHE.size >= TEMPLATE_CACHE_LIMIT) TEMPLATE_CACHE.clear();\r\n  TEMPLATE_CACHE.set(source, fn);\r\n  return fn;\r\n}\r\n\r\n/**\r\n * 渲染一段 EJS 模板。出错时返回去掉标签的原文 + 一行注释，绝不让整轮请求失败。\r\n * @param {string} template\r\n * @param {Record<string, unknown>} scope\r\n * @param {{ keepOnError?: boolean }} [options]\r\n * @returns {string}\r\n */\r\nfunction renderEjs(template, scope = {}, options = {}) {\r\n  const source = String(template ?? '');\r\n  if (!source || !source.includes(TAG_OPEN)) return source;\r\n\r\n  const fn = compileTemplate(source);\r\n  if (!fn) return source;\r\n\r\n  try {\r\n    return fn(scope, (value) => escapeHtml(value), (value) => (value == null ? '' : String(value)));\r\n  } catch (error) {\r\n    const message = String(error && error.message ? error.message : error);\r\n    const fallback = options.keepOnError ? source : stripTags(source);\r\n    return `${fallback}\\n<!-- dsh-tt EJS error: ${message.replace(/-->/g, '--&gt;')} -->`;\r\n  }\r\n}\n\n  return { createEjsScope: createEjsScope, createFaker: createFaker, createLodash: createLodash, deletePath: deletePath, escapeHtml: escapeHtml, getPath: getPath, hasPath: hasPath, renderEjs: renderEjs, setPath: setPath, toPath: toPath, unescapeHtml: unescapeHtml };\n  });\n\n  define('macros', function (__require) {\n// 宏替换：覆盖 ST 最常用的一批（见设计文档 §14.6）。\r\n// 顺序：注释剥离 → 旧式尖括号 → 内置 → 传入 env。\r\n\r\nconst pad = (n) => String(n).padStart(2, '0');\r\n\r\nfunction formatTime(date, locale) {\r\n  return new Intl.DateTimeFormat(locale || 'zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date);\r\n}\r\n\r\nfunction formatDate(date, locale) {\r\n  return new Intl.DateTimeFormat(locale || 'zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);\r\n}\r\n\r\nfunction pickRandom(list, rand) {\r\n  if (!list.length) return '';\r\n  return list[Math.floor(rand() * list.length)];\r\n}\r\n\r\nfunction splitArgs(inner, sep = '::') {\r\n  if (inner.includes(sep)) return inner.split(sep).filter((s) => s !== '');\r\n  if (inner.includes(' ')) return inner.split(/\\s+/).filter(Boolean);\r\n  return [inner];\r\n}\r\n\r\n/**\r\n * @param {string} text\r\n * @param {Record<string, unknown>} env\r\n * @param {{ random?: () => number, now?: Date, locale?: string }} [options]\r\n */\r\nfunction substitute(text, env = {}, options = {}) {\r\n  if (typeof text !== 'string' || !text) return '';\r\n  const rand = options.random ?? Math.random;\r\n  const now = options.now ?? new Date();\r\n  const locale = options.locale ?? 'zh-CN';\r\n  const get = (k) => {\r\n    const v = env[k];\r\n    return typeof v === 'function' ? v() : v == null ? '' : String(v);\r\n  };\r\n\r\n  let out = text;\r\n\r\n  // 1. {{//注释}}：整段删除（参考卡的 mes_example 里就有加密备注）\r\n  out = out.replace(/\\{\\{\\/\\/([\\s\\S]*?)\\}\\}/g, '');\r\n\r\n  // 1.5 变量宏：{{setvar::k::v}} 写入且不产出文本；{{getvar::k}} 读回（同一次渲染内可见）\r\n  const store = Object.assign(Object.create(null), env.__vars ?? {});\r\n  out = out.replace(/\\{\\{setvar::([^:}\\s]+)::([\\s\\S]*?)\\}\\}/gi, (_, key, value) => {\r\n    store[key.trim()] = value;\r\n    return '';\r\n  });\r\n  out = out.replace(/\\{\\{addvar::([^:}\\s]+)::([\\s\\S]*?)\\}\\}/gi, (_, key, value) => {\r\n    const k = key.trim();\r\n    store[k] = String(store[k] ?? '') + value;\r\n    return '';\r\n  });\r\n  out = out.replace(/\\{\\{getvar::([^:}\\s]+)\\}\\}/gi, (_, key) => {\r\n    const k = key.trim();\r\n    return store[k] == null ? '' : String(store[k]);\r\n  });\r\n\r\n  // 2. 旧式尖括号\r\n  out = out.replace(/<USER>/gi, () => get('user'));\r\n  out = out.replace(/<BOT>/gi, () => get('char'));\r\n  out = out.replace(/<CHAR>/gi, () => get('char'));\r\n  out = out.replace(/<CHARIFNOTGROUP>/gi, () => get('group') || get('char'));\r\n  out = out.replace(/<GROUP>/gi, () => get('group'));\r\n\r\n  // 3. 结构类\r\n  out = out.replace(/\\{\\{newline\\}\\}/gi, '\\n');\r\n  out = out.replace(/(?:\\r?\\n)*\\{\\{trim\\}\\}(?:\\r?\\n)*/gi, '');\r\n  out = out.replace(/\\{\\{noop\\}\\}/gi, '');\r\n\r\n  // 4. 随机类\r\n  out = out.replace(/\\{\\{random\\s?::?([^}]+)\\}\\}/gi, (_, inner) => pickRandom(splitArgs(inner.trim(), '::'), rand) || pickRandom(splitArgs(inner.trim(), ' '), rand));\r\n  out = out.replace(/\\{\\{pick\\s?::?([^}]+)\\}\\}/gi, (_, inner) => pickRandom(splitArgs(inner.trim(), '::'), rand));\r\n  out = out.replace(/\\{\\{roll[ :]([^}]+)\\}\\}/gi, (_, inner) => {\r\n    const m = inner.trim().match(/^(\\d*)d(\\d+)$/i);\r\n    const count = m ? Math.max(1, Number(m[1] || 1)) : 1;\r\n    const sides = m ? Number(m[2]) : Number(inner.trim()) || 6;\r\n    let total = 0;\r\n    for (let i = 0; i < count; i++) total += 1 + Math.floor(rand() * sides);\r\n    return String(total);\r\n  });\r\n\r\n  // 5. 时间类\r\n  out = out.replace(/\\{\\{time\\}\\}/gi, () => formatTime(now, locale));\r\n  out = out.replace(/\\{\\{date\\}\\}/gi, () => formatDate(now, locale));\r\n  out = out.replace(/\\{\\{weekday\\}\\}/gi, () => new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(now));\r\n  out = out.replace(/\\{\\{isotime\\}\\}/gi, () => `${pad(now.getHours())}:${pad(now.getMinutes())}`);\r\n  out = out.replace(/\\{\\{isodate\\}\\}/gi, () => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);\r\n  out = out.replace(/\\{\\{idle_duration\\}\\}/gi, () => get('idleDuration') || '刚刚');\r\n\r\n  // 6. 派生类\r\n  out = out.replace(/\\{\\{reverse:([^}]+)\\}\\}/gi, (_, inner) => Array.from(inner).reverse().join(''));\r\n  out = out.replace(/\\{\\{lastMessage\\}\\}/gi, () => get('lastMessage'));\r\n\r\n  // 7. env（含 char / user / personality / scenario / description / input / maxPrompt …）\r\n  for (const key of Object.keys(env)) {\r\n    const re = new RegExp(`\\\\{\\\\{${key.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\\\}\\\\}`, 'gi');\r\n    out = out.replace(re, () => get(key));\r\n  }\r\n\r\n  return out;\r\n}\r\n\r\n/** 构建 ST 语义下的宏环境。 */\r\nfunction createMacroEnv({ card, userName, userDescription, lastMessage, lastMessageId, maxPrompt, maxContext, maxResponse, input }) {\r\n  return {\r\n    char: card?.name ?? '',\r\n    charIfNotGroup: card?.name ?? '',\r\n    user: userName || '你',\r\n    group: '',\r\n    description: card?.description ?? '',\r\n    personality: card?.personality ?? '',\r\n    scenario: card?.scenario ?? '',\r\n    persona: userDescription ?? '',\r\n    lastMessage: lastMessage ?? '',\r\n    lastMessageId: lastMessageId == null ? '' : String(lastMessageId),\r\n    input: input ?? '',\r\n    maxPrompt: maxPrompt == null ? '' : String(maxPrompt),\r\n    maxContext: maxContext == null ? '' : String(maxContext),\r\n    maxResponse: maxResponse == null ? '' : String(maxResponse),\r\n  };\r\n}\n\n  return { createMacroEnv: createMacroEnv, substitute: substitute };\n  });\n\n  define('decorators', function (__require) {\n// 世界书条目装饰器：ST 的 `@@if (...)` / `@@dont_activate` / `@@activate`。\r\n//\r\n// 参考卡的 33 条节庆条目以 `@@if (<IIFE>)` 开头：表达式为真才把条目正文放进提示词，\r\n// 指令行本身必须被移除。表达式与 EJS 共用同一个作用域（getvar/stat_data/v…）。\r\n\r\nconst DIRECTIVE = /^\\s*@@(if|dont_activate|activate)\\b([\\s\\S]*)$/;\r\n\r\n/** 从字符串开头读一个平衡括号表达式；返回 [expr, rest]。 */\r\nfunction readBalancedExpression(text) {\r\n  const source = String(text ?? '');\r\n  let index = 0;\r\n  while (index < source.length && /\\s/.test(source[index])) index += 1;\r\n  if (source[index] !== '(') {\r\n    // 没有括号：按行取表达式\r\n    const end = source.indexOf('\\n', index);\r\n    const line = source.slice(index, end < 0 ? source.length : end).trim();\r\n    return line ? [line, end < 0 ? '' : source.slice(end + 1)] : null;\r\n  }\r\n  let depth = 0;\r\n  let quote = null;\r\n  for (let cursor = index; cursor < source.length; cursor += 1) {\r\n    const ch = source[cursor];\r\n    if (quote) {\r\n      if (ch === '\\\\') cursor += 1;\r\n      else if (ch === quote) quote = null;\r\n      continue;\r\n    }\r\n    if (ch === '\"' || ch === \"'\" || ch === '`') { quote = ch; continue; }\r\n    if (ch === '(') { depth += 1; continue; }\r\n    if (ch === ')') {\r\n      depth -= 1;\r\n      if (depth === 0) return [source.slice(index, cursor + 1), source.slice(cursor + 1)];\r\n    }\r\n  }\r\n  return null;\r\n}\r\n\r\nfunction evaluate(expr, scope) {\r\n  try {\r\n    // eslint-disable-next-line no-new-func\r\n    const fn = new Function('__scope', `with (__scope) { return (${expr}); }`);\r\n    return Boolean(fn(scope));\r\n  } catch {\r\n    // 表达式失败时保守地保留条目正文，至少不让整段世界书消失。\r\n    return true;\r\n  }\r\n}\r\n\r\nfunction compiles(expr, scope) {\r\n  try {\r\n    // eslint-disable-next-line no-new-func\r\n    new Function('__scope', `with (__scope) { return (${expr}); }`);\r\n    return true;\r\n  } catch {\r\n    return false;\r\n  }\r\n}\r\n\r\n/**\r\n * 处理一段世界书条目正文里的装饰器。\r\n * @param {string} text\r\n * @param {Record<string, unknown>} scope EJS 作用域\r\n * @returns {string}\r\n */\r\nfunction applyWorldInfoDecorators(text, scope = {}) {\r\n  let out = String(text ?? '');\r\n  for (let guard = 0; guard < 8; guard += 1) {\r\n    const match = out.match(DIRECTIVE);\r\n    if (!match) break;\r\n    const directive = match[1];\r\n    const rest = match[2];\r\n    if (directive === 'dont_activate') return '';\r\n    if (directive === 'activate') {\r\n      out = rest.replace(/^\\r?\\n/, '');\r\n      continue;\r\n    }\r\n    // 常见形态：`@@if (function(){...})()` 整行；优先按行求值，才能把末尾的调用括号算进去。\r\n    const newline = rest.indexOf('\\n');\r\n    const line = (newline < 0 ? rest : rest.slice(0, newline)).trim();\r\n    if (line && compiles(line, scope)) {\r\n      if (!evaluate(line, scope)) return '';\r\n      out = newline < 0 ? '' : rest.slice(newline + 1);\r\n      continue;\r\n    }\r\n    const parsed = readBalancedExpression(rest);\r\n    if (!parsed) {\r\n      // 无法解析：去掉指令行，保留正文。\r\n      out = rest.replace(/^\\r?\\n/, '');\r\n      break;\r\n    }\r\n    const [expr, after] = parsed;\r\n    if (!evaluate(expr, scope)) return '';\r\n    out = after.replace(/^\\r?\\n/, '');\r\n  }\r\n  // 未知的 @@ 指令行（只删行首那一行）\r\n  return out.replace(/^(?:\\s*@@[^\\n]*\\r?\\n)/, '');\r\n}\r\n\r\n/**\r\n * 对一组世界书条目逐条处理装饰器，再拼接。\r\n * @param {string[]} list\r\n * @param {Record<string, unknown>} scope\r\n * @param {string} [separator]\r\n */\r\nfunction joinDecorated(list, scope = {}, separator = '\\n') {\r\n  if (!Array.isArray(list) || !list.length) return '';\r\n  return list\r\n    .map((item) => applyWorldInfoDecorators(item, scope).trim())\r\n    .filter(Boolean)\r\n    .join(separator);\r\n}\n\n  return { applyWorldInfoDecorators: applyWorldInfoDecorators, joinDecorated: joinDecorated };\n  });\n\n  define('lorebook', function (__require) {\n// 世界书激活引擎：按 SillyTavern（release）的语义实现。\n//\n// 已实现：constant / 主关键词 / 次关键词四种逻辑 / 概率 / 预算 / 8 种位置 /\n//        sticky / cooldown / delay / delayUntilRecursion / 递归扫描 /\n//        inclusion group / groupOverride / excludeRecursion / outlet / ignoreBudget /\n//        @@activate / @@dont_activate（由 decorateEntry 与条目原文前缀判定）。\n// 未实现：向量化（vectorized）、@depth 之外的来源过滤（角色/人设 tag 匹配）、\n//        minActivations 的\"加深扫描\"细节（只保留最基本的重试）。\n//\n// 计时单位：session.turn —— 每次用户消息 +1（近似 ST 的聊天消息条数）。\n\nconst WI_POSITION = {\n  before: 0,\n  after: 1,\n  ANTop: 2,\n  ANBottom: 3,\n  atDepth: 4,\n  EMTop: 5,\n  EMBottom: 6,\n  outlet: 7,\n};\n\nconst WI_LOGIC = { AND_ANY: 0, NOT_ALL: 1, NOT_ANY: 2, AND_ALL: 3 };\nconst DEFAULT_DEPTH = 4;\nconst DEFAULT_MAX_RECURSION = 5;\n\nfunction estimateTokens(text) {\n  if (!text) return 0;\n  let cjk = 0;\n  for (const ch of text) {\n    const code = ch.codePointAt(0);\n    if (code >= 0x2e80) cjk++;\n  }\n  const rest = text.length - cjk;\n  return Math.ceil(cjk / 1.6 + rest / 3.6);\n}\n\nfunction escapeRegExp(text) {\n  return text.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');\n}\n\nfunction buildMatcher(key, { useRegex = false, caseSensitive = false, matchWholeWords = false } = {}) {\n  if (!key) return null;\n  if (useRegex) {\n    try {\n      const re = new RegExp(key, caseSensitive ? '' : 'i');\n      return (text) => re.test(text);\n    } catch {\n      return null;\n    }\n  }\n  if (caseSensitive) {\n    return (text) => text.includes(key);\n  }\n  if (matchWholeWords && /^[\\w-]+$/.test(key)) {\n    const re = new RegExp(`(^|[^\\\\p{L}\\\\p{N}_])${escapeRegExp(key)}([^\\\\p{L}\\\\p{N}_]|$)`, 'iu');\n    return (text) => re.test(text);\n  }\n  const needle = key.toLowerCase();\n  return (text) => text.toLowerCase().includes(needle);\n}\n\nfunction matchKeys(text, keys, options) {\n  for (const rawKey of keys) {\n    const key = typeof rawKey === 'string' ? rawKey.trim() : '';\n    if (!key) continue;\n    const match = buildMatcher(key, options);\n    if (match && match(text)) return key;\n  }\n  return null;\n}\n\nfunction passesSecondary(text, entry, options) {\n  const secondary = Array.isArray(entry.keysecondary) ? entry.keysecondary : [];\n  if (!secondary.length) return true;\n  const logic = Number(entry.selectiveLogic ?? WI_LOGIC.AND_ANY);\n  const results = secondary\n    .map((k) => (typeof k === 'string' ? k.trim() : ''))\n    .filter(Boolean)\n    .map((k) => Boolean(matchKeys(text, [k], options)));\n\n  if (!results.length) return true;\n  const any = results.some(Boolean);\n  const all = results.every(Boolean);\n\n  switch (logic) {\n    case WI_LOGIC.NOT_ALL: return !all;\n    case WI_LOGIC.NOT_ANY: return !any;\n    case WI_LOGIC.AND_ALL: return all;\n    case WI_LOGIC.AND_ANY:\n    default: return any;\n  }\n}\n\n/** delayed 条目的递归级别：true 视为 1，数字原样，0/false 视为不限。 */\nfunction recursionLevelOf(value) {\n  if (value === true) return 1;\n  if (value == null || value === false) return 0;\n  const level = Number(value);\n  return Number.isFinite(level) && level > 0 ? Math.floor(level) : 0;\n}\n\n/** 空的会话状态：turn 是用户消息计数，entries 按 uid 记 sticky/cooldown 计时。 */\nfunction createWorldInfoSession() {\n  return { turn: 0, entries: Object.create(null) };\n}\n\n/**\n * 同组只留最优（ST 的 filterByInclusionGroups）：\n * groupWeight 高者优先，同分按 insertion_order / uid；groupOverride 的条目不受组限制。\n */\nfunction filterByInclusionGroups(candidates, skipped) {\n  const groups = new Map();\n  const kept = [];\n  for (const item of candidates) {\n    const group = item.entry.group;\n    if (!group || item.entry.groupOverride === true) {\n      kept.push(item);\n      continue;\n    }\n    const list = groups.get(group);\n    if (list) list.push(item);\n    else groups.set(group, [item]);\n  }\n  for (const [group, list] of groups) {\n    list.sort((a, b) => (Number(b.entry.groupWeight) || 1) - (Number(a.entry.groupWeight) || 1)\n      || (Number(a.entry.insertion_order ?? 100) - Number(b.entry.insertion_order ?? 100))\n      || (Number(a.entry.uid ?? 0) - Number(b.entry.uid ?? 0)));\n    kept.push(list[0]);\n    for (const item of list.slice(1)) {\n      skipped.push({ uid: item.entry.uid, comment: item.entry.comment, why: 'group:' + group });\n    }\n  }\n  return kept;\n}\n\n/**\n * @param {object} input\n * @param {any[]} input.entries 世界书条目（ST 格式）\n * @param {string} input.scanText 参与扫描的文本（最近 N 楼拼起来）\n * @param {number} [input.budget] token 预算\n * @param {(t:string)=>number} [input.estimate] token 估算器\n * @param {() => number} [input.random] 随机源（便于测试固定）\n * @param {(entry:object)=>boolean} [input.isActive] 额外激活判定（旧接口，等价于 decorateEntry 返回空串）\n * @param {(entry:object)=>string} [input.decorateEntry] 返回条目最终正文（处理 @@if 等装饰器后）；空串视为不激活\n * @param {{turn:number, entries:object}} [input.session] 会话计时状态（会被就地更新）\n * @param {boolean} [input.recursive] 是否递归扫描（默认 true）\n * @param {number} [input.maxRecursionSteps] 递归上限（默认 5；0 = 不限）\n * @param {number} [input.minActivations] 至少激活多少条才停止加深（默认 0）\n */\nfunction activateEntries({\n  entries,\n  scanText,\n  budget = 2048,\n  estimate = estimateTokens,\n  random = Math.random,\n  isActive,\n  decorateEntry,\n  session = null,\n  recursive = true,\n  maxRecursionSteps = DEFAULT_MAX_RECURSION,\n  minActivations = 0,\n}) {\n  const state = session ?? createWorldInfoSession();\n  if (!state.entries || typeof state.entries !== 'object') state.entries = Object.create(null);\n  const turn = Number(state.turn) || 0;\n\n  const matchOptions = { useRegex: false, caseSensitive: false, matchWholeWords: false };\n  const list = (entries || [])\n    .filter((entry) => entry && entry.enabled !== false && entry.disable !== true)\n    .map((entry, index) => ({ ...entry, __index: index }))\n    .sort((a, b) => (Number(a.insertion_order ?? 100) - Number(b.insertion_order ?? 100))\n      || (Number(a.uid ?? a.__index) - Number(b.uid ?? b.__index)));\n\n  // 装饰器在扫描前求值：@@if 为假 / @@dont_activate 的条目直接出局，\n  // @@activate 的条目跳过关键词判定（ST 的外部激活语义）。\n  const stripDirective = (text) => text.replace(/^\\s*@@(?:activate|dont_activate)\\b[^\\n]*\\r?\\n?/, '');\n  const prepared = list.map((entry) => {\n    const raw = typeof entry.content === 'string' ? entry.content : '';\n    const decorated = typeof decorateEntry === 'function' ? String(decorateEntry(entry) ?? '') : stripDirective(raw);\n    const blockedByDecorator = /^\\s*@@dont_activate\\b/.test(raw) || (typeof isActive === 'function' && !isActive(entry));\n    return {\n      entry,\n      raw,\n      // 即使调用方没提供 decorateEntry，也要把强制激活的指令行去掉。\n      content: stripDirective(decorated),\n      forced: /^\\s*@@activate\\b/.test(raw),\n      blocked: blockedByDecorator,\n    };\n  });\n  const byUid = new Map(prepared.map((item) => [item.entry.uid ?? item.entry.__index, item]));\n\n  const activated = [];\n  const skipped = [];\n  const skipSeen = new Set();\n  const failedProbability = new Set();\n  const used = new Set();\n  // inclusion group 跨轮占位：同一组在整次扫描里只能留下一条。\n  const claimedGroups = new Map();\n  let tokensUsed = 0;\n  let overflowed = false;\n  let recursion = 0;\n  let scanBuffer = String(scanText ?? '');\n  let rounds = 0;\n\n  // 递归轮会重复判定同一条目；跳过原因按 uid+原因去重，避免统计翻倍。\n  const recordSkip = (entry, why) => {\n    const key = `${entry.uid ?? entry.comment}|${why}`;\n    if (skipSeen.has(key)) return;\n    skipSeen.add(key);\n    skipped.push({ uid: entry.uid, comment: entry.comment, why });\n  };\n\n  while (true) {\n    rounds += 1;\n    const candidates = [];\n\n    for (const item of prepared) {\n      const entry = item.entry;\n      const uid = entry.uid ?? entry.__index;\n      if (used.has(uid)) continue;\n      if (item.blocked) { recordSkip(entry, 'decorator'); continue; }\n      if (!item.content) { recordSkip(entry, 'decorator'); continue; }\n\n      const entryState = state.entries[uid] ?? (state.entries[uid] = {});\n      const delay = Number(entry.delay) || 0;\n      if (delay > 0 && turn < delay) { recordSkip(entry, 'delay'); continue; }\n\n      const cooldownUntil = Number(entryState.cooldownUntil);\n      if (Number.isFinite(cooldownUntil) && cooldownUntil > turn) { recordSkip(entry, 'cooldown'); continue; }\n\n      // 同组已被前几轮占用：groupOverride 之外一律不再激活。\n      if (entry.group && entry.groupOverride !== true && claimedGroups.has(entry.group)) {\n        recordSkip(entry, 'group:' + entry.group);\n        continue;\n      }\n\n      const level = recursionLevelOf(entry.delayUntilRecursion);\n      if (level > 0 && recursion < level) { recordSkip(entry, 'delayUntilRecursion'); continue; }\n\n      const stickyUntil = Number(entryState.stickyUntil);\n      const stickyActive = Number.isFinite(stickyUntil) && stickyUntil >= turn;\n\n      let activatedBy = null;\n      let matchedKey = null;\n      if (stickyActive) {\n        activatedBy = 'sticky';\n      } else if (item.forced) {\n        activatedBy = 'decorator';\n      } else if (entry.constant === true) {\n        activatedBy = 'constant';\n      } else {\n        // 递归轮：excludeRecursion 的条目不再参与关键词判定。\n        if (recursion > 0 && entry.excludeRecursion === true) { recordSkip(entry, 'excludeRecursion'); continue; }\n        const keys = Array.isArray(entry.key) ? entry.key : [];\n        if (!keys.length) { recordSkip(entry, 'no-keys'); continue; }\n        const entryOptions = {\n          ...matchOptions,\n          useRegex: entry.useRegex === true,\n          caseSensitive: entry.caseSensitive === true,\n          matchWholeWords: entry.matchWholeWords === true,\n        };\n        matchedKey = matchKeys(scanBuffer, keys, entryOptions);\n        if (!matchedKey) continue;\n        if (entry.selective !== false && !passesSecondary(scanBuffer, entry, entryOptions)) {\n          recordSkip(entry, 'secondary');\n          continue;\n        }\n        activatedBy = 'key';\n      }\n\n      candidates.push({ ...item, matchedKey, activatedBy, stickyActive });\n    }\n\n    if (!candidates.length) break;\n\n    // ① sticky 优先，其次按原序（prepared 已按 insertion_order/uid 排序）。\n    candidates.sort((a, b) => (Number(b.stickyActive) - Number(a.stickyActive))\n      || (Number(a.entry.insertion_order ?? 100) - Number(b.entry.insertion_order ?? 100))\n      || (Number(a.entry.uid ?? 0) - Number(b.entry.uid ?? 0)));\n\n    // ② 同组只留最优。\n    const grouped = filterByInclusionGroups(candidates, skipped);\n\n    // ③ 概率：sticky 不重掷；失败条目不重试。\n    const surviving = [];\n    for (const item of grouped) {\n      const uid = item.entry.uid ?? item.entry.__index;\n      const probability = Number(item.entry.probability);\n      if (!item.stickyActive && item.entry.useProbability === true && Number.isFinite(probability) && probability < 100) {\n        if (failedProbability.has(uid)) { recordSkip(item.entry, 'probability'); continue; }\n        if (random() * 100 > probability) {\n          failedProbability.add(uid);\n          recordSkip(item.entry, 'probability');\n          continue;\n        }\n      }\n      surviving.push(item);\n    }\n\n    // ④ 预算累加：超出后同轮与后续轮都不再增加（ignoreBudget 除外）。\n    const roundActivated = [];\n    for (const item of surviving) {\n      const entry = item.entry;\n      const uid = entry.uid ?? entry.__index;\n      const ignoreBudget = entry.ignoreBudget === true;\n      if (overflowed && !ignoreBudget) { recordSkip(entry, 'budget'); continue; }\n      const cost = estimate(item.content);\n      if (!ignoreBudget && tokensUsed + cost > budget) {\n        overflowed = true;\n        recordSkip(entry, 'budget');\n        continue;\n      }\n      tokensUsed += cost;\n      used.add(uid);\n      const entryState = state.entries[uid] ?? (state.entries[uid] = {});\n      const sticky = Number(entry.sticky) || 0;\n      const cooldown = Number(entry.cooldown) || 0;\n      if (sticky > 0) entryState.stickyUntil = turn + sticky;\n      if (cooldown > 0) entryState.cooldownUntil = (sticky > 0 ? turn + sticky : turn) + cooldown;\n      const activation = {\n        uid,\n        comment: entry.comment ?? '',\n        content: item.content,\n        position: Number(entry.position) || 0,\n        depth: entry.depth == null ? null : Number(entry.depth),\n        role: entry.role ?? 'system',\n        order: Number(entry.insertion_order ?? 100),\n        matchedKey: item.matchedKey,\n        constant: entry.constant === true,\n        activatedBy: item.activatedBy,\n        sticky: sticky > 0,\n        outletName: entry.outletName ?? null,\n      };\n      activated.push(activation);\n      roundActivated.push(activation);\n      if (entry.group && entry.groupOverride !== true && !claimedGroups.has(entry.group)) {\n        claimedGroups.set(entry.group, uid);\n      }\n    }\n\n    if (!roundActivated.length) break;\n\n    // ⑤ 递归：把本轮激活的正文并入下一轮扫描文本。\n    if (!recursive) break;\n    const limit = Number(maxRecursionSteps) || 0;\n    const enough = activated.length >= (Number(minActivations) || 0);\n    if (limit > 0 && recursion + 1 >= limit && enough) break;\n    if (limit > 0 && recursion + 1 >= limit) break;\n    scanBuffer += '\\n' + roundActivated.map((item) => item.content).join('\\n');\n    recursion += 1;\n    if (rounds > 50) break;\n  }\n\n  const buckets = {\n    before: [],\n    after: [],\n    ANTop: [],\n    ANBottom: [],\n    EMTop: [],\n    EMBottom: [],\n    depth: [],\n    outlet: [],\n    outlets: Object.create(null),\n  };\n\n  // ST 的装配：按顺序 unshift，因此最终数组与排序相反。\n  for (const item of activated) {\n    switch (item.position) {\n      case WI_POSITION.before: buckets.before.unshift(item.content); break;\n      case WI_POSITION.after: buckets.after.unshift(item.content); break;\n      case WI_POSITION.ANTop: buckets.ANTop.unshift(item.content); break;\n      case WI_POSITION.ANBottom: buckets.ANBottom.unshift(item.content); break;\n      case WI_POSITION.EMTop: buckets.EMTop.unshift(item.content); break;\n      case WI_POSITION.EMBottom: buckets.EMBottom.unshift(item.content); break;\n      case WI_POSITION.atDepth: {\n        const depth = item.depth ?? DEFAULT_DEPTH;\n        const existing = buckets.depth.find((group) => group.depth === depth && group.role === item.role);\n        if (existing) existing.entries.unshift(item.content);\n        else buckets.depth.push({ depth, role: item.role, entries: [item.content] });\n        break;\n      }\n      case WI_POSITION.outlet: {\n        const name = item.outletName || '';\n        if (name) {\n          if (!buckets.outlets[name]) buckets.outlets[name] = [];\n          buckets.outlets[name].unshift(item.content);\n        } else {\n          buckets.outlet.unshift(item.content);\n        }\n        break;\n      }\n      default: buckets.outlet.unshift(item.content); break;\n    }\n  }\n\n  return {\n    activated,\n    skipped,\n    buckets,\n    stats: {\n      total: list.length,\n      activated: activated.length,\n      tokens: tokensUsed,\n      budget,\n      overflowed,\n      recursion,\n      rounds,\n      byActivation: activated.reduce((acc, item) => {\n        acc[item.activatedBy] = (acc[item.activatedBy] || 0) + 1;\n        return acc;\n      }, {}),\n    },\n  };\n}\n\n/** ST 的位置是数字；角色卡内嵌世界书用字符串，扩展里可能又放在 extensions 里。 */\nfunction normalizeBookEntryPosition(entry) {\n  if (typeof entry?.position === 'number' && Number.isFinite(entry.position)) return entry.position;\n  const extPosition = entry?.extensions?.position;\n  if (extPosition != null && Number.isFinite(Number(extPosition))) return Number(extPosition);\n  const map = {\n    before_char: WI_POSITION.before,\n    after_char: WI_POSITION.after,\n    before_an: WI_POSITION.ANTop,\n    after_an: WI_POSITION.ANBottom,\n    at_depth: WI_POSITION.atDepth,\n    before_em: WI_POSITION.EMTop,\n    after_em: WI_POSITION.EMBottom,\n    outlet: WI_POSITION.outlet,\n  };\n  return map[entry?.position] ?? WI_POSITION.before;\n}\n\nconst ROLE_NAMES = { 0: 'system', 1: 'user', 2: 'assistant' };\nfunction normalizeRole(entry) {\n  const raw = entry?.role ?? entry?.extensions?.role;\n  if (typeof raw === 'number') return ROLE_NAMES[raw] ?? 'system';\n  if (typeof raw === 'string' && raw) return raw;\n  return 'system';\n}\n\n/** 计时/分组类字段的宽松归一化（ST 里这些字段有时在 extensions 下）。 */\nfunction normalizeTimers(entry) {\n  const ext = entry?.extensions && typeof entry.extensions === 'object' ? entry.extensions : {};\n  const pick = (name) => entry[name] ?? ext[name];\n  return {\n    sticky: Number(pick('sticky')) || 0,\n    cooldown: Number(pick('cooldown')) || 0,\n    delay: Number(pick('delay')) || 0,\n    delayUntilRecursion: pick('delayUntilRecursion'),\n    excludeRecursion: Boolean(pick('excludeRecursion')),\n    group: pick('group') ?? '',\n    groupWeight: Number(pick('groupWeight')) || 1,\n    groupOverride: Boolean(pick('groupOverride')),\n    outletName: pick('outletName') ?? ext.outletName ?? '',\n    useProbability: Boolean(pick('useProbability')),\n    probability: pick('probability') == null ? 100 : Number(pick('probability')),\n    ignoreBudget: Boolean(pick('ignoreBudget')),\n  };\n}\n\nfunction normalizeCharacterBookEntries(book) {\n  // 角色卡内嵌世界书一般是数组；ST 导出的独立世界书是 { \"0\": {...}, \"1\": {...} } 的对象。\n  const raw = book?.entries;\n  const list = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : []);\n  return list.map((entry, index) => {\n    const timers = normalizeTimers(entry);\n    return {\n      ...entry,\n      uid: entry.id ?? entry.uid ?? index,\n      position: normalizeBookEntryPosition(entry),\n      depth: entry.depth ?? entry.extensions?.depth,\n      role: normalizeRole(entry),\n      enabled: entry.enabled !== false && entry.disable !== true,\n      key: Array.isArray(entry.keys) ? entry.keys : (Array.isArray(entry.key) ? entry.key : []),\n      keysecondary: Array.isArray(entry.secondary_keys) ? entry.secondary_keys\n        : (Array.isArray(entry.keysecondary) ? entry.keysecondary : []),\n      insertion_order: Number(entry.insertion_order ?? entry.order ?? 100),\n      content: typeof entry.content === 'string' ? entry.content : '',\n      comment: entry.comment ?? entry.name ?? '',\n      ...timers,\n    };\n  });\n}\n\n  return { DEFAULT_DEPTH: DEFAULT_DEPTH, DEFAULT_MAX_RECURSION: DEFAULT_MAX_RECURSION, WI_LOGIC: WI_LOGIC, WI_POSITION: WI_POSITION, activateEntries: activateEntries, createWorldInfoSession: createWorldInfoSession, estimateTokens: estimateTokens, normalizeBookEntryPosition: normalizeBookEntryPosition, normalizeCharacterBookEntries: normalizeCharacterBookEntries };\n  });\n\n  define('regex', function (__require) {\n// ST 正则脚本（regex scripts）在 Host 侧的执行。\n//\n// ST 的枚举（数值必须兼容，导入的 JSON 直接可用）：\n//   regex_placement = { USER_INPUT:1, AI_OUTPUT:2, SLASH_COMMAND:3, MD_DISPLAY:4, WORLD_INFO:5, REASONING:6 }\n//\n// 作用域规则：\n//   - disabled 的规则跳过；\n//   - prompt 侧：markdownOnly && !promptOnly 的规则只用于显示，不进提示词；\n//   - 显示侧：promptOnly && !markdownOnly 的规则只用于提示词，不用于显示（客户端已实现）。\n//\n// 本机架构的限制：DSH 的 `agent/request` 明确「不能改消息」，assistant 历史不可改写，\n// 所以 placement=2（AI 输出）的 prompt 侧规则目前只作用于**新生成的显示**，\n// 无法回写历史（要等 Shadow Chat）。Host 这里负责 USER_INPUT 与 WORLD_INFO。\n\nconst REGEX_PLACEMENT = {\n  USER_INPUT: 1,\n  AI_OUTPUT: 2,\n  SLASH_COMMAND: 3,\n  MD_DISPLAY: 4,\n  WORLD_INFO: 5,\n  REASONING: 6,\n};\n\n/** 把 ST 的 `/pattern/flags` 文本编译成正则；不是该形式时按普通字符串处理。 */\nfunction compileFindRegex(raw) {\n  const source = String(raw ?? '');\n  if (!source) return null;\n  const slash = source.match(/^\\/([\\s\\S]*)\\/([a-z]*)$/);\n  try {\n    if (slash) return new RegExp(slash[1], slash[2]);\n    return new RegExp(source, 'g');\n  } catch {\n    return null;\n  }\n}\n\n/** 归一化一条规则（容忍 ST 各版本的字段名差异）。 */\nfunction normalizeRegexRule(rule, index = 0) {\n  if (!rule || typeof rule !== 'object') return null;\n  const scriptName = rule.scriptName ?? rule.name ?? `rule-${index}`;\n  const findRegex = rule.findRegex ?? rule.find_regex ?? '';\n  const placementRaw = rule.placement ?? rule.placements ?? [];\n  const placement = (Array.isArray(placementRaw) ? placementRaw : [placementRaw])\n    .map((value) => Number(value))\n    .filter((value) => Number.isFinite(value));\n  return {\n    id: rule.id ?? scriptName,\n    name: scriptName,\n    findRegex,\n    replaceString: rule.replaceString ?? rule.replace_string ?? '',\n    placement,\n    disabled: rule.disabled === true || rule.enabled === false,\n    markdownOnly: rule.markdownOnly === true,\n    promptOnly: rule.promptOnly === true,\n    minDepth: rule.minDepth ?? null,\n    maxDepth: rule.maxDepth ?? null,\n    runOnEdit: rule.runOnEdit === true,\n  };\n}\n\nfunction normalizeRegexRules(rules) {\n  return (Array.isArray(rules) ? rules : [])\n    .map((rule, index) => normalizeRegexRule(rule, index))\n    .filter(Boolean);\n}\n\n/** 从角色卡 / 预设的原始对象里收集正则脚本（去重后按出现顺序）。 */\nfunction collectRegexRules(cardRaw, presetRaw) {\n  const pick = (raw) => {\n    const inner = raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object' ? raw.data : raw;\n    const extensions = inner && typeof inner.extensions === 'object' ? inner.extensions : null;\n    const list = extensions?.regex_scripts ?? extensions?.regexScripts;\n    return Array.isArray(list) ? list : [];\n  };\n  const seen = new Set();\n  const rules = [];\n  for (const rule of [...pick(cardRaw), ...pick(presetRaw)]) {\n    const normalized = normalizeRegexRule(rule, rules.length);\n    if (!normalized) continue;\n    const key = normalized.id + '|' + normalized.findRegex + '|' + normalized.replaceString;\n    if (seen.has(key)) continue;\n    seen.add(key);\n    rules.push(normalized);\n  }\n  return rules;\n}\n\n/**\n * 判断这条规则是否作用于某个位置。\n * @param {ReturnType<typeof normalizeRegexRule>} rule\n * @param {number} placement REGEX_PLACEMENT\n * @param {{ isPrompt?: boolean, depth?: number|null }} [options]\n */\nfunction isRuleApplicable(rule, placement, options = {}) {\n  if (!rule || rule.disabled) return false;\n  if (rule.placement.length && !rule.placement.includes(Number(placement))) return false;\n  if (options.isPrompt) {\n    // 只用于显示的规则不进提示词\n    if (rule.markdownOnly && !rule.promptOnly) return false;\n  } else if (rule.promptOnly && !rule.markdownOnly) {\n    // 只用于提示词的规则不进显示\n    return false;\n  }\n  const depth = options.depth;\n  if (Number.isFinite(Number(depth))) {\n    const min = Number(rule.minDepth);\n    const max = Number(rule.maxDepth);\n    if (Number.isFinite(min) && Number(depth) < min) return false;\n    if (Number.isFinite(max) && Number(depth) > max) return false;\n  }\n  return true;\n}\n\n/**\n * 对一个位置应用所有匹配的规则。\n * @param {string} text\n * @param {Array} rules 已归一化或原始规则数组\n * @param {number} placement REGEX_PLACEMENT\n * @param {{ isPrompt?: boolean, depth?: number|null, onError?: (rule:object, error:Error)=>void }} [options]\n */\nfunction applyRegexScripts(text, rules, placement, options = {}) {\n  let out = String(text ?? '');\n  if (!out) return out;\n  const list = Array.isArray(rules) ? rules : [];\n  for (const rawRule of list) {\n    const rule = rawRule && rawRule.placement ? rawRule : normalizeRegexRule(rawRule);\n    if (!isRuleApplicable(rule, placement, options)) continue;\n    const re = compileFindRegex(rule.findRegex);\n    if (!re) continue;\n    try {\n      out = out.replace(re, String(rule.replaceString ?? ''));\n    } catch (error) {\n      if (options.onError) options.onError(rule, error);\n    }\n  }\n  return out;\n}\n\n/** 只有 prompt 侧会用到：世界书正文（placement=5）。 */\nfunction applyWorldInfoRegex(text, rules, options = {}) {\n  return applyRegexScripts(text, rules, REGEX_PLACEMENT.WORLD_INFO, { ...options, isPrompt: true });\n}\n\n/** 只有 prompt 侧会用到：用户输入（placement=1）。 */\nfunction applyUserInputRegex(text, rules, options = {}) {\n  return applyRegexScripts(text, rules, REGEX_PLACEMENT.USER_INPUT, { ...options, isPrompt: true });\n}\n\n  return { REGEX_PLACEMENT: REGEX_PLACEMENT, applyRegexScripts: applyRegexScripts, applyUserInputRegex: applyUserInputRegex, applyWorldInfoRegex: applyWorldInfoRegex, collectRegexRules: collectRegexRules, compileFindRegex: compileFindRegex, isRuleApplicable: isRuleApplicable, normalizeRegexRule: normalizeRegexRule, normalizeRegexRules: normalizeRegexRules };\n  });\n\n  define('prompt', function (__require) {\n// 提示词组装：复刻 ST 的 system 段顺序（设计文档 §14.3）+ 深度注入。\r\n// v2：跨块 EJS（整段配对）、注入条目也走渲染、记录可诊断的组装轨迹。\r\n\r\nconst { substitute } = __require('macros');\r\nconst { renderEjs } = __require('ejs');\r\nconst { joinDecorated } = __require('decorators');\r\n\r\n/** ST 的内置 marker（位置占位符，不产出文本）。 */\r\nconst MARKERS = new Set([\r\n  'main', 'worldInfoBefore', 'worldInfoAfter', 'charDescription', 'charPersonality',\r\n  'scenario', 'personaDescription', 'chatHistory', 'enhanceDefinitions', 'nsfw', 'jailbreak',\r\n]);\r\n\r\nfunction parsePreset(json) {\r\n  if (!json || typeof json !== 'object') return null;\r\n  const prompts = Array.isArray(json.prompts) ? json.prompts : [];\r\n  const order = Array.isArray(json.prompt_order) && json.prompt_order[0]?.order\r\n    ? json.prompt_order[0].order\r\n    : prompts.map((p) => ({ identifier: p.identifier, enabled: true }));\r\n  return {\r\n    name: json.name || json.preset_name || '导入的预设',\r\n    prompts,\r\n    order,\r\n    raw: json,\r\n  };\r\n}\r\n\r\n/**\r\n * 应用客户端的面板覆盖（启停、顺序）。不修改原始预设对象。\r\n * @param {object} preset\r\n * @param {{ prompts?: Record<string, {enabled?: boolean, content?: string}> | {identifier: string, enabled?: boolean}[], order?: {identifier: string, enabled?: boolean}[] }} overrides\r\n */\r\nfunction applyPresetOverrides(preset, overrides) {\r\n  if (!preset || !overrides || typeof overrides !== 'object') return preset;\r\n  const promptChanges = new Map();\r\n  if (Array.isArray(overrides.prompts)) {\r\n    for (const item of overrides.prompts) {\r\n      if (item && typeof item.identifier === 'string') promptChanges.set(item.identifier, item);\r\n    }\r\n  } else if (overrides.prompts && typeof overrides.prompts === 'object') {\r\n    for (const [identifier, change] of Object.entries(overrides.prompts)) {\r\n      if (typeof change === 'boolean' || (change && typeof change === 'object')) promptChanges.set(identifier, change);\r\n    }\r\n  }\r\n\r\n  const prompts = preset.prompts.map((prompt) => {\r\n    const change = promptChanges.get(prompt.identifier);\r\n    if (change === undefined) return prompt;\r\n    const next = { ...prompt };\r\n    if (typeof change === 'boolean') next.enabled = change;\r\n    else {\r\n      if (typeof change.enabled === 'boolean') next.enabled = change.enabled;\r\n      if (typeof change.content === 'string') next.content = change.content;\r\n    }\r\n    return next;\r\n  });\r\n\r\n  const order = Array.isArray(overrides.order) && overrides.order.length\r\n    ? overrides.order.map((slot) => ({ ...slot }))\r\n    : preset.order;\r\n\r\n  return { ...preset, prompts, order };\r\n}\r\n\r\nfunction promptByIdentifier(preset, identifier) {\r\n  return preset?.prompts.find((p) => p.identifier === identifier);\r\n}\r\n\r\nfunction markerContent(marker, { card, lorebook, env, persona, preset, decorate }) {\r\n  const join = (list) => (decorate ? decorate(list) : (list?.length ? list.join('\\n') : ''));\r\n  const enabled = (identifier) => {\r\n    const slot = Array.isArray(preset?.order) ? preset.order.find((entry) => entry.identifier === identifier) : null;\r\n    if (slot && slot.enabled === false) return false;\r\n    const prompt = preset?.prompts.find((entry) => entry.identifier === identifier);\r\n    return !prompt || prompt.enabled !== false;\r\n  };\r\n  switch (marker) {\r\n    case 'worldInfoBefore': return enabled('worldInfoBefore') ? join(lorebook?.buckets?.before) : '';\r\n    case 'worldInfoAfter': return enabled('worldInfoAfter') ? join(lorebook?.buckets?.after) : '';\r\n    case 'charDescription': return enabled('charDescription') ? (card?.description ?? '') : '';\r\n    case 'charPersonality': return enabled('charPersonality') ? (card?.personality ?? '') : '';\r\n    case 'scenario': return enabled('scenario') ? (card?.scenario ?? '') : '';\r\n    case 'personaDescription': return persona?.description ?? '';\r\n    case 'main': {\r\n      if (!enabled('main')) return '';\r\n      const main = preset?.prompts.find((p) => p.identifier === 'main');\r\n      return main ? (main.content ?? '') : '';\r\n    }\r\n    case 'enhanceDefinitions': return '';\r\n    case 'nsfw':\r\n    case 'jailbreak': {\r\n      const p = promptByIdentifier(preset, marker);\r\n      return p && p.enabled !== false ? (p.content ?? '') : '';\r\n    }\r\n    default: return '';\r\n  }\r\n}\r\n\r\n/**\r\n * 渲染 system 段、tail 段与\"在对话中按深度注入\"的条目。\r\n * ST 语义：injection_position = 0（相对 system）/ 1（绝对注入，按 injection_depth 插进对话）。\r\n *\r\n * 跨块 EJS：先收集原文，最后整段渲染——模板允许 `<%` 在上一块、`%>` 在下一块。\r\n *\r\n * @returns {{\r\n *   system: string,\r\n *   tail: string,\r\n *   depth: {role:string, content:string}[],\r\n *   injected: {role:string, content:string, depth:number}[],\r\n *   trace: { parts: {label:string, chars:number, rendered:number}[], depth: number, injected: number, preset: string|null }\r\n * }}\r\n */\r\nfunction renderPrompt({ card, preset, lorebook, persona, env, macroOptions, ejsScope = {} }) {\r\n  const parts = [];\r\n  const injectedRaw = [];\r\n  const trace = { parts: [], depth: 0, injected: 0, preset: preset?.name ?? null };\r\n\r\n  // ① EJS → ② ST 宏（顺序与 ST-Prompt-Template 一致）\r\n  const render = (text) => substitute(renderEjs(String(text ?? ''), ejsScope), env, macroOptions);\r\n\r\n  // 先收集原文，最后整段渲染：EJS 允许跨块配对（<% 在此、%> 在彼）\r\n  const push = (text, label) => {\r\n    const raw = String(text ?? '');\r\n    if (!raw.trim()) return;\r\n    parts.push(raw);\r\n    trace.parts.push({ label: label || 'part', chars: raw.length, rendered: 0 });\r\n  };\r\n\r\n  const consumePrompt = (prompt) => {\r\n    if (!prompt || prompt.enabled === false) return;\r\n    const content = prompt.content;\r\n    if (!content) return;\r\n    const isAbsolute = Number(prompt.injection_position) === 1;\r\n    if (isAbsolute) {\r\n      const depth = Number(prompt.injection_depth) || 0;\r\n      injectedRaw.push({ role: prompt.role || 'system', content, depth, label: prompt.name || prompt.identifier || 'inject' });\r\n      return;\r\n    }\r\n    push(content, prompt.name || prompt.identifier || 'prompt');\r\n  };\r\n\r\n  const hasOrder = Array.isArray(preset?.order) && preset.order.length > 0;\r\n\r\n  // ST 的固定内置段（§14.3）：无论 prompt_order 是否列出，都按这个顺序在前。\r\n  // prompt_order 只决定\"用户 prompt\"部分的顺序。\r\n  const builtins = ['worldInfoBefore', 'main', 'worldInfoAfter', 'charDescription', 'charPersonality', 'scenario', 'personaDescription', 'nsfw', 'jailbreak'];\r\n  const decorate = (list) => joinDecorated(list, ejsScope, '\\n');\r\n  for (const marker of builtins) {\r\n    push(markerContent(marker, { card, lorebook, env, persona, preset, decorate }), `marker:${marker}`);\r\n  }\r\n\r\n  if (hasOrder) {\r\n    for (const slot of preset.order) {\r\n      if (!slot || slot.enabled === false) continue;\r\n      const identifier = slot.identifier;\r\n      // 内置段已在前面处理；marker 只表示位置，不重复消费。\r\n      if (MARKERS.has(identifier)) continue;\r\n      consumePrompt(promptByIdentifier(preset, identifier));\r\n    }\r\n  }\r\n\r\n  // 卡自带的 system_prompt 追加在预设之后；depth_prompt 只进深度桶，不再重复进 system。\r\n  push(card?.systemPrompt, 'card:systemPrompt');\r\n\r\n  const system = render(parts.join('\\n\\n')).trim();\r\n\r\n  const tailPartsRaw = [];\r\n  for (const item of lorebook?.buckets?.ANTop ?? []) tailPartsRaw.push(item);\r\n  for (const item of lorebook?.buckets?.ANBottom ?? []) tailPartsRaw.push(item);\r\n  if (card?.postHistoryInstructions) tailPartsRaw.push(card.postHistoryInstructions);\r\n  const tail = render(joinDecorated(tailPartsRaw, ejsScope, '\\n\\n')).trim();\r\n\r\n  const depth = [];\r\n  for (const group of lorebook?.buckets?.depth ?? []) {\r\n    const content = render(joinDecorated(group.entries, ejsScope, '\\n\\n')).trim();\r\n    if (content) depth.push({ role: group.role || 'system', content, depth: Number(group.depth) || 0 });\r\n  }\r\n  if (card?.depthPrompt?.prompt) {\r\n    const content = render(card.depthPrompt.prompt).trim();\r\n    if (content) depth.push({ role: card.depthPrompt.role || 'system', content, depth: Number(card.depthPrompt.depth) || 0 });\r\n  }\r\n\r\n  // 绝对注入条目也要渲染；放在最后，能看见前面 setvar 的变量。\r\n  const injected = [];\r\n  for (const item of injectedRaw) {\r\n    const content = render(item.content).trim();\r\n    if (content) injected.push({ role: item.role, content, depth: item.depth });\r\n  }\r\n\r\n  trace.depth = depth.length;\r\n  trace.injected = injected.length;\r\n  return { system, tail, depth, injected, trace };\r\n}\n\n  return { MARKERS: MARKERS, applyPresetOverrides: applyPresetOverrides, parsePreset: parsePreset, renderPrompt: renderPrompt };\n  });\n\n  define('card', function (__require) {\n// 角色卡归一化：兼容 Character Card V2（字段在顶层）与 V3（字段包在 data 里）。\r\n\r\nconst str = (v) => (typeof v === 'string' ? v : '');\r\nconst arr = (v) => (Array.isArray(v) ? v : []);\r\n\r\nfunction pickExtension(extensions, key) {\r\n  if (!extensions || typeof extensions !== 'object') return undefined;\r\n  return extensions[key];\r\n}\r\n\r\n/**\r\n * @param {any} raw 已解析的卡 JSON\r\n * @returns 归一化后的卡（保留原始对象在 raw 字段，写回时用）\r\n */\r\nfunction normalizeCard(raw) {\r\n  const isV3 = raw && typeof raw.spec === 'string' && raw.spec.startsWith('chara_card_v3') && raw.data;\r\n  const inner = isV3 ? raw.data : raw || {};\r\n  const extensions = inner.extensions && typeof inner.extensions === 'object' ? inner.extensions : {};\r\n\r\n  const characterBook = inner.character_book ?? null;\r\n  const th = pickExtension(extensions, 'tavern_helper') ?? null;\r\n  const thScripts = arr(th?.scripts);\r\n  const regexScripts = arr(pickExtension(extensions, 'regex_scripts'));\r\n  const depthPrompt = pickExtension(extensions, 'depth_prompt') ?? null;\r\n\r\n  return {\r\n    spec: isV3 ? String(raw.spec) : 'chara_card_v2',\r\n    specVersion: str(inner.character_version),\r\n    name: str(inner.name) || '未命名角色',\r\n    creator: str(inner.creator),\r\n    characterVersion: str(inner.character_version),\r\n    description: str(inner.description),\r\n    personality: str(inner.personality),\r\n    scenario: str(inner.scenario),\r\n    firstMes: str(inner.first_mes),\r\n    mesExample: str(inner.mes_example),\r\n    systemPrompt: str(inner.system_prompt),\r\n    postHistoryInstructions: str(inner.post_history_instructions),\r\n    creatorNotes: str(inner.creator_notes),\r\n    tags: arr(inner.tags).filter((t) => typeof t === 'string'),\r\n    alternateGreetings: arr(inner.alternate_greetings).filter((t) => typeof t === 'string'),\r\n    characterBook,\r\n    depthPrompt: depthPrompt && typeof depthPrompt === 'object'\r\n      ? { prompt: str(depthPrompt.prompt), depth: Number(depthPrompt.depth) || 4, role: str(depthPrompt.role) || 'system' }\r\n      : null,\r\n    extensions,\r\n    thScripts,\r\n    regexScripts,\r\n    raw,\r\n  };\r\n}\r\n\r\n/** 面板/日志用的精简摘要（不带走几 MB 的脚本正文）。 */\r\nfunction summarizeCard(card) {\r\n  const bookEntries = arr(card.characterBook?.entries);\r\n  const enabledScripts = card.thScripts.filter((s) => s && s.enabled);\r\n  return {\r\n    name: card.name,\r\n    creator: card.creator,\r\n    spec: card.spec,\r\n    version: card.characterVersion,\r\n    tags: card.tags.slice(0, 8),\r\n    counts: {\r\n      description: card.description.length,\r\n      firstMes: card.firstMes.length,\r\n      greetings: card.alternateGreetings.length,\r\n      examples: card.mesExample.length,\r\n      lorebookEntries: bookEntries.length,\r\n      lorebookChars: bookEntries.reduce((n, e) => n + str(e?.content).length, 0),\r\n      regexScripts: card.regexScripts.length,\r\n      thScripts: card.thScripts.length,\r\n      thScriptsEnabled: enabledScripts.length,\r\n    },\r\n    worldName: str(card.characterBook?.name) || str(card.extensions?.world),\r\n    hasTavernHelper: card.thScripts.length > 0 || Boolean(card.extensions?.tavern_helper),\r\n    depthPrompt: card.depthPrompt,\r\n  };\r\n}\n\n  return { normalizeCard: normalizeCard, summarizeCard: summarizeCard };\n  });\n\n  define('pipeline', function (__require) {\n// 提示词管线（同构）：卡 + 预设 + 变量 + 世界书 → system / 深度注入 / 完整段。\n//\n// 这个模块**不碰 Node API**（无 fs/path），所以同一份代码可以：\n//   1) 在 Host 里跑（agent.js、tools/snapshot.mjs、tools/check.mjs）；\n//   2) 经 tools/bundle-lib.mjs 打同构包后，在面板里做\"发送前预览\"。\n// 两边共用同一实现，预览与实际请求就不会漂移。\n//\n// 顺序（与 ST-Prompt-Template / ST 一致）：\n//   世界书条目：装饰器（@@if 等）→ prompt 作用域正则（placement=5）\n//   提示词正文：EJS（跨块）→ ST 宏\n//   用户输入：placement=1 正则（由调用方在 pre-step 里做）\n\nconst { createMacroEnv } = __require('macros');\nconst { createEjsScope } = __require('ejs');\nconst { applyWorldInfoDecorators } = __require('decorators');\nconst { activateEntries, normalizeCharacterBookEntries, createWorldInfoSession } = __require('lorebook');\nconst { renderPrompt } = __require('prompt');\nconst { collectRegexRules, applyWorldInfoRegex } = __require('regex');\n\nconst EJS_ERROR_RE = /<!-- dsh-tt EJS error: ([\\s\\S]*?) -->/g;\n\n/** 深度/绝对注入按深度降序拼接：深度 0 最靠近对话，所以放在最后。 */\nfunction composeDepthText(depth, injected) {\n  const items = [\n    ...(injected || []).map((item) => ({ ...item, depth: Number(item.depth) || 0 })),\n    ...(depth || []).map((item) => ({ ...item, depth: Number(item.depth) || 0 })),\n  ];\n  items.sort((a, b) => (Number(b.depth) || 0) - (Number(a.depth) || 0));\n  return items.map((item) => item.content).filter(Boolean).join('\\n\\n');\n}\n\n/** 开场白块：开场白只显示不发送，但要让模型知道自己说过这句。 */\nfunction greetingBlockOf(greeting) {\n  const text = String(greeting ?? '').trim();\n  return text ? `[你的开场白（已作为本局对话的第一条消息发给玩家）]\\n${text}` : '';\n}\n\n/** 世界书扫描文本：卡的描述 / 开场白 / 前三条备选 / 场景。 */\nfunction scanTextOf(card) {\n  return [card?.description, card?.firstMes, ...(card?.alternateGreetings ?? []).slice(0, 3), card?.scenario]\n    .filter(Boolean).join('\\n');\n}\n\n/**\n * 跑一次完整管线。\n * @param {object} input\n * @param {object} input.card 归一化后的卡（`normalizeCard` 的结果即可）\n * @param {object|null} input.preset `parsePreset` 的结果\n * @param {Record<string, unknown>} [input.variables] EJS/装饰器可见的变量\n * @param {string} [input.userName]\n * @param {number} [input.maxContext]\n * @param {number} [input.worldInfoBudget] 缺省 = maxContext * 0.25\n * @param {object} [input.session] 世界书计时状态（缺省新建，不跨轮记忆）\n * @param {boolean} [input.recursive]\n * @param {number} [input.maxRecursionSteps]\n * @param {number} [input.minActivations]\n * @param {string} [input.greeting]\n * @param {Array} [input.regexRules] 已归一化的正则规则；缺省从卡/预设收集\n * @param {Array} [input.entries] 世界书条目（缺省取卡内 character_book）\n * @param {(kind:string, error:unknown)=>void} [input.onError]\n */\nfunction runPromptPipeline(input = {}) {\n  const card = input.card ?? null;\n  const preset = input.preset ?? null;\n  const variables = input.variables && typeof input.variables === 'object' ? input.variables : {};\n  const userName = input.userName || '你';\n  const maxContext = Number(input.maxContext) || 128000;\n  const budget = Number(input.worldInfoBudget) || Math.round(maxContext * 0.25);\n  const session = input.session ?? createWorldInfoSession();\n  const errors = { ejs: [], regex: [] };\n  const report = input.onError || (() => {});\n\n  const regexRules = Array.isArray(input.regexRules)\n    ? input.regexRules\n    : collectRegexRules(card?.raw, preset?.raw);\n  const entries = Array.isArray(input.entries)\n    ? input.entries\n    : normalizeCharacterBookEntries(card?.characterBook);\n\n  const env = createMacroEnv({ card, userName, maxPrompt: maxContext, maxContext });\n  const lorebookByName = new Map();\n  const scope = createEjsScope(variables, {\n    getwi: (name) => lorebookByName.get(name) ?? '',\n    getchar: () => card?.name ?? '',\n    resolve: (key) => (env && key in env ? env[key] : undefined),\n  });\n\n  const lorebook = activateEntries({\n    entries,\n    scanText: scanTextOf(card),\n    budget,\n    // ST 的顺序：装饰器先求值，再对最终正文过一次世界书正则（placement=5）。\n    decorateEntry: (entry) => applyWorldInfoRegex(\n      applyWorldInfoDecorators(entry.content, scope),\n      regexRules,\n      {\n        onError: (rule, error) => {\n          if (errors.regex.length < 5) errors.regex.push(`${rule.name}: ${error?.message || error}`);\n          report('regex', error);\n        },\n      },\n    ),\n    session,\n    recursive: input.recursive !== false,\n    maxRecursionSteps: input.maxRecursionSteps == null ? undefined : Number(input.maxRecursionSteps),\n    minActivations: Number(input.minActivations) || 0,\n  });\n  for (const entry of lorebook.activated) lorebookByName.set(entry.comment, entry.content);\n\n  const rendered = renderPrompt({ card, preset, lorebook, env, ejsScope: scope });\n  const systemText = [rendered.system, rendered.tail].filter(Boolean).join('\\n\\n');\n  const depthText = composeDepthText(rendered.depth, rendered.injected);\n  const greetingBlock = greetingBlockOf(input.greeting);\n  const sectionText = [systemText, depthText, greetingBlock].filter(Boolean).join('\\n\\n');\n\n  const combined = `${systemText}\\n${depthText}`;\n  for (const match of combined.matchAll(EJS_ERROR_RE)) {\n    if (errors.ejs.length < 5) errors.ejs.push(match[1]);\n  }\n\n  return {\n    card,\n    preset,\n    entries,\n    regexRules,\n    env,\n    scope,\n    lorebook,\n    rendered,\n    systemText,\n    depthText,\n    greetingBlock,\n    sectionText,\n    errors,\n    stats: {\n      systemChars: systemText.length,\n      depthChars: depthText.length,\n      sectionChars: sectionText.length,\n      worldInfo: lorebook.stats,\n      depthGroups: rendered.depth.length,\n      injectedCount: rendered.injected.length,\n      parts: rendered.trace.parts.length,\n    },\n  };\n}\n\n  return { composeDepthText: composeDepthText, greetingBlockOf: greetingBlockOf, runPromptPipeline: runPromptPipeline, scanTextOf: scanTextOf };\n  });\n\n  return {\n    ejs: __require('ejs'),\n    macros: __require('macros'),\n    decorators: __require('decorators'),\n    lorebook: __require('lorebook'),\n    regex: __require('regex'),\n    prompt: __require('prompt'),\n    card: __require('card'),\n    pipeline: __require('pipeline')\n  };\n})();\n";
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
      const shim = String(TAVERN_SHIM_SRC).replace(/<\/script/gi, '<\\/script');
      return [
        '<!doctype html><html><head><meta charset="utf-8">',
        '<style>html,body{margin:0;padding:0;background:#fff;color:#1c1c1e;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
        '#tt-fallback{padding:24px;font-size:12px;color:#888;}',
        '.TH-toastr{}</style></head><body>',
        '<div id="chat"></div><div id="extensions_settings"></div><div id="tt-fallback">TH 脚本界面</div>',
        `<script>window.__TT_INIT__ = ${safeJson};<\/script>`,
        `<script>${core}<\/script>`,
        `<script>${shim}<\/script>`,
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
      const [view, setView] = useState('chat');
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
      }, [view, assetTick, ttTick, activeCardRaw, activePresetRaw, activePreset, presetOverridesOf, ttVars, greeting]);

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
          [['chat', '对话'], ['cards', '角色'], ['lore', '世界书'], ['presets', '预设'], ['preview', '预览'], ['extensions', '扩展'], ['settings', '设置']].map(([key, label]) =>
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
        h('p', { className: 'tt-sub' }, '酒馆助手（JS-Slash-Runner）以只读兼容层内置运行；提示词模板由 Host 的 EJS 引擎承担。'),
        h('div', { className: 'tt-inline', style: { marginBottom: '12px' } },
          h('button', { className: 'tt-btn', onClick: () => setThShow(true) }, '打开脚本界面'),
          h('button', { className: 'tt-btn', onClick: () => setThReload((tick) => tick + 1) }, '重启宿主'),
          h('button', { className: 'tt-btn', onClick: () => { updateTh((prev) => ({ ...prev, messages: { ...(prev.messages || {}), [activeId]: {} }, overrides: { ...(prev.overrides || {}), [activeId]: {} } })); } }, '清空本局变量'),
          h('span', { className: 'tt-note' }, thReady ? '宿主运行中' : (cardScripts.length ? '宿主未启动（检查卡/会话）' : '这张卡没有 TH 脚本')),
        ),
        h('div', { className: 'tt-section' }, `卡内脚本（${enabledScripts.length}/${cardScripts.length} 启用）`),
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
        ),
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

      const pane = view === 'cards' ? cardsPane
        : view === 'lore' ? lorePane
          : view === 'presets' ? presetsPane
            : view === 'preview' ? previewPane
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
            () => h('div', { style: { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' } },
              h(Boundary, null, h(Panel, { __ctx: ctx }))),
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
