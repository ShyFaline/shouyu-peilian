/**
 * 动态判定层：轨迹（画钩 / 画 Z）与晃动（上下 / 前后）检测。
 * 纯函数模块：无 DOM、无摄像头、无 MediaPipe，只消费归一化点列与时间戳。
 * 时间戳纪律与 passState 一致：videoTime/nowMs 有限、非负、单调不减；
 * 同一 videoTime 不双计；gap 超时清空缓冲（先过期后去重）。
 * 违规一律回落 pose 阶段重新进入（fail-closed）。
 * 所有阈值均为 UNVERIFIED 初值，未经真实样本标定，不是实验结论。
 */

export const MOTION_WINDOW_MS = 3000; // UNVERIFIED 待验证
export const MOTION_MAX_GAP_MS = 400; // UNVERIFIED 待验证，与保持门同量级
export const MIN_STEP = 0.3; // UNVERIFIED：手尺度单位，抽稀最小位移
export const MIN_TOTAL_PATH = 1.2; // UNVERIFIED：手尺度单位，trace 全程最小路程
export const MIN_AMPLITUDE = 0.35; // UNVERIFIED：手尺度单位，shake 半周期最小振幅
export const MIN_OSC_SAMPLES = 6; // UNVERIFIED：晃动检测最少采样数

// 图像坐标系（y 向下）。抽稀后的位移段量化到这 8 个方向。
const DIRS8 = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
const DOWN = ["S", "SE", "SW"];
const RIGHT = ["E", "NE", "SE"];
const LEFT = ["W", "NW", "SW"];
const HORIZONTAL = [...RIGHT, ...LEFT];
const DIAG_DOWN = ["SE", "SW"];

/**
 * 目标轨迹模式：方向串的游程序列（观看者视角；左手镜像由规范 5.1 处理，
 * 具体收拢方向以 docs/内容核定表.md 人工对图结论为准，此处为程序初值）。
 * hook：先下行，再向内勾（水平方向不限左右，含下斜过渡）。
 * z：右 → 斜下（反斜杠走向）→ 右；左下 → 右 的镜像写法同样接受。
 */
const TRACE_PATTERNS = {
  hook: [DOWN, HORIZONTAL],
  z: [RIGHT, DIAG_DOWN, RIGHT],
};
// Z 的镜像序列（观看者视角左起笔）。
const TRACE_PATTERNS_ALT = {
  hook: null,
  z: [LEFT, DIAG_DOWN, LEFT],
};

export function createMotionState(opts = {}) {
  return {
    phase: "pose", // pose | collecting
    samples: [], // { x, y, z, curls, videoTime, nowMs }，x/y 为手尺度归一
    lastVideoTime: null,
    lastTs: null,
    windowStartMs: null,
    windowMs: opts.windowMs ?? MOTION_WINDOW_MS,
    maxGapMs: opts.maxGapMs ?? MOTION_MAX_GAP_MS,
  };
}

export function resetMotion(state) {
  if (!state) return state;
  state.phase = "pose";
  state.samples = [];
  state.lastVideoTime = null;
  state.lastTs = null;
  state.windowStartMs = null;
  return state;
}

export function startCollecting(state, nowMs) {
  if (!state) return state;
  state.phase = "collecting";
  state.samples = [];
  state.lastVideoTime = null;
  state.lastTs = null;
  state.windowStartMs = Number.isFinite(nowMs) ? nowMs : null;
  return state;
}

export function motionWindowExpired(state, nowMs) {
  return Boolean(
    state && state.phase === "collecting" &&
    Number.isFinite(state.windowStartMs) && Number.isFinite(nowMs) &&
    nowMs - state.windowStartMs > state.windowMs,
  );
}

/**
 * 记录一个动态采样。point 为手尺度归一化后的追踪点 {x,y,z}，curls 为当帧五指分类。
 * 返回 true 表示本帧被记录。时间戳违规或点无效 → 回落 pose（重新进静态门）。
 */
