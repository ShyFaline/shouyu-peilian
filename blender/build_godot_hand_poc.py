"""Godot XR rigged hand (CC0) PoC: import, inspect, pose GF0021 letters.

Input:  blender/vendor/godot-xr-hands/hand_r.gltf  (self-contained, CC0)
Output: blender/vendor/godot-xr-hands/poc/*.png + bones.json

Usage:
  blender -b --python build_godot_hand_poc.py -- inspect   # dump bones + 6 orientation views
  blender -b --python build_godot_hand_poc.py -- letters   # render A/B posed, palm to camera
"""

import bpy
import json
import math
import os
import sys
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
VENDOR = os.path.join(ROOT, "vendor", "godot-xr-hands")
POC = os.path.join(VENDOR, "poc")
os.makedirs(POC, exist_ok=True)

FINGERS = ("Index", "Middle", "Ring", "Little")
SEGMENTS = ("Metacarpal", "Proximal", "Intermediate", "Distal")


def import_hand():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(VENDOR, "hand_r.gltf"))
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    # glTF 里混有一个无蒙皮的 Icosphere 占位网格，删掉，只留蒙皮手
    mesh = None
    for o in list(bpy.data.objects):
        if o.type != "MESH":
            continue
        if len(o.vertex_groups) == 0:
            bpy.data.objects.remove(o)
        else:
            mesh = o
    # Workbench MATERIAL 色：暖肤色，对齐 Hour5 基线采样 (240,205,180)
    mat = bpy.data.materials.new("Skin")
    mat.diffuse_color = (1.0, 0.65, 0.48, 1.0)
    mesh.data.materials.clear()
    mesh.data.materials.append(mat)
    return arm, mesh


def bone_names(arm, prefix):
    names = []
    for seg in SEGMENTS + ("Tip",):
        n = f"{prefix}_{seg}_R"
        if n in arm.pose.bones:
            names.append(n)
    return names


def wpos(arm, pb):
    return arm.matrix_world @ pb.head


def world_bbox(mesh):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(dg)
    pts = [ev.matrix_world @ v.co for v in ev.to_mesh().vertices]
    lo = Vector((min(p[i] for p in pts) for i in range(3)))
    hi = Vector((max(p[i] for p in pts) for i in range(3)))
    ev.to_mesh_clear()
    return lo, hi


def palm_frame(arm):
    """Return (center, palm_normal_guess, finger_up) from metacarpal landmarks."""
    pb = arm.pose.bones
    wrist = wpos(arm, pb["Wrist_R"]) if "Wrist_R" in pb else None
    idx = wpos(arm, pb["Index_Metacarpal_R"])
    lit = wpos(arm, pb["Little_Metacarpal_R"])
    mid_p = wpos(arm, pb["Middle_Proximal_R"])
    mid_d = wpos(arm, pb["Middle_Distal_R"])
    finger_up = (mid_d - mid_p).normalized()
    across = (lit - idx).normalized()
    palm_normal = across.cross(finger_up).normalized()
    center = (idx + lit) / 2
    if wrist:
        center = (center + wrist) / 2
    return center, palm_normal, finger_up


def flex_axis():
    return Vector((0.0, 0.0, 1.0))


def curl(arm, name, deg, axis):
    """Rotate bone around a fixed world flex axis, pivoting at the joint (bone head)."""
    pb = arm.pose.bones[name]
    M = arm.matrix_world @ pb.matrix
    head = M.translation.copy()
    hinge = (Matrix.Translation(head)
             @ Matrix.Rotation(math.radians(deg), 4, axis.normalized())
             @ Matrix.Translation(-head))
    pb.matrix = arm.matrix_world.inverted() @ (hinge @ M)
    bpy.context.view_layer.update()


def pose_letter(arm, curls, axis):
    """curls: {finger_prefix: (metacarpal_deg, proximal_deg, intermediate_deg, distal_deg)}"""
    for finger, angles in curls.items():
        for seg, deg in zip(SEGMENTS, angles):
            name = f"{finger}_{seg}_R"
            if deg and name in arm.pose.bones:
                curl(arm, name, deg, axis)


