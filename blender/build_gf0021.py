"""Build a rigged right hand and GF 0021 pose markers. Run only via blender.exe -P."""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
BLEND = ROOT / "hand_gf0021.blend"

# 右手：掌心朝 +Y（镜头），手指朝 +Z，拇指在 -X（画面左侧）。
# 骨滚动 align_roll(+Y) 后：局部 X = 屈曲（正值向掌心），局部 Z = 张开（正值向小指）。


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (
        bpy.data.meshes,
        bpy.data.armatures,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.materials,
        bpy.data.actions,
        bpy.data.curves,
    ):
        for item in list(coll):
            coll.remove(item)


def look_at(obj, target: Vector, up=Vector((0.0, 0.0, 1.0))):
    direction = (target - obj.location).normalized()
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def joint_map():
    j = {
        "wrist": Vector((0.0, 0.0, 0.0)),
        "palm": Vector((0.004, 0.006, 0.050)),
        "palm_radial": Vector((-0.032, 0.008, 0.056)),
        "palm_ulnar": Vector((0.040, 0.003, 0.052)),
        "index.MCP": Vector((-0.026, 0.012, 0.096)),
        "middle.MCP": Vector((-0.002, 0.014, 0.102)),
        "ring.MCP": Vector((0.022, 0.012, 0.097)),
        "pinky.MCP": Vector((0.044, 0.007, 0.086)),
        "thumb.CMC": Vector((-0.016, 0.018, 0.022)),
        "thumb.MCP": Vector((-0.044, 0.024, 0.052)),
        "thumb.IP": Vector((-0.062, 0.020, 0.078)),
        "thumb.TIP": Vector((-0.074, 0.014, 0.100)),
    }
    lengths = {
        "index": (0.044, 0.027, 0.020),
        "middle": (0.049, 0.030, 0.022),
        "ring": (0.045, 0.028, 0.020),
        "pinky": (0.034, 0.021, 0.017),
    }
    splay = {"index": -0.011, "middle": 0.0, "ring": 0.012, "pinky": 0.024}
    for name, (l0, l1, l2) in lengths.items():
        mcp = j[f"{name}.MCP"]
        dx = splay[name]
        pip = mcp + Vector((dx * 0.35, 0.002, l0))
        dip = pip + Vector((dx * 0.22, 0.001, l1))
        tip = dip + Vector((dx * 0.12, 0.0, l2))
        j[f"{name}.PIP"] = pip
        j[f"{name}.DIP"] = dip
        j[f"{name}.TIP"] = tip
    return j


def add_bone(arm, name, head, tail, parent=None, connected=False):
    bone = arm.edit_bones.new(name)
    bone.head = head
    bone.tail = tail
    bone.use_connect = connected
    if parent is not None:
        bone.parent = parent
    bone.align_roll(Vector((0.0, 1.0, 0.0)))
    return bone


