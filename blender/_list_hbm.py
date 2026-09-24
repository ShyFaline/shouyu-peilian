import bpy
from pathlib import Path

src = Path(r"C:/Users/15424/Desktop/2026.9.15/blender/vendor/human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend")
with bpy.data.libraries.load(str(src), link=False) as (data_from, data_to):
    objs = [n for n in (data_from.objects or []) if n]
    print("N_OBJECTS", len(objs))
    for n in objs:
        if "hand" in n.lower() or "Hand" in n:
            print("HAND", n)
    print("---ALL---")
    for n in objs:
        print(n)