export function observeSample(state, sample = {}) {
  try {
    if (!state || state.phase !== "collecting") return false;
    const { videoTime, nowMs } = sample;
    if (!Number.isFinite(videoTime) || !Number.isFinite(nowMs) ||
        videoTime < 0 || nowMs < 0 ||
        (state.lastVideoTime != null && videoTime < state.lastVideoTime) ||
        (state.lastTs != null && nowMs < state.lastTs)) {
      resetMotion(state);
      return false;
    }
    if (state.lastTs != null && nowMs - state.lastTs > state.maxGapMs) {
      state.samples = [];
      state.windowStartMs = nowMs;
    }
    // 过期必须先于去重，与 observePass 同一顺序。
    if (videoTime === state.lastVideoTime) return false;
    const p = sample.point;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      resetMotion(state);
      return false;
    }
    state.samples.push({
      x: p.x,
      y: p.y,
      z: Number.isFinite(p.z) ? p.z : 0,
      curls: sample.curls || null,
      videoTime,
      nowMs,
    });
    state.lastVideoTime = videoTime;
    state.lastTs = nowMs;
    return true;
  } catch {
    resetMotion(state);
    return false;
  }
}

export function motionView(state) {
  return {
    phase: state?.phase || "pose",
    samples: state?.samples?.length || 0,
    windowMs: state?.windowMs ?? MOTION_WINDOW_MS,
    maxGapMs: state?.maxGapMs ?? MOTION_MAX_GAP_MS,
  };
}

function dist2d(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 按最小位移抽稀：保留首点，距上一保留点 >= minStep 才再保留，末点必保留。 */
function decimate(samples, minStep) {
  const kept = [];
  for (const s of samples) {
    const last = kept[kept.length - 1];
    if (!last || dist2d(last, s) >= minStep) kept.push(s);
  }
  if (samples.length && kept[kept.length - 1] !== samples[samples.length - 1]) {
    const last = samples[samples.length - 1];
    if (kept.length >= 2 && dist2d(kept[kept.length - 1], last) < minStep) {
      kept[kept.length - 1] = last;
    } else {
      kept.push(last);
    }
  }
  return kept;
}

function pathLength(pts) {
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) total += dist2d(pts[i - 1], pts[i]);
  return total;
}

function dirOf(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 1e-9) return null;
  const idx = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  return DIRS8[idx];
}

/** 方向序列 + 游程压缩。 */
function directionRuns(pts) {
  const runs = [];
  for (let i = 1; i < pts.length; i += 1) {
    const d = dirOf(pts[i - 1], pts[i]);
    if (!d) continue;
    if (runs.length && runs[runs.length - 1] === d) continue;
    runs.push(d);
  }
  return runs;
}

/**
 * 方向串与模式比对：模式是若干段，每段是一组可接受方向。
 * 允许整体多余前缀（起手移动），段内方向必须全部落在该段可接受集合。
 * 返回 { matched, consumed, reason }。
 */
function matchPattern(dirs, pattern) {
  if (!pattern) return { matched: false, consumed: 0, reason: "no_pattern" };
  outer:
  for (let start = 0; start + pattern.length <= dirs.length; start += 1) {
    let i = start;
    for (const accept of pattern) {
      if (i >= dirs.length || !accept.includes(dirs[i])) continue outer;
      while (i < dirs.length && accept.includes(dirs[i])) i += 1;
    }
    return { matched: true, consumed: i - start, reason: "ok" };
  }
  return { matched: false, consumed: 0, reason: "pattern_mismatch" };
}

function matchTrace(samples) {
  if (samples.length < 2) {
    return { matched: false, progress: 0, reason: "too_few_samples" };
  }
  const pts = decimate(samples, MIN_STEP);
  const total = pathLength(pts);
  if (total < MIN_TOTAL_PATH) {
    return { matched: false, progress: Math.min(0.4, total / MIN_TOTAL_PATH * 0.4), reason: "too_short" };
  }
  const dirs = directionRuns(pts);
  return { matched: false, progress: 0.5, reason: "pattern_mismatch", dirs };
}

