// EJS 子集 + ST-Prompt-Template 兼容作用域。
//
// 语法：<% %> / <%= %>（HTML 转义）/ <%- %>（原样）/ <%# %>（注释）
// 兼容 EJS 的 trim 标记：-%> 与 _%> 吃掉紧随其后的换行；<%_ 吃掉前面的空白。
//
// 安全性：模板来自用户自己的角色卡/预设，等价于 TH 脚本的可信级别；这里在 Host
// 进程内执行，只暴露白名单函数（getvar/setvar/getwi/getchar/_/faker 等），不提供
// require/process/fs。

const TAG_OPEN = '<%';

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

export function unescapeHtml(value) {
  return String(value ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** 把 `a.b[0].c` 拆成路径数组；数组直接返回。 */
export function toPath(path) {
  if (Array.isArray(path)) return path;
  if (path == null) return [];
  return String(path)
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/\[["']([^"']+)["']\]/g, '.$1')
    .split('.')
    .filter((part) => part !== '');
}

function own(obj, key) {
  return obj != null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
}

/** 读取嵌套路径；路径不存在时返回 fallback。 */
export function getPath(object, path, fallback) {
  if (object == null) return fallback;
  const parts = toPath(path);
  if (!parts.length) return object;
  let current = object;
  for (const part of parts) {
    if (current == null) return fallback;
    current = current[part];
  }
  return current === undefined ? fallback : current;
}

/** 按点路径写值；中间对象不存在时创建。 */
export function setPath(object, path, value) {
  const parts = toPath(path);
  if (!parts.length) return object;
  let current = object;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (current[part] == null || typeof current[part] !== 'object') current[part] = {};
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
  return object;
}

export function hasPath(object, path) {
  if (object == null) return false;
  const parts = toPath(path);
  if (!parts.length) return false;
  let current = object;
  for (const part of parts) {
    if (!own(current, part)) return false;
    current = current[part];
  }
  return true;
}

export function deletePath(object, path) {
  const parts = toPath(path);
  if (!parts.length || object == null) return false;
  let current = object;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!own(current, parts[i])) return false;
    current = current[parts[i]];
  }
  return delete current[parts[parts.length - 1]];
}

