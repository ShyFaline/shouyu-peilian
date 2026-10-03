/** 输入质量门。不读 handedness.score，不补 conf=1。 */

import { geometryError, geometrySize, toGeometryPoints } from "./coords.js";

const FINGER_TIPS = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };

export const QUALITY_HINT = "暂时无法判断";
export const DEGENERATE_EPS = 1e-6;
// 手在画面里太小时规则判断不可信（如把手凑到下巴边）。相对画面短边的最小腕-掌距离。
export const MIN_HAND_SCALE_RATIO = 0.1; // UNVERIFIED 待验证
export const HAND_TOO_SMALL_HINT = "手太小了，把手举近摄像头再试";
export const NO_HAND_HINT = "把手举到摄像头前，让整只手进画面";
export const TWO_HANDS_HINT = "画面里有两只手，请只留一只手";
export const FINGERTIP_OOB_HINT = "手指出画面了，把手往画面中间收一收";
export const INVALID_RULE_HINT = "这条规则里的手指名无法识别，暂时不能判定";

function asList(v) {
  if (Array.isArray(v)) return v;
  return v == null ? [] : [v];
}

/** @returns {{ names: string[], invalid: unknown[] }} invalid 非空表示规则本身不合法，不能算手指出画面。 */
function neededFingertips(letter) {
  const rules = letter?.rules || {};
  const raw = [...asList(rules.extended), ...asList(rules.curled)];
  if (rules.hook) raw.push(rules.hook);
  if (rules.pinch) raw.push(rules.pinch);
  if (rules.pointing) {
    // 与 evaluate.js 的 pointing 探针一致：中指优先（手的轴线），其次食指
    const ext = Array.isArray(rules.extended) ? rules.extended : [];
    const probe = ext.includes("middle") ? "middle" : ext.includes("index") ? "index" : (ext[0] || "index");
    raw.push(probe);
  }
  const names = [];
  const invalid = [];
  for (const f of raw) {
    if (typeof f === "string" && FINGER_TIPS[f] !== undefined) {
      if (!names.includes(f)) names.push(f);
    } else {
      invalid.push(f);
    }
  }
  if (!names.length && !invalid.length) {
    for (const name of Object.keys(FINGER_TIPS)) names.push(name);
  }
  return { names, invalid };
}

const BONES = [
  [0, 9],
  [1, 2], [2, 3], [3, 4],
  [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [17, 18], [18, 19], [19, 20],
];

function fail(reason, hint = QUALITY_HINT) {
  return { ok: false, reason, hint };
}

function isFiniteNum(n) {
  return typeof n === "number" && Number.isFinite(n);
}

function inNormFrame(p) {
  return p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
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
  if (!Array.isArray(hands) || hands.length === 0) {
    return fail("no_hand", NO_HAND_HINT);
  }
  if (hands.length !== 1) {
    return fail("two_hands", TWO_HANDS_HINT);
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

  // 尺寸门：腕(0)→中指根(9) 的像素距离低于画面短边 × MIN_HAND_SCALE_RATIO 视为手太小
  // 参考边取短边：x 乘宽、y 乘高是各向异性的，短边对竖向的腕-掌距离不失真
  const size = geometrySize(input.geom);
  if (size && isFiniteNum(size.width) && isFiniteNum(size.height) && size.width > 0 && size.height > 0) {
    const handPx = boneLen(pts[0], pts[9]);
    if (!(handPx >= Math.min(size.width, size.height) * MIN_HAND_SCALE_RATIO)) {
      return fail("hand_too_small", HAND_TOO_SMALL_HINT);
    }
  }

  const needed = neededFingertips(input.letter);
  if (needed.invalid.length) {
    // 规则里出现不认识的手指名：是内容问题，不能报成「手指出画面」误导用户
    return fail("invalid_rule", INVALID_RULE_HINT);
  }
  for (const name of needed.names) {
    const idx = FINGER_TIPS[name];
    const p = lm[idx];
    if (!p || !inNormFrame(p)) {
      return fail("fingertip_oob", FINGERTIP_OOB_HINT);
    }
  }

  return { ok: true, reason: "ok", hint: "" };
}

export function qualityIssue(quality) {
  return { code: quality?.reason || "quality", hint: QUALITY_HINT };
}
