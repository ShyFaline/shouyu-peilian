/**
 * 独立标签装载与伪标签拒收。
 *
 * 铁律：
 *   - 标签只能来自独立标注文件，不能来自采集记录里的 targetLetterId / pass / decision。
 *   - 从工具自身预测或阈值回填的标签 = 伪标签，整份标签集拒收（fail closed）。
 *   - 合成夹具的标签（truthOrigin=synthetic-construction）单独成桶，永不与真人混算。
 */
import { readFileSync } from "node:fs";

export const VERDICTS = ["correct", "incorrect"];
export const LEVELS = ["geometry", "quality", "sequence"];

/** reviewedBy 命中这些词说明标签来自工具/模型自动产物，不是独立人工。 */
const PREDICTION_REVIEWER = /(auto|model|judge|evaluate|prediction|pipeline|self|工具|模型|预测)/i;
const PREDICTION_ORIGIN = /(prediction|predicted|tool_output|self_label|模型|预测)/i;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * @param {object} file labels.json 内容
 * @returns {{ok:boolean, accepted:Array, rejected:Array, truthOrigin:string, humanReviewed:boolean, reasons:object}}
 */
export function loadLabels(file) {
  const rejected = [];
  const accepted = [];

  if (!isObj(file) || !Array.isArray(file.labels)) {
    return {
      ok: false,
      accepted: [],
      rejected: [{ sampleId: null, code: "labels_malformed", detail: "缺少 labels 数组" }],
      truthOrigin: "unknown",
      humanReviewed: false,
      reasons: {},
    };
  }

  const truthOrigin = typeof file.truthOrigin === "string" ? file.truthOrigin : "unspecified";
  const humanReviewed = file.humanReviewed === true;

  file.labels.forEach((lb, i) => {
    const at = `labels[${i}]`;
    const sampleId = isObj(lb) ? lb.sampleId ?? null : null;
    const push = (code, detail) => rejected.push({ sampleId, at, code, detail });

    if (!isObj(lb)) return push("label_malformed", "不是对象");
    if (!sampleId) return push("label_missing_sample", "缺 sampleId");
    if (!VERDICTS.includes(lb.expectedVerdict)) {
      return push("label_bad_verdict", `expectedVerdict=${JSON.stringify(lb.expectedVerdict)}`);
    }
    if (!LEVELS.includes(lb.level)) return push("label_bad_level", `level=${JSON.stringify(lb.level)}`);

    // 独立性：标签不得由被评工具自己产生。
    if (lb.independent !== true) return push("label_not_independent", "independent 不是 true");
    if (typeof lb.derivedFrom === "string" && PREDICTION_ORIGIN.test(lb.derivedFrom)) {
      return push("label_derived_from_prediction", `derivedFrom=${lb.derivedFrom}`);
    }
    if (typeof lb.reviewedBy !== "string" || lb.reviewedBy.trim() === "") {
      return push("label_missing_reviewer", "缺 reviewedBy");
    }
    if (PREDICTION_REVIEWER.test(lb.reviewedBy)) {
      return push("label_derived_from_prediction", `reviewedBy=${lb.reviewedBy}`);
    }
    if (typeof lb.reviewedAt !== "string" || lb.reviewedAt.trim() === "") {
      return push("label_missing_time", "缺 reviewedAt");
    }
    if (PREDICTION_ORIGIN.test(truthOrigin) && humanReviewed) {
      return push("label_origin_conflict", "truthOrigin 说来自预测但 humanReviewed=true");
    }

    accepted.push({ ...lb, truthOrigin: typeof lb.truthOrigin === "string" ? lb.truthOrigin : truthOrigin });
  });

  return {
    ok: rejected.length === 0 && accepted.length > 0,
    accepted,
    rejected,
    truthOrigin,
    humanReviewed,
    reasons: rejected.reduce((m, r) => ((m[r.code] = (m[r.code] ?? 0) + 1), m), {}),
  };
}

export function readLabels(path) {
  return loadLabels(JSON.parse(readFileSync(path, "utf8")));
}

/** 标签与样本对齐。标签指向不存在的样本 => 拒收该标签。 */
export function alignLabels(labels, sampleIds) {
  const ids = new Set(sampleIds);
  const aligned = [];
  const orphaned = [];
  for (const lb of labels) {
    if (ids.has(lb.sampleId)) aligned.push(lb);
    else orphaned.push({ sampleId: lb.sampleId, code: "label_unknown_sample", detail: "标签指向不存在的样本" });
  }
  return { aligned, orphaned };
}
