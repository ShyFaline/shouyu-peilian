"""Letter-pose combo probe. Fingers posed, then thumb variants scored."""
import importlib.util
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

FIST = {
    "Index": (0, 80, 90, 55),
    "Middle": (0, 85, 95, 58),
    "Ring": (4, 88, 98, 60),
    "Little": (8, 90, 100, 62),
}
EXT = (0, 0, 0, 0)


def fmt(v, n=4):
    return tuple(round(float(x), n) for x in v)


def tip(arm, prefix):
    return poc.wpos(arm, arm.pose.bones[f"{prefix}_Tip_R"])


def joint(arm, name, end="head"):
    pb = arm.pose.bones[name]
    return poc.wpos(arm, pb) if end == "head" else arm.matrix_world @ pb.tail


def pose_fingers(arm, curls, splay, flex, palm_n):
    for finger, deg in splay.items():
        if deg:
            poc.curl(arm, f"{finger}_Metacarpal_R", deg, palm_n)
    for finger, angles in curls.items():
        for seg, deg in zip(poc.SEGMENTS, angles):
            if deg:
                poc.curl(arm, f"{finger}_{seg}_R", deg, flex)


def pose_thumb(arm, swing, tmeta, tprox, tdist, palm_n, finger_up, flex,
               swing_ax="palm", tmeta_ax="up", fold_ax="flex"):
    ax = {"palm": palm_n, "up": finger_up, "flex": flex}
    if swing:
        poc.curl(arm, "Thumb_Metacarpal_R", swing, ax[swing_ax])
    if tmeta:
        poc.curl(arm, "Thumb_Metacarpal_R", tmeta, ax[tmeta_ax])
    if tprox:
        poc.curl(arm, "Thumb_Proximal_R", tprox, ax[fold_ax])
    if tdist:
        poc.curl(arm, "Thumb_Distal_R", tdist, ax[fold_ax])


def score(arm, center, palm_n, across, finger_up, label):
    tt = tip(arm, "Thumb")
    palmar = -float((tt - center).dot(palm_n))
    radial = float((tt - center).dot(across))
    up = float((tt - center).dot(finger_up))
    extras = {}
    for name, b, end in (
        ("idx_tip", "Index_Tip_R", "head"),
        ("mid_tip", "Middle_Tip_R", "head"),
        ("ring_dip", "Ring_Distal_R", "head"),
        ("ring_tip", "Ring_Tip_R", "head"),
        ("lit_dip", "Little_Distal_R", "head"),
        ("lit_tip", "Little_Tip_R", "head"),
        ("idx_mcp", "Index_Proximal_R", "head"),
        ("mid_mcp", "Middle_Proximal_R", "head"),
    ):
        extras[name] = (tt - joint(arm, b, end)).length
    print(
        f"{label:42s} t={fmt(tt)} palmar={palmar:+.3f} radial={radial:+.3f} up={up:+.3f} "
        f"d_palm={(tt-center).length:.3f} d_ringdip={extras['ring_dip']:.3f} "
        f"d_litdip={extras['lit_dip']:.3f} d_idxmcp={extras['idx_mcp']:.3f} "
        f"d_idxtip={extras['idx_tip']:.3f} d_midmcp={extras['mid_mcp']:.3f}"
    )


