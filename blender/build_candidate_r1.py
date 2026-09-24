"""Round 1 Candidate Repair: Connect phalanges and strip leftover ghost fingers.

Input: blender/hand_gf0021.hour4_hybrid.blend
Output: blender/candidates/round1/hand_gf0021.candidate_r1.blend
Render output: blender/candidates/round1/demos/{name}_front.png

Hypothesis:
1. Deleting vertices z > 0.068 & x < 0.038 removes the residual finger stubs on HBM palm.
2. Extending proximal phalanges backwards along bone axis by OVERLAP (0.012m) bridges the MCP gap.
3. Rendering to isolated directory preserves production assets intact.
"""

from __future__ import annotations

import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
HYBRID = ROOT / "hand_gf0021.hour4_hybrid.blend"
OUT_DIR = ROOT / "candidates" / "round1"
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT_BLEND = OUT_DIR / "hand_gf0021.candidate_r1.blend"
OUT_DEMOS = OUT_DIR / "demos"
OUT_DEMOS.mkdir(parents=True, exist_ok=True)

FINGERS = ("index", "middle", "ring", "pinky")
OVERLAP = 0.012

MAIN_LETTERS = [
    "GF0021.A",
    "GF0021.B",
    "GF0021.U",
    "GF0021.V",
    "GF0021.L",
    "GF0021.Y",
    "GF0021.I",
    "GF0021.W",
]


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
    # Keep palm + radial thumb. Drop residual finger ray.
    dead = [v for v in bm.verts if v.co.z > 0.068 and v.co.x < 0.038]
    print(f"strip {len(dead)} of {len(bm.verts)} verts from HandBody")
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


def mesh_xz(arm_obj):
    deps = bpy.context.evaluated_depsgraph_get()
    xs, zs = [], []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.parent != arm_obj:
            continue
        ev = obj.evaluated_get(deps)
        mesh = ev.to_mesh()
        mw = ev.matrix_world
        for v in mesh.vertices:
            w = mw @ v.co
            xs.append(w.x)
            zs.append(w.z)
        ev.to_mesh_clear()
    return xs, zs


def render_all(scene, arm, cam, out_dir):
    markers = {m.name: int(m.frame) for m in scene.timeline_markers}
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = 128
        if hasattr(scene.eevee, "use_shadows"):
            scene.eevee.use_shadows = True

    home = cam.location.copy() if cam is not None else Vector((0.0, 0.40, 0.085))
    home_scale = cam.data.ortho_scale if cam is not None else 0.30

    def recenter():
        if cam is None or arm is None:
            return
        xs, zs = mesh_xz(arm)
        if not xs:
            pts = [arm.matrix_world @ pb.tail for pb in arm.pose.bones]
            xs = [p.x for p in pts]
            zs = [p.z for p in pts]
        cx = (min(xs) + max(xs)) * 0.5
        cz = (min(zs) + max(zs)) * 0.5
        span = max(max(xs) - min(xs), max(zs) - min(zs)) * 1.12
        cam.location = Vector((cx, home.y, cz))
        cam.data.ortho_scale = max(span, 0.10)

    for name in MAIN_LETTERS:
        if name not in markers:
            print(f"Skipping {name}, not in markers")
            continue
        frame = markers[name]
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        recenter()
        path = out_dir / f"{name}_front.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        print(f"Candidate R1 rendered: {path}")
        if cam is not None:
            cam.location = home
            cam.data.ortho_scale = home_scale


def main():
    if not HYBRID.exists():
        raise SystemExit(f"missing {HYBRID}")
    bpy.ops.wm.open_mainfile(filepath=str(HYBRID))
    scene = bpy.context.scene
    scene.frame_set(1)
    bpy.context.view_layer.update()
    arm = bpy.data.objects["HandRig"]
    hand = bpy.data.objects["HandBody"]
    cam = scene.camera
    mat = bpy.data.materials.get("HandSkin") or bpy.data.materials.new("HandSkin")

    # Remove old hybrid finger segments
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

    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))
    print("Candidate R1 saved blend:", OUT_BLEND, "palm verts:", len(hand.data.vertices))

    # Render candidate stills
    render_all(scene, arm, cam, OUT_DEMOS)
    print("Candidate R1 completed successfully.")


if __name__ == "__main__":
    main()
