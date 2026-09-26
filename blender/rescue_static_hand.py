"""Isolated static R2 rescue; run with Blender 4.5, never writes production assets."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "candidates/round2/hand_gf0021.candidate_r2.blend"
OUTPUT = ROOT / "candidates/round3_static"
FINGERS = ("index", "middle", "ring", "pinky")
RADII = {"index": (.0092, .0076, .0062), "middle": (.0096, .0078, .0064),
         "ring": (.0088, .0074, .0060), "pinky": (.0072, .0062, .0052)}


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def bake(obj):
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    mesh = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=deps)
    mesh.transform(ev.matrix_world)
    result = bpy.data.objects.new("Baked_" + obj.name, mesh)
    bpy.context.collection.objects.link(result)
    # Preserve group indices for localized thumb thickening after deformation.
    for group in obj.vertex_groups:
        result.vertex_groups.new(name=group.name)
    return result


def sphere(center, radius, name):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (radius, radius * .82, radius)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def join(objects, name):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    return obj


def close_boundaries(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    boundary = [e for e in bm.edges if e.is_boundary]
    if boundary:
        bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def remesh(obj, voxel, smooth_iterations):
    activate(obj)
    mod = obj.modifiers.new("Static voxel union", "REMESH")
    mod.mode = "VOXEL"
    mod.voxel_size = voxel
    mod.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    mod = obj.modifiers.new("Gentle surface relaxation", "SMOOTH")
    mod.factor = .2
    mod.iterations = smooth_iterations
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for poly in obj.data.polygons:
        poly.use_smooth = True


def topology(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    unseen = set(bm.verts)
    sizes = []
    while unseen:
        seed = unseen.pop()
        stack = [seed]
        count = 0
        while stack:
            v = stack.pop()
            count += 1
            for edge in v.link_edges:
                other = edge.other_vert(v)
                if other in unseen:
                    unseen.remove(other)
                    stack.append(other)
        sizes.append(count)
    result = {"vertices": len(bm.verts), "faces": len(bm.faces),
              "boundary_edges": sum(e.is_boundary for e in bm.edges),
              "nonmanifold_edges": sum(not e.is_manifold for e in bm.edges),
              "component_vertex_counts": sorted(sizes, reverse=True)}
    bm.free()
    return result


def repair_connections(obj, voxel):
    """Bridge detached components to palm only, not to neighbouring fingers."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    unseen = set(bm.verts)
    components = []
    while unseen:
        stack = [unseen.pop()]
        component = []
        while stack:
            v = stack.pop()
            component.append(v)
            for edge in v.link_edges:
                other = edge.other_vert(v)
                if other in unseen:
                    unseen.remove(other)
                    stack.append(other)
        components.append(component)
    components.sort(key=len, reverse=True)
    tiny = [v for component in components if len(component) < 100 for v in component]
    main = components[0]
    # Restrict attachment targets to the lower palm, excluding already attached fingers.
    palm_targets = [v for v in main if v.co.z < .088]
    kd = KDTree(len(palm_targets))
    for i, v in enumerate(palm_targets):
        kd.insert(v.co, i)
    kd.balance()
    bridges = []
    metrics = []
    for component in components[1:]:
        if len(component) < 100:
            continue
        candidates = [(kd.find(v.co), v.co.copy()) for v in component]
        (target, _, distance), start = min(candidates, key=lambda pair: pair[0][2])
        metrics.append({"component_vertices": len(component), "gap_m": distance,
                        "bridge_applied": distance <= .035})
        if distance > .035:
            continue
        radius = .0045
        # Extend each endpoint inside the closed solids so the bridge unions robustly.
        axis = (target - start).normalized()
        start -= axis * .002
        target += axis * .002
        steps = max(2, math.ceil((target - start).length / .002))
        for step in range(steps + 1):
            bridges.append(sphere(start.lerp(target, step / steps), radius, "Palm_connection"))
    if tiny:
        bmesh.ops.delete(bm, geom=tiny, context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    if bridges:
        obj = join([obj] + bridges, obj.name)
        remesh(obj, voxel, 3)
    # Remove only disconnected voxel debris, never a substantial anatomical component.
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    unseen = set(bm.verts)
    debris = []
    while unseen:
        stack = [unseen.pop()]
        component = []
        while stack:
            v = stack.pop()
            component.append(v)
            for edge in v.link_edges:
                other = edge.other_vert(v)
                if other in unseen:
                    unseen.remove(other)
                    stack.append(other)
        if len(component) < 100:
            debris.extend(component)
    if debris:
        bmesh.ops.delete(bm, geom=debris, context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    return obj, {"bridges": metrics, "removed_debris_vertices": len(tiny) + len(debris)}


def clearance_report(fingers, voxel):
    # Surface-vertex distances are a warning heuristic, NOT a proof of no collision.
    result = []
    for i, (name, obj) in enumerate(fingers):
        for other_name, other in fingers[i + 1:]:
            kd = KDTree(len(other.data.vertices))
            for v in other.data.vertices:
                kd.insert(other.matrix_world @ v.co, v.index)
            kd.balance()
            distances = [kd.find(obj.matrix_world @ v.co)[2] for v in obj.data.vertices]
            minimum = min(distances)
            result.append({"pair": [name, other_name], "min_vertex_surface_distance_m": minimum,
                           "near_vertices_under_3_voxels": sum(d < 3 * voxel for d in distances),
                           "possible_unwanted_union": minimum < 3 * voxel})
    return result


def render_views(scene, obj, directory, letter, resolution):
    cam = scene.camera
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    points = [obj.matrix_world @ v.co for v in obj.data.vertices]
    center = Vector(tuple((min(p[i] for p in points) + max(p[i] for p in points)) / 2 for i in range(3)))
    files = []
    for angle, label in [(0, "front"), (-30, "oblique_m30"), (30, "oblique_p30")]:
        theta = math.radians(angle)
        cam.location = center + Vector((.4 * math.sin(theta), .4 * math.cos(theta), 0))
        cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
        bpy.context.view_layer.update()
        inverse = cam.matrix_world.inverted()
        projected = [inverse @ p for p in points]
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = max(max(p[i] for p in projected) - min(p[i] for p in projected) for i in (0, 1)) * 1.15
        path = directory / f"GF0021.{letter}_{label}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        files.append(str(path))
    return files


def build(letter, args, directory):
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene = bpy.context.scene
    scene.render.use_file_extension = True
    arm = bpy.data.objects["HandRig"]
    marker = scene.timeline_markers.get("GF0021." + letter)
    if marker is None:
        raise ValueError("Missing pose marker: " + letter)
    scene.frame_set(marker.frame)
    bpy.context.view_layer.update()
    hand = bpy.data.objects["HandBody"]
    palm = bake(hand)
    close_boundaries(palm)
    # A bounded outward displacement restores some thickness without changing the rig.
    thumb_groups = {g.index for g in palm.vertex_groups if g.name.startswith("thumb.")}
    displaced = 0
    for v in palm.data.vertices:
        weight = sum(g.weight for g in v.groups if g.group in thumb_groups)
        influence = max(0, min(1, (weight - .25) / .5))
        if influence:
            v.co += v.normal * (args.thumb_inflate * influence)
            displaced += 1
    palm.data.update()
    pieces = [palm]
    fingers = []
    for finger in FINGERS:
        segments = [bake(bpy.data.objects[f"{finger}_{suffix}"]) for suffix in ("ph1", "ph2", "ph3", "tip")]
        r0, r1, r2 = RADII[finger]
        # Rounded joint bridges remove pointed caps and rotational notches.
        for bone, radius in [("MCP", r0 * .98), ("PIP", r1), ("DIP", r2), ("TIP", r2 * .88)]:
            center = arm.matrix_world @ arm.pose.bones[f"{finger}.{bone}"].head
            segments.append(sphere(center, radius, f"Bridge_{finger}_{bone}"))
        tip = arm.matrix_world @ arm.pose.bones[f"{finger}.TIP"].tail
        segments.append(sphere(tip, r2 * .60, f"Cap_{finger}"))
        obj = join(segments, "Static_" + finger)
        remesh(obj, args.voxel, 3)
        fingers.append((finger, obj))
        pieces.append(obj)
    clearances = clearance_report(fingers, args.voxel)
    # Round 1 intentionally tests global union; diagnostics flag possible lost clefts.
    obj = join(pieces, "Rescue_" + letter)
    remesh(obj, args.voxel, 3)
    connections = None
    if args.round == 2:
        obj, connections = repair_connections(obj, args.voxel)
    mat = bpy.data.materials.new("Rescue matte clay")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (.62, .52, .40, 1)
    bsdf.inputs["Metallic"].default_value = 0
    bsdf.inputs["Roughness"].default_value = .78
    bsdf.inputs["Subsurface Weight"].default_value = 0
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.material_index = 0
    for original in list(scene.objects):
        if original.type == "MESH" and original != obj:
            original.hide_render = True
            original.hide_set(True)
    # Neutral background; do not use dark contact shadows to conceal geometry.
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get("Background").inputs["Color"].default_value = (.8, .8, .8, 1)
    scene.world.node_tree.nodes.get("Background").inputs["Strength"].default_value = .35
    result = {"letter": letter, "frame": marker.frame, "thumb_displaced_vertices": displaced,
              "topology": topology(obj), "connection_repair": connections,
              "finger_clearance_before_global_union": clearances,
              "visual_status": "NOT_REVIEWED", "content_status": "DRAFT_NOT_APPROVED"}
    result["images"] = render_views(scene, obj, directory, letter, args.resolution)
    activate(obj)
    bpy.context.preferences.filepaths.save_version = 0
    scene.render.filepath = "//"
    bpy.ops.wm.save_as_mainfile(filepath=str(directory / f"GF0021.{letter}.static.blend"))
    return result


def comparisons():
    # Plain three-column asset comparison: original R2 | rescue r1 | rescue r2.
    from array import array
    for letter in "ALB":
        paths = [ROOT / f"candidates/round2/demos/GF0021.{letter}_front.png"] + [
            OUTPUT / f"preview_r{r}/GF0021.{letter}_front.png" for r in (1, 2)]
        columns = []
        for path in paths:
            image = bpy.data.images.load(str(path), check_existing=False)
            image.scale(512, 512)
            pixels = array("f", [0]) * (512 * 512 * 4)
            image.pixels.foreach_get(pixels)
            columns.append(pixels)
            bpy.data.images.remove(image)
        combined = array("f")
        for row in range(512):
            for column in columns:
                combined.extend(column[row * 2048:(row + 1) * 2048])
        image = bpy.data.images.new("Comparison_" + letter, width=1536, height=512, alpha=True)
        image.pixels.foreach_set(combined)
        image.filepath_raw = str(OUTPUT / f"GF0021.{letter}_compare_R2_r1_r2.png")
        image.file_format = "PNG"
        image.save()
        bpy.data.images.remove(image)
        print("COMPARISON", letter)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--comparisons-only", action="store_true")
    parser.add_argument("--letters", nargs="+", default=["A", "L", "B"], choices=list("ALB"))
    parser.add_argument("--round", type=int, choices=[1, 2], default=1)
    parser.add_argument("--resolution", type=int, choices=[512, 1024], default=512)
    parser.add_argument("--voxel", type=float, default=.0005)
    parser.add_argument("--thumb-inflate", type=float, default=.0025)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    if args.comparisons_only:
        comparisons()
        return
    if not .00035 <= args.voxel <= .0005 or not 0 <= args.thumb_inflate <= .004:
        parser.error("Bounded rescue only: voxel .00035-.0005m, thumb inflation 0-.004m")
    directory = OUTPUT / f"preview_r{args.round}"
    if directory.exists():
        raise RuntimeError(f"Refusing to overwrite existing evidence: {directory}")
    directory.mkdir(parents=True)
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    report = {"blender_version": bpy.app.version_string, "source": str(SOURCE), "source_sha256": digest,
              "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              "parameters": vars(args), "limitations": ["No visual acceptance or content approval", "Vertex proximity does not prove absence of intersection", "Global union may erase inter-finger clefts; inspect oblique views", "Local thumb inflation may not correct malformed thumb anatomy"], "poses": []}
    for letter in args.letters:
        report["poses"].append(build(letter, args, directory))
        (directory / "checks.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == digest, "Source changed"
    print("RESCUE_PREVIEW_COMPLETE", directory, flush=True)


if __name__ == "__main__":
    main()
