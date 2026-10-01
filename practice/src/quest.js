/** 闯关模式：顺序逐字母推进。只读取 practiceStatus，不升格、不改判定。 */

import { isPracticeable } from "./letterLibrary.js";

export const QUEST_KEY = "zhijian.questProgress.v1";
export const QUEST_SCHEMA = 1;

export function emptyQuest() {
  return { schemaVersion: QUEST_SCHEMA, passed: [] };
}

/** 按 letters.json 原顺序取可跟练字母，这就是关卡顺序。 */
export function questSequence(letters = []) {
  return (letters || []).filter(isPracticeable);
}

export function parseQuest(raw, letters) {
  const sequence = questSequence(letters);
  const known = new Set(sequence.map((letter) => letter.id));
  const quest = emptyQuest();
  if (typeof raw !== "string" || !raw.trim()) return quest;
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    return quest;
  }
  if (!data || data.schemaVersion !== QUEST_SCHEMA || !Array.isArray(data.passed)) return quest;
  const seen = new Set();
  for (const id of data.passed) {
    if (typeof id !== "string" || !known.has(id) || seen.has(id)) continue;
    seen.add(id);
    quest.passed.push(id);
    if (quest.passed.length >= sequence.length) break;
  }
  return quest;
}

export function loadQuest(storage, letters) {
  try {
    return parseQuest(storage?.getItem?.(QUEST_KEY), letters);
  } catch {
    return emptyQuest();
  }
}

export function saveQuest(storage, quest) {
  try {
    storage?.setItem?.(
      QUEST_KEY,
      JSON.stringify({ schemaVersion: QUEST_SCHEMA, passed: quest.passed }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * 关卡状态：unlockedIndex 是"当前关"在 sequence 里的下标；
 * 前面的关全部通过才解锁后面。全部通过时 unlockedIndex === total 且 complete。
 */
export function questStatus(quest, letters) {
  const sequence = questSequence(letters);
  const passedSet = new Set(quest.passed);
  let unlockedIndex = 0;
  while (unlockedIndex < sequence.length && passedSet.has(sequence[unlockedIndex].id)) {
    unlockedIndex += 1;
  }
  return {
    sequence,
    passedSet,
    total: sequence.length,
    passedCount: passedSet.size,
    unlockedIndex,
    complete: sequence.length > 0 && unlockedIndex >= sequence.length,
    current: unlockedIndex < sequence.length ? sequence[unlockedIndex] : null,
  };
}

export function isQuestUnlocked(quest, letterId, letters) {
  const status = questStatus(quest, letters);
  const index = status.sequence.findIndex((letter) => letter.id === letterId);
  return index >= 0 && index <= status.unlockedIndex;
}

/** 记通过。只有当前关（或已通过的关）能通过；返回是否产生了新的进度。 */
export function markQuestPassed(quest, letterId, letters) {
  const status = questStatus(quest, letters);
  if (status.complete || !status.current || status.current.id !== letterId) return false;
  if (status.passedSet.has(letterId)) return false;
  quest.passed.push(letterId);
  return true;
}