def build_armature(j):
    data = bpy.data.armatures.new("HandArmature")
    arm = bpy.data.objects.new("HandRig", data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = data.edit_bones
    wrist = add_bone(data, "wrist", j["wrist"], j["palm"])
    add_bone(data, "palm", j["palm"], j["palm"] + Vector((0.0, 0.0, 0.02)), wrist, False)
    thumb_cmc = add_bone(data, "thumb.CMC", j["thumb.CMC"], j["thumb.MCP"], wrist, False)
    thumb_mcp = add_bone(data, "thumb.MCP", j["thumb.MCP"], j["thumb.IP"], thumb_cmc, True)
    thumb_ip = add_bone(data, "thumb.IP", j["thumb.IP"], j["thumb.TIP"], thumb_mcp, True)
    add_bone(
        data,
        "thumb.TIP",
        j["thumb.TIP"],
        j["thumb.TIP"] + Vector((-0.006, -0.002, 0.008)),
        thumb_ip,
        True,
    )
    for finger in ("index", "middle", "ring", "pinky"):
        mcp = add_bone(data, f"{finger}.MCP", j[f"{finger}.MCP"], j[f"{finger}.PIP"], wrist, False)
        pip = add_bone(data, f"{finger}.PIP", j[f"{finger}.PIP"], j[f"{finger}.DIP"], mcp, True)
        dip = add_bone(data, f"{finger}.DIP", j[f"{finger}.DIP"], j[f"{finger}.TIP"], pip, True)
        add_bone(
            data,
            f"{finger}.TIP",
            j[f"{finger}.TIP"],
            j[f"{finger}.TIP"] + Vector((0.0, 0.0, 0.008)),
            dip,
            True,
        )
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.show_in_front = True
    data.display_type = "OCTAHEDRAL"
    return arm


def aligned_cone(name, p0: Vector, p1: Vector, r0: float, r1: float):
    vec = p1 - p0
    length = max(vec.length, 0.004)
    mid = (p0 + p1) * 0.5
    bpy.ops.mesh.primitive_cone_add(
        vertices=18,
        radius1=r0,
        radius2=r1,
        depth=length * 0.94,
        end_fill_type="TRIFAN",
        location=mid,
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.rotation_euler = Vector((0.0, 0.0, 1.0)).rotation_difference(vec.normalized()).to_euler()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return obj


def sphere(name, loc: Vector, radius: float):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=16, ring_count=10, radius=radius, location=loc
    )
    obj = bpy.context.active_object
    obj.name = name
    return obj


def build_mesh(j):
    parts = []
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.006, 0.002, 0.052))
    palm = bpy.context.active_object
    palm.name = "Palm"
    palm.scale = (0.054, 0.020, 0.050)
    bpy.ops.object.transform_apply(scale=True)
    bevel = palm.modifiers.new("Bevel", "BEVEL")
    bevel.width = 0.009
    bevel.segments = 4
    bpy.ops.object.modifier_apply(modifier="Bevel")
    parts.append(palm)

    finger_r = {
        "index": (0.0092, 0.0076, 0.0064),
        "middle": (0.0096, 0.0078, 0.0066),
        "ring": (0.0090, 0.0074, 0.0062),
        "pinky": (0.0076, 0.0064, 0.0054),
    }
    for name, (r0, r1, r2) in finger_r.items():
        mcp, pip, dip, tip = (
            j[f"{name}.MCP"],
            j[f"{name}.PIP"],
            j[f"{name}.DIP"],
            j[f"{name}.TIP"],
        )
        parts.append(aligned_cone(f"{name}_ph1", mcp, pip, r0, r1))
        parts.append(aligned_cone(f"{name}_ph2", pip, dip, r1, r2))
        parts.append(aligned_cone(f"{name}_ph3", dip, tip, r2, r2 * 0.75))
        parts.append(sphere(f"{name}_kn1", mcp, r0 * 1.05))
        parts.append(sphere(f"{name}_kn2", pip, r1 * 1.05))
        parts.append(sphere(f"{name}_kn3", dip, r2 * 1.08))
        parts.append(sphere(f"{name}_tip", tip, r2 * 0.95))

    parts.append(aligned_cone("thumb_ph0", j["thumb.CMC"], j["thumb.MCP"], 0.012, 0.010))
    parts.append(aligned_cone("thumb_ph1", j["thumb.MCP"], j["thumb.IP"], 0.010, 0.0084))
    parts.append(aligned_cone("thumb_ph2", j["thumb.IP"], j["thumb.TIP"], 0.0084, 0.0066))
    parts.append(sphere("thumb_kn0", j["thumb.CMC"], 0.012))
    parts.append(sphere("thumb_kn1", j["thumb.MCP"], 0.0105))
    parts.append(sphere("thumb_kn2", j["thumb.IP"], 0.009))
    parts.append(sphere("thumb_tip", j["thumb.TIP"], 0.0072))

    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    hand = bpy.context.active_object
    hand.name = "HandMesh"
    bpy.ops.object.shade_smooth()
    sub = hand.modifiers.new("Subsurf", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 2
    return hand


def skin_material():
    mat = bpy.data.materials.new("HandSkin")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.82, 0.62, 0.50, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.44
    if "Subsurface Weight" in bsdf.inputs:
        bsdf.inputs["Subsurface Weight"].default_value = 0.18
        if "Subsurface Radius" in bsdf.inputs:
            bsdf.inputs["Subsurface Radius"].default_value = (0.6, 0.2, 0.12)
    return mat


def parent_mesh(mesh, arm):
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    arm.hide_render = True


def setup_camera_lights():
    cam_data = bpy.data.cameras.new("FrontCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 0.30
    cam = bpy.data.objects.new("FrontCam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (0.05, 0.36, 0.12)
    look_at(cam, Vector((0.0, 0.0, 0.075)))
    bpy.context.scene.camera = cam

    def area(name, loc, energy, size, color=(1.0, 0.97, 0.93)):
        light = bpy.data.lights.new(name, "AREA")
        light.energy = energy
        light.size = size
        light.color = color
        obj = bpy.data.objects.new(name, light)
        bpy.context.collection.objects.link(obj)
        obj.location = loc
        look_at(obj, Vector((0.0, 0.0, 0.07)))
        return obj

    area("Key", (0.16, 0.28, 0.28), 90.0, 0.35)
    area("Fill", (-0.22, 0.22, 0.12), 28.0, 0.45, (0.85, 0.90, 1.0))
    area("Rim", (0.0, -0.30, 0.18), 40.0, 0.25, (1.0, 0.95, 0.88))

    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.92, 0.91, 0.88, 1.0)
    bg.inputs[1].default_value = 0.35
    bpy.context.scene.world = world


def setup_render():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.render.filepath = str(ROOT.parent / "practice" / "content" / "demos" / "preview")
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = 32
    scene.view_settings.view_transform = "Standard"
    scene.frame_start = 1
    scene.frame_end = 80


def set_euler(pb, xyz_deg):
    pb.rotation_mode = "XYZ"
    pb.rotation_euler = tuple(math.radians(v) for v in xyz_deg)


def reset_pose(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0.0, 0.0, 0.0)


def curl_finger(arm, name, curl, spread=0.0):
    set_euler(arm.pose.bones[f"{name}.MCP"], (curl * 78.0, 0.0, spread))
    set_euler(arm.pose.bones[f"{name}.PIP"], (curl * 96.0, 0.0, 0.0))
    set_euler(arm.pose.bones[f"{name}.DIP"], (curl * 52.0, 0.0, 0.0))


def apply_thumb(arm, preset):
    for bone, xyz in preset.items():
        set_euler(arm.pose.bones[bone], xyz)


# 草稿姿态：外形按 GF 0021—2019，角度待人对照国标图微调。
THUMB_FIST_UP = {  # A 握拳，拇指伸出
    "thumb.CMC": (-8.0, 12.0, -38.0),
    "thumb.MCP": (12.0, 0.0, -8.0),
    "thumb.IP": (10.0, 0.0, 0.0),
}
THUMB_ACROSS = {  # 拇指收在掌侧：B / U / V / I / W
    "thumb.CMC": (42.0, 18.0, 48.0),
    "thumb.MCP": (38.0, 6.0, 12.0),
    "thumb.IP": (28.0, 0.0, 0.0),
}
THUMB_L = {  # L 拇指与食指成直角
    "thumb.CMC": (6.0, 8.0, -62.0),
    "thumb.MCP": (6.0, 0.0, 0.0),
    "thumb.IP": (0.0, 0.0, 0.0),
}
THUMB_Y = {  # Y 拇指、小指伸出
    "thumb.CMC": (8.0, 10.0, -52.0),
    "thumb.MCP": (8.0, 0.0, 0.0),
    "thumb.IP": (0.0, 0.0, 0.0),
}


def pose_A(arm):
    """握拳，拇指伸出。"""
    apply_thumb(arm, THUMB_FIST_UP)
    for f in ("index", "middle", "ring", "pinky"):
        curl_finger(arm, f, 1.0)


def pose_B(arm):
    """四指并拢伸直，拇指弯曲贴掌心。"""
    apply_thumb(arm, THUMB_ACROSS)
    curl_finger(arm, "index", 0.0, 7.0)
    curl_finger(arm, "middle", 0.0, 0.0)
    curl_finger(arm, "ring", 0.0, -5.0)
    curl_finger(arm, "pinky", 0.0, -9.0)


def pose_U(arm):
    """食指、中指并拢伸直朝上，其余收起。"""
    apply_thumb(arm, THUMB_ACROSS)
    curl_finger(arm, "index", 0.0, 6.0)
    curl_finger(arm, "middle", 0.0, -6.0)
    curl_finger(arm, "ring", 1.0)
    curl_finger(arm, "pinky", 1.0)


def pose_V(arm):
    """食指、中指分开伸直成 V，其余收起。"""
    apply_thumb(arm, THUMB_ACROSS)
    curl_finger(arm, "index", 0.0, -20.0)
    curl_finger(arm, "middle", 0.0, 20.0)
    curl_finger(arm, "ring", 1.0)
    curl_finger(arm, "pinky", 1.0)


def pose_L(arm):
    """拇指、食指伸直成直角，其余收起。"""
    apply_thumb(arm, THUMB_L)
    curl_finger(arm, "index", 0.0, -4.0)
    curl_finger(arm, "middle", 1.0)
    curl_finger(arm, "ring", 1.0)
    curl_finger(arm, "pinky", 1.0)


def pose_Y(arm):
    """拇指、小指伸出，其余收起。"""
    apply_thumb(arm, THUMB_Y)
    curl_finger(arm, "index", 1.0)
    curl_finger(arm, "middle", 1.0)
    curl_finger(arm, "ring", 1.0)
    curl_finger(arm, "pinky", 0.0, 8.0)


def pose_I(arm):
    """只伸小指，其余握拳。"""
    apply_thumb(arm, THUMB_ACROSS)
    curl_finger(arm, "index", 1.0)
    curl_finger(arm, "middle", 1.0)
    curl_finger(arm, "ring", 1.0)
    curl_finger(arm, "pinky", 0.0, 10.0)


def pose_W(arm):
    """食指、中指、无名指分开伸直，拇指和小指收起。"""
    apply_thumb(arm, THUMB_ACROSS)
    curl_finger(arm, "index", 0.0, -16.0)
    curl_finger(arm, "middle", 0.0, 0.0)
    curl_finger(arm, "ring", 0.0, 16.0)
    curl_finger(arm, "pinky", 1.0)


POSES = [
    (1, "REST", None),
    (10, "GF0021.A", pose_A),
    (20, "GF0021.B", pose_B),
    (30, "GF0021.U", pose_U),
    (40, "GF0021.V", pose_V),
    (50, "GF0021.L", pose_L),
    (60, "GF0021.Y", pose_Y),
    (70, "GF0021.I", pose_I),
    (80, "GF0021.W", pose_W),
]


def keyframe_pose(arm, frame):
    bpy.context.scene.frame_set(frame)
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.keyframe_insert(data_path="rotation_euler", frame=frame)


def build_pose_library(arm):
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    adt = arm.animation_data_create()
    action = bpy.data.actions.new("GF0021_Poses")
    adt.action = action
    scene = bpy.context.scene
    scene.timeline_markers.clear()
    for frame, name, fn in POSES:
        reset_pose(arm)
        if fn:
            fn(arm)
        keyframe_pose(arm, frame)
        scene.timeline_markers.new(name, frame=frame)
    bpy.ops.object.mode_set(mode="OBJECT")
    scene.frame_set(30)


def main():
    clear_scene()
    j = joint_map()
    arm = build_armature(j)
    mesh = build_mesh(j)
    mesh.data.materials.append(skin_material())
    parent_mesh(mesh, arm)
    setup_camera_lights()
    setup_render()
    build_pose_library(arm)
    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print("wrote", BLEND)


if __name__ == "__main__":
    main()
