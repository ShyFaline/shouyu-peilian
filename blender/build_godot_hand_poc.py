"""Godot XR rigged hand (CC0) PoC: import, inspect, pose GF0021 letters.

Input:  blender/vendor/godot-xr-hands/hand_r.gltf  (self-contained, CC0)
Output: blender/vendor/godot-xr-hands/poc/*.png + bones.json

Usage:
  blender -b --python build_godot_hand_poc.py -- inspect   # dump bones + 6 orientation views
  blender -b --python build_godot_hand_poc.py -- letters   # 渲染全部 32 字母正/侧面（姿态表 2026-10-01 按官方原文全量重排）
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
BENT90 = (10, 90, 5, 5)    # 并拢微曲与手掌成 90 度角（S/SH 类：近节折 90，关节保持直）
HOOK = (5, 10, 90, 20)     # J：PIP 折 90°，中节指背向上，远节随弯
PINCH = (10, 60, 70, 45)   # 拇食指搭圈时的食指（E/F/P）
TOUCH = (10, 75, 70, 45)   # 指尖相抵类（T 的中/无名指）
C_CURVE = (20, 55, 55, 35) # C：五指弯曲成 C

# 2026-10-01 全量重排：按 letters.json 官方原文转写逐字母摆姿。
# 四指键：Index/Middle/Ring/Little → (掌骨, 近节, 中节, 远节) 屈曲角。
LETTERS = {
    "A": {f: FIST for f in FINGERS},                                  # 握拳伸拇指
    "B": {f: EXT for f in FINGERS},                                   # 四指并拢直立
    "C": {f: C_CURVE for f in FINGERS},                               # 五指弯曲成 C
    "D": {f: FIST for f in FINGERS},                                  # 握拳，拇指搭中指中节
    "E": {"Index": PINCH, "Middle": EXT, "Ring": EXT, "Little": EXT}, # 拇食指搭圈，三指横伸
    "F": {"Index": PINCH, "Middle": EXT, "Ring": FIST, "Little": FIST},
    "G": {"Index": EXT, "Middle": FIST, "Ring": FIST, "Little": FIST},
    "H": {"Index": EXT, "Middle": EXT, "Ring": FIST, "Little": FIST},
    "I": {"Index": EXT, "Middle": FIST, "Ring": FIST, "Little": FIST},# 食指直立（按原文文字）
    "J": {"Index": HOOK, "Middle": FIST, "Ring": FIST, "Little": FIST},
    "K": {"Index": EXT, "Middle": EXT, "Ring": FIST, "Little": FIST}, # 食指直立、中指横伸（见 SPLAY）
    "L": {"Index": EXT, "Middle": FIST, "Ring": FIST, "Little": FIST},
    "M": {f: FIST for f in FINGERS},
    "N": {f: FIST for f in FINGERS},
    "O": {f: C_CURVE for f in FINGERS},                               # 拇食中指尖相抵成 O
    "P": {"Index": PINCH, "Middle": EXT, "Ring": EXT, "Little": EXT}, # 同 E 手型，指尖朝下
    "Q": {"Index": TOUCH, "Middle": TOUCH, "Ring": FIST, "Little": FIST}, # 拇食中指尖相捏
    "R": {"Index": EXT, "Middle": FIST, "Ring": FIST, "Little": FIST},# 食指朝左、拇指朝上
    "S": {f: BENT90 for f in FINGERS},                                # 四指并拢微曲 90 度
    "T": {"Index": EXT, "Middle": TOUCH, "Ring": TOUCH, "Little": EXT},
    "U": {f: EXT for f in FINGERS},                                   # 四指并拢直立（2026-10-01 四指裁定）
    "V": {"Index": EXT, "Middle": EXT, "Ring": FIST, "Little": FIST},
    "W": {"Index": EXT, "Middle": EXT, "Ring": EXT, "Little": FIST},
    "X": {"Index": EXT, "Middle": EXT, "Ring": FIST, "Little": FIST}, # 食中直立交叉（见 SPLAY）
    "Y": {"Index": FIST, "Middle": FIST, "Ring": FIST, "Little": EXT},
    "Z": {"Index": EXT, "Middle": FIST, "Ring": FIST, "Little": EXT}, # 食小指横伸
    "ZH": {"Index": EXT, "Middle": EXT, "Ring": FIST, "Little": EXT}, # 食中小指横伸，食中并拢
    "CH": {f: EXT for f in FINGERS},                                  # 四指并拢横伸成扁コ
    "SH": {"Index": BENT90, "Middle": BENT90, "Ring": FIST, "Little": FIST},
    "NG": {"Index": FIST, "Middle": FIST, "Ring": FIST, "Little": EXT}, # 小指横伸
    "EH": {"Index": PINCH, "Middle": EXT, "Ring": EXT, "Little": EXT},  # 用 E 的指式
    "UE": {f: EXT for f in FINGERS},                                  # 用 U 的指式
}

# 绕掌法线（+X）的开合角：正角 = 向拇指侧（+Z）
TOGETHER4 = {"Index": -6, "Middle": -1.5, "Ring": 1.5, "Little": 6}
SPLAY = {
    "A": {}, "B": TOGETHER4, "C": {}, "D": {},
    "E": {"Middle": -2, "Ring": 2, "Little": 8},       # 三指稍分开
    "F": {"Index": -2, "Middle": 4},                   # 食中稍分开
    "G": {"Index": 4},
    "H": {"Index": -6, "Middle": 6},                   # 食中并拢
    "I": {"Index": 4},
    "J": {"Index": 3},
    "K": {"Index": -6, "Middle": 75},                  # 中指横伸（向拇指侧）
    "L": {"Index": -2},
    "M": {"Index": -4, "Middle": -1, "Ring": 2, "Little": 4},
    "N": {"Index": -3, "Middle": 2},
    "O": {},
    "P": {"Middle": -2, "Ring": 2, "Little": 8},
    "Q": {"Index": -3, "Middle": 3, "Little": -10},
    "R": {"Index": 4},
    "S": TOGETHER4,
    "T": {"Index": 10, "Little": -12},                 # 食、小指直立分开
    "U": TOGETHER4,
    "V": {"Index": 12, "Middle": -12},
    "W": {"Index": 18, "Ring": -18},
    "X": {"Index": -7, "Middle": 7},                   # 交叉：中指搭在食指上
    "Y": {"Little": -12},
    "Z": {"Index": 6, "Little": -8},
    "ZH": {"Index": -2, "Middle": 2, "Little": -9},    # 食中并拢，小指离开
    "CH": TOGETHER4,
    "SH": {"Index": -3, "Middle": 3},
    "NG": {"Little": 14},
    "EH": {"Middle": -2, "Ring": 2, "Little": 8},
    "UE": {"Index": -6, "Middle": -1.5, "Ring": 1.5, "Little": 12},  # ü：小指稍离开
}

# 拇指 = (摆角@掌法线, meta屈曲@finger_up, prox折叠@掌法线, dist折叠@掌法线)
# 判定器 thumb 卷曲 = 二维 IP 内角（lm2/3/4，阈值 ≤100°），折叠必须发生在掌面（≈成像面）内
TUCK_MID = (-28, -8, -72, -100)  # 搭中指中节指上
TUCK_RING = (-30, -8, -70, -95)  # 搭无名指远节指上
TUCK_PALM = (-36, 0, -50, -95)   # 贴近手掌
TUCK_PINKY = (-35, -8, -65, -95) # 搭小指远节指上（W）
THUMB = {
    "A": (-80, -10, 0, 0),     # 竖起，指尖朝上
    "B": TUCK_PALM,
    "C": (-15, -8, -45, -40),    # 向上弯曲成 C 的一边
    "D": TUCK_MID,               # 握拳搭中指中节
    "E": (-20, -10, -45, -50),   # 与食指搭圈
    "F": TUCK_RING, "G": TUCK_MID, "H": TUCK_RING,
    "I": TUCK_MID, "J": TUCK_MID, "K": TUCK_MID,
    "L": (-75, 0, 0, 0),       # 张开（二维投影需接近直角）
    "M": (-42, -8, -70, -58), "N": (-42, -8, -70, -58),
    "O": (-15, -8, -50, -45),    # 向上弯曲参与 O 形
    "P": (-20, -10, -45, -50),   # 与食指搭圈
    "Q": (-35, -12, -45, -45),   # 在下与食中指尖相捏
    "R": (-80, -10, 0, 0),       # 拇指指尖朝上（同 A 的竖拇指）
    "S": TUCK_PALM, "T": (-40, -8, -65, -55),  # T：与中无名指尖相抵
    "U": TUCK_PALM,
    "V": TUCK_RING, "W": TUCK_PINKY, "X": TUCK_RING,
    "Y": (-5, 0, 0, 0),        # 伸出（向外侧展开、斜向上）
    "Z": (-40, -8, -45, -45), "ZH": TUCK_RING, "CH": (-30, -8, -20, -20),
    "SH": TUCK_PALM, "NG": (-40, -8, -45, -45),
    "EH": (-20, -10, -45, -50), "UE": TUCK_PALM,
}

# 呈现角度：view ∈ {palm（掌心向前偏左）, back（手背向观者）}；roll = 相机绕视线旋转角（度）。
# 横伸字母（指尖朝左）用 back + roll；P 指尖朝下用 palm + roll 180。
ORIENT = {
    "A": ("back", 0),
    "E": ("back", 270), "F": ("back", 270), "G": ("back", 270),
    "P": ("palm", 180),
    "R": ("back", 270),
    "Z": ("back", 270), "ZH": ("back", 270), "CH": ("back", 270), "NG": ("back", 270),
    "EH": ("back", 270),
}
PALM_YAW_DEG = 20.0


def orient_of(letter):
    view, roll = ORIENT.get(letter, ("palm", 0))
    return view, roll


def apply_pose(arm, letter, palm_normal, finger_up, axis):
    for finger, deg in SPLAY[letter].items():
        name = f"{finger}_Metacarpal_R"
        if deg and name in arm.pose.bones:
            curl(arm, name, deg, palm_normal)
    swing, tmeta, tprox, tdist = THUMB[letter]
    if swing and "Thumb_Metacarpal_R" in arm.pose.bones:
        curl(arm, "Thumb_Metacarpal_R", swing, palm_normal)
    pose_letter(arm, LETTERS[letter], axis)
    if tmeta and "Thumb_Metacarpal_R" in arm.pose.bones:
        curl(arm, "Thumb_Metacarpal_R", tmeta, finger_up)
    for seg, deg in (("Proximal", tprox), ("Distal", tdist)):
        name = f"Thumb_{seg}_R"
        if deg and name in arm.pose.bones:
            curl(arm, name, deg, palm_normal)


def front_view_dir(letter, palm_normal, finger_up):
    view, _roll = orient_of(letter)
    if view == "back":
        return palm_normal.copy()   # 手背向观者
    yaw = Matrix.Rotation(math.radians(PALM_YAW_DEG), 3, finger_up)
    return (yaw @ -palm_normal).normalized()   # 掌心向前偏左


def view_up(letter, view_dir, finger_up):
    """相机上方向：默认手指朝上；roll 使横伸字母的指尖在画面里朝左/朝下。"""
    _view, roll = orient_of(letter)
    if not roll:
        return finger_up.copy()
    return (Matrix.Rotation(math.radians(roll), 3, view_dir) @ finger_up).normalized()


def reset_pose(arm):
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()


def cmd_letters(arm, mesh):
    sc = setup_render()
    for mod in mesh.modifiers:
        if mod.type == "ARMATURE" and hasattr(mod, "use_preserve_volume"):
            mod.use_preserve_volume = True
    center, palm_normal, finger_up = palm_frame(arm)
    axis = flex_axis()
    print("FLEX_AXIS", tuple(axis), "PALM_NORMAL", tuple(round(v, 3) for v in palm_normal))
    for letter in LETTERS:
        apply_pose(arm, letter, palm_normal, finger_up, axis)
        lo, hi = world_bbox(mesh)
        c = (lo + hi) / 2
        dist = (hi - lo).length * 1.35
        across = palm_normal.cross(finger_up).normalized()
        front_dir = front_view_dir(letter, palm_normal, finger_up)
        front_up = view_up(letter, front_dir, finger_up)
        views = [(f"GF0021.{letter}_front.png", front_dir, front_up),
                 (f"GF0021.{letter}_side.png", across, finger_up)]   # 侧面验证视角，防支点类回归
        for fname, direction, up in views:
            add_camera(c + direction * dist, c, up)
            render(sc, os.path.join(POC, fname))
            bpy.data.objects.remove(sc.camera)
        reset_pose(arm)


# MediaPipe 21 点 ← 本骨架关节（Proximal.head=MCP, Intermediate.head=PIP, Distal.head=DIP, Distal.tail=指尖）
LM_BONES = [
    ("Wrist_R", "head"),
    ("Thumb_Metacarpal_R", "head"), ("Thumb_Proximal_R", "head"),
    ("Thumb_Distal_R", "head"), ("Thumb_Distal_R", "tail"),
    ("Index_Proximal_R", "head"), ("Index_Intermediate_R", "head"),
    ("Index_Distal_R", "head"), ("Index_Distal_R", "tail"),
    ("Middle_Proximal_R", "head"), ("Middle_Intermediate_R", "head"),
    ("Middle_Distal_R", "head"), ("Middle_Distal_R", "tail"),
    ("Ring_Proximal_R", "head"), ("Ring_Intermediate_R", "head"),
    ("Ring_Distal_R", "head"), ("Ring_Distal_R", "tail"),
    ("Little_Proximal_R", "head"), ("Little_Intermediate_R", "head"),
    ("Little_Distal_R", "head"), ("Little_Distal_R", "tail"),
]


def cmd_landmarks(arm, mesh):
    """摆姿 → 经渲染相机投影导出 21 点 golden JSON 到 practice/src/pose-goldens/（入库）。

    pose-goldens.test.js 断言恒等矩阵：每个 golden 仅通过自身字母（B×U 碰撞除外）。
    只导出 8 个主路径字母；改角度表或改判定规则后：重跑本模式 + node practice/src/pose-goldens.test.js。"""
    from bpy_extras.object_utils import world_to_camera_view
    golden_ids = ["A", "B", "I", "L", "U", "V", "W", "Y"]
    sc = setup_render()
    center, palm_normal, finger_up = palm_frame(arm)
    axis = flex_axis()
    outdir = os.path.join(ROOT, "..", "practice", "src", "pose-goldens")
    os.makedirs(outdir, exist_ok=True)
    for letter in golden_ids:
        apply_pose(arm, letter, palm_normal, finger_up, axis)
        lo, hi = world_bbox(mesh)
        c = (lo + hi) / 2
        dist = (hi - lo).length * 1.35
        front_dir = front_view_dir(letter, palm_normal, finger_up)
        cam = add_camera(c + front_dir * dist, c, view_up(letter, front_dir, finger_up))
        pts = []
        for bone, end in LM_BONES:
            pb = arm.pose.bones[bone]
            wp = arm.matrix_world @ (pb.head if end == "head" else pb.tail)
            co = world_to_camera_view(sc, cam, wp)
            pts.append({"x": round(co.x, 5), "y": round(1.0 - co.y, 5), "z": round(co.z, 5)})
        frame = {
            "targetLetterId": f"GF0021.{letter}",
            "coordSpace": "image_normalized",
            "imageWidth": sc.render.resolution_x,
            "imageHeight": sc.render.resolution_y,
            "landmarks": pts,
            "source": "godot-xr-hand PoC: 关节点经渲染相机投影，非 MediaPipe 检测",
        }
        path = os.path.join(outdir, f"GF0021.{letter}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(frame, f, ensure_ascii=False, indent=1)
        print("WROTE", path)
        bpy.data.objects.remove(cam)
        reset_pose(arm)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["inspect"]
    arm, mesh = import_hand()
    if argv[0] == "inspect":
        cmd_inspect(arm, mesh)
    elif argv[0] == "landmarks":
        cmd_landmarks(arm, mesh)
    else:
        cmd_letters(arm, mesh)


if __name__ == "__main__":
    main()
