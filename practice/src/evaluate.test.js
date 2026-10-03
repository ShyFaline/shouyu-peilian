import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { angleDeg, APART_DEG, evaluate, isReadyToScore, spreadBetween, vecAngle } from "./evaluate.js";
import { judge, presentJudge, createHold } from "./judge.js";
import { createMotionState } from "./motion.js";
import { QUALITY_HINT, assessInputQuality, HAND_TOO_SMALL_HINT } from "./inputQuality.js";
import { createHold as makeHold, holdReady, observePass, resetHold } from "./passState.js";
import { canExportSnapshot, createSnapshot, serializeSnapshot } from "./snapshot.js";
import { stopCamera } from "./camera.js";
import { attachRotator, frameForDrag, parseRotIndex, rotFrameUrl, stepFrame } from "./rotator.js";

const root = dirname(fileURLToPath(import.meta.url));
const UNIT = { coordSpace: "equal_scale_unit" };
const pack = JSON.parse(readFileSync(join(root, "../content/letters.json"), "utf8"));
const byId = Object.fromEntries((pack.letters || []).map((letter) => [letter.id, letter]));
const letterU = byId["GF0021.U"];
const letterV = byId["GF0021.V"];
const letterA = byId["GF0021.A"];
const letterB = byId["GF0021.B"];
const letterL = byId["GF0021.L"];
const letterY = byId["GF0021.Y"];
const letterI = byId["GF0021.I"];
const letterW = byId["GF0021.W"];
const letterJ = byId["GF0021.J"];
const letterZ = byId["GF0021.Z"];
const letterM = byId["GF0021.M"];
const letterN = byId["GF0021.N"];
const letterS = byId["GF0021.S"];
const letterE = byId["GF0021.E"];
const letterEH = byId["GF0021.EH"];

assert.ok(letterU && letterV, "letters.json 必须包含 GF0021.U 和 GF0021.V");
assert.ok(letterA && letterB && letterL && letterY && letterI && letterW, "主路径 A B L Y I W 必须在字母包里");

function pt(x, y, z = 0) {
  return { x, y, z };
}

function blankHand() {
  return Array.from({ length: 21 }, () => pt(0.5, 0.5));
}

function setFinger(lm, mcp, extended, x, tipX) {
  const mcpY = 0.58;
  const tx = tipX ?? x;
  lm[mcp] = pt(x, mcpY);
  if (extended) {
    lm[mcp + 1] = pt(x + (tx - x) / 3, mcpY - 0.12);
    lm[mcp + 2] = pt(x + (tx - x) * 2 / 3, mcpY - 0.24);
    lm[mcp + 3] = pt(tx, mcpY - 0.36);
  } else {
    lm[mcp + 1] = pt(x, mcpY - 0.05);
    lm[mcp + 2] = pt(x + 0.015, mcpY + 0.04);
    lm[mcp + 3] = pt(x + 0.02, mcpY + 0.1);
  }
}

function curlThumb(lm) {
  lm[1] = pt(0.42, 0.82);
  lm[2] = pt(0.36, 0.74);
  lm[3] = pt(0.40, 0.70);
  lm[4] = pt(0.44, 0.76);
}

/** 拇指竖直伸出（正立 A、Y 用；side 判定已加宽，对角 45° 属斜向不算侧）。 */
function extendThumbUp(lm) {
  lm[1] = pt(0.42, 0.80);
  lm[2] = pt(0.42, 0.70);
  lm[3] = pt(0.42, 0.46);
  lm[4] = pt(0.42, 0.34);
}

/** 拇指横向伸出（L 用）。 */
function extendThumbSide(lm) {
  lm[1] = pt(0.42, 0.80);
  lm[2] = pt(0.38, 0.70);
  lm[3] = pt(0.28, 0.70);
  lm[4] = pt(0.18, 0.70);
}

/** 食指中指并拢伸直朝上，无名指小指收起，拇指收起。用来当 U 的正例、V 的反例。 */
function uTogetherHand() {
  const lm = blankHand();
  lm[0] = pt(0.5, 0.9);
  curlThumb(lm);
  setFinger(lm, 5, true, 0.46);
  setFinger(lm, 9, true, 0.5);
  setFinger(lm, 13, true, 0.54);
  setFinger(lm, 17, true, 0.6);
  return lm;
}

/** 食指中指明显分开伸直朝上。用来当 V 的正例、U 的反例。 */
function vApartHand() {
  const lm = blankHand();
  lm[0] = pt(0.5, 0.9);
  curlThumb(lm);
  setFinger(lm, 5, true, 0.44, 0.32);
  setFinger(lm, 9, true, 0.52, 0.64);
  setFinger(lm, 13, false, 0.56);
  setFinger(lm, 17, false, 0.62);
  return lm;
}

/** 近阈值 V：index-middle spread ≈ APART_DEG+2。只引用常数，不改阈值。 */
function nearThresholdVHand() {
  const lm = palm();
  curlThumb(lm);
  const dy = 0.36;
  const halfRad = ((APART_DEG + 2) * Math.PI) / 180 / 2;
  const dx = dy * Math.tan(halfRad);
  setFinger(lm, 5, true, 0.46, 0.46 - dx);
  setFinger(lm, 9, true, 0.50, 0.50 + dx);
  setFinger(lm, 13, false, 0.56);
  setFinger(lm, 17, false, 0.62);
  return lm;
}

function palm() {
  const lm = blankHand();
  lm[0] = pt(0.5, 0.9);
  return lm;
}

/** A：握拳，拇指伸出朝上。 */
function aHand() {
  const lm = palm();
  extendThumbUp(lm);
  setFinger(lm, 5, false, 0.44);
  setFinger(lm, 9, false, 0.50);
  setFinger(lm, 13, false, 0.56);
  setFinger(lm, 17, false, 0.62);
  return lm;
}

