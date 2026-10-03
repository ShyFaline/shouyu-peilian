/**
 * 生成期意图校验。对每条「声明为正确姿态」的单帧样本跑一次核心 evaluate()，
 * 复核生成物是否真的达到声明意图；不达即报错并非零退出。
 *
 * 意图来源（按优先级）：
 *   1. labels.json 的 geometry 标签（权威真值层）：correct 必须 pass，incorrect 必须
 *      fail 且命中它声明的 expectedIssueCodes；
 *   2. 无标签样本回落到它自己的 _synthetic.intent 声明（「几何正例」/「几何负例」），
 *      这样 pending_review 等不进标签分母的夹具（如 U）也能被护栏覆盖。
 *
 * 本文件只 import 核心，不复制任何国标规则、角度阈值或分类逻辑。
 * 单独运行：node tools/assessment/samples/verify-samples.mjs [dir]
 * generate-synthetic.mjs 写完产物后会调用 verifySamples()，规则一变、生成即失败，
 * 防止夹具再次静默漂移。
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { evaluate, geomOf, loadLetters } from "../lib/core.mjs";
import { loadSamples } from "../lib/replay.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SYNTHETIC_DIR = join(HERE, "synthetic");

/** 无标签时按 _synthetic.intent 里的声明认意图；认不出返回 null（跳过）。 */
function intentFromText(text) {
  const s = String(text ?? "");
  if (s.includes("几何正例")) return "pass";
  if (s.includes("几何负例")) return "fail";
  return null;
}

/**
 * @param {{ dir?: string, root?: string }} [opts]
 * @returns {{ ok: boolean, checked: number, skipped: number, failures: string[] }}
 */
export function verifySamples({ dir = SYNTHETIC_DIR, root } = {}) {
  const letters = loadLetters(root);
  const labelPath = join(dir, "labels.json");
  let labels = [];
  try {
    labels = JSON.parse(readFileSync(labelPath, "utf8")).labels ?? [];
  } catch {
    labels = [];
  }
  const labelById = new Map(labels.map((l) => [l.sampleId, l]));

  const failures = [];
  let checked = 0;
  let skipped = 0;

  for (const { file, record, parseError } of loadSamples(dir)) {
    if (parseError || !record) {
      skipped += 1;
      continue;
    }
    if (!Array.isArray(record.landmarks)) {
      skipped += 1; // 序列样本 / 坏数值样本不走单帧几何意图
      continue;
    }
    const label = record.sampleId ? labelById.get(record.sampleId) : null;
    const geometryLabel = label && label.level === "geometry" ? label : null;
    const want = geometryLabel ? (geometryLabel.expectedVerdict === "correct" ? "pass" : "fail") : intentFromText(record._synthetic?.intent);
    if (want !== "pass" && want !== "fail") {
      skipped += 1;
      continue;
    }

    const letter = letters.byId.get(record.targetLetterId);
    if (!letter) {
      failures.push(`${file}: 目标字母 ${record.targetLetterId} 不在 letters.json，无法核对几何意图`);
      continue;
    }
    const res = evaluate(letter, record.landmarks, geomOf(record));
    const codes = res.audit.map((i) => i.code);
    checked += 1;

    if (want === "pass" && (res.ruleStatus !== "ok" || !res.pass)) {
      failures.push(`${file}: 声明为正确姿态，但 evaluate 未通过 ruleStatus=${res.ruleStatus} audit=[${codes.join(",")}]`);
    }
    if (want === "fail") {
      const missing = (geometryLabel?.expectedIssueCodes ?? []).filter((c) => !codes.includes(c));
      if (res.pass || missing.length) {
        failures.push(`${file}: 声明为不合格姿态，但 evaluate pass=${res.pass} 缺码=[${missing.join(",")}] audit=[${codes.join(",")}]`);
      }
    }
  }

  return { ok: failures.length === 0, checked, skipped, failures };
}

function main() {
  const dir = process.argv[2] ? resolve(process.argv[2]) : SYNTHETIC_DIR;
  const { ok, checked, skipped, failures } = verifySamples({ dir });
  console.log(`生成期意图校验：核对 ${checked} 条单帧样本（跳过 ${skipped} 条非几何意图样本）`);
  if (ok) {
    console.log("全部达到声明意图。");
    return 0;
  }
  console.log("以下样本未达到声明意图：");
  for (const f of failures) console.log(`  - ${f}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
