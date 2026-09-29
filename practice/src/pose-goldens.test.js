/** 示范资产 ↔ 判定规则一致性回归门（golden 矩阵）。
 *
 * golden 来源：blender/build_godot_hand_poc.py（-- landmarks 模式）按姿态角度表
 * 在 Blender 里摆姿，骨骼关节点映射为 MediaPipe 21 点，经渲染相机投影导出。
 * 是合成标准姿态，不是真人数据；只验证「示范与规则对同一字母的理解一致」，
 * 不验证 MediaPipe 检测噪声路径。
 *
 * 门禁断言 8×8 恒等矩阵：每个 golden 必须且仅通过其自身字母的规则。
 * 改角度表后重跑 blender 侧导出；改 letters.json / evaluate.js 后跑本文件。
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "./evaluate.js";

const root = dirname(fileURLToPath(import.meta.url));
const goldensDir = join(root, "pose-goldens");
const pack = JSON.parse(readFileSync(join(root, "../content/letters.json"), "utf8"));
const byId = Object.fromEntries((pack.letters || []).map((letter) => [letter.id, letter]));

const GOLDEN_IDS = ["A", "B", "U", "V", "W", "L", "Y", "I"].map((l) => `GF0021.${l}`);

const files = readdirSync(goldensDir).filter((name) => name.toLowerCase().endsWith(".json"));
const goldens = new Map(files.map((name) => {
  const id = name.replace(/\.json$/i, "");
  return [id, JSON.parse(readFileSync(join(goldensDir, name), "utf8"))];
}));

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

test("golden 集合覆盖 8 个主路径字母且仅这 8 个", () => {
  assert.deepEqual([...goldens.keys()].sort(), [...GOLDEN_IDS].sort(),
    `golden 集合与主路径不一致: ${[...goldens.keys()].join(",")}`);
});

test("golden schema：21 点、有限坐标、带尺寸", () => {
  for (const [id, frame] of goldens) {
    assert.equal(frame.targetLetterId, id, `${id} 文件名与 targetLetterId 不符`);
    assert.equal(frame.coordSpace, "image_normalized", id);
    assert.ok(Number.isFinite(frame.imageWidth) && frame.imageWidth > 0, id);
    assert.ok(Number.isFinite(frame.imageHeight) && frame.imageHeight > 0, id);
    assert.equal(frame.landmarks.length, 21, `${id} landmarks 必须 21 点`);
    for (const p of frame.landmarks) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${id} 含非有限坐标`);
    }
    // golden 是合成标准姿态，可以自称 pass；与真人 fixtures 的「不得带标签」规则不同
    for (const key of ["expectedVerdict", "decision"]) {
      assert.equal(Object.hasOwn(frame, key), false, `${id} 不得带 ${key}`);
    }
  }
});

test("恒等矩阵：每个 golden 仅通过自身字母", () => {
  for (const [frameId, frame] of goldens) {
    const geom = {
      width: frame.imageWidth,
      height: frame.imageHeight,
      coordSpace: frame.coordSpace,
    };
    for (const targetId of GOLDEN_IDS) {
      const letter = byId[targetId];
      assert.ok(letter, `letters.json 缺 ${targetId}`);
      const result = evaluate(letter, frame.landmarks, geom);
      const expect = frameId === targetId;
      assert.equal(result.pass, expect,
        `${frameId} × ${targetId} 期望 pass=${expect}，实际 ${result.pass}：` +
        JSON.stringify(result.audit || result.issues));
    }
  }
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}

console.log(`\n${passed} passed`);
