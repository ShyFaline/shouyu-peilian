/** 闯关模式：顺序逐字母推进。只读取 practiceStatus，不升格、不改判定。 */

import { isPracticeable } from "./letterLibrary.js";

export const QUEST_KEY = "zhijian.questProgress.v1";
export const QUEST_SCHEMA = 2;

/** 段位表：第 1..upto 关（1 基）共用一段规则；超出最后一段的关沿用末段。 */
export const SEGMENTS = [
  { name: "跟练段", upto: 3, demo: "always", timeLimitMs: 20000, flashMs: 0, hintFlashMs: 0 },
  { name: "记忆段", upto: 6, demo: "flash", timeLimitMs: 15000, flashMs: 3000, hintFlashMs: 2000 },
  { name: "盲考段", upto: 9, demo: "hidden", timeLimitMs: 12000, flashMs: 0, hintFlashMs: 0 },
];

export function emptyQuest() {
  return { schemaVersion: QUEST_SCHEMA, passed: [], stars: {}, bestMs: {} };
}

export function questSequence(letters = []) {
  return (Array.isArray(letters) ? letters : []).filter(isPracticeable);
}

/** 关卡（0 基下标）的段位规则。 */
export function levelConfig(index) {
  if (!Number.isInteger(index) || index < 0) return null;
  const level = index + 1;
  const segment = SEGMENTS.find((s) => level <= s.upto) || SEGMENTS[SEGMENTS.length - 1];
  return { ...segment };
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
  const unlockedIndex = quest.passed.length;
  const alreadyPassed = quest.passed.includes(letterId);
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
  const unlockedIndex = Math.min(passedCount, Math.max(0, total - 1));
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
