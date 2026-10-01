import { isPracticeable } from "./letterLibrary.js";

export const MODE_LEARN = "learn";
export const MODE_QUEST = "quest";

export function parsePracticeMode(search) {
  try {
    const raw = String(search ?? "");
    const query = raw.startsWith("?") ? raw.slice(1) : raw;
    const mode = new URLSearchParams(query).get("mode");
    if (mode === MODE_QUEST) return MODE_QUEST;
    return MODE_LEARN;
  } catch {
    return MODE_LEARN;
  }
}

export function isRecordsHash(hash) {
  try {
    const value = String(hash ?? "");
    return value === "#records" || value === "records";
  } catch {
    return false;
  }
}

export function startAttempt(mode, letterId) {
  return { mode: mode || null, letterId: letterId || null, recorded: false };
}

export function isSameAttempt(attempt, mode, letterId) {
  return Boolean(attempt && attempt.mode === mode && attempt.letterId === letterId);
}

export function canRecordPass({ judged, letter, mode, attempt } = {}) {
  if (!judged || judged.decision !== "pass") return false;
  if (!judged.quality?.ok) return false;
  if (!isPracticeable(letter)) return false;
  if (judged.practiceStatus !== letter.practiceStatus) return false;
  if (mode !== MODE_LEARN && mode !== MODE_QUEST) return false;
  if (!attempt || attempt.recorded) return false;
  if (attempt.mode !== mode || attempt.letterId !== letter.id) return false;
  const elapsedMs = judged.hold?.elapsedMs;
  const need = judged.hold?.passMs;
  if (!Number.isFinite(need) || !(need > 0)) return false;
  if (!Number.isFinite(elapsedMs) || elapsedMs < need) return false;
  return true;
}

export { isPracticeable };
