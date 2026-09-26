/**
 * 第二轮+第三轮反例夹具生成器。各组独立成目录，便于分开统计分母。
 *
 * 1. source-orthogonality/  样本来源 × 标签来源正交：人工标注的合成/渲染/第三方视频
 *                           都不是「已执行现场真人评估」。
 * 2. metric-cells/          把样本钉在特定 (真值, 预测) 格子上，用来锁死指标分母口径。
 * 3. sequence-levels/       序列任务的判定层级：动作错误 / 保持未完成 / 无效时间轴必须分开。
 * 4. evidence-stitching/          第三轮：纯拼接陷阱，四条分散 => executed 必须 false。
 * 5. evidence-stitching-positive/ 第三轮：阳性对照，四条同一样本 => executed 必须 true。
 * 6. evidence-all-blocked/        第三轮：已尝试但零可判定结果，不算有效评估。
 *
 * 全部 sourceType 明确、全部标签 humanReviewed=false（除 source-orthogonality 组，
 * 该组**故意**声明 human-annotation 以暴露 bug 1；它仍是合成样本，不是真人数据）。
 * 手型几何来自 samples/lib/hand.mjs，不含任何国标规则。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { POSES, SYNTHETIC_SIZE, buildHand, shiftOutOfFrame } from "../lib/hand.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SIZE = SYNTHETIC_SIZE;

function writeIn(group, name, obj) {
  const dir = join(HERE, group);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), `${JSON.stringify(obj, null, 2)}\n`, "utf8");
}

/** 合成手型。spread 用两指开合角控制，用来钉在规则阈值两侧。 */
const vHand = (spread) =>
  buildHand({
    fingers: { index: "extended", middle: "extended", ring: "curled", pinky: "curled", thumb: "curled" },
    base: { index: -spread, middle: spread, thumb: -40 },
  });

function frame({ sampleId, sourceType, landmarks, targetLetterId = "GF0021.V", patch = {} }) {
  return {
    sampleId,
    schemaVersion: 2,
    coordSpace: "image_normalized",
    ...SIZE,
    mirrored: false,
    sourceType,
    capturedAt: 1758800000000,
    frameId: 0,
    targetLetterId,
    landmarks,
    ...patch,
  };
}

const L = (sampleId, expectedVerdict, extra = {}) => ({
  sampleId,
  expectedVerdict,
  expectedIssueCodes: [],
  level: "geometry",
  reviewedBy: "annotator:ce-fixture",
  reviewedAt: "2026-09-25T00:00:00Z",
  independent: true,
  labelVersion: "counterexample-labels-1",
  truthOrigin: "synthetic-construction",
  humanReviewed: false,
  ...extra,
});

// ============================================================ 1. 来源正交
// 四个样本几何完全相同（V 正例），只有 sourceType 不同。
// 标签全部**故意**写成 human-annotation + humanReviewed，用来暴露 bug 1：
// 旧实现只看标签来源就置 humanEvaluation.executed=true。
const SRC_HUMAN_LABEL = {
  truthOrigin: "human-annotation",
  humanReviewed: true,
  reviewedBy: "annotator:ce-fixture",
};

const srcCases = [
  ["ce-src-synthetic", "synthetic", "合成手型，人工标注后仍不是现场真人"],
  ["ce-src-render", "render", "Blender 渲染图，人工标注后不是现场真人"],
  ["ce-src-video", "video", "第三方视频抽帧，必须单独统计"],
  ["ce-src-camera", "camera", "现场自愿参与者摄像头采集，唯一可声称真人评估的来源"],
];

for (const [id, sourceType, note] of srcCases) {
  const extra = { _counterexample: { group: "source-orthogonality", note } };
  // 只有 camera 组带符合协议的采集声明
  if (sourceType === "camera") {
    extra.collection = { protocol: "voluntary-participant-onsite-v1", consent: true, sessionId: "ce-session-1" };
  }
  writeIn("source-orthogonality", `${id}.json`, frame({ sampleId: id, sourceType, landmarks: vHand(18), patch: extra }));
}

writeIn("source-orthogonality", "labels.json", {
  labelVersion: "counterexample-labels-1",
  truthOrigin: "human-annotation",
  humanReviewed: true,
  note: "四组来源共用同一批人工标注。标签来源相同，样本来源不同——这正是 bug 1 的暴露点。",
  labels: srcCases.map(([id, , note]) => L(id, "correct", { ...SRC_HUMAN_LABEL, note })),
});

