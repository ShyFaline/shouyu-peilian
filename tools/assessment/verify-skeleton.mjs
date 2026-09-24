/**
 * 回放骨架自检。覆盖：缺尺寸、坏数值、伪标签、无标签、零样本、合成正负例。
 *
 * 只验证「骨架接线是否正确」，不产生准确率。全部样本为合成。
 * 用法：bun tools/assessment/verify-skeleton.mjs
 * 退出码：0 全部通过；1 有断言失败。
 */
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadLetters } from "./lib/core.mjs";
import { coreFingerprint } from "./lib/fingerprint.mjs";
import { buildReport, fmtRate } from "./lib/report.mjs";
import { loadSamples, replayAll, replayOne } from "./lib/replay.mjs";
import { alignLabels, loadLabels } from "./lib/truth.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SYN = join(HERE, "samples", "synthetic");
const ROOT = resolve(HERE, "..", "..");

const letters = loadLetters(ROOT);
const results = [];
const check = (name, cond, detail = "") => {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? "ok  " : "FAIL"} - ${name}${detail ? `  [${detail}]` : ""}`);
};

const byId = (arr) => new Map(arr.map((r) => [r.sampleId, r]));

// ---------------------------------------------------------------- 合成正负例
const synReplays = replayAll(loadSamples(SYN), letters);
const syn = byId(synReplays);
const synLabels = loadLabels(JSON.parse(readFileSync(join(SYN, "labels.json"), "utf8")));
const synAligned = alignLabels(synLabels.accepted, synReplays.map((r) => r.sampleId));

const synReport = buildReport({
  replays: synReplays,
  labels: synAligned.aligned,
  level: "auto",
  coreFingerprint: coreFingerprint(ROOT),
  labelInfo: { provided: true },
});

check("合成标签集被接受", synLabels.ok, `接受 ${synLabels.accepted.length} 拒收 ${synLabels.rejected.length}`);
check("合成标签没有孤立项", synAligned.orphaned.length === 0, `孤立 ${synAligned.orphaned.length}`);

// 几何正例：应 predicted=correct
for (const id of ["syn-v-pos", "syn-l-pos", "syn-y-pos", "syn-a-pos", "syn-b-pos", "syn-w-pos", "syn-i-pos"]) {
  const r = syn.get(id);
  check(`几何正例 ${id} 判 correct`, r?.status === "scored" && r.predicted === "correct", `status=${r?.status} pred=${r?.predicted}`);
}
// 几何负例：应 predicted=incorrect 且命中预期问题码
for (const [id, code] of [
  ["syn-v-neg-spread", "index_middle.not_apart"],
  ["syn-l-neg-angle", "thumb_index.angle"],
]) {
  const r = syn.get(id);
  check(
    `几何负例 ${id} 判 incorrect 且命中 ${code}`,
    r?.status === "scored" && r.predicted === "incorrect" && (r.evidence?.issueCodes ?? []).includes(code),
    `pred=${r?.predicted} issues=${(r?.evidence?.issueCodes ?? []).join(",")}`,
  );
}
// 几何通过 ≠ 产品放行
{
  const r = syn.get("syn-u-geom-pass-judge-blocked");
  check(
    "U 几何 correct 但产品 decision=blocked（不混算）",
    r?.predicted === "correct" && r?.evidence?.productDecision === "blocked",
    `pred=${r?.predicted} productDecision=${r?.evidence?.productDecision}`,
  );
}
// 序列层
check("序列 pass 样本 hold_ready", syn.get("syn-seq-v-pass")?.predicted === "correct", `pred=${syn.get("syn-seq-v-pass")?.predicted}`);
for (const id of ["syn-seq-v-short", "syn-seq-v-expired", "syn-seq-v-dup", "syn-seq-v-backwards"]) {
  const r = syn.get(id);
  check(`序列 ${id} 不放行`, r?.status === "scored" && r.predicted === "incorrect", `status=${r?.status} pred=${r?.predicted}`);
}
// 「这一帧没手」是合法观测，不是损坏
{
  const r = syn.get("syn-seq-v-nohand-then-pass");
  check(
    "序列内无手帧记警告不记损坏，且不阻断回放",
    r?.status === "scored" && r.predicted === "correct" && r.warnings.some((w) => w.code === "frames_without_hand"),
    `status=${r?.status} pred=${r?.predicted} warnings=${r?.warnings.map((w) => w.code).join(",")}`,
  );
}

// ---------------------------------------------------------------- 缺尺寸
{
  const r = syn.get("syn-missing-size");
  check(
    "缺尺寸 => invalid/missing_size，不猜尺寸",
    r?.status === "invalid" && r.blockers.some((b) => b.code === "missing_size"),
    `status=${r?.status} blockers=${r?.blockers.map((b) => b.code).join(",")}`,
  );
}
// 未知坐标空间
{
  const r = syn.get("syn-unsupported-space");
  check(
    "未知 coordSpace => unsupported_coord_space",
    r?.status === "invalid" && r.blockers.some((b) => b.code === "unsupported_coord_space"),
    `blockers=${r?.blockers.map((b) => b.code).join(",")}`,
  );
}
// equal_scale_unit 显式通道可判
{
  const r = syn.get("syn-equal-scale-unit");
  check("equal_scale_unit 显式通道可回放", r?.status === "scored", `status=${r?.status} reason=${r?.reason}`);
}

// ---------------------------------------------------------------- 坏数值
for (const [id, code] of [
  ["syn-bad-number-nan", "missing_xy"],
  ["syn-bad-number-null", "missing_xy"],
  ["syn-bad-number-short", "landmark_count"],
]) {
  const r = syn.get(id);
  check(`坏数值 ${id} => ${code}`, r?.status === "invalid" && r.blockers.some((b) => b.code === code), `status=${r?.status} ${r?.blockers.map((b) => b.code).join(",")}`);
}
// NaN 不得被质量门放过成 predicted
check("坏数值不产生任何预测", ["syn-bad-number-nan", "syn-bad-number-null", "syn-bad-number-short"].every((id) => syn.get(id)?.predicted === null));

// ---------------------------------------------------------------- 伪标签
{
  const pseudo = loadLabels(JSON.parse(readFileSync(join(SYN, "labels.pseudo.json"), "utf8")));
  check("伪标签整份被拒", !pseudo.ok && pseudo.accepted.length === 0, `接受 ${pseudo.accepted.length} 拒收 ${pseudo.rejected.length}`);
  const codes = new Set(pseudo.rejected.map((r) => r.code));
  check("伪标签拒收覆盖 非独立/来自预测/坏层级", ["label_not_independent", "label_derived_from_prediction", "label_bad_level"].every((c) => codes.has(c)), [...codes].join(","));
  const pseudoReport = buildReport({
    replays: synReplays,
    labels: [], // 整份被拒 => 一个都不用
    level: "auto",
    coreFingerprint: coreFingerprint(ROOT),
    labelInfo: { provided: true, wholeSetRejected: true },
  });
  check("伪标签被拒后不评分", pseudoReport.totals.scored === 0, `scored=${pseudoReport.totals.scored}`);
}
// 采集文件内的伪标签字段只当警告
{
  const r = syn.get("syn-pseudo-label");
  check(
    "采集文件内 expectedVerdict/pass/decision 只当伪标签警告",
    r?.status === "scored" && r.warnings.some((w) => w.code === "pseudo_label_field"),
    `warnings=${r?.warnings.map((w) => w.code).join(",")}`,
  );
}
// 标签指向不存在的样本 => 孤立
{
  const orphan = alignLabels([{ sampleId: "does-not-exist", expectedVerdict: "correct" }], synReplays.map((r) => r.sampleId));
  check("标签指向不存在样本 => 孤立拒收", orphan.aligned.length === 0 && orphan.orphaned.length === 1);
}

// ---------------------------------------------------------------- 无标签
{
  const r = syn.get("syn-unlabeled");
  check("无标签样本仍回放但不进分子分母", r?.status === "scored" && r.predicted === "correct", `status=${r?.status}`);
  const noLabelReport = buildReport({
    replays: synReplays,
    labels: [],
    level: "auto",
    coreFingerprint: coreFingerprint(ROOT),
    labelInfo: { provided: false },
  });
  check(
    "无标签时不报准确率（评分分母 0 => null，回放覆盖仍如实）",
    noLabelReport.totals.scored === 0 &&
      noLabelReport.totals.agreement.value === null &&
      noLabelReport.totals.scoredCoverage.value === null &&
      noLabelReport.totals.scoredCoverage.den === 0 &&
      noLabelReport.totals.replayCoverage.value !== null,
    `scored=${noLabelReport.totals.scored} agree=${JSON.stringify(noLabelReport.totals.agreement)} replayCoverage=${JSON.stringify(noLabelReport.totals.replayCoverage)}`,
  );
  check("无标签时 humanEvaluation.executed=false", noLabelReport.humanEvaluation.executed === false);
}

// ---------------------------------------------------------------- 零样本
{
  const emptyDir = mkdtempSync(join(tmpdir(), "assess-empty-"));
  const emptyReplays = replayAll(loadSamples(emptyDir), letters);
  const emptyReport = buildReport({
    replays: emptyReplays,
    labels: [],
    level: "auto",
    coreFingerprint: coreFingerprint(ROOT),
    labelInfo: { provided: false },
  });
  check("零样本 => 0 样本、覆盖率 null、无异常", emptyReport.totals.samples === 0 && emptyReport.totals.replayCoverage.value === null && emptyReport.totals.replayCoverage.den === 0);
  check("零样本不报真人评估", emptyReport.humanEvaluation.executed === false);
}

// ---------------------------------------------------------------- 真人评估未执行
{
  const humanLabeled = buildReport({
    replays: synReplays,
    labels: synAligned.aligned.map((l) => ({ ...l, truthOrigin: "human-annotation" })),
    level: "auto",
    coreFingerprint: coreFingerprint(ROOT),
    labelInfo: { provided: true },
  });
  check(
    "真人来源桶存在时才置 executed=true（合成桶不算真人）",
    synReport.humanEvaluation.executed === false && humanLabeled.humanEvaluation.executed === true,
    `synthetic=${synReport.humanEvaluation.executed} human=${humanLabeled.humanEvaluation.executed}`,
  );
}

// ---------------------------------------------------------------- 汇总输出
const t = synReport.totals;
console.log("\n=== 合成集指标（不是准确率，只验接线）===");
console.log(`样本 ${t.samples} | 有标签 ${t.labeled} | 已评分 ${t.scored} | blocked ${t.blocked} | unknown ${t.unknown} | invalid ${t.invalid}`);
console.log(`回放覆盖率    ${fmtRate(t.replayCoverage)}   (分子=能产出预测的样本)`);
console.log(`评分覆盖率    ${fmtRate(t.scoredCoverage)}   (分子=有标签且已评分)`);
console.log(`误接收        ${fmtRate(t.falseAcceptRate)}   (分子=预测correct但真值incorrect)`);
console.log(`误拒绝        ${fmtRate(t.falseRejectRate)}   (分子=预测incorrect但真值correct)`);
console.log(`一致率        ${fmtRate(t.agreement)}`);
console.log(`问题码一致    ${fmtRate(t.issueAgreement)}`);
for (const b of synReport.byLevel) {
  console.log(
    `  level=${b.key.padEnd(9)} n=${b.samples} scored=${b.scored} TP=${b.truePositive} FA=${b.falseAccept} FR=${b.falseReject} TN=${b.trueNegative} blocked=${b.blocked} invalid=${b.invalid}`,
  );
}
for (const b of synReport.byTruthOrigin) {
  console.log(`  origin=${b.key.padEnd(24)} n=${b.samples} scored=${b.scored} 一致=${b.agreement.num}/${b.agreement.den}`);
}
console.log(`真人评估: ${synReport.humanEvaluation.note}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 断言通过`);
if (failed.length) {
  console.log("失败项:");
  for (const f of failed) console.log(`  - ${f.name} ${f.detail}`);
  process.exit(1);
}