def setup_render(size=512):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.studio_light = "paint.sl"   # 亮平的工作室光，有柔和体积感但不过曝
    sc.display.shading.show_cavity = True
    sc.display.shading.color_type = "MATERIAL"
    sc.display.shading.background_type = "WORLD"
    world = bpy.data.worlds.new("W")
    world.color = (1.0, 1.0, 1.0)
    sc.world = world
    sc.view_settings.view_transform = "Standard"   # AgX 会把白底压灰，对齐 Hour5 基线用 Standard
    sc.render.film_transparent = True              # 基线是 RGBA 透明底，练习页白卡片上显示
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.resolution_x = size
    sc.render.resolution_y = size
    sc.render.image_settings.file_format = "PNG"
    return sc


def add_camera(location, target, up):
    cam_data = bpy.data.cameras.new("Cam")
    cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = location
    forward = (target - location).normalized()
    z = -forward
    x = up.cross(z).normalized()
    y = z.cross(x).normalized()
    rot = Matrix((x, y, z)).transposed().to_4x4()
    cam.matrix_world = Matrix.Translation(location) @ rot
    bpy.context.scene.camera = cam
    return cam


def render(sc, path):
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("WROTE", path)


def cmd_inspect(arm, mesh):
    info = {"armature": arm.name, "mesh": mesh.name, "bones": []}
    for b in arm.data.bones:
        info["bones"].append({
            "name": b.name,
            "parent": b.parent.name if b.parent else None,
            "head": [round(v, 5) for v in (arm.matrix_world @ b.head_local)],
            "tail": [round(v, 5) for v in (arm.matrix_world @ b.tail_local)],
        })
    lo, hi = world_bbox(mesh)
    info["bbox"] = {"min": list(lo), "max": list(hi)}
    with open(os.path.join(POC, "bones.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=1)
    print("BONES", [b["name"] for b in info["bones"]])

    sc = setup_render(size=384)
    center = (lo + hi) / 2
    dist = (hi - lo).length * 1.4
    for label, direction in (("px", (1, 0, 0)), ("nx", (-1, 0, 0)),
                             ("py", (0, 1, 0)), ("ny", (0, -1, 0)),
                             ("pz", (0, 0, 1)), ("nz", (0, 0, -1))):
        d = Vector(direction)
        up = Vector((0, 1, 0)) if abs(d.z) > 0.9 else Vector((0, 0, 1))
        add_camera(center + d * dist, center, up)
        render(sc, os.path.join(POC, f"orient_{label}.png"))
        bpy.data.objects.remove(sc.camera)


FIST = (30, 95, 100, 60)   # 弯曲抵掌心
EXT = (5, 0, 0, 0)         # 伸直（rest 微曲）

LETTERS = {
    # 原文页2：伸拇指指尖朝上，四指弯曲抵掌心，手背向右（2019 呈现角度调整名单）
    "A": {f: FIST for f in FINGERS},
    # 原文页2：四指并拢直立，拇指向掌心弯曲贴掌，掌心向前偏左
    "B": {f: EXT for f in FINGERS},
    # 【冲突记录用草稿】OCR 与仓库规则未裁定；按仓库规则：食中二指伸直并拢
    "U": {"Index": EXT, "Middle": EXT, "Ring": FIST, "Little": FIST},
    # 原文页5：食中指直立分开成 V，拇无名小弯曲，拇指搭无名指远节
    "V": {"Index": EXT, "Middle": EXT, "Ring": FIST, "Little": FIST},
    # 原文页5：食中无名直立分开成 W，拇小指弯曲，拇指搭小指远节
    "W": {"Index": EXT, "Middle": EXT, "Ring": EXT, "Little": FIST},
    # 原文页3：拇食指张开、食指朝上，中无名小弯曲抵掌心；原文无「直角」，张开角待人工对图
    "L": {"Index": EXT, "Middle": FIST, "Ring": FIST, "Little": FIST},
    # 原文页5：伸拇、小指，食中无名弯曲
    "Y": {"Little": EXT, "Index": FIST, "Middle": FIST, "Ring": FIST},
    # 【待人工对图】OCR「食指直立」与仓库「小指伸直」冲突；按仓库规则渲染
    "I": {"Little": EXT, "Index": FIST, "Middle": FIST, "Ring": FIST},
}
# 绕掌法线（+X）的开合角：正角 = 向拇指侧（+Z）
SPLAY = {"A": {}, "B": {"Index": -4, "Middle": -1.5, "Ring": 1.5, "Little": 4},
         "U": {"Index": -6, "Middle": 5},
         "V": {"Index": 12, "Middle": -12},
         "W": {"Index": 12, "Ring": -12},
         "L": {"Index": -2}, "Y": {"Little": -10}, "I": {"Little": -6}}
# 拇指 = (绕掌法线摆角, 绕finger_up屈曲 meta, prox, dist)；屈曲负角 = 扫向掌心（-X）
THUMB = {"A": (-80, -10, -8, -5),     # 竖起，指尖朝上
         "B": (0, -40, -45, -30),     # 弯回贴掌
         "U": (0, -35, -40, -30),
         "V": (0, -40, -38, -25),     # 搭无名指远节
         "W": (0, -48, -40, -25),     # 搭小指远节
         "L": (-35, 0, 0, 0),         # 张开
         "Y": (-55, 0, 0, 0),         # 伸出
         "I": (0, -35, -40, -30)}
# 呈现角度：A 手背向右（背面视角）；其余掌心向前偏左（掌心视角 + 绕竖轴偏转）
VIEW = {"A": "back"}
PALM_YAW_DEG = 20.0


def cmd_letters(arm, mesh):
    sc = setup_render()
    for mod in mesh.modifiers:
        if mod.type == "ARMATURE" and hasattr(mod, "use_preserve_volume"):
            mod.use_preserve_volume = True
    center, palm_normal, finger_up = palm_frame(arm)
    axis = flex_axis()
    print("FLEX_AXIS", tuple(axis), "PALM_NORMAL", tuple(round(v, 3) for v in palm_normal))
    for letter, curls in LETTERS.items():
        for finger, deg in SPLAY[letter].items():
            name = f"{finger}_Metacarpal_R"
            if deg and name in arm.pose.bones:
                curl(arm, name, deg, palm_normal)
        swing, tmeta, tprox, tdist = THUMB[letter]
        if swing and "Thumb_Metacarpal_R" in arm.pose.bones:
            curl(arm, "Thumb_Metacarpal_R", swing, palm_normal)
        pose_letter(arm, curls, axis)
        for seg, deg in zip(("Metacarpal", "Proximal", "Distal"), (tmeta, tprox, tdist)):
            name = f"Thumb_{seg}_R"
            if deg and name in arm.pose.bones:
                curl(arm, name, deg, finger_up)
        lo, hi = world_bbox(mesh)
        c = (lo + hi) / 2
        dist = (hi - lo).length * 1.35
        across = palm_normal.cross(finger_up).normalized()
        if VIEW.get(letter) == "back":
            front_dir = palm_normal.copy()   # 手背向观者
        else:
            yaw = Matrix.Rotation(math.radians(PALM_YAW_DEG), 3, finger_up)
            front_dir = (yaw @ -palm_normal).normalized()   # 掌心向前偏左
        views = [(f"GF0021.{letter}_front.png", front_dir),
                 (f"GF0021.{letter}_side.png", across)]   # 侧面验证视角，防支点类回归
        for fname, direction in views:
            add_camera(c + direction * dist, c, finger_up)
            render(sc, os.path.join(POC, fname))
            bpy.data.objects.remove(sc.camera)
        for pb in arm.pose.bones:
            pb.matrix_basis.identity()
        bpy.context.view_layer.update()


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["inspect"]
    arm, mesh = import_hand()
    if argv[0] == "inspect":
        cmd_inspect(arm, mesh)
    else:
        cmd_letters(arm, mesh)


main()
