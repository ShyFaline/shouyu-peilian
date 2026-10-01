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
  // 已知规则集碰撞：2026-10-01 U 四指裁定后，U 与 B 的规则在词汇层完全相同
  // （区别只在掌心朝向，超出现有判定词汇；U 维持 pending_review 兜底，
  // 升格前需先补掌心朝向能力，见 docs/规范对图-AI预审-2026-09-30.md）。
  // 注意：双向碰撞——B 与 U 的规则在词汇层完全相同。
  const KNOWN_RULE_COLLISIONS = new Set(["GF0021.B×GF0021.U", "GF0021.U×GF0021.B"]);
  // 过期 golden 已无：2026-10-01 Blender 5.2 重摆重渲完成，8 个 golden 全部与新规则一致。
  const STALE_GOLDENS = new Set();
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
      const pairKey = `${frameId}×${targetId}`;
      let expect = frameId === targetId || KNOWN_RULE_COLLISIONS.has(pairKey);
      if (frameId === targetId && STALE_GOLDENS.has(frameId)) {
        expect = false;
        if (!result.pass) {
          console.warn(`STALE golden ${frameId}：姿态与 2026-10-01 转写规则不一致（待重渲），当前按预期失败`);
        }
      }
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
