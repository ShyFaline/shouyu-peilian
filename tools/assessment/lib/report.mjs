/**
 * 指标汇总。每个比率都带显式分子分母，缺分母时报 null，不报 0、不报「准确率」。
 *
 * 分桶铁律：合成样本永远单独成桶，不与真人/渲染/视频抽帧混算。
 */
import { holdThresholds } from "./core.mjs";

export const HUMAN_ORIGINS = ["human-annotation", "human-review", "human"];

const rate = (num, den) => ({ num, den, value: den > 0 ? num / den : null });

function emptyBucket(key) {
  return {
    key,
    samples: 0,
    labeled: 0,
    scored: 0,
    predicted: 0,
    blocked: 0,
    unknown: 0,
    invalid: 0,
    statusCounts: { scored: 0, blocked: 0, unknown: 0, invalid: 0 },
    truthCorrect: 0,
    truthIncorrect: 0,
    predictedCorrect: 0,
    predictedIncorrect: 0,
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
    falseAcceptRate: rate(b.falseAccept, b.truthIncorrect),
    falseRejectRate: rate(b.falseReject, b.truthCorrect),
    agreement: rate(b.truePositive + b.trueNegative, b.truePositive + b.trueNegative + b.falseAccept + b.falseReject),
    issueAgreement: rate(b.issueAgreementNum, b.issueAgreementDen),
  };
}

function accumulate(b, r, label) {
  b.samples += 1;
  b.statusCounts[r.status] = (b.statusCounts[r.status] ?? 0) + 1;
  if (r.status === "blocked") b.blocked += 1;
  if (r.status === "unknown") b.unknown += 1;
  if (r.status === "invalid") b.invalid += 1;
  if (r.predicted != null) b.predicted += 1;
  if (!label) return;
  b.labeled += 1;
  if (r.status !== "scored") return;
  b.scored += 1;
  if (label.expectedVerdict === "correct") b.truthCorrect += 1;
  else b.truthIncorrect += 1;
  if (r.predicted === "correct") b.predictedCorrect += 1;
  else b.predictedIncorrect += 1;
  if (r.predicted === "correct" && label.expectedVerdict === "correct") b.truePositive += 1;
  else if (r.predicted === "correct" && label.expectedVerdict === "incorrect") b.falseAccept += 1;
  else if (r.predicted === "incorrect" && label.expectedVerdict === "correct") b.falseReject += 1;
  else b.trueNegative += 1;

  const expected = label.expectedIssueCodes;
  if (Array.isArray(expected) && expected.length) {
    b.issueAgreementDen += 1;
    const got = new Set(r.evidence?.issueCodes ?? []);
    if (expected.every((c) => got.has(c))) b.issueAgreementNum += 1;
  }
}

/**
 * @param {object} args
 * @param {Array} args.replays replayOne 结果
 * @param {Array} args.labels  已对齐标签
 * @param {string} args.level
 */
export function buildReport({ replays, labels, level, coreFingerprint, labelInfo }) {
  const byId = new Map(labels.map((l) => [l.sampleId, l]));

  const totals = emptyBucket("ALL");
  const byLevel = new Map();
  const byOrigin = new Map();
  const bySource = new Map();
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
    if (r.status !== "scored") reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  }

  const labelOrigins = [...byOrigin.keys()].filter((k) => k !== "unlabeled");
  const humanBuckets = labelOrigins.filter((o) => HUMAN_ORIGINS.includes(o));
  const syntheticBuckets = labelOrigins.filter((o) => /synthetic/i.test(o));

  return {
    generatedAt: new Date().toISOString(),
    level,
    coreFingerprint,
    labelInfo,
    /** 序列层结论依赖这两个常量；它们仍标 UNVERIFIED，所以必须随报告一起给出。 */
    holdThresholds: holdThresholds(),
    totals: finalize(totals),
    byLevel: [...byLevel.values()].map(finalize),
    byTruthOrigin: [...byOrigin.values()].map(finalize),
    bySourceType: [...bySource.values()].map(finalize),
    blockReasons: reasons,
    humanEvaluation: {
      executed: humanBuckets.length > 0,
      buckets: humanBuckets,
      note: humanBuckets.length
        ? "存在真人来源标签桶，见 byTruthOrigin。"
        : "没有真人来源标签。未执行真人评估，本报告不含任何真人准确率。",
    },
    syntheticBuckets,
    /** 合成桶只用于验证骨架接线，禁止对外称准确率。 */
    syntheticNote:
      syntheticBuckets.length > 0
        ? "合成桶（truthOrigin=synthetic-construction）只验证回放接线，不是准确率，不得与真人混算。"
        : null,
  };
}

/** 固定小数位渲染比率，便于粘进报告。 */
export function fmtRate(r) {
  if (!r || r.den === 0 || r.value == null) return `n/a (0/${r ? r.den : 0})`;
  return `${(r.value * 100).toFixed(1)}% (${r.num}/${r.den})`;
}
