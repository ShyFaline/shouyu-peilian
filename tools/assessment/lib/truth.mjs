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
/** 序列标签的判定层级封闭词表：expectedVerdict 指「整次尝试是否被产品放行」。 */
export const SEQUENCE_JUDGMENT_LEVELS = ["product_decision"];

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
  const seqLevel = isObj(file) && typeof file.sequenceJudgmentLevel === "string" ? file.sequenceJudgmentLevel : null;

  if (!isObj(file) || !Array.isArray(file.labels)) {
    return {
      ok: false,
      accepted: [],
      rejected: [{ sampleId: null, code: "labels_malformed", detail: "缺少 labels 数组" }],
      truthOrigin: "unknown",
      humanReviewed: false,
      sequenceJudgmentLevel: null,
      duplicateSampleIds: [],
      reasons: { labels_malformed: 1 },
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
    // 序列标签必须在文件级声明判定层级：否则「整次尝试是否放行」会被当成单帧几何真值、
    // 静默混进序列混淆矩阵（README §2.2）。
    if (lb.level === "sequence") {
      if (!seqLevel) return push("label_missing_sequence_level", "序列标签缺文件级 sequenceJudgmentLevel");
      if (!SEQUENCE_JUDGMENT_LEVELS.includes(seqLevel)) {
        return push("label_bad_sequence_level", `sequenceJudgmentLevel=${JSON.stringify(seqLevel)}`);
      }
    }

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

  // 重复 sampleId：同一份标签集里两条真值互相矛盾，不得让「后者静默胜出」，整份拒收。
  const seen = new Map();
  const duplicates = [];
  for (const lb of accepted) {
    if (seen.has(lb.sampleId)) duplicates.push(lb.sampleId);
    else seen.set(lb.sampleId, lb);
  }
  for (const sampleId of duplicates) {
    rejected.push({ sampleId, at: null, code: "label_duplicate_sample_id", detail: "同一 sampleId 出现多次，真值互相矛盾" });
  }

  return {
    ok: rejected.length === 0 && accepted.length > 0,
    accepted: duplicates.length ? [] : accepted,
    rejected,
    truthOrigin,
    humanReviewed,
    sequenceJudgmentLevel: seqLevel,
    duplicateSampleIds: [...new Set(duplicates)],
    reasons: rejected.reduce((m, r) => ((m[r.code] = (m[r.code] ?? 0) + 1), m), {}),
  };
}

/** 标签文件读不到 / 不是 JSON：降级成可判读结果，不崩栈。 */
function unreadableLabels(path, code, detail) {
  return {
    ok: false,
    accepted: [],
    rejected: [{ sampleId: null, at: path, code, detail }],
    truthOrigin: "unknown",
    humanReviewed: false,
    sequenceJudgmentLevel: null,
    duplicateSampleIds: [],
    reasons: { [code]: 1 },
  };
}

export function readLabels(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    return unreadableLabels(path, "labels_unreadable", `读不到标签文件：${e.code ?? e.message}`);
  }
  try {
    return loadLabels(JSON.parse(raw));
  } catch (e) {
    return unreadableLabels(path, "labels_malformed", `标签文件不是合法 JSON：${e.message}`);
  }
}

/**
 * 标签与样本对齐。两种拒收：
 *   - 标签指向不存在的样本（orphaned）
 *   - 标签层级与回放层级不一致（levelMismatch）：单帧几何标签不得冒充序列真值
 * 样本可以是 id 数组，也可以是 replayOne 结果（带 level）；字符串没有 level，无从交叉校验。
 */
export function alignLabels(labels, samples) {
  const byId = new Map();
  for (const s of samples) {
    if (typeof s === "string") byId.set(s, null);
    else if (s && typeof s.sampleId === "string") byId.set(s.sampleId, s.level ?? null);
  }
  const aligned = [];
  const orphaned = [];
  const levelMismatch = [];
  for (const lb of labels) {
    if (!byId.has(lb.sampleId)) {
      orphaned.push({ sampleId: lb.sampleId, code: "label_unknown_sample", detail: "标签指向不存在的样本" });
      continue;
    }
    const replayLevel = byId.get(lb.sampleId);
    if (replayLevel && replayLevel !== lb.level) {
      levelMismatch.push({
        sampleId: lb.sampleId,
        code: "label_level_mismatch",
        detail: `标签 level=${lb.level}，该样本按 ${replayLevel} 回放`,
      });
      continue;
    }
    aligned.push(lb);
  }
  return { aligned, orphaned, levelMismatch };
}
