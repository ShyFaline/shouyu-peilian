/** 只编排。禁止再写 curl/spread。practiceStatus 只来自 letters.json，运行时不准升格。 */

import { evaluate } from "./evaluate.js";
import { QUALITY_HINT, assessInputQuality } from "./inputQuality.js";
import {
  createHold,
  holdReady,
  holdView,
  observePass,
  resetHold,
} from "./passState.js";

export const PRACTICE_STATUSES = [
  "pending_review",
  "demo_only",
  "pose_practice",
  "accepted_practice",
];

function statusOf(letter) {
  const s = letter?.practiceStatus;
  if (PRACTICE_STATUSES.includes(s)) return s;
  return "pending_review";
}

function result({ decision, practiceStatus, issues, quality, hold }) {
  return {
    decision,
    practiceStatus,
    issues,
    quality: { ok: Boolean(quality?.ok), reason: quality?.reason || "" },
    hold: holdView(hold),
  };
}

export function presentJudge(judged) {
  const issues = judged?.issues || [];
  const blob = issues.map((x) => x.hint).filter(Boolean).join("；");
  if (judged?.decision === "undetermined") {
    return { title: "暂时无法判断", hint: QUALITY_HINT, state: "idle" };
  }
  if (judged?.decision === "blocked") {
    if (judged.practiceStatus === "demo_only") {
      return { title: "仅示范", hint: blob || "仅示范，不作为过关依据。", state: "idle" };
    }
    if (judged.practiceStatus === "pending_review") {
      return { title: "暂不判定", hint: blob || "内容未核定，暂不判定。", state: "idle" };
    }
    return { title: "暂不判定", hint: blob || "现在不能判定。", state: "idle" };
  }
  if (judged?.decision === "pass") {
    return { title: "姿态接近，停稳", hint: "手型接近了，先停稳。", state: "ok" };
  }
  if (issues.some((x) => x.code === "hold.pending")) {
    return { title: "姿态接近，停稳", hint: blob || "手指已经对上，保持这个姿势。", state: "idle" };
  }
  return {
    title: "对照左边改动作",
    hint: blob || "对照左边改动作。",
    state: "bad",
  };
}

/**
 * @param {{
 *   letter?: object | null,
 *   lm?: Array | null,
 *   hands?: Array,
 *   geom?: object,
 *   videoTime?: number,
 *   nowMs?: number,
 * }} input
 * @param {ReturnType<typeof createHold>} [hold]
 */
export function judge(input = {}, hold) {
  const holdState = hold || createHold();
  try {
    const letter = input.letter;
    const practiceStatus = statusOf(letter);
    const lm = input.lm ?? (Array.isArray(input.hands) ? input.hands[0] : null);
    const hands = input.hands ?? (lm ? [lm] : []);

    if (!letter) {
      resetHold(holdState);
      return result({
        decision: "blocked",
        practiceStatus,
        issues: [{ code: "no_target", hint: "先选一个字母" }],
        quality: { ok: false, reason: "no_target" },
        hold: holdState,
      });
    }

    const quality = assessInputQuality({
      hands,
      lm,
      letter,
      geom: input.geom,
    });
    if (!quality.ok) {
      resetHold(holdState);
      return result({
        decision: "undetermined",
        practiceStatus,
        issues: [{ code: quality.reason, hint: QUALITY_HINT }],
        quality,
        hold: holdState,
      });
    }

    const judged = evaluate(letter, lm, input.geom);
    const audit = judged.audit || judged.issues || [];

    if (judged.ruleStatus === "empty" || audit.some((x) => x.code === "rules.empty")) {
      resetHold(holdState);
      return result({
        decision: "blocked",
        practiceStatus,
        issues: audit.length ? audit : [{ code: "rules.empty", hint: "这条还没有可判定的规则" }],
        quality: { ok: true, reason: "ok" },
        hold: holdState,
      });
    }
    if (judged.ruleStatus === "unsupported" || audit.some((x) => x.code === "unsupported_rule")) {
      resetHold(holdState);
      return result({
        decision: "blocked",
        practiceStatus,
        issues: audit.length ? audit : [{ code: "unsupported_rule", hint: "规则字段还不支持，不能判定" }],
        quality: { ok: true, reason: "ok" },
        hold: holdState,
      });
    }

    if (practiceStatus === "pending_review" || practiceStatus === "demo_only") {
      resetHold(holdState);
      const hint = practiceStatus === "demo_only" ? "仅示范" : "暂不判定";
      return result({
        decision: "blocked",
        practiceStatus,
        issues: [{ code: `status.${practiceStatus}`, hint }],
        quality: { ok: true, reason: "ok" },
        hold: holdState,
      });
    }

    if (!judged.pass) {
      resetHold(holdState);
      return result({
        decision: "fail",
        practiceStatus,
        issues: audit,
        quality: { ok: true, reason: "ok" },
        hold: holdState,
      });
    }

    observePass(holdState, { ok: true, videoTime: input.videoTime, nowMs: input.nowMs });
    if (!holdReady(holdState)) {
      return result({
        decision: "fail",
        practiceStatus,
        issues: [{ code: "hold.pending", hint: "姿态接近，停稳" }],
        quality: { ok: true, reason: "ok" },
        hold: holdState,
      });
    }

    return result({
      decision: "pass",
      practiceStatus,
      issues: [],
      quality: { ok: true, reason: "ok" },
      hold: holdState,
    });
  } catch {
    resetHold(holdState);
    return result({
      decision: "undetermined",
      practiceStatus: statusOf(input.letter),
      issues: [{ code: "exception", hint: QUALITY_HINT }],
      quality: { ok: false, reason: "exception" },
      hold: holdState,
    });
  }
}

export { createHold, resetHold };
