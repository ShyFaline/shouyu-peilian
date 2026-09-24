/**
 * 回放骨架。三个层级分开，互不冒充：
 *   geometry  单帧几何规则  -> evaluate().pass
 *   quality   输入质量门    -> assessInputQuality().ok
 *   sequence  连续保持门    -> judge() 逐帧推进 hold 后的 decision
 *
 * 只有 geometry/quality/sequence 三个 level 的样本才产出预测；
 * 其余一律 blocked / unknown，且带原因码，绝不折算成 correct/incorrect。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assessInputQuality,
  createHold,
  evaluate,
  geomOf,
  holdThresholds,
  judge,
} from "./core.mjs";
import { validateCapture } from "./validate.mjs";

export const META_FILES = /^(labels(\..*)?\.json|MANIFEST\.json)$/i;

export function loadSamples(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !META_FILES.test(f))
    .sort()
    .map((f) => {
      const path = join(dir, f);
      let record = null;
      let parseError = null;
      try {
        record = JSON.parse(readFileSync(path, "utf8"));
      } catch (e) {
        parseError = String(e.message ?? e);
      }
      return { file: f, path, record, parseError };
    });
}

const outcome = (status, reason, extra = {}) => ({ status, reason, predicted: null, ...extra });

/** 单帧。level=geometry 用 evaluate.pass；level=quality 用质量门。 */
function replaySingle(record, letter, level) {
  const geom = geomOf(record);
  const quality = assessInputQuality({ lm: record.landmarks, letter, geom });

  if (!quality.ok) {
    return outcome("blocked", quality.reason, {
      evidence: { quality, productDecision: null },
    });
  }

  const ev = evaluate(letter, record.landmarks, geom);
  // 实时编排的 decision 只作证据（单帧必然 hold.pending），不作几何层预测。
  const jd = judge({ letter, lm: record.landmarks, geom, videoTime: 0, nowMs: 0 });
  const evidence = {
    quality,
    ruleStatus: ev.ruleStatus,
    issueCodes: (ev.audit ?? []).map((x) => x.code),
    productDecision: jd.decision,
    practiceStatus: jd.practiceStatus,
  };

  if (level === "quality") {
    return { status: "scored", reason: "quality_ok", predicted: "correct", evidence };
  }

  // 规则本身不可判（空规则 / 未知字段）时，不能算成几何负例。
  if (ev.ruleStatus === "empty" || ev.ruleStatus === "unsupported") {
    return outcome("blocked", `ruleStatus.${ev.ruleStatus}`, { evidence });
  }

  return { status: "scored", reason: "geometry_evaluated", predicted: ev.pass ? "correct" : "incorrect", evidence };
}

/** 连续序列。level=sequence 用 judge 推进保持门。 */
function replaySequence(record, letter, level) {
  const geom = geomOf(record);
  const hold = createHold();
  let last = null;
  const trail = [];

  for (const fr of record.frames) {
    last = judge({ letter, lm: fr.landmarks, geom, videoTime: fr.videoTime, nowMs: fr.nowMs }, hold);
    trail.push({ videoTime: fr.videoTime, nowMs: fr.nowMs, decision: last.decision, hold: { ...last.hold } });
  }

  const evidence = {
    frames: record.frames.length,
    finalDecision: last?.decision ?? null,
    practiceStatus: last?.practiceStatus ?? null,
    issueCodes: (last?.issues ?? []).map((x) => x.code),
    hold: last ? { frames: last.hold.frames, elapsedMs: last.hold.elapsedMs } : null,
    // 阈值仍是 UNVERIFIED：报告必须带上生效值，否则「通过率」无法解释。
    thresholds: holdThresholds(),
    trail,
  };

  if (level === "quality") {
    return { status: "scored", reason: "quality_ok", predicted: last?.quality?.ok ? "correct" : "incorrect", evidence };
  }
  if (last?.decision === "pass") return { status: "scored", reason: "hold_ready", predicted: "correct", evidence };
  if (last?.decision === "fail") return { status: "scored", reason: "hold_not_ready", predicted: "incorrect", evidence };
  if (last?.decision === "blocked") return outcome("blocked", evidence.issueCodes[0] ?? "blocked", { evidence });
  return outcome("blocked", evidence.issueCodes[0] ?? "undetermined", { evidence });
}

/**
 * 回放一条记录。level 缺省按记录形状推断：frames -> sequence，否则 geometry。
 * 无标签样本也要回放，才能统计覆盖率与 blocked 原因。
 */
export function replayOne({ file, record, parseError }, letters, levelOverride) {
  if (parseError) {
    return {
      file,
      sampleId: file.replace(/\.json$/, ""),
      status: "invalid",
      reason: "json_parse_error",
      detail: parseError,
      predicted: null,
      sourceType: "unspecified",
      synthetic: false,
      blockers: [{ code: "json_parse_error", detail: parseError }],
      warnings: [],
      meta: {},
    };
  }

  const v = validateCapture(record);
  const level = levelOverride ?? (v.kind === "sequence" ? "sequence" : "geometry");
  const base = {
    file,
    sampleId: v.meta.sampleId ?? file.replace(/\.json$/, ""),
    level,
    sourceType: v.meta.sourceType,
    synthetic: record?.sourceType === "synthetic" || record?._synthetic?.synthetic === true,
    humanReviewed: record?._synthetic?.humanReviewed === true,
    targetLetterId: v.meta.targetLetterId,
    coordSpace: v.meta.coordSpace,
    blockers: v.blockers,
    warnings: v.warnings,
    meta: v.meta,
  };

  if (!v.ok) {
    return { ...base, status: "invalid", reason: v.blockers[0]?.code ?? "invalid", predicted: null };
  }

  const letter = v.meta.targetLetterId ? letters.byId.get(v.meta.targetLetterId) : null;
  if (!letter) {
    const reason = v.meta.targetLetterId ? "unknown_target" : "missing_target";
    return {
      ...base,
      status: "unknown",
      reason,
      predicted: null,
      blockers: [...v.blockers, { code: reason, detail: v.meta.targetLetterId ?? "无目标字母" }],
    };
  }

  const result = v.kind === "sequence" ? replaySequence(record, letter, level) : replaySingle(record, letter, level);
  return { ...base, ...result };
}

export function replayAll(samples, letters, levelOverride) {
  return samples.map((s) => replayOne(s, letters, levelOverride));
}
