"""Unified Skin-modifier hand on existing HandRig.

No voxel remesh (it punched holes). No automatic heat weights (they failed).
Nearest-bone weights in rest pose. Does not change U two vs four.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector

BLEND = Path(__file__).resolve().parent / "hand_gf0021.blend"
FINGERS = ("index", "middle", "ring", "pinky")


def rest_head_tail(arm, name):
    bone = arm.data.bones[name]
    return arm.matrix_world @ bone.head_local, arm.matrix_world @ bone.tail_local


def delete_generated():
    keep_arm = bpy.data.objects.get("HandRig")
    keep_cam = bpy.data.objects.get("FrontCam")
    doomed = []
    for obj in list(bpy.data.objects):
        if obj == keep_arm or obj == keep_cam:
            continue
        name = obj.name
        typ = obj.type
        if typ in {"MESH", "LIGHT"} or name.startswith(("HandBody", "Nail", "Studio", "Key", "Fill", "Rim", "Bounce")):
            doomed.append(obj)
    for obj in doomed:
        typ = obj.type
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data is not None and getattr(data, "users", 1) == 0:
            if typ == "MESH" and isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
            elif typ == "LIGHT":
                try:
                    bpy.data.lights.remove(data)
                except Exception:
                    pass


def skin_material():
    mat = bpy.data.materials.get("HandSkin")
    if mat is None:
        mat = bpy.data.materials.new("HandSkin")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.76, 0.56, 0.45, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.48
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.18
        if "Subsurface Weight" in bsdf.inputs:
            bsdf.inputs["Subsurface Weight"].default_value = 0.22
        if "Subsurface Radius" in bsdf.inputs:
            bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.3, 0.16)
        if "Subsurface Scale" in bsdf.inputs:
            bsdf.inputs["Subsurface Scale"].default_value = 0.03
    return mat


def nail_material():
    mat = bpy.data.materials.get("NailPlate")
    if mat is None:
        mat = bpy.data.materials.new("NailPlate")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.90, 0.76, 0.72, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.28
    return mat


def build_skin_cage(arm):
    verts = []
    edges = []

    def v(co, r):
        verts.append((Vector(co), (float(r[0]), float(r[1]))))
        return len(verts) - 1

    def e(a, b):
        if a != b:
            edges.append((a, b))

    wrist_h, _ = rest_head_tail(arm, "wrist")
    palm_h, _ = rest_head_tail(arm, "palm")
    w0 = v(wrist_h + Vector((0.0, 0.002, -0.018)), (0.018, 0.014))
    w1 = v(wrist_h + Vector((0.0, 0.004, -0.002)), (0.021, 0.015))
    p0 = v(palm_h, (0.028, 0.013))
    e(w0, w1)
    e(w1, p0)

    # Dense palm grid so Skin has no holes.
    palm_pts = []
    xs = (-0.046, -0.028, -0.010, 0.008, 0.026, 0.042)
    zs = (0.028, 0.046, 0.064, 0.082, 0.098)
    for zi, z in enumerate(zs):
        row = []
        for xi, x in enumerate(xs):
            thenar = x > 0.02 and z < 0.07
            hypo = x < -0.03
            rx = 0.016 if thenar else (0.013 if hypo else 0.0145)
            ry = 0.011 if thenar else 0.010
            row.append(v(Vector((x, 0.008 if thenar else 0.006, z)), (rx, ry)))
        palm_pts.append(row)
        if zi == 0:
            for node in row:
                e(w1, node)
                e(p0, node)
        else:
            for a, b in zip(palm_pts[zi - 1], row):
                e(a, b)
        for a, b in zip(row, row[1:]):
            e(a, b)

    mcp_ids = {}
    mcp_r = {"index": 0.0112, "middle": 0.0116, "ring": 0.0108, "pinky": 0.0094}
    prev = None
    top_row = palm_pts[-1]
    for name, col in zip(FINGERS, (4, 3, 2, 1)):
        h, _ = rest_head_tail(arm, f"{name}.MCP")
        i = v(h, (mcp_r[name], mcp_r[name] * 0.80))
        mcp_ids[name] = i
        e(top_row[col], i)
        e(top_row[min(col + 1, 5)], i)
        if prev is not None:
            e(prev, i)
        prev = i

    ph = {
        "index": (0.0095, 0.0079, 0.0065, 0.0053),
        "middle": (0.0099, 0.0081, 0.0067, 0.0055),
        "ring": (0.0093, 0.0077, 0.0063, 0.0051),
        "pinky": (0.0077, 0.0065, 0.0053, 0.0043),
    }
    for name in FINGERS:
        parent = mcp_ids[name]
        bones = [f"{name}.MCP", f"{name}.PIP", f"{name}.DIP", f"{name}.TIP"]
        for bone_name, rad in zip(bones, ph[name]):
            _h, t = rest_head_tail(arm, bone_name)
            i = v(t, (rad, rad * 0.82))
            e(parent, i)
            parent = i

    thenar = palm_pts[1][5]
    cmc_h, cmc_t = rest_head_tail(arm, "thumb.CMC")
    _mcp_h, mcp_t = rest_head_tail(arm, "thumb.MCP")
    _ip_h, ip_t = rest_head_tail(arm, "thumb.IP")
    _tip_h, tip_t = rest_head_tail(arm, "thumb.TIP")
    t0 = v(cmc_h, (0.016, 0.013))
    t1 = v(cmc_t, (0.0135, 0.011))
    t2 = v(mcp_t, (0.0106, 0.0088))
    t3 = v(ip_t, (0.0086, 0.0070))
    t4 = v(tip_t, (0.0068, 0.0055))
    e(thenar, t0)
    e(palm_pts[0][5], t0)
    e(w1, t0)
    e(t0, t1)
    e(t1, t2)
    e(t2, t3)
    e(t3, t4)

    mesh = bpy.data.meshes.new("HandCage")
    mesh.from_pydata([co for co, _r in verts], edges, [])
    mesh.update()
    obj = bpy.data.objects.new("HandBody", mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    skin = obj.modifiers.new("Skin", "SKIN")
    skin.use_smooth_shade = True
    skin.use_x_symmetry = False
    layer = mesh.skin_vertices[0]
    for i, (_co, rad) in enumerate(verts):
        layer.data[i].radius = rad
        layer.data[i].use_root = i == w0
        layer.data[i].use_loose = False
    return obj


def apply_skin_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier="Skin")
    sub = obj.modifiers.new("Subsurf", "SUBSURF")
    sub.levels = 2
    sub.render_levels = 2
    bpy.ops.object.modifier_apply(modifier="Subsurf")
    bpy.ops.object.shade_smooth()
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def dist_point_segment(p, a, b):
    ab = b - a
    denom = ab.length_squared
    if denom < 1e-12:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / denom))
    return (p - (a + ab * t)).length


def assign_nearest_weights(obj, arm):
    deform = [b for b in arm.data.bones if b.use_deform]
    while obj.vertex_groups:
        obj.vertex_groups.remove(obj.vertex_groups[0])
    groups = {b.name: obj.vertex_groups.new(name=b.name) for b in deform}
    mw = obj.matrix_world
    segs = []
    for b in deform:
        a = arm.matrix_world @ b.head_local
        c = arm.matrix_world @ b.tail_local
        segs.append((b.name, a, c, max(b.length, 0.008)))
    for vi, vert in enumerate(obj.data.vertices):
        p = mw @ vert.co
        scored = []
        for name, a, c, blen in segs:
            d = dist_point_segment(p, a, c)
            scored.append((d / blen, name))
        scored.sort()
        best = scored[:3]
        # Inverse-distance, ignore far bones.
        usable = [(n, 1.0 / max(s, 0.05) ** 2) for s, n in best if s < 2.8]
        if not usable:
            n = best[0][1]
            groups[n].add([vi], 1.0, "REPLACE")
            continue
        total = sum(w for _n, w in usable)
        for n, w in usable:
            groups[n].add([vi], w / total, "REPLACE")
    for mod in list(obj.modifiers):
        if mod.type == "ARMATURE":
            obj.modifiers.remove(mod)
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    mod.use_vertex_groups = True
    obj.parent = arm
    obj.matrix_parent_inverse = arm.matrix_world.inverted()


def make_nail(arm, bone_name, width, length, mat):
    h, t = rest_head_tail(arm, bone_name)
    z = (t - h)
    z = Vector((0.0, 0.0, 1.0)) if z.length < 1e-8 else z.normalized()
    y = Vector((0.0, 1.0, 0.0))
    if abs(z.dot(y)) > 0.9:
        y = Vector((1.0, 0.0, 0.0))
    x = y.cross(z).normalized()
    y = z.cross(x).normalized()
    center = t - z * (length * 0.2) + y * (width * 0.12)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=center)
    nail = bpy.context.active_object
    nail.name = f"Nail_{bone_name}"
    nail.scale = (width * 0.48, 0.0014, length * 0.46)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    nail.rotation_euler = z.to_track_quat("Z", "Y").to_euler()
    nail.data.materials.append(mat)
    vg = nail.vertex_groups.new(name=bone_name)
    vg.add(list(range(len(nail.data.vertices))), 1.0, "REPLACE")
    mod = nail.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    mod.use_vertex_groups = True
    nail.parent = arm
    nail.matrix_parent_inverse = arm.matrix_world.inverted()
    bpy.ops.object.shade_smooth()


def studio_and_lights():
    bpy.ops.mesh.primitive_plane_add(size=1.6, location=(0.0, -0.18, 0.06))
    card = bpy.context.active_object
    card.name = "StudioCard"
    card.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    mat = bpy.data.materials.get("StudioCardMat")
    if mat is None:
        mat = bpy.data.materials.new("StudioCardMat")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (0.72, 0.71, 0.68, 1.0)
            bsdf.inputs["Roughness"].default_value = 0.9
    card.data.materials.append(mat)

    def area(name, loc, energy, size, color):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.size = size
        data.color = color
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = loc
        direction = (Vector((0.0, 0.0, 0.07)) - Vector(loc)).normalized()
        obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

    area("Key", (-0.16, 0.30, 0.22), 18.0, 0.38, (1.0, 0.97, 0.93))
    area("Fill", (0.20, 0.24, 0.08), 6.0, 0.55, (0.88, 0.91, 1.0))
    area("Rim", (0.02, -0.28, 0.16), 8.0, 0.22, (1.0, 0.96, 0.90))

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGB"
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = 128
    world = scene.world
    if world and world.use_nodes:
        bg = world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs[0].default_value = (0.55, 0.54, 0.52, 1.0)
            bg.inputs[1].default_value = 0.25


def main():
    arm = bpy.data.objects.get("HandRig")
    if arm is None:
        raise SystemExit("HandRig missing")
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    delete_generated()
    mat = skin_material()
    cage = build_skin_cage(arm)
    apply_skin_only(cage)
    cage.data.materials.clear()
    cage.data.materials.append(mat)
    assign_nearest_weights(cage, arm)
    nails = nail_material()
    for name, w, ln in (
        ("index.TIP", 0.0086, 0.0096),
        ("middle.TIP", 0.0088, 0.0100),
        ("ring.TIP", 0.0082, 0.0092),
        ("pinky.TIP", 0.0068, 0.0078),
        ("thumb.TIP", 0.0092, 0.0086),
    ):
        make_nail(arm, name, w, ln, nails)
    studio_and_lights()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print("rebuild_hand_v2 verts", len(cage.data.vertices), "groups", len(cage.vertex_groups))


if __name__ == "__main__":
    main()
