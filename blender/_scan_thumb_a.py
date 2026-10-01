"""一次性扫描：A 的 THUMB swing 参数 → 导出相机下拇指（lm2→lm4）二维倾角。

用法：blender -b --python blender/_scan_thumb_a.py
不改任何文件，只打印表格，供挑选候选值。
"""
import importlib.util
import math
import os

import bpy
from bpy_extras.object_utils import world_to_camera_view

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("poc", os.path.join(HERE, "build_godot_hand_poc.py"))
poc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(poc)

arm, mesh = poc.import_hand()
sc = poc.setup_render()
center, palm_normal, finger_up = poc.palm_frame(arm)
axis = poc.flex_axis()


def tilt_for(thumb):
    poc.THUMB["A"] = thumb
    poc.apply_pose(arm, "A", palm_normal, finger_up, axis)
    lo, hi = poc.world_bbox(mesh)
    c = (lo + hi) / 2
    dist = (hi - lo).length * 1.35
    front_dir = poc.front_view_dir("A", palm_normal, finger_up)
    cam = poc.add_camera(c + front_dir * dist, c, poc.view_up("A", front_dir, finger_up))

    def lm(i):
        bone, end = poc.LM_BONES[i]
        pb = arm.pose.bones[bone]
        wp = arm.matrix_world @ (pb.head if end == "head" else pb.tail)
        co = world_to_camera_view(sc, cam, wp)
        return co.x, 1.0 - co.y

    x2, y2 = lm(2)
    x4, y4 = lm(4)
    dx, dy = x4 - x2, y4 - y2
    tilt = math.degrees(math.atan2(abs(dx), -dy)) if dy < 0 else float("nan")
    side = "左" if dx < 0 else "右"
    bpy.data.objects.remove(cam)
    poc.reset_pose(arm)
    return tilt, side


print("SCAN swing tprox 倾角(°) 偏向")
for swing, tprox in ((-20, -15), (-20, 0)):
    t, side = tilt_for((swing, 0, tprox, 0))
    print(f"SCAN {swing:>4} {tprox:>4} {t:6.1f} {side}")
