/**
 * 指标汇总。每个比率都带显式分子分母；分母为 0 一律返回 null，不报 0、不报「准确率」。
 *
 * 两条正交轴，绝不互相触发：
 *   sourceType  —— 样本从哪来（synthetic / render / video / camera）
 *   truthOrigin —— 标签怎么产生（synthetic-construction / human-annotation / …）
 * 人工标注了合成样本，仍然是「合成样本 + 人工标签」，不是「已执行现场真人评估」。
 *
 * 指标口径固定为两层，名字必须区分：
 *   全体口径（All）          分母 = 全部有独立标签的样本，含被阻断/不可判定的
 *   conditionalOnDecidable   分母 = 其中真正判得出来的，明确叫 conditional，不与全体混用
 */
import { holdThresholds } from "./core.mjs";

/** 标签来源轴：标签是人工产出的。注意这**不代表**样本是现场真人。 */
export const HUMAN_LABEL_ORIGINS = ["human-annotation", "human-review", "human"];
/** 样本来源轴：只有现场采集才算「真人样本」。 */
export const ON_SITE_HUMAN_SOURCES = ["camera"];
/** 第三方实拍：真实但非本项目的自愿参与者，单独统计，不与现场采集合并。 */
export const THIRD_PARTY_SOURCES = ["video"];
/** 构造来源：不是真人，也不是实拍。 */
export const CONSTRUCTED_SOURCES = ["synthetic", "render"];

const rate = (num, den) => ({ num, den, value: den > 0 ? num / den : null });

function emptyBucket(key) {
  return {
    key,
    samples: 0,
    labeled: 0,
    scored: 0,
    predicted: 0,
    blocked: 0,
    undetermined: 0,
    unknown: 0,
    invalid: 0,
    statusCounts: { scored: 0, blocked: 0, undetermined: 0, unknown: 0, invalid: 0 },
    decisionCounts: { pass: 0, fail: 0, blocked: 0, undetermined: 0 },
    failureClassCounts: {},
    // 真值分组（全体口径的分母来源）
    truthCorrect: 0,
    truthIncorrect: 0,
    // 真值分组中真正判得出来的
    truthCorrectDecidable: 0,
    truthIncorrectDecidable: 0,
    // 混淆格子
    truePositive: 0,
    falseAccept: 0,
    falseReject: 0,
    trueNegative: 0,
    issueAgreementNum: 0,
    issueAgreementDen: 0,
  };
}

function finalize(b) {
  return {
    ...b,
    /** 回放覆盖率：能产出预测的样本 / 全部样本。与有没有标签无关。 */
    replayCoverage: rate(b.predicted, b.samples),
    /** 评分覆盖率：有标签且已评分 / 有标签样本。没有标签时分母为 0 => null。 */
    scoredCoverage: rate(b.scored, b.labeled),
    /** 全体口径：错误样本里的误放行 / 全部有独立标签的错误样本（含被阻断的）。 */
    falseAcceptAll: rate(b.falseAccept, b.truthIncorrect),
    /** 全体口径：正确样本里的明确失败 / 全部有独立标签的正确样本（含被阻断的）。 */
    falseRejectAll: rate(b.falseReject, b.truthCorrect),
    /** 可判定覆盖率：真值分组里判得出来的比例，正确组与错误组各算各的。 */
    decidableCoverage: {
      incorrect: rate(b.truthIncorrectDecidable, b.truthIncorrect),
      correct: rate(b.truthCorrectDecidable, b.truthCorrect),
    },
    /** 条件口径：只在可判定样本里算。名字里带 conditional，不与全体口径混用。 */
    conditionalOnDecidable: {
      falseAccept: rate(b.falseAccept, b.truthIncorrectDecidable),
      falseReject: rate(b.falseReject, b.truthCorrectDecidable),
      agreement: rate(
        b.truePositive + b.trueNegative,
        b.truePositive + b.trueNegative + b.falseAccept + b.falseReject,
      ),
      issueAgreement: rate(b.issueAgreementNum, b.issueAgreementDen),
    },
  };
}

