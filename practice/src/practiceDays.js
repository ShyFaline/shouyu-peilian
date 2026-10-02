/** 活跃日记录：支撑成就单的"连续打卡"。只记本地日期字符串，不涉及时刻。 */

export const DAYS_KEY = "zhijian.practiceDays.v1";
export const DAYS_SCHEMA = 1;
export const MAX_DAYS_ENTRIES = 400;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function emptyDays() {
  return { schemaVersion: DAYS_SCHEMA, days: [] };
}

export function localDayKey(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** 本地日历日加减，返回 YYYY-MM-DD；非法输入给空串。 */
export function shiftDay(day, delta) {
  if (typeof day !== "string" || !DAY_PATTERN.test(day) || !Number.isInteger(delta)) return "";
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d + delta);
  if (!Number.isFinite(date.getTime())) return "";
  return localDayKey(date);
}

export function parseDays(raw) {
  const empty = emptyDays();
  try {
    if (raw == null || raw === "") return empty;
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!data || typeof data !== "object" || Array.isArray(data)) return empty;
    if (data.schemaVersion !== DAYS_SCHEMA) return empty;
    if (!Array.isArray(data.days)) return empty;
    const seen = new Set();
    const days = [];
    for (const item of data.days) {
      if (typeof item !== "string" || !DAY_PATTERN.test(item) || seen.has(item)) continue;
      seen.add(item);
      days.push(item);
      if (days.length >= MAX_DAYS_ENTRIES) break;
    }
    days.sort();
    return { schemaVersion: DAYS_SCHEMA, days };
  } catch {
    return empty;
  }
}

export function loadDays(storage) {
  try {
    return parseDays(storage?.getItem?.(DAYS_KEY));
  } catch {
    return emptyDays();
  }
}

export function saveDays(storage, daysState) {
  try {
    if (!storage) return { persisted: false };
    const days = Array.isArray(daysState?.days) ? daysState.days.slice(-MAX_DAYS_ENTRIES) : [];
    storage.setItem(DAYS_KEY, JSON.stringify({ schemaVersion: DAYS_SCHEMA, days }));
    return { persisted: true };
  } catch {
    return { persisted: false };
  }
}

export function clearDaysKey(storage) {
  try {
    if (!storage) return { ok: false };
    storage.removeItem(DAYS_KEY);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** 记录一天活跃；已记过则原样返回。day 非法时原样返回。 */
export function markActiveDay(daysState, day) {
  const current = daysState && typeof daysState === "object" ? daysState : emptyDays();
  if (typeof day !== "string" || !DAY_PATTERN.test(day)) return current;
  const days = Array.isArray(current.days) ? current.days.slice() : [];
  if (days.includes(day)) return current;
  days.push(day);
  days.sort();
  while (days.length > MAX_DAYS_ENTRIES) days.shift();
  return { schemaVersion: DAYS_SCHEMA, days };
}

/** 连续活跃天数：今天已活跃从今天往回数；否则从昨天往回数（今天还没练不算断）。 */
export function dayStreak(days, today) {
  const set = new Set(Array.isArray(days) ? days : []);
  let cursor = typeof today === "string" && DAY_PATTERN.test(today) ? today : localDayKey();
  if (!set.has(cursor)) cursor = shiftDay(cursor, -1);
  let streak = 0;
  while (cursor && set.has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}
