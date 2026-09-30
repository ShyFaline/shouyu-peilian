/** 只编排。禁止再写 curl/spread。practiceStatus 只来自 letters.json，运行时不准升格。 */

import { evaluate, FINGER_TIPS, handScale } from "./evaluate.js";
import { geometrySize, toGeometryPoints } from "./coords.js";
import { QUALITY_HINT, assessInputQuality } from "./inputQuality.js";
import {
  createMotionState,
  matchMotion,
  motionView,
  motionWindowExpired,
  observeSample,
  resetMotion,
  startCollecting,
} from "./motion.js";
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

function result({ decision, practiceStatus, issues, quality, hold, motion = null }) {
  const out = {
    decision,
    practiceStatus,
    issues,
    quality: { ok: Boolean(quality?.ok), reason: quality?.reason || "" },
    hold: holdView(hold),
  };
  if (motion) out.motion = motionView(motion);
  return out;
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
    if (judged.motion) {
      return { title: "做对了", hint: "手型与动作都完成了。", state: "ok" };
    }
    return { title: "做对了，保持住", hint: "手型已连续保持，通过了本字母的静态姿态。", state: "ok" };
  }
  if (issues.some((x) => x.code === "motion.pending")) {
    return { title: blob || "保持手型，开始做动作", hint: "", state: "idle" };
  }
  if (issues.some((x) => x.code === "motion.timeout")) {
    return { title: blob || "动作没做完，请重试", hint: "", state: "bad" };
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
 * 动态字母的追踪点：trace 取规则指定指尖；shake(hand) 取腕/掌中点；
 * shake(fingers) 取当前伸直（含 partial）各指尖的均值，无伸直时退到食指尖。
 * 坐标除以 handScale 归一，消除手远近的影响；z 先换算到与 x/y 同量纲再归一。
 */
function trackPoint(spec, landmarks, geom, curls) {
  if (!Array.isArray(landmarks) || landmarks.length < 21) return null;
  const size = geometrySize(geom);
  const pts = toGeometryPoints(landmarks, geom);
  if (pts.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  const s = handScale(pts) || 1;
  const zUnit = geom?.coordSpace === "image_normalized" ? (size.width || 1) : 1;
  const norm = (p) => ({ x: p.x / s, y: p.y / s, z: (((p && p.z) ?? 0) * zUnit) / s });
  if (spec.kind === "trace") {
    const tipIdx = FINGER_TIPS[spec.finger];
    if (!Number.isInteger(tipIdx)) return null;
    return norm(pts[tipIdx]);
  }
  if (spec.kind === "shake" && spec.part === "hand") {
    return norm({
      x: (pts[0].x + pts[9].x) / 2,
      y: (pts[0].y + pts[9].y) / 2,
      z: (((pts[0].z) ?? 0) + ((pts[9].z) ?? 0)) / 2,
    });
  }
  if (spec.kind === "shake" && spec.part === "fingers") {
    const names = Object.keys(FINGER_TIPS);
    const use = names.filter((n) => curls?.[n] === "none" || curls?.[n] === "partial");
    const pick = use.length ? use : ["index"];
    let x = 0;
    let y = 0;
    let z = 0;
    for (const n of pick) {
      const p = pts[FINGER_TIPS[n]];
      x += p.x;
      y += p.y;
      z += (p.z ?? 0);
    }
    return norm({ x: x / pick.length, y: y / pick.length, z: z / pick.length });
  }
  return null;
}

function motionHint(spec) {
  if (spec?.kind === "trace") {
    return spec.path === "z" ? "手型对了，现在用食指画出 Z" : "手型对了，现在用小指向下画一个钩";
  }
  if (spec?.kind === "shake") {
    return spec.axis === "vertical" ? "手型对了，现在把手上下晃动两下" : "手型对了，现在把手指前后晃动两下";
  }
  return "手型对了，现在做动作";
}

function motionReasonHint(reason) {
  switch (reason) {
    case "too_short":
      return "动作幅度再大一点";
    case "pattern_mismatch":
      return "动作方向不对，再看一遍示范";
    case "no_oscillation":
      return "没检测到晃动，动作再明显一点";
    case "few_cycles":
      return "晃动次数不够，要晃两下";
    default:
      return null;
  }
}

/**
 * 动态字母两阶段判定：
 * pose 阶段沿用保持门（连续静态通过才开放动作）；collecting 阶段只收集轨迹采样，
 * 不再要求逐帧静态通过（手在移动，几何必然变化）。
 * 窗口超时 / 采样违规 → 回落 pose 重新进入。pass 语义 = 静态 + 动态都完成。
 */
function judgeMotion(hold, motion, spec, input, geom) {
  const { videoTime, nowMs } = input;
  if (motion.phase !== "collecting") {
    if (!geom.pass) {
      resetHold(hold);
      return { decision: "fail", issues: geom.audit || geom.issues || [] };
    }
    observePass(hold, { ok: true, videoTime, nowMs });
    if (!holdReady(hold)) {
      return { decision: "fail", issues: [{ code: "hold.pending", hint: "保持手型" }] };
    }
    startCollecting(motion, nowMs);
    return { decision: "fail", issues: [{ code: "motion.pending", hint: motionHint(spec) }] };
  }
  if (motionWindowExpired(motion, nowMs)) {
    resetMotion(motion);
    resetHold(hold);
    return { decision: "fail", issues: [{ code: "motion.timeout", hint: "动作没做完，把手型停稳后重新来" }] };
  }
  const point = trackPoint(spec, input.landmarks, input.geom, geom.curls);
  if (point) observeSample(motion, { point, curls: geom.curls, videoTime, nowMs });
  if (motion.phase !== "collecting") {
    resetHold(hold);
    return { decision: "fail", issues: [{ code: "motion.timeout", hint: "动作采样异常，把手型停稳后重新来" }] };
  }
  const r = matchMotion(motion, spec);
  if (r.matched) return { decision: "pass", issues: [] };
  return {
    decision: "fail",
    issues: [{ code: "motion.pending", hint: motionReasonHint(r.reason) || motionHint(spec) }],
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
 * @param {ReturnType<typeof createMotionState>} [motion] 动态判定状态；不传则每次调用新建（fail-closed，永不 pass）。
 */
export function judge(input = {}, hold, motion = null) {
  const holdState = hold || createHold();
  try {
    const letter = input.letter;
    const practiceStatus = statusOf(letter);
    const lm = input.lm ?? (Array.isArray(input.hands) ? input.hands[0] : null);
    const hands = input.hands ?? (lm ? [lm] : []);

    if (!letter) {
      resetHold(holdState);
      if (motion) resetMotion(motion);
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
      if (motion) resetMotion(motion);
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
      if (motion) resetMotion(motion);
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
      if (motion) resetMotion(motion);
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
      if (motion) resetMotion(motion);
      const hint = practiceStatus === "demo_only" ? "仅示范" : "暂不判定";
      return result({
        decision: "blocked",
        practiceStatus,
        issues: [{ code: `status.${practiceStatus}`, hint }],
        quality: { ok: true, reason: "ok" },
        hold: holdState,
      });
    }

    const motionSpec = letter?.rules?.motion;
    if (motionSpec) {
      const motionState = motion || createMotionState();
      const judgedMotion = judgeMotion(holdState, motionState, motionSpec, {
        landmarks: lm,
        geom: input.geom,
        videoTime: input.videoTime,
        nowMs: input.nowMs,
      }, judged);
      return result({
        decision: judgedMotion.decision,
        practiceStatus,
        issues: judgedMotion.issues,
        quality: { ok: true, reason: "ok" },
        hold: holdState,
        motion: motionState,
      });
    }

    if (!judged.pass) {
      resetHold(holdState);
      if (motion) resetMotion(motion);
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
