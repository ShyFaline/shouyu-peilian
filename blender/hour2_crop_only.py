"""Crop forearm only. Do not move the camera — mesh/bone rest must stay aligned."""
import bmesh
import bpy

scene = bpy.context.scene
scene.frame_set(1)
hand = bpy.data.objects["HandBody"]
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
bpy.ops.wm.save_mainfile()
