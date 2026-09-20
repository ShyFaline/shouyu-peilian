import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate, isReadyToScore } from "./evaluate.js";

const root = dirname(fileURLToPath(import.meta.url));
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

/** 食指中指并拢伸直朝上，无名指小指收起。用来当 U 的正例、V 的反例。 */
function uTogetherHand() {
  const lm = blankHand();
  lm[0] = pt(0.5, 0.9);
  lm[1] = pt(0.4, 0.8);
  lm[2] = pt(0.38, 0.7);
  lm[3] = pt(0.4, 0.74);
  lm[4] = pt(0.42, 0.78);
  setFinger(lm, 5, true, 0.46);
  setFinger(lm, 9, true, 0.5);
  setFinger(lm, 13, false, 0.56);
  setFinger(lm, 17, false, 0.62);
  return lm;
}

/** 食指中指明显分开伸直朝上。用来当 V 的正例、U 的反例。 */
function vApartHand() {
  const lm = blankHand();
  lm[0] = pt(0.5, 0.9);
  lm[1] = pt(0.4, 0.8);
  lm[2] = pt(0.38, 0.7);
  lm[3] = pt(0.4, 0.74);
  lm[4] = pt(0.42, 0.78);
  setFinger(lm, 5, true, 0.44, 0.32);
  setFinger(lm, 9, true, 0.52, 0.64);
  setFinger(lm, 13, false, 0.56);
  setFinger(lm, 17, false, 0.62);
  return lm;
}

function palm() {
  const lm = blankHand();
  lm[0] = pt(0.5, 0.9);
  return lm;
}

function curlThumb(lm) {
  lm[1] = pt(0.42, 0.82);
  lm[2] = pt(0.36, 0.74);
  lm[3] = pt(0.40, 0.70);
  lm[4] = pt(0.44, 0.76);
}

function extendThumbSide(lm) {
  lm[1] = pt(0.42, 0.80);
  lm[2] = pt(0.38, 0.70);
  lm[3] = pt(0.28, 0.70);
  lm[4] = pt(0.18, 0.70);
}