// 1b. 只有人工标签、没有任何现场采集：**必须** executed=false。
// 这是 bug 1 的字面反例——旧实现只看 truthOrigin=human-annotation 就宣称真人评估已执行。
const LABEL_ONLY = [
  ["ce-lbl-synthetic", "synthetic"],
  ["ce-lbl-render", "render"],
  ["ce-lbl-video", "video"],
];
for (const [id, sourceType] of LABEL_ONLY) {
  writeIn(
    "label-only-human",
    `${id}.json`,
    frame({
      sampleId: id,
      sourceType,
      landmarks: vHand(18),
      patch: { _counterexample: { group: "label-only-human", note: "有人工标签，但样本不是现场采集" } },
    }),
  );
}
writeIn("label-only-human", "labels.json", {
  labelVersion: "counterexample-labels-1",
  truthOrigin: "human-annotation",
  humanReviewed: true,
  note: "全部样本都带人工标签，但一个现场采集样本都没有 => executed 必须为 false。",
  labels: LABEL_ONLY.map(([id]) => L(id, "correct", SRC_HUMAN_LABEL)),
});

// ============================================================ 2. 指标格子
// 错误组（真值 incorrect）2 个：一个被误放行、一个被阻断
//   -> 全体口径 误放行 1/2；条件口径（仅可判定）1/1
// 正确组（真值 correct）5 个：一个 TP、一个明确失败、一个阻断、一个 invalid、一个 unknown
//   -> 全体口径 明确失败 1/5；可判定覆盖率 2/5
writeIn(
  "metric-cells",
  "ce-err-falseaccept.json",
  frame({
    sampleId: "ce-err-falseaccept",
    sourceType: "synthetic",
    // spread=12 已越过规则阈值 => 核心判 pass=true，但独立标注认为不合格 => 误放行
    landmarks: vHand(12),
    patch: { _counterexample: { group: "metric-cells", note: "真值 incorrect，预测 correct => 误放行" } },
  }),
);
writeIn(
  "metric-cells",
  "ce-err-blocked.json",
  frame({
    sampleId: "ce-err-blocked",
    sourceType: "synthetic",
    // 关键点出框 => 质量门 fingertip_oob => 阻断，不可判定
    landmarks: shiftOutOfFrame(vHand(18)),
    patch: { _counterexample: { group: "metric-cells", note: "真值 incorrect，被阻断 => 不可判定" } },
  }),
);
writeIn(
  "metric-cells",
  "ce-ok-scored.json",
  frame({
    sampleId: "ce-ok-scored",
    sourceType: "synthetic",
    landmarks: vHand(18),
    patch: { _counterexample: { group: "metric-cells", note: "真值 correct，预测 correct => 真阳" } },
  }),
);
writeIn(
  "metric-cells",
  "ce-ok-explicitfail.json",
  frame({
    sampleId: "ce-ok-explicitfail",
    sourceType: "synthetic",
    // spread=8 未达规则阈值 => 核心判 pass=false，但独立标注认为可接受 => 明确失败
    landmarks: vHand(8),
    patch: { _counterexample: { group: "metric-cells", note: "真值 correct，预测 incorrect => 明确失败" } },
  }),
);
writeIn(
  "metric-cells",
  "ce-ok-blocked.json",
  frame({
    sampleId: "ce-ok-blocked",
    sourceType: "synthetic",
    landmarks: shiftOutOfFrame(vHand(18)),
    patch: { _counterexample: { group: "metric-cells", note: "真值 correct，被阻断" } },
  }),
);
{
  // 缺尺寸 => invalid
  const body = frame({ sampleId: "ce-ok-invalid", sourceType: "synthetic", landmarks: vHand(18) });
  delete body.imageWidth;
  delete body.imageHeight;
  body._counterexample = { group: "metric-cells", note: "真值 correct，缺尺寸 => invalid" };
  writeIn("metric-cells", "ce-ok-invalid.json", body);
}
writeIn(
  "metric-cells",
  "ce-ok-unknown.json",
  frame({
    sampleId: "ce-ok-unknown",
    sourceType: "synthetic",
    landmarks: vHand(18),
    targetLetterId: "GF0021.NOT_A_LETTER",
    patch: { _counterexample: { group: "metric-cells", note: "真值 correct，目标字母未知 => unknown" } },
  }),
);