/** B：四指并拢伸直，拇指弯曲。 */
function bHand() {
  const lm = palm();
  curlThumb(lm);
  setFinger(lm, 5, true, 0.44);
  setFinger(lm, 9, true, 0.50);
  setFinger(lm, 13, true, 0.56);
  setFinger(lm, 17, true, 0.62);
  return lm;
}

/** L：拇指侧伸、食指朝上，约直角。 */
function lHand() {
  const lm = palm();
  extendThumbSide(lm);
  setFinger(lm, 5, true, 0.46);
  setFinger(lm, 9, false, 0.52);
  setFinger(lm, 13, false, 0.56);
  setFinger(lm, 17, false, 0.62);
  return lm;
}

/** Y：拇指、小指伸出，其余收起。pointing 探针是 extended[0]=thumb，须朝上。 */
function yHand() {
  const lm = palm();
  extendThumbUp(lm);
  setFinger(lm, 5, false, 0.44);
  setFinger(lm, 9, false, 0.50);
  setFinger(lm, 13, false, 0.56);
  setFinger(lm, 17, true, 0.62);
  return lm;
}

/** I：仅食指伸直朝上（2026-10-01 官方文字转写），其余弯曲，拇指收。 */
function iHand() {
  const lm = palm();
  curlThumb(lm);
  setFinger(lm, 5, true, 0.44);
  setFinger(lm, 9, false, 0.50);
  setFinger(lm, 13, false, 0.56);
  setFinger(lm, 17, false, 0.62);
  return lm;
}

/** J：食指近节直立、远节回勾（hook），其余弯曲，拇指收。 */
function jHand() {
  const lm = palm();
  curlThumb(lm);
  lm[5] = pt(0.44, 0.58);
  lm[6] = pt(0.44, 0.46);
  lm[7] = pt(0.44, 0.34);
  lm[8] = pt(0.54, 0.36); // 远节向掌心侧回勾，joint 角度须低于 EXTENDED_DEG
  setFinger(lm, 9, false, 0.50);
  setFinger(lm, 13, false, 0.56);
  setFinger(lm, 17, false, 0.62);
  return lm;
}

/** W：食指、中指、无名指分开伸直。夹角须明显大于 APART_DEG=24。 */
function wHand() {
  const lm = palm();
  curlThumb(lm);
  setFinger(lm, 5, true, 0.40, 0.22);
  setFinger(lm, 9, true, 0.50, 0.50);
  setFinger(lm, 13, true, 0.60, 0.78);
  setFinger(lm, 17, false, 0.66);
  return lm;
}

function fistHand() {
  const lm = palm();
  curlThumb(lm);
  setFinger(lm, 5, false, 0.44);
  setFinger(lm, 9, false, 0.50);
  setFinger(lm, 13, false, 0.56);
  setFinger(lm, 17, false, 0.62);
  return lm;
}

function codesOf(result) {
  const list = result.audit || result.issues || [];
  return list.map((issue) => issue.code).join("|");
}

// 保持门是按累计时长（PASS_MS=3000ms）而不是帧数放行，默认 13 帧 × 250ms 刚好跨满 3 秒
function holdPass(letter, lm, n = 13) {
  const hold = createHold();
  let last = null;
  for (let i = 0; i < n; i += 1) {
    last = judge({
      letter,
      lm,
      hands: [lm],
      geom: UNIT,
      videoTime: i,
      nowMs: i * 250,
    }, hold);
  }
  return last;
}

let failed = 0;
let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("ok -", name);
  } catch (err) {
    failed += 1;
    console.error("not ok -", name);
    console.error(err);
  }
}

test("practiceStatus 四值且本轮无 accepted_practice", () => {
  const allowed = new Set(["pending_review", "demo_only", "pose_practice", "accepted_practice"]);
  for (const letter of pack.letters) {
    assert.ok(allowed.has(letter.practiceStatus), `${letter.id} ${letter.practiceStatus}`);
    assert.notEqual(letter.practiceStatus, "accepted_practice");
  }
  assert.equal(letterU.practiceStatus, "pending_review");
  for (const letter of [letterV, letterA, letterB, letterL, letterY, letterI, letterW, letterJ, letterZ]) {
    assert.equal(letter.practiceStatus, "pose_practice", letter.id);
  }
  for (const letter of [letterM, letterN, letterS, letterE, letterEH]) {
    assert.equal(letter.practiceStatus, "demo_only", letter.id);
  }
  assert.ok(letterU.rules.curled.includes("thumb"));
  assert.ok(letterV.rules.curled.includes("thumb"));
  assert.deepEqual(letterU.rules.extended, ["index", "middle", "ring", "pinky"]);
  assert.deepEqual(letterV.rules.extended, ["index", "middle"]);
});

test("U 并拢通过", () => {
  const result = evaluate(letterU, uTogetherHand(), UNIT);
  assert.equal(result.pass, true, JSON.stringify(result.audit || result.issues));
  assert.equal((result.audit || result.issues).length, 0);
});

test("V 并拢失败并发出手指分开类 hint", () => {
  const result = evaluate(letterV, uTogetherHand(), UNIT);
  assert.equal(result.pass, false);
  const list = result.audit || result.issues;
  assert.ok(list.length > 0, "应至少有一条 issue");
  const blob = list.map((issue) => `${issue.code} ${issue.hint}`).join("；");
  assert.match(blob, /分开/, `hint 应提到分开，实际：${blob}`);
  assert.match(blob, /index_middle\.not_apart|fingers\.not_spread|食指中指分开/);
});

