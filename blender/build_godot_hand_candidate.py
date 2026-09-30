"""Godot XR hand candidate poses (godot-xr-v2).

Reuses helpers from build_godot_hand_poc.py (main is guarded).
Does not write practice/content/demos or practice/src/pose-goldens.

Usage:
  blender -b --python-exit-code 1 --python blender/build_godot_hand_candidate.py
"""

from __future__ import annotations

import importlib.util
import json
import math
import os
import sys
from array import array
from datetime import date

import bpy
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)

_SPEC = importlib.util.spec_from_file_location(
    "godot_hand_poc", os.path.join(ROOT, "build_godot_hand_poc.py")
)
poc = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(poc)

OUT = os.path.join(ROOT, "candidates", "godot-xr-v2")
GLTF = os.path.join(ROOT, "vendor", "godot-xr-hands", "hand_r.gltf")
LICENSE_PATH = os.path.join(ROOT, "vendor", "godot-xr-hands", "LICENSE.md")

LETTERS = ("A", "B", "U", "V", "W", "L", "Y", "I")
FINGERS = poc.FINGERS
SEGMENTS = poc.SEGMENTS

# Natural fist: MCP/PIP/DIP only. Metacarpal ~0 (ulnar fingers slight cup).
# Old PoC FIST=(30,95,100,60) bent metacarpals and drove tips through the palm.
FIST = {
    "Index": (0, 80, 90, 55),
    "Middle": (0, 85, 95, 58),
    "Ring": (5, 88, 98, 60),
    "Little": (8, 90, 100, 62),
}
EXT = (0, 0, 0, 0)

# Letter-I only. Shared FIST leaves Ring metacarpal 5°; with Little extended that
# reads as a raised / half-bent ring from the palm-front camera. Same MCP/PIP/DIP
# as A, zero the isolated cup, pack Index/Middle/Ring via SPLAY["I"]. Extra curl
# past ~90° MCP lifts tips back up.
I_FIST = {
    "Index": (0, 80, 90, 55),
    "Middle": (0, 85, 95, 58),
    "Ring": (0, 88, 98, 60),
}

LETTER_FINGERS = {
    "A": {f: FIST[f] for f in FINGERS},
    "B": {f: EXT for f in FINGERS},
    "U": {"Index": EXT, "Middle": EXT, "Ring": FIST["Ring"], "Little": FIST["Little"]},
    "V": {"Index": EXT, "Middle": EXT, "Ring": FIST["Ring"], "Little": FIST["Little"]},
    "W": {"Index": EXT, "Middle": EXT, "Ring": EXT, "Little": FIST["Little"]},
    "L": {"Index": EXT, "Middle": FIST["Middle"], "Ring": FIST["Ring"], "Little": FIST["Little"]},
    "Y": {"Little": EXT, "Index": FIST["Index"], "Middle": FIST["Middle"], "Ring": FIST["Ring"]},
    "I": {
        "Little": EXT,
        "Index": I_FIST["Index"],
        "Middle": I_FIST["Middle"],
        "Ring": I_FIST["Ring"],
    },
}

# Splay around palm_normal: +deg takes a +Y finger toward +Z (radial).
# B does not use metacarpal splay (palm collapse); see apply_b_adduction().
SPLAY = {
    "A": {},
    "B": {},
    "U": {"Index": -5, "Middle": 4},
    "V": {"Index": 12, "Middle": -12},
    "W": {"Index": 15, "Ring": -15},
    "L": {"Index": -2},
    "Y": {"Little": -8},
    # Index − / Ring + adduct the fist toward Middle; Little − keeps the pinky ulnar.
    "I": {"Index": -8, "Middle": 3, "Ring": 10, "Little": -6},
}

B_ALIGN_MAX_RESIDUAL_DEG = 2.0

# Thumb: (swing@palm_normal, tmeta@finger_up, proximal, distal, fold_axis)
# swing +: radial / out-and-down (PoC B/V/W bug). swing -: across palm toward ulnar.
# tmeta -: palmar (thenar). fold_axis "palm" keeps the thumb in the palmar plane.
# B uses B_THUMB only — do not copy B patches into U/I.
THUMB = {
    "A": (-22, 4, 0, 0, "palm"),
    "B": (-22, -12, -38, -42, "palm"),
    "U": (-22, -12, -38, -42, "palm"),
    "V": (-55, -10, -30, -35, "palm"),
    "W": (-70, -5, -30, -30, "palm"),
    "L": (8, -22, 0, 0, "palm"),
    "Y": (6, -12, 0, 0, "palm"),
    "I": (-22, -12, -38, -42, "palm"),
}