function isPlainObject(value) {
  if (value == null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function deepClone(value) {
  if (value == null || typeof value !== 'object') return value;
  try { return structuredClone(value); } catch { /* fall through */ }
  try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => own(b, key) && deepEqual(a[key], b[key]));
}

function propertyIteratee(source) {
  if (source == null) return (value) => value;
  if (typeof source === 'function') return source;
  if (typeof source === 'string' || typeof source === 'number') {
    return (value) => getPath(value, source);
  }
  if (Array.isArray(source)) {
    const [path, expected] = source;
    return (value) => deepEqual(getPath(value, path), expected);
  }
  if (typeof source === 'object') {
    return (value) => Object.keys(source).every((key) => deepEqual(getPath(value, key), source[key]));
  }
  return (value) => value;
}

function toNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function splitWords(text) {
  return String(text ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function chainable(value) {
  const wrapper = {
    value: () => value,
    valueOf: () => value,
    toString: () => String(value),
    map: (fn) => chainable([...value].map(propertyIteratee(fn))),
    filter: (fn) => chainable([...value].filter(propertyIteratee(fn))),
    sortBy: (fn) => chainable([...value].sort((a, b) => {
      const pa = propertyIteratee(fn)(a);
      const pb = propertyIteratee(fn)(b);
      return pa < pb ? -1 : pa > pb ? 1 : 0;
    })),
    uniq: () => chainable([...new Set(value)]),
    first: () => value?.[0],
    last: () => value?.[value.length - 1],
    size: () => value?.length ?? Object.keys(value ?? {}).length,
  };
  return wrapper;
}

/** 紧凑版 lodash；覆盖角色卡 EJS 里常见的集合/字符串工具。 */
export function createLodash() {
  const _ = {
    get: getPath,
    set: setPath,
    has: hasPath,
    unset: deletePath,
    update(object, path, updater) {
      const current = getPath(object, path);
      const next = typeof updater === 'function' ? updater(current) : updater;
      setPath(object, path, next);
      return object;
    },
    result(object, path, fallback) {
      const value = getPath(object, path, fallback);
      return typeof value === 'function' ? value.call(object) : value;
    },
    isEqual: deepEqual,
    isMatch: (object, source) => propertyIteratee(source)(object),
    isNil: (value) => value == null,
    isNull: (value) => value === null,
    isUndefined: (value) => value === undefined,
    isArray: Array.isArray,
    isString: (value) => typeof value === 'string',
    isNumber: (value) => typeof value === 'number',
    isBoolean: (value) => typeof value === 'boolean',
    isFunction: (value) => typeof value === 'function',
    isObject: (value) => value != null && (typeof value === 'object' || typeof value === 'function'),
    isPlainObject,
    isDate: (value) => value instanceof Date,
    isInteger: Number.isInteger,
    isFinite: Number.isFinite,
    isEmpty(value) {
      if (value == null) return true;
      if (typeof value === 'string' || Array.isArray(value)) return value.length === 0;
      if (value instanceof Map || value instanceof Set) return value.size === 0;
      if (typeof value === 'object') return Object.keys(value).length === 0;
      return true;
    },
    clone: deepClone,
    cloneDeep: deepClone,
    toNumber: (value) => toNumber(value),
    toInteger: (value) => Math.trunc(toNumber(value)),
    toString: (value) => (value == null ? '' : String(value)),
    defaultTo: (value, fallback) => (value == null || Number.isNaN(value) ? fallback : value),
    clamp: (value, lower, upper) => Math.min(Math.max(toNumber(value), lower), upper),
    round: (value, precision = 0) => {
      const factor = 10 ** precision;
      return Math.round(toNumber(value) * factor) / factor;
    },
    floor: (value) => Math.floor(toNumber(value)),
    ceil: (value) => Math.ceil(toNumber(value)),
    abs: (value) => Math.abs(toNumber(value)),
    min: (list) => Math.min(...(Array.isArray(list) ? list.map((v) => toNumber(v)) : [])),
    max: (list) => Math.max(...(Array.isArray(list) ? list.map((v) => toNumber(v)) : [])),
    sum: (list) => (Array.isArray(list) ? list.reduce((n, v) => n + toNumber(v), 0) : 0),
    sumBy: (list, fn) => (Array.isArray(list) ? list.reduce((n, v) => n + toNumber(propertyIteratee(fn)(v)), 0) : 0),
    mean: (list) => (Array.isArray(list) && list.length ? list.reduce((n, v) => n + toNumber(v), 0) / list.length : 0),
    maxBy: (list, fn) => (Array.isArray(list) && list.length
      ? list.reduce((best, item) => (propertyIteratee(fn)(item) > propertyIteratee(fn)(best) ? item : best))
      : undefined),
    minBy: (list, fn) => (Array.isArray(list) && list.length
      ? list.reduce((best, item) => (propertyIteratee(fn)(item) < propertyIteratee(fn)(best) ? item : best))
      : undefined),
    random(lower = 0, upper = 1, floating = false) {
      if (typeof lower === 'boolean') return Math.random() < 0.5;
      if (Array.isArray(lower)) return lower[randomInt(0, lower.length - 1)];
      if (typeof upper === 'boolean') { floating = upper; upper = 1; }
      if (!floating && Number.isInteger(lower) && Number.isInteger(upper)) return randomInt(lower, upper);
      return lower + Math.random() * (upper - lower);
    },
    sample: (list) => (Array.isArray(list) && list.length ? list[randomInt(0, list.length - 1)] : undefined),
    sampleSize(list, count = 1) {
      if (!Array.isArray(list)) return [];
      const copy = [...list];
      const out = [];
      for (let i = 0; i < Math.min(count, copy.length); i += 1) out.push(copy.splice(randomInt(0, copy.length - 1), 1)[0]);
      return out;
    },
    shuffle: (list) => (Array.isArray(list) ? _.sampleSize(list, list.length) : []),
    times(count, fn) {
      const out = [];
      for (let i = 0; i < count; i += 1) out.push(typeof fn === 'function' ? fn(i) : fn);
      return out;
    },
    range(start, end, step = 1) {
      let from = start;
      let to = end;
      if (to === undefined) { to = from; from = 0; }
      const out = [];
      if (step === 0) return out;
      if (step > 0) for (let i = from; i < to; i += step) out.push(i);
      else for (let i = from; i > to; i += step) out.push(i);
      return out;
    },
    uniqueId: (() => { let id = 0; return (prefix = '') => { id += 1; return `${prefix}${id}`; }; })(),
    escape: escapeHtml,
    unescape: unescapeHtml,
    truncate(text, options = {}) {
      const source = String(text ?? '');
      const length = options.length ?? 30;
      const omission = options.omission ?? '...';
      return source.length > length ? `${source.slice(0, Math.max(0, length - omission.length))}${omission}` : source;
    },
    pad: (text, length, chars = ' ') => String(text ?? '').padStart(length, chars),
    padStart: (text, length, chars = ' ') => String(text ?? '').padStart(length, chars),
    padEnd: (text, length, chars = ' ') => String(text ?? '').padEnd(length, chars),
    repeat: (text, count = 1) => String(text ?? '').repeat(Math.max(0, count)),
    trim: (text, chars) => (chars ? String(text ?? '').replace(new RegExp(`^[${chars}]+|[${chars}]+$`, 'g'), '') : String(text ?? '').trim()),
    upperFirst: (text) => { const s = String(text ?? ''); return s ? s[0].toUpperCase() + s.slice(1) : s; },
    lowerFirst: (text) => { const s = String(text ?? ''); return s ? s[0].toLowerCase() + s.slice(1) : s; },
    capitalize: (text) => { const s = String(text ?? '').toLowerCase(); return s ? s[0].toUpperCase() + s.slice(1) : s; },
    camelCase: (text) => splitWords(text).map((word, index) => (index === 0 ? word.toLowerCase() : _.upperFirst(word.toLowerCase()))).join(''),
    kebabCase: (text) => splitWords(text).map((word) => word.toLowerCase()).join('-'),
    snakeCase: (text) => splitWords(text).map((word) => word.toLowerCase()).join('_'),
    startCase: (text) => splitWords(text).map((word) => _.upperFirst(word.toLowerCase())).join(' '),
    lowerCase: (text) => String(text ?? '').toLowerCase(),
    upperCase: (text) => String(text ?? '').toUpperCase(),
    words: (text) => splitWords(text),
    split: (text, separator) => String(text ?? '').split(separator),
    join: (list, separator = ',') => (Array.isArray(list) ? list.join(separator) : ''),
    includes: (collection, value) => (typeof collection === 'string' ? collection.includes(value) : Array.isArray(collection) ? collection.includes(value) : false),
    startsWith: (text, target) => String(text ?? '').startsWith(target),
    endsWith: (text, target) => String(text ?? '').endsWith(target),
    replace: (text, pattern, replacement) => String(text ?? '').replace(pattern, replacement),
    slice: (list, start, end) => (typeof list === 'string' || Array.isArray(list) ? list.slice(start, end) : []),
    head: (list) => list?.[0],
    first: (list) => list?.[0],
    last: (list) => list?.[list.length - 1],
    nth: (list, index = 0) => (index < 0 ? list?.[list.length + index] : list?.[index]),
    take: (list, count = 1) => (Array.isArray(list) ? list.slice(0, count) : []),
    drop: (list, count = 1) => (Array.isArray(list) ? list.slice(count) : []),
    compact: (list) => (Array.isArray(list) ? list.filter(Boolean) : []),
    chunk: (list, size = 1) => {
      const out = [];
      for (let i = 0; i < (list?.length ?? 0); i += size) out.push(list.slice(i, i + size));
      return out;
    },
    flatten: (list) => (Array.isArray(list) ? list.flat() : []),
    flattenDeep: (list) => (Array.isArray(list) ? list.flat(Infinity) : []),
    uniq: (list) => (Array.isArray(list) ? [...new Set(list)] : []),
    union: (...lists) => [...new Set(lists.flat())],
    difference: (list, ...others) => (Array.isArray(list) ? list.filter((item) => !others.flat().some((other) => deepEqual(item, other))) : []),
    intersection: (list, ...others) => (Array.isArray(list) ? list.filter((item) => others.every((other) => (other || []).some((entry) => deepEqual(item, entry)))) : []),
    zip: (...lists) => (lists[0] || []).map((_, index) => lists.map((list) => list?.[index])),
    fromPairs: (pairs) => Object.fromEntries(pairs || []),
    toPairs: (object) => Object.entries(object || {}),
    keys: (object) => Object.keys(object || {}),
    values: (object) => Object.values(object || {}),
    map: (collection, fn) => (Array.isArray(collection) ? collection.map(propertyIteratee(fn)) : Object.values(collection || {}).map(propertyIteratee(fn))),
    filter: (collection, fn) => (Array.isArray(collection) ? collection.filter(propertyIteratee(fn)) : Object.values(collection || {}).filter(propertyIteratee(fn))),
    reject: (collection, fn) => (Array.isArray(collection) ? collection.filter((item) => !propertyIteratee(fn)(item)) : []),
    find: (collection, fn) => (Array.isArray(collection) ? collection.find(propertyIteratee(fn)) : Object.values(collection || {}).find(propertyIteratee(fn))),
    findIndex: (collection, fn) => (Array.isArray(collection) ? collection.findIndex(propertyIteratee(fn)) : -1),
    some: (collection, fn) => (Array.isArray(collection) ? collection.some(propertyIteratee(fn)) : Object.values(collection || {}).some(propertyIteratee(fn))),
    every: (collection, fn) => (Array.isArray(collection) ? collection.every(propertyIteratee(fn)) : Object.values(collection || {}).every(propertyIteratee(fn))),
    forEach(collection, fn) {
      if (Array.isArray(collection)) collection.forEach(fn);
      else Object.entries(collection || {}).forEach(([key, value]) => fn(value, key, collection));
      return collection;
    },
    each(collection, fn) { return _.forEach(collection, fn); },
    reduce: (collection, fn, initial) => (Array.isArray(collection) ? collection.reduce(fn, initial) : Object.values(collection || {}).reduce(fn, initial)),
    groupBy(collection, fn) {
      const keyed = propertyIteratee(fn);
      const out = {};
      for (const item of Array.isArray(collection) ? collection : Object.values(collection || {})) {
        const key = keyed(item);
        (out[key] ??= []).push(item);
      }
      return out;
    },
    keyBy(collection, fn) {
      const keyed = propertyIteratee(fn);
      const out = {};
      for (const item of Array.isArray(collection) ? collection : Object.values(collection || {})) out[keyed(item)] = item;
      return out;
    },
    countBy(collection, fn) {
      const keyed = propertyIteratee(fn);
      const out = {};
      for (const item of Array.isArray(collection) ? collection : Object.values(collection || {})) {
        const key = keyed(item);
        out[key] = (out[key] ?? 0) + 1;
      }
      return out;
    },
    sortBy(collection, ...fns) {
      const keyed = fns.map(propertyIteratee);
      return [...(collection || [])].sort((a, b) => {
        for (const fn of keyed) {
          const va = fn(a);
          const vb = fn(b);
          if (va < vb) return -1;
          if (va > vb) return 1;
        }
        return 0;
      });
    },
    orderBy(collection, fns, orders) {
      const list = Array.isArray(fns) ? fns : [fns];
      const dirs = Array.isArray(orders) ? orders : [orders];
      const keyed = list.map(propertyIteratee);
      return [...(collection || [])].sort((a, b) => {
        for (let i = 0; i < keyed.length; i += 1) {
          const va = keyed[i](a);
          const vb = keyed[i](b);
          if (va === vb) continue;
          const direction = dirs[i] === 'desc' ? -1 : 1;
          return (va < vb ? -1 : 1) * direction;
        }
        return 0;
      });
    },
    mapValues(object, fn) {
      const out = {};
      for (const [key, value] of Object.entries(object || {})) out[key] = propertyIteratee(fn)(value, key);
      return out;
    },
    pick(object, ...paths) {
      const out = {};
      for (const path of paths.flat()) if (hasPath(object, path)) setPath(out, path, deepClone(getPath(object, path)));
      return out;
    },
    omit(object, ...paths) {
      const out = deepClone(object) || {};
      for (const path of paths.flat()) deletePath(out, path);
      return out;
    },
    assign: (...objects) => Object.assign({}, ...objects),
    defaults: (object, ...sources) => Object.assign({}, ...[...sources].reverse(), object),
    merge(target, ...sources) {
      const apply = (destination, source) => {
        for (const [key, value] of Object.entries(source || {})) {
          if (isPlainObject(value) && isPlainObject(destination[key])) apply(destination[key], value);
          else destination[key] = deepClone(value);
        }
        return destination;
      };
      return sources.reduce((acc, source) => apply(acc, source), target || {});
    },
    mergeWith(target, source, customizer) {
      for (const [key, value] of Object.entries(source || {})) {
        const result = customizer?.(target[key], value, key);
        target[key] = result === undefined ? deepClone(value) : result;
      }
      return target;
    },
    debounce(fn) {
      let timer = null;
      const wrapped = (...args) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; fn(...args); }, 0);
      };
      wrapped.cancel = () => { if (timer) clearTimeout(timer); timer = null; };
      wrapped.flush = () => {};
      return wrapped;
    },
    throttle(fn) {
      let last = 0;
      const wrapped = (...args) => {
        const now = Date.now();
        if (now - last >= 16) { last = now; return fn(...args); }
        return undefined;
      };
      wrapped.cancel = () => {};
      return wrapped;
    },
    once(fn) {
      let called = false;
      let result;
      return (...args) => {
        if (!called) { called = true; result = fn(...args); }
        return result;
      };
    },
    identity: (value) => value,
    noop: () => undefined,
    stubTrue: () => true,
    stubFalse: () => false,
    constant: (value) => () => value,
    chain: (value) => chainable(value),
  };
  return _;
}

