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
import { judge, presentJudge, createHold } from "./judge.js";

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

// ---- judge 编排层：合成字母走通 hold → collecting → match → pass ----
// 生产不可达（EH/UE 在状态门被 blocked），这里用合成 pose_practice + motion 字母驱动 judge()。

const UNIT = { width: 1, height: 1, coordSpace: "image_normalized" };

function pt(x, y, z = 0) {
  return { x, y, z };
}

function setFinger(lm, mcp, extended, x, tipX) {
  const mcpY = 0.58;
  const tx = tipX ?? x;
  lm[mcp] = pt(x, mcpY);
  if (extended) {
    lm[mcp + 1] = pt(x + (tx - x) / 3, mcpY - 0.12);
    lm[mcp + 2] = pt(x + (tx - x) * 2 / 3, mcpY - 0.24);
    lm[mcp + 3] = pt(tx, mcpY - 0.36);
  } else {
    lm[mcp + 1] = pt(x, mcpY - 0.05);
    lm[mcp + 2] = pt(x + 0.015, mcpY + 0.04);
    lm[mcp + 3] = pt(x + 0.02, mcpY + 0.1);
  }
}

/** 四指并拢伸直、拇指收起（UE 静态部分同形），可整体平移用于 shake。 */
function shakeHand(dy = 0) {
  const lm = Array.from({ length: 21 }, () => pt(0.5, 0.5));
  lm[0] = pt(0.5, 0.9);
  lm[1] = pt(0.42, 0.82);
  lm[2] = pt(0.36, 0.74);
  lm[3] = pt(0.4, 0.7);
  lm[4] = pt(0.44, 0.76);
  setFinger(lm, 5, true, 0.44);
  setFinger(lm, 9, true, 0.5);
  setFinger(lm, 13, true, 0.56);
  setFinger(lm, 17, true, 0.62);
  if (dy) for (const p of lm) p.y += dy;
  return lm;
}

const SHAKE_LETTER = {
  id: "GF0021.T1",
  label: "T1",
  hand: "right",
  practiceStatus: "pose_practice",
  rules: {
    extended: ["index", "middle", "ring", "pinky"],
    curled: ["thumb"],
    pointing: "up",
    motion: { kind: "shake", part: "hand", axis: "vertical", cycles: 2 },
  },
};

/** 逐帧驱动 judge()，motion 状态作为第三参传入（与 app.js:576 调用方式一致）。 */
function drive(letter, hold, motionState, frames) {
  let judged = null;
  let t = frames.t0 || 0;
  for (const lm of frames.hands) {
    judged = judge(
      { letter, lm, hands: [lm], geom: UNIT, videoTime: t / 1000, nowMs: t },
      hold,
      motionState,
    );
    t += frames.step ?? 80;
  }
  return { judged, nextT: t };
}

test("judge 编排：静态保持 → 收集 → 晃动两周期 → pass", () => {
  const hold = createHold();
  const motionState = createMotionState();

  // 阶段一：手型保持 4 秒（PASS_MS=3000），应进入 collecting，decision 仍 fail（动作未完成），
  // 进入收集瞬间提示做动作；保持不动时逐帧匹配会给 no_oscillation 提示，两者都属"晃动"类引导
  const hold1 = drive(SHAKE_LETTER, hold, motionState, { hands: shakeHands(0, 40), step: 100 });
  assert.equal(hold1.judged.decision, "fail");
  assert.equal(hold1.judged.motion.phase, "collecting");
  assert.match(hold1.judged.issues[0].hint, /晃动/);
  assert.match(presentJudge(hold1.judged).title, /晃动/);

  // 阶段二：整体上下平移两个完整周期（幅度超过 MIN_AMPLITUDE），应 pass
  const amp = 0.16; // 绝对平移幅度；handScale≈0.32，归一化后 0.5 > MIN_AMPLITUDE(0.35)
  const wave = [0, amp, 0, -amp, 0, amp, 0, -amp, 0, amp, 0, -amp, 0];
  const hold2 = createHold();
  const r2 = drive(SHAKE_LETTER, hold2, motionState, {
    hands: wave.map((dy) => shakeHand(dy)),
    t0: hold1.nextT,
  });
  assert.equal(r2.judged.decision, "pass", JSON.stringify(r2.judged.motion));
  assert.equal(presentJudge(r2.judged).title, "做对了");
});

test("judge 编排：窗口超时回落重新计时；晃不动给出 almost 提示", () => {
  // 超时：进 collecting 后停住不动，超过窗口后下一帧回到重新保持（fail + 保持住）
  const holdA = createHold();
  const m1 = createMotionState();
  const r1 = drive(SHAKE_LETTER, holdA, m1, { hands: shakeHands(0, 40), step: 100 });
  assert.equal(r1.judged.motion.phase, "collecting");
  const r1b = drive(SHAKE_LETTER, createHold(), m1, { hands: shakeHands(0, 1), t0: r1.nextT + 4000 });
  assert.equal(r1b.judged.decision, "fail");
  assert.equal(r1b.judged.motion.phase, "pose", "超时后回落重新保持");
  assert.equal(m1.samples.length, 0, "旧缓冲已清空");
  assert.match(r1b.judged.issues[0].hint, /重新来/);

  // 晃一次：few_cycles → fail + 次数提示
  const holdB = createHold();
  const m2 = createMotionState();
  const r2 = drive(SHAKE_LETTER, holdB, m2, { hands: shakeHands(0, 40), step: 100 });
  assert.equal(r2.judged.motion.phase, "collecting");
  const wave = [0, 0.16, 0, -0.16, 0, 0, 0, 0]; // 只有一个完整周期
  const r3 = drive(SHAKE_LETTER, createHold(), m2, { hands: wave.map((dy) => shakeHand(dy)), t0: r2.nextT });
  assert.equal(r3.judged.decision, "fail");
  assert.match(r3.judged.issues[0].hint, /次数不够|晃动/);
});

function shakeHands(dy, n) {
  return Array.from({ length: n }, () => shakeHand(dy));
}

console.log("motion.test.js 合成序列回归完成");
