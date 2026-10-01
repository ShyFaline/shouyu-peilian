import { isPracticeable } from "./letterLibrary.js";

const QUALITY_HINT = "暂时无法判断";

export const MODE_LEARN = "learn";
export const MODE_TEST = "test";
export const MODE_QUEST = "quest";

export function parsePracticeMode(search) {
  try {
    const raw = String(search ?? "");
    const query = raw.startsWith("?") ? raw.slice(1) : raw;
    const mode = new URLSearchParams(query).get("mode");
    if (mode === MODE_TEST) return MODE_TEST;
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

export function testScopeText(letter) {
  if (letter?.rules?.motion) {
    return "手型与动作都核。";
  }
  return "只核静态手型。";
}

export function presentTestJudge(judged) {
  const decision = judged?.decision;
  const issues = judged?.issues || [];
  const blob = issues.map((item) => item.hint).filter(Boolean).join("；");
  if (decision === "undetermined") {
    const reason = judged?.quality?.reason || "";
    const hint = reason === "hand_count" ? "请只放一只手，并让光线亮一些。" : QUALITY_HINT;
    return { title: "暂时无法判断", hint, state: "idle" };
  }
  if (decision === "blocked") {
    return { title: "本题不能自测", hint: "请换一个已开放的字母。", state: "idle" };
  }
  if (decision === "pass") {
    if (judged?.motion) {
      return { title: "这题做对了", hint: "手型与动作都完成。", state: "ok" };
    }
    return { title: "这题静态手型对了", hint: "只核静态部分。", state: "ok" };
  }
  if (issues.some((item) => item.code === "hold.pending")) {
    return { title: "姿态接近，停稳", hint: "手型已经接近，保持这个姿势。", state: "idle" };
  }
  if (issues.some((item) => item.code === "motion.pending")) {
    return { title: "手型对了，做动作", hint: blob || "保持手型，开始做动作。", state: "idle" };
  }
  if (issues.some((item) => item.code === "motion.timeout")) {
    return { title: "动作没做完，再来一次", hint: blob || "把手型停稳后重新做动作。", state: "bad" };
  }
  return { title: "再试一次", hint: "调整手型后再保持。", state: "bad" };
}

export function canRecordPass({ judged, letter, mode, attempt } = {}) {
  if (!judged || judged.decision !== "pass") return false;
  if (!judged.quality?.ok) return false;
  if (!isPracticeable(letter)) return false;
  if (judged.practiceStatus !== letter.practiceStatus) return false;
  if (mode !== MODE_LEARN && mode !== MODE_TEST && mode !== MODE_QUEST) return false;
  if (!attempt || attempt.recorded) return false;
  if (attempt.mode !== mode || attempt.letterId !== letter.id) return false;
  const elapsedMs = judged.hold?.elapsedMs;
  const need = judged.hold?.passMs;
  if (!Number.isFinite(need) || !(need > 0)) return false;
  if (!Number.isFinite(elapsedMs) || elapsedMs < need) return false;
  return true;
}

export { isPracticeable };
