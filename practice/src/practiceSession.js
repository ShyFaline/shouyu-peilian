import { isPracticeable, isStaticOnlyLetter } from "./letterLibrary.js";

const QUALITY_HINT = "暂时无法判断";

export const MODE_LEARN = "learn";
export const MODE_TEST = "test";

export function parsePracticeMode(search) {
  try {
    const raw = String(search ?? "");
    const query = raw.startsWith("?") ? raw.slice(1) : raw;
    return new URLSearchParams(query).get("mode") === MODE_TEST ? MODE_TEST : MODE_LEARN;
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

export function testScopeText(letter) {
  if (isStaticOnlyLetter(letter)) {
    return "只核静态手型，规范里的轨迹不在本题。";
  }
  return "只核静态手型。";
}

export function presentTestJudge(judged) {
  const decision = judged?.decision;
  const issues = judged?.issues || [];
  if (decision === "undetermined") {
    const reason = judged?.quality?.reason || "";
    const hint = reason === "hand_count" ? "请只放一只手，并让光线亮一些。" : QUALITY_HINT;
    return { title: "暂时无法判断", hint, state: "idle" };
  }
  if (decision === "blocked") {
    return { title: "本题不能自测", hint: "请换一个已开放的静态字母。", state: "idle" };
  }
  if (decision === "pass") {
    return { title: "这题静态手型对了", hint: "只核静态部分。", state: "ok" };
  }
  if (issues.some((item) => item.code === "hold.pending")) {
    return { title: "姿态接近，停稳", hint: "手型已经接近，保持这个姿势。", state: "idle" };
  }
  return { title: "再试一次", hint: "调整手型后再保持。", state: "bad" };
}

export function canRecordPass({ judged, letter, mode, attempt } = {}) {
  if (!judged || judged.decision !== "pass") return false;
  if (!judged.quality?.ok) return false;
  if (!isPracticeable(letter)) return false;
  if (judged.practiceStatus !== letter.practiceStatus) return false;
  if (mode !== MODE_LEARN && mode !== MODE_TEST) return false;
  if (!attempt || attempt.recorded) return false;
  if (attempt.mode !== mode || attempt.letterId !== letter.id) return false;
  const frames = judged.hold?.frames;
  const need = judged.hold?.passFrames;
  if (!Number.isInteger(need) || need < 1) return false;
  if (!Number.isInteger(frames) || frames < need) return false;
  return true;
}

export { isPracticeable };
