/**
 * 回放骨架。三个层级分开，互不冒充：
 *   geometry  单帧几何规则  -> evaluate().pass
 *   quality   输入质量门    -> assessInputQuality().ok
 *   sequence  连续保持门    -> judge() 逐帧推进 hold 后的 decision
 *
 * 只有 geometry/quality/sequence 三个 level 的样本才产出预测；
 * 其余一律 blocked / unknown，且带原因码，绝不折算成 correct/incorrect。
 *
 * 每条结果额外给出两个正交字段，供报告分开计数：
 *   decision     产品编排结论 judge().decision（pass/fail/blocked/undetermined）
 *   failureClass 「为什么没判对」的分类，**不把动作错误 / 保持未完成 / 无效时间轴混成一种**
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

/** failureClass 封闭词表。报告与自检都按这份清单核对。 */
export const FAILURE_CLASSES = [
  "none", // 预测 correct，没有失败
  "action_error", // 几何规则判了，且不合格（动作错）
  "hold_incomplete", // 几何合格但没停稳（保持未完成）——与 action_error 不同
  "blocked_input", // 质量门拦下（出框/骨头退化/手数不对/缺尺寸…）
  "blocked_rules", // 规则本身不可判（空规则/未知字段）
  "blocked_status", // practiceStatus 为 pending_review / demo_only
  "undetermined", // judge 无法判定（含异常）
  "unknown_target", // 目标字母不在 letters.json
  "invalid_timeline", // 时间轴缺失或无效——与动作错误不同
  "invalid_metadata", // 其它元数据/数据损坏
];

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

const outcome = (status, reason, failureClass, extra = {}) => ({
  status,
  reason,
  failureClass,
  predicted: null,
  ...extra,
});

/** 单帧。level=geometry 用 evaluate.pass；level=quality 用质量门。 */
function replaySingle(record, letter, level) {
  const geom = geomOf(record);
  const quality = assessInputQuality({ lm: record.landmarks, letter, geom });

  if (!quality.ok) {
    return outcome("blocked", quality.reason, "blocked_input", {
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
    return { status: "scored", reason: "quality_ok", failureClass: "none", predicted: "correct", evidence };
  }

  // 规则本身不可判（空规则 / 未知字段）时，不能算成几何负例。
  if (ev.ruleStatus === "empty" || ev.ruleStatus === "unsupported") {
    return outcome("blocked", `ruleStatus.${ev.ruleStatus}`, "blocked_rules", { evidence });
  }

  // 几何层只看几何：产品因 practiceStatus 被挡（如 U 是 pending_review）不改变几何结论，
  // 由 evidence.productDecision 单独承载，避免把「产品没放行」混进「动作错」。
  return {
    status: "scored",
    reason: "geometry_evaluated",
    failureClass: ev.pass ? "none" : "action_error",
    predicted: ev.pass ? "correct" : "incorrect",
    evidence,
  };
}

/**
 * 序列。level=sequence 用 judge 推进保持门。
 * 判定层级 = 整次尝试是否被产品放行（judge().decision），不是单帧几何。
 */
function replaySequence(record, letter, level) {
  const geom = geomOf(record);
  const hold = createHold();
  let last = null;
  const trail = [];

  for (const fr of record.frames) {
    last = judge({ letter, lm: fr.landmarks, geom, videoTime: fr.videoTime, nowMs: fr.nowMs }, hold);
    trail.push({ videoTime: fr.videoTime, nowMs: fr.nowMs, decision: last.decision, hold: { ...last.hold } });
  }

  const codes = (last?.issues ?? []).map((x) => x.code);
  const evidence = {
    frames: record.frames.length,
    finalDecision: last?.decision ?? null,
    practiceStatus: last?.practiceStatus ?? null,
    issueCodes: codes,
    hold: last ? { frames: last.hold.frames, elapsedMs: last.hold.elapsedMs } : null,
    // 阈值仍是 UNVERIFIED：报告必须带上生效值，否则「通过率」无法解释。
    thresholds: holdThresholds(),
    trail,
  };

  if (level === "quality") {
    return {
      status: "scored",
      reason: "quality_ok",
      failureClass: last?.quality?.ok ? "none" : "blocked_input",
      predicted: last?.quality?.ok ? "correct" : "incorrect",
      evidence,
    };
  }

  const decision = last?.decision ?? "undetermined";
  const isHoldPending = codes.includes("hold.pending");
  const isStatusBlocked = codes.some((c) => c.startsWith("status."));
  const isRulesBlocked = codes.some((c) => c === "rules.empty" || c === "unsupported_rule");

  if (decision === "pass") {
    return { status: "scored", reason: "hold_ready", failureClass: "none", predicted: "correct", evidence };
  }
  if (decision === "fail" && isHoldPending) {
    // 几何合格但没停稳：保持未完成，与动作错误分开。
    return { status: "scored", reason: "hold_not_ready", failureClass: "hold_incomplete", predicted: "incorrect", evidence };
  }
  if (decision === "fail") {
    return { status: "scored", reason: "geometry_failed", failureClass: "action_error", predicted: "incorrect", evidence };
  }
  if (decision === "blocked" && isStatusBlocked) {
    return outcome("blocked", codes[0] ?? "status.blocked", "blocked_status", { evidence });
  }
  if (decision === "blocked" && isRulesBlocked) {
    return outcome("blocked", codes[0] ?? "rules.blocked", "blocked_rules", { evidence });
  }
  if (decision === "blocked") {
    return outcome("blocked", codes[0] ?? "blocked", "blocked_input", { evidence });
  }
  return outcome("undetermined", codes[0] ?? "undetermined", "undetermined", { evidence });
}

/** 校验层阻断码 -> failureClass。时间轴问题必须与数据损坏分开。 */
function invalidFailureClass(code) {
  return code === "missing_timestamps" ? "invalid_timeline" : "invalid_metadata";
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
      failureClass: "invalid_metadata",
      detail: parseError,
      predicted: null,
      decision: null,
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
    // 现场采集协议声明（只有真实现场采集才有）；用于「已执行真人评估」的判定。
    collection: record?.collection ?? null,
    targetLetterId: v.meta.targetLetterId,
    coordSpace: v.meta.coordSpace,
    blockers: v.blockers,
    warnings: v.warnings,
    meta: v.meta,
  };

  if (!v.ok) {
    const code = v.blockers[0]?.code ?? "invalid";
    return { ...base, status: "invalid", reason: code, failureClass: invalidFailureClass(code), predicted: null, decision: null };
  }

  const letter = v.meta.targetLetterId ? letters.byId.get(v.meta.targetLetterId) : null;
  if (!letter) {
    const reason = v.meta.targetLetterId ? "unknown_target" : "missing_target";
    return {
      ...base,
      status: "unknown",
      reason,
      failureClass: "unknown_target",
      predicted: null,
      decision: null,
      blockers: [...v.blockers, { code: reason, detail: v.meta.targetLetterId ?? "无目标字母" }],
    };
  }

  const result = v.kind === "sequence" ? replaySequence(record, letter, level) : replaySingle(record, letter, level);
  return { ...base, ...result, decision: result.evidence?.finalDecision ?? result.evidence?.productDecision ?? null };
}

export function replayAll(samples, letters, levelOverride) {
  return samples.map((s) => replayOne(s, letters, levelOverride));
}
