import assert from "node:assert/strict";
import {
  COUNTDOWN_STEPS,
  COUNTDOWN_STEP_MS,
  PHASE,
  beginCountdown,
  beginPlaying,
  checkTimeout,
  countdownStep,
  createQuestRun,
  failTimeout,
  finishPass,
  remainingMs,
  startIntro,
  useHint,
} from "./questRun.js";

let failed = 0;
let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("ok -", name);
  } catch (err) {
    failed += 1;
    console.error("not ok -", name);
    console.error(err);
  }
}

test("状态机主链路：intro → countdown → playing → passed", () => {
  const run = createQuestRun();
  assert.equal(run.phase, PHASE.IDLE);
  assert.equal(beginCountdown(run, 0), false, "idle 不能直接倒数");
  startIntro(run, "GF0021.A");
  assert.equal(run.phase, PHASE.INTRO);
  assert.equal(beginCountdown(run, 1000), true);
  assert.deepEqual(countdownStep(run, 1000), { done: false, count: 5 });
  assert.deepEqual(countdownStep(run, 1999), { done: false, count: 5 });
  assert.deepEqual(countdownStep(run, 2000), { done: false, count: 4 });
  assert.deepEqual(countdownStep(run, 3000), { done: false, count: 3 });
  assert.deepEqual(countdownStep(run, 5000), { done: false, count: 1 });
  assert.deepEqual(countdownStep(run, 6000), { done: true });
  assert.equal(beginPlaying(run, 6000, { timeLimitMs: 20000 }), true);
  assert.equal(run.deadlineMs, 26000);
  assert.equal(remainingMs(run, 16000), 10000);
  const result = finishPass(run, 16000);
  assert.equal(run.phase, PHASE.PASSED);
  assert.equal(result.letterId, "GF0021.A");
  assert.equal(result.elapsedMs, 10000);
  assert.equal(result.remainingMs, 10000);
  assert.equal(result.timeLimitMs, 20000);
  assert.equal(result.usedHint, false);
});

test("倒计时边界：非法时间与非法状态", () => {
  const run = startIntro(createQuestRun(), "GF0021.A");
  assert.equal(beginCountdown(run, NaN), false);
  assert.equal(countdownStep(run, 0), null, "未进入 countdown 返回 null");
  beginCountdown(run, 500);
  assert.equal(remainingMs(run, 600), null, "countdown 期间无剩余时间");
  assert.equal(checkTimeout(run, 600), false);
});

test("超时路径：checkTimeout 到点后 failTimeout 计尝试次数", () => {
  const run = startIntro(createQuestRun(), "GF0021.A");
  beginCountdown(run, 0);
  beginPlaying(run, COUNTDOWN_STEPS * COUNTDOWN_STEP_MS, { timeLimitMs: 12000 });
  assert.equal(checkTimeout(run, run.deadlineMs - 1), false);
  assert.equal(checkTimeout(run, run.deadlineMs), true);
  assert.equal(failTimeout(run), true);
  assert.equal(run.phase, PHASE.TIMEOUT);
  assert.equal(run.attempts, 1);
  assert.equal(failTimeout(run), false, "非 playing 不能重复判超时");
});

test("超时重试可跳过 intro 直接再倒数，提示次数重置", () => {
  const run = startIntro(createQuestRun(), "GF0021.A");
  beginCountdown(run, 0);
  beginPlaying(run, 3000, { timeLimitMs: 12000 });
  assert.equal(useHint(run), true);
  assert.equal(useHint(run), false, "提示每关只能用一次");
  failTimeout(run);
  assert.equal(beginCountdown(run, 20000), true, "timeout 可直接重试");
  assert.equal(run.usedHint, false, "重试重置提示");
  assert.equal(run.attempts, 1, "重试保留尝试计数");
  beginPlaying(run, 23000, { timeLimitMs: 12000 });
  const result = finishPass(run, 29000);
  assert.equal(result.attempts, 1);
});

test("切关 startIntro 清零全部状态", () => {
  const run = startIntro(createQuestRun(), "GF0021.A");
  beginCountdown(run, 0);
  beginPlaying(run, 3000, { timeLimitMs: 12000 });
  useHint(run);
  failTimeout(run);
  startIntro(run, "GF0021.B");
  assert.equal(run.letterId, "GF0021.B");
  assert.equal(run.attempts, 0);
  assert.equal(run.usedHint, false);
  assert.equal(run.deadlineMs, null);
});

test("beginPlaying 守卫：阶段与配置缺一不可", () => {
  const run = startIntro(createQuestRun(), "GF0021.A");
  assert.equal(beginPlaying(run, 0, { timeLimitMs: 12000 }), false, "intro 不能直接进入 playing");
  beginCountdown(run, 0);
  assert.equal(beginPlaying(run, NaN, { timeLimitMs: 12000 }), false);
  assert.equal(beginPlaying(run, 3000, { timeLimitMs: 0 }), false);
  assert.equal(beginPlaying(run, 3000, {}), false);
  assert.equal(run.phase, PHASE.COUNTDOWN);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
