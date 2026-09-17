import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "./evaluate.js";

const root = dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(readFileSync(join(root, "../content/letters.json"), "utf8"));
const byId = Object.fromEntries((pack.letters || []).map((letter) => [letter.id, letter]));
const letterU = byId["GF0021.U"];
const letterV = byId["GF0021.V"];

assert.ok(letterU && letterV, "letters.json 必须包含 GF0021.U 和 GF0021.V");

function pt(x, y, z = 0) {
  return { x, y, z };
}

function blankHand() {
  return Array.from({ length: 21 }, () => pt(0.5, 0.5));
}

function setFinger(lm, mcp, extended, x) {
  const mcpY = 0.58;
  lm[mcp] = pt(x, mcpY);
  if (extended) {
    lm[mcp + 1] = pt(x, mcpY - 0.12);
    lm[mcp + 2] = pt(x, mcpY - 0.24);
    lm[mcp + 3] = pt(x, mcpY - 0.36);
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

let failed = 0;

function test(name, fn) {
  try {
    fn();
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
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}

console.log("\n3 passed");
