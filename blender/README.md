# GF 0021 标准手（Blender 内容工厂）

示范图只给练习页对照，**不进识别循环**。

## 当前生产管线（2026-10-01 起）

- 渲染器：Blender 5.2.x（本机 `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`；`blender/vendor/` 里另存了 4.5.14 压缩包作回退）。
- 手模：Godot XR Tools 右手网格 `vendor/godot-xr-hands/hand_r.gltf`（CC0 1.0，作者 DigitalN8m4r3 aka Miodrag Sejic，2022；**体积原因 gitignore，不入库**）。
- 姿态表：`build_godot_hand_poc.py` 内逐字母姿态角度表（32 个字母，含 ORIENT 朝向表与 KNOWN_VIOLATIONS 穿模基线）。

### 一键重跑

```bat
cd blender
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --python build_godot_hand_poc.py -- landmarks   :: 导出 golden 关键点（practice/src/pose-goldens/）
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --python build_godot_hand_poc.py -- all         :: 渲染全部正面图（practice/content/demos/）
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --python build_godot_hand_turntable.py          :: 渲染 24 帧转盘（practice/content/demos/rot/）
```

（脚本入口见两个文件尾部 `main()`：`poc` 支持 `inspect / landmarks / export-pose / selfcheck`，其余首参按字母列表渲染，留空用 `all` 渲全量；turntable 在 `--` 后可跟字母过滤。）

### fresh clone 复现

`hand_r.gltf` 不入库。重渲前手动补齐：

1. 从上游 <https://github.com/GodotVR/godot-xr-tools> 找到 `hand_r.gltf`（在 demo/资产目录内，路径可能随上游调整，以仓库搜索为准）。
2. 放到 `blender/vendor/godot-xr-hands/hand_r.gltf`。
3. 校验 SHA-256 应为 `eb8d9765dcb7dcb67928f90e5fbad6ae1f7705043ab900dbe4a43b68a2721d37`（不一致则说明上游资产变动，渲染结果会与现图不同）。
4. 许可全文副本见 `practice/vendor/godot-xr-hands/LICENSE.md`（随站点发布）。

## 许可与署名

- **Godot XR 手模**：CC0 1.0 Universal，无署名义务；署名信息见 `practice/vendor/godot-xr-hands/README.md`。
- **历史 Human Base Meshes 派生 `.blend`**（`hand_gf0021*.blend`、`candidates/` 等，仍在仓库内分发）：底层网格源自 Blender Studio Human Base Meshes，手部网格含 Snow（Hjalti Hjálmarsson）作品，**CC-BY 4.0**，须署名。这些文件已退役不参与现行管线，仅作历史留档；若再次使用其渲染产物，必须在成品处署名 "Hand mesh by Snow (Hjalti Hjálmarsson), Human Base Meshes, CC-BY 4.0"。
- 现行示范图与旋转图全部由 Godot XR 网格渲染，HBM 图已全部退役（2026-10-01）。

## 历史脚本

`_probe_*`、`_scan_*`、`_list_hbm.py`、`hour*`、`build_candidate_r*`、`build_gf0021.py`、`render_gf0021.py`、`import_hbm_hand.py`、`fix_hbm_orient.py` 等是 HBM 时代与探针脚本，已退役，仅供参考，不要对现行管线运行。`build_godot_hand_poc.py` / `build_godot_hand_turntable.py` 是当前唯一生产路径。

改姿态角度表后必须重跑：golden 导出 → `node practice/src/pose-goldens.test.js` → `node practice/src/pose-collision.test.js`。