test("缺手时不误判到位", () => {
  const cases = [null, undefined, [], [pt(0.5, 0.5)], blankHand().slice(0, 8)];
  for (const lm of cases) {
    const result = evaluate(letterU, lm, UNIT);
    assert.equal(result.pass, false, `缺手仍判到位：${JSON.stringify(lm)}`);
    assert.equal(result.issues[0]?.code, "no_hand");
  }
  const noLetter = evaluate(null, uTogetherHand(), UNIT);
  assert.equal(noLetter.pass, false);
  assert.equal(noLetter.issues[0]?.code, "no_hand");
  assert.equal(isReadyToScore({ handCount: 0, conf: 1, lm: uTogetherHand() }), false);
  assert.equal(isReadyToScore({ handCount: 2, conf: 1, lm: uTogetherHand() }), false);
  const out = uTogetherHand().map((p) => ({ x: p.x + 2, y: p.y + 2, z: p.z }));
  assert.equal(isReadyToScore({ handCount: 1, conf: 1, lm: out }), false);
  assert.equal(isReadyToScore({ handCount: 1, conf: 0.2, lm: uTogetherHand() }), false);
});

test("V 真正分开应通过", () => {
  const result = evaluate(letterV, vApartHand(), UNIT);
  assert.equal(result.pass, true, JSON.stringify(result.audit || result.issues));
  assert.equal((result.audit || result.issues).length, 0);
});

test("U 明显分开应失败并出现并拢类 hint", () => {
  const result = evaluate(letterU, vApartHand(), UNIT);
  assert.equal(result.pass, false);
  const list = result.audit || result.issues;
  assert.ok(list.length > 0, "应至少有一条 issue");
  const blob = list.map((issue) => `${issue.code} ${issue.hint}`).join("；");
  assert.match(blob, /并拢/, `hint 应提到并拢，实际：${blob}`);
  assert.match(blob, /index_middle\.not_together|fingers\.not_together|食指中指并拢/);
});

test("A 正例通过", () => {
  const result = evaluate(letterA, aHand(), UNIT);
  assert.equal(result.pass, true, JSON.stringify(result.audit || result.issues));
});

test("B 正例通过", () => {
  const result = evaluate(letterB, bHand(), UNIT);
  assert.equal(result.pass, true, JSON.stringify(result.audit || result.issues));
});

test("L 正例通过", () => {
  const result = evaluate(letterL, lHand(), UNIT);
  assert.equal(result.pass, true, JSON.stringify(result.audit || result.issues));
});

test("Y 正例通过", () => {
  const result = evaluate(letterY, yHand(), UNIT);
  assert.equal(result.pass, true, JSON.stringify(result.audit || result.issues));
});

test("I 正例通过", () => {
  const result = evaluate(letterI, iHand(), UNIT);
  assert.equal(result.pass, true, JSON.stringify(result.audit || result.issues));
});

test("W 正例通过", () => {
  const result = evaluate(letterW, wHand(), UNIT);
  assert.equal(result.pass, true, JSON.stringify(result.audit || result.issues));
});

/** 画面内上下翻转（y -> 1.5 - y）。角度/夹角不变，只有 pointing 的 up 变 down。 */
function upsideDown(lm) {
  return lm.map((p) => pt(p.x, 1.5 - p.y, p.z));
}

test("主路径可练字母必须有 pointing 规则（朝向缺失回归门）", () => {
  for (const letter of [letterA, letterB, letterV, letterL, letterY, letterI, letterW, letterJ]) {
    assert.equal(letter.rules.pointing, "up", `${letter.id} 缺 pointing 规则`);
  }
});

test("指尖朝下不得 pass，hint 提示朝上", () => {
  const cases = [
    ["GF0021.V", letterV, vApartHand()],
    ["GF0021.L", letterL, lHand()],
    ["GF0021.A", letterA, aHand()],
    ["GF0021.B", letterB, bHand()],
    ["GF0021.Y", letterY, yHand()],
    ["GF0021.I", letterI, iHand()],
    ["GF0021.W", letterW, wHand()],
    ["GF0021.J", letterJ, iHand()],
  ];
  for (const [name, letter, lm] of cases) {
    const result = evaluate(letter, upsideDown(lm), UNIT);
    assert.equal(result.pass, false, `${name} 倒置仍 pass`);
    const blob = (result.audit || result.issues).map((issue) => `${issue.code} ${issue.hint}`).join("；");
    assert.match(blob, /pointing\.up/, `${name} 缺 pointing.up：${blob}`);
    assert.match(blob, /指尖朝上/, `${name} 缺中文提示：${blob}`);
  }
});

test("空 rules 不得 pass", () => {
  const result = evaluate({ id: "empty", rules: {} }, vApartHand(), UNIT);
  assert.equal(result.pass, false);
  assert.equal((result.audit || result.issues)[0]?.code, "rules.empty");
  const judged = judge({ letter: { ...letterV, rules: {} }, lm: vApartHand(), hands: [vApartHand()], geom: UNIT, videoTime: 0, nowMs: 0 });
  assert.notEqual(judged.decision, "pass");
  assert.equal(judged.decision, "blocked");
});

test("未知规则字段不得 pass", () => {
  const letter = { id: "x", practiceStatus: "pose_practice", rules: { extended: ["index"], thumb_palm: true } };
  const result = evaluate(letter, vApartHand(), UNIT);
  assert.equal(result.pass, false);
  assert.equal((result.audit || result.issues)[0]?.code, "unsupported_rule");
  const judged = judge({ letter, lm: vApartHand(), hands: [vApartHand()], geom: UNIT, videoTime: 0, nowMs: 0 });
  assert.notEqual(judged.decision, "pass");
  assert.equal(judged.decision, "blocked");
});

test("curled 含未知手指名不得静默放行", () => {
  const letter = { id: "x", practiceStatus: "pose_practice", rules: { extended: ["index"], curled: ["indx"] } };
  const result = evaluate(letter, vApartHand(), UNIT);
  assert.equal(result.pass, false);
  assert.equal(result.ruleStatus, "unsupported");
  assert.equal((result.audit || result.issues)[0]?.code, "unsupported_rule");
});

