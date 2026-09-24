"""Print rest-pose palm normal, thumb side, bone tips. Read-only besides console."""
import bpy
from mathutils import Vector

scene = bpy.context.scene
scene.frame_set(1)
bpy.context.view_layer.update()
arm = bpy.data.objects["HandRig"]
hand = bpy.data.objects["HandBody"]

def bone_world(name):
    pb = arm.pose.bones[name]
    return (arm.matrix_world @ pb.matrix).to_translation()

print("=== BONES rest ===")
for n in ("wrist", "palm", "thumb.TIP", "index.TIP", "middle.TIP", "ring.TIP", "pinky.TIP", "index.MCP"):
    p = bone_world(n)
    print(n, tuple(round(c, 4) for c in p))

mw = hand.matrix_world
normals = Vector((0, 0, 0))
area = 0.0
for p in hand.data.polygons:
    n = mw.to_3x3() @ p.normal
    normals += n * p.area
    area += p.area
avg = normals.normalized() if area else Vector((0, 1, 0))
print("avg face normal", tuple(round(c, 4) for c in avg), "area", round(area, 4))

xs, ys, zs = [], [], []
for v in hand.data.vertices:
    w = mw @ v.co
    xs.append(w.x); ys.append(w.y); zs.append(w.z)
print("mesh bbox x", round(min(xs),4), round(max(xs),4), "y", round(min(ys),4), round(max(ys),4), "z", round(min(zs),4), round(max(zs),4))

# verts nearest thumb.TIP vs pinky.TIP
tt = bone_world("thumb.TIP")
pt = bone_world("pinky.TIP")
near_t, near_p = [], []
for v in hand.data.vertices:
    w = mw @ v.co
    if (w - tt).length < 0.03:
        near_t.append(w)
    if (w - pt).length < 0.03:
        near_p.append(w)
if near_t:
    c = sum(near_t, Vector()) / len(near_t)
    print("thumb mesh cluster", tuple(round(x,4) for x in c), "n", len(near_t))
if near_p:
    c = sum(near_p, Vector()) / len(near_p)
    print("pinky mesh cluster", tuple(round(x,4) for x in c), "n", len(near_p))

cam = scene.camera
print("cam loc", tuple(round(c,4) for c in cam.location), "rot", tuple(round(c,4) for c in cam.rotation_euler))
fwd = cam.matrix_world.to_quaternion() @ Vector((0, 0, -1))
print("cam forward", tuple(round(c,4) for c in fwd))
print("groups", [g.name for g in hand.vertex_groups])
