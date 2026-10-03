/** 闯关模式：顺序逐字母推进。只读取 practiceStatus，不升格、不改判定。 */

import { isPracticeable } from "./letterLibrary.js";

export const QUEST_KEY = "zhijian.questProgress.v1";
export const QUEST_SCHEMA = 2;

/** 关卡规则（全关统一）：倒数时示范放 5 秒后隐藏，限时挑战；每关有 1 次再看示范的机会。 */
export const LEVEL_RULE = { demo: "flash", timeLimitMs: 15000, flashMs: 5000, hintFlashMs: 2000 };

export function emptyQuest() {
  return { schemaVersion: QUEST_SCHEMA, passed: [], stars: {}, bestMs: {} };
}

export function questSequence(letters = []) {
  return (Array.isArray(letters) ? letters : []).filter(isPracticeable);
}

/** 关卡（0 基下标）的挑战规则，全关统一。 */
export function levelConfig(index) {
  if (!Number.isInteger(index) || index < 0) return null;
  return { ...LEVEL_RULE };
}

/** 过关星级：剩余越多越高；用过提示最高 2 星。 */
export function starRating(remainingMs, timeLimitMs, usedHint) {
  if (!Number.isFinite(remainingMs) || !Number.isFinite(timeLimitMs) || timeLimitMs <= 0) return 1;
  const ratio = Math.max(0, remainingMs) / timeLimitMs;
  if (ratio >= 0.5 && !usedHint) return 3;
  if (ratio >= 0.2) return 2;
  return 1;
}

function sanitizeMap(raw, passedSet, pick) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, value] of Object.entries(raw)) {
    if (!passedSet.has(id)) continue;
    const clean = pick(value);
    if (clean != null) out[id] = clean;
  }
  return out;
}

const pickStars = (v) => (Number.isInteger(v) && v >= 1 && v <= 3 ? v : null);
const pickBestMs = (v) => (Number.isFinite(v) && v > 0 ? v : null);

/** 解锁下标 = 序列中第一个未通过的字母；全部通过时回退到末位（0 基，空序列给 0）。 */
function firstUnpassedIndex(sequence, passedSet) {
  const index = sequence.findIndex((letter) => !passedSet.has(letter.id));
  return index >= 0 ? index : Math.max(0, sequence.length - 1);
}

export function parseQuest(raw, letters) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return emptyQuest();
  }
  if (!data || (data.schemaVersion !== 1 && data.schemaVersion !== QUEST_SCHEMA) || !Array.isArray(data.passed)) {
    return emptyQuest();
  }
  const sequence = questSequence(letters);
  const valid = new Set(sequence.map((letter) => letter.id));
  const passed = [];
  const seen = new Set();
  for (const id of data.passed) {
    if (typeof id !== "string" || !valid.has(id) || seen.has(id)) continue;
    seen.add(id);
    passed.push(id);
  }
  const passedSet = new Set(passed);
  return {
    schemaVersion: QUEST_SCHEMA,
    passed,
    stars: sanitizeMap(data.stars, passedSet, pickStars),
    bestMs: sanitizeMap(data.bestMs, passedSet, pickBestMs),
  };
}

/** 记一次过关结果：首过记通过，重玩只升级星级、压缩最好用时。 */
export function recordQuestResult(quest, letterId, result, letters) {
  if (!quest || !Array.isArray(quest.passed)) return false;
  const sequence = questSequence(letters);
  const index = sequence.findIndex((letter) => letter.id === letterId);
  if (index < 0) return false;
  const passedSet = new Set(quest.passed);
  const alreadyPassed = passedSet.has(letterId);
  const unlockedIndex = firstUnpassedIndex(sequence, passedSet);
  if (!alreadyPassed && index !== unlockedIndex) return false;
  if (!alreadyPassed) quest.passed.push(letterId);
  if (!quest.stars || typeof quest.stars !== "object") quest.stars = {};
  if (!quest.bestMs || typeof quest.bestMs !== "object") quest.bestMs = {};
  const stars = pickStars(result?.stars) ?? 1;
  quest.stars[letterId] = Math.max(quest.stars[letterId] ?? 0, stars);
  const elapsedMs = result?.elapsedMs;
  if (Number.isFinite(elapsedMs) && elapsedMs > 0) {
    const best = quest.bestMs[letterId];
    quest.bestMs[letterId] = Number.isFinite(best) && best > 0 ? Math.min(best, elapsedMs) : elapsedMs;
  }
  return true;
}

export function questStatus(quest, letters) {
  const sequence = questSequence(letters);
  const passedSet = new Set(quest?.passed || []);
  const passedCount = sequence.filter((letter) => passedSet.has(letter.id)).length;
  const total = sequence.length;
  const unlockedIndex = firstUnpassedIndex(sequence, passedSet);
  const current = sequence[unlockedIndex] || null;
  return { sequence, passedSet, passedCount, total, unlockedIndex, current, complete: total > 0 && passedCount >= total };
}

export function isQuestUnlocked(quest, letterId, letters) {
  const { sequence, unlockedIndex } = questStatus(quest, letters);
  const index = sequence.findIndex((letter) => letter.id === letterId);
  return index >= 0 && index <= unlockedIndex;
}

export function markQuestPassed(quest, letterId, letters) {
  if (!quest || !Array.isArray(quest.passed)) return false;
  const status = questStatus(quest, letters);
  if (status.complete) return false;
  if (!status.current || status.current.id !== letterId) return false;
  quest.passed.push(letterId);
  return true;
}

export function loadQuest(storage, letters) {
  if (!storage) return emptyQuest();
  try {
    const raw = storage.getItem(QUEST_KEY);
    if (!raw) return emptyQuest();
    return parseQuest(raw, letters);
  } catch {
    return emptyQuest();
  }
}

export function saveQuest(storage, quest) {
  if (!storage) return false;
  try {
    storage.setItem(
      QUEST_KEY,
      JSON.stringify({
        schemaVersion: QUEST_SCHEMA,
        passed: quest.passed,
        stars: quest.stars && typeof quest.stars === "object" ? quest.stars : {},
        bestMs: quest.bestMs && typeof quest.bestMs === "object" ? quest.bestMs : {},
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearQuestKey(storage) {
  try {
    if (!storage) return { ok: false };
    storage.removeItem(QUEST_KEY);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