test("spread 非法值不得静默放行", () => {
  const bad = [
    { spread: "togetherr" },
    { spread: { index_middle: "togetherr" } },
    { spread: { index_midle: "together" } },
    { spread: { thumb_index: "apart" } },
    { spread: {} },
  ];
  for (const rules of bad) {
    const result = evaluate({ id: "x", rules }, vApartHand(), UNIT);
    assert.equal(result.pass, false, JSON.stringify(rules));
    assert.equal(result.ruleStatus, "unsupported", JSON.stringify(rules));
    assert.equal((result.audit || result.issues)[0]?.code, "unsupported_rule");
  }
  // 合法值域不受影响：V 的食指中指分开照样通过
  assert.equal(evaluate({ id: "ok", rules: { spread: "apart" } }, vApartHand(), UNIT).pass, true);
  const judged = judge({
    letter: { id: "x", practiceStatus: "pose_practice", rules: { extended: ["index", "middle"], spread: "togetherr" } },
    lm: vApartHand(), hands: [vApartHand()], geom: UNIT, videoTime: 0, nowMs: 0,
  });
  assert.equal(judged.decision, "blocked");
});

test("pinch 未知手指不得抛 TypeError，且 fail-closed", () => {
  const letter = { id: "x", practiceStatus: "pose_practice", rules: { extended: ["index"], pinch: "indx" } };
  const result = evaluate(letter, vApartHand(), UNIT);
  assert.equal(result.pass, false);
  assert.equal(result.ruleStatus, "unsupported");
  assert.equal((result.audit || result.issues)[0]?.code, "unsupported_rule");
  // 合法 pinch 值域照常进入判定（不做 TypeError 也不被误判 unsupported）
  assert.equal(evaluate({ id: "ok", rules: { pinch: "index" } }, vApartHand(), UNIT).ruleStatus, "ok");
});

test("零长度向量不返回 180/0", () => {
  const p = pt(0.2, 0.2);
  assert.ok(Number.isNaN(angleDeg(p, p, pt(0.3, 0.3))));
  assert.ok(Number.isNaN(vecAngle(0, 0, 1, 0)));
});

test("A01 近阈值 V 同一像素几何：image_normalized 一致，equal_scale_unit 不一致", () => {
  const src = nearThresholdVHand();
  const spread = spreadBetween(src, "index", "middle");
  assert.ok(Math.abs(spread - (APART_DEG + 2)) < 0.5, `spread=${spread} APART_DEG=${APART_DEG}`);
  const pixels = src.map((p) => ({ x: p.x * 640, y: p.y * 480, z: p.z }));
  const n640 = pixels.map((p) => ({ x: p.x / 640, y: p.y / 480, z: p.z }));
  const n1280 = pixels.map((p) => ({ x: p.x / 1280, y: p.y / 720, z: p.z }));
  const a = evaluate(letterV, n640, { width: 640, height: 480, coordSpace: "image_normalized" });
  const b = evaluate(letterV, n1280, { width: 1280, height: 720, coordSpace: "image_normalized" });
  assert.equal(a.pass, b.pass);
  assert.equal(codesOf(a), codesOf(b));
  const uA = evaluate(letterV, n640, { width: 640, height: 480, coordSpace: "equal_scale_unit" });
  const uB = evaluate(letterV, n1280, { width: 1280, height: 720, coordSpace: "equal_scale_unit" });
  assert.notEqual(uA.pass, uB.pass, `equal_scale_unit 两分辨率 pass 应不一致: ${uA.pass} vs ${uB.pass}`);
});

test("A02 几何合格时低 score / 缺 score 不得仅因此 undetermined；缺 presence 不得补 1 通过", () => {
  const lm = vApartHand();
  const holdLow = createHold();
  let low;
  for (let i = 0; i < 13; i += 1) {
    low = judge({
      letter: letterV,
      lm,
      hands: [lm],
      geom: UNIT,
      videoTime: i,
      nowMs: i * 250,
      handedness: { category: "Right", score: 0.05 },
    }, holdLow);
    assert.notEqual(low.decision, "undetermined", "score=0.05 不得仅因此 undetermined");
  }
  assert.equal(low.decision, "pass", "低分也不该挡住几何合格的 V");
  const hold = createHold();
  let last;
  for (let i = 0; i < 13; i += 1) {
    last = judge({
      letter: letterV,
      lm,
      hands: [lm],
      geom: UNIT,
      videoTime: i,
      nowMs: i * 250,
      handedness: { category: "Right" },
    }, hold);
    assert.notEqual(last.decision, "undetermined", "缺 score 不得仅因此 undetermined");
  }
  assert.equal(last.decision, "pass");
  const missing = judge({
    letter: letterV,
    lm: null,
    hands: [],
    geom: UNIT,
    videoTime: 99,
    nowMs: 99,
    handedness: { score: 1 },
  });
  assert.notEqual(missing.decision, "pass");
  assert.equal(missing.decision, "undetermined");
});

