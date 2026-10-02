/** 闯关单关流程状态机：intro → countdown → playing → passed/timeout。时间全部注入，不读时钟。 */

export const PHASE = {
  IDLE: "idle",
  INTRO: "intro",
  COUNTDOWN: "countdown",
  PLAYING: "playing",
  PASSED: "passed",
  TIMEOUT: "timeout",
};

export const COUNTDOWN_STEPS = 3;
export const COUNTDOWN_STEP_MS = 1000;

export function createQuestRun() {
  return {
    phase: PHASE.IDLE,
    letterId: null,
    attempts: 0,
    usedHint: false,
    countdownStartMs: null,
    startMs: null,
    timeLimitMs: 0,
    deadlineMs: null,
  };
}

export function startIntro(run, letterId) {
  run.phase = PHASE.INTRO;
  run.letterId = letterId;
  run.attempts = 0;
  run.usedHint = false;
  run.countdownStartMs = null;
  run.startMs = null;
  run.timeLimitMs = 0;
  run.deadlineMs = null;
  return run;
}

export function beginCountdown(run, nowMs) {
  if (run.phase !== PHASE.INTRO && run.phase !== PHASE.TIMEOUT) return false;
  if (!Number.isFinite(nowMs)) return false;
  run.phase = PHASE.COUNTDOWN;
  run.usedHint = false;
  run.countdownStartMs = nowMs;
  run.startMs = null;
  run.deadlineMs = null;
  return true;
}

/** 倒数进度：{done:false, count:3|2|1} 或 {done:true}。非法状态返回 null。 */
export function countdownStep(run, nowMs) {
  if (run.phase !== PHASE.COUNTDOWN || !Number.isFinite(run.countdownStartMs) || !Number.isFinite(nowMs)) return null;
  const elapsed = Math.max(0, nowMs - run.countdownStartMs);
  if (elapsed >= COUNTDOWN_STEPS * COUNTDOWN_STEP_MS) return { done: true };
  return { done: false, count: COUNTDOWN_STEPS - Math.floor(elapsed / COUNTDOWN_STEP_MS) };
}

export function beginPlaying(run, nowMs, config) {
  if (run.phase !== PHASE.COUNTDOWN) return false;
  if (!Number.isFinite(nowMs) || !Number.isFinite(config?.timeLimitMs) || config.timeLimitMs <= 0) return false;
  run.phase = PHASE.PLAYING;
  run.startMs = nowMs;
  run.timeLimitMs = config.timeLimitMs;
  run.deadlineMs = nowMs + config.timeLimitMs;
  return true;
}

export function remainingMs(run, nowMs) {
  if (run.phase !== PHASE.PLAYING || !Number.isFinite(run.deadlineMs) || !Number.isFinite(nowMs)) return null;
  return Math.max(0, run.deadlineMs - nowMs);
}

export function checkTimeout(run, nowMs) {
  const left = remainingMs(run, nowMs);
  return left !== null && left <= 0;
}

/** playing 阶段允许用一次提示（再看一眼示范）。 */
export function useHint(run) {
  if (run.phase !== PHASE.PLAYING || run.usedHint) return false;
  run.usedHint = true;
  return true;
}

export function finishPass(run, nowMs) {
  if (run.phase !== PHASE.PLAYING || !Number.isFinite(nowMs)) return null;
  const elapsedMs = Math.max(0, nowMs - run.startMs);
  const result = {
    letterId: run.letterId,
    elapsedMs,
    remainingMs: Math.max(0, run.deadlineMs - nowMs),
    timeLimitMs: run.timeLimitMs,
    usedHint: run.usedHint,
    attempts: run.attempts,
  };
  run.phase = PHASE.PASSED;
  return result;
}

export function failTimeout(run) {
  if (run.phase !== PHASE.PLAYING) return false;
  run.phase = PHASE.TIMEOUT;
  run.attempts += 1;
  return true;
}