# Letter-B only. CMC across = axial/pronation after swing+tmeta; not used by other letters.
# r3: distal -50 was a single-joint kink (prox_up 0.76 vs distal_up 0.09). Across-palm
# moved into swing/tmeta/proximal; distal kept mild. flex± punches palmar-out / through.
# tmeta_before_swing drives the chain through the palm — keep False.
B_THUMB = {
    "swing_deg_around_palm_normal": -44,
    "metacarpal_deg_around_finger_up": 36,
    "proximal_deg": -62,
    "distal_deg": -28,
    "fold_axis": "palm",
    "cmc_deg_around_across": -14,
    "tmeta_before_swing": False,
}

PALM_VG_NEEDLES = (
    "Palm",
    "Wrist_R",
    "Index_Metacarpal",
    "Middle_Metacarpal",
    "Ring_Metacarpal",
    "Little_Metacarpal",
)

LETTER_NOTES = {
    "A": "四指握拳、拇指贴拳侧朝上；正面取桡侧三分之四，手背在画面右侧，不是正背朝观者。",
    "B": "四指并拢直立，拇指沿掌面折入贴掌。",
    "U": "争议未核：按仓库规则食中伸直并拢、无名小指握拳；不是规范已核。",
    "V": "食中分开成 V，无名小指握拳，拇指折向无名指远节一侧。",
    "W": "食中无名分开成 W，小指握拳，拇指折向小指远节一侧。",
    "L": "食指朝上、其余握拳，拇指张开；原文无直角，未按 90° 硬摆。",
    "Y": "伸拇、小指，食中无名握拳。拇指用微外展保持伸出，不用跨掌内收。",
    "I": "争议未核：按仓库规则小指伸直、其余握拳、拇指入掌；OCR 食/小指未对图。屈指用接近 A 的 I_FIST 并掌面内收，不共用四指拳的无名指掌骨杯状。",
}

PALM_YAW_DEG = 18.0
RENDER_SIZE = 512


def axes(arm):
    center, palm_normal, finger_up = poc.palm_frame(arm)
    across = palm_normal.cross(finger_up).normalized()
    flex = poc.flex_axis()
    return {
        "center": center,
        "palm_normal": palm_normal,
        "finger_up": finger_up,
        "across": across,
        "flex": flex,
    }


def palm_projected(v, palm_n):
    return v - palm_n * float(v.dot(palm_n))


def signed_angle_deg(a, b, axis):
    n = axis.normalized()
    a = palm_projected(a, n)
    b = palm_projected(b, n)
    if a.length < 1e-8 or b.length < 1e-8:
        raise RuntimeError("cannot take palm-plane angle of a near-normal vector")
    a = a.normalized()
    b = b.normalized()
    return math.degrees(math.atan2(float(n.dot(a.cross(b))), float(a.dot(b))))


def mcp_tip(arm, finger):
    mcp = arm.matrix_world @ arm.pose.bones[f"{finger}_Proximal_R"].head
    tip = arm.matrix_world @ arm.pose.bones[f"{finger}_Tip_R"].head
    return mcp, tip


def b_rest_adduction_degrees(arm, ax):
    """Proximal rotation around palm_normal that aligns each MCP→tip to Middle."""
    palm_n = ax["palm_normal"]
    dirs = {}
    rest_vs_middle = {}
    for finger in FINGERS:
        mcp, tip = mcp_tip(arm, finger)
        dirs[finger] = tip - mcp
    mid = dirs["Middle"]
    applied = {}
    for finger in FINGERS:
        rest_vs_middle[finger] = round(signed_angle_deg(mid, dirs[finger], palm_n), 4)
        applied[finger] = signed_angle_deg(dirs[finger], mid, palm_n)
    return applied, rest_vs_middle


def apply_b_adduction(arm, ax):
    applied, rest_vs_middle = b_rest_adduction_degrees(arm, ax)
    palm_n = ax["palm_normal"]
    for finger, deg in applied.items():
        if abs(deg) > 1e-6:
            poc.curl(arm, f"{finger}_Proximal_R", deg, palm_n)
    print(
        "B_ADDUCTION_REST_VS_MIDDLE_DEG",
        {f: rest_vs_middle[f] for f in FINGERS},
    )
    print(
        "B_ADDUCTION_PROXIMAL_DEG",
        {f: round(applied[f], 4) for f in FINGERS},
    )
    return {
        "method": (
            "rest MCP→tip projected on palm; rotate Proximal around palm_normal "
            "to match Middle (parallel phalanges). Metacarpal left at rest."
        ),
        "rest_angle_vs_middle_deg": rest_vs_middle,
        "applied_proximal_deg_around_palm_normal": {f: round(applied[f], 4) for f in FINGERS},
    }


