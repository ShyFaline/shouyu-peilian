"""Face palm to camera (+Y), fingers +Z, wrist at origin. Rest-pose vertex edit."""

from __future__ import annotations

import math

import bpy
from mathutils import Matrix, Vector

arm = bpy.data.objects["HandRig"]
hand = bpy.data.objects["HandBody"]
scene = bpy.context.scene
scene.frame_set(1)
bpy.context.view_layer.update()

# Work on rest mesh in object space.
coords = [v.co.copy() for v in hand.data.vertices]
xs = [c.x for c in coords]
ys = [c.y for c in coords]
zs = [c.z for c in coords]
mn = Vector((min(xs), min(ys), min(zs)))
mx = Vector((max(xs), max(ys), max(zs)))
c = (mn + mx) * 0.5
print("before", mn, mx)

# Flip so current "down" fingers become +Z and palm +Y.
# Empirical from B render: wrist at top of frame, back of hand visible.
rx = Matrix.Rotation(math.pi, 4, "X")
rz = Matrix.Rotation(math.pi, 4, "Z")
m = rz @ rx
for v, co in zip(hand.data.vertices, coords):
    v.co = (m @ (co - c)) + Vector((0.0, 0.0, 0.0))
hand.data.update()

coords = [v.co.copy() for v in hand.data.vertices]
zs = [c.z for c in coords]
xs = [c.x for c in coords]
ys = [c.y for c in coords]
# Wrist = lower Z cluster. Shift wrist to rig wrist.
off = Vector((- (min(xs) + max(xs)) * 0.5, - (min(ys) + max(ys)) * 0.5, -min(zs)))
for v in hand.data.vertices:
    v.co += off
hand.data.update()
print("after z", min(zs) + off.z, max(zs) + off.z)

# Rebind automatic weights in rest pose.
if hand.parent:
    bpy.ops.object.select_all(action="DESELECT")
    hand.select_set(True)
    bpy.context.view_layer.objects.active = hand
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
bpy.ops.object.select_all(action="DESELECT")
hand.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
print("groups", len(hand.vertex_groups))
bpy.ops.wm.save_mainfile()