/** A：握拳，拇指伸出。 */
function aHand() {
  const lm = palm();
  extendThumbSide(lm);
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

/** Y：拇指、小指伸出，其余收起。 */
function yHand() {
  const lm = palm();
  extendThumbSide(lm);
  setFinger(lm, 5, false, 0.44);
  setFinger(lm, 9, false, 0.50);
  setFinger(lm, 13, false, 0.56);
  setFinger(lm, 17, true, 0.62);
  return lm;
}

/** I：小指伸直，其余握拳。 */
function iHand() {
  const lm = palm();
  curlThumb(lm);
  setFinger(lm, 5, false, 0.44);
  setFinger(lm, 9, false, 0.50);
  setFinger(lm, 13, false, 0.56);
  setFinger(lm, 17, true, 0.62);
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

test("U 并拢通过", () => {
  const result = evaluate(letterU, uTogetherHand());
  assert.equal(result.pass, true, JSON.stringify(result.issues));
  assert.equal(result.issues.length, 0);
});

test("V 并拢失败并发出手指分开类 hint", () => {
  const result = evaluate(letterV, uTogetherHand());
  assert.equal(result.pass, false);
  assert.ok(result.issues.length > 0, "应至少有一条 issue");
  const blob = result.issues.map((issue) => `${issue.code} ${issue.hint}`).join("；");
  assert.match(blob, /分开/, `hint 应提到分开，实际：${blob}`);
  assert.match(blob, /index_middle\.not_apart|fingers\.not_spread|食指中指分开/);
});

test("缺手时不误判到位", () => {
  const cases = [null, undefined, [], [pt(0.5, 0.5)], blankHand().slice(0, 8)];
  for (const lm of cases) {
    const result = evaluate(letterU, lm);
    assert.equal(result.pass, false, `缺手仍判到位：${JSON.stringify(lm)}`);
    assert.equal(result.issues[0]?.code, "no_hand");
  }
  const noLetter = evaluate(null, uTogetherHand());
  assert.equal(noLetter.pass, false);
  assert.equal(noLetter.issues[0]?.code, "no_hand");
  assert.equal(isReadyToScore({ handCount: 0, conf: 1, lm: uTogetherHand() }), false);
  assert.equal(isReadyToScore({ handCount: 2, conf: 1, lm: uTogetherHand() }), false);
  const out = uTogetherHand().map((p) => ({ x: p.x + 2, y: p.y + 2, z: p.z }));
  assert.equal(isReadyToScore({ handCount: 1, conf: 1, lm: out }), false);
  assert.equal(isReadyToScore({ handCount: 1, conf: 0.2, lm: uTogetherHand() }), false);
});

test("V 真正分开应通过", () => {
  const result = evaluate(letterV, vApartHand());
  assert.equal(result.pass, true, JSON.stringify(result.issues));
  assert.equal(result.issues.length, 0);
});

test("U 明显分开应失败并出现并拢类 hint", () => {
  const result = evaluate(letterU, vApartHand());
  assert.equal(result.pass, false);
  assert.ok(result.issues.length > 0, "应至少有一条 issue");
  const blob = result.issues.map((issue) => `${issue.code} ${issue.hint}`).join("；");
  assert.match(blob, /并拢/, `hint 应提到并拢，实际：${blob}`);
  assert.match(blob, /index_middle\.not_together|fingers\.not_together|食指中指并拢/);
});

test("A 正例通过", () => {
  const result = evaluate(letterA, aHand());
  assert.equal(result.pass, true, JSON.stringify(result.issues));
});

test("B 正例通过", () => {
  const result = evaluate(letterB, bHand());
  assert.equal(result.pass, true, JSON.stringify(result.issues));
});

test("L 正例通过", () => {
  const result = evaluate(letterL, lHand());
  assert.equal(result.pass, true, JSON.stringify(result.issues));
});

test("Y 正例通过", () => {
  const result = evaluate(letterY, yHand());
  assert.equal(result.pass, true, JSON.stringify(result.issues));
});

test("I 正例通过", () => {
  const result = evaluate(letterI, iHand());
  assert.equal(result.pass, true, JSON.stringify(result.issues));
});

test("W 正例通过", () => {
  const result = evaluate(letterW, wHand());
  assert.equal(result.pass, true, JSON.stringify(result.issues));
});

const fixturesDir = join(root, "fixtures");

function listHandFrameFiles() {
  let names;
  try {
    names = readdirSync(fixturesDir);
  } catch {
    return [];
  }
  return names.filter((name) => name.endsWith(".json"));
}

function letterFromFixtureName(name) {
  const match = name.match(/GF0021\.[A-Za-z]+/);
  if (match && byId[match[0]]) return byId[match[0]];
  return letterU;
}

function loadHandFrame(filePath) {
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  assert.equal(typeof raw.t, "number", `${filePath}: t 必须是数字`);
  assert.equal(typeof raw.handedness, "string", `${filePath}: handedness 必须是字符串`);
  assert.ok(raw.handedness.length > 0, `${filePath}: handedness 不能为空`);
  assert.ok(Array.isArray(raw.landmarks) && raw.landmarks.length === 21, `${filePath}: landmarks 必须长度 21`);
  for (let i = 0; i < 21; i += 1) {
    const p = raw.landmarks[i];
    assert.equal(typeof p?.x, "number", `${filePath}: landmarks[${i}].x`);
    assert.equal(typeof p?.y, "number", `${filePath}: landmarks[${i}].y`);
  }
  assert.equal(typeof raw.conf, "number", `${filePath}: conf 必须是数字`);
  return raw;
}

test("fixtures 目录可空；若有 HandFrame JSON 则读取并调用 evaluate", () => {
  const files = listHandFrameFiles();
  for (const name of files) {
    const frame = loadHandFrame(join(fixturesDir, name));
    const result = evaluate(letterFromFixtureName(name), frame.landmarks);
    assert.equal(typeof result.pass, "boolean");
    assert.ok(Array.isArray(result.issues));
  }
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}

console.log(`\n${passed} passed`);
