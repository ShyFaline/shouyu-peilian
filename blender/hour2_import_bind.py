"""Hour 2: re-append CC0 realistic hand, palm to camera, thumb-safe weights.

Starts from the cone-hand backup so transforms are not stacked.
Does not touch letters.json or U two vs four.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
PRE = ROOT / "hand_gf0021.pre_v2.blend"
BLEND = ROOT / "hand_gf0021.blend"
HBM = ROOT / "vendor" / "human-base-meshes-bundle-v1.4.1" / "human_base_meshes_bundle.blend"


def dist_point_segment(p, a, b):
    ab = b - a
    d = ab.length_squared
    if d < 1e-12:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / d))
    return (p - (a + ab * t)).length


def rest_ht(arm, name):
    b = arm.data.bones[name]
    return arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local


def delete_meshes(arm):
    doomed = [
        o
        for o in list(bpy.data.objects)
        if o.type == "MESH"
        and (
            o.parent == arm
            or o.name.startswith(("Palm", "Wrist", "index_", "middle_", "ring_", "pinky_", "thumb_", "HandBody", "Nail", "Studio"))
        )
    ]
    for obj in doomed:
        mesh = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh and mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def append_mesh():
    with bpy.data.libraries.load(str(HBM), link=False) as (data_from, data_to):
        names = [n for n in (data_from.objects or []) if n == "Hand  - Realistic"]
        if not names:
            raise SystemExit("Hand  - Realistic missing")
        data_to.objects = names
    obj = data_to.objects[0]
    if obj.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.name = "HandBody"
    return obj


def world_bbox(obj):
    mw = obj.matrix_world
    pts = [mw @ v.co for v in obj.data.vertices]
    xs, ys, zs = [p.x for p in pts], [p.y for p in pts], [p.z for p in pts]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def avg_normal(obj):
    mw = obj.matrix_world.to_3x3()
    n = Vector()
    a = 0.0
    for p in obj.data.polygons:
        n += (mw @ p.normal) * p.area
        a += p.area
    return n.normalized() if a else Vector((0, 1, 0))


def rotate_verts(obj, matrix, origin):
    imw = obj.matrix_world.inverted()
    mw = obj.matrix_world
    for v in obj.data.vertices:
        w = mw @ v.co
        v.co = imw @ (matrix @ (w - origin) + origin)
    obj.data.update()


def align(obj, arm):
    """HBM local: palm +Y, fingers +Z, thumb +X. Drop library world matrix; scale in local."""
    from mathutils import Matrix

    obj.matrix_world = Matrix.Identity(4)
    bpy.context.view_layer.update()
    xs = [v.co.x for v in obj.data.vertices]
    ys = [v.co.y for v in obj.data.vertices]
    zs = [v.co.z for v in obj.data.vertices]
    mn = Vector((min(xs), min(ys), min(zs)))
    mx = Vector((max(xs), max(ys), max(zs)))
    print("local bbox", tuple(round(x, 3) for x in mn), tuple(round(x, 3) for x in mx), "n", tuple(round(x, 3) for x in avg_normal(obj)))
    wrist, _ = rest_ht(arm, "wrist")
    mid_t = rest_ht(arm, "middle.TIP")[1]
    rig_len = (mid_t - wrist).length
    mesh_len = max(mx.x - mn.x, mx.y - mn.y, mx.z - mn.z)
    s = rig_len / max(mesh_len, 1e-6)
    cx, cy = (mn.x + mx.x) * 0.5, (mn.y + mx.y) * 0.5
    zmin = mn.z
    for v in obj.data.vertices:
        v.co.x = (v.co.x - cx) * s
        v.co.y = (v.co.y - cy) * s + 0.008
        v.co.z = (v.co.z - zmin) * s
    obj.data.update()
    n = avg_normal(obj)
    print("after scale n", tuple(round(x, 3) for x in n), "bbox", tuple(round(x, 3) for x in world_bbox(obj)[0]), tuple(round(x, 3) for x in world_bbox(obj)[1]))
    if n.dot(Vector((0, 1, 0))) < 0.0:
        for v in obj.data.vertices:
            v.co.y *= -1.0
        obj.data.update()
        print("flipped Y so palm +Y")
    xs = [v.co.x for v in obj.data.vertices]
    if (max(xs) + min(xs)) * 0.5 > 0:
        pass
    thumb_side = sum(v.co.x for v in obj.data.vertices if v.co.x > 0.02)
    if rest_ht(arm, "thumb.TIP")[1].x > 0 and thumb_side < 0:
        for v in obj.data.vertices:
            v.co.x *= -1.0
        obj.data.update()
        print("flipped X so thumb +X")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    print("final n", tuple(round(x, 3) for x in avg_normal(obj)))
    print("final bbox", tuple(round(x, 3) for x in world_bbox(obj)[0]), tuple(round(x, 3) for x in world_bbox(obj)[1]))


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
            w = math.exp(-((d / (blen * 0.55)) ** 2))
            if name in thumb_names and p.x < 0.012:
                w *= 0.03
            if name.startswith("pinky.") and p.x > 0.02:
                w *= 0.05
            raw.append((name, w))
        total = sum(w for _n, w in raw) or 1.0
        for name, w in raw:
            g = w / total
            if g > 0.02:
                groups[name].add([vi], g, "REPLACE")
    for mod in list(obj.modifiers):
        if mod.type == "ARMATURE":
            obj.modifiers.remove(mod)
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    mod.use_vertex_groups = True
    obj.parent = arm
    obj.matrix_parent_inverse = arm.matrix_world.inverted()
    sub = obj.modifiers.new("Subsurf", "SUBSURF")
    sub.levels = 2
    sub.render_levels = 3


def skin_mat(obj):
    mat = bpy.data.materials.get("HandSkin")
    if mat is None:
        mat = bpy.data.materials.new("HandSkin")
        mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF") if mat.use_nodes else None
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.78, 0.58, 0.47, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.48
        if "Subsurface Weight" in bsdf.inputs:
            bsdf.inputs["Subsurface Weight"].default_value = 0.22
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def studio():
    for name in ("Key", "Fill", "Rim", "Bounce"):
        o = bpy.data.objects.get(name)
        if o:
            bpy.data.objects.remove(o, do_unlink=True)
    if bpy.data.objects.get("StudioCard") is None:
        bpy.ops.mesh.primitive_plane_add(size=1.6, location=(0.0, -0.18, 0.08))
        card = bpy.context.active_object
        card.name = "StudioCard"
        card.rotation_euler = (math.radians(90.0), 0.0, 0.0)
        mat = bpy.data.materials.get("StudioCardMat") or bpy.data.materials.new("StudioCardMat")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (0.62, 0.61, 0.58, 1.0)
            bsdf.inputs["Roughness"].default_value = 0.92
        card.data.materials.clear()
        card.data.materials.append(mat)

    def area(name, loc, energy, size, color):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.size = size
        data.color = color
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = loc
        d = (Vector((0.0, 0.0, 0.08)) - Vector(loc)).normalized()
        obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

    area("Key", (-0.14, 0.32, 0.20), 12.0, 0.40, (1.0, 0.97, 0.93))
    area("Fill", (0.18, 0.26, 0.06), 4.5, 0.55, (0.88, 0.91, 1.0))
    area("Rim", (0.04, -0.26, 0.14), 6.0, 0.22, (1.0, 0.96, 0.90))
    scene = bpy.context.scene
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGB"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    if scene.world and scene.world.use_nodes:
        bg = scene.world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs[0].default_value = (0.48, 0.47, 0.45, 1.0)
            bg.inputs[1].default_value = 0.35


def main():
    bpy.ops.wm.open_mainfile(filepath=str(PRE))
    arm = bpy.data.objects["HandRig"]
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    delete_meshes(arm)
    hand = append_mesh()
    align(hand, arm)
    skin_mat(hand)
    bind_thumb_safe(hand, arm)
    studio()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print("hour2 saved", BLEND, "verts", len(hand.data.vertices), "groups", len(hand.vertex_groups))


if __name__ == "__main__":
    main()
