/**
 * 回放骨架自检。覆盖：缺尺寸、坏数值、伪标签、无标签、零样本、合成正负例，
 * 以及第二轮新增的：来源/标签正交、全体 vs conditional 口径、序列判定层级。
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
      noLabelReport.totals.conditionalOnDecidable.agreement.value === null &&
      noLabelReport.totals.scoredCoverage.value === null &&
      noLabelReport.totals.scoredCoverage.den === 0 &&
      noLabelReport.totals.replayCoverage.value !== null,
    `scored=${noLabelReport.totals.scored} agree=${JSON.stringify(noLabelReport.totals.conditionalOnDecidable.agreement)} replayCoverage=${JSON.stringify(noLabelReport.totals.replayCoverage)}`,
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

// ---------------------------------------------------------------- 来源与标签正交（修 bug 1）
// 旧断言把「只要标签来源是 human-annotation 就置 executed=true」当成正确行为，
// 这恰好就是 bug 1。这里改成：标签来源与样本来源正交，人工标注合成样本 ≠ 现场真人评估。
{
  // 合成样本 + 人工标签：不得宣称已执行真人评估
  const syntheticWithHumanLabels = buildReport({
    replays: synReplays,
    labels: synAligned.aligned.map((l) => ({ ...l, truthOrigin: "human-annotation" })),
    level: "auto",
    coreFingerprint: coreFingerprint(ROOT),
    labelInfo: { provided: true },
  });
  check(
    "合成样本 + human-annotation 标签不得宣称真人评估已执行",
    syntheticWithHumanLabels.humanEvaluation.executed === false,
    `executed=${syntheticWithHumanLabels.humanEvaluation.executed} 现场采集=${syntheticWithHumanLabels.humanEvaluation.onSiteHuman.collected}`,
  );
  check(
    "合成样本 + human-annotation 时 onSiteHuman.collected=0",
    syntheticWithHumanLabels.humanEvaluation.onSiteHuman.collected === 0 &&
      syntheticWithHumanLabels.humanEvaluation.onSiteHuman.independentlyLabeled === 0,
  );
  check(
    "标签来源仍如实记录为 human-annotation（正交，不是被抹掉）",
    syntheticWithHumanLabels.byTruthOrigin.some((b) => b.key === "human-annotation" && b.samples > 0),
  );
  check(
    "来源轴仍如实记录为 constructed（标签变了，来源没变）",
    syntheticWithHumanLabels.bySourceAxis.some((b) => b.key === "constructed" && b.samples > 0),
  );
  check("合成集本身 executed=false", synReport.humanEvaluation.executed === false);
}

// ---------------------------------------------------------------- 反例夹具（四组）
const CE = join(HERE, "samples", "counterexamples");
function runGroup(group) {
  const dir = join(CE, group);
  const raw = JSON.parse(readFileSync(join(dir, "labels.json"), "utf8"));
  const reps = replayAll(loadSamples(dir), letters);
  const lb = loadLabels(raw);
  const { aligned, orphaned } = alignLabels(lb.accepted, reps.map((r) => r.sampleId));
  const rep = buildReport({
    replays: reps,
    labels: aligned,
    level: "auto",
    coreFingerprint: coreFingerprint(ROOT),
    labelInfo: { provided: true },
  });
  return { reps, byId: byId(reps), lb, raw, aligned, orphaned, rep };
}

// --- 反例 1：只有人工标签，没有现场采集 => executed 必须 false
{
  const g = runGroup("label-only-human");
  check(
    "反例1 仅人工标签(合成/渲染/视频) => executed=false",
    g.rep.humanEvaluation.executed === false,
    `executed=${g.rep.humanEvaluation.executed} collected=${g.rep.humanEvaluation.onSiteHuman.collected}`,
  );
  check(
    "反例1 标签确实是 human-annotation（不是没标签）",
    g.rep.byTruthOrigin.some((b) => b.key === "human-annotation" && b.samples === 3),
    JSON.stringify(g.rep.byTruthOrigin.map((b) => [b.key, b.samples])),
  );
  check(
    "反例1 第三方视频单独成桶，不与现场真人合并",
    g.rep.bySourceAxis.some((b) => b.key === "third_party_real" && b.samples === 1) &&
      g.rep.bySourceAxis.every((b) => !(b.key === "on_site_human" && b.samples > 0)),
    JSON.stringify(g.rep.bySourceAxis.map((b) => [b.key, b.samples])),
  );
}

// --- 反例 2：四来源 × 同批人工标签 => 只有 camera 能推 executed
{
  const g = runGroup("source-orthogonality");
  const he = g.rep.humanEvaluation;
  check(
    "反例2 render 不得混入现场真人桶",
    g.rep.bySourceAxis.some((b) => b.key === "constructed" && b.samples === 2) && he.onSiteHuman.collected === 1,
    `constructed=${g.rep.bySourceAxis.find((b) => b.key === "constructed")?.samples} onSite=${he.onSiteHuman.collected}`,
  );
  check(
    "反例2 现场采集样本声明了协议 => executed=true 且四件事分开报",
    he.executed === true &&
      he.onSiteHuman.collected === 1 &&
      he.onSiteHuman.independentlyLabeled === 1 &&
      he.onSiteHuman.decidable === 1 &&
      he.onSiteHuman.protocolDeclared === true,
    JSON.stringify(he.onSiteHuman),
  );
  check(
    "反例2 第三方实拍单独统计，不与现场真人合并",
    he.thirdPartyVideo.collected === 1 && he.thirdPartyVideo.separateFromHuman === true,
  );
}

// --- 反例 3：全体口径 vs conditional 口径
{
  const g = runGroup("metric-cells");
  const t = g.rep.totals;
  // 错误组 2 个：一个误放行、一个被阻断 => 全体 1/2；条件 1/1
  check(
    "反例3 全体口径 误放行 = 1/2（含被阻断的错误样本）",
    t.falseAcceptAll.num === 1 && t.falseAcceptAll.den === 2,
    `${t.falseAcceptAll.num}/${t.falseAcceptAll.den}`,
  );
  check(
    "反例3 conditional 口径 误放行 = 1/1（仅可判定）",
    t.conditionalOnDecidable.falseAccept.num === 1 && t.conditionalOnDecidable.falseAccept.den === 1,
    `${t.conditionalOnDecidable.falseAccept.num}/${t.conditionalOnDecidable.falseAccept.den}`,
  );
  check(
    "反例3 全体口径 明确失败 = 1/5（正确组含阻断/invalid/unknown）",
    t.falseRejectAll.num === 1 && t.falseRejectAll.den === 5,
    `${t.falseRejectAll.num}/${t.falseRejectAll.den}`,
  );
  check(
    "反例3 conditional 口径 明确失败 = 1/2（仅可判定）",
    t.conditionalOnDecidable.falseReject.num === 1 && t.conditionalOnDecidable.falseReject.den === 2,
    `${t.conditionalOnDecidable.falseReject.num}/${t.conditionalOnDecidable.falseReject.den}`,
  );
  check(
    "反例3 可判定覆盖率 错误组 1/2、正确组 2/5",
    t.decidableCoverage.incorrect.num === 1 &&
      t.decidableCoverage.incorrect.den === 2 &&
      t.decidableCoverage.correct.num === 2 &&
      t.decidableCoverage.correct.den === 5,
    `err=${t.decidableCoverage.incorrect.num}/${t.decidableCoverage.incorrect.den} ok=${t.decidableCoverage.correct.num}/${t.decidableCoverage.correct.den}`,
  );
  check(
    "反例3 blocked / undetermined / invalid / unknown 分开计数",
    t.blocked === 2 && t.invalid === 1 && t.unknown === 1 && t.undetermined === 0,
    `blocked=${t.blocked} undetermined=${t.undetermined} invalid=${t.invalid} unknown=${t.unknown}`,
  );
  check(
    "反例3 blocked 原因可查（fingertip_oob）",
    g.rep.blockReasons.fingertip_oob === 2,
    JSON.stringify(g.rep.blockReasons),
  );
  check(
    "反例3 全体口径与 conditional 口径不是同一个数（禁止互换引用）",
    t.falseAcceptAll.value !== t.conditionalOnDecidable.falseAccept.value ||
      t.falseRejectAll.value !== t.conditionalOnDecidable.falseReject.value,
  );
  check(
    "反例3 缺尺寸样本进 invalid 且 reason=missing_size",
    g.byId.get("ce-ok-invalid")?.status === "invalid" && g.byId.get("ce-ok-invalid")?.reason === "missing_size",
  );
  check(
    "反例3 未知目标字母 => unknown，不折算成 incorrect",
    g.byId.get("ce-ok-unknown")?.status === "unknown" && g.byId.get("ce-ok-unknown")?.predicted === null,
  );
}

// --- 反例 4：序列判定层级（动作错误 / 保持未完成 / 无效时间轴 必须分开）
{
  const g = runGroup("sequence-levels");
  check(
    "反例4 序列标签先声明预期判定层级 product_decision",
    g.raw.sequenceJudgmentLevel === "product_decision",
    String(g.raw.sequenceJudgmentLevel),
  );
  check(
    "反例4 动作错误 => action_error（不是保持未完成）",
    g.byId.get("ce-seq-action-error")?.failureClass === "action_error",
    String(g.byId.get("ce-seq-action-error")?.failureClass),
  );
  check(
    "反例4 保持未完成 => hold_incomplete（不是动作错误）",
    g.byId.get("ce-seq-hold-pending")?.failureClass === "hold_incomplete",
    String(g.byId.get("ce-seq-hold-pending")?.failureClass),
  );
  check(
    "反例4 无效时间轴 => invalid_timeline（不是动作错误）",
    g.byId.get("ce-seq-invalid-timeline")?.status === "invalid" &&
      g.byId.get("ce-seq-invalid-timeline")?.failureClass === "invalid_timeline",
    `${g.byId.get("ce-seq-invalid-timeline")?.status}/${g.byId.get("ce-seq-invalid-timeline")?.failureClass}`,
  );
  check(
    "反例4 三种失败原因互不相同",
    new Set([
      g.byId.get("ce-seq-action-error")?.failureClass,
      g.byId.get("ce-seq-hold-pending")?.failureClass,
      g.byId.get("ce-seq-invalid-timeline")?.failureClass,
    ]).size === 3,
  );
  check(
    "反例4 序列通过 => none + decision=pass",
    g.byId.get("ce-seq-pass")?.failureClass === "none" && g.byId.get("ce-seq-pass")?.decision === "pass",
  );
}

// ---------------------------------------------------------------- 汇总输出
const t = synReport.totals;
console.log("\n=== 合成集指标（不是准确率，只验接线）===");
console.log(`样本 ${t.samples} | 有标签 ${t.labeled} | 已评分 ${t.scored} | blocked ${t.blocked} | unknown ${t.unknown} | invalid ${t.invalid}`);
console.log(`回放覆盖率    ${fmtRate(t.replayCoverage)}   (分子=能产出预测的样本)`);
console.log(`评分覆盖率    ${fmtRate(t.scoredCoverage)}   (分子=有标签且已评分)`);
console.log(`[全体] 误放行      ${fmtRate(t.falseAcceptAll)}   (分子=预测correct但真值incorrect；分母=全部错误样本)`);
console.log(`[全体] 明确失败    ${fmtRate(t.falseRejectAll)}   (分子=预测incorrect但真值correct；分母=全部正确样本)`);
console.log(`[全体] 可判定覆盖  错误组 ${fmtRate(t.decidableCoverage.incorrect)} 正确组 ${fmtRate(t.decidableCoverage.correct)}`);
console.log(`[cond] 误放行      ${fmtRate(t.conditionalOnDecidable.falseAccept)}`);
console.log(`[cond] 明确失败    ${fmtRate(t.conditionalOnDecidable.falseReject)}`);
console.log(`[cond] 一致率      ${fmtRate(t.conditionalOnDecidable.agreement)}`);
console.log(`[cond] 问题码一致  ${fmtRate(t.conditionalOnDecidable.issueAgreement)}`);
console.log(`结果分布      blocked=${t.blocked} undetermined=${t.undetermined} unknown=${t.unknown} invalid=${t.invalid}`);
console.log(`失败分类      ${JSON.stringify(t.failureClassCounts)}`);
for (const b of synReport.byLevel) {
  console.log(
    `  level=${b.key.padEnd(9)} n=${b.samples} scored=${b.scored} TP=${b.truePositive} FA=${b.falseAccept} FR=${b.falseReject} TN=${b.trueNegative} blocked=${b.blocked} invalid=${b.invalid}`,
  );
}
for (const b of synReport.byTruthOrigin) {
  console.log(`  origin=${b.key.padEnd(24)} n=${b.samples} scored=${b.scored} 一致=${b.conditionalOnDecidable.agreement.num}/${b.conditionalOnDecidable.agreement.den}`);
}
console.log(`真人评估 executed=${synReport.humanEvaluation.executed}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 断言通过`);
if (failed.length) {
  console.log("失败项:");
  for (const f of failed) console.log(`  - ${f.name} ${f.detail}`);
  process.exit(1);
}
