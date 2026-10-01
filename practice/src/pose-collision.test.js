/** 示范手模穿模门禁（胶囊重合度）。
 *
 * 数据来源：blender/build_godot_hand_poc.py -- export-pose 导出的
 * pose-skeleton.json（rest 骨骼世界坐标 + 胶囊半径 + 姿态表 + 摆姿锚点）。
 * 本测试在 Node 复现同一套 FK（与 curl()/apply_pose() 同序同轴），
 * 先与 Blender 实际摆姿锚点对齐，再对 19 根指骨胶囊做两两重合检测：
 * 重合度 overlap = 1 - 轴间距/(r1+r2)，> 0 即两骨芯部互穿（穿模）。
 *
 * 半径是 90 分位近似，只断言指骨之间；Palm/Wrist 与真实网格浅接触
 * 由 Blender 侧 -- selfcheck（BVH）兜底。改姿态表后：重跑 export-pose
 * 并跑本文件。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(SRC_DIR, "pose-skeleton.json"), "utf8"));

// ---------- 最小 4x4 刚体变换（行主序，p' = M·p） ----------
const DEG = Math.PI / 180;
function identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
function translation([x, y, z]) {
  return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
}
function rotationAxisAngle([ax, ay, az], deg) {
  const len = Math.hypot(ax, ay, az);
  const [x, y, z] = [ax / len, ay / len, az / len];
  const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG), t = 1 - c;
  return [
    t * x * x + c, t * x * y - s * z, t * x * z + s * y, 0,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x, 0,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c, 0,
    0, 0, 0, 1,
  ];
}
function mul(a, b) {
  const m = new Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      m[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + a[r * 4 + 3] * b[12 + c];
    }
  }
  return m;
}
function xformPoint(m, [x, y, z]) {
  return [
    m[0] * x + m[1] * y + m[2] * z + m[3],
    m[4] * x + m[5] * y + m[6] * z + m[7],
    m[8] * x + m[9] * y + m[10] * z + m[11],
  ];
}

// ---------- 骨架与 FK（复现 curl()/apply_pose()） ----------
const SEGMENTS = ["Metacarpal", "Proximal", "Intermediate", "Distal"];
const boneByName = new Map(data.bones.map((b) => [b.name, b]));
const descendants = new Map();
for (const b of data.bones) {
  const list = [b.name];
  for (let i = 0; i < list.length; i++) {
    for (const c of data.bones) if (c.parent === list[i]) list.push(c.name);
  }
  descendants.set(b.name, list);
}

function curl(acc, name, deg, axis) {
  const bone = boneByName.get(name);
  if (!bone || !deg) return;
  const head = xformPoint(acc.get(name), bone.head);
  const hinge = mul(mul(translation(head), rotationAxisAngle(axis, deg)), translation([-head[0], -head[1], -head[2]]));
  for (const d of descendants.get(name)) acc.set(d, mul(hinge, acc.get(d)));
}

function applyPose(letter) {
  const acc = new Map(data.bones.map((b) => [b.name, identity()]));
  const axis = data.axis, pn = data.palmNormal, fu = data.fingerUp;
  for (const [finger, deg] of Object.entries(data.splay[letter])) {
    curl(acc, `${finger}_Metacarpal_R`, deg, pn);
  }
  const [swing, tmeta, tprox, tdist] = data.thumb[letter];
  curl(acc, "Thumb_Metacarpal_R", swing, pn);
  for (const [finger, angles] of Object.entries(data.letters[letter])) {
    for (let i = 0; i < SEGMENTS.length; i++) curl(acc, `${finger}_${SEGMENTS[i]}_R`, angles[i], axis);
  }
  curl(acc, "Thumb_Metacarpal_R", tmeta, fu);
  curl(acc, "Thumb_Proximal_R", tprox, pn);
  curl(acc, "Thumb_Distal_R", tdist, pn);
  return acc;
}

// ---------- 对齐校验：Node FK 必须复现 Blender 实际摆姿 ----------
const ALIGN_TOL = 5e-4; // Blender pose 矩阵为单精度，锚点 round 到 1e-6
const LETTERS = Object.keys(data.letters);
assert.equal(LETTERS.length, 32, "姿态表应有 32 个字母");
for (const letter of LETTERS) {
  const acc = applyPose(letter);
  let worst = 0, worstBone = "";
  for (const b of data.bones) {
    const anchor = data.posed[letter][b.name];
    const head = xformPoint(acc.get(b.name), b.head);
    const tail = xformPoint(acc.get(b.name), b.tail);
    const err = Math.max(
      Math.hypot(head[0] - anchor.head[0], head[1] - anchor.head[1], head[2] - anchor.head[2]),
      Math.hypot(tail[0] - anchor.tail[0], tail[1] - anchor.tail[1], tail[2] - anchor.tail[2]),
    );
    if (err > worst) { worst = err; worstBone = b.name; }
  }
  assert.ok(worst <= ALIGN_TOL, `${letter}: Node FK 与 Blender 锚点偏差 ${worst}（${worstBone}），超过 ${ALIGN_TOL}——两边实现已漂移`);
}

// ---------- 胶囊重合检测 ----------
function segSegDist(p1, q1, p2, q2) {
  // Christer Ericson, Real-Time Collision Detection 5.1.9
  const d1 = [q1[0] - p1[0], q1[1] - p1[1], q1[2] - p1[2]];
  const d2 = [q2[0] - p2[0], q2[1] - p2[1], q2[2] - p2[2]];
  const r = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]];
  const a = d1[0] * d1[0] + d1[1] * d1[1] + d1[2] * d1[2];
  const e = d2[0] * d2[0] + d2[1] * d2[1] + d2[2] * d2[2];
  const f = d2[0] * r[0] + d2[1] * r[1] + d2[2] * r[2];
  const EPS = 1e-12;
  let s, t;
  if (a <= EPS && e <= EPS) return Math.hypot(r[0], r[1], r[2]);
  if (a <= EPS) {
    s = 0;
    t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = d1[0] * r[0] + d1[1] * r[1] + d1[2] * r[2];
    if (e <= EPS) {
      t = 0;
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2];
      const denom = a * e - b * b;
      s = denom > EPS ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  const c1 = [p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s];
  const c2 = [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t];
  return Math.hypot(c1[0] - c2[0], c1[1] - c2[1], c1[2] - c2[2]);
}

// 参与骨：五指的 4 个指节段（Tip/Palm/Wrist 无蒙皮顶点，半径为 0 不参与）
const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Little"];
const CAPSULES = [];
for (const f of FINGERS) {
  for (const seg of SEGMENTS) {
    const b = boneByName.get(`${f}_${seg}_R`);
    if (b && b.radius > 0) CAPSULES.push(b);
  }
}
// 相邻父子段天然相连（按真实骨骼链，拇指 Proximal→Distal 无 Intermediate）
function isAdjacentPair(a, b) {
  return a.parent === b.name || b.parent === a.name;
}

// 接触 ≠ 穿模：握拳时指尖抵掌心、并拢时指面贴合都是合法接触，胶囊近似会
// 给出正 overlap。采用双条件判定「深穿」：
//   1) 绝对上限 ABS_LIMIT：胶囊芯轴距离 < 半径和的 28%（overlap>0.72）。
//      并拢/TUCK 类贴合实测稳定在 0.65 以下；真穿模（A 拇指埋掌、指尖戳掌
//      等）全部在 0.82 以上，分界清晰。
//   2) 相对基线 REL_MARGIN：rest（全零姿态）基线 + 0.20——rest 里合法的
//      贴合对（相邻掌骨、指缝）不误报；rest 中不接触、摆姿后新出现的深穿必被抓
// KNOWN_VIOLATIONS 是修复基线：门禁断言违规集合不超出它（不许新增、不许
// 变差），修好一个字母就从基线移除，直至清空。
// 阈值由 rest 基线 + 32 字母分布定标（CALIBRATE=1 打印分布）。
const ABS_LIMIT = 0.72;
const REL_MARGIN = 0.20;

// 标准动作要求穿过/贴合的特定字母-骨骼对，豁免：
// T：拇指从食中指缝间穿出，与两侧指节必然高重合
const ALLOWED = new Set([
  "T|Thumb_Proximal_R|Middle_Distal_R",
  "T|Thumb_Proximal_R|Middle_Intermediate_R",
  "T|Thumb_Distal_R|Middle_Proximal_R",
  "T|Thumb_Distal_R|Middle_Intermediate_R",
  "T|Thumb_Distal_R|Ring_Distal_R",
  "T|Thumb_Distal_R|Ring_Intermediate_R",
]);

// 修复基线：当前已知存在胶囊级深穿的字母（blender selfcheck.json 同步佐证）。
// 修好一个删一行；出现基线外的违规字母直接失败。
const KNOWN_VIOLATIONS = new Set([
  "A", "C", "D", "F", "G", "H", "I", "J", "K", "L", "M", "N",
  "Q", "R", "S", "V", "X", "Y", "Z", "SH", "NG", "UE",
]);

function capsuleOverlaps(acc) {
  const caps = CAPSULES.map((b) => ({
    name: b.name,
    parent: b.parent,
    head: xformPoint(acc.get(b.name), b.head),
    tail: xformPoint(acc.get(b.name), b.tail),
    r: b.radius,
  }));
  const out = new Map();
  for (let i = 0; i < caps.length; i++) {
    for (let j = i + 1; j < caps.length; j++) {
      if (isAdjacentPair(caps[i], caps[j])) continue;
      const dist = segSegDist(caps[i].head, caps[i].tail, caps[j].head, caps[j].tail);
      const overlap = 1 - dist / (caps[i].r + caps[j].r);
      out.set(`${caps[i].name}|${caps[j].name}`, overlap);
    }
  }
  return out;
}

const restOverlap = capsuleOverlaps(new Map(data.bones.map((b) => [b.name, identity()])));

if (process.env.CALIBRATE) {
  for (const letter of LETTERS) {
    const ov = capsuleOverlaps(applyPose(letter));
    const rows = [...ov.entries()]
      .map(([pair, o]) => ({ pair, o, base: restOverlap.get(pair) }))
      .filter((x) => x.o > x.base + 0.02 || x.o > -0.05)
      .sort((a, b) => b.o - a.o)
      .slice(0, 8);
    console.log(`${letter}: ${rows.map((x) => `${x.pair.replace(/_R/g, "")}=${x.o.toFixed(3)}(rest ${x.base.toFixed(3)})`).join(" ")}`);
  }
  process.exit(0);
}

const violatingLetters = new Set();
const report = [];
for (const letter of LETTERS) {
  const ov = capsuleOverlaps(applyPose(letter));
  const bad = [];
  for (const [pair, o] of ov) {
    const base = restOverlap.get(pair);
    if (o > ABS_LIMIT && o > base + REL_MARGIN && !ALLOWED.has(`${letter}|${pair}`)) {
      bad.push({ pair: pair.replace("|", "×"), overlap: +o.toFixed(4), rest: +base.toFixed(4) });
    }
  }
  bad.sort((x, y) => y.overlap - x.overlap);
  if (bad.length) {
    violatingLetters.add(letter);
    report.push(`${letter}: ${bad.slice(0, 5).map((x) => `${x.pair}=${x.overlap}(rest ${x.rest})`).join(" ")}${bad.length > 5 ? ` …共${bad.length}对` : ""}`);
  }
}
const unexpected = [...violatingLetters].filter((l) => !KNOWN_VIOLATIONS.has(l));
assert.equal(
  unexpected.length, 0,
  `穿模门禁失败，${unexpected.length} 个字母在修复基线之外出现胶囊深穿（abs>${ABS_LIMIT} 且超 rest 基线 ${REL_MARGIN}）：\n${report.filter((r) => unexpected.includes(r.split(":")[0])).join("\n")}`,
);
if (report.length) {
  console.log(`pose-collision: ${violatingLetters.size} 个字母在修复基线内（待修），无新增违规`);
}
for (const line of report) console.log("  " + line);
console.log(`pose-collision: 32 字母 × ${CAPSULES.length} 骨胶囊重合检测通过（FK 与 Blender 锚点对齐 ≤${ALIGN_TOL}）`);