const FAKE_FIRST = ['林', '苏', '顾', '沈', '陆', '叶', '白', '江', '温', '许', '黎', '程', '秦', '夏', '唐'];
const FAKE_LAST = ['清和', '雨眠', '知夏', '书言', '念', '昭', '岚', '舟', '遥', '星野', '静姝', '之遥'];
const FAKE_WORDS = ['月色', '晚风', '旧梦', '青石', '烟火', '细雨', '远方', '灯火', '长街', '故人', '山海', '浮光'];

/** 极简 faker：ST-Prompt-Template 里替一些卡生成随机内容。 */
export function createFaker(random = Math.random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const int = (min = 0, max = 100) => min + Math.floor(random() * (max - min + 1));
  const float = (options = {}) => {
    const min = options.min ?? 0;
    const max = options.max ?? 1;
    const precision = options.precision ?? 2;
    const factor = 10 ** precision;
    return Math.round((min + random() * (max - min)) * factor) / factor;
  };
  const words = (count = 3) => Array.from({ length: count }, () => pick(FAKE_WORDS));
  const sentence = () => `${words(int(3, 6)).join('')}。`;
  const paragraph = () => Array.from({ length: int(2, 4) }, () => sentence()).join('');
  const name = () => pick(FAKE_FIRST) + pick(FAKE_LAST);
  const faker = {
    name,
    firstName: () => pick(FAKE_FIRST),
    lastName: () => pick(FAKE_LAST),
    fullName: name,
    word: () => pick(FAKE_WORDS),
    words,
    sentence,
    sentences: (count = 2) => Array.from({ length: count }, () => sentence()).join(''),
    paragraph,
    paragraphs: (count = 2) => Array.from({ length: count }, () => paragraph()).join('\n\n'),
    lorem: { words, sentence, sentences: (count = 2) => Array.from({ length: count }, () => sentence()).join(''), paragraph },
    number: int,
    int,
    float,
    boolean: () => random() < 0.5,
    date: { past: () => new Date(Date.now() - int(1, 365) * 86400000), future: () => new Date(Date.now() + int(1, 365) * 86400000), recent: () => new Date(Date.now() - int(1, 24) * 3600000) },
    time: () => `${String(int(0, 23)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}`,
    uuid: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
      const value = (random() * 16) | 0;
      return (ch === 'x' ? value : (value & 0x3) | 0x8).toString(16);
    }),
    pick,
    helpers: { arrayElement: pick },
    location: { city: () => `${pick(['临安', '云梦', '青川', '白露', '望舒', '南屿'])}市`, country: () => '夏越国' },
    internet: { email: () => `${words(1)[0]}@example.com`, userName: () => `user_${int(1000, 9999)}` },
    company: { name: () => `${pick(FAKE_WORDS)}${pick(['堂', '阁', '社', '馆'])}` },
  };
  return faker;
}

