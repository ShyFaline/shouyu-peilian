"""One-shot rest-axis / curl-direction probe for Godot XR hand_r.gltf.

Not a candidate generator. Prints numeric evidence for hinge signs.
"""
import importlib.util
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)

spec = importlib.util.spec_from_file_location(
    "godot_poc", os.path.join(ROOT, "build_godot_hand_poc.py")
)
poc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(poc)


def fmt(v, n=4):
    return tuple(round(float(x), n) for x in v)


def bone_axes(arm, name):
    pb = arm.pose.bones[name]
    M = arm.matrix_world @ pb.matrix
    return {
        "head": fmt(M.translation),
        "x": fmt(M.to_3x3() @ Vector((1, 0, 0))),
        "y": fmt(M.to_3x3() @ Vector((0, 1, 0))),
        "z": fmt(M.to_3x3() @ Vector((0, 0, 1))),
        "length": round(pb.length, 4),
    }


def tip_of(arm, prefix):
    pb = arm.pose.bones
    if f"{prefix}_Tip_R" in pb:
        return poc.wpos(arm, pb[f"{prefix}_Tip_R"])
    return arm.matrix_world @ pb[f"{prefix}_Distal_R"].tail


def main():
    arm, mesh = poc.import_hand()
    center, palm_normal, finger_up = poc.palm_frame(arm)
    across = palm_normal.cross(finger_up).normalized()
    flex = poc.flex_axis()
    print("PALM_CENTER", fmt(center))
    print("PALM_NORMAL(+X dorsal?)", fmt(palm_normal))
    print("FINGER_UP", fmt(finger_up))
    print("ACROSS(radial/thumb)", fmt(across))
    print("FLEX_AXIS", fmt(flex))

    print("\n=== REST BONE AXES (world) ===")
    names = [
        "Wrist_R",
        "Thumb_Metacarpal_R",
        "Thumb_Proximal_R",
        "Thumb_Distal_R",
        "Thumb_Tip_R",
        "Index_Metacarpal_R",
        "Index_Proximal_R",
        "Index_Intermediate_R",
        "Index_Distal_R",
        "Index_Tip_R",
        "Middle_Proximal_R",
        "Little_Metacarpal_R",
        "Palm_R",
    ]
    for n in names:
        print(n, bone_axes(arm, n))

    # Distal.tail vs Tip.head mapping
    print("\n=== TIP MAPPING Distal.tail vs Tip.head ===")
    for prefix in ("Thumb", "Index", "Middle", "Ring", "Little"):
        d = arm.pose.bones[f"{prefix}_Distal_R"]
        t = arm.pose.bones[f"{prefix}_Tip_R"]
        dt = arm.matrix_world @ d.tail
        th = arm.matrix_world @ t.head
        print(prefix, "distal.tail", fmt(dt, 5), "tip.head", fmt(th, 5),
              "delta", round((dt - th).length, 6))

    palm_pt = center

    def report(label):
        bpy.context.view_layer.update()
        tt = tip_of(arm, "Thumb")
        it = tip_of(arm, "Index")
        mt = tip_of(arm, "Middle")
        # palmarness: more negative dot with dorsal normal = more palmar
        palmar = -float((tt - palm_pt).dot(palm_normal))
        radial = float((tt - palm_pt).dot(across))
        up = float((tt - palm_pt).dot(finger_up))
        to_mid = (tt - mt).length
        to_idx = (tt - it).length
        to_palm = (tt - palm_pt).length
        print(f"{label:40s} tip={fmt(tt)} palmar={palmar:+.4f} radial={radial:+.4f} "
              f"up={up:+.4f} |tt-palm|={to_palm:.4f} |tt-mid|={to_mid:.4f} |tt-idx|={to_idx:.4f}")

    print("\n=== REST TIPS ===")
    report("rest")

    print("\n=== INDEX PROXIMAL ±45 around candidate axes ===")
    for axis_name, axis in (("flex+Z", flex), ("palm_n", palm_normal),
                            ("finger_up", finger_up), ("across", across)):
        for sgn in (+45, -45):
            poc.reset_pose(arm)
            poc.curl(arm, "Index_Proximal_R", sgn, axis)
            it = tip_of(arm, "Index")
            palmar = -float((it - palm_pt).dot(palm_normal))
            up = float((it - palm_pt).dot(finger_up))
            print(f"  Index_P {sgn:+3d} @{axis_name:10s} tip={fmt(it)} palmar={palmar:+.4f} up={up:+.4f}")

    print("\n=== FIST-like curl (no metacarpal) +90,+90,+60 @flex ===")
    poc.reset_pose(arm)
    for finger in poc.FINGERS:
        for seg, deg in (("Proximal", 90), ("Intermediate", 95), ("Distal", 55)):
            poc.curl(arm, f"{finger}_{seg}_R", deg, flex)
    for finger in poc.FINGERS:
        t = tip_of(arm, finger)
        palmar = -float((t - palm_pt).dot(palm_normal))
        up = float((t - palm_pt).dot(finger_up))
        print(f"  {finger:8s} tip={fmt(t)} palmar={palmar:+.4f} up={up:+.4f} |t-palm|={(t-palm_pt).length:.4f}")

    print("\n=== FIST with +30 metacarpal (old) ===")
    poc.reset_pose(arm)
    for finger in poc.FINGERS:
        for seg, deg in (("Metacarpal", 30), ("Proximal", 95), ("Intermediate", 100), ("Distal", 60)):
            poc.curl(arm, f"{finger}_{seg}_R", deg, flex)
    for finger in poc.FINGERS:
        t = tip_of(arm, finger)
        palmar = -float((t - palm_pt).dot(palm_normal))
        up = float((t - palm_pt).dot(finger_up))
        print(f"  {finger:8s} tip={fmt(t)} palmar={palmar:+.4f} up={up:+.4f} |t-palm|={(t-palm_pt).length:.4f}")

    print("\n=== THUMB METACARPAL swing ± around palm_normal ===")
    for sgn in range(-90, 91, 15):
        poc.reset_pose(arm)
        poc.curl(arm, "Thumb_Metacarpal_R", sgn, palm_normal)
        report(f"thumb meta swing {sgn:+d} @palm_n")

    print("\n=== THUMB METACARPAL ± around finger_up ===")
    for sgn in (-40, -20, 20, 40):
        poc.reset_pose(arm)
        poc.curl(arm, "Thumb_Metacarpal_R", sgn, finger_up)
        report(f"thumb meta {sgn:+d} @finger_up")

    print("\n=== THUMB METACARPAL ± around flex+Z ===")
    for sgn in (-40, 40):
        poc.reset_pose(arm)
        poc.curl(arm, "Thumb_Metacarpal_R", sgn, flex)
        report(f"thumb meta {sgn:+d} @flex")

    print("\n=== THUMB PROXIMAL fold ± around axes (after -50 palm_n swing) ===")
    for axis_name, axis in (("palm_n", palm_normal), ("finger_up", finger_up),
                            ("flex", flex), ("across", across)):
        for sgn in (+40, -40):
            poc.reset_pose(arm)
            poc.curl(arm, "Thumb_Metacarpal_R", -50, palm_normal)
            poc.curl(arm, "Thumb_Proximal_R", sgn, axis)
            report(f"swing-50 + prox {sgn:+d} @{axis_name}")

    print("\n=== THUMB combo candidates for B (into palm) ===")
    combos = [
        ("old B", dict(swing=55, tmeta=-20, tprox=35, tdist=45, swing_ax="palm", tmeta_ax="up", fold_ax="palm")),
        ("neg swing", dict(swing=-55, tmeta=-20, tprox=35, tdist=45, swing_ax="palm", tmeta_ax="up", fold_ax="palm")),
        ("neg swing + neg fold", dict(swing=-50, tmeta=0, tprox=-40, tdist=-50, swing_ax="palm", tmeta_ax="up", fold_ax="palm")),
        ("neg swing fold@flex+", dict(swing=-45, tmeta=-10, tprox=50, tdist=40, swing_ax="palm", tmeta_ax="up", fold_ax="flex")),
        ("neg swing fold@flex-", dict(swing=-45, tmeta=-10, tprox=-50, tdist=-40, swing_ax="palm", tmeta_ax="up", fold_ax="flex")),
        ("oppose@up- + fold@palm-", dict(swing=0, tmeta=-35, tprox=-45, tdist=-40, swing_ax="palm", tmeta_ax="up", fold_ax="palm")),
        ("A old", dict(swing=-80, tmeta=-10, tprox=0, tdist=0, swing_ax="palm", tmeta_ax="up", fold_ax="palm")),
        ("A restish", dict(swing=-15, tmeta=0, tprox=10, tdist=5, swing_ax="palm", tmeta_ax="up", fold_ax="palm")),
        ("A adduct", dict(swing=-25, tmeta=5, tprox=0, tdist=0, swing_ax="palm", tmeta_ax="up", fold_ax="palm")),
        ("Y old", dict(swing=-55, tmeta=0, tprox=0, tdist=0, swing_ax="palm", tmeta_ax="up", fold_ax="palm")),
        ("L old", dict(swing=-75, tmeta=0, tprox=0, tdist=0, swing_ax="palm", tmeta_ax="up", fold_ax="palm")),
    ]
    axmap = {"palm": palm_normal, "up": finger_up, "flex": flex, "across": across}
    for label, c in combos:
        poc.reset_pose(arm)
        poc.curl(arm, "Thumb_Metacarpal_R", c["swing"], axmap[c["swing_ax"]])
        if c["tmeta"]:
            poc.curl(arm, "Thumb_Metacarpal_R", c["tmeta"], axmap[c["tmeta_ax"]])
        if c["tprox"]:
            poc.curl(arm, "Thumb_Proximal_R", c["tprox"], axmap[c["fold_ax"]])
        if c["tdist"]:
            poc.curl(arm, "Thumb_Distal_R", c["tdist"], axmap[c["fold_ax"]])
        report(label)

    print("PROBE_OK")


if __name__ == "__main__":
    main()
