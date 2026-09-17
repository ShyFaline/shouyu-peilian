"""Render GF 0021 front stills from pose markers. Run only via blender.exe -P."""

from pathlib import Path

import bpy

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
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = 32

    arm = bpy.data.objects.get("HandRig")
    for name in MAIN:
        frame = markers[name]
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        if arm is not None:
            tip = arm.pose.bones["ring.TIP"].matrix.to_translation()
            print(name, "frame", frame, "ring.TIP", tuple(round(c, 4) for c in tip))
        path = out / f"{name}_front.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        print("wrote", path)


if __name__ == "__main__":
    main()