function accumulate(b, r, label) {
  b.samples += 1;
  b.statusCounts[r.status] = (b.statusCounts[r.status] ?? 0) + 1;
  if (r.status === "blocked") b.blocked += 1;
  if (r.status === "undetermined") b.undetermined += 1;
  if (r.status === "unknown") b.unknown += 1;
  if (r.status === "invalid") b.invalid += 1;
  if (r.predicted != null) b.predicted += 1;
  if (r.decision) b.decisionCounts[r.decision] = (b.decisionCounts[r.decision] ?? 0) + 1;
  if (r.failureClass) b.failureClassCounts[r.failureClass] = (b.failureClassCounts[r.failureClass] ?? 0) + 1;

  if (!label) return;
  b.labeled += 1;
  // 真值分组先无条件计入 —— 这样全体口径的分母包含被阻断/不可判定的样本。
  if (label.expectedVerdict === "correct") b.truthCorrect += 1;
  else b.truthIncorrect += 1;

  if (r.status !== "scored") return;
  b.scored += 1;
  if (label.expectedVerdict === "correct") b.truthCorrectDecidable += 1;
  else b.truthIncorrectDecidable += 1;

  if (r.predicted === "correct") b.truePositive += label.expectedVerdict === "correct" ? 1 : 0;
  if (r.predicted === "correct" && label.expectedVerdict === "incorrect") b.falseAccept += 1;
  else if (r.predicted === "incorrect" && label.expectedVerdict === "correct") b.falseReject += 1;
  else if (r.predicted === "incorrect") b.trueNegative += 1;

  const expected = label.expectedIssueCodes;
  if (Array.isArray(expected) && expected.length) {
    b.issueAgreementDen += 1;
    const got = new Set(r.evidence?.issueCodes ?? []);
    if (expected.every((c) => got.has(c))) b.issueAgreementNum += 1;
  }
}

/** 样本来源轴分类。 */
function sourceAxis(sourceType) {
  if (ON_SITE_HUMAN_SOURCES.includes(sourceType)) return "on_site_human";
  if (THIRD_PARTY_SOURCES.includes(sourceType)) return "third_party_real";
  if (CONSTRUCTED_SOURCES.includes(sourceType)) return "constructed";
  return "unspecified";
}

/**
 * 真人评估证据链。四件事分开报，不把「有标签」或「全被阻断的尝试」伪装成有效结果。
 *   collected           样本确实来自现场采集（sourceType=camera）
 *   independentlyLabeled 这些样本有独立人工标签
 *   attempted           确实跑过一次评估（有标签且有回放记录）
 *   decidable           其中真正判得出来的数量
 * executed 需要四项都成立，且采集声明了协议。
 */
/**
 * 逐样本判定一个现场样本是否「合格」。
 *
 * 总控要求：来源、合格独立人工标签、协议关联、实际评估结果
 * **必须落在同一个样本上**，不能从不同样本各取一条拼出通过条件。
 *
 * 所以这里返回**逐样本的合取**，不是四个独立计数再 AND。
 */
const QUALIFY_CONDITIONS = ["onSite", "independentHumanLabel", "protocol", "decidable"];

function assessOnSiteSample(r, label) {
  const onSite = sourceAxis(r.sourceType) === "on_site_human";
  // 合格独立人工标签：标签存在、来源是人工轴、且标注者独立（truth.mjs 已挡掉预测派生）。
  const independentHumanLabel = !!label && HUMAN_LABEL_ORIGINS.includes(label.truthOrigin) && label.independent !== false;
  const protocol = typeof r.collection?.protocol === "string" && r.collection.protocol.trim() !== "";
  const decidable = r.status === "scored";

  const flags = { onSite, independentHumanLabel, protocol, decidable };
  const missing = QUALIFY_CONDITIONS.filter((c) => !flags[c]);

  return {
    sampleId: r.sampleId,
    sourceType: r.sourceType,
    status: r.status,
    reason: r.reason,
    truthOrigin: label?.truthOrigin ?? null,
    ...flags,
    /** 四条全部成立才算合格 —— executed 的唯一依据。 */
    qualified: missing.length === 0,
    missing,
  };
}

/**
 * 真人评估证据。executed 只在**同一个样本**同时满足四条时为真。
 *
 * 字段声明（collection.protocol）只是**声明**，不是真实性证明；
 * 本函数不校验协议内容，只要求它按样本关联到位。
 */