test("A03 全0/NaN/指尖出框掌心在框/零骨段 → undetermined，hint 不含伸直/收起来", () => {
  const cases = [];
  cases.push({ name: "allzero", lm: Array.from({ length: 21 }, () => pt(0, 0)) });
  const nanHand = vApartHand();
  nanHand[8] = pt(Number.NaN, 0.2);
  cases.push({ name: "nan", lm: nanHand });
  const infHand = vApartHand();
  infHand[12] = pt(0.4, Number.POSITIVE_INFINITY);
  cases.push({ name: "inf", lm: infHand });
  const oob = vApartHand();
  oob[8] = pt(1.2, 0.22);
  cases.push({ name: "tip_oob", lm: oob });
  const deg = vApartHand();
  deg[6] = pt(deg[5].x, deg[5].y);
  deg[7] = pt(deg[5].x, deg[5].y);
  deg[8] = pt(deg[5].x, deg[5].y);
  cases.push({ name: "zero_bone", lm: deg });

  for (const item of cases) {
    const judged = judge({
      letter: letterV,
      lm: item.lm,
      hands: [item.lm],
      geom: UNIT,
      videoTime: 0,
      nowMs: 0,
    });
    assert.equal(judged.decision, "undetermined", item.name);
    const blob = judged.issues.map((issue) => `${issue.code} ${issue.hint}`).join("；");
    // 无法判断时必须给说明性提示（通用兜底或具体引导），且不得夹带规则层的动作词
    assert.match(blob, /暂时无法判断|画面/, item.name);
    assert.doesNotMatch(blob, /伸直|收起来/);
    assert.equal(judged.issues.some((issue) => /伸直|收起来/.test(issue.hint || "")), false);
    assert.ok(judged.quality.ok === false);
  }
  assert.equal(QUALITY_HINT, "暂时无法判断");
});

test("A10 手太小（如凑到下巴边）→ undetermined / hand_too_small，不得进入规则判定", () => {
  // 归一化坐标向腕点收缩 0.25：腕-掌距离缩到画面短边的约 0.08 倍，低于 0.1 门限
  const geom = { width: 640, height: 480, coordSpace: "image_normalized" };
  const tiny = vApartHand();
  const wrist = tiny[0];
  const small = tiny.map((p) => pt(wrist.x + (p.x - wrist.x) * 0.25, wrist.y + (p.y - wrist.y) * 0.25, p.z));

  const direct = assessInputQuality({ hands: [small], geom, letter: letterV });
  assert.equal(direct.ok, false);
  assert.equal(direct.reason, "hand_too_small");

  const judged = judge(
    { letter: letterV, lm: small, hands: [small], geom, videoTime: 0, nowMs: 0 },
    createHold(),
  );
  assert.equal(judged.decision, "undetermined");
  assert.equal(judged.quality.reason, "hand_too_small");
  assert.equal(judged.issues[0].hint, HAND_TOO_SMALL_HINT);
  assert.equal(presentJudge(judged).title, "手太小了");

  // 同一只手不缩放：腕-掌距离约为画面短边的 0.32 倍，照常进入判定
  const normal = assessInputQuality({ hands: [vApartHand()], geom, letter: letterV });
  assert.equal(normal.ok, true, JSON.stringify(normal));
});

test("A11 无手/双手/指尖出框 → undetermined，各自给出引导文案", () => {
  const geom = { width: 640, height: 480, coordSpace: "image_normalized" };

  const none = assessInputQuality({ hands: [], geom, letter: letterV });
  assert.equal(none.reason, "no_hand");
  const judgedNone = judge(
    { letter: letterV, lm: [], hands: [], geom, videoTime: 0, nowMs: 0 },
    createHold(),
  );
  assert.equal(judgedNone.decision, "undetermined");
  assert.equal(presentJudge(judgedNone).title, "没看到手");
  assert.match(judgedNone.issues[0].hint, /摄像头|画面/);

  const two = assessInputQuality({ hands: [vApartHand(), vApartHand()], geom, letter: letterV });
  assert.equal(two.reason, "two_hands");
  const judgedTwo = judge(
    { letter: letterV, lm: vApartHand(), hands: [vApartHand(), vApartHand()], geom, videoTime: 0, nowMs: 0 },
    createHold(),
  );
  assert.equal(judgedTwo.decision, "undetermined");
  assert.equal(presentJudge(judgedTwo).title, "画面里有两只手");
  assert.match(judgedTwo.issues[0].hint, /一只手/);

  // 食指尖推出画面（V 的 pointing 探针是食指）
  const oob = vApartHand();
  oob[8] = pt(1.2, 0.5, 0);
  const oobQ = assessInputQuality({ hands: [oob], geom, letter: letterV });
  assert.equal(oobQ.reason, "fingertip_oob");
  const judgedOob = judge(
    { letter: letterV, lm: oob, hands: [oob], geom, videoTime: 0, nowMs: 0 },
    createHold(),
  );
  assert.equal(judgedOob.decision, "undetermined");
  assert.equal(presentJudge(judgedOob).title, "手指出画面了");
  assert.match(judgedOob.issues[0].hint, /画面/);
});

test("A04 U/V 拇指伸直负例不得 geometry pass", () => {
  const uBad = uTogetherHand();
  extendThumbSide(uBad);
  const vBad = vApartHand();
  extendThumbSide(vBad);
  const uRes = evaluate(letterU, uBad, UNIT);
  const vRes = evaluate(letterV, vBad, UNIT);
  assert.equal(uRes.pass, false, JSON.stringify(uRes.audit || uRes.issues));
  assert.equal(vRes.pass, false, JSON.stringify(vRes.audit || vRes.issues));
  const blob = (uRes.audit || uRes.issues).map((issue) => issue.code).join("|");
  assert.match(blob, /thumb\.not_curled/);
});

test("A05 结构检查（非浏览器行为）：镜像下 .live-verdict 不得 scaleX(-1)", () => {
  const css = readFileSync(join(root, "../styles.css"), "utf8");
  assert.doesNotMatch(css, /\.stage\[data-mirror="true"\]\s*\.live-verdict\s*\{[^}]*scaleX\(-1\)/);
  const verdictBlock = css.match(/\.live-verdict\s*\{[^}]*\}/g) || [];
  for (const block of verdictBlock) {
    assert.doesNotMatch(block, /scaleX\(-1\)/);
  }
});

