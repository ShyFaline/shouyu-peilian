"""Append Blender Studio Human Base Meshes realistic hand (CC0) onto HandRig.

Does not change GF0021 pose library or U two vs four.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

BLEND = Path(__file__).resolve().parent / "hand_gf0021.blend"
HBM = Path(__file__).resolve().parent / "vendor" / "human-base-meshes-bundle-v1.4.1" / "human_base_meshes_bundle.blend"
CANDIDATES = ("realistic_hand", "Hand  - Realistic", "Hand - Realistic")


def rest_head_tail(arm, name):
    bone = arm.data.bones[name]
    return arm.matrix_world @ bone.head_local, arm.matrix_world @ bone.tail_local


def delete_old_meshes(arm):
    doomed = [
        o
        for o in list(bpy.data.objects)
        if o.type == "MESH" and (o.parent == arm or o.name.startswith(("Palm", "Wrist", "index_", "middle_", "ring_", "pinky_", "thumb_", "HandBody", "Nail")))
    ]
    for obj in doomed:
        mesh = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh and mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def append_hand():
    with bpy.data.libraries.load(str(HBM), link=False) as (data_from, data_to):
        found = [n for n in CANDIDATES if n in (data_from.objects or [])]
        if not found:
            raise SystemExit(f"no hand in HBM, have {[n for n in data_from.objects if n and 'hand' in n.lower()]}")
        data_to.objects = found
    linked = []
    for obj in data_to.objects:
        if obj is None:
            continue
        if obj.name not in bpy.context.scene.collection.objects:
            bpy.context.scene.collection.objects.link(obj)
        linked.append(obj)
        print("appended", obj.name, "verts", len(obj.data.vertices) if obj.type == "MESH" else obj.type)
    meshes = [o for o in linked if o.type == "MESH"]
    if not meshes:
        raise SystemExit("appended objects are not meshes")
    meshes.sort(key=lambda o: len(o.data.vertices), reverse=True)
    return meshes[0]


def bbox_world(obj):
    xs, ys, zs = [], [], []
    mw = obj.matrix_world
    for v in obj.data.vertices:
        w = mw @ v.co
        xs.append(w.x)
        ys.append(w.y)
        zs.append(w.z)
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def align_to_rig(hand, arm):
    """Map HBM hand into our rig space: wrist origin, fingers +Z, palm +Y (camera)."""
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    mn, mx = bbox_world(hand)
    size = mx - mn
    print("hbm bbox min", tuple(round(c, 4) for c in mn), "size", tuple(round(c, 4) for c in size))
    # Typical HBM: meters, standing character scale, hand along some axis.
    wrist_h, _ = rest_head_tail(arm, "wrist")
    idx_h, idx_t = rest_head_tail(arm, "index.TIP")
    mid_h, mid_t = rest_head_tail(arm, "middle.TIP")
    pinky_h, _ = rest_head_tail(arm, "pinky.MCP")
    thumb_h, _ = rest_head_tail(arm, "thumb.TIP")
    rig_len = (mid_t - wrist_h).length
    hand_len = max(size.x, size.y, size.z)
    scale = rig_len / max(hand_len, 1e-6) * 1.05
    hand.scale = (scale, scale, scale)
    bpy.context.view_layer.update()

    # Rotate so the longest axis (usually wrist->middle) aligns to +Z.
    mn, mx = bbox_world(hand)
    size = mx - mn
    axes = [(size.x, Vector((1, 0, 0))), (size.y, Vector((0, 1, 0))), (size.z, Vector((0, 0, 1)))]
    axes.sort(reverse=True)
    long_axis = axes[0][1]
    rot = long_axis.rotation_difference(Vector((0, 0, 1))).to_matrix().to_4x4()
    hand.matrix_world = rot @ hand.matrix_world
    bpy.context.view_layer.update()

    mn, mx = bbox_world(hand)
    # Wrist is the end opposite the fingertips. After +Z align, low Z is wrist.
    delta = wrist_h - Vector(((mn.x + mx.x) * 0.5, (mn.y + mx.y) * 0.5, mn.z))
    hand.location += delta
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    hand.select_set(True)
    bpy.context.view_layer.objects.active = hand
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    mn, mx = bbox_world(hand)
    print("aligned bbox min", tuple(round(c, 4) for c in mn), "max", tuple(round(c, 4) for c in mx))


def bind(hand, arm):
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    hand.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    print("vertex groups", len(hand.vertex_groups), [g.name for g in hand.vertex_groups][:24])


def skin_material(obj):
    mat = bpy.data.materials.get("HandSkin")
    if mat is None:
        mat = bpy.data.materials.new("HandSkin")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (0.80, 0.60, 0.48, 1.0)
            bsdf.inputs["Roughness"].default_value = 0.45
            if "Subsurface Weight" in bsdf.inputs:
                bsdf.inputs["Subsurface Weight"].default_value = 0.25
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def studio():
    if bpy.data.objects.get("StudioCard") is None:
        bpy.ops.mesh.primitive_plane_add(size=1.4, location=(0.0, -0.16, 0.07))
        card = bpy.context.active_object
        card.name = "StudioCard"
        card.rotation_euler = (math.radians(90.0), 0.0, 0.0)
        mat = bpy.data.materials.new("StudioCardMat")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (0.70, 0.69, 0.66, 1.0)
            bsdf.inputs["Roughness"].default_value = 0.9
        card.data.materials.append(mat)
    scene = bpy.context.scene
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGB"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    if scene.world and scene.world.use_nodes:
        bg = scene.world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs[0].default_value = (0.50, 0.49, 0.47, 1.0)
            bg.inputs[1].default_value = 0.4


def main():
    if not HBM.exists():
        raise SystemExit(f"missing {HBM}")
    arm = bpy.data.objects.get("HandRig")
    if arm is None:
        raise SystemExit("HandRig missing")
    delete_old_meshes(arm)
    hand = append_hand()
    align_to_rig(hand, arm)
    skin_material(hand)
    bind(hand, arm)
    studio()
    hand.name = "HandBody"
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print("saved", BLEND, "verts", len(hand.data.vertices))


if __name__ == "__main__":
    main()
