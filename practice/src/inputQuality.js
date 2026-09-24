/** 输入质量门。不读 handedness.score，不补 conf=1。 */

import { geometryError, toGeometryPoints } from "./coords.js";

const FINGER_TIPS = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };

export const QUALITY_HINT = "暂时无法判断";
export const DEGENERATE_EPS = 1e-6;

const BONES = [
  [0, 9],
  [1, 2], [2, 3], [3, 4],
  [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [17, 18], [18, 19], [19, 20],
];

function fail(reason) {
  return { ok: false, reason, hint: QUALITY_HINT };
}

function isFiniteNum(n) {
  return typeof n === "number" && Number.isFinite(n);
}

function inNormFrame(p) {
  return p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
}

function neededFingertips(letter) {
  const rules = letter?.rules || {};
  const names = new Set();
  for (const f of rules.extended || []) names.add(f);
  for (const f of rules.curled || []) names.add(f);
  if (rules.hook) names.add(rules.hook);
  if (rules.pinch) names.add(rules.pinch);
  if (rules.pointing) {
    const probe = (rules.extended || []).includes("index") ? "index" : (rules.extended || ["index"])[0];
    names.add(probe || "index");
  }
  if (!names.size) {
    for (const name of Object.keys(FINGER_TIPS)) names.add(name);
  }
  return [...names];
}

function boneLen(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * @param {{
 *   hands?: Array,
 *   lm?: Array,
 *   letter?: object,
 *   geom?: { width?: number, height?: number, imageWidth?: number, imageHeight?: number, coordSpace?: string },
 * }} input
 * 不要传入 conf / handedness.score 来放行。缺 score 不是质量失败。
 */
export function assessInputQuality(input = {}) {
  const hands = input.hands ?? (input.lm ? [input.lm] : []);
  if (!Array.isArray(hands) || hands.length !== 1) {
    return fail("hand_count");
  }
  const lm = hands[0];
  if (!Array.isArray(lm) || lm.length !== 21) {
    return fail("landmarks");
  }
  for (let i = 0; i < 21; i += 1) {
    const p = lm[i];
    if (!p || !isFiniteNum(p.x) || !isFiniteNum(p.y)) {
      if (p && (p.x === undefined || p.y === undefined || p.x === null || p.y === null)) {
        return fail("missing_xy");
      }
      return fail("non_finite");
    }
  }

  const error = geometryError(input.geom);
  if (error) return fail(error);
  if (lm.some(p => p.z != null && !isFiniteNum(p.z))) return fail("non_finite");
  const pts = toGeometryPoints(lm, input.geom);
  for (const [ia, ib] of BONES) {
    if (boneLen(pts[ia], pts[ib]) < DEGENERATE_EPS) {
      return fail("degenerate_bone");
    }
  }

  const tips = neededFingertips(input.letter);
  for (const name of tips) {
    const idx = FINGER_TIPS[name];
    const p = lm[idx];
    if (!p || !inNormFrame(p)) {
      return fail("fingertip_oob");
    }
  }

  return { ok: true, reason: "ok", hint: "" };
}

export function qualityIssue(quality) {
  return { code: quality?.reason || "quality", hint: QUALITY_HINT };
}
