"""Hour 5: from hybrid backup, strip leftover HBM fingers, overlap phalanges into palm."""

from __future__ import annotations

import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
HYBRID = ROOT / "hand_gf0021.hour4_hybrid.blend"
BLEND = ROOT / "hand_gf0021.blend"
FINGERS = ("index", "middle", "ring", "pinky")
OVERLAP = 0.012


def rest_ht(arm, name):
    b = arm.data.bones[name]
    return arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local


def bone_frame(p0, p1):
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


def phalanx(name, p0, p1, r0, r1):
    x_a, y_a, z_a = bone_frame(p0, p1)
    length = max((p1 - p0).length, 0.004)
    n_around = 14
    bm = bmesh.new()

    def ring(along, rx, ry):
        vs = []
        for k in range(n_around):
            ang = 2.0 * math.pi * k / n_around
            cx, cy = math.cos(ang), math.sin(ang)
            vs.append(bm.verts.new(p0 + z_a * along + x_a * (cx * rx) + y_a * (cy * ry)))
        return vs

    pole0 = bm.verts.new(p0 - z_a * r0 * 0.2)
    rings = [
        ring(0.0, r0 * 1.05, r0 * 0.78),
        ring(length * 0.45, (r0 + r1) * 0.52, (r0 + r1) * 0.38),
        ring(length, r1, r1 * 0.70),
    ]
    pole1 = bm.verts.new(p1 + z_a * r1 * 0.16)
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
    mesh = bpy.data.meshes.new(name + "Mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()
    return obj


def bind_rigid(obj, arm, bone_name, mat):
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
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def strip_ghost_fingers(hand):
    bpy.ops.object.select_all(action="DESELECT")
    hand.select_set(True)
    bpy.context.view_layer.objects.active = hand
    bpy.ops.object.mode_set(mode="EDIT")
    bm = bmesh.from_edit_mesh(hand.data)
    bm.verts.ensure_lookup_table()
    # Keep palm + radial thumb. Drop anything that looks like a finger ray.
    dead = [v for v in bm.verts if v.co.z > 0.068 and v.co.x < 0.038]
    print("strip", len(dead), "of", len(bm.verts))
    bmesh.ops.delete(bm, geom=dead, context="VERTS")
    bmesh.update_edit_mesh(hand.data)
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def rebind_palm_only(hand, arm):
    deform = [b for b in arm.data.bones if b.use_deform]
    while hand.vertex_groups:
        hand.vertex_groups.remove(hand.vertex_groups[0])
    groups = {b.name: hand.vertex_groups.new(name=b.name) for b in deform}
    segs = []
    for b in deform:
        a = arm.matrix_world @ b.head_local
        c = arm.matrix_world @ b.tail_local
        segs.append((b.name, a, c, max(b.length, 0.01)))
    mw = hand.matrix_world
    finger_bones = {n for n, *_ in segs if any(n.startswith(f) for f in FINGERS)}
    for vi, vert in enumerate(hand.data.vertices):
        p = mw @ vert.co
        raw = []
        for name, a, c, blen in segs:
            ab = c - a
            d2 = ab.length_squared
            t = 0.0 if d2 < 1e-12 else max(0.0, min(1.0, (p - a).dot(ab) / d2))
            d = (p - (a + ab * t)).length
            w = math.exp(-((d / (blen * 0.5)) ** 2))
            if name in finger_bones:
                w *= 0.01
            raw.append((name, w))
        total = sum(w for _n, w in raw) or 1.0
        for name, w in raw:
            g = w / total
            if g > 0.02:
                groups[name].add([vi], g, "REPLACE")
    for mod in list(hand.modifiers):
        if mod.type == "ARMATURE":
            hand.modifiers.remove(mod)
    mod = hand.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    mod.use_vertex_groups = True
    if hand.parent != arm:
        hand.parent = arm
        hand.matrix_parent_inverse = arm.matrix_world.inverted()


def main():
    if not HYBRID.exists():
        raise SystemExit(f"missing {HYBRID}")
    bpy.ops.wm.open_mainfile(filepath=str(HYBRID))
    scene = bpy.context.scene
    scene.frame_set(1)
    bpy.context.view_layer.update()
    arm = bpy.data.objects["HandRig"]
    hand = bpy.data.objects["HandBody"]
    mat = bpy.data.materials.get("HandSkin") or bpy.data.materials.new("HandSkin")

    for obj in list(bpy.data.objects):
        if obj.name.startswith(tuple(f"{f}_" for f in FINGERS)):
            mesh = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if mesh and mesh.users == 0:
                bpy.data.meshes.remove(mesh)

    mw = hand.matrix_world.copy()
    hand.parent = None
    hand.matrix_world = mw
    bpy.ops.object.select_all(action="DESELECT")
    hand.select_set(True)
    bpy.context.view_layer.objects.active = hand
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    strip_ghost_fingers(hand)
    rebind_palm_only(hand, arm)

    radii = {
        "index": (0.0092, 0.0076, 0.0062),
        "middle": (0.0096, 0.0078, 0.0064),
        "ring": (0.0088, 0.0074, 0.0060),
        "pinky": (0.0072, 0.0062, 0.0052),
    }
    for name, (r0, r1, r2) in radii.items():
        mcp_h, mcp_t = rest_ht(arm, f"{name}.MCP")
        pip_h, pip_t = rest_ht(arm, f"{name}.PIP")
        dip_h, dip_t = rest_ht(arm, f"{name}.DIP")
        tip_h, tip_t = rest_ht(arm, f"{name}.TIP")
        axis = (mcp_t - mcp_h)
        axis = Vector((0, 0, 1)) if axis.length < 1e-8 else axis.normalized()
        mcp_h2 = mcp_h - axis * OVERLAP
        bind_rigid(phalanx(f"{name}_ph1", mcp_h2, mcp_t, r0 * 1.08, r1), arm, f"{name}.MCP", mat)
        bind_rigid(phalanx(f"{name}_ph2", pip_h, pip_t, r1, r2), arm, f"{name}.PIP", mat)
        bind_rigid(phalanx(f"{name}_ph3", dip_h, dip_t, r2, r2 * 0.88), arm, f"{name}.DIP", mat)
        bind_rigid(phalanx(f"{name}_tip", tip_h, tip_t, r2 * 0.88, r2 * 0.62), arm, f"{name}.TIP", mat)

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print("hour5 saved palm verts", len(hand.data.vertices))


if __name__ == "__main__":
    main()
