/** 理解层纯函数：几何 + evaluate。无 DOM、无摄像头、无 MediaPipe。 */

import { geometryError, toGeometryPoints } from "./coords.js";

export const FINGER_TIPS = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
export const FINGER_PIPS = { thumb: 3, index: 6, middle: 10, ring: 14, pinky: 18 };
export const FINGER_MCPS = { thumb: 2, index: 5, middle: 9, ring: 13, pinky: 17 };
export const FINGERS = ["thumb", "index", "middle", "ring", "pinky"];

export const EXTENDED_DEG = 142;
export const CURLED_DEG = 100;
export const TOGETHER_DEG = 22;
export const APART_DEG = 24;

export const SPREAD_PAIRS = [
  ["index", "middle"],
  ["middle", "ring"],
  ["ring", "pinky"],
];

export const KNOWN_RULE_KEYS = [
  "extended",
  "curled",
  "spread",
  "pinch",
  "shape",
  "pointing",
  "cross",
  "thumb_between",
  "thumb_index",
  "hook",
];

export const CURL_HINT = {
  thumb: { none: "拇指再伸直", full: "拇指收一点" },
  index: { none: "食指再伸直", full: "食指收起来" },
  middle: { none: "中指再伸直", full: "中指收起来" },
  ring: { none: "无名指再伸直", full: "无名指收起来" },
  pinky: { none: "小指再伸直", full: "小指收起来" },
};