function matchTraceSpec(samples, spec) {
  const base = matchTrace(samples, spec);
  if (base.dirs === undefined) return base;
  const dirs = base.dirs;
  const main = matchPattern(dirs, TRACE_PATTERNS[spec.path]);
  if (main.matched) return { matched: true, progress: 1, reason: "ok" };
  const alt = matchPattern(dirs, TRACE_PATTERNS_ALT[spec.path]);
  if (alt.matched) return { matched: true, progress: 1, reason: "ok" };
  return { matched: false, progress: 0.5, reason: "pattern_mismatch" };
}

/**
 * 振荡周期计数：序列相对首值的符号偏移，每个极值摆幅记为半个周期，
 * 每两个振幅合格的半周期记为一个整周期。hysteresis 抗噪声（UNVERIFIED 初值 0.08）。
 */
function countCycles(values, minAmplitude) {
  const H = 0.08;
  if (values.length < MIN_OSC_SAMPLES) return { cycles: 0, halves: 0 };
  const base = values[0];
  let sign = 0; // 1=偏正, -1=偏负
  let extreme = 0;
  const halfAmps = [];
  for (const v of values) {
    const d = v - base;
    if (sign === 0) {
      if (d > H) { sign = 1; extreme = d; }
      else if (d < -H) { sign = -1; extreme = d; }
      continue;
    }
    if (Math.sign(d) === sign || Math.abs(d) <= H) {
      if (Math.abs(d) > Math.abs(extreme)) extreme = d;
      continue;
    }
    // 符号翻转：结束一个半周期
    halfAmps.push(Math.abs(extreme));
    sign = -sign;
    extreme = d;
  }
  if (extreme !== 0) halfAmps.push(Math.abs(extreme));
  const qualified = halfAmps.filter((a) => a >= minAmplitude).length;
  return { cycles: Math.floor(qualified / 2), halves: halfAmps.length };
}

function matchShake(samples, spec) {
  if (samples.length < MIN_OSC_SAMPLES) {
    return { matched: false, progress: 0, reason: "too_few_samples" };
  }
  const need = Number.isInteger(spec.cycles) && spec.cycles > 0 ? spec.cycles : 2;
  if (spec.axis === "vertical") {
    const r = countCycles(samples.map((s) => s.y), MIN_AMPLITUDE);
    return r.cycles >= need
      ? { matched: true, progress: 1, reason: "ok" }
      : { matched: false, progress: Math.min(0.8, r.cycles / need), reason: r.cycles || r.halves ? "few_cycles" : "no_oscillation" };
  }
  if (spec.axis === "forward") {
    // 双通道：z 位移振荡，或任一手指 curl 分类在 none/full 间往复。均为 UNVERIFIED 信号。
    const zr = countCycles(samples.map((s) => s.z), MIN_AMPLITUDE);
    let curlCycles = 0;
    for (const name of ["thumb", "index", "middle", "ring", "pinky"]) {
      const seq = samples.map((s) => s.curls?.[name]).filter((c) => c === "none" || c === "full");
      if (seq.length < MIN_OSC_SAMPLES) continue;
      let flips = 0;
      for (let i = 1; i < seq.length; i += 1) if (seq[i] !== seq[i - 1]) flips += 1;
      curlCycles = Math.max(curlCycles, Math.floor(flips / 2));
    }
    const okZ = zr.cycles >= need;
    const okCurl = curlCycles >= need;
    return okZ || okCurl
      ? { matched: true, progress: 1, reason: okZ ? "ok" : "ok_via_curl" }
      : { matched: false, progress: Math.min(0.8, Math.max(zr.cycles, curlCycles) / need), reason: "no_oscillation" };
  }
  return { matched: false, progress: 0, reason: "unknown_spec" };
}

/** @returns {{ matched: boolean, progress: number, reason: string }} */
export function matchMotion(state, spec) {
  const samples = state?.samples || [];
  if (!spec || typeof spec !== "object") {
    return { matched: false, progress: 0, reason: "unknown_spec" };
  }
  if (spec.kind === "trace") return matchTraceSpec(samples, spec);
  if (spec.kind === "shake") return matchShake(samples, spec);
  return { matched: false, progress: 0, reason: "unknown_spec" };
}
