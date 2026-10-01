"""GF0021 手模转盘帧（练习页拖动旋转用）。

复用 build_godot_hand_poc.py 的姿态与机位定义（该文件有 __main__ guard）。
输出候选：blender/candidates/godot-xr-rot/{letterId}/{NN}.webp + metadata.json。
不写 practice/content/demos：目检通过后由主代理复制接入。

机位约定：第 00 帧与各字母 front_view_dir 完全一致（与 {letterId}_front.png 同机位）；
帧号增大 = 相机绕 finger_up 俯视顺时针前进 = 观者逐渐看到手模左侧，
对应前端「向右拖动 → 帧号增大」。

Usage:
  blender -b --python-exit-code 1 --python blender/build_godot_hand_turntable.py
"""

from __future__ import annotations

import importlib.util
import json
import math
import os
import sys
from datetime import date

import bpy
from mathutils import Matrix

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)

_SPEC = importlib.util.spec_from_file_location(
    "godot_hand_poc", os.path.join(ROOT, "build_godot_hand_poc.py")
)
poc = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(poc)

OUT = os.path.join(ROOT, "candidates", "godot-xr-rot")
FRAMES = 24
SIZE = 384
WEBP_QUALITY = 80
# 32 字母全量（对齐 practice/content/letters.json 的 id 顺序）。
LETTERS = ("A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
           "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
           "ZH", "CH", "SH", "NG", "EH", "UE")


def check_webp(path):
    if not os.path.isfile(path):
        raise RuntimeError(f"missing webp: {path}")
    nbytes = os.path.getsize(path)
    if nbytes < 1024:
        raise RuntimeError(f"webp too small ({nbytes} B): {path}")
    with open(path, "rb") as f:
        sig = f.read(12)
    if sig[:4] != b"RIFF" or sig[8:12] != b"WEBP":
        raise RuntimeError(f"not a RIFF/WEBP: {path}")
    return nbytes


def render_turntable(sc, arm, mesh, letter, palm_normal, finger_up, axis, outdir):
    os.makedirs(outdir, exist_ok=True)
    poc.apply_pose(arm, letter, palm_normal, finger_up, axis)
    lo, hi = poc.world_bbox(mesh)
    span = (hi - lo).length
    if not math.isfinite(span) or span < 0.05 or span > 0.8:
        raise RuntimeError(f"{letter} bbox span unreasonable: {span}")
    center = (lo + hi) / 2
    dist = span * 1.35
    front = poc.front_view_dir(letter, palm_normal, finger_up)
    up = poc.view_up(letter, front, finger_up)
    total = 0
    for k in range(FRAMES):
        direction = Matrix.Rotation(math.radians(-k * 360.0 / FRAMES), 3, up) @ front
        path = os.path.join(outdir, f"{k:02d}.webp")
        cam = poc.add_camera(center + direction * dist, center, up)
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam)
        total += check_webp(path)
    poc.reset_pose(arm)
    return total


def main():
    os.makedirs(OUT, exist_ok=True)
    gltf = os.path.join(poc.VENDOR, "hand_r.gltf")
    if not os.path.isfile(gltf):
        raise SystemExit(f"missing input glTF: {gltf}")
    arm, mesh = poc.import_hand()
    for mod in mesh.modifiers:
        if mod.type == "ARMATURE" and hasattr(mod, "use_preserve_volume"):
            mod.use_preserve_volume = True
    _center, palm_normal, finger_up = poc.palm_frame(arm)
    axis = poc.flex_axis()
    sc = poc.setup_render(size=SIZE)
    sc.render.image_settings.file_format = "WEBP"
    sc.render.image_settings.quality = WEBP_QUALITY
    sizes = {}
    for letter in LETTERS:
        outdir = os.path.join(OUT, f"GF0021.{letter}")
        sizes[f"GF0021.{letter}"] = render_turntable(
            sc, arm, mesh, letter, palm_normal, finger_up, axis, outdir)
        print(f"OK GF0021.{letter} {FRAMES} frames {sizes[f'GF0021.{letter}']} B total")
    meta = {
        "id": "godot-xr-rot",
        "generated_on": str(date.today()),
        "purpose": "练习页拖动旋转帧候选；目检通过后才复制进 practice/content/demos/rot/",
        "generator": "blender/build_godot_hand_turntable.py",
        "posesFrom": "blender/build_godot_hand_poc.py",
        "source": {
            "mesh": "blender/vendor/godot-xr-hands/hand_r.gltf",
            "license": "CC0 1.0 Universal",
            "author": "DigitalN8m4r3 aka Miodrag Sejic",
            "year": 2022,
        },
        "frames": FRAMES,
        "size": SIZE,
        "format": f"webp q{WEBP_QUALITY} rgba",
        "frameConvention": (
            "00 帧与各字母 front_view_dir 同机位；帧号增大 = 相机绕 finger_up 俯视顺时针，"
            "观者看到手模左侧；前端右拖 = 帧号增大"
        ),
        "letters": {lid: FRAMES for lid in sizes},
        "bytes": sizes,
        "known_limits": [
            "V/W 拇指与远节近似接触、非精确贴面（继承 godot-xr-v2 结论）。",
            "Workbench 预览材质，不是最终片场灯光。",
        ],
    }
    meta_path = os.path.join(OUT, "metadata.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("WROTE", meta_path)
    print("TURNTABLE_OK", OUT)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("TURNTABLE_FAIL", type(exc).__name__, exc, file=sys.stderr)
        raise
