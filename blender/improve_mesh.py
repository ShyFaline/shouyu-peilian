"""Replace meshes on the existing HandRig. Thumb keyframes only. Does not rebuild the rig."""

from __future__ import annotations

import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

BLEND = Path(__file__).resolve().parent / "hand_gf0021.blend"

# 只动拇指。U/V 五指开合不动。
THUMB_UP = {  # A：拳侧伸拇指朝上
    "thumb.CMC": (-10.0, -20.0, -25.0),
    "thumb.MCP": (15.0, -15.0, 15.0),
    "thumb.IP": (5.0, 0.0, 0.0),
}
THUMB_ACROSS = {  # B/U/V/I/W：MCP 留鱼际，指腹横贴掌面
    "thumb.CMC": (5.0, 5.0, -5.0),
    "thumb.MCP": (0.0, 10.0, -110.0),
    "thumb.IP": (10.0, 0.0, 0.0),
}
THUMB_L = {  # L：拇指水平，与食指成直角
    "thumb.CMC": (-10.0, -15.0, 30.0),
    "thumb.MCP": (10.0, 0.0, 15.0),
    "thumb.IP": (25.0, 0.0, 0.0),
}
THUMB_Y = {  # Y：拇指、小指
    "thumb.CMC": (10.0, 20.0, 50.0),
    "thumb.MCP": (-10.0, 0.0, -10.0),
    "thumb.IP": (10.0, 0.0, 0.0),
}


def rest_bone(arm, name):
    bone = arm.data.bones[name]
    head = arm.matrix_world @ bone.head_local
    tail = arm.matrix_world @ bone.tail_local
    return head, tail


def delete_rig_meshes(arm):
    doomed = [o for o in list(bpy.data.objects) if o.type == "MESH" and o.parent == arm]
    for obj in doomed:
        mesh = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh and mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def get_skin():
    mat = bpy.data.materials.get("HandSkin")
    if mat is None:
        mat = bpy.data.materials.new("HandSkin")
        mat.use_nodes = True
    if mat.use_nodes:
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (0.78, 0.56, 0.44, 1.0)
            bsdf.inputs["Roughness"].default_value = 0.44
            if "Specular IOR Level" in bsdf.inputs:
                bsdf.inputs["Specular IOR Level"].default_value = 0.18
            if "Subsurface Weight" in bsdf.inputs:
                bsdf.inputs["Subsurface Weight"].default_value = 0.28
            if "Subsurface Radius" in bsdf.inputs:
                bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.32, 0.16)
            if "Subsurface Scale" in bsdf.inputs:
                bsdf.inputs["Subsurface Scale"].default_value = 0.035
    return mat


def bind_piece(obj, arm, bone_name, mat):
    while obj.vertex_groups:
        obj.vertex_groups.remove(obj.vertex_groups[0])
    vg = obj.vertex_groups.new(name=bone_name)
    vg.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    for mod in list(obj.modifiers):
        obj.modifiers.remove(mod)
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    mod.use_vertex_groups = True
    obj.parent = arm
    obj.matrix_parent_inverse = arm.matrix_world.inverted()
    if hasattr(obj, "shadow_terminator_geometry_offset"):
        obj.shadow_terminator_geometry_offset = 0.12
    if hasattr(obj, "shadow_terminator_normal_offset"):
        obj.shadow_terminator_normal_offset = 0.08
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()


def apply_subsurf(obj, levels=1):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    sub = obj.modifiers.new("Subsurf", "SUBSURF")
    sub.levels = levels
    sub.render_levels = levels
    bpy.ops.object.modifier_apply(modifier="Subsurf")


def bone_frame(p0: Vector, p1: Vector):
    z = p1 - p0
    z = Vector((0.0, 0.0, 1.0)) if z.length < 1e-8 else z.normalized()
    y_ref = Vector((0.0, 1.0, 0.0))
    if abs(z.dot(y_ref)) > 0.92:
        y_ref = Vector((1.0, 0.0, 0.0))
    x = y_ref.cross(z)
    x = Vector((1.0, 0.0, 0.0)) if x.length < 1e-8 else x.normalized()
    y = z.cross(x).normalized()
    if y.dot(Vector((0.0, 1.0, 0.0))) < 0.0:
        y = -y
        x = -x
    return x, y, z


