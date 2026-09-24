"""Hour 3: rest pose of HandRig matches HBM open hand, then rebind and rebuild poses.

Does not change U two vs four. Does not move the camera. Does not crop verts.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector

BLEND = Path(__file__).resolve().parent / "hand_gf0021.blend"


def set_euler(pb, xyz_deg):
    pb.rotation_mode = "XYZ"
    pb.rotation_euler = tuple(math.radians(v) for v in xyz_deg)


def reset_pose(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0.0, 0.0, 0.0)


def curl_finger(arm, name, curl, spread=0.0):
    set_euler(arm.pose.bones[f"{name}.MCP"], (curl * 82.0, 0.0, spread))
    set_euler(arm.pose.bones[f"{name}.PIP"], (curl * 108.0, 0.0, 0.0))
    set_euler(arm.pose.bones[f"{name}.DIP"], (curl * 70.0, 0.0, 0.0))


def apply_thumb(arm, preset):
    for bone, xyz in preset.items():
        set_euler(arm.pose.bones[bone], xyz)


# Rest is now "thumb already along the palm" (old THUMB_ACROSS baked in).
# Deltas are old_preset - old_across, used as a starting guess.
THUMB_UP = {  # A: from across-rest, lift thumb along index
    "thumb.CMC": (-15.0, -25.0, -20.0),
    "thumb.MCP": (15.0, -25.0, 110.0),
    "thumb.IP": (-5.0, 0.0, 0.0),
}
THUMB_L = {
    "thumb.CMC": (-15.0, -20.0, 35.0),
    "thumb.MCP": (10.0, -10.0, 125.0),
    "thumb.IP": (15.0, 0.0, 0.0),
}
THUMB_Y = {
    "thumb.CMC": (5.0, 15.0, 55.0),
    "thumb.MCP": (-10.0, -10.0, 100.0),
    "thumb.IP": (0.0, 0.0, 0.0),
}


def pose_A(arm):
    apply_thumb(arm, THUMB_UP)
    for f in ("index", "middle", "ring", "pinky"):
        curl_finger(arm, f, 1.0)


def pose_B(arm):
    curl_finger(arm, "index", 0.0, -12.0)
    curl_finger(arm, "middle", 0.0, -2.0)
    curl_finger(arm, "ring", 0.0, 8.0)
    curl_finger(arm, "pinky", 0.0, 14.0)


def pose_U(arm):
    curl_finger(arm, "index", 0.0, -11.0)
    curl_finger(arm, "middle", 0.0, 11.0)
    curl_finger(arm, "ring", 1.0)
    curl_finger(arm, "pinky", 1.0)


def pose_V(arm):
    curl_finger(arm, "index", 0.0, 26.0)
    curl_finger(arm, "middle", 0.0, -26.0)
    curl_finger(arm, "ring", 1.0)
    curl_finger(arm, "pinky", 1.0)


def pose_L(arm):
    apply_thumb(arm, THUMB_L)
    curl_finger(arm, "index", 0.0, 0.0)
    curl_finger(arm, "middle", 1.0)
    curl_finger(arm, "ring", 1.0)
    curl_finger(arm, "pinky", 1.0)


def pose_Y(arm):
    apply_thumb(arm, THUMB_Y)
    curl_finger(arm, "index", 1.0)
    curl_finger(arm, "middle", 1.0)
    curl_finger(arm, "ring", 1.0)
    curl_finger(arm, "pinky", 0.0, -16.0)


def pose_I(arm):
    curl_finger(arm, "index", 1.0)
    curl_finger(arm, "middle", 1.0)
    curl_finger(arm, "ring", 1.0)
    curl_finger(arm, "pinky", 0.0, -16.0)


def pose_W(arm):
    curl_finger(arm, "index", 0.0, 22.0)
    curl_finger(arm, "middle", 0.0, 0.0)
    curl_finger(arm, "ring", 0.0, -22.0)
    curl_finger(arm, "pinky", 1.0)


POSES = [
    (1, "REST", None),
    (10, "GF0021.A", pose_A),
    (20, "GF0021.B", pose_B),
    (30, "GF0021.U", pose_U),
    (40, "GF0021.V", pose_V),
    (50, "GF0021.L", pose_L),
    (70, "GF0021.I", pose_I),
    (60, "GF0021.Y", pose_Y),
    (80, "GF0021.W", pose_W),
]


def dist_point_segment(p, a, b):
    ab = b - a
    d = ab.length_squared
    if d < 1e-12:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / d))
    return (p - (a + ab * t)).length


def unparent_keep(obj):
    mw = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = mw
    for mod in list(obj.modifiers):
        if mod.type == "ARMATURE":
            obj.modifiers.remove(mod)


def bind_thumb_safe(obj, arm):
    deform = [b for b in arm.data.bones if b.use_deform]
    while obj.vertex_groups:
        obj.vertex_groups.remove(obj.vertex_groups[0])
    groups = {b.name: obj.vertex_groups.new(name=b.name) for b in deform}
    segs = []
    for b in deform:
        a = arm.matrix_world @ b.head_local
        c = arm.matrix_world @ b.tail_local
        segs.append((b.name, a, c, max(b.length, 0.01)))
    mw = obj.matrix_world
    thumb_names = {n for n, *_ in segs if n.startswith("thumb.")}
    for vi, vert in enumerate(obj.data.vertices):
        p = mw @ vert.co
        raw = []
        for name, a, c, blen in segs:
            d = dist_point_segment(p, a, c)
            w = math.exp(-((d / (blen * 0.5)) ** 2))
            if name in thumb_names and p.x < 0.008:
                w *= 0.02
            if name.startswith("pinky.") and p.x > 0.025:
                w *= 0.04
            raw.append((name, w))
        total = sum(w for _n, w in raw) or 1.0
        for name, w in raw:
            g = w / total
            if g > 0.02:
                groups[name].add([vi], g, "REPLACE")
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    mod.use_vertex_groups = True
    obj.parent = arm
    obj.matrix_parent_inverse = arm.matrix_world.inverted()
    if not any(m.type == "SUBSURF" for m in obj.modifiers):
        sub = obj.modifiers.new("Subsurf", "SUBSURF")
        sub.levels = 2
        sub.render_levels = 3


def rebuild_poses(arm):
    if arm.animation_data and arm.animation_data.action:
        old = arm.animation_data.action
        arm.animation_data.action = None
        bpy.data.actions.remove(old)
    arm.animation_data_clear()
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    adt = arm.animation_data_create()
    action = bpy.data.actions.new("GF0021_Poses")
    adt.action = action
    if hasattr(action, "slots") and hasattr(adt, "action_slot"):
        try:
            slot = action.slots.new(id_type="OBJECT", name=arm.name) if len(action.slots) == 0 else action.slots[0]
            adt.action_slot = slot
        except Exception as err:
            print("slot", err)
    scene = bpy.context.scene
    scene.timeline_markers.clear()
    for frame, name, fn in POSES:
        reset_pose(arm)
        if fn:
            fn(arm)
        for pb in arm.pose.bones:
            pb.rotation_mode = "XYZ"
            pb.keyframe_insert(data_path="rotation_euler", frame=frame)
        scene.timeline_markers.new(name, frame=frame)
    if arm.animation_data.action:
        for fc in arm.animation_data.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "CONSTANT"
    bpy.ops.object.mode_set(mode="OBJECT")
    for frame, name, _fn in POSES:
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        t = arm.pose.bones["thumb.TIP"].matrix.to_translation()
        print(name, "thumb", tuple(round(c, 3) for c in t))


def main():
    arm = bpy.data.objects["HandRig"]
    hand = bpy.data.objects["HandBody"]
    scene = bpy.context.scene
    scene.frame_set(1)
    bpy.context.view_layer.update()

    unparent_keep(hand)

    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    reset_pose(arm)
    # Fold thumb onto the palm so bones sit inside the HBM thumb.
    set_euler(arm.pose.bones["thumb.CMC"], (5.0, 5.0, -5.0))
    set_euler(arm.pose.bones["thumb.MCP"], (0.0, 10.0, -110.0))
    set_euler(arm.pose.bones["thumb.IP"], (10.0, 0.0, 0.0))
    bpy.context.view_layer.update()
    t = (arm.matrix_world @ arm.pose.bones["thumb.TIP"].matrix).to_translation()
    print("thumb.TIP after fold", tuple(round(c, 3) for c in t))
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    print("applied pose as rest")

    scene.frame_set(1)
    bpy.context.view_layer.update()
    bind_thumb_safe(hand, arm)
    rebuild_poses(arm)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print("hour3 saved", BLEND)


if __name__ == "__main__":
    main()
