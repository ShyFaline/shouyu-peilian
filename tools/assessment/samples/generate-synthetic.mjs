/**
 * 合成手型生成器。全部产物 sourceType="synthetic"、humanReviewed=false。
 *
 * 不是真人数据，不是渲染图，不是视频抽帧。只用来验证「回放骨架」的接线，
 * 不得当作准确率、不得与 render/video/camera 组混算。
 *
 * 生成后必须用核心 evaluate/judge 核对意图是否真的达到（见 verify-samples.mjs）；
 * 生成器不自己实现任何国标规则、角度阈值或分类逻辑。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { POSES, SYNTHETIC_SIZE, buildHand } from "./lib/hand.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "synthetic");


function frameOf(poseName, extra = {}) {
  return { schemaVersion: 2, coordSpace: "image_normalized", ...SYNTHETIC_SIZE, mirrored: false, sourceType: "synthetic", ...extra, landmarks: buildHand(POSES[poseName]) };
}

function write(name, obj) {
  writeFileSync(join(OUT, name), `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  return name;
}

mkdirSync(OUT, { recursive: true });

const SYNTH = { sourceType: "synthetic", humanReviewed: false, synthetic: true };

// --- 单帧样本 ---
const single = [];
const addSingle = (id, targetLetterId, poseName, patch = {}) => {
  const body = frameOf(poseName, { frameId: single.length, capturedAt: 1758700000000 + single.length * 1000, ...patch });
  body.sampleId = id;
  body.targetLetterId = targetLetterId;
  body._synthetic = { ...SYNTH, intent: patch._intent ?? "" };
  delete body._intent;
  write(`${id}.json`, body);
  single.push(id);
};

addSingle("syn-v-pos", "GF0021.V", "V_OK", { _intent: "V 几何正例：应为几何通过" });
addSingle("syn-v-neg-spread", "GF0021.V", "V_TOGETHER", { _intent: "V 几何负例：两指未分开" });
addSingle("syn-u-geom-pass-judge-blocked", "GF0021.U", "U_OK", { _intent: "U 几何正例，但 U 为 pending_review，judge 应 blocked" });
addSingle("syn-l-pos", "GF0021.L", "L_OK", { _intent: "L 几何正例" });
addSingle("syn-l-neg-angle", "GF0021.L", "L_PARALLEL", { _intent: "L 几何负例：拇指食指未成直角" });
addSingle("syn-y-pos", "GF0021.Y", "Y_OK", { _intent: "Y 几何正例" });
addSingle("syn-a-pos", "GF0021.A", "A_OK", { _intent: "A 几何正例" });
addSingle("syn-b-pos", "GF0021.B", "B_OK", { _intent: "B 几何正例" });
addSingle("syn-w-pos", "GF0021.W", "W_OK", { _intent: "W 几何正例" });
addSingle("syn-i-pos", "GF0021.I", "I_OK", { _intent: "I 几何正例" });

// 缺尺寸：image_normalized 但不给宽高，禁止猜 1x1
{
  const body = buildHand(POSES.V_OK);
  write("syn-missing-size.json", {
    sampleId: "syn-missing-size",
    schemaVersion: 2,
    coordSpace: "image_normalized",
    mirrored: false,
    sourceType: "synthetic",
    capturedAt: 1758700010000,
    frameId: 100,
    targetLetterId: "GF0021.V",
    landmarks: body,
    _synthetic: { ...SYNTH, intent: "缺尺寸：必须 missing_size，不得回放为等价结果" },
  });
}
// 未知 coordSpace
{
  const body = buildHand(POSES.V_OK);
  write("syn-unsupported-space.json", {
    sampleId: "syn-unsupported-space",
    schemaVersion: 2,
    coordSpace: "screen_px",
    imageWidth: 640,
    imageHeight: 480,
    sourceType: "synthetic",
    capturedAt: 1758700011000,
    frameId: 101,
    targetLetterId: "GF0021.V",
    landmarks: body,
    _synthetic: { ...SYNTH, intent: "未知坐标空间：应 unsupported_coord_space" },
  });
}
// 坏数值：NaN / null / 少点
{
  const lm = buildHand(POSES.V_OK);
  const bad = lm.map((p) => ({ ...p }));
  bad[8] = { x: Number.NaN, y: bad[8].y };
  write("syn-bad-number-nan.json", {
    sampleId: "syn-bad-number-nan",
    schemaVersion: 2,
    coordSpace: "image_normalized",
    ...SYNTHETIC_SIZE,
    sourceType: "synthetic",
    capturedAt: 1758700012000,
    frameId: 102,
    targetLetterId: "GF0021.V",
    landmarks: bad,
    _synthetic: { ...SYNTH, intent: "NaN 坐标：应 non_finite" },
  });
  const short = lm.slice(0, 20);
  write("syn-bad-number-short.json", {
    sampleId: "syn-bad-number-short",
    schemaVersion: 2,
    coordSpace: "image_normalized",
    ...SYNTHETIC_SIZE,
    sourceType: "synthetic",
    capturedAt: 1758700013000,
    frameId: 103,
    targetLetterId: "GF0021.V",
    landmarks: short,
    _synthetic: { ...SYNTH, intent: "只有 20 点：应 landmarks 拒绝" },
  });
  const nullxy = lm.map((p) => ({ ...p }));
  nullxy[12] = { x: null, y: 0.5 };
  write("syn-bad-number-null.json", {
    sampleId: "syn-bad-number-null",
    schemaVersion: 2,
    coordSpace: "image_normalized",
    ...SYNTHETIC_SIZE,
    sourceType: "synthetic",
    capturedAt: 1758700014000,
    frameId: 104,
    targetLetterId: "GF0021.V",
    landmarks: nullxy,
    _synthetic: { ...SYNTH, intent: "null 坐标：应 missing_xy / non_finite" },
  });
}
// 伪标签：采集文件里塞了 verdict 字段，必须被识别为伪标签而不是标签
{
  const body = frameOf("V_OK", { frameId: 105, capturedAt: 1758700015000 });
  write("syn-pseudo-label.json", {
    sampleId: "syn-pseudo-label",
    ...body,
    targetLetterId: "GF0021.V",
    expectedVerdict: "correct",
    pass: true,
    decision: "pass",
    practiceStatus: "pose_practice",
    _synthetic: { ...SYNTH, intent: "采集文件内含 expectedVerdict/pass/decision：必须只当伪标签" },
  });
}
// 无标签：几何完好，但没有独立标签
{
  const body = frameOf("Y_OK", { frameId: 106, capturedAt: 1758700016000 });
  write("syn-unlabeled.json", {
    sampleId: "syn-unlabeled",
    ...body,
    targetLetterId: "GF0021.Y",
    _synthetic: { ...SYNTH, intent: "无独立标签：不得进准确率分子分母" },
  });
}
// equal_scale_unit 显式合成通道
{
  const body = frameOf("V_OK", { frameId: 107, capturedAt: 1758700017000 });
  write("syn-equal-scale-unit.json", {
    sampleId: "syn-equal-scale-unit",
    ...body,
    coordSpace: "equal_scale_unit",
    imageWidth: undefined,
    imageHeight: undefined,
    targetLetterId: "GF0021.V",
    _synthetic: { ...SYNTH, intent: "equal_scale_unit 显式合成通道：应可几何判定" },
  });
}

// --- 连续序列样本 ---
function writeSeq(id, targetLetterId, frames, intent, patch = {}) {
  write(`${id}.json`, {
    sampleId: id,
    kind: "sequence",
    schemaVersion: 2,
    targetLetterId,
    sourceType: "synthetic",
    coordSpace: "image_normalized",
    ...SYNTHETIC_SIZE,
    frames: frames.map((f, i) => ({ frameId: i, ...f })),
    _synthetic: { ...SYNTH, intent, ...patch },
  });
}

const lm = buildHand(POSES.V_OK);
const t0 = 1758700100000;
// 6 帧、间隔 100ms（<400ms）：应开放 pass
writeSeq("syn-seq-v-pass", "GF0021.V", Array.from({ length: 6 }, (_, i) => ({ videoTime: i / 30, nowMs: t0 + i * 100, landmarks: lm })), "6 个不同 videoTime、间隔 100ms：应 pass");
// 只有 5 帧：不应 pass
writeSeq("syn-seq-v-short", "GF0021.V", Array.from({ length: 5 }, (_, i) => ({ videoTime: i / 30, nowMs: t0 + i * 100, landmarks: lm })), "只有 5 帧：不应 pass");
// 6 帧但间隔 401ms：超时清零，不应 pass
writeSeq("syn-seq-v-expired", "GF0021.V", Array.from({ length: 6 }, (_, i) => ({ videoTime: i / 30, nowMs: t0 + i * 401, landmarks: lm })), "6 帧但每帧间隔 401ms：应超时清零，不 pass");
// 重复 videoTime 不计数
writeSeq("syn-seq-v-dup", "GF0021.V", Array.from({ length: 8 }, (_, i) => ({ videoTime: Math.floor(i / 2) / 30, nowMs: t0 + i * 100, landmarks: lm })), "重复 videoTime 不计数：4 个不同帧不应 pass");
// 时间倒退：fail closed
writeSeq("syn-seq-v-backwards", "GF0021.V", [
  { videoTime: 0.0, nowMs: t0, landmarks: lm },
  { videoTime: 0.1, nowMs: t0 + 100, landmarks: lm },
  { videoTime: 0.05, nowMs: t0 + 200, landmarks: lm },
  { videoTime: 0.2, nowMs: t0 + 300, landmarks: lm },
], "videoTime 倒退：应清零，不得 pass");
// 序列里混入「没检测到手」的帧：合法观测，不该判成损坏；后面 6 帧仍应开放 pass
writeSeq("syn-seq-v-nohand-then-pass", "GF0021.V", [
  { videoTime: 0.0, nowMs: t0, landmarks: null },
  { videoTime: 0.033, nowMs: t0 + 100, landmarks: null },
  ...Array.from({ length: 6 }, (_, i) => ({ videoTime: 0.066 + i / 30, nowMs: t0 + 200 + i * 100, landmarks: lm })),
], "前两帧没有手（landmarks 缺失）：应记警告不记损坏，后 6 帧开放 pass");

// --- 标签文件 ---
/**
 * level 决定 expectedVerdict 的含义（同一 schema，语义按层区分）：
 *   geometry : 手型是否符合该字母规则      == evaluate().pass
 *   quality  : 输入质量是否足够            == assessInputQuality().ok
 *   sequence : 保持门是否应开放 pass       == judge().decision === "pass"
 * 序列标签的期望来自 passState 当前 spec（PASS_FRAMES/MAX_GAP_MS 仍标 UNVERIFIED），
 * 所以 truthOrigin 记 spec-derived-gate，既不是真人也不是测量结果。
 */
