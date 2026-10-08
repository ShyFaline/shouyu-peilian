/** 练习范围（26 / 32）。只负责范围定义、URL 与本机存储读写、字母过滤；不改判定、不改内容核定状态。 */

export const SCOPE_BASIC = "basic";
export const SCOPE_FULL = "full";

export const SCOPE_STORAGE_KEY = "zhijian.letterScope.v1";

export const SCOPE_META = {
  [SCOPE_BASIC]: {
    id: SCOPE_BASIC,
    name: "基础 26 字母",
    desc: "A–Z 拉丁字母手型",
    note: "当前范围：基础 26 字母（A–Z）。",
  },
  [SCOPE_FULL]: {
    id: SCOPE_FULL,
    name: "完整 32 项",
    desc: "26 字母 + zh / ch / sh / ng / ê / ü",
    note: "当前范围：完整 32 项（26 字母 + zh / ch / sh / ng / ê / ü）。",
  },
};

export const SCOPE_ORDER = Object.freeze([SCOPE_BASIC, SCOPE_FULL]);

/** 基础范围 = 单个拉丁字母 A–Z；zh/ch/sh/ng/ê/ü 属完整范围。 */
export function isBasicLetter(letter) {
  return /^GF0021\.[A-Z]$/.test(letter?.id || "");
}

export function isValidScope(scope) {
  return scope === SCOPE_BASIC || scope === SCOPE_FULL;
}

export function normalizeScope(scope, fallback = SCOPE_FULL) {
  return isValidScope(scope) ? scope : fallback;
}

export function filterByScope(letters = [], scope = SCOPE_FULL) {
  if (scope === SCOPE_BASIC) return letters.filter(isBasicLetter);
  return letters.slice();
}

export function parseScope(search) {
  try {
    const raw = String(search ?? "");
    const query = raw.startsWith("?") ? raw.slice(1) : raw;
    const value = new URLSearchParams(query).get("scope");
    return isValidScope(value) ? value : null;
  } catch {
    return null;
  }
}

export function readStoredScope(storage) {
  try {
    if (!storage) return null;
    const value = storage.getItem(SCOPE_STORAGE_KEY);
    return isValidScope(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredScope(storage, scope) {
  try {
    if (!storage || !isValidScope(scope)) return false;
    storage.setItem(SCOPE_STORAGE_KEY, scope);
    return true;
  } catch {
    return false;
  }
}

/** 决定当前范围：URL 参数优先，其次本机存储，最后默认完整 32 项。 */
export function resolveScope({ search, storage } = {}) {
  return parseScope(search) || readStoredScope(storage) || SCOPE_FULL;
}

/** 把范围写进查询串，保留既有参数（如 mode=test）。 */
export function scopeSearch(search, scope) {
  try {
    const raw = String(search ?? "");
    const query = raw.startsWith("?") ? raw.slice(1) : raw;
    const params = new URLSearchParams(query);
    params.set("scope", normalizeScope(scope));
    return `?${params.toString()}`;
  } catch {
    return `?scope=${normalizeScope(scope)}`;
  }
}
