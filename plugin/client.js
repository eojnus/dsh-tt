// 角色扮演（Client）—— 面板：局列表 / 窄顶栏 / 聊天区 / composer / 资产与 TH 宿主
// 构建时由 tools/build-client.mjs 注入资产快照、TH 核心与 shim 源码。
window.__ModuleLoader__.load({
  id: '@dsh-tt/roleplay',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useMemo, useRef, useCallback } = React;

    const SNAPSHOT = {"version":3,"generatedAt":"2026-11-14T18:51:21.220Z","roots":["X:\\dsh-tt\\参考","X:\\dsh-tt\\assets"],"counts":{"cards":1,"presets":1,"lorebooks":0,"errors":0},"cards":[{"id":"春日狂想曲-统一版-玩家通道-0","file":"IMG_4552.PNG","filePath":"X:\\dsh-tt\\参考\\IMG_4552.PNG","name":"春日狂想曲·统一版（玩家通道）","creator":"时之写卡器","spec":"chara_card_v3","version":"unified-v1.22-player","tags":[],"counts":{"description":20,"firstMes":33,"greetings":3,"examples":827,"lorebookEntries":126,"lorebookChars":282547,"regexScripts":14,"thScripts":15,"thScriptsEnabled":2},"worldName":"同层版-春日狂想曲","hasTavernHelper":true,"depthPrompt":{"prompt":"","depth":4,"role":"system"},"hasFilePath":true}],"presets":[{"id":"导入的预设-0","file":"梦鲸思客V5-1030-exp.json","filePath":"X:\\dsh-tt\\参考\\梦鲸思客V5-1030-exp.json","name":"导入的预设","counts":{"prompts":122,"enabled":44,"markers":8,"chars":32084,"temperature":1,"maxTokens":30000}}],"lorebooks":[],"errors":[]};
    const TAVERN_CORE_SRC = "/* 酒馆助手（TavernHelper）兼容运行时的纯状态层。\n *\n * 这里只做数据与语义：变量五个作用域、聊天消息、事件总线、世界书、宏、STScript 子集。\n * DOM / iframe / postMessage 由 shim.js 负责。文件同时能被 Node 直接 require（测试用）。\n */\nvar TT_CORE = (function () {\n  'use strict';\n\n  // ── 通用工具 ────────────────────────────────────────────────\n  function clone(value) {\n    if (value == null || typeof value !== 'object') return value;\n    try { return structuredClone(value); } catch { /* ignore */ }\n    try { return JSON.parse(JSON.stringify(value)); } catch { return value; }\n  }\n\n  function isPlainObject(value) {\n    if (value == null || typeof value !== 'object') return false;\n    var proto = Object.getPrototypeOf(value);\n    return proto === Object.prototype || proto === null;\n  }\n\n  function toPath(path) {\n    if (Array.isArray(path)) return path.slice();\n    if (path == null) return [];\n    return String(path)\n      .replace(/\\[(\\d+)\\]/g, '.$1')\n      .replace(/\\[[\"']([^\"']+)[\"']\\]/g, '.$1')\n      .split('.')\n      .filter(function (part) { return part !== ''; });\n  }\n\n  function getPath(object, path, fallback) {\n    if (object == null) return fallback;\n    var parts = toPath(path);\n    if (!parts.length) return object;\n    var current = object;\n    for (var i = 0; i < parts.length; i += 1) {\n      if (current == null) return fallback;\n      current = current[parts[i]];\n    }\n    return current === undefined ? fallback : current;\n  }\n\n  function setPath(object, path, value) {\n    var parts = toPath(path);\n    if (!parts.length) return object;\n    var current = object;\n    for (var i = 0; i < parts.length - 1; i += 1) {\n      var part = parts[i];\n      if (current[part] == null || typeof current[part] !== 'object') current[part] = {};\n      current = current[part];\n    }\n    current[parts[parts.length - 1]] = value;\n    return object;\n  }\n\n  function hasPath(object, path) {\n    if (object == null) return false;\n    var parts = toPath(path);\n    if (!parts.length) return false;\n    var current = object;\n    for (var i = 0; i < parts.length; i += 1) {\n      if (current == null || !Object.prototype.hasOwnProperty.call(current, parts[i])) return false;\n      current = current[parts[i]];\n    }\n    return true;\n  }\n\n  function deletePath(object, path) {\n    var parts = toPath(path);\n    if (!parts.length || object == null) return false;\n    var current = object;\n    for (var i = 0; i < parts.length - 1; i += 1) {\n      if (current == null || !Object.prototype.hasOwnProperty.call(current, parts[i])) return false;\n      current = current[parts[i]];\n    }\n    if (current == null) return false;\n    return delete current[parts[parts.length - 1]];\n  }\n\n  function deepEqual(a, b) {\n    if (a === b) return true;\n    if (typeof a !== typeof b) return false;\n    if (a == null || b == null) return false;\n    if (Array.isArray(a) !== Array.isArray(b)) return false;\n    if (typeof a !== 'object') return false;\n    var keysA = Object.keys(a);\n    var keysB = Object.keys(b);\n    if (keysA.length !== keysB.length) return false;\n    for (var i = 0; i < keysA.length; i += 1) {\n      if (!Object.prototype.hasOwnProperty.call(b, keysA[i]) || !deepEqual(a[keysA[i]], b[keysA[i]])) return false;\n    }\n    return true;\n  }\n\n  function hashSignature(value) {\n    var source;\n    try { source = JSON.stringify(value); } catch { source = String(value); }\n    var hash = 2166136261;\n    for (var i = 0; i < source.length; i += 1) {\n      hash ^= source.charCodeAt(i);\n      hash = Math.imul(hash, 16777619);\n    }\n    return (hash >>> 0).toString(36) + ':' + source.length;\n  }\n\n  function pad(value) { return String(value).padStart(2, '0'); }\n\n  function randomPick(list, random) {\n    if (!list || !list.length) return '';\n    return list[Math.floor(random() * list.length)];\n  }\n\n  function splitArgs(inner, sep) {\n    if (inner.indexOf(sep) >= 0) return inner.split(sep).filter(function (part) { return part !== ''; });\n    if (inner.indexOf(' ') >= 0) return inner.split(/\\s+/).filter(Boolean);\n    return [inner];\n  }\n\n  // ── 事件总线 ────────────────────────────────────────────────\n  function createEventBus(onError) {\n    var listeners = new Map();\n\n    function listOf(type) {\n      if (!listeners.has(type)) listeners.set(type, []);\n      return listeners.get(type);\n    }\n\n    function add(type, listener, mode) {\n      if (typeof listener !== 'function') throw new Error('事件监听器必须是函数');\n      var entry = { fn: listener, mode: mode || 'normal' };\n      var list = listOf(type);\n      if (mode === 'first') list.unshift(entry);\n      else if (mode === 'last') list.push(entry);\n      else {\n        // TH 语义：同类型事件里相同函数只注册一次\n        if (list.some(function (item) { return item.fn === listener; })) return { stop: function () {} };\n        list.push(entry);\n      }\n      return {\n        stop: function () { remove(type, listener); },\n      };\n    }\n\n    function remove(type, listener) {\n      var list = listOf(type);\n      var index = list.findIndex(function (item) { return item.fn === listener; });\n      if (index >= 0) list.splice(index, 1);\n    }\n\n    function emit(type) {\n      var args = Array.prototype.slice.call(arguments, 1);\n      var list = listOf(type).slice();\n      var pending = [];\n      for (var i = 0; i < list.length; i += 1) {\n        var entry = list[i];\n        if (entry.mode === 'once') remove(type, entry.fn);\n        try {\n          var result = entry.fn.apply(globalThis, args);\n          if (result && typeof result.then === 'function') pending.push(result.catch(function (error) { onError(type, error); }));\n        } catch (error) {\n          onError(type, error);\n        }\n      }\n      return pending.length ? Promise.allSettled(pending) : Promise.resolve();\n    }\n\n    return {\n      on: function (type, listener) { return add(type, listener, 'normal'); },\n      once: function (type, listener) { return add(type, listener, 'once'); },\n      makeFirst: function (type, listener) { return add(type, listener, 'first'); },\n      makeLast: function (type, listener) { return add(type, listener, 'last'); },\n      remove: remove,\n      emit: emit,\n      emitAndWait: emit,\n      clearEvent: function (type) { listeners.set(type, []); },\n      clearListener: function (listener) {\n        listeners.forEach(function (list, type) {\n          var kept = list.filter(function (item) { return item.fn !== listener; });\n          listeners.set(type, kept);\n        });\n      },\n      clearAll: function () { listeners.clear(); },\n      count: function (type) { return listOf(type).length; },\n    };\n  }\n\n  // ── 世界书 ──────────────────────────────────────────────────\n  var POSITION_MAP = { before_char: 0, after_char: 1, before_an: 2, after_an: 3, at_depth: 4, before_em: 5, after_em: 6 };\n\n  function normalizePosition(value) {\n    if (typeof value === 'number') return value;\n    return POSITION_MAP[value] == null ? 0 : POSITION_MAP[value];\n  }\n\n  function normalizeLogic(value) {\n    var number = Number(value);\n    return Number.isFinite(number) ? number : 0;\n  }\n\n  /** 把角色卡/世界书里的条目摊平成 TH 的 FlattenedWorldInfoEntry。 */\n  function flattenEntries(entries) {\n    var list = Array.isArray(entries) ? entries : [];\n    return list.map(function (entry, index) {\n      var ext = entry && typeof entry.extensions === 'object' && entry.extensions ? entry.extensions : {};\n      var keys = Array.isArray(entry && entry.keys) ? entry.keys : (Array.isArray(entry && entry.key) ? entry.key : []);\n      var secondary = Array.isArray(entry && entry.secondary_keys)\n        ? entry.secondary_keys\n        : (Array.isArray(entry && entry.keysecondary) ? entry.keysecondary : []);\n      return {\n        uid: entry && (entry.id != null ? entry.id : entry.uid != null ? entry.uid : index),\n        displayIndex: ext.display_index != null ? Number(ext.display_index) : index,\n        comment: String((entry && (entry.comment || entry.name)) || ''),\n        disable: entry ? (entry.enabled === false || entry.disable === true) : false,\n        constant: Boolean(entry && entry.constant),\n        selective: entry ? entry.selective !== false : true,\n        key: keys.map(String),\n        selectiveLogic: normalizeLogic(ext.selectiveLogic != null ? ext.selectiveLogic : (entry && entry.selectiveLogic)),\n        keysecondary: secondary.map(String),\n        scanDepth: ext.scan_depth == null ? null : Number(ext.scan_depth),\n        vectorized: Boolean(ext.vectorized),\n        position: normalizePosition(entry && entry.position != null ? entry.position : ext.position),\n        role: ext.role == null ? null : Number(ext.role),\n        depth: ext.depth == null ? 4 : Number(ext.depth),\n        order: Number(entry && entry.insertion_order != null\n          ? entry.insertion_order\n          : (entry && entry.order != null ? entry.order : 100)),\n        content: String((entry && entry.content) || ''),\n        useProbability: Boolean(ext.useProbability != null ? ext.useProbability : (entry && entry.useProbability)),\n        probability: Number(ext.probability != null ? ext.probability : 100),\n        excludeRecursion: Boolean(ext.exclude_recursion),\n        preventRecursion: Boolean(ext.prevent_recursion),\n        delayUntilRecursion: ext.delay_until_recursion == null ? false : ext.delay_until_recursion,\n        sticky: ext.sticky == null ? null : Number(ext.sticky),\n        cooldown: ext.cooldown == null ? null : Number(ext.cooldown),\n        delay: ext.delay == null ? null : Number(ext.delay),\n        extra: clone(ext),\n      };\n    });\n  }\n\n  // ── 主工厂 ──────────────────────────────────────────────────\n  /**\n   * @param {{\n   *   card?: object, userName?: string, charName?: string, chatId?: string,\n   *   worldbookName?: string, worldbookEntries?: any[],\n   *   variables?: {global?: object, character?: object, chat?: object, preset?: object, script?: object},\n   *   messages?: {role: string, text: string, vars?: object, hidden?: boolean, name?: string}[],\n   *   extensionSettings?: object,\n   *   post?: (message: object) => void,\n   *   log?: (level: string, text: string) => void,\n   * }} options\n   */\n  function createCore(options) {\n    var settings = options || {};\n    var post = typeof settings.post === 'function' ? settings.post : function () {};\n    var log = typeof settings.log === 'function' ? settings.log : function () {};\n    var card = settings.card && typeof settings.card === 'object' ? settings.card : {};\n    var userName = settings.userName || '你';\n    var charName = settings.charName || card.name || '角色';\n    var chatId = settings.chatId || 'dsh-tt-chat';\n    var worldbookName = settings.worldbookName || (card.character_book && card.character_book.name) || '角色世界书';\n    var worldbookEntries = flattenEntries(settings.worldbookEntries || (card.character_book && card.character_book.entries) || []);\n    var initialVars = settings.variables || {};\n\n    var globalVars = initialVars.global && typeof initialVars.global === 'object' ? initialVars.global : {};\n    var characterVars = initialVars.character && typeof initialVars.character === 'object' ? initialVars.character : {};\n    var presetVars = initialVars.preset && typeof initialVars.preset === 'object' ? initialVars.preset : {};\n    var scriptVars = initialVars.script && typeof initialVars.script === 'object' ? initialVars.script : {};\n    var chatMetadata = { variables: initialVars.chat && typeof initialVars.chat === 'object' ? initialVars.chat : {} };\n    var extensionSettings = settings.extensionSettings && typeof settings.extensionSettings === 'object'\n      ? settings.extensionSettings\n      : {};\n\n    var chat = [];\n    var macros = new Map();\n    var currentScriptId = 'dsh-tt-script';\n    var currentMessageId = -1;\n\n    function reportError(type, error) {\n      var message = error && error.stack ? error.stack : String(error);\n      log('error', '[' + type + '] ' + message);\n      post({ tt: 'log', level: 'error', text: '[' + type + '] ' + (error && error.message ? error.message : String(error)) });\n    }\n\n    var bus = createEventBus(reportError);\n\n    function makeMessage(input) {\n      var text = String(input && input.text != null ? input.text : '');\n      var role = input && input.role === 'user' ? 'user' : (input && input.role === 'system' ? 'system' : 'assistant');\n      var vars = input && input.vars && typeof input.vars === 'object' ? clone(input.vars) : {};\n      return {\n        name: input && input.name ? String(input.name) : (role === 'user' ? userName : charName),\n        is_user: role === 'user',\n        is_system: Boolean(input && input.hidden) || role === 'system',\n        mes: text,\n        swipe_id: 0,\n        swipes: [text],\n        swipe_info: [{}],\n        variables: [vars],\n        extra: {},\n      };\n    }\n\n    /** 用父窗口给的聊天记录刷新镜像；保留已有变量与脚本对正文的本地修改。 */\n    function applyChat(nextMessages, options) {\n      var opts = options || {};\n      var list = Array.isArray(nextMessages) ? nextMessages : [];\n      var added = [];\n      for (var i = 0; i < list.length; i += 1) {\n        var input = list[i] || {};\n        var text = String(input.text != null ? input.text : '');\n        var role = input.role === 'user' ? 'user' : (input.role === 'system' ? 'system' : 'assistant');\n        var hidden = Boolean(input.hidden);\n        var existing = chat[i];\n        if (!existing) {\n          existing = makeMessage({ role: role, text: text, vars: input.vars, hidden: hidden, name: input.name });\n          chat[i] = existing;\n          added.push(i);\n          continue;\n        }\n        var edited = existing.__ttEdited === true;\n        var keepLocal = edited && (existing.mes === text || existing.mes.indexOf(text) === 0);\n        if (!keepLocal) {\n          existing.mes = text;\n          existing.swipes[existing.swipe_id || 0] = text;\n          existing.__ttEdited = false;\n        }\n        existing.is_user = role === 'user';\n        existing.is_system = hidden || role === 'system';\n        if (input.name) existing.name = String(input.name);\n        if (opts.initial && input.vars && typeof input.vars === 'object') {\n          existing.variables[existing.swipe_id || 0] = clone(input.vars);\n        } else if (!existing.variables[existing.swipe_id || 0]) {\n          existing.variables[existing.swipe_id || 0] = input.vars && typeof input.vars === 'object' ? clone(input.vars) : {};\n        }\n      }\n      if (chat.length > list.length) chat.length = list.length;\n      if (opts.emitAdded) {\n        for (var j = 0; j < added.length; j += 1) {\n          var index = added[j];\n          var message = chat[index];\n          if (!message) continue;\n          if (message.is_user) bus.emit(TAVERN_EVENTS.MESSAGE_SENT, index);\n          else if (!message.is_system) bus.emit(TAVERN_EVENTS.MESSAGE_RECEIVED, index, 'normal');\n        }\n      }\n      return added;\n    }\n\n    function roleOf(message) {\n      if (message.is_system) return 'system';\n      return message.is_user ? 'user' : 'assistant';\n    }\n\n    function publicMessage(message, index, includeSwipes) {\n      var swipeId = message.swipe_id || 0;\n      var swipes = (message.swipes || [message.mes]).slice();\n      var data = clone((message.variables && message.variables[swipeId]) || {});\n      var info = clone((message.swipe_info && message.swipe_info[swipeId]) || {});\n      if (includeSwipes) {\n        return {\n          message_id: index,\n          name: message.name,\n          role: roleOf(message),\n          is_hidden: Boolean(message.is_system),\n          swipe_id: swipeId,\n          swipes: swipes,\n          swipes_data: (message.variables || [{}]).map(clone),\n          swipes_info: (message.swipe_info || [{}]).map(clone),\n        };\n      }\n      return {\n        message_id: index,\n        name: message.name,\n        role: roleOf(message),\n        is_hidden: Boolean(message.is_system),\n        message: message.mes,\n        data: data,\n        extra: info,\n        swipe_id: swipeId,\n        swipes: swipes,\n        swipes_data: (message.variables || [{}]).map(clone),\n      };\n    }\n\n    function parseRange(range) {\n      var last = chat.length - 1;\n      if (typeof range === 'number') {\n        var numeric = normalizeIndex(range, last);\n        return { start: numeric, end: numeric };\n      }\n      var text = String(range == null ? 'latest' : range).trim();\n      if (text === '' || text === 'latest') return { start: last, end: last };\n      text = text.replace(/\\{\\{lastMessageId\\}\\}/g, String(last));\n      var match = text.match(/^(-?\\d+)\\s*-\\s*(-?\\d+)$/);\n      if (match) {\n        return {\n          start: normalizeIndex(Number(match[1]), last),\n          end: normalizeIndex(Number(match[2]), last),\n        };\n      }\n      var single = normalizeIndex(Number(text), last);\n      return { start: single, end: single };\n    }\n\n    function normalizeIndex(value, last) {\n      if (!Number.isFinite(value)) return last;\n      if (value < 0) return last + 1 + value;\n      return value;\n    }\n\n    function getChatMessages(range, option) {\n      var opts = option || {};\n      var bounds = parseRange(range);\n      var start = Math.max(0, Math.min(bounds.start, bounds.end));\n      var end = Math.min(chat.length - 1, Math.max(bounds.start, bounds.end));\n      var out = [];\n      for (var i = start; i <= end; i += 1) {\n        var message = chat[i];\n        if (!message) continue;\n        var role = roleOf(message);\n        if (opts.role && opts.role !== 'all' && opts.role !== role) continue;\n        if (opts.hide_state === 'hidden' && !message.is_system) continue;\n        if (opts.hide_state === 'unhidden' && message.is_system) continue;\n        out.push(publicMessage(message, i, Boolean(opts.include_swipes)));\n      }\n      return out;\n    }\n\n    function getLastMessageId() { return chat.length - 1; }\n\n    function scopeObject(option, create) {\n      var opts = option || { type: 'chat' };\n      switch (opts.type) {\n        case 'global': return globalVars;\n        case 'character': return characterVars;\n        case 'preset': return presetVars;\n        case 'chat': return chatMetadata.variables;\n        case 'script': {\n          var id = opts.script_id || currentScriptId;\n          if (!scriptVars[id] || typeof scriptVars[id] !== 'object') {\n            if (!create) return {};\n            scriptVars[id] = {};\n          }\n          return scriptVars[id];\n        }\n        case 'message': {\n          var index = opts.message_id;\n          if (index === undefined || index === null || index === 'latest') index = chat.length - 1;\n          else index = normalizeIndex(Number(index), chat.length - 1);\n          var message = chat[index];\n          if (!message) return null;\n          var swipeId = message.swipe_id || 0;\n          if (!message.variables[swipeId] || typeof message.variables[swipeId] !== 'object') {\n            if (!create) return {};\n            message.variables[swipeId] = {};\n          }\n          return message.variables[swipeId];\n        }\n        case 'extension': {\n          var extId = opts.extension_id || 'tavern_helper';\n          if (!extensionSettings[extId] || typeof extensionSettings[extId] !== 'object') {\n            if (!create) return {};\n            extensionSettings[extId] = {};\n          }\n          return extensionSettings[extId];\n        }\n        default: return chatMetadata.variables;\n      }\n    }\n\n    function postScope(option) {\n      var opts = option || { type: 'chat' };\n      var value = clone(scopeObject(opts, true) || {});\n      var messageIndex;\n      if (opts.type === 'message') {\n        messageIndex = opts.message_id === undefined || opts.message_id === null || opts.message_id === 'latest'\n          ? getLastMessageId()\n          : normalizeIndex(Number(opts.message_id), getLastMessageId());\n      }\n      post({\n        tt: 'vars',\n        scope: opts.type || 'chat',\n        scriptId: opts.script_id || undefined,\n        extensionId: opts.extension_id || undefined,\n        messageId: messageIndex,\n        value: value,\n        hash: hashSignature(value),\n      });\n      return value;\n    }\n\n    function getVariables(option) {\n      var value = scopeObject(option || { type: 'chat' }, false);\n      return clone(value || {});\n    }\n\n    function replaceVariables(value, option) {\n      var opts = option || { type: 'chat' };\n      var scope = scopeObject(opts, true);\n      if (!scope) throw new Error('变量作用域不存在');\n      Object.keys(scope).forEach(function (key) { delete scope[key]; });\n      Object.assign(scope, clone(value && typeof value === 'object' ? value : {}));\n      postScope(opts);\n      return getVariables(opts);\n    }\n\n    function updateVariablesWith(updater, option) {\n      var opts = option || { type: 'chat' };\n      var current = getVariables(opts);\n      var next = typeof updater === 'function' ? updater(current) : updater;\n      return replaceVariables(next === undefined ? current : next, opts);\n    }\n\n    function insertOrAssignVariables(vars, option) {\n      var opts = option || { type: 'chat' };\n      var scope = scopeObject(opts, true);\n      Object.keys(vars || {}).forEach(function (key) { scope[key] = clone(vars[key]); });\n      postScope(opts);\n    }\n\n    function insertVariables(vars, option) {\n      var opts = option || { type: 'chat' };\n      var scope = scopeObject(opts, true);\n      Object.keys(vars || {}).forEach(function (key) {\n        if (!Object.prototype.hasOwnProperty.call(scope, key)) scope[key] = clone(vars[key]);\n      });\n      postScope(opts);\n    }\n\n    function deleteVariable(key, option) {\n      var opts = option || { type: 'chat' };\n      var scope = scopeObject(opts, true);\n      deletePath(scope, key);\n      postScope(opts);\n    }\n\n    function touchMessage(index) {\n      var message = chat[index];\n      if (!message) return;\n      var vars = clone((message.variables && message.variables[message.swipe_id || 0]) || {});\n      post({\n        tt: 'message',\n        index: index,\n        text: message.mes,\n        vars: vars,\n        varsHash: hashSignature(vars),\n        edited: message.__ttEdited === true,\n      });\n    }\n\n    async function setChatMessages(updates, options) {\n      var opts = options || {};\n      var affected = [];\n      for (var u = 0; u < (updates || []).length; u += 1) {\n        var update = updates[u] || {};\n        var index = update.message_id;\n        if (index === 'latest') index = chat.length - 1;\n        else index = normalizeIndex(Number(index), chat.length - 1);\n        var message = chat[index];\n        if (!message) throw new Error('提供的消息楼层号 ' + update.message_id + ' 超出了范围');\n        if (update.message !== undefined) {\n          message.mes = String(update.message);\n          message.swipes[message.swipe_id || 0] = message.mes;\n          message.__ttEdited = true;\n        }\n        if (update.data !== undefined) {\n          message.variables[message.swipe_id || 0] = clone(update.data);\n        }\n        if (update.extra !== undefined) {\n          message.swipe_info[message.swipe_id || 0] = clone(update.extra);\n          message.extra = clone(update.extra);\n        }\n        if (update.is_hidden !== undefined) message.is_system = Boolean(update.is_hidden);\n        if (update.name !== undefined) message.name = String(update.name);\n        if (update.swipes !== undefined || update.swipes_data !== undefined || update.swipes_info !== undefined || update.swipe_id !== undefined) {\n          var nodes = Math.max(\n            Array.isArray(update.swipes) ? update.swipes.length : 0,\n            Array.isArray(update.swipes_data) ? update.swipes_data.length : 0,\n            Array.isArray(update.swipes_info) ? update.swipes_info.length : 0,\n            (message.swipes || []).length,\n            1,\n          );\n          var swipeId = Math.max(0, Math.min(Number(update.swipe_id != null ? update.swipe_id : message.swipe_id || 0), nodes - 1));\n          var swipes = [];\n          var data = [];\n          var info = [];\n          for (var s = 0; s < nodes; s += 1) {\n            swipes.push(update.swipes && update.swipes[s] != null ? String(update.swipes[s]) : (message.swipes[s] != null ? message.swipes[s] : ''));\n            data.push(update.swipes_data && update.swipes_data[s] !== undefined ? clone(update.swipes_data[s]) : clone((message.variables && message.variables[s]) || {}));\n            info.push(update.swipes_info && update.swipes_info[s] !== undefined ? clone(update.swipes_info[s]) : clone((message.swipe_info && message.swipe_info[s]) || {}));\n          }\n          message.swipes = swipes;\n          message.variables = data;\n          message.swipe_info = info;\n          message.swipe_id = swipeId;\n          message.mes = swipes[swipeId];\n          message.extra = clone(info[swipeId]);\n          message.__ttEdited = true;\n        }\n        affected.push(index);\n      }\n      for (var a = 0; a < affected.length; a += 1) touchMessage(affected[a]);\n      if (opts.refresh !== 'none') {\n        for (var b = 0; b < affected.length; b += 1) {\n          var msg = chat[affected[b]];\n          if (!msg) continue;\n          bus.emit(msg.is_user ? TAVERN_EVENTS.USER_MESSAGE_RENDERED : TAVERN_EVENTS.CHARACTER_MESSAGE_RENDERED, affected[b]);\n        }\n      }\n      post({ tt: 'chat-updated', indices: affected });\n    }\n\n    async function createChatMessages(creates, options) {\n      var opts = options || {};\n      var insertBefore = opts.insert_before != null ? opts.insert_before : opts.insert_at;\n      var at = insertBefore === 'end' || insertBefore == null ? chat.length : normalizeIndex(Number(insertBefore), chat.length);\n      at = Math.max(0, Math.min(at, chat.length));\n      var made = [];\n      for (var i = 0; i < (creates || []).length; i += 1) {\n        var input = creates[i] || {};\n        var message = makeMessage(input);\n        var index = at + i;\n        chat.splice(index, 0, message);\n        made.push(index);\n      }\n      for (var j = 0; j < made.length; j += 1) {\n        post({ tt: 'message', index: made[j], text: chat[made[j]].mes, vars: {}, edited: true });\n        bus.emit(chat[made[j]].is_user ? TAVERN_EVENTS.MESSAGE_SENT : TAVERN_EVENTS.MESSAGE_RECEIVED, made[j], 'normal');\n      }\n      return made;\n    }\n\n    async function deleteChatMessages(ids, options) {\n      var list = (ids || []).map(function (id) { return normalizeIndex(Number(id), chat.length - 1); })\n        .filter(function (id) { return id >= 0 && id < chat.length; })\n        .sort(function (a, b) { return b - a; });\n      for (var i = 0; i < list.length; i += 1) chat.splice(list[i], 1);\n      post({ tt: 'chat-reload' });\n      if ((options || {}).refresh !== 'none') bus.emit(TAVERN_EVENTS.CHAT_CHANGED, chatId);\n    }\n\n    async function rotateChatMessages(begin, middle, end) {\n      var from = Math.max(0, normalizeIndex(Number(begin), chat.length - 1));\n      var mid = Math.max(0, normalizeIndex(Number(middle), chat.length - 1));\n      var to = Math.max(0, normalizeIndex(Number(end), chat.length - 1));\n      var slice = chat.splice(from, to - from);\n      var head = slice.splice(0, Math.max(0, mid - from));\n      chat.splice(from, 0, ...slice, ...head);\n      post({ tt: 'chat-reload' });\n    }\n\n    function lookupMacro(name) {\n      var key = String(name || '');\n      if (macros.has(key)) {\n        var value = macros.get(key);\n        return typeof value === 'function' ? value('') : value;\n      }\n      switch (key) {\n        case 'user': case 'name1': return userName;\n        case 'char': case 'name2': return charName;\n        case 'charIfNotGroup': return charName;\n        case 'group': return '';\n        case 'description': return card.description || '';\n        case 'personality': return card.personality || '';\n        case 'scenario': return card.scenario || '';\n        case 'persona': return '';\n        case 'time': return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date());\n        case 'date': return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());\n        case 'weekday': return new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(new Date());\n        case 'isotime': { var now = new Date(); return pad(now.getHours()) + ':' + pad(now.getMinutes()); }\n        case 'isodate': { var today = new Date(); return today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate()); }\n        case 'newline': return '\\n';\n        case 'trim': return '';\n        case 'maxContext': return '128000';\n        case 'maxResponse': return '8000';\n        case 'maxPrompt': return '128000';\n        case 'lastMessageId': return String(getLastMessageId());\n        case 'lastMessage': {\n          var last = chat[chat.length - 1];\n          return last ? last.mes : '';\n        }\n        case 'lastUserMessage': {\n          for (var i = chat.length - 1; i >= 0; i -= 1) if (chat[i].is_user) return chat[i].mes;\n          return '';\n        }\n        case 'lastCharMessage': {\n          for (var j = chat.length - 1; j >= 0; j -= 1) if (!chat[j].is_user && !chat[j].is_system) return chat[j].mes;\n          return '';\n        }\n        default: return undefined;\n      }\n    }\n\n    function substituteMacros(text) {\n      if (typeof text !== 'string' || !text) return text == null ? '' : String(text);\n      var out = text;\n      out = out.replace(/\\{\\{\\/\\/([\\s\\S]*?)\\}\\}/g, '');\n      out = out.replace(/\\{\\{setvar::([^:}\\s]+)::([\\s\\S]*?)\\}\\}/gi, function (_, key, value) {\n        setPath(chatMetadata.variables, key.trim(), value);\n        postScope({ type: 'chat' });\n        return '';\n      });\n      out = out.replace(/\\{\\{getvar::([^:}\\s]+)\\}\\}/gi, function (_, key) {\n        var value = hasPath(chatMetadata.variables, key.trim()) ? getPath(chatMetadata.variables, key.trim()) : '';\n        return value == null ? '' : String(value);\n      });\n      out = out.replace(/\\{\\{addvar::([^:}\\s]+)::([\\s\\S]*?)\\}\\}/gi, function (_, key, value) {\n        var current = getPath(chatMetadata.variables, key.trim(), '');\n        setPath(chatMetadata.variables, key.trim(), String(current == null ? '' : current) + value);\n        postScope({ type: 'chat' });\n        return '';\n      });\n      out = out.replace(/\\{\\{random\\s?::?([^}]+)\\}\\}/gi, function (_, inner) {\n        return randomPick(splitArgs(inner.trim(), '::'), Math.random);\n      });\n      out = out.replace(/\\{\\{pick\\s?::?([^}]+)\\}\\}/gi, function (_, inner) {\n        return randomPick(splitArgs(inner.trim(), '::'), Math.random);\n      });\n      out = out.replace(/\\{\\{roll[ :]([^}]+)\\}\\}/gi, function (_, inner) {\n        var match = inner.trim().match(/^(\\d*)d(\\d+)$/i);\n        var count = match ? Math.max(1, Number(match[1] || 1)) : 1;\n        var sides = match ? Number(match[2]) : Number(inner.trim()) || 6;\n        var total = 0;\n        for (var i = 0; i < count; i += 1) total += 1 + Math.floor(Math.random() * sides);\n        return String(total);\n      });\n      out = out.replace(/\\{\\{newline\\}\\}/gi, '\\n');\n      out = out.replace(/(?:\\r?\\n)*\\{\\{trim\\}\\}(?:\\r?\\n)*/gi, '');\n      out = out.replace(/\\{\\{noop\\}\\}/gi, '');\n      out = out.replace(/\\{\\{([a-zA-Z_][\\w]*)\\}\\}/g, function (raw, name) {\n        var value = lookupMacro(name);\n        return value === undefined ? raw : String(value);\n      });\n      // 旧式尖括号\n      out = out.replace(/<USER>/gi, userName).replace(/<BOT>/gi, charName).replace(/<CHAR>/gi, charName);\n      return out;\n    }\n\n    function getLorebookEntries(name) {\n      var book = name == null || name === worldbookName ? worldbookEntries : [];\n      return book.map(clone);\n    }\n\n    function getWorldbook(name) {\n      var entries = {};\n      getLorebookEntries(name).forEach(function (entry) { entries[String(entry.uid)] = entry; });\n      return { name: name == null ? worldbookName : name, entries: entries };\n    }\n\n    function getCharWorldbookNames() {\n      return { primary: worldbookName, additional: [] };\n    }\n\n    function getWorldbookNames() { return [worldbookName]; }\n\n    function slashCommand(line) {\n      var text = String(line || '').trim();\n      if (!text) return '';\n      if (text[0] === '/') text = text.slice(1);\n      var pipe = text.split('|');\n      var result = '';\n      for (var i = 0; i < pipe.length; i += 1) {\n        result = runOneCommand(pipe[i].trim(), result);\n      }\n      return result;\n    }\n\n    function parseNamed(rest) {\n      var named = {};\n      var positional = [];\n      var tokens = String(rest || '').match(/(?:[^\\s\"']+|\"[^\"]*\"|'[^']*')+/g) || [];\n      tokens.forEach(function (token) {\n        var eq = token.indexOf('=');\n        if (eq > 0) {\n          var key = token.slice(0, eq);\n          var value = token.slice(eq + 1).replace(/^[\"']|[\"']$/g, '');\n          named[key] = value;\n        } else {\n          positional.push(token.replace(/^[\"']|[\"']$/g, ''));\n        }\n      });\n      return { named: named, positional: positional };\n    }\n\n    function runOneCommand(command, pipeValue) {\n      var text = String(command || '').trim();\n      if (text[0] === '/') text = text.slice(1);\n      var space = text.indexOf(' ');\n      var name = (space < 0 ? text : text.slice(0, space)).toLowerCase();\n      var rest = space < 0 ? '' : text.slice(space + 1);\n      var args = parseNamed(rest.replace(/\\{\\{pipe\\}\\}/g, pipeValue));\n      var namedKeys = Object.keys(args.named);\n      var singlePair = namedKeys.length === 1 && args.positional.length === 0 && namedKeys[0] !== 'key' && namedKeys[0] !== 'value';\n      var key = args.named.key || (singlePair ? namedKeys[0] : args.positional[0]) || '';\n      var value = args.named.value != null\n        ? args.named.value\n        : singlePair\n          ? args.named[namedKeys[0]]\n          : (args.positional.slice(1).join(' ') || pipeValue);\n      switch (name) {\n        case 'setvar': setPath(chatMetadata.variables, key, value); postScope({ type: 'chat' }); return '';\n        case 'getvar': {\n          var got = getPath(chatMetadata.variables, key, '');\n          return got == null ? '' : String(got);\n        }\n        case 'addvar': setPath(chatMetadata.variables, key, String(getPath(chatMetadata.variables, key, '') + value)); postScope({ type: 'chat' }); return '';\n        case 'incvar': setPath(chatMetadata.variables, key, Number(getPath(chatMetadata.variables, key, 0)) + (Number(value) || 1)); postScope({ type: 'chat' }); return '';\n        case 'decvar': setPath(chatMetadata.variables, key, Number(getPath(chatMetadata.variables, key, 0)) - (Number(value) || 1)); postScope({ type: 'chat' }); return '';\n        case 'delvar': deletePath(chatMetadata.variables, key); postScope({ type: 'chat' }); return '';\n        case 'setglobalvar': setPath(globalVars, key, value); postScope({ type: 'global' }); return '';\n        case 'getglobalvar': { var g = getPath(globalVars, key, ''); return g == null ? '' : String(g); }\n        case 'addglobalvar': setPath(globalVars, key, String(getPath(globalVars, key, '') + value)); postScope({ type: 'global' }); return '';\n        case 'setchatvar': setPath(chatMetadata.variables, key, value); postScope({ type: 'chat' }); return '';\n        case 'getchatvar': { var c = getPath(chatMetadata.variables, key, ''); return c == null ? '' : String(c); }\n        case 'addchatvar': setPath(chatMetadata.variables, key, String(getPath(chatMetadata.variables, key, '') + value)); postScope({ type: 'chat' }); return '';\n        case 'setvarname':\n        case 'setprompt':\n          return '';\n        case 'echo':\n        case 'pass':\n        case 'run': return rest;\n        case 'comment': return '';\n        case 'sys': post({ tt: 'system-message', text: rest }); return '';\n        case 'sendas': {\n          var sep = rest.indexOf(' ');\n          var payload = sep < 0 ? rest : rest.slice(sep + 1);\n          post({ tt: 'user-message', text: payload });\n          return '';\n        }\n        case 'trigger': post({ tt: 'trigger' }); return '';\n        default:\n          throw new Error('DSH TH 宿主暂不支持斜杠命令 /' + name);\n      }\n    }\n\n    function makeScriptContext(scriptId, messageId) {\n      currentScriptId = scriptId || currentScriptId;\n      currentMessageId = messageId == null ? currentMessageId : messageId;\n      return currentScriptId;\n    }\n\n    function buildCharacters() {\n      var data = card.data || card;\n      return [{\n        name: charName,\n        description: card.description || data.description || '',\n        personality: card.personality || data.personality || '',\n        scenario: card.scenario || data.scenario || '',\n        first_mes: card.firstMes || data.first_mes || '',\n        mes_example: card.mesExample || data.mes_example || '',\n        creatorcomment: card.creatorNotes || data.creator_notes || '',\n        tags: card.tags || data.tags || [],\n        talkativeness: 0.5,\n        fav: false,\n        create_date: '',\n        data: data,\n        chat: chatId,\n        avatar: 'dsh-tt.png',\n        json_data: '',\n      }];\n    }\n\n    function getCharacterCardFields() {\n      var data = card.data || card;\n      return {\n        name: charName,\n        description: card.description || data.description || '',\n        personality: card.personality || data.personality || '',\n        scenario: card.scenario || data.scenario || '',\n        first_mes: card.firstMes || data.first_mes || '',\n        mes_example: card.mesExample || data.mes_example || '',\n        system_prompt: card.systemPrompt || data.system_prompt || '',\n        post_history_instructions: card.postHistoryInstructions || data.post_history_instructions || '',\n        alternate_greetings: card.alternateGreetings || data.alternate_greetings || [],\n        creator: card.creator || data.creator || '',\n        character_version: card.characterVersion || data.character_version || '',\n        tags: card.tags || data.tags || [],\n        extensions: card.extensions || data.extensions || {},\n      };\n    }\n\n    function snapshotForParent() {\n      return {\n        chat: chat.map(function (message, index) {\n          return {\n            index: index,\n            role: roleOf(message),\n            text: message.mes,\n            vars: clone((message.variables && message.variables[message.swipe_id || 0]) || {}),\n            hidden: Boolean(message.is_system),\n          };\n        }),\n        chatVariables: clone(chatMetadata.variables),\n        globalVariables: clone(globalVars),\n        characterVariables: clone(characterVars),\n        presetVariables: clone(presetVars),\n        scriptVariables: clone(scriptVars),\n      };\n    }\n\n    // 初始聊天\n    applyChat(settings.messages || [], { initial: true });\n\n    return {\n      // 状态\n      card: card,\n      chat: chat,\n      chatMetadata: chatMetadata,\n      extensionSettings: extensionSettings,\n      characters: buildCharacters(),\n      userName: userName,\n      charName: charName,\n      chatId: chatId,\n      worldbookName: worldbookName,\n      // 消息\n      applyChat: applyChat,\n      getChatMessages: getChatMessages,\n      setChatMessages: setChatMessages,\n      createChatMessages: createChatMessages,\n      deleteChatMessages: deleteChatMessages,\n      rotateChatMessages: rotateChatMessages,\n      getLastMessageId: getLastMessageId,\n      publicMessage: publicMessage,\n      snapshotForParent: snapshotForParent,\n      touchMessage: touchMessage,\n      // 变量\n      getVariables: getVariables,\n      replaceVariables: replaceVariables,\n      updateVariablesWith: updateVariablesWith,\n      insertOrAssignVariables: insertOrAssignVariables,\n      insertVariables: insertVariables,\n      deleteVariable: deleteVariable,\n      // 事件\n      bus: bus,\n      // 宏\n      substituteMacros: substituteMacros,\n      registerMacro: function (key, value) { macros.set(String(key), value); },\n      unregisterMacro: function (key) { macros.delete(String(key)); },\n      // 世界书\n      getLorebookEntries: getLorebookEntries,\n      getWorldbook: getWorldbook,\n      getWorldbookNames: getWorldbookNames,\n      getGlobalWorldbookNames: function () { return []; },\n      getCharWorldbookNames: getCharWorldbookNames,\n      getCurrentCharPrimaryLorebook: function () { return worldbookName; },\n      // 其它\n      getCharacterCardFields: getCharacterCardFields,\n      slashCommand: slashCommand,\n      makeScriptContext: makeScriptContext,\n      getCurrentScriptId: function () { return currentScriptId; },\n      getCurrentMessageId: function () { return currentMessageId; },\n    };\n  }\n\n  var TAVERN_EVENTS = {\n    APP_READY: 'app_ready',\n    EXTRAS_CONNECTED: 'extras_connected',\n    MESSAGE_SWIPED: 'message_swiped',\n    MESSAGE_SENT: 'message_sent',\n    MESSAGE_RECEIVED: 'message_received',\n    MESSAGE_EDITED: 'message_edited',\n    MESSAGE_DELETED: 'message_deleted',\n    MESSAGE_UPDATED: 'message_updated',\n    MESSAGE_FILE_EMBEDDED: 'message_file_embedded',\n    MESSAGE_REASONING_EDITED: 'message_reasoning_edited',\n    MESSAGE_REASONING_DELETED: 'message_reasoning_deleted',\n    MESSAGE_SWIPE_DELETED: 'message_swipe_deleted',\n    MORE_MESSAGES_LOADED: 'more_messages_loaded',\n    IMPERSONATE_READY: 'impersonate_ready',\n    CHAT_CHANGED: 'chat_id_changed',\n    GENERATION_AFTER_COMMANDS: 'GENERATION_AFTER_COMMANDS',\n    GENERATION_STARTED: 'generation_started',\n    GENERATION_STOPPED: 'generation_stopped',\n    GENERATION_ENDED: 'generation_ended',\n    SD_PROMPT_PROCESSING: 'sd_prompt_processing',\n    EXTENSIONS_FIRST_LOAD: 'extensions_first_load',\n    EXTENSION_SETTINGS_LOADED: 'extension_settings_loaded',\n    SETTINGS_LOADED: 'settings_loaded',\n    SETTINGS_UPDATED: 'settings_updated',\n    MOVABLE_PANELS_RESET: 'movable_panels_reset',\n    SETTINGS_LOADED_BEFORE: 'settings_loaded_before',\n    SETTINGS_LOADED_AFTER: 'settings_loaded_after',\n    CHATCOMPLETION_SOURCE_CHANGED: 'chatcompletion_source_changed',\n    CHATCOMPLETION_MODEL_CHANGED: 'chatcompletion_model_changed',\n    OAI_PRESET_CHANGED_BEFORE: 'oai_preset_changed_before',\n    OAI_PRESET_CHANGED_AFTER: 'oai_preset_changed_after',\n    OAI_PRESET_EXPORT_READY: 'oai_preset_export_ready',\n    OAI_PRESET_IMPORT_READY: 'oai_preset_import_ready',\n    WORLDINFO_SETTINGS_UPDATED: 'worldinfo_settings_updated',\n    WORLDINFO_UPDATED: 'worldinfo_updated',\n    CHARACTER_EDITOR_OPENED: 'character_editor_opened',\n    CHARACTER_EDITED: 'character_edited',\n    CHARACTER_PAGE_LOADED: 'character_page_loaded',\n    USER_MESSAGE_RENDERED: 'user_message_rendered',\n    CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',\n    FORCE_SET_BACKGROUND: 'force_set_background',\n    CHAT_DELETED: 'chat_deleted',\n    CHAT_CREATED: 'chat_created',\n    GENERATE_BEFORE_COMBINE_PROMPTS: 'generate_before_combine_prompts',\n    GENERATE_AFTER_COMBINE_PROMPTS: 'generate_after_combine_prompts',\n    GENERATE_AFTER_DATA: 'generate_after_data',\n    WORLD_INFO_ACTIVATED: 'world_info_activated',\n    TEXT_COMPLETION_SETTINGS_READY: 'text_completion_settings_ready',\n    CHAT_COMPLETION_SETTINGS_READY: 'chat_completion_settings_ready',\n    CHAT_COMPLETION_PROMPT_READY: 'chat_completion_prompt_ready',\n    CHARACTER_FIRST_MESSAGE_SELECTED: 'character_first_message_selected',\n    CHARACTER_DELETED: 'characterDeleted',\n    CHARACTER_DUPLICATED: 'character_duplicated',\n    CHARACTER_RENAMED: 'character_renamed',\n    CHARACTER_RENAMED_IN_PAST_CHAT: 'character_renamed_in_past_chat',\n    SMOOTH_STREAM_TOKEN_RECEIVED: 'stream_token_received',\n    STREAM_TOKEN_RECEIVED: 'stream_token_received',\n    STREAM_REASONING_DONE: 'stream_reasoning_done',\n    FILE_ATTACHMENT_DELETED: 'file_attachment_deleted',\n    WORLDINFO_FORCE_ACTIVATE: 'worldinfo_force_activate',\n    OPEN_CHARACTER_LIBRARY: 'open_character_library',\n    ONLINE_STATUS_CHANGED: 'online_status_changed',\n    IMAGE_SWIPED: 'image_swiped',\n    CONNECTION_PROFILE_LOADED: 'connection_profile_loaded',\n    CONNECTION_PROFILE_CREATED: 'connection_profile_created',\n    CONNECTION_PROFILE_DELETED: 'connection_profile_deleted',\n    CONNECTION_PROFILE_UPDATED: 'connection_profile_updated',\n    TOOL_CALLS_PERFORMED: 'tool_calls_performed',\n    TOOL_CALLS_RENDERED: 'tool_calls_rendered',\n    CHARACTER_MANAGEMENT_DROPDOWN: 'charManagementDropdown',\n    SECRET_WRITTEN: 'secret_written',\n    SECRET_DELETED: 'secret_deleted',\n    SECRET_ROTATED: 'secret_rotated',\n    SECRET_EDITED: 'secret_edited',\n    PRESET_CHANGED: 'preset_changed',\n    PRESET_DELETED: 'preset_deleted',\n    PRESET_RENAMED: 'preset_renamed',\n    PRESET_RENAMED_BEFORE: 'preset_renamed_before',\n    MAIN_API_CHANGED: 'main_api_changed',\n    WORLDINFO_ENTRIES_LOADED: 'worldinfo_entries_loaded',\n    WORLDINFO_SCAN_DONE: 'worldinfo_scan_done',\n    MEDIA_ATTACHMENT_DELETED: 'media_attachment_deleted',\n    MESSAGE_IFRAME_RENDER_STARTED: 'message_iframe_render_started',\n    MESSAGE_IFRAME_RENDER_ENDED: 'message_iframe_render_ended',\n    GENERATION_REQUESTED: 'js_generation_requested',\n    STREAM_TOKEN_RECEIVED_FULLY: 'js_stream_token_received_fully',\n    STREAM_TOKEN_RECEIVED_INCREMENTALLY: 'js_stream_token_received_incrementally',\n    GENERATION_ENDED_JS: 'js_generation_ended',\n  };\n\n  return {\n    createCore: createCore,\n    createEventBus: createEventBus,\n    flattenEntries: flattenEntries,\n    TAVERN_EVENTS: TAVERN_EVENTS,\n    // 供测试\n    getPath: getPath,\n    setPath: setPath,\n    hasPath: hasPath,\n    deletePath: deletePath,\n    deepEqual: deepEqual,\n  };\n})();\n\nif (typeof module !== 'undefined' && module.exports) module.exports = TT_CORE;\n";
    const TAVERN_SHIM_SRC = "/* 酒馆助手兼容 iframe 的浏览器适配层。\n *\n * 依赖：window.__TT_INIT__（父窗口注入的初始数据）与 TT_CORE（同文档先加载的核心）。\n * 负责：ST/TavernHelper 全局、toastr、jQuery 子集、lodash 子集、事件、弹窗桥、\n *       卡内脚本执行。\n */\n(function () {\n  'use strict';\n\n  var INIT = window.__TT_INIT__ || {};\n  var TT = window.TT_CORE;\n  if (!TT) throw new Error('TT_CORE 未加载');\n\n  function post(message) {\n    try {\n      var payload = Object.assign({ __ttChild: true }, message);\n      window.parent.postMessage(payload, '*');\n    } catch (error) {\n      try { console.error('[dsh-tt] postMessage failed', error); } catch { /* ignore */ }\n    }\n  }\n\n  function log(level, text) {\n    post({ tt: 'log', level: level || 'info', text: String(text == null ? '' : text) });\n  }\n\n  var core = TT.createCore({\n    card: INIT.card || {},\n    userName: INIT.userName || '你',\n    charName: INIT.charName || (INIT.card && INIT.card.name) || '角色',\n    chatId: INIT.chatId || 'dsh-tt-chat',\n    worldbookName: INIT.worldbookName || '角色世界书',\n    worldbookEntries: INIT.worldbookEntries || [],\n    variables: INIT.variables || {},\n    messages: INIT.messages || [],\n    extensionSettings: INIT.extensionSettings || {},\n    post: post,\n    log: log,\n  });\n\n  var TAVERN_EVENTS = TT.TAVERN_EVENTS;\n\n  function escapeHtml(value) {\n    return String(value == null ? '' : value)\n      .replace(/&/g, '&amp;')\n      .replace(/</g, '&lt;')\n      .replace(/>/g, '&gt;')\n      .replace(/\"/g, '&quot;')\n      .replace(/'/g, '&#39;');\n  }\n\n  function textToHtml(text) {\n    return escapeHtml(text).replace(/\\n/g, '<br>');\n  }\n\n  // ── 正则脚本（显示/提示词作用域） ─────────────────────────────\n  function compileRegex(rule) {\n    if (!rule || rule.disabled) return null;\n    var find = String(rule.findRegex || '');\n    if (!find) return null;\n    var match = find.match(/^\\/([\\s\\S]*)\\/([a-z]*)$/);\n    var source = match ? match[1] : find;\n    var flags = match ? match[2] : 'g';\n    try { return new RegExp(source, flags); } catch { return null; }\n  }\n\n  function applyRegexes(text, placement, options) {\n    var out = String(text == null ? '' : text);\n    var rules = Array.isArray(INIT.regexScripts) ? INIT.regexScripts : [];\n    var isPrompt = Boolean(options && options.isPrompt);\n    for (var i = 0; i < rules.length; i += 1) {\n      var rule = rules[i];\n      if (!rule || rule.disabled) continue;\n      var placements = Array.isArray(rule.placement) ? rule.placement : [];\n      if (placement != null && placements.length && placements.indexOf(Number(placement)) < 0) continue;\n      if (isPrompt && rule.markdownOnly) continue;\n      if (!isPrompt && rule.promptOnly) continue;\n      var regex = compileRegex(rule);\n      if (!regex) continue;\n      try {\n        out = out.replace(regex, String(rule.replaceString == null ? '' : rule.replaceString));\n      } catch { /* ignore */ }\n    }\n    return out;\n  }\n\n  // ── jQuery 子集 ────────────────────────────────────────────\n  var JQ = function (elements) {\n    this.elements = elements || [];\n    this.length = this.elements.length;\n    for (var i = 0; i < this.elements.length; i += 1) this[i] = this.elements[i];\n    this.prevObject = null;\n  };\n\n  function wrap(elements) { return new JQ(elements); }\n\n  function toElements(value) {\n    if (!value) return [];\n    if (value instanceof JQ) return value.elements;\n    if (value.nodeType || value === window || value === document) return [value];\n    if (typeof value === 'string') {\n      var html = value.trim();\n      if (html[0] === '<' && html[1] !== '/') {\n        var template = document.createElement('template');\n        template.innerHTML = html;\n        return Array.prototype.slice.call(template.content.childNodes);\n      }\n      return Array.prototype.slice.call(document.querySelectorAll(value));\n    }\n    if (typeof value.length === 'number') return Array.prototype.slice.call(value);\n    return [];\n  }\n\n  function $(selector) {\n    if (typeof selector === 'function') {\n      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', selector, { once: true });\n      else setTimeout(selector, 0);\n      return wrap([]);\n    }\n    return wrap(toElements(selector));\n  }\n\n  JQ.prototype.each = function (fn) {\n    for (var i = 0; i < this.elements.length; i += 1) {\n      if (fn.call(this.elements[i], i, this.elements[i]) === false) break;\n    }\n    return this;\n  };\n  JQ.prototype.map = function (fn) {\n    var out = [];\n    for (var i = 0; i < this.elements.length; i += 1) {\n      var value = fn.call(this.elements[i], i, this.elements[i]);\n      if (value != null) out.push(value);\n    }\n    return wrap(out);\n  };\n  JQ.prototype.toArray = function () { return this.elements.slice(); };\n  JQ.prototype.get = function (index) { return index == null ? this.elements.slice() : this.elements[index]; };\n  JQ.prototype.eq = function (index) { return wrap(index < 0 ? [this.elements[this.elements.length + index]] : [this.elements[index]]); };\n  JQ.prototype.first = function () { return wrap(this.elements.slice(0, 1)); };\n  JQ.prototype.last = function () { return wrap(this.elements.slice(-1)); };\n  JQ.prototype.filter = function (selector) {\n    if (typeof selector === 'function') return wrap(this.elements.filter(function (el, index) { return selector.call(el, index, el); }));\n    return wrap(this.elements.filter(function (el) { return el.matches && el.matches(selector); }));\n  };\n  JQ.prototype.is = function (selector) {\n    if (typeof selector === 'function') return this.elements.some(function (el, index) { return selector.call(el, index, el); });\n    return this.elements.some(function (el) { return el.matches && el.matches(selector); });\n  };\n  JQ.prototype.find = function (selector) {\n    var out = [];\n    this.elements.forEach(function (el) {\n      if (el.querySelectorAll) out = out.concat(Array.prototype.slice.call(el.querySelectorAll(selector)));\n    });\n    return wrap(out);\n  };\n  JQ.prototype.parent = function () { return wrap(this.elements.map(function (el) { return el.parentElement; }).filter(Boolean)); };\n  JQ.prototype.children = function (selector) {\n    var out = [];\n    this.elements.forEach(function (el) {\n      if (!el.children) return;\n      var list = Array.prototype.slice.call(el.children);\n      out = out.concat(selector ? list.filter(function (child) { return child.matches && child.matches(selector); }) : list);\n    });\n    return wrap(out);\n  };\n  JQ.prototype.closest = function (selector) { return wrap(this.elements.map(function (el) { return el.closest && el.closest(selector); }).filter(Boolean)); };\n  JQ.prototype.next = function () { return wrap(this.elements.map(function (el) { return el.nextElementSibling; }).filter(Boolean)); };\n  JQ.prototype.prev = function () { return wrap(this.elements.map(function (el) { return el.previousElementSibling; }).filter(Boolean)); };\n  JQ.prototype.siblings = function () {\n    var out = [];\n    this.elements.forEach(function (el) {\n      if (!el.parentElement) return;\n      Array.prototype.slice.call(el.parentElement.children).forEach(function (child) { if (child !== el) out.push(child); });\n    });\n    return wrap(out);\n  };\n  JQ.prototype.attr = function (name, value) {\n    if (value === undefined) return this.elements.length ? this.elements[0].getAttribute(name) : undefined;\n    return this.each(function (_, el) { if (value === null) el.removeAttribute(name); else el.setAttribute(name, String(value)); });\n  };\n  JQ.prototype.removeAttr = function (name) { return this.each(function (_, el) { el.removeAttribute(name); }); };\n  JQ.prototype.prop = function (name, value) {\n    if (value === undefined) return this.elements.length ? this.elements[0][name] : undefined;\n    return this.each(function (_, el) { el[name] = value; });\n  };\n  JQ.prototype.data = function (name, value) {\n    if (value === undefined) {\n      if (!this.elements.length) return undefined;\n      var raw = this.elements[0].getAttribute('data-' + name);\n      if (raw == null) return undefined;\n      try { return JSON.parse(raw); } catch { return raw; }\n    }\n    return this.attr('data-' + name, typeof value === 'string' ? value : JSON.stringify(value));\n  };\n  JQ.prototype.text = function (value) {\n    if (value === undefined) return this.elements.map(function (el) { return el.textContent; }).join('');\n    return this.each(function (_, el) { el.textContent = String(value); });\n  };\n  JQ.prototype.html = function (value) {\n    if (value === undefined) return this.elements.length ? this.elements[0].innerHTML : undefined;\n    return this.each(function (_, el) { el.innerHTML = String(value); });\n  };\n  JQ.prototype.val = function (value) {\n    if (value === undefined) return this.elements.length ? this.elements[0].value : undefined;\n    return this.each(function (_, el) { el.value = value; });\n  };\n  JQ.prototype.append = function (child) {\n    var nodes = toElements(child);\n    return this.each(function (_, el) {\n      nodes.forEach(function (node) {\n        if (typeof node === 'string') el.insertAdjacentHTML('beforeend', node);\n        else el.appendChild(node);\n      });\n    });\n  };\n  JQ.prototype.appendTo = function (target) {\n    var parents = toElements(target);\n    this.elements.forEach(function (el) {\n      parents.forEach(function (parent) {\n        if (typeof parent === 'string') parent = document.querySelector(parent);\n        if (parent && parent.appendChild) parent.appendChild(el);\n      });\n    });\n    return this;\n  };\n  JQ.prototype.prepend = function (child) {\n    var nodes = toElements(child);\n    return this.each(function (_, el) {\n      nodes.forEach(function (node) {\n        if (typeof node === 'string') el.insertAdjacentHTML('afterbegin', node);\n        else el.insertBefore(node, el.firstChild);\n      });\n    });\n  };\n  JQ.prototype.before = function (child) {\n    var nodes = toElements(child);\n    return this.each(function (_, el) {\n      nodes.forEach(function (node) { if (el.parentNode) el.parentNode.insertBefore(typeof node === 'string' ? document.createTextNode(node) : node, el); });\n    });\n  };\n  JQ.prototype.after = function (child) {\n    var nodes = toElements(child);\n    return this.each(function (_, el) {\n      nodes.forEach(function (node) { if (el.parentNode) el.parentNode.insertBefore(typeof node === 'string' ? document.createTextNode(node) : node, el.nextSibling); });\n    });\n  };\n  JQ.prototype.remove = function () { return this.each(function (_, el) { if (el.parentNode) el.parentNode.removeChild(el); }); };\n  JQ.prototype.empty = function () { return this.each(function (_, el) { el.innerHTML = ''; }); };\n  JQ.prototype.addClass = function (name) { return this.each(function (_, el) { el.classList && el.classList.add.apply(el.classList, String(name).split(/\\s+/)); }); };\n  JQ.prototype.removeClass = function (name) { return this.each(function (_, el) { el.classList && el.classList.remove.apply(el.classList, String(name).split(/\\s+/)); }); };\n  JQ.prototype.toggleClass = function (name) { return this.each(function (_, el) { if (el.classList) el.classList.toggle(name); }); };\n  JQ.prototype.hasClass = function (name) { return this.elements.some(function (el) { return el.classList && el.classList.contains(name); }); };\n  JQ.prototype.css = function (name, value) {\n    if (typeof name === 'object') {\n      var styles = name;\n      return this.each(function (_, el) { Object.keys(styles).forEach(function (key) { el.style[key] = styles[key]; }); });\n    }\n    if (value === undefined) return this.elements.length && this.elements[0].style ? this.elements[0].style[name] : undefined;\n    return this.each(function (_, el) { if (el.style) el.style[name] = value; });\n  };\n  JQ.prototype.on = function (events, handler) {\n    var list = String(events).split(/\\s+/).filter(Boolean);\n    return this.each(function (_, el) {\n      list.forEach(function (eventName) {\n        var dot = eventName.lastIndexOf('.');\n        var type = dot > 0 ? eventName.slice(0, dot) : eventName;\n        var listener = function (event) {\n          event = event || {};\n          if (!event.preventDefault) event.preventDefault = function () {};\n          if (!event.stopPropagation) event.stopPropagation = function () {};\n          var result = handler.call(el, event);\n          if (result === false) event.preventDefault();\n        };\n        el.__ttListeners = el.__ttListeners || [];\n        el.__ttListeners.push({ type: type, handler: handler, listener: listener });\n        el.addEventListener(type, listener);\n      });\n    });\n  };\n  JQ.prototype.one = function (events, handler) {\n    var self = this;\n    var wrapped = function (event) { self.off(events, wrapped); return handler.apply(this, arguments); };\n    return this.on(events, wrapped);\n  };\n  JQ.prototype.off = function (events, handler) {\n    var list = events ? String(events).split(/\\s+/).filter(Boolean) : [];\n    return this.each(function (_, el) {\n      (el.__ttListeners || []).forEach(function (entry) {\n        if (list.length && list.indexOf(entry.type) < 0) return;\n        if (handler && entry.handler !== handler) return;\n        el.removeEventListener(entry.type, entry.listener);\n      });\n    });\n  };\n  JQ.prototype.trigger = function (eventName) {\n    return this.each(function (_, el) {\n      if (typeof el[eventName] === 'function') el[eventName]();\n      else el.dispatchEvent(new CustomEvent(eventName, { bubbles: true }));\n    });\n  };\n  ['click', 'dblclick', 'focus', 'blur', 'change', 'input', 'submit', 'keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'mousemove', 'mouseenter', 'mouseleave', 'scroll'].forEach(function (type) {\n    JQ.prototype[type] = function (handler) { return handler ? this.on(type, handler) : this.trigger(type); };\n  });\n  JQ.prototype.show = function () { return this.each(function (_, el) { if (el.style) el.style.display = ''; }); };\n  JQ.prototype.hide = function () { return this.each(function (_, el) { if (el.style) el.style.display = 'none'; }); };\n  JQ.prototype.scrollTop = function (value) {\n    if (value === undefined) return this.elements.length ? this.elements[0].scrollTop : 0;\n    return this.each(function (_, el) { el.scrollTop = value; });\n  };\n  JQ.prototype.height = function (value) {\n    if (value === undefined) return this.elements.length ? this.elements[0].clientHeight : 0;\n    return this.css('height', typeof value === 'number' ? value + 'px' : value);\n  };\n  JQ.prototype.width = function (value) {\n    if (value === undefined) return this.elements.length ? this.elements[0].clientWidth : 0;\n    return this.css('width', typeof value === 'number' ? value + 'px' : value);\n  };\n  JQ.prototype.offset = function () {\n    if (!this.elements.length) return { top: 0, left: 0 };\n    var rect = this.elements[0].getBoundingClientRect();\n    return { top: rect.top + window.scrollY, left: rect.left + window.scrollX };\n  };\n\n  $ .fn = JQ.prototype;\n  window.$ = $;\n  window.jQuery = $;\n\n  // ── lodash 子集 ────────────────────────────────────────────\n  var _ = (function () {\n    function isPlainObject(value) {\n      if (value == null || typeof value !== 'object') return false;\n      var proto = Object.getPrototypeOf(value);\n      return proto === Object.prototype || proto === null;\n    }\n    function clone(value) {\n      if (value == null || typeof value !== 'object') return value;\n      try { return structuredClone(value); } catch { /* ignore */ }\n      try { return JSON.parse(JSON.stringify(value)); } catch { return value; }\n    }\n    function iteratee(source) {\n      if (source == null) return function (value) { return value; };\n      if (typeof source === 'function') return source;\n      if (typeof source === 'string' || typeof source === 'number') return function (value) { return _.get(value, source); };\n      if (Array.isArray(source)) return function (value) { return _.isEqual(_.get(value, source[0]), source[1]); };\n      if (typeof source === 'object') return function (value) { return Object.keys(source).every(function (key) { return _.isEqual(_.get(value, key), source[key]); }); };\n      return function (value) { return value; };\n    }\n    function deepEqual(a, b) {\n      if (a === b) return true;\n      if (typeof a !== typeof b) return false;\n      if (a == null || b == null) return false;\n      if (Array.isArray(a) !== Array.isArray(b)) return false;\n      if (typeof a !== 'object') return false;\n      var keysA = Object.keys(a);\n      var keysB = Object.keys(b);\n      if (keysA.length !== keysB.length) return false;\n      return keysA.every(function (key) { return Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]); });\n    }\n    var lib = {\n      get: TT.getPath,\n      set: TT.setPath,\n      has: TT.hasPath,\n      unset: TT.deletePath,\n      isEqual: deepEqual,\n      isMatch: function (object, source) { return iteratee(source)(object); },\n      isNil: function (value) { return value == null; },\n      isNull: function (value) { return value === null; },\n      isUndefined: function (value) { return value === undefined; },\n      isArray: Array.isArray,\n      isString: function (value) { return typeof value === 'string'; },\n      isNumber: function (value) { return typeof value === 'number'; },\n      isBoolean: function (value) { return typeof value === 'boolean'; },\n      isFunction: function (value) { return typeof value === 'function'; },\n      isObject: function (value) { return value != null && (typeof value === 'object' || typeof value === 'function'); },\n      isPlainObject: isPlainObject,\n      isEmpty: function (value) {\n        if (value == null) return true;\n        if (typeof value === 'string' || Array.isArray(value)) return value.length === 0;\n        if (typeof value === 'object') return Object.keys(value).length === 0;\n        return true;\n      },\n      clone: clone,\n      cloneDeep: clone,\n      toNumber: function (value) { var n = parseFloat(value); return Number.isFinite(n) ? n : 0; },\n      toInteger: function (value) { return Math.trunc(lib.toNumber(value)); },\n      toString: function (value) { return value == null ? '' : String(value); },\n      defaultTo: function (value, fallback) { return value == null || Number.isNaN(value) ? fallback : value; },\n      clamp: function (value, lower, upper) { return Math.min(Math.max(lib.toNumber(value), lower), upper); },\n      round: function (value, precision) { var factor = Math.pow(10, precision || 0); return Math.round(lib.toNumber(value) * factor) / factor; },\n      floor: function (value) { return Math.floor(lib.toNumber(value)); },\n      ceil: function (value) { return Math.ceil(lib.toNumber(value)); },\n      random: function (lower, upper, floating) {\n        if (Array.isArray(lower)) return lower[Math.floor(Math.random() * lower.length)];\n        if (typeof lower === 'boolean') return Math.random() < 0.5;\n        if (upper === undefined) { upper = lower; lower = 0; }\n        if (floating) return lower + Math.random() * (upper - lower);\n        return lower + Math.floor(Math.random() * (upper - lower + 1));\n      },\n      sample: function (list) { return Array.isArray(list) && list.length ? list[Math.floor(Math.random() * list.length)] : undefined; },\n      shuffle: function (list) { return (list || []).slice().sort(function () { return Math.random() - 0.5; }); },\n      times: function (count, fn) { var out = []; for (var i = 0; i < count; i += 1) out.push(typeof fn === 'function' ? fn(i) : fn); return out; },\n      range: function (start, end, step) {\n        var from = start; var to = end; var by = step || 1;\n        if (to === undefined) { to = from; from = 0; }\n        var out = [];\n        if (by > 0) for (var i = from; i < to; i += by) out.push(i);\n        else for (var j = from; j > to; j += by) out.push(j);\n        return out;\n      },\n      uniqueId: (function () { var id = 0; return function () { id += 1; return String(id); }; })(),\n      escape: escapeHtml,\n      unescape: function (text) { return String(text == null ? '' : text).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '\"').replace(/&#39;/g, \"'\").replace(/&amp;/g, '&'); },\n      upperFirst: function (text) { var s = String(text == null ? '' : text); return s ? s[0].toUpperCase() + s.slice(1) : s; },\n      lowerFirst: function (text) { var s = String(text == null ? '' : text); return s ? s[0].toLowerCase() + s.slice(1) : s; },\n      capitalize: function (text) { var s = String(text == null ? '' : text).toLowerCase(); return s ? s[0].toUpperCase() + s.slice(1) : s; },\n      trim: function (text) { return String(text == null ? '' : text).trim(); },\n      split: function (text, separator) { return String(text == null ? '' : text).split(separator); },\n      join: function (list, separator) { return (list || []).join(separator == null ? ',' : separator); },\n      includes: function (collection, value) { return typeof collection === 'string' ? collection.indexOf(value) >= 0 : Array.isArray(collection) ? collection.indexOf(value) >= 0 : false; },\n      startsWith: function (text, target) { return String(text == null ? '' : text).indexOf(target) === 0; },\n      endsWith: function (text, target) { var s = String(text == null ? '' : text); return s.slice(-String(target).length) === String(target); },\n      replace: function (text, pattern, replacement) { return String(text == null ? '' : text).replace(pattern, replacement); },\n      keys: function (object) { return Object.keys(object || {}); },\n      values: function (object) { return Object.values(object || {}); },\n      toPairs: function (object) { return Object.entries(object || {}); },\n      assign: function () { return Object.assign.apply(Object, [{}].concat(Array.prototype.slice.call(arguments))); },\n      merge: function (target) {\n        for (var i = 1; i < arguments.length; i += 1) {\n          var source = arguments[i] || {};\n          Object.keys(source).forEach(function (key) {\n            if (isPlainObject(source[key]) && isPlainObject(target[key])) lib.merge(target[key], source[key]);\n            else target[key] = clone(source[key]);\n          });\n        }\n        return target;\n      },\n      mergeWith: function (target, source) {\n        Object.keys(source || {}).forEach(function (key) { target[key] = clone(source[key]); });\n        return target;\n      },\n      update: function (object, path, updater) {\n        var current = lib.get(object, path);\n        var next = typeof updater === 'function' ? updater(current) : updater;\n        lib.set(object, path, next);\n        return object;\n      },\n      map: function (collection, fn) {\n        var iterate = iteratee(fn);\n        return Array.isArray(collection) ? collection.map(iterate) : Object.values(collection || {}).map(iterate);\n      },\n      filter: function (collection, fn) {\n        var iterate = iteratee(fn);\n        return Array.isArray(collection) ? collection.filter(iterate) : Object.values(collection || {}).filter(iterate);\n      },\n      reject: function (collection, fn) {\n        var iterate = iteratee(fn);\n        return (collection || []).filter(function (item) { return !iterate(item); });\n      },\n      find: function (collection, fn) {\n        var iterate = iteratee(fn);\n        return Array.isArray(collection) ? collection.find(iterate) : Object.values(collection || {}).find(iterate);\n      },\n      findIndex: function (collection, fn) {\n        var iterate = iteratee(fn);\n        return Array.isArray(collection) ? collection.findIndex(iterate) : -1;\n      },\n      some: function (collection, fn) {\n        var iterate = iteratee(fn);\n        return Array.isArray(collection) ? collection.some(iterate) : Object.values(collection || {}).some(iterate);\n      },\n      every: function (collection, fn) {\n        var iterate = iteratee(fn);\n        return Array.isArray(collection) ? collection.every(iterate) : Object.values(collection || {}).every(iterate);\n      },\n      forEach: function (collection, fn) {\n        if (Array.isArray(collection)) collection.forEach(fn);\n        else Object.keys(collection || {}).forEach(function (key) { fn(collection[key], key, collection); });\n        return collection;\n      },\n      each: function (collection, fn) { return lib.forEach(collection, fn); },\n      reduce: function (collection, fn, initial) {\n        return Array.isArray(collection) ? collection.reduce(fn, initial) : Object.values(collection || {}).reduce(fn, initial);\n      },\n      groupBy: function (collection, fn) {\n        var iterate = iteratee(fn);\n        var out = {};\n        (collection || []).forEach(function (item) {\n          var key = iterate(item);\n          (out[key] = out[key] || []).push(item);\n        });\n        return out;\n      },\n      keyBy: function (collection, fn) {\n        var iterate = iteratee(fn);\n        var out = {};\n        (collection || []).forEach(function (item) { out[iterate(item)] = item; });\n        return out;\n      },\n      sortBy: function (collection, fn) {\n        var iterate = iteratee(fn);\n        return (collection || []).slice().sort(function (a, b) {\n          var va = iterate(a); var vb = iterate(b);\n          return va < vb ? -1 : va > vb ? 1 : 0;\n        });\n      },\n      uniq: function (list) { return Array.from(new Set(list || [])); },\n      union: function () { return Array.from(new Set(Array.prototype.concat.apply([], arguments))); },\n      flatten: function (list) { return (list || []).flat(); },\n      flattenDeep: function (list) { return (list || []).flat(Infinity); },\n      compact: function (list) { return (list || []).filter(Boolean); },\n      first: function (list) { return (list || [])[0]; },\n      head: function (list) { return (list || [])[0]; },\n      last: function (list) { return (list || [])[(list || []).length - 1]; },\n      nth: function (list, index) { return (list || [])[index < 0 ? (list || []).length + index : index]; },\n      take: function (list, count) { return (list || []).slice(0, count == null ? 1 : count); },\n      drop: function (list, count) { return (list || []).slice(count == null ? 1 : count); },\n      debounce: function (fn) {\n        var timer = null;\n        var wrapped = function () {\n          var args = arguments;\n          if (timer) clearTimeout(timer);\n          timer = setTimeout(function () { timer = null; fn.apply(null, args); }, 0);\n        };\n        wrapped.cancel = function () { if (timer) clearTimeout(timer); timer = null; };\n        return wrapped;\n      },\n      throttle: function (fn) {\n        var last = 0;\n        var wrapped = function () {\n          var now = Date.now();\n          if (now - last >= 16) { last = now; return fn.apply(null, arguments); }\n          return undefined;\n        };\n        wrapped.cancel = function () {};\n        return wrapped;\n      },\n      once: function (fn) {\n        var called = false; var result;\n        return function () { if (!called) { called = true; result = fn.apply(null, arguments); } return result; };\n      },\n      identity: function (value) { return value; },\n      noop: function () {},\n      stubTrue: function () { return true; },\n      stubFalse: function () { return false; },\n      constant: function (value) { return function () { return value; }; },\n    };\n    function makeChain(value) {\n      return {\n        value: function () { return value; },\n        valueOf: function () { return value; },\n        toString: function () { return String(value); },\n        map: function (fn) { return makeChain(lib.map(value, fn)); },\n        filter: function (fn) { return makeChain(lib.filter(value, fn)); },\n        reject: function (fn) { return makeChain(lib.reject(value, fn)); },\n        sortBy: function (fn) { return makeChain(lib.sortBy(value, fn)); },\n        uniq: function () { return makeChain(lib.uniq(value)); },\n        flatten: function () { return makeChain(lib.flatten(value)); },\n        take: function (count) { return makeChain(lib.take(value, count)); },\n        last: function () { return lib.last(value); },\n        first: function () { return lib.first(value); },\n        head: function () { return lib.first(value); },\n        toArray: function () { return value; },\n      };\n    }\n    var callable = new Proxy(function (value) { return makeChain(value); }, {\n      get: function (target, prop) {\n        if (prop === 'prototype') return undefined;\n        return lib[prop];\n      },\n      apply: function (target, thisArg, args) { return makeChain(args[0]); },\n    });\n    return callable;\n  })();\n  window._ = _;\n  window.lodash = _;\n\n  // ── toastr 与弹窗 ──────────────────────────────────────────\n  var toastr = {\n    options: {},\n    success: function (message, title, options) { post({ tt: 'toast', level: 'success', message: String(message == null ? '' : message), title: title == null ? '' : String(title), options: options || {} }); },\n    info: function (message, title, options) { post({ tt: 'toast', level: 'info', message: String(message == null ? '' : message), title: title == null ? '' : String(title), options: options || {} }); },\n    warning: function (message, title, options) { post({ tt: 'toast', level: 'warning', message: String(message == null ? '' : message), title: title == null ? '' : String(title), options: options || {} }); },\n    error: function (message, title, options) { post({ tt: 'toast', level: 'error', message: String(message == null ? '' : message), title: title == null ? '' : String(title), options: options || {} }); },\n    clear: function () { post({ tt: 'toast-clear' }); },\n    remove: function () { post({ tt: 'toast-clear' }); },\n  };\n  window.toastr = toastr;\n\n  var POPUP_TYPE = { TEXT: 1, CONFIRM: 2, INPUT: 3, DISPLAY: 4, CROP: 5 };\n  var POPUP_RESULT = {\n    AFFIRMATIVE: 1, NEGATIVE: 0, CANCELLED: -1,\n    CUSTOM1: 2, CUSTOM2: 3, CUSTOM3: 4, CUSTOM4: 5, CUSTOM5: 6, CUSTOM6: 7, CUSTOM7: 8, CUSTOM8: 9, CUSTOM9: 10,\n  };\n  var popupSeq = 0;\n  var popupPending = new Map();\n\n  function callGenericPopup(content, type, inputValue, options) {\n    return new Promise(function (resolve) {\n      var id = ++popupSeq;\n      popupPending.set(id, resolve);\n      post({\n        tt: 'popup',\n        id: id,\n        content: typeof content === 'string' ? content : (content && content.outerHTML ? content.outerHTML : String(content == null ? '' : content)),\n        type: type == null ? POPUP_TYPE.TEXT : type,\n        inputValue: inputValue == null ? '' : String(inputValue),\n        options: options || {},\n      });\n      setTimeout(function () {\n        if (popupPending.has(id)) {\n          popupPending.delete(id);\n          resolve(POPUP_RESULT.CANCELLED);\n        }\n      }, 120000);\n    });\n  }\n\n  window.callGenericPopup = callGenericPopup;\n  window.POPUP_TYPE = POPUP_TYPE;\n  window.POPUP_RESULT = POPUP_RESULT;\n\n  // ── 事件全局 ───────────────────────────────────────────────\n  function eventOn(type, listener) { return core.bus.on(type, listener); }\n  function eventOnce(type, listener) { return core.bus.once(type, listener); }\n  function eventMakeFirst(type, listener) { return core.bus.makeFirst(type, listener); }\n  function eventMakeLast(type, listener) { return core.bus.makeLast(type, listener); }\n  function eventRemoveListener(type, listener) { return core.bus.remove(type, listener); }\n  function eventEmit(type) { return core.bus.emit.apply(core.bus, arguments); }\n  function eventEmitAndWait(type) { return core.bus.emitAndWait.apply(core.bus, arguments); }\n  function eventClearEvent(type) { return core.bus.clearEvent(type); }\n  function eventClearListener(listener) { return core.bus.clearListener(listener); }\n  function eventClearAll() { return core.bus.clearAll(); }\n\n  window.eventOn = eventOn;\n  window.eventOnce = eventOnce;\n  window.eventMakeFirst = eventMakeFirst;\n  window.eventMakeLast = eventMakeLast;\n  window.eventRemoveListener = eventRemoveListener;\n  window.eventEmit = eventEmit;\n  window.eventEmitAndWait = eventEmitAndWait;\n  window.eventClearEvent = eventClearEvent;\n  window.eventClearListener = eventClearListener;\n  window.eventClearAll = eventClearAll;\n  window.tavern_events = TAVERN_EVENTS;\n  window.event_types = TAVERN_EVENTS;\n  window.iframe_events = {\n    MESSAGE_IFRAME_RENDER_STARTED: 'message_iframe_render_started',\n    MESSAGE_IFRAME_RENDER_ENDED: 'message_iframe_render_ended',\n    GENERATION_REQUESTED: 'js_generation_requested',\n    GENERATION_STARTED: 'js_generation_started',\n    STREAM_TOKEN_RECEIVED_FULLY: 'js_stream_token_received_fully',\n    STREAM_TOKEN_RECEIVED_INCREMENTALLY: 'js_stream_token_received_incrementally',\n    GENERATION_ENDED: 'js_generation_ended',\n  };\n\n  // ── TH 变量 / 消息 / 宏 / 世界书全局 ────────────────────────\n  window.getVariables = function (option) { return core.getVariables(option); };\n  window.replaceVariables = function (variables, option) { return core.replaceVariables(variables, option); };\n  window.updateVariablesWith = function (updater, option) { return core.updateVariablesWith(updater, option); };\n  window.insertOrAssignVariables = function (variables, option) { return core.insertOrAssignVariables(variables, option); };\n  window.insertVariables = function (variables, option) { return core.insertVariables(variables, option); };\n  window.deleteVariable = function (key, option) { return core.deleteVariable(key, option); };\n  window.getChatMessages = function (range, option) { return core.getChatMessages(range, option); };\n  window.setChatMessages = function (messages, option) { return core.setChatMessages(messages, option); };\n  window.createChatMessages = function (messages, option) { return core.createChatMessages(messages, option); };\n  window.deleteChatMessages = function (ids, option) { return core.deleteChatMessages(ids, option); };\n  window.rotateChatMessages = function (begin, middle, end, option) { return core.rotateChatMessages(begin, middle, end, option); };\n  window.getLastMessageId = function () { return core.getLastMessageId(); };\n  window.substitudeMacros = function (text) { return core.substituteMacros(text); };\n  window.substituteParams = function (text) { return core.substituteMacros(text); };\n  window.substituteParamsExtended = function (text) { return core.substituteMacros(text); };\n  window.getTavernHelperVersion = function () { return '4.12.1'; };\n  window.getTavernHelperExtensionId = function () { return 'JS-Slash-Runner'; };\n  window.getTavernVersion = function () { return '1.13.4'; };\n  window.getCurrentLocale = function () { return 'zh-CN'; };\n  window.getMessageId = function () { return core.getCurrentMessageId(); };\n  window.getScriptId = function () { return core.getCurrentScriptId(); };\n  window.getButtonEvent = function (name) { return 'th_button_' + String(name || ''); };\n  window.getScriptInfo = function () { return { id: core.getCurrentScriptId(), name: INIT.scriptName || '' }; };\n  window.errorCatched = function (fn) {\n    return function () {\n      try { return fn.apply(this, arguments); } catch (error) {\n        toastr.error(String(error && error.message ? error.message : error), '脚本错误');\n        return undefined;\n      }\n    };\n  };\n  window.formatAsDisplayedMessage = function (messageId) {\n    var list = core.getChatMessages(messageId == null ? -1 : messageId);\n    var message = list[0];\n    if (!message) return '';\n    return textToHtml(applyRegexes(message.message, 2));\n  };\n  window.retrieveDisplayedMessage = window.formatAsDisplayedMessage;\n  window.refreshOneMessage = function (messageId) { post({ tt: 'refresh', index: messageId }); };\n  window.triggerSlash = function (command) {\n    try { return core.slashCommand(command); } catch (error) {\n      toastr.error(String(error && error.message ? error.message : error), '命令失败');\n      throw error;\n    }\n  };\n  window.getLorebookEntries = function (name) { return core.getLorebookEntries(name); };\n  window.getWorldbook = function (name) { return core.getWorldbook(name); };\n  window.getWorldbookNames = function () { return core.getWorldbookNames(); };\n  window.getGlobalWorldbookNames = function () { return core.getGlobalWorldbookNames(); };\n  window.getCharWorldbookNames = function () { return core.getCharWorldbookNames(); };\n  window.getCurrentCharPrimaryLorebook = function () { return core.getCurrentCharPrimaryLorebook(); };\n  window.getCharLorebooks = function (type) {\n    var names = core.getCharWorldbookNames();\n    if (type === 'primary') return names.primary;\n    if (type === 'additional') return names.additional;\n    return names;\n  };\n  window.getLorebooks = function () { return core.getWorldbookNames().map(function (name) { return core.getWorldbook(name); }); };\n  window.getLorebookSettings = function () { return { chatLorebook: null, selectedGlobalLorebooks: [], selectedCharLorebooks: { primary: core.worldbookName, additional: [] } }; };\n  window.getTavernRegexes = function () { return (INIT.regexScripts || []).slice(); };\n  window.formatAsTavernRegexedString = function (text, placement, options) { return applyRegexes(text, placement, options); };\n  window.isCharacterTavernRegexesEnabled = function () { return true; };\n  window.registerMacroLike = function (name, fn) { core.registerMacro(name, fn); };\n  window.injectPrompts = function () { return {}; };\n  window.uninjectPrompts = function () { return {}; };\n  window.registerScriptButton = function (button) {\n    if (!window.__ttButtons) window.__ttButtons = [];\n    window.__ttButtons.push(button);\n  };\n  window.getAllEnabledScriptButtons = function () { return window.__ttButtons || []; };\n  window.generate = function () { return Promise.reject(new Error('DSH 的 TH 宿主尚未接通 generate：需要 Host 侧的生成桥。')); };\n  window.generateRaw = function () { return Promise.reject(new Error('DSH 的 TH 宿主尚未接通 generateRaw：需要 Host 侧的生成桥。')); };\n  window.stopGenerationById = function () { return true; };\n  window.stopAllGeneration = function () { return true; };\n  window.getModelList = function () { return Promise.resolve([]); };\n  window.getProxyPresetNames = function () { return Promise.resolve([]); };\n  window.getPresetNames = function () { return Promise.resolve(INIT.presetName ? [INIT.presetName] : []); };\n  window.getLoadedPresetName = function () { return INIT.presetName || '默认'; };\n  window.getPreset = function () { return Promise.resolve(null); };\n  window.loadPreset = function () { return Promise.resolve(); };\n  window.replacePreset = function () { throw new Error('DSH TH 宿主：预设写入未接通'); };\n  window.updatePresetWith = function () { throw new Error('DSH TH 宿主：预设写入未接通'); };\n  window.createPreset = function () { throw new Error('DSH TH 宿主：预设写入未接通'); };\n  window.createOrReplacePreset = function () { throw new Error('DSH TH 宿主：预设写入未接通'); };\n  window.deletePreset = function () { throw new Error('DSH TH 宿主：预设写入未接通'); };\n  window.renamePreset = function () { throw new Error('DSH TH 宿主：预设写入未接通'); };\n  window.setPreset = function () { throw new Error('DSH TH 宿主：预设写入未接通'); };\n  window.getCharacterNames = function () { return [core.charName]; };\n  window.getCharacterIds = function () { return ['0']; };\n  window.getCurrentCharacterName = function () { return core.charName; };\n  window.getCurrentCharacterId = function () { return '0'; };\n  window.getCharData = function () { return INIT.card || {}; };\n  window.getCharAvatarPath = function () { return ''; };\n  window.getChatHistoryBrief = function () { return core.getChatMessages('0-{{lastMessageId}}'); };\n  window.getChatHistoryDetail = function () { return core.getChatMessages('0-{{lastMessageId}}', { include_swipes: true }); };\n  window.getPersonaNames = function () { return [core.userName]; };\n  window.getPersonaIds = function () { return ['0']; };\n  window.getCurrentPersonaName = function () { return core.userName; };\n  window.getCurrentPersonaId = function () { return '0'; };\n  window.getPersonaAvatarPath = function () { return ''; };\n  window.builtin = {};\n  window.isAdmin = function () { return false; };\n  window.getModelList = function () { return Promise.resolve([]); };\n  window.initializeGlobal = function (name) { window[name] = window[name] || {}; return window[name]; };\n  window.waitGlobalInitialized = function (name) { return Promise.resolve(window[name] || {}); };\n  window.getTavernHelperExtensionId = function () { return 'JS-Slash-Runner'; };\n  window.getExtensionType = function () { return 'local'; };\n  window.getExtensionStatus = function () { return Promise.resolve({ installed: true }); };\n  window.isInstalledExtension = function () { return Promise.resolve(true); };\n  window.tavern_events = TAVERN_EVENTS;\n\n  // 世界书写入 API：明确拒绝，避免脚本以为写成功了。\n  ['createWorldbook', 'createOrReplaceWorldbook', 'deleteWorldbook', 'replaceWorldbook', 'updateWorldbookWith',\n    'createWorldbookEntries', 'deleteWorldbookEntries', 'rebindGlobalWorldbooks', 'rebindCharWorldbooks',\n    'rebindChatWorldbook', 'createLorebook', 'deleteLorebook', 'setLorebookSettings',\n    'replaceLorebookEntries', 'updatelorebookEntriesWith', 'setLorebookEntries', 'createLorebookEntries',\n    'deleteLorebookEntries', 'createCharacter', 'createOrReplaceCharacter', 'deleteCharacter',\n    'replaceCharacter', 'updateCharacterWith', 'createOrReplacePersona', 'deletePersona', 'replacePersona',\n    'updatePersonaWith', 'replaceTavernRegexes', 'updateTavernRegexesWith', 'installExtension',\n    'uninstallExtension', 'reinstallExtension', 'updateExtension', 'uploadTavernFile', 'deleteTavernFile'].forEach(function (name) {\n    window[name] = function () { throw new Error('DSH TH 宿主：' + name + ' 是只读兼容层，未实现写入'); };\n  });\n\n  // ── SillyTavern 上下文 ────────────────────────────────────\n  var headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': 'dsh-tt' };\n  var extensionPrompts = {};\n  var scriptButtons = window.__ttButtons || [];\n  var functionTools = new Map();\n\n  function characterCardFields() { return core.getCharacterCardFields(); }\n\n  var ToolManager = {\n    isToolCallingSupported: function () { return false; },\n    canPerformToolCalls: function () { return false; },\n    registerFunctionTool: function (tool) { functionTools.set(tool && tool.name, tool); },\n    unregisterFunctionTool: function (name) { functionTools.delete(name); },\n    getFunctionTools: function () { return Array.from(functionTools.values()); },\n  };\n\n  var ST = {\n    chat: core.chat,\n    chatMetadata: core.chatMetadata,\n    extensionSettings: core.extensionSettings,\n    characters: core.characters,\n    name1: core.userName,\n    name2: core.charName,\n    characterId: '0',\n    groupId: '',\n    chatId: core.chatId,\n    maxContext: 128000,\n    onlineStatus: 'connected',\n    streamingProcessor: null,\n    mainApi: 'openai',\n    menuType: 0,\n    tags: [],\n    tagMap: {},\n    createCharacterData: {},\n    extensionPrompts: extensionPrompts,\n    chatCompletionSettings: { openai_model: 'dsh', chat_completion_source: 'dsh', temperature: 1, openai_max_tokens: 8000 },\n    textCompletionSettings: {},\n    powerUserSettings: {},\n    symbols: { ignore: Symbol('ignore') },\n    POPUP_TYPE: POPUP_TYPE,\n    POPUP_RESULT: POPUP_RESULT,\n    callGenericPopup: callGenericPopup,\n    ToolManager: ToolManager,\n    eventSource: {\n      on: eventOn,\n      makeLast: eventMakeLast,\n      makeFirst: eventMakeFirst,\n      removeListener: eventRemoveListener,\n      emit: eventEmit,\n      emitAndWait: eventEmitAndWait,\n      once: eventOnce,\n    },\n    eventTypes: TAVERN_EVENTS,\n    getCurrentChatId: function () { return core.chatId; },\n    getRequestHeaders: function () { return Object.assign({}, headers); },\n    saveChat: function () { post({ tt: 'save' }); return Promise.resolve(); },\n    saveSettingsDebounced: function () { post({ tt: 'settings', value: JSON.parse(JSON.stringify(core.extensionSettings)) }); return Promise.resolve(); },\n    saveMetadata: function () { return Promise.resolve(); },\n    getCharacterCardFields: characterCardFields,\n    getCharacters: function () { return Promise.resolve(core.characters); },\n    loadWorldInfo: function (name) { return Promise.resolve(core.getWorldbook(name)); },\n    saveWorldInfo: function () { throw new Error('DSH TH 宿主：世界书写入未接通'); },\n    reloadWorldInfoEditor: function () {},\n    updateWorldInfoList: function () { return Promise.resolve(); },\n    convertCharacterBook: function (book) { return core.getWorldbook(book && book.name); },\n    getWorldInfoPrompt: function () {\n      return Promise.resolve({ worldInfoString: '', worldInfoBefore: '', worldInfoAfter: '', worldInfoExamples: [], worldInfoDepth: [], anBefore: [], anAfter: [] });\n    },\n    registerMacro: function (key, value) { core.registerMacro(key, value); },\n    unregisterMacro: function (key) { core.unregisterMacro(key); },\n    getChatCompletionModel: function () { return 'dsh'; },\n    getCurrentLocale: function () { return 'zh-CN'; },\n    translate: function (text) { return text; },\n    t: function (strings) {\n      var values = Array.prototype.slice.call(arguments, 1);\n      return String(strings || '').replace(/\\{(\\w+)\\}/g, function (raw, key) {\n        var index = Number(key);\n        return Number.isFinite(index) && values[index] !== undefined ? values[index] : raw;\n      });\n    },\n    addLocaleData: function () {},\n    registerFunctionTool: ToolManager.registerFunctionTool,\n    unregisterFunctionTool: ToolManager.unregisterFunctionTool,\n    isToolCallingSupported: ToolManager.isToolCallingSupported,\n    canPerformToolCalls: ToolManager.canPerformToolCalls,\n    registerDebugFunction: function () {},\n    setExtensionPrompt: function (id, content, position, depth, scan, role, filter) {\n      extensionPrompts[id] = { value: String(content == null ? '' : content), position: position, depth: depth, scan: scan, role: role, filter: filter };\n      return Promise.resolve();\n    },\n    unsetExtensionPrompt: function (id) { delete extensionPrompts[id]; return Promise.resolve(); },\n    generate: window.generate,\n    generateQuietPrompt: function () { return window.generate; },\n    generateRaw: window.generateRaw,\n    stopGeneration: function () { return true; },\n    sendSystemMessage: function (type, text) { post({ tt: 'system-message', text: String(text == null ? '' : text), type: type }); return Promise.resolve(); },\n    addOneMessage: function (message) {\n      return core.createChatMessages([{\n        role: message && message.is_user ? 'user' : 'assistant',\n        message: String(message && (message.mes || message.message) || ''),\n        name: message && message.name,\n      }]);\n    },\n    deleteLastMessage: function () { return core.deleteChatMessages([core.getLastMessageId()]); },\n    updateMessageBlock: function (id) { core.touchMessage(id); },\n    messageFormatting: function (message) { return textToHtml(applyRegexes(message, 2)); },\n    uuidv4: function () {\n      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) {\n        var value = (Math.random() * 16) | 0;\n        return (ch === 'x' ? value : (value & 0x3) | 0x8).toString(16);\n      });\n    },\n    humanizedDateTime: function () { return new Date().toLocaleString('zh-CN'); },\n    getTokenizerModel: function () { return 'dsh'; },\n    getTextTokens: function (type, text) { return Promise.resolve(Math.ceil(String(text || '').length / 3.2)); },\n    getTokenCountAsync: function (text) { return Promise.resolve(Math.ceil(String(text || '').length / 3.2)); },\n    substituteParams: function (text) { return core.substituteMacros(text); },\n    substituteParamsExtended: function (text) { return core.substituteMacros(text); },\n    renderExtensionTemplateAsync: function () { return Promise.resolve(''); },\n    getPresetManager: function () { return null; },\n    showLoader: function () {}, hideLoader: function () { return Promise.resolve(); },\n    isMobile: function () { return false; },\n    shouldSendOnEnter: function () { return true; },\n    timestampToMoment: function (value) { return new Date(value); },\n    executeSlashCommandsWithOptions: function (text) { return Promise.resolve({ pipe: core.slashCommand(text), isError: false, interrupt: false }); },\n    clearChat: function () { return core.deleteChatMessages(Array.from({ length: core.getLastMessageId() + 1 }, function (_, index) { return index; })); },\n    printMessages: function () { return Promise.resolve(); },\n    updateChatMetadata: function (values) { Object.assign(core.chatMetadata, values || {}); },\n    saveReply: function () { return Promise.resolve(); },\n    timestamp: function () { return Date.now(); },\n    ChatCompletionService: {},\n    TextCompletionService: {},\n    ConnectionManagerRequestService: {},\n    registerDataBankScraper: function () { return Promise.resolve(); },\n    getThumbnailUrl: function () { return ''; },\n    writeExtensionField: function () { return Promise.resolve(); },\n    unshallowCharacter: function () { return Promise.resolve(); },\n    getTextGenServer: function () { return ''; },\n    extractMessageFromData: function (data) { return String(data && data.content || ''); },\n  };\n  ST.getContext = function () {\n    var context = {};\n    Object.keys(ST).forEach(function (key) { context[key] = ST[key]; });\n    context.getContext = ST.getContext;\n    ['getVariables', 'replaceVariables', 'updateVariablesWith', 'insertOrAssignVariables', 'insertVariables',\n      'deleteVariable', 'getChatMessages', 'setChatMessages', 'createChatMessages', 'deleteChatMessages',\n      'rotateChatMessages', 'getLastMessageId', 'substitudeMacros', 'eventOn', 'eventOnce', 'eventEmit',\n      'eventEmitAndWait', 'eventRemoveListener', 'formatAsDisplayedMessage', 'retrieveDisplayedMessage',\n      'refreshOneMessage', 'triggerSlash', 'getLorebookEntries', 'getWorldbook', 'getWorldbookNames',\n      'getCharWorldbookNames', 'getCurrentCharPrimaryLorebook', 'getTavernHelperVersion', 'getTavernVersion',\n      'getScriptId', 'getButtonEvent', 'getMessageId', 'errorCatched', 'registerMacroLike'].forEach(function (key) {\n      context[key] = window[key];\n    });\n    return context;\n  };\n  Object.defineProperty(ST, 'chat', { get: function () { return core.chat; }, enumerable: true, configurable: true });\n  Object.defineProperty(ST, 'chatMetadata', { get: function () { return core.chatMetadata; }, enumerable: true, configurable: true });\n  Object.defineProperty(ST, 'extensionSettings', { get: function () { return core.extensionSettings; }, enumerable: true, configurable: true });\n  Object.defineProperty(ST, 'characters', { get: function () { return core.characters; }, enumerable: true, configurable: true });\n  Object.defineProperty(ST, 'chatCompletionSettings', { value: ST.chatCompletionSettings, writable: true, enumerable: true, configurable: true });\n  window.SillyTavern = ST;\n  window.getContext = ST.getContext;\n\n  // ── TavernHelper 对象 ─────────────────────────────────────\n  var TavernHelper = {};\n  ['playAudio', 'pauseAudio', 'getAudioList', 'replaceAudioList', 'appendAudioList', 'getAudioSettings',\n    'setAudioSettings', 'getCurrentAudio', 'getVariables', 'replaceVariables', 'updateVariablesWith',\n    'insertOrAssignVariables', 'insertVariables', 'deleteVariable', 'getChatMessages', 'setChatMessages',\n    'createChatMessages', 'deleteChatMessages', 'rotateChatMessages', 'getLastMessageId', 'substitudeMacros',\n    'eventOn', 'eventOnce', 'eventEmit', 'eventEmitAndWait', 'eventRemoveListener', 'eventMakeFirst',\n    'eventMakeLast', 'eventClearEvent', 'eventClearListener', 'eventClearAll', 'getTavernHelperVersion',\n    'getTavernHelperExtensionId', 'getTavernVersion', 'formatAsDisplayedMessage', 'retrieveDisplayedMessage',\n    'refreshOneMessage', 'triggerSlash', 'getLorebookEntries', 'getWorldbook', 'getWorldbookNames',\n    'getGlobalWorldbookNames', 'getCharWorldbookNames', 'getCurrentCharPrimaryLorebook', 'getCharLorebooks',\n    'getLorebooks', 'getLorebookSettings', 'getTavernRegexes', 'formatAsTavernRegexedString',\n    'isCharacterTavernRegexesEnabled', 'registerMacroLike', 'injectPrompts', 'uninjectPrompts', 'generate',\n    'generateRaw', 'getModelList', 'getProxyPresetNames', 'stopGenerationById', 'stopAllGeneration',\n    'getPresetNames', 'getLoadedPresetName', 'getPreset', 'loadPreset', 'getCharacterNames',\n    'getCharacterIds', 'getCurrentCharacterName', 'getCurrentCharacterId', 'getCharData', 'getCharAvatarPath',\n    'getChatHistoryBrief', 'getChatHistoryDetail', 'getPersonaNames', 'getPersonaIds', 'getCurrentPersonaName',\n    'getCurrentPersonaId', 'getPersonaAvatarPath', 'getMessageId', 'errorCatched', 'getScriptId',\n    'getButtonEvent', 'getAllEnabledScriptButtons', 'initializeGlobal', 'waitGlobalInitialized', 'builtin',\n    'isAdmin', 'getExtensionType', 'getExtensionStatus', 'isInstalledExtension', 'builtin_prompt_default_order',\n    'default_preset', 'RawCharacter'].forEach(function (key) {\n    if (window[key] !== undefined) TavernHelper[key] = window[key];\n  });\n  TavernHelper.builtin_prompt_default_order = [];\n  TavernHelper.default_preset = null;\n  TavernHelper.RawCharacter = { from: function () { throw new Error('DSH TH 宿主：RawCharacter 未实现'); } };\n  window.TavernHelper = TavernHelper;\n\n  // ── 脚本执行 ──────────────────────────────────────────────\n  var currentScript = null;\n  var scriptErrors = [];\n  var helperRoot = document.createElement('div');\n  helperRoot.id = 'tavern_helper';\n  helperRoot.style.display = 'none';\n  document.body.appendChild(helperRoot);\n\n  function scriptError(script, error) {\n    var text = String(error && (error.stack || error.message) || error);\n    scriptErrors.push({ id: script && script.id, name: script && script.name, error: text });\n    log('error', '脚本「' + (script && script.name ? script.name : '?') + '」出错：' + text.slice(0, 800));\n  }\n\n  window.addEventListener('error', function (event) {\n    if (event && event.message) {\n      scriptError(currentScript, event.error || event.message);\n    }\n  });\n  window.addEventListener('unhandledrejection', function (event) {\n    scriptError(currentScript, event.reason);\n  });\n\n  function classifyModule(content) {\n    var trimmed = String(content || '').replace(/^\\s*(?:\\/\\*[\\s\\S]*?\\*\\/\\s*|\\/\\/[^\\n]*\\n\\s*)*/, '');\n    return /^(?:import|export)\\s/.test(trimmed);\n  }\n\n  /** 在脚本启动瞬间让它看到「只有自己」的 #tavern_helper，复刻 TH 的每脚本 iframe 语义。 */\n  function markCurrentScript(script) {\n    helperRoot.innerHTML = '';\n    var marker = document.createElement('div');\n    marker.setAttribute('data-script-id', String(script.id || ''));\n    helperRoot.appendChild(marker);\n  }\n\n  function runScript(script) {\n    return new Promise(function (resolve) {\n      if (!script || !script.content) { resolve(); return; }\n      currentScript = script;\n      core.makeScriptContext(script.id, -1);\n      markCurrentScript(script);\n      var element = document.createElement('script');\n      var isModule = classifyModule(script.content);\n      if (isModule) element.type = 'module';\n      element.setAttribute('data-tt-script', String(script.id || ''));\n      element.textContent = String(script.content);\n      var settled = false;\n      var finish = function () {\n        if (settled) return;\n        settled = true;\n        currentScript = null;\n        resolve();\n      };\n      element.onerror = function () {\n        scriptError(script, '脚本加载失败（可能是 import 网络错误或语法错误）');\n        finish();\n      };\n      element.onload = function () { finish(); };\n      document.body.appendChild(element);\n      log('info', '执行脚本「' + (script.name || script.id) + '」' + (isModule ? '（module）' : ''));\n      // 内联 classic 脚本同步执行；module 脚本要等 import 完成。给一个安全上限。\n      setTimeout(finish, isModule ? 20000 : 0);\n    });\n  }\n\n  async function runScripts() {\n    var scripts = Array.isArray(INIT.scripts) ? INIT.scripts : [];\n    for (var i = 0; i < scripts.length; i += 1) {\n      await runScript(scripts[i]);\n    }\n    currentScript = null;\n    // 脚本可能异步注册监听；稍后补发一次就绪事件。\n    setTimeout(function () {\n      try {\n        core.bus.emit(TAVERN_EVENTS.CHAT_CHANGED, core.chatId);\n        core.bus.emit(TAVERN_EVENTS.APP_READY);\n        core.bus.emit(TAVERN_EVENTS.SETTINGS_LOADED);\n        core.bus.emit(TAVERN_EVENTS.EXTENSIONS_FIRST_LOAD);\n        // 让 MVU 在玩家发出第一条消息之前就完成 [InitVar] 初始化。\n        if (core.getLastMessageId() >= 0) {\n          core.bus.emit(TAVERN_EVENTS.GENERATION_STARTED, 'dsh-tt-init', {}, false);\n        }\n      } catch (error) { scriptError(null, error); }\n      post({ tt: 'ready', scripts: scripts.map(function (item) { return { id: item.id, name: item.name }; }), module: scripts.some(function (item) { return classifyModule(item.content); }), errors: scriptErrors.length });\n    }, 800);\n  }\n\n  // ── 父窗口 → iframe ──────────────────────────────────────\n  window.addEventListener('message', function (event) {\n    if (event.source !== window.parent) return;\n    var data = event.data;\n    if (!data || data.__ttParent !== true) return;\n    try {\n      switch (data.type) {\n        case 'chat':\n          core.applyChat(data.messages || [], { emitAdded: data.emitAdded !== false });\n          break;\n        case 'emit':\n          core.bus.emit.apply(core.bus, [data.event].concat(data.args || []));\n          break;\n        case 'popup-result': {\n          var resolve = popupPending.get(data.id);\n          if (resolve) {\n            popupPending.delete(data.id);\n            resolve(data.result);\n          }\n          break;\n        }\n        case 'settings':\n          Object.keys(core.extensionSettings).forEach(function (key) { delete core.extensionSettings[key]; });\n          Object.assign(core.extensionSettings, data.value || {});\n          break;\n        case 'refresh':\n          post({ tt: 'chat-reload' });\n          break;\n        case 'dispose':\n          core.bus.clearAll();\n          break;\n        default:\n          break;\n      }\n    } catch (error) {\n      scriptError(null, error);\n    }\n  });\n\n  post({ tt: 'boot', chatId: core.chatId, charName: core.charName, scriptCount: (INIT.scripts || []).length });\n  runScripts();\n})();\n";
    const STORE_KEY = 'dsh-tt:v3';
    const TH_KEY = 'dsh-tt:th:v1';
    const RP_PREFIX = 'RP · ';
    const POPUP_RESULT = { AFFIRMATIVE: 1, NEGATIVE: 0, CANCELLED: -1 };
    const POPUP_TYPE = { TEXT: 1, CONFIRM: 2, INPUT: 3, DISPLAY: 4 };

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
      const [thReady, setThReady] = useState(false);
      const [thShow, setThShow] = useState(false);
      const [thReload, setThReload] = useState(0);
      const [loreBookId, setLoreBookId] = useState('card');
      const [loreSearch, setLoreSearch] = useState('');
      const [loreOpen, setLoreOpen] = useState(null);
      const [promptSearch, setPromptSearch] = useState('');
      const [promptOpen, setPromptOpen] = useState(null);
      const [varOpen, setVarOpen] = useState(false);

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

      const startChat = useCallback(async (card) => {
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
          const raw = await ensureCard(card);
          const inner = innerOf(raw);
          const greetings = Array.isArray(inner.alternate_greetings)
            ? inner.alternate_greetings
            : (Array.isArray(inner.alternateGreetings) ? inner.alternateGreetings : []);
          const greetingText = String(inner.first_mes || inner.firstMes || greetings[0] || '').trim();
          setView('chat');
          setFloors([]);
          thSentRef.current = false;
          patchStore({
            activeCardId: card.id,
            sessionMeta: {
              ...store.sessionMeta,
              [id]: { cardId: card.id, presetId: store.activePresetId, greeting: greetingText },
            },
          });
          log(greetingText ? `已新建会话，开场白 ${greetingText.length} 字（只显示，不发送）` : '已新建会话（这张卡没有开场白）');
          await refreshSessions();
        } catch (error) {
          const message = '开局失败：' + (error && (error.code || error.message) || error);
          log(message);
          setNotice(message);
        } finally { setBusy(false); }
      }, [bridge, patchStore, ensureCard, refreshSessions, log, store.sessionMeta, store.activePresetId]);

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
        scriptSignature,
        thReload,
      ].join('|');

      useEffect(() => {
        const container = thFrameRef.current;
        if (!container || !bridge?.ok || !activeId || !activeCard || !activeCardRaw) {
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
        setBusy(true);
        setDraft('');
        setFloors((prev) => [...prev, { id: `local-${Date.now()}`, role: 'user', text, seq: -1, time: Date.now() }]);
        try {
          await bridge.prompt(activeId, text, buildBinding());
        } catch (error) {
          log(`发送失败：${error?.code || error?.message || error}`);
          pushToast('error', String(error?.message || error), '发送失败');
        } finally { setBusy(false); }
      }, [draft, activeId, busy, bridge, buildBinding, log, pushToast]);

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
          [['chat', '对话'], ['cards', '角色'], ['lore', '世界书'], ['presets', '预设'], ['extensions', '扩展'], ['settings', '设置']].map(([key, label]) =>
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
                thReady ? h('span', { className: 'tt-note', title: '酒馆助手脚本已运行' }, 'TH ✓') : null,
                h('button', { className: 'tt-send', disabled: busy || !draft.trim() || !activeId, onClick: send }, busy ? '生成中…' : '发送'),
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

      const pane = view === 'cards' ? cardsPane
        : view === 'lore' ? lorePane
          : view === 'presets' ? presetsPane
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
        modalNode,
      );
    }

    function sanitizeExtensions(extensions) {
      const copy = extensions && typeof extensions === 'object' ? { ...extensions } : {};
      delete copy.tavern_helper;
      delete copy.regex_scripts;
      return copy;
    }

    const STORE_ROOT = 'X:\\dsh-tt';

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
