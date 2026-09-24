import bpy

hand = bpy.data.objects.get("HandBody")
if hand:
    sub = hand.modifiers.new("Subsurf", "SUBSURF")
    sub.levels = 2
    sub.render_levels = 3
    print("subsurf on", hand.name, "verts", len(hand.data.vertices))
    bpy.ops.wm.save_mainfile()
else:
    print("no HandBody")
