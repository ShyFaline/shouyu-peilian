/** 成就单：从练习记录、闯关进度、活跃日派生统计、点亮墙与徽章。纯函数，不碰存储与 DOM。 */

import { isPracticeable } from "./letterLibrary.js";
import { visibleEntries } from "./progress.js";
import { dayStreak, localDayKey } from "./practiceDays.js";

export const RECENT_LIMIT = 8;

function countMap(entries) {
  const map = new Map();
  for (const row of entries || []) {
    map.set(row.letterId, (map.get(row.letterId) || 0) + row.count);
  }
  return map;
}

/** 点亮墙：可练字母按 letters.json 原顺序，点亮 = 跟练有记录或闯关已过。 */
export function buildLitWall(progress, quest, letters) {
  const entries = visibleEntries(progress, letters);
  const counts = countMap(entries);
  const passed = new Set(quest?.passed || []);
  return (letters || []).filter(isPracticeable).map((letter) => {
    const count = counts.get(letter.id) || 0;
    const questPassed = passed.has(letter.id);
    return {
      id: letter.id,
      label: letter.label,
      title: letter.title,
      count,
      questPassed,
      lit: count > 0 || questPassed,
    };
  });
}

/** 累计摆对：所有被记录的通过之和（跟练计数 + 仅闯关的字母各记一次）。 */
export function totalPasses(progress, quest, letters) {
  const entries = visibleEntries(progress, letters);
  let total = 0;
  const counted = new Set();
  for (const row of entries) {
    total += row.count;
    counted.add(row.letterId);
  }
  for (const id of quest?.passed || []) {
    if (!counted.has(id)) total += 1;
  }
  return total;
}

export function recentEntries(progress, letters, limit = RECENT_LIMIT) {
  return visibleEntries(progress, letters)
    .slice()
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0))
    .slice(0, limit);
}

export const BADGES = [
  {
    id: "first-pass",
    title: "初露锋芒",
    desc: "摆对第 1 次",
    earned: ({ stats }) => stats.totalPasses >= 1,
  },
  {
    id: "lit-5",
    title: "小有收获",
    desc: "点亮 5 个字母",
    earned: ({ stats }) => stats.litCount >= 5,
    gap: ({ stats }) => (stats.litCount >= 5 ? "" : `还差 ${5 - stats.litCount} 个`),
  },
  {
    id: "lit-half",
    title: "半壁江山",
    desc: "点亮一半可练字母",
    earned: ({ stats }) => stats.practiceableCount > 0 && stats.litCount >= Math.ceil(stats.practiceableCount / 2),
    gap: ({ stats }) => {
      const need = Math.ceil(stats.practiceableCount / 2);
      return stats.litCount >= need ? "" : `还差 ${need - stats.litCount} 个`;
    },
  },
  {
    id: "lit-all",
    title: "图鉴集齐",
    desc: "点亮全部可练字母",
    earned: ({ stats }) => stats.practiceableCount > 0 && stats.litCount >= stats.practiceableCount,
    gap: ({ stats }) => (stats.litCount >= stats.practiceableCount ? "" : `还差 ${stats.practiceableCount - stats.litCount} 个`),
  },
  {
    id: "quest-complete",
    title: "闯关通关",
    desc: "闯关模式全部通过",
    earned: ({ stats }) => stats.practiceableCount > 0 && stats.questPassedCount >= stats.practiceableCount,
    gap: ({ stats }) => (stats.questPassedCount >= stats.practiceableCount ? "" : `还差 ${stats.practiceableCount - stats.questPassedCount} 关`),
  },
  {
    id: "streak-3",
    title: "三日坚持",
    desc: "连续练习 3 天",
    earned: ({ stats }) => stats.streak >= 3,
    gap: ({ stats }) => (stats.streak >= 3 ? "" : `已连续 ${stats.streak} 天`),
  },
  {
    id: "streak-7",
    title: "七日之约",
    desc: "连续练习 7 天",
    earned: ({ stats }) => stats.streak >= 7,
    gap: ({ stats }) => (stats.streak >= 7 ? "" : `已连续 ${stats.streak} 天`),
  },
  {
    id: "hundred",
    title: "百次磨炼",
    desc: "累计摆对 100 次",
    earned: ({ stats }) => stats.totalPasses >= 100,
    gap: ({ stats }) => (stats.totalPasses >= 100 ? "" : `还差 ${100 - stats.totalPasses} 次`),
  },
];

export function badgesFor(summary) {
  const state = { wall: summary.wall, stats: summary.stats };
  return BADGES.map((badge) => ({
    id: badge.id,
    title: badge.title,
    desc: badge.desc,
    earned: badge.earned(state),
    gap: badge.gap ? badge.gap(state) : "",
  }));
}

export function computeBadges(progress, quest, letters, days, today) {
  return badgesFor(summarize(progress, quest, letters, days, today));
}

export function earnedBadgeIds(badges) {
  return new Set((badges || []).filter((badge) => badge.earned).map((badge) => badge.id));
}

export function heroLine(total) {
  if (!Number.isFinite(total) || total <= 0) return "摆对第一个手型，从这里开始。";
  if (total < 10) return "好的开始，继续保持。";
  if (total < 50) return "手感正在长出来。";
  if (total < 100) return "已经很稳了，向百次进发。";
  return "三位数的手型功底，厉害。";
}

export function summarize(progress, quest, letters, days, today) {
  const wall = buildLitWall(progress, quest, letters);
  const total = totalPasses(progress, quest, letters);
  const dayList = Array.isArray(days?.days) ? days.days : [];
  const stats = {
    totalPasses: total,
    litCount: wall.filter((cell) => cell.lit).length,
    practiceableCount: wall.length,
    questPassedCount: wall.filter((cell) => cell.questPassed).length,
    activeDayCount: dayList.length,
    streak: dayStreak(dayList, typeof today === "string" ? today : localDayKey()),
  };
  return { stats, wall, heroLine: heroLine(total), recent: recentEntries(progress, letters) };
}