writeIn("metric-cells", "labels.json", {
  labelVersion: "counterexample-labels-1",
  truthOrigin: "synthetic-construction",
  humanReviewed: false,
  note: "只锁指标分母口径。样本被刻意钉在特定 (真值, 预测) 格子上，不是真实准确率。",
  labels: [
    L("ce-err-falseaccept", "incorrect", { note: "误放行格子" }),
    L("ce-err-blocked", "incorrect", { note: "错误组里的不可判定" }),
    L("ce-ok-scored", "correct", { note: "真阳格子" }),
    L("ce-ok-explicitfail", "correct", { note: "明确失败格子" }),
    L("ce-ok-blocked", "correct", { note: "正确组里的不可判定" }),
    L("ce-ok-invalid", "correct", { note: "正确组里的 invalid" }),
    L("ce-ok-unknown", "correct", { note: "正确组里的 unknown" }),
  ],
});

// ============================================================ 3. 序列判定层级
const t0 = 1758800100000;
const seq = (id, frames, note, extra = {}) =>
  writeIn("sequence-levels", `${id}.json`, {
    sampleId: id,
    kind: "sequence",
    schemaVersion: 2,
    coordSpace: "image_normalized",
    ...SIZE,
    sourceType: "synthetic",
    targetLetterId: "GF0021.V",
    frames: frames.map((f, i) => ({ frameId: i, ...f })),
    _counterexample: { group: "sequence-levels", note, ...extra },
  });

const okHand = vHand(18);
const badHand = vHand(2); // 两指并拢 => 几何不合格

// 动作错误：几何本身不合格
seq(
  "ce-seq-action-error",
  Array.from({ length: 8 }, (_, i) => ({ videoTime: i / 30, nowMs: t0 + i * 100, landmarks: badHand })),
  "动作错误：几何不合格，与「保持未完成」不是同一种",
);
// 保持未完成：几何合格但帧数不足
seq(
  "ce-seq-hold-pending",
  Array.from({ length: 5 }, (_, i) => ({ videoTime: i / 30, nowMs: t0 + i * 100, landmarks: okHand })),
  "保持未完成：几何合格但没停稳，与「动作错误」不是同一种",
);
// 无效时间轴：缺 nowMs
seq(
  "ce-seq-invalid-timeline",
  Array.from({ length: 8 }, (_, i) => ({ videoTime: i / 30, landmarks: okHand })),
  "无效时间轴：缺 nowMs，应在校验层判 invalid，不进判定链",
);
// 正常通过
seq(
  "ce-seq-pass",
  Array.from({ length: 8 }, (_, i) => ({ videoTime: i / 30, nowMs: t0 + i * 100, landmarks: okHand })),
  "序列通过",
);

writeIn("sequence-levels", "labels.json", {
  labelVersion: "counterexample-labels-1",
  truthOrigin: "synthetic-construction",
  humanReviewed: false,
  // 先声明序列任务的预期判定层级：整次尝试的产品放行（judge.decision），不是单帧几何。
  sequenceJudgmentLevel: "product_decision",
  sequenceJudgmentNote:
    "序列标签的 expectedVerdict 指「整次尝试是否应被产品放行」，即 judge().decision==='pass'，"
    + "不是单帧几何 pass。三个失败原因必须分开记：动作错误 / 保持未完成 / 无效时间轴。",
  labels: [
    L("ce-seq-action-error", "incorrect", { level: "sequence", expectedIssueCodes: ["index_middle.not_apart"], note: "动作错误" }),
    L("ce-seq-hold-pending", "incorrect", { level: "sequence", expectedIssueCodes: ["hold.pending"], note: "保持未完成" }),
    L("ce-seq-invalid-timeline", "incorrect", { level: "sequence", expectedIssueCodes: ["missing_timestamps"], note: "无效时间轴（校验层）" }),
    L("ce-seq-pass", "correct", { level: "sequence", note: "序列通过" }),
  ],
});

// ============================================================ 5. 证据链不得跨样本拼接（第三轮）
/**
 * 总控要求：来源、合格独立人工标签、协议关联、实际评估结果
 * **必须落在同一个合格样本上**，不能从不同样本各取一条拼出通过条件。
 *
 * 三组，各自只证明一件事：
 *   evidence-stitching/          纯拼接陷阱：四条分散，**没有任何样本四条齐全** => executed 必须 false
 *   evidence-stitching-positive/ 阳性对照：四条落在同一个样本上 => executed 必须 true
 *   evidence-all-blocked/        已尝试但零可判定结果 => executed 必须 false
 */
