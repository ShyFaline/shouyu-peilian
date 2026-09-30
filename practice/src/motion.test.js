/**
 * motion.js 合成序列回归。合成样本只做规则回归，
 * 不等于国标符合，也不等于真实摄像头检测通过。
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createMotionState,
  startCollecting,
  resetMotion,
  observeSample,
  matchMotion,
  motionWindowExpired,
  motionView,
  MOTION_WINDOW_MS,
  MOTION_MAX_GAP_MS,
} from "./motion.js";

const TRACE_HOOK = { kind: "trace", finger: "pinky", path: "hook" };
const TRACE_Z = { kind: "trace", finger: "index", path: "z" };
const SHAKE_V = { kind: "shake", part: "hand", axis: "vertical", cycles: 2 };
const SHAKE_F = { kind: "shake", part: "fingers", axis: "forward", cycles: 2 };

function collecting() {
  return startCollecting(createMotionState(), 0);
}

/** 依次喂入点列，videoTime/nowMs 从 0 起每帧 step ms。返回记录成功数。 */
function feed(state, points, { step = 80, t0 = 0, curlsOf = null, zOf = null } = {}) {
  let ok = 0;
  points.forEach((p, i) => {
    const t = t0 + i * step;
    const accepted = observeSample(state, {
      point: { x: p[0], y: p[1], z: zOf ? zOf(p, i) : 0 },
      curls: curlsOf ? curlsOf(p, i) : null,
      videoTime: t / 1000,
      nowMs: t,
    });
    if (accepted) ok += 1;
  });
  return ok;
}

test("observeSample 只在 collecting 阶段记录", () => {
  const state = createMotionState();
  assert.equal(observeSample(state, { point: { x: 0, y: 0 }, videoTime: 0, nowMs: 0 }), false);
  assert.equal(state.samples.length, 0);
  startCollecting(state, 0);
  assert.equal(observeSample(state, { point: { x: 0, y: 0 }, videoTime: 0, nowMs: 0 }), true);
  assert.equal(state.samples.length, 1);
});

test("同一 videoTime 不双计", () => {
  const state = collecting();
  feed(state, [[0, 0], [0.4, 0], [0.8, 0]], { step: 80 });
  const before = state.samples.length;
  assert.equal(observeSample(state, { point: { x: 1, y: 1 }, videoTime: 0.16, nowMs: 200 }), false);
  assert.equal(state.samples.length, before);
});

test("gap 超时清空缓冲并以当帧重启窗口", () => {
  const state = collecting();
  feed(state, [[0, 0], [0.4, 0], [0.8, 0]], { step: 80 });
  assert.equal(state.samples.length, 3);
  observeSample(state, { point: { x: 1.2, y: 0 }, videoTime: 0.16 + MOTION_MAX_GAP_MS / 1000 + 0.001, nowMs: 160 + MOTION_MAX_GAP_MS + 1 });
  assert.equal(state.samples.length, 1, "gap 后旧样本清空，只留当帧");
  assert.equal(state.windowStartMs, 160 + MOTION_MAX_GAP_MS + 1);
});

test("非有限 / 负 / 倒退时间戳回落 pose", () => {
  for (const bad of [
    { videoTime: Number.NaN, nowMs: 100 },
    { videoTime: 0.1, nowMs: Number.NaN },
    { videoTime: -0.1, nowMs: 100 },
    { videoTime: 0.1, nowMs: -1 },
  ]) {
    const state = collecting();
    feed(state, [[0, 0], [0.4, 0]], { step: 80 });
    observeSample(state, { point: { x: 0.8, y: 0 }, ...bad });
    assert.equal(state.phase, "pose");
    assert.equal(state.samples.length, 0);
  }
  const state = collecting();
  feed(state, [[0, 0], [0.4, 0], [0.8, 0]], { step: 80 });
  observeSample(state, { point: { x: 1, y: 0 }, videoTime: 0.05, nowMs: 300 });
  assert.equal(state.phase, "pose", "videoTime 倒退回落");
});

test("无效点回落 pose", () => {
  const state = collecting();
  feed(state, [[0, 0], [0.4, 0]], { step: 80 });
  observeSample(state, { point: { x: Number.NaN, y: 0 }, videoTime: 0.16, nowMs: 160 });
  assert.equal(state.phase, "pose");
});

test("窗口超时判定", () => {
  const state = collecting();
  assert.equal(motionWindowExpired(state, MOTION_WINDOW_MS), false);
  assert.equal(motionWindowExpired(state, MOTION_WINDOW_MS + 1), true);
  resetMotion(state);
  assert.equal(motionWindowExpired(state, MOTION_WINDOW_MS + 5000), false, "pose 阶段无窗口");
});

test("hook 轨迹：先下行再内勾可匹配", () => {
  const state = collecting();
  feed(state, [
    [0, 0], [0, 0.4], [0, 0.8],
    [0.4, 0.8], [0.8, 0.8],
  ]);
  const r = matchMotion(state, TRACE_HOOK);
  assert.equal(r.matched, true, JSON.stringify(r));
});

test("hook 轨迹：只下行不匹配", () => {
  const state = collecting();
  feed(state, [[0, 0], [0, 0.4], [0, 0.8], [0, 1.2]]);
  const r = matchMotion(state, TRACE_HOOK);
  assert.equal(r.matched, false);
  assert.equal(r.reason, "pattern_mismatch");
});

