"""Second-round thumb combos: keep palmarness near rest (~0.04 = palm surface)."""
import importlib.util
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
spec = importlib.util.spec_from_file_location(
    "godot_poc", os.path.join(ROOT, "build_godot_hand_poc.py")
)
poc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(poc)

from _probe_godot_poses import (
    EXT, FIST, pose_fingers, pose_thumb, score,
)


def main():
    arm, mesh = poc.import_hand()
    center, palm_n, finger_up = poc.palm_frame(arm)
    across = palm_n.cross(finger_up).normalized()
    flex = poc.flex_axis()

    print("=== B palm-surface folds ===")
    b_curls = {f: EXT for f in poc.FINGERS}
    b_splay = {"Index": -3, "Middle": -1, "Ring": 1, "Little": 3}
    rows = [
        ("B sw-20 tm-10 palm-35/-40", -20, -10, -35, -40, "palm"),
        ("B sw-25 tm-15 palm-40/-45", -25, -15, -40, -45, "palm"),
        ("B sw-30 tm-10 palm-45/-40", -30, -10, -45, -40, "palm"),
        ("B sw-15 tm-20 palm-50/-40", -15, -20, -50, -40, "palm"),
        ("B sw-28 tm-8 flex+25/+20", -28, -8, 25, 20, "flex"),
        ("B sw-30 tm-12 flex+30/+25", -30, -12, 30, 25, "flex"),
        ("B sw-22 tm-18 flex+20/+30", -22, -18, 20, 30, "flex"),
    ]
    for label, sw, tm, tp, td, fold in rows:
        poc.reset_pose(arm)
        pose_fingers(arm, b_curls, b_splay, flex, palm_n)
        pose_thumb(arm, sw, tm, tp, td, palm_n, finger_up, flex, fold_ax=fold)
        score(arm, center, palm_n, across, finger_up, label)

    print("\n=== V reach ring, mild palmar ===")
    v_curls = {"Index": EXT, "Middle": EXT, "Ring": FIST["Ring"], "Little": FIST["Little"]}
    v_splay = {"Index": 12, "Middle": -10}
    rows = [
        ("V sw-50 tm-8 palm-35/-30", -50, -8, -35, -30, "palm"),
        ("V sw-55 tm-10 palm-30/-35", -55, -10, -30, -35, "palm"),
        ("V sw-60 tm-5 palm-25/-30", -60, -5, -25, -30, "palm"),
        ("V sw-50 tm-10 flex+20/+20", -50, -10, 20, 20, "flex"),
        ("V sw-55 tm-8 flex+25/+15", -55, -8, 25, 15, "flex"),
    ]
    for label, sw, tm, tp, td, fold in rows:
        poc.reset_pose(arm)
        pose_fingers(arm, v_curls, v_splay, flex, palm_n)
        pose_thumb(arm, sw, tm, tp, td, palm_n, finger_up, flex, fold_ax=fold)
        score(arm, center, palm_n, across, finger_up, label)

    print("\n=== W reach little, mild palmar ===")
    w_curls = {"Index": EXT, "Middle": EXT, "Ring": EXT, "Little": FIST["Little"]}
    w_splay = {"Index": 16, "Ring": -16}
    rows = [
        ("W sw-70 tm-5 palm-30/-30", -70, -5, -30, -30, "palm"),
        ("W sw-75 tm-8 palm-25/-30", -75, -8, -25, -30, "palm"),
        ("W sw-80 tm-5 palm-20/-25", -80, -5, -20, -25, "palm"),
        ("W sw-70 tm-8 flex+20/+20", -70, -8, 20, 20, "flex"),
        ("W sw-75 tm-5 flex+25/+15", -75, -5, 25, 15, "flex"),
    ]
    for label, sw, tm, tp, td, fold in rows:
        poc.reset_pose(arm)
        pose_fingers(arm, w_curls, w_splay, flex, palm_n)
        pose_thumb(arm, sw, tm, tp, td, palm_n, finger_up, flex, fold_ax=fold)
        score(arm, center, palm_n, across, finger_up, label)

    print("P2_OK")


if __name__ == "__main__":
    main()
