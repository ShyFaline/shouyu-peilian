/**
 * 回放 CLI。只读采集目录，写报告到 --out；绝不覆盖历史产物。
 *
 * 用法:
 *   bun tools/assessment/replay.mjs <dir> [--level geometry|quality|sequence] [--labels <labels.json>]
 *                                    [--out <file>] [--json] [--quiet]
 *
 * 层级缺省：序列 -> sequence，其余 -> geometry。
 * 没有 --labels 时只回放不评分（覆盖率为 0，不编指标）。
 * 退出码：0 正常；1 有 invalid 记录或标签被拒；2 用法错误。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import { coreFingerprint } from "./lib/fingerprint.mjs";
import { buildReport, fmtRate } from "./lib/report.mjs";
import { loadSamples, replayAll } from "./lib/replay.mjs";
import { loadLetters } from "./lib/core.mjs";
import { alignLabels, loadLabels } from "./lib/truth.mjs";

const argv = process.argv.slice(2);
const dir = argv.find((a) => !a.startsWith("--"));
const val = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const levelArg = val("--level");
const labelsArg = val("--labels");
const outPath = val("--out");
const asJson = argv.includes("--json");
const quiet = argv.includes("--quiet");
/** 目录本来就放反例夹具时显式声明，退出码才不报 1；默认仍然如实报错。 */
const allowInvalid = argv.includes("--allow-invalid");

if (!dir || (levelArg && !["geometry", "quality", "sequence"].includes(levelArg))) {
  console.error("用法: bun tools/assessment/replay.mjs <dir> [--level geometry|quality|sequence] [--labels <file>] [--out <file>] [--json]");
  process.exit(2);
}

const target = resolve(dir);
const letters = loadLetters();
const replays = replayAll(loadSamples(target), letters, levelArg);

let labels = [];
let labelInfo = { provided: false };
let exitCode = 0;

if (labelsArg) {
  const loaded = loadLabels(JSON.parse(readFileSync(resolve(labelsArg), "utf8")));
  const { aligned, orphaned } = alignLabels(loaded.accepted, replays.map((r) => r.sampleId));
  labels = aligned;
  labelInfo = {
    provided: true,
    path: resolve(labelsArg),
    truthOrigin: loaded.truthOrigin,
    humanReviewed: loaded.humanReviewed,
    accepted: loaded.accepted.length,
    rejected: loaded.rejected.length,
    rejectedReasons: loaded.reasons,
    aligned: aligned.length,
    orphaned: orphaned.length,
    rejectedDetail: loaded.rejected,
    orphanedDetail: orphaned,
    wholeSetRejected: !loaded.ok,
  };
  // 整份标签被拒（例如全是伪标签）时，不得偷偷用一半：一个都不评分。
  if (!loaded.ok) {
    labels = [];
    exitCode = 1;
  }
  if (orphaned.length) exitCode = 1;
}

const invalid = replays.filter((r) => r.status === "invalid");
if (invalid.length && !allowInvalid) exitCode = 1;

const report = buildReport({
  replays,
  labels,
  level: levelArg ?? "auto",
  coreFingerprint: coreFingerprint(),
  labelInfo,
});

report.samples = replays.map((r) => ({
  sampleId: r.sampleId,
  file: r.file,
  level: r.level,
  status: r.status,
  reason: r.reason,
  predicted: r.predicted,
  targetLetterId: r.targetLetterId,
  sourceType: r.sourceType,
  synthetic: r.synthetic,
  blockers: r.blockers.map((b) => b.code),
  warnings: r.warnings.map((w) => w.code),
  decision: r.decision ?? null,
  failureClass: r.failureClass ?? null,
  issueCodes: r.evidence?.issueCodes ?? [],
  productDecision: r.evidence?.productDecision ?? null,
  hold: r.evidence?.hold ?? null,
  thresholds: r.evidence?.thresholds ?? null,
}));