const L = (sampleId, expectedVerdict, level, extra = {}) => ({
  sampleId,
  expectedVerdict,
  expectedIssueCodes: [],
  level,
  reviewedBy: "fixture-author:synthetic",
  reviewedAt: "2026-09-24T00:00:00Z",
  independent: true,
  labelVersion: "synthetic-labels-1",
  truthOrigin: "synthetic-construction",
  humanReviewed: false,
  ...extra,
});

const G = (sampleId, expectedVerdict, extra) => L(sampleId, expectedVerdict, "geometry", extra);
const SEQ = (sampleId, expectedVerdict, extra) =>
  L(sampleId, expectedVerdict, "sequence", { truthOrigin: "spec-derived-gate", ...extra });

write("labels.json", {
  labelVersion: "synthetic-labels-1",
  truthOrigin: "synthetic-construction",
  humanReviewed: false,
  note: "合成夹具标签，不是真人标注。只验证回放骨架接线，不得当准确率。序列标签的期望来自 passState spec。",
  labels: [
    G("syn-v-pos", "correct"),
    G("syn-v-neg-spread", "incorrect", { expectedIssueCodes: ["index_middle.not_apart"] }),
    G("syn-l-pos", "correct"),
    G("syn-l-neg-angle", "incorrect", { expectedIssueCodes: ["thumb_index.angle"] }),
    G("syn-y-pos", "correct"),
    G("syn-a-pos", "correct"),
    G("syn-b-pos", "correct"),
    G("syn-w-pos", "correct"),
    G("syn-i-pos", "correct"),
    SEQ("syn-seq-v-pass", "correct", { note: "6 帧 100ms 间隔，门应开放" }),
    SEQ("syn-seq-v-short", "incorrect", { note: "只有 5 帧，门不应开放" }),
    SEQ("syn-seq-v-expired", "incorrect", { note: "间隔 401ms 超时清零，门不应开放" }),
    SEQ("syn-seq-v-dup", "incorrect", { note: "重复 videoTime 不计数，门不应开放" }),
    SEQ("syn-seq-v-backwards", "incorrect", { note: "videoTime 倒退清零，门不应开放" }),
    SEQ("syn-seq-v-nohand-then-pass", "correct", { note: "前两帧没手不算损坏，后 6 帧应开放" }),
  ],
});

// 伪标签文件：标签直接抄自预测/工具自身输出，必须整份被拒
write("labels.pseudo.json", {
  labelVersion: "pseudo-1",
  note: "反面夹具：标签来自工具自身预测，必须被拒收，不得进准确率。",
  labels: [
    { sampleId: "syn-v-pos", expectedVerdict: "correct", level: "geometry", reviewedBy: "auto", independent: false, derivedFrom: "u_pass" },
    { sampleId: "syn-v-neg-spread", expectedVerdict: "correct", level: "geometry", reviewedBy: "model:judge", independent: true },
    { sampleId: "syn-l-pos", expectedVerdict: "correct", level: "not_a_level", reviewedBy: "human:h1", independent: true },
  ],
});

write("MANIFEST.json", {
  generatedBy: "tools/assessment/samples/generate-synthetic.mjs",
  generatedAt: new Date().toISOString(),
  warning: "全部为合成样本。不是真人数据、不是渲染图、不是视频抽帧。禁止与其它来源混算，禁止当准确率。",
  synthetic: true,
  humanReviewed: false,
  singles: single,
});

console.log(`wrote synthetic samples to ${OUT}`);
