"""O 字母习字页配图候选：Blender 线描兜底。

首页 hero-o.webp 旧图手势画错（捏圈拳，非国标 O）；aitreez 文生图 503 期间
改用本管线渲染：复用 build_godot_hand_poc.py 的 O 姿态与正面机位，
纸色自发光填充 + 反面壳（inverted hull）描边：网格复制一份、顶点沿法向
外扩、翻转法向、纯黑自发光，渲染出轮廓线稿。
合成米白纸底（#f5f1e8）与 webp 由调用方用 PIL 完成；
目检通过后才替换 practice/content/art/hero-o.webp。

Usage:
  blender -b --python-exit-code 1 --python blender/render_o_ink.py
"""

import importlib.util
import os
import sys

import bpy

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)

_SPEC = importlib.util.spec_from_file_location(
    "godot_hand_poc", os.path.join(ROOT, "build_godot_hand_poc.py")
)
poc = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(poc)

OUT = os.path.join(ROOT, "candidates", "hero-o-ink")
SIZE = 1024
PAPER = (0.961, 0.945, 0.910)  # #f5f1e8，与习字页米白纸一致
HULL = 0.0018  # 描边厚度：沿法向外扩 1.8mm（手模约 0.35m），白描细线


def emission_material(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1.0)
    em.inputs["Strength"].default_value = 1.0
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return mat


def main():
    os.makedirs(OUT, exist_ok=True)
    arm, mesh = poc.import_hand()
    for mod in mesh.modifiers:
        if mod.type == "ARMATURE" and hasattr(mod, "use_preserve_volume"):
            mod.use_preserve_volume = True

    mesh.data.materials.clear()
    mesh.data.materials.append(emission_material("Paper", PAPER))

    # 反面壳描边：复制网格 → 顶点沿法向外扩 → 翻转法向 → 黑色自发光。
    # 顶点组随对象复制，骨架形变两份网格一致，壳只露出轮廓边缘。
    ink = mesh.copy()
    ink.data = mesh.data.copy()
    ink.name = "HandInkHull"
    bpy.context.collection.objects.link(ink)
    for v in ink.data.vertices:
        v.co = v.co + v.normal * HULL
    ink.data.flip_normals()
    ink.data.materials.clear()
    ink_mat = emission_material("Ink", (0.10, 0.09, 0.08))
    ink_mat.use_backface_culling = True  # 壳的近侧（翻转后法向朝内）被剔除，只剩轮廓露出
    ink.data.materials.append(ink_mat)

    _center, palm_normal, finger_up = poc.palm_frame(arm)
    axis = poc.flex_axis()
    poc.apply_pose(arm, "O", palm_normal, finger_up, axis)
    lo, hi = poc.world_bbox(mesh)
    span = (hi - lo).length
    center = (lo + hi) / 2
    front = poc.front_view_dir("O", palm_normal, finger_up)
    up = poc.view_up("O", front, finger_up)
    poc.add_camera(center + front * span * 1.35, center, up)

    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x = SIZE
    sc.render.resolution_y = SIZE
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"  # 不过 AgX，自发光纸色保真

    png = os.path.join(OUT, "hero-o-ink.png")
    sc.render.filepath = png
    bpy.ops.render.render(write_still=True)
    print("WROTE", png)
    print("O_INK_OK", OUT)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("O_INK_FAIL", type(exc).__name__, exc, file=sys.stderr)
        raise
