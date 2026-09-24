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
const imageWidth = frame?.imageWidth;
const imageHeight = frame?.imageHeight;
const hasSize =
  typeof imageWidth === "number" &&
  Number.isFinite(imageWidth) &&
  imageWidth > 0 &&
  typeof imageHeight === "number" &&
  Number.isFinite(imageHeight) &&
  imageHeight > 0;
if (!hasSize) {
  console.log("geometry_pass false");
  console.log("missing_size");
  process.exit(0);
}

const lm = Array.isArray(frame?.landmarks) ? frame.landmarks : null;
const geom = {
  width: imageWidth,
  height: imageHeight,
  imageWidth,
  imageHeight,
  coordSpace: frame?.coordSpace || "image_normalized",
};
const result = evaluate(letter, lm, geom);
const audit = result.audit || result.issues || [];

console.log(`geometry_pass ${result.pass}`);
console.log(`ruleStatus ${result.ruleStatus || ""}`);
if (Object.prototype.hasOwnProperty.call(frame || {}, "expectedVerdict")) {
  console.log("expectedVerdict ignored; not a pass label");
}
for (const issue of audit) {
  console.log(`${issue.code} ${issue.hint}`);
}
