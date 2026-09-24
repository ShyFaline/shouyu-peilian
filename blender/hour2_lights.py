"""Lower studio energy so a palm-facing mesh does not clip to white."""
import bpy
from mathutils import Vector

scene = bpy.context.scene
for name, energy in (("Key", 2.4), ("Fill", 0.8), ("Rim", 1.2)):
    obj = bpy.data.objects.get(name)
    if obj and obj.type == "LIGHT":
        obj.data.energy = energy
        print(name, "energy", obj.data.energy)

if scene.world and scene.world.use_nodes:
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.42, 0.41, 0.39, 1.0)
        bg.inputs[1].default_value = 0.22

mat = bpy.data.materials.get("HandSkin")
if mat and mat.use_nodes:
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.62, 0.44, 0.35, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.58
        if "Subsurface Weight" in bsdf.inputs:
            bsdf.inputs["Subsurface Weight"].default_value = 0.12

scene.view_settings.view_transform = "Standard"
scene.view_settings.exposure = -1.2
bpy.ops.wm.save_mainfile()
print("lights saved")