test("A06 passState 保持满 3 秒开放；中断/超时归零；同一 videoTime 不双计", () => {
  // 25 帧 × 120ms = 累计 3000ms，应放行
  const hold = makeHold();
  for (let i = 0; i <= 25; i += 1) {
    observePass(hold, { ok: true, videoTime: i, nowMs: i * 120 });
  }
  assert.equal(hold.frames, 26);
  assert.equal(hold.elapsedMs, 3000);
  assert.equal(holdReady(hold), true);

  // 时长不足不放行：6 帧 × 100ms 只有 500ms
  const holdShort = makeHold();
  for (let i = 0; i < 6; i += 1) {
    observePass(holdShort, { ok: true, videoTime: i, nowMs: i * 100 });
  }
  assert.equal(holdShort.frames, 6);
  assert.equal(holdShort.elapsedMs, 500);
  assert.equal(holdReady(holdShort), false);

  // ok=false 清零，重新累计
  const hold2 = makeHold();
  for (let i = 0; i < 5; i += 1) {
    observePass(hold2, { ok: true, videoTime: i, nowMs: i * 30 });
  }
  observePass(hold2, { ok: false, videoTime: 5, nowMs: 150 });
  assert.equal(hold2.frames, 0);
  assert.equal(hold2.elapsedMs, 0);
  observePass(hold2, { ok: true, videoTime: 6, nowMs: 180 });
  assert.equal(hold2.frames, 1);
  assert.equal(holdReady(hold2), false);

  const hold3 = makeHold();
  observePass(hold3, { ok: true, videoTime: 1, nowMs: 0 });
  observePass(hold3, { ok: true, videoTime: 1, nowMs: 10 });
  assert.equal(hold3.frames, 1);

  const hold4 = makeHold();
  observePass(hold4, { ok: true, videoTime: 0, nowMs: 0 });
  observePass(hold4, { ok: true, videoTime: 1, nowMs: 401 });
  assert.equal(hold4.frames, 1);
  resetHold(hold4);
  assert.equal(hold4.frames, 0);
});

test("A07 无手不可导出；切目标序列化仍为 U；缺 imageWidth 拒绝", () => {
  const lm = uTogetherHand();
  const built = createSnapshot({
    imageWidth: 640,
    imageHeight: 480,
    targetLetterId: "GF0021.U",
    landmarks: lm,
    coordSpace: "image_normalized",
    mirrored: true,
    sourceType: "camera",
  });
  assert.equal(built.ok, true);
  const switched = serializeSnapshot(built.snapshot);
  assert.equal(switched.targetLetterId, "GF0021.U");
  assert.equal(canExportSnapshot(built.snapshot, {
    currentLetterId: "GF0021.V",
    hasHand: true,
    qualityOk: true,
    handCount: 1,
  }), false);
  assert.equal(canExportSnapshot(built.snapshot, { hasHand: false, qualityOk: true, handCount: 0 }), false);
  assert.equal(canExportSnapshot(null, { hasHand: false }), false);
  assert.equal(canExportSnapshot(null, {
    currentLetterId: "GF0021.U",
    hasHand: true,
    qualityOk: true,
    handCount: 1,
  }), false);
  const nosize = createSnapshot({
    imageHeight: 480,
    targetLetterId: "GF0021.U",
    landmarks: lm,
  });
  assert.equal(nosize.ok, false);
  assert.equal(nosize.snapshot, null);
  const keys = Object.keys(switched);
  assert.equal(keys.includes("expectedVerdict"), false);
  assert.equal(keys.includes("pass"), false);
  assert.equal(keys.includes("decision"), false);
  assert.equal(keys.includes("practiceStatus"), false);
});

test("DS-R3 createSnapshot 拒绝 verdict 类伪标签字段（不是静默忽略）", () => {
  const lm = uTogetherHand();
  const base = {
    imageWidth: 640,
    imageHeight: 480,
    targetLetterId: "GF0021.U",
    landmarks: lm,
    coordSpace: "image_normalized",
  };
  for (const bad of ["expectedVerdict", "pass", "decision", "practiceStatus", "conf", "t"]) {
    const built = createSnapshot({ ...base, [bad]: true });
    assert.equal(built.ok, false, `createSnapshot must reject ${bad}`);
    assert.equal(built.reason, "forbidden_field");
    assert.equal(built.snapshot, null);
  }
  const clean = createSnapshot(base);
  assert.equal(clean.ok, true);
});

test("DS-R4 holdView 透出保持门阈值；judge 出口携带 passMs/maxGapMs", () => {
  const hold = makeHold();
  const view = observePass(hold, { ok: true, videoTime: 0, nowMs: 0 });
  assert.equal(view.passMs, 3000);
  assert.equal(view.maxGapMs, 400);
  const judged = judge(
    { letter: letterV, hands: [vApartHand()], geom: UNIT, videoTime: 0, nowMs: 0 },
    makeHold(),
  );
  assert.equal(judged.hold.passMs, 3000);
  assert.equal(judged.hold.maxGapMs, 400);
});

test("A09 stopCamera / track.stop 可调用", () => {
  let stopped = 0;
  const video = {
    srcObject: {
      getTracks() {
        return [{ stop() { stopped += 1; } }, { stop() { stopped += 1; } }];
      },
    },
  };
  assert.equal(typeof stopCamera, "function");
  stopCamera(video);
  assert.equal(stopped, 2);
  assert.equal(video.srcObject, null);
});

test("能力：M/N/S 同一握拳不得 decision=pass", () => {
  const fist = fistHand();
  for (const letter of [letterM, letterN, letterS]) {
    const judged = holdPass(letter, fist, 8);
    assert.notEqual(judged.decision, "pass", letter.id);
  }
});

test("能力：U 几何通过不得 decision=pass", () => {
  const geom = evaluate(letterU, uTogetherHand(), UNIT);
  assert.equal(geom.pass, true);
  const judged = holdPass(letterU, uTogetherHand(), 8);
  assert.notEqual(judged.decision, "pass");
  assert.equal(judged.decision, "blocked");
  const view = presentJudge(judged);
  assert.match(view.title, /暂不判定/);
  assert.doesNotMatch(`${view.title}${view.hint}`, /到位/);
});

