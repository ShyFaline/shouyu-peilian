import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "./evaluate.js";

const root = dirname(fileURLToPath(import.meta.url));
const jsonPath = process.argv[2];
const letterId = process.argv[3];

if (!jsonPath || !letterId) {
  console.error("bun practice/src/eval-handframe.mjs <json路径> <字母ID>");
  process.exit(1);
}

const pack = JSON.parse(readFileSync(join(root, "../content/letters.json"), "utf8"));
const letter = (pack.letters || []).find((item) => item.id === letterId) || null;
let frame = null;
try {
  frame = JSON.parse(readFileSync(jsonPath, "utf8"));
} catch {
  frame = null;
}
const lm = Array.isArray(frame?.landmarks) ? frame.landmarks : null;
const result = evaluate(letter, lm);

console.log(`pass ${result.pass}`);
for (const issue of result.issues) {
  console.log(`${issue.code} ${issue.hint}`);
}
