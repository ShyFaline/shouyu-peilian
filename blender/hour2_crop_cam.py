"""Crop HBM forearm sail; turn camera so fingers go up on the still."""
import math
import bmesh
import bpy
from mathutils import Vector

scene = bpy.context.scene
scene.frame_set(1)
bpy.context.view_layer.update()
hand = bpy.data.objects["HandBody"]
cam = scene.camera

# Delete the long wrist tube (local z below palm).
bpy.ops.object.select_all(action="DESELECT")
hand.select_set(True)
bpy.context.view_layer.objects.active = hand
bpy.ops.object.mode_set(mode="EDIT")
bm = bmesh.from_edit_mesh(hand.data)
bm.verts.ensure_lookup_table()
dead = [v for v in bm.verts if v.co.z < 0.038]
bmesh.ops.delete(bm, geom=dead, context="VERTS")
bmesh.update_edit_mesh(hand.data)
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")
print("cropped verts", len(hand.data.vertices))

# Camera: look along -Y, +Z up on the image (drop the 180 Z that put fingers down).
if cam:
    cam.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    cam.location = Vector((0.0, 0.40, 0.10))
    print("cam rot", tuple(round(c, 4) for c in cam.rotation_euler))

bpy.ops.wm.save_mainfile()
print("crop+cam saved")
