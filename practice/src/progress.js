import { isPracticeable } from "./letterLibrary.js";

export const PROGRESS_KEY = "zhijian.practiceRecords.v1";
export const PROGRESS_SCHEMA = 1;
export const PROGRESS_MODES = Object.freeze(["learn", "test"]);
export const MAX_PROGRESS_ENTRIES = 64;

export function emptyProgress() {
  return { schemaVersion: PROGRESS_SCHEMA, entries: [] };
}

function knownIds(letters) {
  return new Set((letters || []).map((letter) => letter?.id).filter(Boolean));
}

function canonicalIso(at) {
  try {
    let ms;
    if (typeof at === "string") ms = Date.parse(at);
    else if (Number.isFinite(at)) ms = at;
    else return "";
    if (!Number.isFinite(ms)) return "";
    const date = new Date(ms);
    if (!Number.isFinite(date.getTime())) return "";
    const iso = date.toISOString();
    if (typeof at === "string" && iso !== at) return "";
    return iso;
  } catch {
    return "";
  }
}

function cleanEntry(raw, ids) {
  if (!raw || typeof raw !== "object") return null;
  const letterId = typeof raw.letterId === "string" ? raw.letterId : "";
  const mode = raw.mode;
  const count = raw.count;
  const lastAt = raw.lastAt;
  if (!ids.has(letterId)) return null;
  if (mode !== "learn" && mode !== "test") return null;
  if (!Number.isInteger(count) || count < 1 || count > 1e9) return null;
  if (typeof lastAt !== "string" || canonicalIso(lastAt) !== lastAt) return null;
  return { letterId, mode, count, lastAt };
}

export function parseProgress(raw, letters = []) {
  const empty = emptyProgress();
  try {
    if (raw == null || raw === "") return empty;
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!data || typeof data !== "object" || Array.isArray(data)) return empty;
    if (data.schemaVersion !== PROGRESS_SCHEMA) return empty;
    if (!Array.isArray(data.entries)) return empty;
    const ids = knownIds(letters);
    const seen = new Set();
    const entries = [];
    for (const item of data.entries) {
      const clean = cleanEntry(item, ids);
      if (!clean) continue;
      const key = `${clean.letterId}\0${clean.mode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(clean);
      if (entries.length >= MAX_PROGRESS_ENTRIES) break;
    }
    return { schemaVersion: PROGRESS_SCHEMA, entries };
  } catch {
    return empty;
  }
}

export function readStorage(storageRef) {
  try {
    const storage = storageRef === undefined ? globalThis.localStorage : storageRef;
    if (!storage) return null;
    void storage.length;
    return storage;
  } catch {
    return null;
  }
}

export function loadProgress(storage, letters) {
  try {
    if (!storage) return { progress: emptyProgress(), persisted: false };
    const raw = storage.getItem(PROGRESS_KEY);
    return { progress: parseProgress(raw, letters), persisted: true };
  } catch {
    return { progress: emptyProgress(), persisted: false };
  }
}

export function saveProgress(storage, progress) {
  try {
    if (!storage) return { persisted: false };
    const entries = Array.isArray(progress?.entries) ? progress.entries.slice(0, MAX_PROGRESS_ENTRIES) : [];
    storage.setItem(PROGRESS_KEY, JSON.stringify({ schemaVersion: PROGRESS_SCHEMA, entries }));
    return { persisted: true };
  } catch {
    return { persisted: false };
  }
}

export function clearProgressKey(storage) {
  try {
    if (!storage) return { ok: false };
    storage.removeItem(PROGRESS_KEY);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export function recordPass(progress, { letterId, mode, at, letters } = {}) {
  const current = progress && typeof progress === "object" ? progress : emptyProgress();
  const letter = (letters || []).find((item) => item.id === letterId);
  if (!isPracticeable(letter)) return current;
  if (mode !== "learn" && mode !== "test") return current;
  const lastAt = canonicalIso(at);
  if (!lastAt) return current;
  const entries = Array.isArray(current.entries) ? current.entries.map((row) => ({ ...row })) : [];
  const index = entries.findIndex((row) => row.letterId === letterId && row.mode === mode);
  if (index >= 0) {
    const count = entries[index].count + 1;
    if (!Number.isInteger(count) || count > 1e9) return current;
    entries[index] = { letterId, mode, count, lastAt };
  } else {
    if (entries.length >= MAX_PROGRESS_ENTRIES) return current;
    entries.push({ letterId, mode, count: 1, lastAt });
  }
  return { schemaVersion: PROGRESS_SCHEMA, entries };
}

export function visibleEntries(progress, letters) {
  return (progress?.entries || []).filter((row) => {
    const letter = (letters || []).find((item) => item.id === row.letterId);
    return isPracticeable(letter);
  });
}