/**
 * 建立 EJS 作用域。变量按引用共享，setvar 会写回 variables。
 * @param {Record<string, unknown>} variables
 * @param {{ getwi?: (name: string) => string, getchar?: (name: string) => string, resolve?: (name: string) => unknown, card?: object }} helpers
 */
export function createEjsScope(variables = {}, helpers = {}) {
  const store = variables && typeof variables === 'object' ? variables : {};

  function exact(name) {
    return own(store, name) ? store[name] : undefined;
  }

  function lookup(name) {
    const key = String(name ?? '');
    const direct = exact(key);
    if (direct !== undefined) return direct;
    if (hasPath(store, key)) return getPath(store, key);
    const stat = store.stat_data;
    if (stat && typeof stat === 'object') {
      if (hasPath(stat, key)) return getPath(stat, key);
      if (key.startsWith('stat_data.')) {
        const inner = key.slice('stat_data.'.length);
        if (hasPath(stat, inner)) return getPath(stat, inner);
      }
    }
    return undefined;
  }

  function write(name, value) {
    const key = String(name ?? '');
    if (!key) return value;
    if (key.includes('.') && !own(store, key)) {
      const root = key.split('.')[0];
      if (store[root] != null && typeof store[root] === 'object') {
        setPath(store, key, value);
        return value;
      }
    }
    store[key] = value;
    return value;
  }

  function readState() {
    const stat = store.stat_data && typeof store.stat_data === 'object' ? store.stat_data : {};
    return { ...store, ...stat, stat_data: stat };
  }

  const lodash = createLodash();
  const faker = createFaker();

  const scope = {
    getvar(name, options = {}) {
      const value = lookup(name);
      if (value !== undefined) return value;
      if (helpers.resolve) {
        const resolved = helpers.resolve(String(name ?? ''));
        if (resolved !== undefined) return resolved;
      }
      if (options && Object.prototype.hasOwnProperty.call(options, 'defaults')) return options.defaults;
      return undefined;
    },
    setvar(name, value) { return write(name, value); },
    incvar(name, delta = 1) {
      const next = toNumber(lookup(name), 0) + toNumber(delta, 0);
      write(name, next);
      return next;
    },
    decvar(name, delta = 1) { return scope.incvar(name, -toNumber(delta, 0)); },
    delvar(name) {
      const key = String(name ?? '');
      if (own(store, key)) { delete store[key]; return ''; }
      deletePath(store, key);
      return '';
    },
    getwi(name) {
      return helpers.getwi ? helpers.getwi(String(name ?? '')) : '';
    },
    getchar(name) {
      return helpers.getchar ? helpers.getchar(String(name ?? '')) : '';
    },
    print(...args) { return args.map((value) => (value == null ? '' : String(value))).join(''); },
    readState,
    variables: store,
    _: lodash,
    lodash,
    faker,
  };
  // 世界书 @@if 装饰器直接引用 stat_data / v；用 getter 暴露同一份变量。
  Object.defineProperty(scope, 'stat_data', {
    get() { return store.stat_data && typeof store.stat_data === 'object' ? store.stat_data : {}; },
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(scope, 'v', {
    get() { return store; },
    enumerable: true,
    configurable: true,
  });
  return scope;
}

const TEMPLATE_CACHE = new Map();
const TEMPLATE_CACHE_LIMIT = 400;

function stripTags(source) {
  return String(source ?? '').replace(/<%[\s\S]*?%>/g, '').replace(/<%[\s\S]*$/, '');
}

/**
 * 把模板编译成函数。返回 `null` 表示模板里没有 EJS 标记。
 * @param {string} source
 */
function compileTemplate(source) {
  if (TEMPLATE_CACHE.has(source)) return TEMPLATE_CACHE.get(source);

  const segments = [];
  let index = 0;
  let pendingTrimNext = false;

  const pushText = (text, slurpBefore = false) => {
    if (!text) return;
    let value = text;
    if (slurpBefore) value = value.replace(/[ \t]*$/, '');
    if (pendingTrimNext) {
      value = value.replace(/^[ \t]*\r?\n/, '');
      pendingTrimNext = false;
    }
    if (!value) return;
    segments.push({ type: 'text', value });
  };

  while (index < source.length) {
    const open = source.indexOf(TAG_OPEN, index);
    if (open < 0) {
      pushText(source.slice(index));
      break;
    }
    let cursor = open + 2;
    pushText(source.slice(index, open));

    // <%% 输出字面量 <%
    if (source[cursor] === '%') {
      pushText('<%');
      index = cursor + 1;
      continue;
    }

    let kind = '';
    let slurpBefore = false;
    if (source[cursor] === '_') { slurpBefore = true; cursor += 1; }
    else if (source[cursor] === '=' || source[cursor] === '-' || source[cursor] === '#') {
      kind = source[cursor];
      cursor += 1;
    }

    const close = source.indexOf('%>', cursor);
    if (close < 0) {
      // 未闭合：原样保留剩余文本（EJS 的行为是报错；这里选择不丢内容）
      if (slurpBefore) {
        const last = segments[segments.length - 1];
        if (last?.type === 'text') last.value = last.value.replace(/[ \t]*$/, '');
      }
      segments.push({ type: 'text', value: source.slice(open) });
      index = source.length;
      break;
    }

    let code = source.slice(cursor, close);
    index = close + 2;
    if (code.endsWith('-') || code.endsWith('_')) {
      code = code.slice(0, -1);
      pendingTrimNext = true;
    }
    if (slurpBefore) {
      const last = segments[segments.length - 1];
      if (last?.type === 'text') last.value = last.value.replace(/[ \t]*$/, '');
    }

    if (kind === '#') continue;
    if (kind === '=' || kind === '-') {
      segments.push({ type: kind === '=' ? 'escaped' : 'raw', code });
    } else {
      segments.push({ type: 'code', code });
    }
  }

  if (pendingTrimNext) {
    // 行尾的 trim 标记后面没有内容，什么也不用做
  }

  if (!segments.some((segment) => segment.type !== 'text')) {
    TEMPLATE_CACHE.set(source, null);
    return null;
  }

  const body = [];
  for (const segment of segments) {
    if (segment.type === 'text') {
      if (segment.value) body.push(`__out += ${JSON.stringify(segment.value)};`);
    } else if (segment.type === 'escaped') {
      body.push(`__out += __esc((${segment.code}));`);
    } else if (segment.type === 'raw') {
      body.push(`__out += __raw((${segment.code}));`);
    } else {
      body.push(segment.code);
    }
  }

  const program = `
    var __out = '';
    with (__scope) {
      ${body.join('\n')}
    }
    return __out;
  `;

  let fn;
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function('__scope', '__esc', '__raw', program);
  } catch {
    fn = null;
  }
  if (TEMPLATE_CACHE.size >= TEMPLATE_CACHE_LIMIT) TEMPLATE_CACHE.clear();
  TEMPLATE_CACHE.set(source, fn);
  return fn;
}

/**
 * 渲染一段 EJS 模板。出错时返回去掉标签的原文 + 一行注释，绝不让整轮请求失败。
 * @param {string} template
 * @param {Record<string, unknown>} scope
 * @param {{ keepOnError?: boolean }} [options]
 * @returns {string}
 */
export function renderEjs(template, scope = {}, options = {}) {
  const source = String(template ?? '');
  if (!source || !source.includes(TAG_OPEN)) return source;

  const fn = compileTemplate(source);
  if (!fn) return source;

  try {
    return fn(scope, (value) => escapeHtml(value), (value) => (value == null ? '' : String(value)));
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    const fallback = options.keepOnError ? source : stripTags(source);
    return `${fallback}\n<!-- dsh-tt EJS error: ${message.replace(/-->/g, '--&gt;')} -->`;
  }
}