def check_b_adduction(arm, ax, info):
    palm_n, across, center = ax["palm_normal"], ax["across"], ax["center"]
    dirs = {}
    radials = {}
    angles = {}
    for finger in FINGERS:
        mcp, tip = mcp_tip(arm, finger)
        dirs[finger] = tip - mcp
        radials[finger] = round(float((tip - center).dot(across)), 5)
    mid = dirs["Middle"]
    for finger in FINGERS:
        angles[finger] = round(signed_angle_deg(mid, dirs[finger], palm_n), 4)
    order = [radials[f] for f in FINGERS]
    if not (order[0] > order[1] > order[2] > order[3]):
        raise RuntimeError(f"B adjacent finger radial order reversed: {radials}")
    residual = {f: abs(angles[f]) for f in FINGERS}
    if max(residual.values()) > B_ALIGN_MAX_RESIDUAL_DEG:
        raise RuntimeError(
            f"B MCP→tip vs Middle not converged (max |angle| {max(residual.values())} > "
            f"{B_ALIGN_MAX_RESIDUAL_DEG}): {angles}"
        )
    applied = info["applied_proximal_deg_around_palm_normal"]
    if applied["Index"] >= 0 or applied["Ring"] <= 0 or applied["Little"] <= 0:
        raise RuntimeError(f"B adduction signs unexpected: {applied}")
    deltas = {
        f"{a}-{b}": round(radials[a] - radials[b], 5)
        for a, b in zip(FINGERS, FINGERS[1:])
    }
    if any(d <= 0 for d in deltas.values()):
        raise RuntimeError(f"B adjacent tip radial delta not strictly positive: {deltas}")
    info = dict(info)
    info["post_pose_angle_vs_middle_deg"] = angles
    info["post_pose_tip_radial"] = radials
    info["adjacent_tip_radial_deltas"] = deltas
    print("B_ADDUCTION_POST_VS_MIDDLE_DEG", angles)
    print("B_ADDUCTION_TIP_RADIAL", radials)
    print("B_ADDUCTION_TIP_RADIAL_DELTAS", deltas)
    return info


def fold_axis_map(ax):
    return {
        "palm": ax["palm_normal"],
        "flex": ax["flex"],
        "up": ax["finger_up"],
        "across": ax["across"],
    }


def apply_thumb_params(
    arm, ax, swing, tmeta, tprox, tdist, fold_name, cmc_across=0, tmeta_before_swing=False
):
    palm_n, finger_up = ax["palm_normal"], ax["finger_up"]

    def cmc():
        if tmeta_before_swing:
            if tmeta:
                poc.curl(arm, "Thumb_Metacarpal_R", tmeta, finger_up)
            if swing:
                poc.curl(arm, "Thumb_Metacarpal_R", swing, palm_n)
        else:
            if swing:
                poc.curl(arm, "Thumb_Metacarpal_R", swing, palm_n)
            if tmeta:
                poc.curl(arm, "Thumb_Metacarpal_R", tmeta, finger_up)
        if cmc_across:
            poc.curl(arm, "Thumb_Metacarpal_R", cmc_across, ax["across"])

    cmc()
    fold_ax = fold_axis_map(ax)[fold_name]
    if tprox:
        poc.curl(arm, "Thumb_Proximal_R", tprox, fold_ax)
    if tdist:
        poc.curl(arm, "Thumb_Distal_R", tdist, fold_ax)


def apply_b_thumb(arm, ax, params=None):
    p = params or B_THUMB
    apply_thumb_params(
        arm,
        ax,
        p["swing_deg_around_palm_normal"],
        p["metacarpal_deg_around_finger_up"],
        p["proximal_deg"],
        p["distal_deg"],
        p["fold_axis"],
        p.get("cmc_deg_around_across", 0),
        tmeta_before_swing=p.get("tmeta_before_swing", False),
    )


def palm_vertex_indices(mesh):
    gids = set()
    names = []
    for vg in mesh.vertex_groups:
        if "Thumb" in vg.name:
            continue
        if any(n in vg.name for n in PALM_VG_NEEDLES):
            gids.add(vg.index)
            names.append(vg.name)
    idxs = []
    for v in mesh.data.vertices:
        w = 0.0
        for g in v.groups:
            if g.group in gids:
                w += g.weight
        if w >= 0.35:
            idxs.append(v.index)
    return idxs, names


