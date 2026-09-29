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
    sc.display.shading.show_cavity = True
    sc.display.shading.background_type = "WORLD"
    world = bpy.data.worlds.new("W")
    world.color = (1.0, 1.0, 1.0)
    sc.world = world
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


LETTERS = {
    # GF0021: 握拳，拇指贴食指侧
    "A": {f: (20, 85, 95, 55) for f in FINGERS},
    # GF0021: 四指伸直并拢，拇指弯回贴掌心（四指保持 rest 伸展，仅收拇指+并拢）
    "B": {f: (5, 2, 0, 0) for f in FINGERS},
    # GF0021: 食中二指伸直并拢，拇指弯回压无名指、小指
    "U": {"Index": (8, 5, 0, 0), "Middle": (8, 5, 0, 0),
          "Ring": (30, 95, 100, 60), "Little": (30, 95, 100, 60)},
}
THUMB_CURL = {"A": 45.0, "B": 60.0, "U": 55.0}
# 拇指掌骨绕 finger_up 的对掌角（负值 = 扫向掌心一侧）
THUMB_OPPOSE = {"A": -30.0, "B": -45.0, "U": -40.0}
# 绕掌法线的开合角（度），rest 姿态手指自然张开，需收拢；正角向拇指侧
SPLAY = {"A": {}, "B": {"Index": -4, "Middle": -1.5, "Ring": 1.5, "Little": 4},
         "U": {"Index": -6, "Middle": 5}}


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
        if "Thumb_Metacarpal_R" in arm.pose.bones:
            curl(arm, "Thumb_Metacarpal_R", THUMB_OPPOSE[letter], finger_up)
        pose_letter(arm, curls, axis)
        for seg in ("Metacarpal", "Proximal", "Distal"):
            name = f"Thumb_{seg}_R"
            if name in arm.pose.bones:
                curl(arm, name, THUMB_CURL[letter] / 3, axis)
        lo, hi = world_bbox(mesh)
        c = (lo + hi) / 2
        dist = (hi - lo).length * 1.35
        across = palm_normal.cross(finger_up).normalized()
        views = [(f"GF0021.{letter}_front.png", -palm_normal)]
        if letter == "A":
            views += [(f"GF0021.{letter}_back.png", palm_normal),
                      (f"GF0021.{letter}_side.png", across)]
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