def main():
    arm, mesh = poc.import_hand()
    center, palm_n, finger_up = poc.palm_frame(arm)
    across = palm_n.cross(finger_up).normalized()
    flex = poc.flex_axis()

    print("=== B: four EXT, thumb into palm ===")
    b_curls = {f: EXT for f in poc.FINGERS}
    b_splay = {"Index": -3, "Middle": -1, "Ring": 1, "Little": 3}
    b_thumbs = [
        ("B old", 55, -20, 35, 45, "palm"),
        ("B n25 n30 f+50/40", -25, -30, 50, 40, "flex"),
        ("B n30 n35 f+55/45", -30, -35, 55, 45, "flex"),
        ("B n20 n40 f+60/50", -20, -40, 60, 50, "flex"),
        ("B n35 n25 f+45/40", -35, -25, 45, 40, "flex"),
        ("B n15 n45 f+55/50", -15, -45, 55, 50, "flex"),
        ("B 0 n50 f+50/45", 0, -50, 50, 45, "flex"),
        ("B n40 n20 palm-fold", -40, -20, -40, -45, "palm"),
    ]
    for label, sw, tm, tp, td, fold in b_thumbs:
        poc.reset_pose(arm)
        pose_fingers(arm, b_curls, b_splay, flex, palm_n)
        pose_thumb(arm, sw, tm, tp, td, palm_n, finger_up, flex, fold_ax=fold)
        score(arm, center, palm_n, across, finger_up, label)

    print("\n=== V: idx/mid EXT splayed, ring/lit FIST, thumb to ring distal ===")
    v_curls = {"Index": EXT, "Middle": EXT, "Ring": FIST["Ring"], "Little": FIST["Little"]}
    v_splay = {"Index": 12, "Middle": -10}
    v_thumbs = [
        ("V old", 45, -20, 30, 40, "palm"),
        ("V n50 n20 f+50/40", -50, -20, 50, 40, "flex"),
        ("V n55 n25 f+55/40", -55, -25, 55, 40, "flex"),
        ("V n60 n15 f+45/35", -60, -15, 45, 35, "flex"),
        ("V n45 n30 f+60/45", -45, -30, 60, 45, "flex"),
        ("V n70 n10 f+40/30", -70, -10, 40, 30, "flex"),
    ]
    for label, sw, tm, tp, td, fold in v_thumbs:
        poc.reset_pose(arm)
        pose_fingers(arm, v_curls, v_splay, flex, palm_n)
        pose_thumb(arm, sw, tm, tp, td, palm_n, finger_up, flex, fold_ax=fold)
        score(arm, center, palm_n, across, finger_up, label)

    print("\n=== W: idx/mid/ring EXT, lit FIST, thumb to little distal ===")
    w_curls = {"Index": EXT, "Middle": EXT, "Ring": EXT, "Little": FIST["Little"]}
    w_splay = {"Index": 16, "Ring": -16}
    w_thumbs = [
        ("W old", 55, -20, 30, 40, "palm"),
        ("W n65 n15 f+50/40", -65, -15, 50, 40, "flex"),
        ("W n75 n10 f+45/35", -75, -10, 45, 35, "flex"),
        ("W n80 n20 f+50/40", -80, -20, 50, 40, "flex"),
        ("W n70 n25 f+55/40", -70, -25, 55, 40, "flex"),
    ]
    for label, sw, tm, tp, td, fold in w_thumbs:
        poc.reset_pose(arm)
        pose_fingers(arm, w_curls, w_splay, flex, palm_n)
        pose_thumb(arm, sw, tm, tp, td, palm_n, finger_up, flex, fold_ax=fold)
        score(arm, center, palm_n, across, finger_up, label)

    print("\n=== A: FIST + thumb up radial ===")
    a_curls = dict(FIST)
    a_thumbs = [
        ("A old", -80, -10, 0, 0, "palm"),
        ("A n18 0 0 0", -18, 0, 0, 0, "flex"),
        ("A n25 5 0 0", -25, 5, 0, 0, "flex"),
        ("A n12 n8 8 5", -12, -8, 8, 5, "flex"),
        ("A 0 0 0 0", 0, 0, 0, 0, "flex"),
        ("A n30 0 10 5", -30, 0, 10, 5, "flex"),
    ]
    for label, sw, tm, tp, td, fold in a_thumbs:
        poc.reset_pose(arm)
        pose_fingers(arm, a_curls, {}, flex, palm_n)
        pose_thumb(arm, sw, tm, tp, td, palm_n, finger_up, flex, fold_ax=fold)
        score(arm, center, palm_n, across, finger_up, label)

    print("\n=== L: idx EXT others FIST, thumb spread ===")
    l_curls = {"Index": EXT, "Middle": FIST["Middle"], "Ring": FIST["Ring"], "Little": FIST["Little"]}
    l_thumbs = [
        ("L old", -75, 0, 0, 0, "palm"),
        ("L 0 n20 0 0", 0, -20, 0, 0, "flex"),
        ("L 10 n25 0 0", 10, -25, 0, 0, "flex"),
        ("L -5 n30 0 0", -5, -30, 0, 0, "flex"),
        ("L 5 n15 0 0", 5, -15, 0, 0, "flex"),
        ("L 0 0 0 0", 0, 0, 0, 0, "flex"),
    ]
    for label, sw, tm, tp, td, fold in l_thumbs:
        poc.reset_pose(arm)
        pose_fingers(arm, l_curls, {"Index": -2}, flex, palm_n)
        pose_thumb(arm, sw, tm, tp, td, palm_n, finger_up, flex, fold_ax=fold)
        score(arm, center, palm_n, across, finger_up, label)

    print("\n=== Y: thumb+little EXT ===")
    y_curls = {"Index": FIST["Index"], "Middle": FIST["Middle"], "Ring": FIST["Ring"], "Little": EXT}
    y_thumbs = [
        ("Y old", -55, 0, 0, 0, "palm"),
        ("Y 0 n10 0 0", 0, -10, 0, 0, "flex"),
        ("Y 8 n15 0 0", 8, -15, 0, 0, "flex"),
        ("Y -10 n5 0 0", -10, -5, 0, 0, "flex"),
        ("Y 0 0 0 0", 0, 0, 0, 0, "flex"),
    ]
    for label, sw, tm, tp, td, fold in y_thumbs:
        poc.reset_pose(arm)
        pose_fingers(arm, y_curls, {"Little": -8}, flex, palm_n)
        pose_thumb(arm, sw, tm, tp, td, palm_n, finger_up, flex, fold_ax=fold)
        score(arm, center, palm_n, across, finger_up, label)

    print("POSE_PROBE_OK")


if __name__ == "__main__":
    main()