def _make_normals_outward(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def _mesh_from_bmesh(name, bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name + "Mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    _make_normals_outward(obj)
    return obj


def phalanx(name, p0: Vector, p1: Vector, r0: float, r1: float, flatten=0.56, pad=0.38):
    """Tapered D-section. Small caps so joints are creases, not a string of balls."""
    x_a, y_a, z_a = bone_frame(p0, p1)
    length = max((p1 - p0).length, 0.004)
    n_around = 16
    n_cap = 3
    n_shaft = 6
    cap0 = r0 * 0.20
    cap1 = r1 * 0.20
    bm = bmesh.new()

    def ring(along, rx, ry):
        vs = []
        for k in range(n_around):
            ang = 2.0 * math.pi * k / n_around
            cx = math.cos(ang)
            cy = math.sin(ang)
            pry = ry * (1.0 + pad * max(cy, 0.0))
            prx = rx * (1.04 + 0.03 * abs(cx))
            pos = p0 + z_a * along + x_a * (cx * prx) + y_a * (cy * pry)
            vs.append(bm.verts.new(pos))
        return vs

    rings = []
    pole0 = bm.verts.new(p0 - z_a * cap0)
    for i in range(1, n_cap + 1):
        a = (i / n_cap) * (math.pi / 2.0)
        along = -cap0 * math.cos(a) * 0.85
        rad = r0 * (0.55 + 0.45 * math.sin(a))
        rings.append(ring(along, rad, rad * flatten))

    for i in range(1, n_shaft):
        t = i / n_shaft
        along = t * length
        rad = r0 * (1.0 - t) + r1 * t
        rad *= 1.0 + 0.03 * math.sin(t * math.pi)
        # slight waist at both ends so neighbors don't balloon
        waist = 0.90 + 0.10 * math.sin(t * math.pi)
        rings.append(ring(along, rad * waist, rad * flatten * waist))

    for i in range(1, n_cap + 1):
        a = (i / n_cap) * (math.pi / 2.0)
        along = length + cap1 * math.sin(a) * 0.85
        rad = r1 * (0.55 + 0.45 * math.cos(a))
        rad = max(rad, r1 * 0.18)
        rings.append(ring(along, rad, rad * flatten * 0.96))

    pole1 = bm.verts.new(p1 + z_a * cap1)

    for k in range(n_around):
        k2 = (k + 1) % n_around
        bm.faces.new((pole0, rings[0][k2], rings[0][k]))
    for i in range(len(rings) - 1):
        for k in range(n_around):
            k2 = (k + 1) % n_around
            bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
    last = rings[-1]
    for k in range(n_around):
        k2 = (k + 1) % n_around
        bm.faces.new((last[k], last[k2], pole1))

    obj = _mesh_from_bmesh(name, bm)
    apply_subsurf(obj, 1)
    _make_normals_outward(obj)
    bpy.ops.object.shade_smooth()
    return obj


def fingertip(name, loc: Vector, direction: Vector, radius: float):
    z = direction.normalized() if direction.length > 1e-8 else Vector((0.0, 0.0, 1.0))
    p0 = loc - z * (radius * 0.18)
    p1 = loc + z * (radius * 0.92)
    return phalanx(name, p0, p1, radius * 1.00, radius * 0.70, flatten=0.50, pad=0.52)


def gauss_xz(p: Vector, c: Vector, sigma: float, amp: float) -> float:
    d2 = (p.x - c.x) ** 2 + (p.z - c.z) ** 2
    return amp * math.exp(-d2 / (2.0 * sigma * sigma))


def make_palm(arm):
    # 腕窄、鱼际接到拇指 CMC、MCP 线贴指根。
    outline = [
        Vector((-0.016, 0.0, 0.004)),
        Vector((0.002, 0.0, 0.002)),
        Vector((0.018, 0.0, 0.008)),
        Vector((0.030, 0.0, 0.018)),
        Vector((0.042, 0.0, 0.032)),
        Vector((0.048, 0.0, 0.046)),
        Vector((0.046, 0.0, 0.060)),
        Vector((0.038, 0.0, 0.076)),
        Vector((0.030, 0.0, 0.090)),
        Vector((0.024, 0.0, 0.096)),
        Vector((0.012, 0.0, 0.100)),
        Vector((0.002, 0.0, 0.102)),
        Vector((-0.010, 0.0, 0.100)),
        Vector((-0.022, 0.0, 0.097)),
        Vector((-0.034, 0.0, 0.092)),
        Vector((-0.044, 0.0, 0.086)),
        Vector((-0.050, 0.0, 0.072)),
        Vector((-0.052, 0.0, 0.054)),
        Vector((-0.046, 0.0, 0.032)),
        Vector((-0.034, 0.0, 0.016)),
        Vector((-0.024, 0.0, 0.008)),
    ]
    thenar_idx = {3, 4, 5, 6, 7}
    y_back = -0.007
    bm = bmesh.new()
    front = []
    back = []
    for i, v in enumerate(outline):
        yf = 0.015 if i in thenar_idx else 0.010
        front.append(bm.verts.new((v.x, yf, v.z)))
        back.append(bm.verts.new((v.x, y_back, v.z)))
    bm.verts.ensure_lookup_table()
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    obj = _mesh_from_bmesh("Palm", bm)
    apply_subsurf(obj, 2)

    mcps = [rest_bone(arm, f"{n}.MCP")[0] for n in ("index", "middle", "ring", "pinky")]
    thenar = Vector((0.032, 0.0, 0.042))
    hypo = Vector((-0.038, 0.0, 0.040))
    hollow = Vector((-0.002, 0.0, 0.060))
    wrist = Vector((-0.002, 0.0, 0.012))
    cmc = rest_bone(arm, "thumb.CMC")[0]

    for v in obj.data.vertices:
        p = v.co
        extra = 0.0
        extra += gauss_xz(p, thenar, 0.018, 0.011)
        extra += gauss_xz(p, cmc, 0.014, 0.007)
        extra += gauss_xz(p, hypo, 0.015, 0.004)
        extra += gauss_xz(p, wrist, 0.014, 0.002)
        extra -= gauss_xz(p, hollow, 0.024, 0.0008)
        for mcp in mcps:
            extra += gauss_xz(p, mcp, 0.010, 0.003)
        if p.y >= 0.0:
            v.co.y += extra
        else:
            v.co.y -= extra * 0.18
    obj.data.update()
    _make_normals_outward(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()
    return obj


def make_wrist(arm):
    h, t = rest_bone(arm, "wrist")
    p0 = h + Vector((0.0, 0.001, -0.006))
    p1 = Vector((t.x * 0.4, t.y * 0.4, t.z * 0.42))
    return phalanx("Wrist", p0, p1, 0.018, 0.024, flatten=0.80, pad=0.08)


def build_meshes(arm, mat):
    bind_piece(make_palm(arm), arm, "palm", mat)
    bind_piece(make_wrist(arm), arm, "wrist", mat)

    finger_r = {
        "index": (0.0092, 0.0076, 0.0062),
        "middle": (0.0096, 0.0078, 0.0064),
        "ring": (0.0090, 0.0074, 0.0060),
        "pinky": (0.0074, 0.0062, 0.0052),
    }
    for name, (r0, r1, r2) in finger_r.items():
        mcp_h, mcp_t = rest_bone(arm, f"{name}.MCP")
        pip_h, pip_t = rest_bone(arm, f"{name}.PIP")
        dip_h, dip_t = rest_bone(arm, f"{name}.DIP")
        tip_h, tip_t = rest_bone(arm, f"{name}.TIP")
        bind_piece(phalanx(f"{name}_ph1", mcp_h, mcp_t, r0, r1, flatten=0.56, pad=0.34), arm, f"{name}.MCP", mat)
        bind_piece(phalanx(f"{name}_ph2", pip_h, pip_t, r1, r2, flatten=0.54, pad=0.38), arm, f"{name}.PIP", mat)
        bind_piece(phalanx(f"{name}_ph3", dip_h, dip_t, r2, r2 * 0.88, flatten=0.52, pad=0.42), arm, f"{name}.DIP", mat)
        bind_piece(fingertip(f"{name}_tip", tip_h, tip_t - tip_h, r2 * 0.88), arm, f"{name}.TIP", mat)

    t0, t1 = rest_bone(arm, "thumb.CMC")
    t2, t3 = rest_bone(arm, "thumb.MCP")
    t4, t5 = rest_bone(arm, "thumb.IP")
    t6, t7 = rest_bone(arm, "thumb.TIP")
    # 第一段伸进鱼际，减少交接缝
    t0_in = t0 + Vector((-0.010, -0.005, 0.004))
    bind_piece(phalanx("thumb_ph0", t0_in, t1, 0.0158, 0.0114, flatten=0.64, pad=0.42), arm, "thumb.CMC", mat)
    bind_piece(phalanx("thumb_ph1", t2, t3, 0.0110, 0.0088, flatten=0.58, pad=0.36), arm, "thumb.MCP", mat)
    bind_piece(phalanx("thumb_ph2", t4, t5, 0.0088, 0.0070, flatten=0.54, pad=0.40), arm, "thumb.IP", mat)
    bind_piece(fingertip("thumb_tip", t6, t7 - t6, 0.0074), arm, "thumb.TIP", mat)


def _aim_light(obj, target=Vector((0.0, 0.0, 0.07))):
    direction = (target - obj.location).normalized()
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def retune_lights():
    key = bpy.data.objects.get("Key")
    fill = bpy.data.objects.get("Fill")
    rim = bpy.data.objects.get("Rim")
    # 主光离开相机轴，从画面右上（世界 -X +Z）打，让掌面有体积。
    if key is not None and key.type == "LIGHT":
        key.location = (-0.14, 0.32, 0.24)
        key.data.energy = 3.2
        key.data.size = 0.42
        key.data.color = (1.0, 0.97, 0.93)
        _aim_light(key)
    if fill is not None and fill.type == "LIGHT":
        fill.location = (0.18, 0.28, 0.08)
        fill.data.energy = 0.72
        fill.data.size = 0.60
        fill.data.color = (0.88, 0.91, 1.0)
        _aim_light(fill)
    if rim is not None and rim.type == "LIGHT":
        rim.location = (0.04, -0.32, 0.18)
        rim.data.energy = 0.90
        rim.data.size = 0.22
        rim.data.color = (1.0, 0.96, 0.90)
        _aim_light(rim)

    bounce = bpy.data.objects.get("Bounce")
    if bounce is None:
        data = bpy.data.lights.new("Bounce", "AREA")
        bounce = bpy.data.objects.new("Bounce", data)
        bpy.context.collection.objects.link(bounce)
    if bounce.type == "LIGHT":
        bounce.location = (0.0, 0.18, -0.06)
        bounce.data.energy = 0.28
        bounce.data.size = 0.45
        bounce.data.color = (1.0, 0.94, 0.88)
        _aim_light(bounce)

    world = bpy.context.scene.world
    if world and world.use_nodes:
        bg = world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs[0].default_value = (0.82, 0.81, 0.78, 1.0)
            bg.inputs[1].default_value = 0.08

    scene = bpy.context.scene
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = 64
        if hasattr(scene.eevee, "use_shadows"):
            scene.eevee.use_shadows = True


def _apply_thumb(arm, preset):
    for bone_name, xyz in preset.items():
        pb = arm.pose.bones[bone_name]
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = tuple(math.radians(v) for v in xyz)


def fit_thumbs(arm):
    """只改拇指关键帧。不改 U/V 字母定义，不改其余指开合。"""
    mapping = {
        "GF0021.A": THUMB_UP,
        "GF0021.B": THUMB_ACROSS,
        "GF0021.U": THUMB_ACROSS,
        "GF0021.V": THUMB_ACROSS,
        "GF0021.L": THUMB_L,
        "GF0021.Y": THUMB_Y,
        "GF0021.I": THUMB_ACROSS,
        "GF0021.W": THUMB_ACROSS,
    }
    markers = {m.name: int(m.frame) for m in bpy.context.scene.timeline_markers}
    bpy.context.view_layer.objects.active = arm
    if arm.mode != "POSE":
        bpy.ops.object.mode_set(mode="POSE")
    for name, preset in mapping.items():
        frame = markers.get(name)
        if frame is None:
            continue
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        _apply_thumb(arm, preset)
        for bone_name in preset:
            arm.pose.bones[bone_name].keyframe_insert(data_path="rotation_euler", frame=frame)
    action = arm.animation_data.action if arm.animation_data else None
    if action is not None:
        for fc in action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "CONSTANT"
    bpy.ops.object.mode_set(mode="OBJECT")
    for name, preset in mapping.items():
        frame = markers.get(name)
        if frame is None:
            continue
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        tip = arm.pose.bones["thumb.TIP"].matrix.to_translation()
        print(name, "thumb.TIP", tuple(round(c, 4) for c in tip))


def main():
    arm = bpy.data.objects.get("HandRig")
    if arm is None:
        raise SystemExit("HandRig 不在 blend 里，不要用这个脚本重建整只手")
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")

    saved_pose = arm.data.pose_position
    arm.data.pose_position = "REST"
    bpy.context.view_layer.update()

    delete_rig_meshes(arm)
    build_meshes(arm, get_skin())
    retune_lights()

    arm.data.pose_position = saved_pose or "POSE"
    bpy.context.view_layer.update()
    fit_thumbs(arm)
    bpy.context.view_layer.update()
    bpy.ops.wm.save_mainfile()
    print("mesh/lights/thumb updated", BLEND)


if __name__ == "__main__":
    main()
