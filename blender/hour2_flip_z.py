"""Restore camera (90,0,180). Flip mesh Z so fingers sit at the top of the still."""
import math
import bpy
from mathutils import Vector

scene = bpy.context.scene
scene.frame_set(1)
hand = bpy.data.objects["HandBody"]
cam = scene.camera
if cam:
    cam.rotation_euler = (math.radians(90.0), 0.0, math.radians(180.0))
    cam.location = Vector((0.0, 0.40, 0.10))

zs = [v.co.z for v in hand.data.vertices]
zmax = max(zs)
for v in hand.data.vertices:
    v.co.z = zmax - v.co.z
hand.data.update()
zs = [v.co.z for v in hand.data.vertices]
zmin = min(zs)
for v in hand.data.vertices:
    v.co.z -= zmin
hand.data.update()
print("z", min(v.co.z for v in hand.data.vertices), max(v.co.z for v in hand.data.vertices))
bpy.ops.wm.save_mainfile()
print("flip z saved")
