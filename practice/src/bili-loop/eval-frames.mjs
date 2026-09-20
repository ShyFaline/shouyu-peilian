/** 对 bili-loop 帧 JSON 调现有 evaluate。不改阈值、不改 letters.json。 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "../evaluate.js";

const here = dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(readFileSync(join(here, "../../content/letters.json"), "utf8"));
const byId = Object.fromEntries((pack.letters || []).map((letter) => [letter.id, letter]));

const jsonPath = process.argv[2];
const outPath = process.argv[3] || jsonPath;
if (!jsonPath) {
  console.error("bun practice/src/bili-loop/eval-frames.mjs <json路径> [输出路径]");
  process.exit(1);
}

const letterU = byId["GF0021.U"];
const letterV = byId["GF0021.V"];
if (!letterU || !letterV) {
  console.error("letters.json 缺少 GF0021.U 或 GF0021.V");
  process.exit(1);
}

const data = JSON.parse(readFileSync(jsonPath, "utf8"));

function packResult(result) {
  return {
    pass: Boolean(result.pass),
    issues: (result.issues || []).map((issue) => issue.code),
  };
}

for (const frame of data.frames || []) {
  const lm = Array.isArray(frame.landmarks) && frame.landmarks.length >= 21 ? frame.landmarks : null;
  if (!lm) {
    frame.u_pass = false;
    frame.v_pass = false;
    frame.u_issues = ["no_hand"];
    frame.v_issues = ["no_hand"];
    delete frame.letter_pass;
    delete frame.letter_issues;
    continue;
  }

  const labeledId = typeof frame.letter_id === "string" ? frame.letter_id : "";
  const labeled = labeledId && byId[labeledId] ? byId[labeledId] : null;
  if (labeled) {
    const judged = packResult(evaluate(labeled, lm));
    frame.letter_pass = judged.pass;
    frame.letter_issues = judged.issues;
  } else {
    delete frame.letter_id;
    delete frame.letter_pass;
    delete frame.letter_issues;
  }

  const u = packResult(evaluate(letterU, lm));
  const v = packResult(evaluate(letterV, lm));
  frame.u_pass = u.pass;
  frame.v_pass = v.pass;
  frame.u_issues = u.issues;
  frame.v_issues = v.issues;
}

writeFileSync(outPath, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`wrote ${outPath}`);
