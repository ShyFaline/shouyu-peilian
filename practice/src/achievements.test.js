import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BADGES,
  buildLitWall,
  computeBadges,
  earnedBadgeIds,
  heroLine,
  recentEntries,
  summarize,
  totalPasses,
} from "./achievements.js";

const root = dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(readFileSync(join(root, "../content/letters.json"), "utf8"));
const letters = pack.letters;
const A = "GF0021.A";
const V = "GF0021.V";
const ISO = "2026-09-30T00:00:00.000Z";

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

function progressOf(rows) {
  return { schemaVersion: 1, entries: rows.map(([letterId, count, mode = "learn"]) => ({ letterId, mode, count, lastAt: ISO })) };
}

const emptyQuest = { schemaVersion: 1, passed: [] };
const emptyDays = { schemaVersion: 1, days: [] };

test("点亮墙：跟练记录与闯关通过都算点亮，只列可练字母", () => {
  const wall = buildLitWall(progressOf([[V, 3]]), { schemaVersion: 1, passed: [A] }, letters);
  const byId = new Map(wall.map((cell) => [cell.id, cell]));
  assert.equal(wall.length, 9, "当前 9 个可练字母");
  assert.deepEqual(byId.get(V), { id: V, label: "V", title: "字母 V", count: 3, questPassed: false, lit: true });
  assert.equal(byId.get(A).lit, true);
  assert.equal(byId.get(A).questPassed, true);
  assert.equal(byId.get(A).count, 0);
  assert.equal(byId.get("GF0021.B").lit, false);
  assert.equal(byId.has("GF0021.M"), false, "pending_review 不进墙");
});

test("累计摆对：跟练计数求和，仅闯关的字母各算一次，不双计", () => {
  assert.equal(totalPasses(progressOf([[V, 3], [A, 2]]), emptyQuest, letters), 5);
  assert.equal(totalPasses(progressOf([]), { schemaVersion: 1, passed: [A, "GF0021.B"] }, letters), 2);
  assert.equal(totalPasses(progressOf([[A, 4]]), { schemaVersion: 1, passed: [A] }, letters), 4, "闯关与跟练重叠不双计");
  assert.equal(totalPasses(progressOf([]), emptyQuest, letters), 0);
});

test("recentEntries 按 lastAt 倒序并限量", () => {
  const rows = [];
  for (let i = 1; i <= 10; i += 1) {
    rows.push({ letterId: V, mode: i % 2 ? "learn" : "test", count: 1, lastAt: `2026-09-${String(i).padStart(2, "0")}T00:00:00.000Z` });
  }
  const recent = recentEntries({ schemaVersion: 1, entries: rows }, letters, 8);
  assert.equal(recent.length, 8);
  assert.equal(recent[0].lastAt, "2026-09-10T00:00:00.000Z");
  assert.equal(recent.at(-1).lastAt, "2026-09-03T00:00:00.000Z");
});

test("summarize 汇总统计与连续天数", () => {
  const days = { schemaVersion: 1, days: ["2026-09-30", "2026-10-01", "2026-10-02"] };
  const out = summarize(progressOf([[V, 3]]), { schemaVersion: 1, passed: [A] }, letters, days, "2026-10-02");
  assert.deepEqual(out.stats, {
    totalPasses: 4,
    litCount: 2,
    practiceableCount: 9,
    questPassedCount: 1,
    activeDayCount: 3,
    streak: 3,
  });
  assert.equal(out.heroLine, heroLine(4));
});

test("heroLine 随量级变化，0 次引导开始", () => {
  assert.match(heroLine(0), /第一个/);
  assert.match(heroLine(1), /开始/);
  assert.match(heroLine(30), /手感/);
  assert.match(heroLine(99), /百次/);
  assert.match(heroLine(100), /三位数/);
});

test("徽章：8 枚全定义，点亮与未点亮附带差额提示", () => {
  assert.equal(BADGES.length, 8);
  const none = computeBadges(progressOf([]), emptyQuest, letters, emptyDays, "2026-10-02");
  assert.equal(earnedBadgeIds(none).size, 0);
  const lit5 = none.find((badge) => badge.id === "lit-5");
  assert.equal(lit5.gap, "还差 5 个");
  const days = { schemaVersion: 1, days: ["2026-09-29", "2026-09-30", "2026-10-01"] };
  const some = computeBadges(progressOf([[V, 1]]), emptyQuest, letters, days, "2026-10-02");
  const earned = earnedBadgeIds(some);
  assert.ok(earned.has("first-pass"));
  assert.ok(earned.has("streak-3"), "连续 3 天（今天未练从昨天数）");
  assert.equal(earned.has("streak-7"), false);
  assert.equal(some.find((badge) => badge.id === "streak-7").gap, "已连续 3 天");
  const allPassed = letters.filter((l) => l.practiceStatus === "pose_practice").map((l) => l.id);
  const full = computeBadges(progressOf([]), { schemaVersion: 1, passed: allPassed }, letters, emptyDays, "2026-10-02");
  const fullEarned = earnedBadgeIds(full);
  assert.ok(fullEarned.has("first-pass"));
  assert.ok(fullEarned.has("lit-5"));
  assert.ok(fullEarned.has("lit-half"));
  assert.ok(fullEarned.has("lit-all"));
  assert.ok(fullEarned.has("quest-complete"));
  assert.equal(fullEarned.has("hundred"), false);
  const hundred = computeBadges(progressOf([[V, 100]]), emptyQuest, letters, emptyDays, "2026-10-02");
  assert.ok(earnedBadgeIds(hundred).has("hundred"));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