def collect_palm_surface(mesh, ax, indices):
    """Palmar-facing deformed palm/metacarpal verts (world)."""
    palm_n = ax["palm_normal"]
    palmar = -palm_n
    dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(dg)
    me = ev.to_mesh()
    mw = ev.matrix_world
    n3 = mw.to_3x3()
    samples = []
    fallback = []
    for i in indices:
        if i >= len(me.vertices):
            continue
        v = me.vertices[i]
        p = mw @ v.co
        n = n3 @ v.normal
        if n.length < 1e-8:
            continue
        n = n.normalized()
        palmar_h = -float((p - ax["center"]).dot(palm_n))
        fallback.append((p, n, palmar_h))
        if float(n.dot(palmar)) >= 0.2:
            samples.append((p, n))
    ev.to_mesh_clear()
    if len(samples) < 40 and fallback:
        fallback.sort(key=lambda t: t[2], reverse=True)
        take = max(40, len(fallback) // 2)
        samples = [(p, n) for p, n, _h in fallback[:take]]
    return samples


def nearest_palm(point, samples, palm_n):
    best = samples[0]
    best_d2 = (best[0] - point).length_squared
    for s in samples:
        d2 = (s[0] - point).length_squared
        if d2 < best_d2:
            best_d2 = d2
            best = s
    clearance = -float((point - best[0]).dot(palm_n))
    return {
        "signed_palmar_of_surface_m": round(clearance, 5),
        "euclid_to_nearest_m": round(math.sqrt(best_d2), 5),
        "nearest_surface": vec_list(best[0], 4),
    }


def bone_world_head(arm, name):
    return arm.matrix_world @ arm.pose.bones[name].head


def measure_thumb_vs_palm(arm, ax, samples):
    palm_n, across, up, center = (
        ax["palm_normal"],
        ax["across"],
        ax["finger_up"],
        ax["center"],
    )
    joints = {
        "cmc": bone_world_head(arm, "Thumb_Metacarpal_R"),
        "mcp": bone_world_head(arm, "Thumb_Proximal_R"),
        "ip": bone_world_head(arm, "Thumb_Distal_R"),
        "tip": bone_world_head(arm, "Thumb_Tip_R"),
    }
    out = {
        "n_palm_surface_samples": len(samples),
        "joints": {},
    }
    for name, p in joints.items():
        row = nearest_palm(p, samples, palm_n)
        row["world"] = vec_list(p, 4)
        row["palmar_of_center"] = round(-float((p - center).dot(palm_n)), 4)
        row["radial"] = round(float((p - center).dot(across)), 4)
        row["up"] = round(float((p - center).dot(up)), 4)
        out["joints"][name] = row
    distal = arm.pose.bones["Thumb_Distal_R"]
    d = (arm.matrix_world @ distal.tail) - (arm.matrix_world @ distal.head)
    if d.length < 1e-8:
        raise RuntimeError("Thumb_Distal_R has zero length")
    d = d.normalized()
    out["distal_dir"] = {
        "world": vec_list(d, 4),
        "palmar_component": round(-float(d.dot(palm_n)), 4),
        "ulnar_component": round(-float(d.dot(across)), 4),
        "up_component": round(float(d.dot(up)), 4),
    }
    prox = arm.pose.bones["Thumb_Proximal_R"]
    pd = ((arm.matrix_world @ prox.tail) - (arm.matrix_world @ prox.head)).normalized()
    out["proximal_dir"] = {
        "world": vec_list(pd, 4),
        "palmar_component": round(-float(pd.dot(palm_n)), 4),
        "ulnar_component": round(-float(pd.dot(across)), 4),
        "up_component": round(float(pd.dot(up)), 4),
    }
    hs = [s[0] for s in samples]
    out["palm_surface_palmar_of_center"] = {
        "min": round(min(-float((p - center).dot(palm_n)) for p in hs), 4),
        "max": round(max(-float((p - center).dot(palm_n)) for p in hs), 4),
        "median": round(
            sorted(-float((p - center).dot(palm_n)) for p in hs)[len(hs) // 2], 4
        ),
    }
    return out


def apply_pose(arm, letter, ax):
    palm_n, flex = ax["palm_normal"], ax["flex"]
    b_info = None
    if letter == "B":
        b_info = apply_b_adduction(arm, ax)
    else:
        for finger, deg in SPLAY[letter].items():
            if deg:
                poc.curl(arm, f"{finger}_Metacarpal_R", deg, palm_n)
    if letter != "B":
        swing, tmeta, tprox, tdist, fold_name = THUMB[letter]
        if swing:
            poc.curl(arm, "Thumb_Metacarpal_R", swing, palm_n)
    for finger, angles in LETTER_FINGERS[letter].items():
        for seg, deg in zip(SEGMENTS, angles):
            name = f"{finger}_{seg}_R"
            if deg and name in arm.pose.bones:
                poc.curl(arm, name, deg, flex)
    if letter == "B":
        apply_b_thumb(arm, ax)
    else:
        swing, tmeta, tprox, tdist, fold_name = THUMB[letter]
        if tmeta:
            poc.curl(arm, "Thumb_Metacarpal_R", tmeta, ax["finger_up"])
        fold_ax = fold_axis_map(ax)[fold_name]
        if tprox:
            poc.curl(arm, "Thumb_Proximal_R", tprox, fold_ax)
        if tdist:
            poc.curl(arm, "Thumb_Distal_R", tdist, fold_ax)
    return b_info


def front_view_dir(letter, ax):
    palm_n, finger_up, across = ax["palm_normal"], ax["finger_up"], ax["across"]
    if letter == "A":
        # 手背向右：从桡侧看，背侧在画面右侧。不是 palm_normal 正背镜头。
        return (0.86 * across + 0.22 * palm_n).normalized()
    yaw = Matrix.Rotation(math.radians(PALM_YAW_DEG), 3, finger_up)
    return (yaw @ -palm_n).normalized()


def side_view_dir(front, finger_up):
    side = front.cross(finger_up)
    if side.length < 1e-6:
        side = Vector((0.0, 0.0, 1.0))
    return side.normalized()


def rest_heads(arm):
    out = {}
    for pb in arm.pose.bones:
        out[pb.name] = (arm.matrix_world @ pb.head).copy()
    return out


def check_bones_reasonable(arm, letter):
    for pb in arm.pose.bones:
        h = arm.matrix_world @ pb.head
        t = arm.matrix_world @ pb.tail
        for label, p in (("head", h), ("tail", t)):
            if not all(math.isfinite(float(c)) for c in p):
                raise RuntimeError(f"{letter} {pb.name} {label} not finite: {p}")
            if p.length > 0.6:
                raise RuntimeError(f"{letter} {pb.name} {label} flew off: {tuple(p)}")
    wrist = arm.matrix_world @ arm.pose.bones["Wrist_R"].head
    if wrist.length > 0.08:
        raise RuntimeError(f"{letter} wrist head moved too far: {tuple(wrist)}")


def mapping_deltas(arm):
    rows = {}
    for prefix in ("Thumb", "Index", "Middle", "Ring", "Little"):
        d = arm.pose.bones[f"{prefix}_Distal_R"]
        t = arm.pose.bones[f"{prefix}_Tip_R"]
        dt = arm.matrix_world @ d.tail
        th = arm.matrix_world @ t.head
        rows[prefix] = {
            "distal_tail": [round(float(c), 5) for c in dt],
            "tip_head": [round(float(c), 5) for c in th],
            "delta": round((dt - th).length, 6),
        }
    return rows


def check_png(path, size=RENDER_SIZE):
    if not os.path.isfile(path):
        raise RuntimeError(f"missing png: {path}")
    nbytes = os.path.getsize(path)
    if nbytes < 1024:
        raise RuntimeError(f"png too small ({nbytes} B): {path}")
    with open(path, "rb") as f:
        sig = f.read(8)
    if sig != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError(f"not a PNG: {path}")
    img = bpy.data.images.load(path)
    try:
        if tuple(img.size) != (size, size):
            raise RuntimeError(f"png size {tuple(img.size)} != {size}: {path}")
        n = size * size
        buf = array("f", [0.0] * (n * 4))
        img.pixels.foreach_get(buf)
        peak_a = 0.0
        finite = True
        step = 16 * 4
        for i in range(3, len(buf), step):
            a = buf[i]
            if not math.isfinite(a):
                finite = False
                break
            if a > peak_a:
                peak_a = a
        if not finite:
            raise RuntimeError(f"png non-finite pixels: {path}")
        if peak_a < 0.05:
            raise RuntimeError(f"png looks empty (alpha peak {peak_a}): {path}")
    finally:
        bpy.data.images.remove(img)
    return nbytes


def write_contact_sheet(pairs, out_path, size=RENDER_SIZE, pad=6):
    """pairs: list of (front_path, side_path) in letter order. White background."""
    cols, rows = 2, len(pairs)
    W = cols * size + (cols + 1) * pad
    H = rows * size + (rows + 1) * pad
    pix = array("f", [1.0] * (W * H * 4))
    loaded = []
    try:
        for r, (fp, sp) in enumerate(pairs):
            for c, path in enumerate((fp, sp)):
                img = bpy.data.images.load(path)
                loaded.append(img)
                iw, ih = img.size
                src = array("f", [0.0] * (iw * ih * 4))
                img.pixels.foreach_get(src)
                x0 = pad + c * (size + pad)
                y0 = pad + (rows - 1 - r) * (size + pad)
                for y in range(min(ih, size)):
                    for x in range(min(iw, size)):
                        si = (y * iw + x) * 4
                        sr, sg, sb, sa = src[si], src[si + 1], src[si + 2], src[si + 3]
                        di = ((y0 + y) * W + (x0 + x)) * 4
                        pix[di] = sr * sa + 1.0 * (1.0 - sa)
                        pix[di + 1] = sg * sa + 1.0 * (1.0 - sa)
                        pix[di + 2] = sb * sa + 1.0 * (1.0 - sa)
                        pix[di + 3] = 1.0
    finally:
        for img in loaded:
            bpy.data.images.remove(img)
    sheet = bpy.data.images.new("contact_sheet", width=W, height=H, alpha=True)
    try:
        sheet.pixels.foreach_set(pix)
        sheet.filepath_raw = out_path
        sheet.file_format = "PNG"
        sheet.save()
    finally:
        bpy.data.images.remove(sheet)
    print("WROTE", out_path)


def measure_tips(arm, ax):
    center, palm_n, across, up = ax["center"], ax["palm_normal"], ax["across"], ax["finger_up"]
    out = {}
    for prefix in ("Thumb", "Index", "Middle", "Ring", "Little"):
        t = arm.matrix_world @ arm.pose.bones[f"{prefix}_Tip_R"].head
        out[prefix] = {
            "world": vec_list(t, 4),
            "palmar": round(-float((t - center).dot(palm_n)), 4),
            "radial": round(float((t - center).dot(across)), 4),
            "up": round(float((t - center).dot(up)), 4),
        }
    return out


def render_letter(sc, arm, mesh, letter, ax, outdir):
    b_info = apply_pose(arm, letter, ax)
    check_bones_reasonable(arm, letter)
    thumb_palm = None
    if letter == "B":
        b_info = check_b_adduction(arm, ax, b_info)
        idxs, vg_names = palm_vertex_indices(mesh)
        samples = collect_palm_surface(mesh, ax, idxs)
        if len(samples) < 20:
            raise RuntimeError(
                f"too few palmar surface samples: {len(samples)} groups={vg_names}"
            )
        thumb_palm = measure_thumb_vs_palm(arm, ax, samples)
        thumb_palm["palm_vertex_groups"] = vg_names
        print("B_THUMB_VS_PALM", json.dumps(thumb_palm, ensure_ascii=False))
    measured = measure_tips(arm, ax)
    lo, hi = poc.world_bbox(mesh)
    span = (hi - lo).length
    if not math.isfinite(span) or span < 0.05 or span > 0.8:
        raise RuntimeError(f"{letter} bbox span unreasonable: {span}")
    c = (lo + hi) / 2
    dist = span * 1.35
    front = front_view_dir(letter, ax)
    side = side_view_dir(front, ax["finger_up"])
    paths = []
    for tag, direction in (("front", front), ("side", side)):
        fname = f"GF0021.{letter}_{tag}.png"
        path = os.path.join(outdir, fname)
        cam = poc.add_camera(c + direction * dist, c, ax["finger_up"])
        poc.render(sc, path)
        bpy.data.objects.remove(cam)
        nbytes = check_png(path)
        paths.append(path)
        print(f"OK {fname} {nbytes} B")
    poc.reset_pose(arm)
    return paths, measured, b_info, thumb_palm


def vec_list(v, n=4):
    return [round(float(x), n) for x in v]


def build_metadata(ax, mapping, pngs, measured, b_adduction=None, b_thumb_vs_palm=None):
    license_head = ""
    if os.path.isfile(LICENSE_PATH):
        with open(LICENSE_PATH, encoding="utf-8") as f:
            license_head = f.read(400)
    thumb_table = {}
    for letter, (sw, tm, tp, td, fold) in THUMB.items():
        thumb_table[letter] = {
            "swing_deg_around_palm_normal": sw,
            "metacarpal_deg_around_finger_up": tm,
            "proximal_deg": tp,
            "distal_deg": td,
            "fold_axis": fold,
        }
    thumb_table["B"] = dict(B_THUMB)
    thumb_table["B"]["source"] = "B_THUMB (letter-B only; U/I keep THUMB tuples)"
    return {
        "id": "godot-xr-v2",
        "generated_on": str(date.today()),
        "purpose": "候选示范图，供主代理目检。未替换 practice/content/demos。",
        "source": {
            "mesh": "blender/vendor/godot-xr-hands/hand_r.gltf",
            "asset_copyright_gltf": "CC0 Public Domain",
            "license_file": "blender/vendor/godot-xr-hands/LICENSE.md",
            "license": "CC0 1.0 Universal",
            "author": "DigitalN8m4r3 aka Miodrag Sejic",
            "year": 2022,
            "license_file_head": license_head[:240],
        },
        "script": "blender/build_godot_hand_candidate.py",
        "reuses": "blender/build_godot_hand_poc.py helpers (import/curl/camera/render); original main is __name__-guarded",
        "rest_frame": {
            "palm_normal_world": vec_list(ax["palm_normal"]),
            "finger_up_world": vec_list(ax["finger_up"]),
            "across_radial_world": vec_list(ax["across"]),
            "flex_axis_world": vec_list(ax["flex"]),
            "notes": [
                "rest: fingers along +Y, thumb along +Y/+Z (radial), palm_normal ≈ +X (dorsal).",
                "palmar direction is -palm_normal.",
                "positive finger curl around world +Z moves a +Y phalanx toward -X (into the palm).",
                "positive thumb swing around palm_normal moves the thumb more +Z and down — that is out, not into the palm.",
                "negative thumb swing around palm_normal takes the thumb across the palm toward ulnar.",
                "negative thumb metacarpal around finger_up increases palmar offset (thenar).",
                "thumb IP fold around palm_normal (negative) stays in the palmar plane; fold around +Z punches palmar-out.",
            ],
        },
        "bone_mapping": {
            "conclusion": "Thumb has Metacarpal/Proximal/Distal/Tip (no Intermediate). Distal.tail equals Tip.head for all five digits at rest.",
            "mediapipe21": [
                "0 Wrist_R.head",
                "1 Thumb_Metacarpal_R.head (CMC)",
                "2 Thumb_Proximal_R.head (MCP)",
                "3 Thumb_Distal_R.head (IP)",
                "4 Thumb_Distal_R.tail == Thumb_Tip_R.head (tip)",
                "5 Index_Proximal_R.head (MCP) … Distal.head (DIP), Distal.tail (tip); same pattern Middle/Ring/Little",
            ],
            "rest_distal_tail_vs_tip_head": mapping,
        },
        "pose_parameters": {
            "fist_per_finger_metacarpal_proximal_intermediate_distal": FIST,
            "i_fist_letter_I_only": I_FIST,
            "extended": list(EXT),
            "letter_fingers": {k: {fk: list(fv) for fk, fv in v.items()} for k, v in LETTER_FINGERS.items()},
            "splay_deg_around_palm_normal": SPLAY,
            "b_finger_adduction": b_adduction,
            "b_thumb": B_THUMB,
            "thumb": thumb_table,
            "palm_yaw_deg_non_A": PALM_YAW_DEG,
            "A_front_view": "0.86*across + 0.22*palm_normal (radial 3/4, dorsum to the right)",
        },
        "letter_notes": LETTER_NOTES,
        "known_limits": [
            "姿态按手型要求摆，不是为二维判定规则过关调参；未导出 landmarks，未改 pose-goldens。",
            "U：原文四指并拢 vs 仓库二指，冲突未裁定；本图按仓库二指，保持标识为争议。",
            "I：OCR 食指直立 vs 仓库小指伸直，未对原图；本图按仓库小指，保持标识为争议。屈起三指用接近 A 的 I_FIST（无名指掌骨 0°，不用四指拳的 5° 孤立杯状）并 Index−8/Middle+3/Ring+10 掌面内收；小指仍伸直。过屈会把指尖抬回。未宣称视觉验收。",
            "A：手背向右 ≠ 正背朝观者；本图用桡侧三分之四。",
            "L：原文无「直角」字样，张开角是工程近似。",
            "V/W 拇指「搭在远节」是朝该指远节折入，低模上约 2–3 cm 量级，不是精确表面接触。",
            "握拳未使用旧 FIST 的掌骨 30°，以免掌骨连带整掌变形。",
            "B：四指并拢绕 Proximal(MCP) 对齐 rest MCP→tip 与中指掌面方向，不转掌骨。",
            "B 拇指：按变形后掌面蒙皮最近顶点有符号距离调 CMC/IP，不是为判定规则过关，也不宣称视觉/国标验收。低模无软组织接触解算。",
            "B 拇指实测（关节相对掌面，+为掌前）：r2 tip +15.8mm ip +14.6mm mcp +5.0mm、远节 palmar 0.035 ulnar 0.995 up 0.089、近节 up 0.76（远节 -50° 折角）。r3 swing -44 / tmeta +36 / 近节 -62 / 远节 -28 / across -14：tip +10.1mm ip +10.5mm mcp +3.4mm，远节 palmar 0.005 ulnar 0.994 up 0.114，近节 up 0.50 ulnar 0.86。关节在拇指体内，毫米级间隙不等于皮肤贴合；远节仍略朝上、指尖偏尺侧，未宣称贴掌或视觉验收。flex± 与 tmeta_before_swing 会穿掌，B 不用。",
            "Workbench 预览材质，不是最终片场灯光。",
            "本脚本只做关节有限、包围盒合理、PNG 非空检查，不宣称视觉验收，也不写国标正确或标准答案。",
            "旧 PoC 为过 thumb.not_curled 把 B/U/V/W/I 拇指绕 palm_normal 正摆 ~55°，实测拇指落到腕下方桡侧外伸。",
        ],
        "outputs": pngs,
        "measured_tips_after_pose": measured,
        "b_thumb_vs_palm_mesh": b_thumb_vs_palm,
        "contact_sheet": "contact-sheet.png",
        "contact_sheet_layout": "rows A,B,U,V,W,L,Y,I; cols front, side; white matte",
    }


# r3d: neighbors of s44/t36/p62/d20/a14 (best r3c: tip 11.4mm, mcp 3.4, prox_up 0.50).
# Tuple: label, swing, tmeta, proximal, distal, fold, cmc_across, tmeta_before_swing
B_THUMB_SWEEP = (
    ("r3d_cur", -38, 30, -45, -50, "palm", -10, False),
    ("r3d_win", -44, 36, -62, -20, "palm", -14, False),
    ("r3d_win_d24", -44, 36, -62, -24, "palm", -14, False),
    ("r3d_win_d28", -44, 36, -62, -28, "palm", -14, False),
    ("r3d_win_d32", -44, 36, -62, -32, "palm", -14, False),
    ("r3d_s42_t36_p62_d24", -42, 36, -62, -24, "palm", -14, False),
    ("r3d_s44_t34_p60_d24", -44, 34, -60, -24, "palm", -12, False),
    ("r3d_s44_t36_p58_d24", -44, 36, -58, -24, "palm", -14, False),
    ("r3d_s44_t38_p62_d22", -44, 38, -62, -22, "palm", -16, False),
    ("r3d_s46_t36_p62_d22", -46, 36, -62, -22, "palm", -14, False),
    ("r3d_s44_t36_p64_d18", -44, 36, -64, -18, "palm", -14, False),
    ("r3d_win_tf", -44, 36, -62, -24, "palm", -14, True),
    ("r3d_s42_t34_p60_d26", -42, 34, -60, -26, "palm", -14, False),
    ("r3d_s44_t36_p60_d26", -44, 36, -60, -26, "palm", -14, False),
)


def sweep_b_thumb(arm, mesh, ax):
    idxs, vg_names = palm_vertex_indices(mesh)
    print("PALM_VGROUPS", vg_names, "n_idx", len(idxs))
    rest_samples = collect_palm_surface(mesh, ax, idxs)
    rest_m = measure_thumb_vs_palm(arm, ax, rest_samples)
    print("B_THUMB_REST", json.dumps(rest_m, ensure_ascii=False))
    for label, sw, tm, tp, td, fold, ac, tf in B_THUMB_SWEEP:
        poc.reset_pose(arm)
        apply_b_adduction(arm, ax)
        apply_thumb_params(arm, ax, sw, tm, tp, td, fold, ac, tmeta_before_swing=tf)
        samples = collect_palm_surface(mesh, ax, idxs)
        m = measure_thumb_vs_palm(arm, ax, samples)
        tip, ipj, mcp = m["joints"]["tip"], m["joints"]["ip"], m["joints"]["mcp"]
        dd, pd = m["distal_dir"], m["proximal_dir"]
        summary = {
            "label": label,
            "params": [sw, tm, tp, td, fold, ac, tf],
            "tip_clear_m": tip["signed_palmar_of_surface_m"],
            "ip_clear_m": ipj["signed_palmar_of_surface_m"],
            "mcp_clear_m": mcp["signed_palmar_of_surface_m"],
            "tip_radial": tip["radial"],
            "tip_up": tip["up"],
            "distal_palmar": dd["palmar_component"],
            "distal_ulnar": dd["ulnar_component"],
            "distal_up": dd["up_component"],
            "prox_palmar": pd["palmar_component"],
            "prox_ulnar": pd["ulnar_component"],
            "prox_up": pd["up_component"],
            "n_surf": m["n_palm_surface_samples"],
        }
        print("B_THUMB_SWEEP", json.dumps(summary, ensure_ascii=False))
    poc.reset_pose(arm)


def main():
    os.makedirs(OUT, exist_ok=True)
    if not os.path.isfile(GLTF):
        raise SystemExit(f"missing input glTF: {GLTF}")
    arm, mesh = poc.import_hand()
    for mod in mesh.modifiers:
        if mod.type == "ARMATURE" and hasattr(mod, "use_preserve_volume"):
            mod.use_preserve_volume = True
    ax = axes(arm)
    print(
        "FRAME",
        "palm_n", vec_list(ax["palm_normal"]),
        "up", vec_list(ax["finger_up"]),
        "across", vec_list(ax["across"]),
    )
    mapping = mapping_deltas(arm)
    for prefix, row in mapping.items():
        if row["delta"] > 1e-5:
            raise RuntimeError(f"tip mapping mismatch {prefix}: {row}")
        print("MAP", prefix, row)
    if "--sweep-b-thumb" in sys.argv:
        sweep_b_thumb(arm, mesh, ax)
        print("B_THUMB_SWEEP_OK")
        return
    sc = poc.setup_render(size=RENDER_SIZE)
    pngs = {}
    measured = {}
    pairs = []
    b_adduction = None
    b_thumb_vs_palm = None
    for letter in LETTERS:
        paths, tips, b_info, thumb_palm = render_letter(sc, arm, mesh, letter, ax, OUT)
        front, side = paths
        pngs[letter] = {"front": os.path.relpath(front, ROOT), "side": os.path.relpath(side, ROOT)}
        measured[letter] = tips
        pairs.append((front, side))
        if letter == "B":
            b_adduction = b_info
            b_thumb_vs_palm = thumb_palm
    sheet = os.path.join(OUT, "contact-sheet.png")
    write_contact_sheet(pairs, sheet)
    if os.path.getsize(sheet) < 4096:
        raise RuntimeError("contact-sheet too small")
    meta = build_metadata(
        ax, mapping, pngs, measured,
        b_adduction=b_adduction,
        b_thumb_vs_palm=b_thumb_vs_palm,
    )
    meta_path = os.path.join(OUT, "metadata.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("WROTE", meta_path)
    print("CANDIDATE_OK", OUT)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("CANDIDATE_FAIL", type(exc).__name__, exc, file=sys.stderr)
        raise
