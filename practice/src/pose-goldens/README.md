# Pose Goldens（合成标准姿态夹具）

8 个主路径字母的"标准答案"关键点帧，由 3D 绑定手模按姿态角度表摆出后经渲染相机投影导出。**是合成数据，不是真人数据**——与 `fixtures/`（真人导出、禁止伪造）刻意分开存放。

## 用途

`pose-goldens.test.js` 断言 8×8 恒等矩阵：每个 golden 必须且仅通过其自身字母的判定规则。

- 改了 `blender/build_godot_hand_poc.py` 的角度表 → 重新导出（见下），矩阵必须仍为单位阵；
- 改了 `practice/content/letters.json` 规则或 `practice/src/evaluate.js` 阈值 → 跑本测试，矩阵必须仍为单位阵，否则说明规则修改与示范资产脱节。

## 重新生成

```bat
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --python blender\build_godot_hand_poc.py -- landmarks
node practice\src\pose-goldens.test.js
```

## 与真人 fixtures 的差异

golden 是"摆出来的标准姿态"，可以直接参与 pass/fail 断言；真人 fixtures 没有独立标注，只能做 schema/冒烟检查（见 `evaluate.test.js` A08 与 `fixtures/README.md`）。

## 已知限制

- 关键点是骨骼关节投影，不经 MediaPipe 检测——不覆盖检测噪声、遮挡、镜像路径；
- 角度表是工程近似值，未经人工对照 GF 0021—2019 原图验收；姿态本身的国标正确性以人工核对为准，本目录只保证"示范与判定规则互相一致"。