test("hook 轨迹：上行不匹配", () => {
  const state = collecting();
  feed(state, [[0, 1.2], [0, 0.8], [0, 0.4], [0.4, 0.4], [0.8, 0.4]]);
  const r = matchMotion(state, TRACE_HOOK);
  assert.equal(r.matched, false);
});

test("z 轨迹：右-斜下-右可匹配，镜像也可匹配", () => {
  const right = collecting();
  feed(right, [
    [0, 0], [0.4, 0], [0.8, 0],
    [0.53, 0.27], [0.27, 0.53], [0, 0.8],
    [0.4, 0.8], [0.8, 0.8],
  ]);
  assert.equal(matchMotion(right, TRACE_Z).matched, true);
  const left = collecting();
  feed(left, [
    [0.8, 0], [0.4, 0], [0, 0],
    [0.27, 0.27], [0.53, 0.53], [0.8, 0.8],
    [0.4, 0.8], [0, 0.8],
  ]);
  assert.equal(matchMotion(left, TRACE_Z).matched, true);
});

test("z 轨迹：单程横线不匹配，路程太短不匹配", () => {
  const line = collecting();
  feed(line, [[0, 0], [0.4, 0], [0.8, 0], [1.2, 0], [1.6, 0]]);
  assert.equal(matchMotion(line, TRACE_Z).matched, false);
  const short = collecting();
  feed(short, [[0, 0], [0.4, 0], [0.2, 0.4]]);
  const r = matchMotion(short, TRACE_Z);
  assert.equal(r.matched, false);
  assert.equal(r.reason, "too_short");
});

test("vertical shake：两个完整周期可匹配", () => {
  const state = collecting();
  const wave = [0, 0.3, 0.5, 0.3, 0, -0.3, -0.5, -0.3, 0, 0.3, 0.5, 0.3, 0, -0.3, -0.5, -0.3, 0];
  feed(state, wave.map((y) => [0, y]));
  const r = matchMotion(state, SHAKE_V);
  assert.equal(r.matched, true, JSON.stringify(r));
});

test("vertical shake：振幅不足 / 只晃一次不匹配", () => {
  const weak = collecting();
  const weakWave = [0, 0.12, 0.2, 0.12, 0, -0.12, -0.2, -0.12, 0, 0.12, 0.2, 0.12, 0, -0.12, -0.2, -0.12, 0];
  feed(weak, weakWave.map((y) => [0, y]));
  assert.equal(matchMotion(weak, SHAKE_V).matched, false);
  const once = collecting();
  feed(once, [0, 0.3, 0.5, 0.3, 0, -0.3, -0.5, -0.3, 0].map((y) => [0, y]));
  assert.equal(matchMotion(once, SHAKE_V).matched, false);
});

test("vertical shake：平移（直流漂移）不算振荡", () => {
  const state = collecting();
  feed(state, [[0, 0], [0, 0.4], [0, 0.8], [0, 1.2], [0, 1.6], [0, 2.0], [0, 2.4]]);
  assert.equal(matchMotion(state, SHAKE_V).matched, false);
});

test("forward shake：z 振荡可匹配", () => {
  const state = collecting();
  const wave = [0, 0.3, 0.5, 0.3, 0, -0.3, -0.5, -0.3, 0, 0.3, 0.5, 0.3, 0, -0.3, -0.5, -0.3, 0];
  feed(state, wave.map((z) => [0, 0]), { zOf: (p, i) => wave[i] });
  const r = matchMotion(state, SHAKE_F);
  assert.equal(r.matched, true, JSON.stringify(r));
});

test("forward shake：curl 往复可作信号（UNVERIFIED 通道）", () => {
  const state = collecting();
  const pts = Array.from({ length: 9 }, () => [0, 0]);
  feed(state, pts, {
    curlsOf: (p, i) => ({ index: i % 2 === 0 ? "none" : "full" }),
  });
  const r = matchMotion(state, SHAKE_F);
  assert.equal(r.matched, true, JSON.stringify(r));
  assert.equal(r.reason, "ok_via_curl");
});

test("forward shake：静止手不匹配", () => {
  const state = collecting();
  const pts = Array.from({ length: 10 }, () => [0, 0]);
  feed(state, pts, { curlsOf: () => ({ index: "none" }) });
  assert.equal(matchMotion(state, SHAKE_F).matched, false);
});

test("未知 spec 不匹配", () => {
  const state = collecting();
  feed(state, [[0, 0], [0.4, 0], [0.8, 0]]);
  assert.equal(matchMotion(state, { kind: "teleport" }).reason, "unknown_spec");
  assert.equal(matchMotion(state, null).reason, "unknown_spec");
});

test("motionView 透出阶段与阈值", () => {
  const state = collecting();
  feed(state, [[0, 0], [0.4, 0]]);
  const view = motionView(state);
  assert.equal(view.phase, "collecting");
  assert.equal(view.samples, 2);
  assert.equal(view.windowMs, MOTION_WINDOW_MS);
});

test("resetMotion 清空并回到 pose", () => {
  const state = collecting();
  feed(state, [[0, 0], [0.4, 0], [0.8, 0]]);
  resetMotion(state);
  assert.equal(state.phase, "pose");
  assert.equal(state.samples.length, 0);
  assert.equal(state.lastVideoTime, null);
});

console.log("motion.test.js 合成序列回归完成");
