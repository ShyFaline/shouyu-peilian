import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  QUEST_SCHEMA,
  emptyQuest,
  isQuestUnlocked,
  levelConfig,
  markQuestPassed,
  parseQuest,
  questSequence,
  questStatus,
  recordQuestResult,
  starRating,
} from "./quest.js";

const letters = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "..", "content", "letters.json"), "utf8")).letters;
const sequence = questSequence(letters);

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

test("emptyQuest 是 schema v2 形状", () => {
  assert.deepEqual(emptyQuest(), { schemaVersion: 2, passed: [], stars: {}, bestMs: {} });
});

test("levelConfig 全关统一：5 秒闪示后隐藏，限时 15 秒，非法下标回空", () => {
  for (const index of [0, 3, 5, 8, 99]) {
    const config = levelConfig(index);
    assert.equal(config.demo, "flash");
    assert.equal(config.flashMs, 5000);
    assert.equal(config.timeLimitMs, 15000);
    assert.equal(config.hintFlashMs, 2000);
  }
  assert.equal(levelConfig(-1), null);
  assert.equal(levelConfig(1.5), null);
});

test("starRating 按剩余比例与提示评星", () => {
  assert.equal(starRating(10000, 20000, false), 3);
  assert.equal(starRating(9999, 20000, false), 2);
  assert.equal(starRating(10000, 20000, true), 2, "用过提示最高 2 星");
  assert.equal(starRating(4000, 20000, false), 2);
  assert.equal(starRating(3999, 20000, false), 1);
  assert.equal(starRating(0, 20000, false), 1);
  for (const bad of [NaN, Infinity, -5]) assert.equal(starRating(bad, 20000, false), 1);
  for (const limit of [0, -1, NaN]) assert.equal(starRating(5000, limit, false), 1);
});

test("recordQuestResult 首过记通过、星级取高、用时取小", () => {
  const quest = emptyQuest();
  const first = sequence[0].id;
  assert.equal(recordQuestResult(quest, first, { stars: 2, elapsedMs: 8000 }, letters), true);
  assert.deepEqual(quest.passed, [first]);
  assert.equal(quest.stars[first], 2);
  assert.equal(quest.bestMs[first], 8000);
  assert.equal(recordQuestResult(quest, first, { stars: 1, elapsedMs: 12000 }, letters), true, "重玩允许");
  assert.equal(quest.stars[first], 2, "星级只升不降");
  assert.equal(quest.bestMs[first], 8000, "用时只缩不增");
  assert.equal(recordQuestResult(quest, first, { stars: 3, elapsedMs: 5000 }, letters), true);
  assert.equal(quest.stars[first], 3);
  assert.equal(quest.bestMs[first], 5000);
});

test("recordQuestResult 拒绝越关与未知字母，非法星级按 1 星记", () => {
  const quest = emptyQuest();
  assert.equal(recordQuestResult(quest, sequence[1].id, { stars: 3, elapsedMs: 1000 }, letters), false, "第 2 关未解锁");
  assert.equal(recordQuestResult(quest, "GF0021.U", { stars: 3, elapsedMs: 1000 }, letters), false);
  assert.equal(recordQuestResult(quest, "nope", { stars: 3, elapsedMs: 1000 }, letters), false);
  assert.equal(recordQuestResult(null, sequence[0].id, { stars: 3, elapsedMs: 1000 }, letters), false);
  assert.equal(recordQuestResult(quest, sequence[0].id, { stars: 9, elapsedMs: 1000 }, letters), true);
  assert.equal(quest.stars[sequence[0].id], 1);
  assert.equal(recordQuestResult(quest, sequence[0].id, { stars: 3, elapsedMs: NaN }, letters), true);
  assert.equal(quest.bestMs[sequence[0].id], 1000, "非法用时不覆盖最好成绩");
});

test("parseQuest 迁移 v1 存档，星级与用时只对已通过字母生效", () => {
  const v1 = JSON.stringify({ schemaVersion: 1, passed: ["GF0021.A", "GF0021.B"] });
  const migrated = parseQuest(v1, letters);
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.passed, ["GF0021.A", "GF0021.B"]);
  assert.deepEqual(migrated.stars, {});
  assert.deepEqual(migrated.bestMs, {});
  const v2 = parseQuest(JSON.stringify({
    schemaVersion: 2,
    passed: ["GF0021.A"],
    stars: { "GF0021.A": 2, "GF0021.B": 3, nope: 1, "GF0021.A2": 0, "GF0021.C": 5 },
    bestMs: { "GF0021.A": 6400, "GF0021.B": 1000, "GF0021.C": -3 },
  }), letters);
  assert.deepEqual(v2.stars, { "GF0021.A": 2 });
  assert.deepEqual(v2.bestMs, { "GF0021.A": 6400 });
});

test("parseQuest 坏数据回退空档，questStatus/解锁语义不变", () => {
  for (const bad of [null, "", "not json", '{"schemaVersion":99,"passed":["GF0021.A"]}', '{"schemaVersion":2,"passed":"nope"}']) {
    const parsed = parseQuest(bad, letters);
    assert.deepEqual(parsed, emptyQuest(), String(bad));
  }
  const scrubbed = parseQuest('{"schemaVersion":1,"passed":["GF0021.U","GF0021.A","GF0021.A"]}', letters);
  assert.deepEqual(scrubbed.passed, ["GF0021.A"], "过滤无效与重复后保留有效关卡");
  const quest = emptyQuest();
  const status = questStatus(quest, letters);
  assert.equal(status.total, 9);
  assert.equal(status.unlockedIndex, 0);
  assert.equal(status.current.id, "GF0021.A");
  assert.equal(isQuestUnlocked(quest, "GF0021.B", letters), false);
  assert.equal(markQuestPassed(quest, "GF0021.A", letters), true);
  assert.equal(isQuestUnlocked(quest, "GF0021.B", letters), true);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