if (!quiet) {
  const t = report.totals;
  console.log(`目录: ${target}   核心指纹: ${report.coreFingerprint.digest}`);
  console.log(
    `样本 ${t.samples} | 有标签 ${t.labeled} | 已评分 ${t.scored} | blocked ${t.blocked} | unknown ${t.unknown} | invalid ${t.invalid}`,
  );
  console.log(
    `回放覆盖率 ${fmtRate(t.replayCoverage)} | 评分覆盖率 ${fmtRate(t.scoredCoverage)}`,
  );
  console.log(
    `[全体口径] 误放行 ${fmtRate(t.falseAcceptAll)} | 明确失败 ${fmtRate(t.falseRejectAll)}` +
      ` | 可判定覆盖 错误组 ${fmtRate(t.decidableCoverage.incorrect)} 正确组 ${fmtRate(t.decidableCoverage.correct)}`,
  );
  console.log(
    `[conditional 仅可判定] 误放行 ${fmtRate(t.conditionalOnDecidable.falseAccept)}` +
      ` | 明确失败 ${fmtRate(t.conditionalOnDecidable.falseReject)}` +
      ` | 一致率 ${fmtRate(t.conditionalOnDecidable.agreement)}`,
  );
  console.log(
    `结果分布: blocked ${t.blocked} | undetermined ${t.undetermined} | unknown ${t.unknown} | invalid ${t.invalid}`,
  );
  console.log(`失败分类: ${JSON.stringify(t.failureClassCounts)}`);
  console.log(`阻断原因: ${JSON.stringify(report.blockReasons)}`);
  console.log(
    `保持门阈值: passFrames=${report.holdThresholds.passFrames} maxGapMs=${report.holdThresholds.maxGapMs}` +
      `${report.holdThresholds.unverified ? "（仍标 UNVERIFIED，序列层结论受此限制）" : ""}`,
  );
  if (labelInfo.provided) {
    console.log(
      `标签: 接受 ${labelInfo.accepted} / 拒收 ${labelInfo.rejected} / 对齐 ${labelInfo.aligned} / 孤立 ${labelInfo.orphaned}` +
        ` | truthOrigin=${labelInfo.truthOrigin} humanReviewed=${labelInfo.humanReviewed}`,
    );
    if (labelInfo.rejected) console.log(`  拒收原因: ${JSON.stringify(labelInfo.rejectedReasons)}`);
  } else {
    console.log("标签: 未提供，只回放不评分。");
  }
  const he = report.humanEvaluation;
  console.log(
    `真人评估 executed=${he.executed} | 现场采集 ${he.onSiteHuman.collected} | 独立标签 ${he.onSiteHuman.independentlyLabeled}` +
      ` | 已尝试 ${he.onSiteHuman.attempted} | 可判定 ${he.onSiteHuman.decidable} | 协议声明 ${he.onSiteHuman.protocolDeclared}` +
      `${he.onSiteHuman.allAttemptsBlocked ? " ⚠ 尝试全被阻断，不算有效结果" : ""}`,
  );
  console.log(
    `第三方实拍(单独统计): 采集 ${he.thirdPartyVideo.collected} | 独立标签 ${he.thirdPartyVideo.independentlyLabeled} | 可判定 ${he.thirdPartyVideo.decidable}`,
  );
  console.log(`说明: ${he.note}`);
  if (report.syntheticNote) console.log(`合成提示: ${report.syntheticNote}`);
  console.log("");
  for (const s of report.samples) {
    console.log(
      `  ${s.status.padEnd(8)} ${s.sampleId.padEnd(30)} lvl=${s.level.padEnd(8)} pred=${String(s.predicted).padEnd(9)}` +
        ` fail=${String(s.failureClass).padEnd(16)} reason=${String(s.reason).padEnd(20)} issues=${s.issueCodes.join(",")}`,
    );
  }
}

if (outPath) {
  const p = resolve(outPath);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`\n报告写入: ${p}  (来源 ${basename(target)})`);
}

if (asJson) console.log(JSON.stringify(report, null, 2));

process.exit(exitCode);