export const SPREAD_HINT = {
  index_middle: { together: "食指中指并拢", apart: "食指中指分开" },
  middle_ring: { together: "中指无名指并拢", apart: "中指无名指分开" },
  ring_pinky: { together: "无名指小指并拢", apart: "无名指小指分开" },
};

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 零长度向量返回 NaN，不返回 180。交给质量层拒绝。 */
export function angleDeg(a, b, c) {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const den = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (!(den > 1e-6)) return Number.NaN;
  const cos = Math.min(1, Math.max(-1, (abx * cbx + aby * cby) / den));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** 零长度向量返回 NaN，不返回 0。交给质量层拒绝。 */
export function vecAngle(ax, ay, bx, by) {
  const den = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (!(den > 1e-6)) return Number.NaN;
  const cos = Math.min(1, Math.max(-1, (ax * bx + ay * by) / den));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function fingerCurlDeg(lm, name) {
  const mcp = lm[FINGER_MCPS[name]];
  const pip = lm[FINGER_PIPS[name]];
  const tip = lm[FINGER_TIPS[name]];
  if (name === "thumb") {
    const ip = lm[3];
    return angleDeg(lm[2], ip, lm[4]);
  }
  const dip = lm[FINGER_TIPS[name] - 1];
  const a = angleDeg(mcp, pip, dip);
  const b = angleDeg(pip, dip, tip);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
  return (a + b) / 2;
}

export function classifyCurl(deg) {
  if (deg >= EXTENDED_DEG) return "none";
  if (deg <= CURLED_DEG) return "full";
  return "half";
}

export function handScale(lm) {
  return dist(lm[0], lm[9]) || dist(lm[0], lm[5]) || 0.2;
}

export function fingerDir(lm, name) {
  const mcp = lm[FINGER_MCPS[name]];
  const tip = lm[FINGER_TIPS[name]];
  return { x: tip.x - mcp.x, y: tip.y - mcp.y };
}

export function spreadBetween(lm, a, b) {
  const da = fingerDir(lm, a);
  const db = fingerDir(lm, b);
  return vecAngle(da.x, da.y, db.x, db.y);
}

export function pointingOf(lm, name) {
  const d = fingerDir(lm, name || "index");
  if (Math.abs(d.x) > Math.abs(d.y) * 1.15) return "side";
  return d.y < 0 ? "up" : "down";
}

export function cross2d(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

export function segsIntersect(a, b, c, d) {
  const d1 = cross2d(b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y);
  const d2 = cross2d(b.x - a.x, b.y - a.y, d.x - a.x, d.y - a.y);
  const d3 = cross2d(d.x - c.x, d.y - c.y, a.x - c.x, a.y - c.y);
  const d4 = cross2d(d.x - c.x, d.y - c.y, b.x - c.x, b.y - c.y);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export function indexMiddleCrossed(lm) {
  return segsIntersect(lm[6], lm[8], lm[10], lm[12]);
}

export function thumbBetweenIndexMiddle(lm) {
  const mid = {
    x: (lm[6].x + lm[10].x) / 2,
    y: (lm[6].y + lm[10].y) / 2,
  };
  return dist(lm[4], mid) / handScale(lm) < 0.38;
}

export function inFrameOf(lm) {
  if (!lm || lm.length < 21) return false;
  const keys = [0, 5, 9, 13, 17];
  let inside = 0;
  for (const i of keys) {
    const p = lm[i];
    if (!p) continue;
    if (p.x > -0.05 && p.x < 1.05 && p.y > -0.08 && p.y < 1.12) inside += 1;
  }
  return inside >= 3;
}

/** 没手 / 两只手 / 出框 / 低置信度时不能判到位。阈值不改。判定放行不走这里的 conf。 */
export const MIN_HAND_CONF = 0.35;

export function isReadyToScore({ handCount, conf, lm } = {}) {
  if (handCount !== 1) return false;
  if (!(conf >= MIN_HAND_CONF)) return false;
  return inFrameOf(lm);
}

export function inspectRules(rules) {
  const src = rules && typeof rules === "object" ? rules : {};
  const keys = Object.keys(src);
  const unknown = keys.filter((k) => !KNOWN_RULE_KEYS.includes(k));
  if (unknown.length) {
    return { kind: "unsupported", unknown };
  }
  const known = keys.filter((k) => KNOWN_RULE_KEYS.includes(k));
  if (!known.length) {
    return { kind: "empty" };
  }
  return { kind: "ok" };
}

function packResult({ pass, issues, curls, ruleStatus }) {
  const audit = issues;
  return {
    pass,
    issues: issues.slice(0, 2),
    audit,
    curls,
    ruleStatus: ruleStatus || "ok",
  };
}

/**
 * @param {{ rules?: object } | null | undefined} letter
 * @param {Array<{x:number,y:number,z?:number}> | null | undefined} lm
 * @param {{ width?: number, height?: number, imageWidth?: number, imageHeight?: number, coordSpace?: string }} [geom]
 * @returns {{ pass: boolean, issues: Array, audit: Array, curls: object, ruleStatus: string }}
 */
export function evaluate(letter, lm, geom) {
  if (!letter || !lm || lm.length < 21) {
    const issues = [{ code: "no_hand", hint: "还没看到完整的手" }];
    return packResult({ pass: false, issues, curls: {}, ruleStatus: "no_hand" });
  }

  const rules = letter.rules || {};
  const inspected = inspectRules(rules);
  if (inspected.kind === "empty") {
    const issues = [{ code: "rules.empty", hint: "这条还没有可判定的规则" }];
    return packResult({ pass: false, issues, curls: {}, ruleStatus: "empty" });
  }
  if (inspected.kind === "unsupported") {
    const issues = [{ code: "unsupported_rule", hint: "规则字段还不支持，不能判定" }];
    return packResult({ pass: false, issues, curls: {}, ruleStatus: "unsupported" });
  }

  const error = geometryError(geom);
  if (error) return packResult({ pass: false, issues: [{ code: error, hint: "暂时无法判断" }], curls: {}, ruleStatus: error });
  if (!Array.isArray(lm) || lm.length !== 21 || lm.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || (p.z != null && !Number.isFinite(p.z)))) {
    return packResult({ pass: false, issues: [{ code: "non_finite", hint: "暂时无法判断" }], curls: {}, ruleStatus: "invalid_input" });
  }
  const pts = toGeometryPoints(lm, geom);
  const issues = [];
  const curls = {};
  for (const name of FINGERS) {
    curls[name] = classifyCurl(fingerCurlDeg(pts, name));
  }
  const scale = handScale(pts);

  for (const finger of rules.extended || []) {
    if (curls[finger] !== "none") {
      issues.push({
        finger,
        code: `${finger}.not_extended`,
        hint: CURL_HINT[finger]?.none || "这根手指再伸直",
      });
    }
  }
  for (const finger of rules.curled || []) {
    if (curls[finger] === "none") {
      issues.push({
        finger,
        code: `${finger}.not_curled`,
        hint: CURL_HINT[finger]?.full || "这根手指收起来",
      });
    }
  }

  const spreadSpec = rules.spread;
  if (typeof spreadSpec === "string") {
    const deg = spreadBetween(pts, "index", "middle");
    if (spreadSpec === "together" && deg > TOGETHER_DEG) {
      issues.push({ code: "fingers.not_together", hint: SPREAD_HINT.index_middle.together });
    }
    if (spreadSpec === "apart" && deg < APART_DEG) {
      issues.push({ code: "fingers.not_spread", hint: SPREAD_HINT.index_middle.apart });
    }
  } else if (spreadSpec) {
    for (const [a, b] of SPREAD_PAIRS) {
      const key = `${a}_${b}`;
      const want = spreadSpec[key];
      if (!want) continue;
      const deg = spreadBetween(pts, a, b);
      if (want === "together" && deg > TOGETHER_DEG) {
        issues.push({ code: `${key}.not_together`, hint: SPREAD_HINT[key].together });
      }
      if (want === "apart" && deg < APART_DEG) {
        issues.push({ code: `${key}.not_apart`, hint: SPREAD_HINT[key].apart });
      }
    }
  }

  if (rules.pinch) {
    const p = dist(pts[4], pts[FINGER_TIPS[rules.pinch]]) / scale;
    if (p > 0.42) {
      issues.push({
        code: `pinch.${rules.pinch}`,
        hint: rules.pinch === "middle" ? "拇指贴住中指" : "拇指贴住食指",
      });
    }
  }

  if (rules.shape === "o") {
    const p = dist(pts[4], pts[8]) / scale;
    if (p > 0.42) {
      issues.push({ code: "shape.o.open", hint: "拇指食指靠拢成圆" });
    }
  }
  if (rules.shape === "c") {
    const p = dist(pts[4], pts[8]) / scale;
    if (p < 0.28) {
      issues.push({ code: "shape.c.closed", hint: "C 要留开口，不要捏成 O" });
    }
    const straight = FINGERS.filter((f) => curls[f] === "none").length;
    if (straight >= 3) {
      issues.push({ code: "shape.c.straight", hint: "五指再弯曲成 C" });
    }
  }

  if (rules.pointing) {
    const probe = (rules.extended || []).includes("index") ? "index" : (rules.extended || ["index"])[0];
    const got = pointingOf(pts, probe);
    if (got !== rules.pointing) {
      const hint =
        rules.pointing === "up"
          ? "指尖朝上"
          : rules.pointing === "down"
            ? "指尖朝下"
            : "手侧过来，指尖朝旁边";
      issues.push({ code: `pointing.${rules.pointing}`, hint });
    }
  }

  if (rules.cross === "index_middle" && !indexMiddleCrossed(pts)) {
    issues.push({ code: "cross.index_middle", hint: "食指中指交叉" });
  }

  if (rules.thumb_between && !thumbBetweenIndexMiddle(pts)) {
    issues.push({ code: "thumb.between", hint: "拇指从食指和中指之间伸出来" });
  }

  if (rules.thumb_index) {
    const deg = vecAngle(
      fingerDir(pts, "thumb").x,
      fingerDir(pts, "thumb").y,
      fingerDir(pts, "index").x,
      fingerDir(pts, "index").y,
    );
    if (rules.thumb_index === "right_angle" && (deg < 48 || deg > 130)) {
      issues.push({ code: "thumb_index.angle", hint: "拇指和食指张开成 L" });
    }
    if (rules.thumb_index === "parallel" && deg > 48) {
      issues.push({ code: "thumb_index.parallel", hint: "拇指靠近食指，不要张成 L" });
    }
  }

  if (rules.hook === "index") {
    if (curls.index === "none") {
      issues.push({ code: "index.not_hooked", hint: "食指弯成钩，不要完全伸直" });
    }
  }

  return packResult({ pass: issues.length === 0, issues, curls, ruleStatus: "ok" });
}