test("U 四指裁定后规则与 B 相同（词汇层不可区分，由 pending_review 兜底，升格前需掌心朝向能力）", () => {
  assert.deepEqual(letterU.rules, letterB.rules);
  assert.equal(letterU.practiceStatus, "pending_review");
});

test("能力：J 几何通过不得写成完整掌握", () => {
  const geom = evaluate(letterJ, jHand(), UNIT);
  assert.equal(geom.pass, true, JSON.stringify(geom.audit || geom.issues));
  const judged = holdPass(letterJ, jHand());
  const view = presentJudge(judged);
  const blob = `${view.title} ${view.hint}`;
  assert.doesNotMatch(blob, /完整掌握|字母已掌握|完整 J|已会/);
  if (judged.decision === "pass") {
    assert.equal(view.title, "做对了，保持住");
  }
});

test("J 静态判定：食指回勾保持后 pass（hook 规则回归）", () => {
  const judged = holdPass(letterJ, jHand());
  assert.equal(judged.decision, "pass", JSON.stringify(judged));
  assert.equal(presentJudge(judged).title, "做对了，保持住");
});

test("J 判定 fail-closed：食指伸直（I 手型）不得 pass", () => {
  const geom = evaluate(letterJ, iHand(), UNIT);
  assert.equal(geom.pass, false);
  assert.match(codesOf(geom), /index\.not_hooked/);
  const judged = holdPass(letterJ, iHand(), 6);
  assert.notEqual(judged.decision, "pass");
});

test("J 判定 fail-closed：全握拳不得 pass", () => {
  const geom = evaluate(letterJ, fistHand(), UNIT);
  assert.equal(geom.pass, false);
});

test("pose_practice V 连续保持后 decision=pass，文案不是到位/掌握", () => {
  const judged = holdPass(letterV, vApartHand());
  assert.equal(judged.decision, "pass");
  const view = presentJudge(judged);
  assert.equal(view.title, "做对了，保持住");
  assert.doesNotMatch(`${view.title}${view.hint}`, /到位|字母已掌握|完整掌握/);
  const failView = presentJudge({
    decision: "fail",
    practiceStatus: "pose_practice",
    issues: [{ code: "fingers.not_spread", hint: "食指中指分开" }],
  });
  assert.equal(failView.title, "对照左边改动作");
  assert.doesNotMatch(`${failView.title}${failView.hint}`, /还不到位|到位|掌握/);
});

const fixturesDir = join(root, "fixtures");

