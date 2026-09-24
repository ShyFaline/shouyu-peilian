/**
 * 最小元数据校验 CLI。只读采集目录，写报告到 --out。
 * 用法：bun tools/assessment/validate-captures.mjs <dir> [--out <file>] [--json]
 * 退出码：0 全部可回放；1 有阻断项；2 用法错误。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { coreFingerprint } from "./lib/fingerprint.mjs";
import { loadSamples } from "./lib/replay.mjs";
import { validateCapture } from "./lib/validate.mjs";

const argv = process.argv.slice(2);
const dir = argv.find((a) => !a.startsWith("--"));
const outIdx = argv.indexOf("--out");
const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
const asJson = argv.includes("--json");
/** 目录本来就放反例夹具时显式声明；默认如实返回 1。 */
const allowInvalid = argv.includes("--allow-invalid");

if (!dir) {
  console.error("用法: bun tools/assessment/validate-captures.mjs <dir> [--out <file>] [--json]");
  process.exit(2);
}

const target = resolve(dir);
const samples = loadSamples(target);
const results = samples.map(({ file, record, parseError }) => {
  if (parseError) {
    return { file, ok: false, kind: "unknown", blockers: [{ code: "json_parse_error", detail: parseError }], warnings: [], meta: {} };
  }
  return { file, ...validateCapture(record) };
});

const summary = {
  dir: target,
  generatedAt: new Date().toISOString(),
  coreFingerprint: coreFingerprint(),
  totals: {
    files: results.length,
    ok: results.filter((r) => r.ok).length,
    blocked: results.filter((r) => !r.ok).length,
    warnings: results.filter((r) => r.warnings.length > 0).length,
  },
  blockerCodes: results
    .flatMap((r) => r.blockers.map((b) => b.code))
    .reduce((m, c) => ((m[c] = (m[c] ?? 0) + 1), m), {}),
  warningCodes: results
    .flatMap((r) => r.warnings.map((w) => w.code))
    .reduce((m, c) => ((m[c] = (m[c] ?? 0) + 1), m), {}),
  files: results.map((r) => ({
    file: r.file,
    ok: r.ok,
    kind: r.kind,
    target: r.meta?.targetLetterId ?? null,
    coordSpace: r.meta?.coordSpace ?? null,
    size: r.meta?.imageWidth && r.meta?.imageHeight ? `${r.meta.imageWidth}x${r.meta.imageHeight}` : null,
    sourceType: r.meta?.sourceType ?? "unspecified",
    blockerCount: r.blockers.length,
    blockers: r.blockers.map((b) => `${b.code}${b.field && b.field !== "-" ? `@${b.field}` : ""}`),
    warnings: r.warnings.map((w) => w.code),
  })),
};

const MAX_SHOWN = 4;
const text = [
  `目录: ${target}`,
  `核心指纹: ${summary.coreFingerprint.digest}`,
  `文件 ${summary.totals.files} / 可回放 ${summary.totals.ok} / 阻断 ${summary.totals.blocked} / 有警告 ${summary.totals.warnings}`,
  `阻断码: ${JSON.stringify(summary.blockerCodes)}`,
  `警告码: ${JSON.stringify(summary.warningCodes)}`,
  ...summary.files.map((f) => {
    const shown = f.blockers.slice(0, MAX_SHOWN).join(",");
    const more = f.blockers.length > MAX_SHOWN ? ` …+${f.blockers.length - MAX_SHOWN}` : "";
    return `  ${f.ok ? "OK   " : "BLOCK"} ${f.file.padEnd(34)} kind=${f.kind.padEnd(8)} target=${String(f.target).padEnd(12)} size=${String(f.size).padEnd(9)} ${shown}${more}${f.warnings.length ? ` warn:${f.warnings.join(",")}` : ""}`;
  }),
].join("\n");

if (asJson) console.log(JSON.stringify(summary, null, 2));
else console.log(text);

if (outPath) {
  const p = resolve(outPath);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`\n报告写入: ${p}`);
}

process.exit(summary.totals.blocked > 0 && !allowInvalid ? 1 : 0);