function humanEvidence({ replays, byId, protocols }) {
  const onSiteAll = replays.filter((r) => sourceAxis(r.sourceType) === "on_site_human");
  const perSample = onSiteAll.map((r) => assessOnSiteSample(r, byId.get(r.sampleId) ?? null));

  const withHumanLabel = perSample.filter((s) => s.independentHumanLabel);
  const withProtocol = perSample.filter((s) => s.protocol);
  const withProtocolAndHumanLabel = perSample.filter((s) => s.protocol && s.independentHumanLabel);
  const decidableWithHumanLabel = perSample.filter((s) => s.decidable && s.independentHumanLabel);
  const qualified = perSample.filter((s) => s.qualified);

  const collected = perSample.length;
  const independentlyLabeled = withHumanLabel.length;
  const attempted = independentlyLabeled > 0;
  const decidable = decidableWithHumanLabel.length;
  const qualifiedCount = qualified.length;
  const protocolDeclared = withProtocol.length > 0;

  // 逐样本合取 —— 唯一判定依据。
  const executed = qualifiedCount > 0;

  // 对照：**旧口径**（第二轮实现）——四个独立计数再 AND，不要求落在同一样本上。
  // 这里刻意复刻旧语义（标签只问存在、协议只问有人声明），用来证明拼接确实被拦住。
  const oldCollected = onSiteAll.length;
  const oldLabeled = onSiteAll.filter((r) => byId.has(r.sampleId)).length;
  const oldDecidable = onSiteAll.filter((r) => byId.has(r.sampleId) && r.status === "scored").length;
  const oldProtocolDeclared = onSiteAll.some((r) => protocols.has(r.sampleId));
  const naiveAndOfCounts =
    oldCollected > 0 && oldLabeled > 0 && oldDecidable > 0 && oldProtocolDeclared;

  // 「除有结果外都满足」：这些样本**本该可判但没判出来**，不能隐藏。
  const undecidableButOtherwiseQualified = perSample.filter(
    (s) => !s.decidable && s.onSite && s.independentHumanLabel && s.protocol,
  );

  const thirdParty = replays.filter((r) => sourceAxis(r.sourceType) === "third_party_real");
  const thirdPartyLabeled = thirdParty.filter((r) => byId.has(r.sampleId));
  const thirdPartyDecidable = thirdPartyLabeled.filter((r) => r.status === "scored");

  return {
    executed,
    /** 判定口径本身随报告输出，避免口头解释。 */
    criterion: "来源 ∧ 合格独立人工标签 ∧ 协议关联 ∧ 实际可判定结果，四条必须落在同一个样本上（逐样本合取）。",
    onSiteHuman: {
      collected,
      independentlyLabeled,
      attempted,
      attemptedSamples: withHumanLabel.map((s) => s.sampleId),
      decidable,
      /** executed 的唯一依据。 */
      qualified: qualifiedCount,
      qualifiedSamples: qualified.map((s) => s.sampleId),
      /** 全被阻断的尝试：attempted 为真但 decidable 为 0 —— 不算有效结果。 */
      allAttemptsBlocked: attempted && decidable === 0,
      /** 尝试过，但没有任何样本四条齐全。 */
      attemptedButNoQualified: attempted && qualifiedCount === 0,
      /** 除「有结果」外都满足 —— 必须显式列出，不能隐藏。 */
      undecidableButOtherwiseQualified: undecidableButOtherwiseQualified.map((s) => ({
        sampleId: s.sampleId,
        reason: s.reason,
      })),
      undecidableButOtherwiseQualifiedCount: undecidableButOtherwiseQualified.length,
      decidableCoverage: rate(decidable, independentlyLabeled),
      /** 只是「字段已声明」。字段声明不是真实性证明。 */
      protocolDeclared,
      protocolDeclaredNote: "protocolDeclared 表示 collection.protocol 字段按样本关联到位，是声明，不是协议真实性的验证。",
      /** 漏斗：四条条件逐级收窄，一眼看出样本在哪一步掉出去。 */
      funnel: {
        collected,
        withIndependentHumanLabel: withHumanLabel.length,
        withProtocol: withProtocol.length,
        withProtocolAndIndependentHumanLabel: withProtocolAndHumanLabel.length,
        decidableWithIndependentHumanLabel: decidableWithHumanLabel.length,
        qualified: qualifiedCount,
      },
      /** 逐样本四条件矩阵，便于核查「不能跨样本拼」。 */
      perSample: perSample.map((s) => ({
        sampleId: s.sampleId,
        sourceType: s.sourceType,
        status: s.status,
        reason: s.reason,
        truthOrigin: s.truthOrigin,
        onSite: s.onSite,
        independentHumanLabel: s.independentHumanLabel,
        protocol: s.protocol,
        decidable: s.decidable,
        qualified: s.qualified,
        missing: s.missing,
      })),
      blockedBreakdown: perSample
        .filter((s) => !s.decidable)
        .reduce((m, s) => ((m[s.reason] = (m[s.reason] ?? 0) + 1), m), {}),
    },
    /** 拼接自检：旧口径会不会误判通过。 */
    stitchingCheck: {
      perSampleConjunction: executed,
      naiveAndOfCounts,
      /** true = 旧口径会误报「已执行真人评估」；修正后 executed 仍为逐样本结果。 */
      naiveWouldMisreport: naiveAndOfCounts !== executed,
      naiveFormula: "旧口径 = collected>0 ∧ 有标签>0 ∧ 可判定>0 ∧ 有人声明协议（四个独立计数，可来自不同样本）",
      fixedFormula: "修正口径 = 存在单个样本同时满足 来源 ∧ 合格独立人工标签 ∧ 协议 ∧ 可判定结果",
    },
    thirdPartyVideo: {
      collected: thirdParty.length,
      independentlyLabeled: thirdPartyLabeled.length,
      decidable: thirdPartyDecidable.length,
      separateFromHuman: true,
      note: "第三方实拍单独统计，不与现场自愿参与者合并成一个真人成绩。",
    },
    note: executed
      ? `有 ${qualifiedCount} 个样本同时满足四条条件（来源/独立人工标签/协议/可判定结果），才置 executed=true。`
      : "未执行真人评估：没有任何**单个**样本同时满足来源、合格独立人工标签、协议关联、实际可判定结果四条。",
  };
}