function sourceFn(src, name) {
  const start = src.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed ${name}`);
}

test("A08 枚举真实输入：schema 与共享核心冒烟，不计算标签准确性", () => {
  const jsonFiles = readdirSync(fixturesDir, { recursive: true }).filter(name => name.toLowerCase().endsWith(".json"));
  console.log(`fixtures: ${jsonFiles.length} JSON；${jsonFiles.length === 0 ? "真人未执行" : "仅输入/schema/共享核心冒烟，非真人准确性评测"}`);
  for (const name of jsonFiles) {
    const frame = JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
    assert.equal(frame.schemaVersion, 2, name);
    assert.equal(frame.coordSpace, "image_normalized", name);
    assert.ok(Number.isFinite(frame.capturedAt) && frame.capturedAt >= 0, name);
    assert.ok(Number.isSafeInteger(frame.frameId) && frame.frameId >= 0, name);
    assert.equal(typeof frame.mirrored, "boolean", name);
    for (const key of ["targetLetterId", "sourceType", "codeVersion", "rulesVersion"]) assert.ok(typeof frame[key] === "string" && frame[key].length > 0, `${name}: ${key}`);
    assert.ok(frame.handedness && typeof frame.handedness.category === "string", name);
    for (const key of ["expectedVerdict", "pass", "decision", "practiceStatus"]) assert.equal(Object.hasOwn(frame, key), false, `${name}: capture is not a label`);
    assert.equal(createSnapshot(frame).ok, true, name);
    const letter = byId[frame.targetLetterId];
    assert.ok(letter, `${name}: unknown target`);
    const geom = { width: frame.imageWidth, height: frame.imageHeight, coordSpace: frame.coordSpace };
    const result = evaluate(letter, frame.landmarks, geom);
    assert.equal(typeof result.pass, "boolean");
    assert.ok(Array.isArray(result.issues) && Array.isArray(result.audit));
    // A single frame cannot certify continuous pass. No independent labels are consumed here.
    const single = judge({ letter, hands: [frame.landmarks], geom, videoTime: 0, nowMs: 0 }, createHold());
    assert.ok(["fail", "undetermined", "blocked"].includes(single.decision), name);
    if (!result.pass) assert.notEqual(single.decision, "pass", name);
  }
});

test("结构检查（非行为）：app/旧离线入口接线", () => {
  const app = readFileSync(join(root, "../app.js"), "utf8");
  assert.match(sourceFn(app, "stopLive"), /presentLetterIdle/);
  assert.match(sourceFn(app, "selectLetter"), /lastSnapshot = null/);
  assert.doesNotMatch(app, /无摄像头模式/);
  const evalHf = readFileSync(join(root, "eval-handframe.mjs"), "utf8");
  assert.match(evalHf, /missing_size/);
  assert.doesNotMatch(evalHf, /equal_scale_unit/);
  const runPy = readFileSync(join(root, "render-loop/run.py"), "utf8");
  assert.doesNotMatch(runPy, /"conf": conf/);
  assert.match(runPy, /imageWidth/);
  assert.match(runPy, /geometry_pass/);
});

test("R1 rot 索引解析：合法映射、垃圾输入回退空", () => {
  const good = parseRotIndex({ frames: 24, letters: { "GF0021.A": true, "GF0021.U": false } });
  assert.equal(good.get("GF0021.A"), 24);
  assert.equal(good.has("GF0021.U"), false, "非 true 的字母不得启用旋转");
  for (const bad of [null, undefined, {}, { frames: "24" }, { frames: 2, letters: { A: true } }, { frames: 24, letters: null }]) {
    assert.equal(parseRotIndex(bad).size, 0, JSON.stringify(bad));
  }
});

test("R2 帧 URL 取模回绕，非法输入给空串", () => {
  assert.equal(rotFrameUrl("GF0021.A", 0, 24), "./content/demos/rot/GF0021.A/00.webp");
  assert.equal(rotFrameUrl("GF0021.A", -1, 24), "./content/demos/rot/GF0021.A/23.webp");
  assert.equal(rotFrameUrl("GF0021.A", 25, 24), "./content/demos/rot/GF0021.A/01.webp");
  assert.equal(rotFrameUrl("GF0021.A", 1.5, 24), "");
  assert.equal(rotFrameUrl("GF0021.A", 0, 0), "");
});

test("R3 拖动位移换算：拖满宽度=半圈，右拖帧号增大，非法宽度回起始帧", () => {
  assert.equal(frameForDrag({ dx: 0, width: 240, frames: 24, startFrame: 0 }), 0);
  assert.equal(frameForDrag({ dx: 240, width: 240, frames: 24, startFrame: 0 }), 12);
  assert.equal(frameForDrag({ dx: -20, width: 240, frames: 24, startFrame: 0 }), 23, "左拖回绕");
  assert.equal(frameForDrag({ dx: 20, width: 240, frames: 24, startFrame: 23 }), 0, "右拖回绕");
  assert.equal(frameForDrag({ dx: 500, width: 0, frames: 24, startFrame: 7 }), 7);
  assert.equal(frameForDrag({ dx: Number.NaN, width: 240, frames: 24, startFrame: 3 }), 3);
  assert.equal(stepFrame(23, 1, 24), 0);
  assert.equal(stepFrame(0, -1, 24), 23);
  // 左手帧是右手的水平镜像，镜像后表面运动方向反转，dx/步进取反保持跟手。
  assert.equal(frameForDrag({ dx: 240, width: 240, frames: 24, startFrame: 0, hand: "left" }), 12, "左手拖满宽度仍是半圈");
  assert.equal(frameForDrag({ dx: 20, width: 240, frames: 24, startFrame: 23, hand: "left" }), 22, "左手右拖帧号减小（镜像帧序列）");
  assert.equal(frameForDrag({ dx: -20, width: 240, frames: 24, startFrame: 0, hand: "left" }), 1, "左手左拖帧号增大");
  assert.equal(stepFrame(0, 1, 24, "left"), 23, "左手键盘步进取反");
  assert.equal(stepFrame(0, -1, 24, "left"), 1);
});

test("R4 attachRotator 拖动/键盘驱动换帧，detach 完整还原", () => {
  const listeners = new Map();
  const stage = {
    dataset: {},
    clientWidth: 240,
    attrs: {},
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    setAttribute(k, v) { this.attrs[k] = v; },
    removeAttribute(k) { delete this.attrs[k]; },
    setPointerCapture() {},
  };
  const image = { src: "", alt: "" };
  const detach = attachRotator({ stage, image, letterId: "GF0021.A", frames: 24, alt: "字母A标准手示范图" });
  assert.equal(typeof detach, "function");
  assert.equal(stage.dataset.rot, "true");
  assert.equal(stage.attrs.role, "slider");
  assert.equal(stage.attrs.tabindex, "0");

  listeners.get("pointerdown")({ pointerId: 1, clientX: 100 });
  listeners.get("pointermove")({ clientX: 140 });
  assert.equal(image.src, "./content/demos/rot/GF0021.A/02.webp");
  assert.equal(stage.dataset.rotFrame, "2");
  assert.match(image.alt, /已旋转/);
  listeners.get("pointerup")({});

  let prevented = 0;
  listeners.get("keydown")({ key: "ArrowRight", preventDefault() { prevented += 1; } });
  assert.equal(image.src, "./content/demos/rot/GF0021.A/03.webp");
  assert.equal(prevented, 1);
  listeners.get("keydown")({ key: "ArrowLeft", preventDefault() { prevented += 1; } });
  listeners.get("keydown")({ key: "ArrowLeft", preventDefault() { prevented += 1; } });
  listeners.get("keydown")({ key: "ArrowLeft", preventDefault() { prevented += 1; } });
  assert.equal(image.src, "./content/demos/rot/GF0021.A/00.webp", "回到正面");
  assert.equal(image.alt, "字母A标准手示范图", "正面帧恢复原 alt");
  listeners.get("keydown")({ key: "Enter", preventDefault() { prevented += 1; } });
  assert.equal(prevented, 4, "非方向键不拦截");

  listeners.get("pointermove")({ clientX: 500 });
  assert.equal(image.src, "./content/demos/rot/GF0021.A/00.webp", "未按下时移动不换帧");

  detach();
  assert.equal(listeners.size, 0);
  assert.equal(stage.dataset.rot, undefined);
  assert.equal(stage.attrs.role, undefined);
});

test("R5 无旋转帧的字母 attachRotator 返回 null 且不改 stage", () => {
  const stage = { dataset: {}, addEventListener() { throw new Error("不应监听"); } };
  assert.equal(attachRotator({ stage, image: {}, letterId: "GF0021.U", frames: 0, alt: "" }), null);
  assert.equal(attachRotator({ stage: null, image: {}, letterId: "GF0021.A", frames: 24, alt: "" }), null);
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}

console.log(`\n${passed} passed`);
