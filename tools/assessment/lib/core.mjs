/**
 * 核心适配层。只做 import 与参数装配，不复制任何国标规则、角度阈值或分类逻辑。
 *
 * 唯一判定来源：
 *   practice/src/coords.js        几何空间与尺寸门
 *   practice/src/evaluate.js      单帧几何规则
 *   practice/src/inputQuality.js  输入质量门
 *   practice/src/passState.js     连续保持门
 *   practice/src/judge.js         实时编排（decision）
 *
 * 核心文件由其他席位持有写锁，本目录只读它们。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { geometryError, toGeometryPoints } from "../../../practice/src/coords.js";
import { evaluate } from "../../../practice/src/evaluate.js";
import { assessInputQuality, QUALITY_HINT } from "../../../practice/src/inputQuality.js";
import { createHold, holdReady, holdView, observePass, MAX_GAP_MS, PASS_FRAMES } from "../../../practice/src/passState.js";
import { judge } from "../../../practice/src/judge.js";

export const WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const CORE_SOURCES = [
  "practice/src/coords.js",
  "practice/src/evaluate.js",
  "practice/src/inputQuality.js",
  "practice/src/passState.js",
  "practice/src/judge.js",
  "practice/src/snapshot.js",
  "practice/src/types.js",
  "practice/content/letters.json",
];

/** 读 letters.json 并按 id 建索引。运行时不得升格 practiceStatus。 */
export function loadLetters(root = WORKSPACE_ROOT) {
  const path = join(root, "practice", "content", "letters.json");
  const data = JSON.parse(readFileSync(path, "utf8"));
  const byId = new Map(data.letters.map((l) => [l.id, l]));
  return { path, data, byId, mainPath: data.mainPath, unstableIds: data.unstableIds ?? [] };
}

export { geometryError, toGeometryPoints, evaluate, assessInputQuality, judge, QUALITY_HINT };
export { createHold, holdReady, holdView, observePass, PASS_FRAMES, MAX_GAP_MS };

/**
 * 保持门生效阈值。judge() 只透出 holdView()（frames/elapsedMs），不透出阈值，
 * 所以这里直接读 passState 的导出常量（单一真源，不是复制）。
 * 两者仍标 UNVERIFIED，报告必须带上这个警告。
 */
export function holdThresholds() {
  return { passFrames: PASS_FRAMES, maxGapMs: MAX_GAP_MS, unverified: true, source: "practice/src/passState.js" };
}

/**
 * 把采集记录里的尺寸/坐标空间折成核心要的 geom。
 * 缺尺寸不补 1x1、不猜：原样传下去，让 geometryError 报 missing_size。
 */
export function geomOf(record) {
  const geom = { coordSpace: record?.coordSpace ?? "image_normalized" };
  if (Number.isFinite(record?.imageWidth)) geom.width = record.imageWidth;
  if (Number.isFinite(record?.imageHeight)) geom.height = record.imageHeight;
  return geom;
}