const CAMERA_PROTO = { protocol: "voluntary-participant-onsite-v1", consent: true, sessionId: "ce-stitch" };
const CE_NOTE = { group: "evidence-stitching" };

// --- 5a. 纯拼接陷阱 ---
// A：有协议、有标签，但被阻断 => 没有实际评估结果
writeIn(
  "evidence-stitching",
  "ce-stitch-a-protocol-blocked.json",
  frame({
    sampleId: "ce-stitch-a-protocol-blocked",
    sourceType: "camera",
    landmarks: shiftOutOfFrame(vHand(18)),
    patch: { collection: CAMERA_PROTO, _counterexample: { ...CE_NOTE, note: "有协议有标签但被阻断：无实际结果" } },
  }),
);
// B：可判定、有标签，但没有协议关联
writeIn(
  "evidence-stitching",
  "ce-stitch-b-decidable-noproto.json",
  frame({
    sampleId: "ce-stitch-b-decidable-noproto",
    sourceType: "camera",
    landmarks: vHand(18),
    patch: { _counterexample: { ...CE_NOTE, note: "可判定有标签但没有协议关联" } },
  }),
);
// C：来源是 camera、有协议、可判定，但标签是构造的 => 不算合格独立人工标签
writeIn(
  "evidence-stitching",
  "ce-stitch-c-camera-synthetic-label.json",
  frame({
    sampleId: "ce-stitch-c-camera-synthetic-label",
    sourceType: "camera",
    landmarks: vHand(18),
    patch: { collection: CAMERA_PROTO, _counterexample: { ...CE_NOTE, note: "camera+协议+可判定，但标签是构造的" } },
  }),
);

writeIn("evidence-stitching", "labels.json", {
  labelVersion: "counterexample-labels-2",
  truthOrigin: "human-annotation",
  humanReviewed: true,
  note: "纯拼接陷阱：四条条件分散在三个样本上，没有任何单个样本四条齐全。",
  labels: [
    L("ce-stitch-a-protocol-blocked", "correct", { ...SRC_HUMAN_LABEL }),
    L("ce-stitch-b-decidable-noproto", "correct", { ...SRC_HUMAN_LABEL }),
    L("ce-stitch-c-camera-synthetic-label", "correct", {
      truthOrigin: "synthetic-construction",
      humanReviewed: false,
      reviewedBy: "fixture-author:synthetic",
    }),
  ],
});

// --- 5b. 阳性对照：四条齐全 ---
// 没有它，「一律返回 false」也能骗过测试。
writeIn(
  "evidence-stitching-positive",
  "ce-stitch-f-qualified.json",
  frame({
    sampleId: "ce-stitch-f-qualified",
    sourceType: "camera",
    landmarks: vHand(18),
    patch: {
      collection: CAMERA_PROTO,
      _counterexample: { group: "evidence-stitching-positive", note: "阳性对照：四条条件落在同一个样本上" },
    },
  }),
);
writeIn("evidence-stitching-positive", "labels.json", {
  labelVersion: "counterexample-labels-2",
  truthOrigin: "human-annotation",
  humanReviewed: true,
  note: "阳性对照。它仍是构造样本（sourceType 只为验证逻辑），不是真实采集。",
  labels: [L("ce-stitch-f-qualified", "correct", { ...SRC_HUMAN_LABEL })],
});

// --- 5c. 全部阻断：已尝试但零可判定结果 ---
for (const n of [1, 2]) {
  writeIn(
    "evidence-all-blocked",
    `ce-ab-${n}.json`,
    frame({
      sampleId: `ce-ab-${n}`,
      sourceType: "camera",
      landmarks: shiftOutOfFrame(vHand(18)),
      patch: { collection: CAMERA_PROTO, _counterexample: { group: "evidence-all-blocked", note: `全部阻断之${n}` } },
    }),
  );
}
writeIn("evidence-all-blocked", "labels.json", {
  labelVersion: "counterexample-labels-2",
  truthOrigin: "human-annotation",
  humanReviewed: true,
  note: "现场采集 + 人工标签 + 协议，但全部被阻断 => 不算有效结果。",
  labels: [L("ce-ab-1", "correct", { ...SRC_HUMAN_LABEL }), L("ce-ab-2", "correct", { ...SRC_HUMAN_LABEL })],
});

console.log(`wrote counterexample fixtures to ${HERE}`);