/**
 * @param {object} args
 * @param {Array} args.replays replayOne 结果
 * @param {Array} args.labels  已对齐标签
 * @param {string} args.level
 */
export function buildReport({ replays, labels, level, coreFingerprint, labelInfo }) {
  const byId = new Map(labels.map((l) => [l.sampleId, l]));
  const protocols = new Set(
    replays.filter((r) => r.collection?.protocol).map((r) => r.sampleId),
  );

  const totals = emptyBucket("ALL");
  const byLevel = new Map();
  const byOrigin = new Map();
  const bySource = new Map();
  const byAxis = new Map();
  const reasons = {};

  const bump = (map, key) => {
    if (!map.has(key)) map.set(key, emptyBucket(key));
    return map.get(key);
  };

  for (const r of replays) {
    const label = byId.get(r.sampleId) ?? null;
    accumulate(totals, r, label);
    accumulate(bump(byLevel, r.level ?? "unknown"), r, label);
    accumulate(bump(byOrigin, label ? label.truthOrigin : "unlabeled"), r, label);
    accumulate(bump(bySource, r.sourceType ?? "unspecified"), r, label);
    accumulate(bump(byAxis, sourceAxis(r.sourceType)), r, label);
    if (r.status !== "scored") reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  }

  const human = humanEvidence({ replays, byId, protocols });

  return {
    generatedAt: new Date().toISOString(),
    metricDefinitions: {
      falseAcceptAll: "全体口径：误放行 / 全部有独立标签的错误样本（含被阻断的）。",
      falseRejectAll: "全体口径：明确失败 / 全部有独立标签的正确样本（含被阻断的）。",
      decidableCoverage: "可判定覆盖率：真值分组里判得出来的比例，正确组与错误组各算各的。",
      conditionalOnDecidable: "条件口径：仅在可判定样本中计算。与全体口径不是同一个数，禁止互换引用。",
      undetermined: "judge 无法判定（含质量门失败、异常），与 blocked（规则/状态拒绝）不同。",
      failureClass: "失败分类：action_error（动作错）/ hold_incomplete（保持未完成）/ invalid_timeline（时间轴无效）等，互不混同。",
    },
    level,
    coreFingerprint,
    labelInfo,
    /** 序列层结论依赖这两个常量；它们仍标 UNVERIFIED，所以必须随报告一起给出。 */
    holdThresholds: holdThresholds(),
    totals: finalize(totals),
    byLevel: [...byLevel.values()].map(finalize),
    byTruthOrigin: [...byOrigin.values()].map(finalize),
    bySourceType: [...bySource.values()].map(finalize),
    /** 来源轴（样本从哪来），与标签来源轴正交。 */
    bySourceAxis: [...byAxis.values()].map(finalize),
    blockReasons: reasons,
    humanEvaluation: human,
    /** 只要有构造来源样本就提示；与是否声称真人评估无关。 */
    syntheticNote: replays.some((r) => sourceAxis(r.sourceType) === "constructed")
      ? "含构造来源样本（synthetic/render）。这些只验证回放接线，不是准确率，不得与真人/实拍混算。"
      : null,
  };
}

/** 固定小数位渲染比率，便于粘进报告。 */
export function fmtRate(r) {
  if (!r || r.den === 0 || r.value == null) return `n/a (0/${r ? r.den : 0})`;
  return `${(r.value * 100).toFixed(1)}% (${r.num}/${r.den})`;
}
