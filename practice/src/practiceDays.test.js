import assert from "node:assert/strict";
import {
  DAYS_KEY,
  MAX_DAYS_ENTRIES,
  clearDaysKey,
  dayStreak,
  emptyDays,
  loadDays,
  localDayKey,
  markActiveDay,
  parseDays,
  saveDays,
  shiftDay,
} from "./practiceDays.js";

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

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(String(k), String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test("localDayKey 用本地年月日补零", () => {
  assert.equal(localDayKey(new Date(2026, 9, 2, 23, 30)), "2026-10-02");
  assert.equal(localDayKey(new Date(2026, 0, 5, 0, 1)), "2026-01-05");
  assert.equal(localDayKey(new Date(NaN)), "");
});

test("shiftDay 跨月跨年，非法输入回空串", () => {
  assert.equal(shiftDay("2026-10-02", -1), "2026-10-01");
  assert.equal(shiftDay("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDay("2024-03-01", -1), "2024-02-29");
  assert.equal(shiftDay("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftDay("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDay("bad", -1), "");
  assert.equal(shiftDay("2026-10-02", 1.5), "");
});

test("parseDays 去重排序、拒绝垃圾输入与错误 schema", () => {
  for (const bad of [null, "", "not json", '{"schemaVersion":2,"days":[]}', '{"schemaVersion":1,"days":"nope"}', "[]", 42]) {
    assert.deepEqual(parseDays(bad), emptyDays(), String(bad));
  }
  const parsed = parseDays(JSON.stringify({
    schemaVersion: 1,
    days: ["2026-10-02", "2026-10-01", "2026-10-02", "nope", "2026-1-1", 7],
  }));
  assert.deepEqual(parsed.days, ["2026-10-01", "2026-10-02"]);
});

test("markActiveDay 幂等、升序、超长截断保留最近", () => {
  let state = emptyDays();
  state = markActiveDay(state, "2026-10-02");
  assert.deepEqual(state.days, ["2026-10-02"]);
  const same = markActiveDay(state, "2026-10-02");
  assert.equal(same, state, "重复日期原样返回");
  assert.equal(markActiveDay(state, "bad"), state, "非法日期原样返回");
  state = markActiveDay(state, "2026-10-01");
  assert.deepEqual(state.days, ["2026-10-01", "2026-10-02"]);
  let big = { schemaVersion: 1, days: [] };
  for (let i = 0; i < MAX_DAYS_ENTRIES + 5; i += 1) {
    big = markActiveDay(big, shiftDay("2026-10-02", -i));
  }
  assert.equal(big.days.length, MAX_DAYS_ENTRIES);
  assert.equal(big.days.at(-1), "2026-10-02");
});

test("parseDays 拒绝格式合法但不存在的日期", () => {
  const parsed = parseDays(JSON.stringify({
    schemaVersion: 1,
    days: ["2026-13-45", "2026-00-00", "2026-02-30", "2026-04-31", "2026-02-29", "2024-02-29", "2026-10-02"],
  }));
  assert.deepEqual(parsed.days, ["2024-02-29", "2026-10-02"], "只留真实日期，闰年 2 月 29 日保留");
});

test("markActiveDay 拒绝格式合法但不存在的日期", () => {
  const state = markActiveDay(emptyDays(), "2026-10-02");
  for (const bad of ["2026-13-45", "2026-00-00", "2026-02-30", "2026-04-31", "2026-02-29"]) {
    assert.equal(markActiveDay(state, bad), state, `${bad} 原样返回`);
    assert.equal(markActiveDay(emptyDays(), bad).days.length, 0, `${bad} 不入库`);
  }
});

test("假日期不再虚高 activeDayCount 或污染 dayStreak", () => {
  const days = parseDays(JSON.stringify({
    schemaVersion: 1,
    days: ["2026-13-45", "2026-10-01", "2026-10-02"],
  })).days;
  assert.equal(days.length, 2, "activeDayCount 只数真实日期");
  assert.equal(dayStreak(days, "2026-10-02"), 2);
});

test("dayStreak 今天没练从昨天数，断了就归零", () => {
  const days = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"];
  assert.equal(dayStreak(days, "2026-10-02"), 4, "今天未练，昨天起连续 4 天");
  assert.equal(dayStreak([...days, "2026-10-02"], "2026-10-02"), 5);
  assert.equal(dayStreak(["2026-09-30", "2026-10-02"], "2026-10-02"), 1);
  assert.equal(dayStreak(["2026-09-20"], "2026-10-02"), 0);
  assert.equal(dayStreak([], "2026-10-02"), 0);
});

test("loadDays/saveDays/clearDaysKey 走存储且容错", () => {
  const storage = fakeStorage();
  assert.deepEqual(loadDays(storage), emptyDays());
  const state = markActiveDay(emptyDays(), "2026-10-02");
  assert.equal(saveDays(storage, state).persisted, true);
  assert.deepEqual(loadDays(storage).days, ["2026-10-02"]);
  assert.equal(clearDaysKey(storage).ok, true);
  assert.equal(storage.map.has(DAYS_KEY), false);
  assert.equal(saveDays(null, state).persisted, false);
  assert.equal(loadDays(null).days.length, 0);
  const broken = {
    getItem() { throw new Error("boom"); },
    setItem() { throw new Error("boom"); },
    removeItem() { throw new Error("boom"); },
  };
  assert.deepEqual(loadDays(broken), emptyDays());
  assert.equal(saveDays(broken, state).persisted, false);
  assert.equal(clearDaysKey(broken).ok, false);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
