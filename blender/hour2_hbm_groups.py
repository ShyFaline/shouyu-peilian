import bpy
from pathlib import Path

src = Path(r"C:/Users/15424/Desktop/2026.9.15/blender/vendor/human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend")
with bpy.data.libraries.load(str(src), link=False) as (data_from, data_to):
    want = [n for n in (data_from.objects or []) if n and "realistic" in n.lower() and "hand" in n.lower()]
    print("candidates", want)
    data_to.objects = want or ["Hand  - Realistic"]
objs = [o for o in data_to.objects if o is not None]
print("loaded", [(o.name, o.type) for o in objs])
obj = next(o for o in objs if o.type == "MESH")
print("name", obj.name, "type", obj.type, "verts", len(obj.data.vertices), "faces", len(obj.data.polygons))
print("groups", [g.name for g in obj.vertex_groups])
print("color_attrs", [a.name for a in obj.data.color_attributes] if hasattr(obj.data, "color_attributes") else None)
print("uv", [u.name for u in obj.data.uv_layers])
print("materials", [s.name for s in obj.material_slots])
# face material indices histogram
from collections import Counter
c = Counter(p.material_index for p in obj.data.polygons)
print("mat hist", dict(c))
# bbox
import math
xs=[v.co.x for v in obj.data.vertices]; ys=[v.co.y for v in obj.data.vertices]; zs=[v.co.z for v in obj.data.vertices]
print("local bbox", (min(xs),max(xs)), (min(ys),max(ys)), (min(zs),max(zs)))
# avg normal
from mathutils import Vector
n=Vector(); a=0
for p in obj.data.polygons:
    n += p.normal * p.area; a += p.area
print("local avg n", tuple(round(x,4) for x in n.normalized()) if a else None)
