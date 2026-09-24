"""Render GF 0021 front stills from pose markers. Run only via blender.exe -P."""

from pathlib import Path

import bpy
from mathutils import Vector

MAIN = [
    "GF0021.A",
    "GF0021.B",
    "GF0021.U",
    "GF0021.V",
    "GF0021.L",
    "GF0021.Y",
    "GF0021.I",
    "GF0021.W",
]


def repo_root() -> Path:
    blend = Path(bpy.data.filepath).resolve()
    if blend.name:
        return blend.parent.parent
    return Path(__file__).resolve().parent.parent


def main():
    scene = bpy.context.scene
    out = repo_root() / "practice" / "content" / "demos"
    out.mkdir(parents=True, exist_ok=True)

    markers = {m.name: int(m.frame) for m in scene.timeline_markers}
    missing = [name for name in MAIN if name not in markers]
    if missing:
        raise SystemExit(f"blend 里缺少时间轴标记: {missing}")

    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = 128
        if hasattr(scene.eevee, "use_shadows"):
            scene.eevee.use_shadows = True

    arm = bpy.data.objects.get("HandRig")
    cam = scene.camera
    home = cam.location.copy() if cam is not None else Vector((0.0, 0.40, 0.085))
    home_scale = cam.data.ortho_scale if cam is not None else 0.30

    def mesh_xz(arm_obj):
        deps = bpy.context.evaluated_depsgraph_get()
        xs, zs = [], []
        for obj in bpy.data.objects:
            if obj.type != "MESH" or obj.parent != arm_obj:
                continue
            ev = obj.evaluated_get(deps)
            mesh = ev.to_mesh()
            mw = ev.matrix_world
            for v in mesh.vertices:
                w = mw @ v.co
                xs.append(w.x)
                zs.append(w.z)
            ev.to_mesh_clear()
        return xs, zs

    def recenter():
        if cam is None or arm is None:
            return
        xs, zs = mesh_xz(arm)
        if not xs:
            pts = [arm.matrix_world @ pb.tail for pb in arm.pose.bones]
            xs = [p.x for p in pts]
            zs = [p.z for p in pts]
        cx = (min(xs) + max(xs)) * 0.5
        cz = (min(zs) + max(zs)) * 0.5
        span = max(max(xs) - min(xs), max(zs) - min(zs)) * 1.12
        cam.location = Vector((cx, home.y, cz))
        cam.data.ortho_scale = max(span, 0.10)

    for name in MAIN:
        frame = markers[name]
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        recenter()
        if arm is not None:
            tip = arm.pose.bones["ring.TIP"].matrix.to_translation()
            print(name, "frame", frame, "ring.TIP", tuple(round(c, 4) for c in tip))
        path = out / f"{name}_front.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        print("wrote", path)
        if cam is not None:
            cam.location = home
            cam.data.ortho_scale = home_scale


if __name__ == "__main__":
    main()
