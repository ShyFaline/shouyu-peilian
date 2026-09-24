"""Rebind only: palm verts must not follow finger MCP curl. Rest pose already matched."""
from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector

BLEND = Path(__file__).resolve().parent / "hand_gf0021.blend"


def dist_point_segment(p, a, b):
    ab = b - a
    d = ab.length_squared
    if d < 1e-12:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / d))
    return (p - (a + ab * t)).length


def main():
    arm = bpy.data.objects["HandRig"]
    hand = bpy.data.objects["HandBody"]
    scene = bpy.context.scene
    scene.frame_set(1)
    bpy.context.view_layer.update()

    mw = hand.matrix_world.copy()
    hand.parent = None
    hand.matrix_world = mw
    for mod in list(hand.modifiers):
        if mod.type == "ARMATURE":
            hand.modifiers.remove(mod)

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
    finger_bones = {n for n, *_ in segs if any(n.startswith(f) for f in ("index.", "middle.", "ring.", "pinky."))}
    thumb_bones = {n for n, *_ in segs if n.startswith("thumb.")}
    for vi, vert in enumerate(hand.data.vertices):
        p = mw @ vert.co
        raw = []
        for name, a, c, blen in segs:
            d = dist_point_segment(p, a, c)
            w = math.exp(-((d / (blen * 0.48)) ** 2))
            if name in finger_bones and p.z < 0.085:
                w *= 0.04
            if name in thumb_bones and p.x < 0.01:
                w *= 0.03
            if name.startswith("pinky.") and p.x > 0.02:
                w *= 0.04
            raw.append((name, w))
        total = sum(w for _n, w in raw) or 1.0
        for name, w in raw:
            g = w / total
            if g > 0.02:
                groups[name].add([vi], g, "REPLACE")
    mod = hand.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    mod.use_vertex_groups = True
    hand.parent = arm
    hand.matrix_parent_inverse = arm.matrix_world.inverted()
    if not any(m.type == "SUBSURF" for m in hand.modifiers):
        sub = hand.modifiers.new("Subsurf", "SUBSURF")
        sub.levels = 2
        sub.render_levels = 3
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print("rebind palm-safe verts", len(hand.data.vertices))


if __name__ == "__main__":
    main()
