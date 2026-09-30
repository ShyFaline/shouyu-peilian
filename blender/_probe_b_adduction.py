"""Rest MCP→tip palm-plane angles for letter B adduction. Not a candidate generator."""
from __future__ import annotations

import importlib.util
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)

_SPEC = importlib.util.spec_from_file_location(
    "godot_hand_poc", os.path.join(ROOT, "build_godot_hand_poc.py")
)
poc = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(poc)

FINGERS = ("Index", "Middle", "Ring", "Little")


def fmt(v, n=5):
    return [round(float(x), n) for x in v]


def signed_deg(a, b, axis):
    a = a.normalized()
    b = b.normalized()
    n = axis.normalized()
    return math.degrees(math.atan2(n.dot(a.cross(b)), a.dot(b)))


def project_onto_palm(v, palm_n):
    return v - palm_n * v.dot(palm_n)


def finger_rest(arm, finger):
    mcp = arm.matrix_world @ arm.pose.bones[f"{finger}_Proximal_R"].head
    tip = arm.matrix_world @ arm.pose.bones[f"{finger}_Tip_R"].head
    return mcp, tip, tip - mcp


def group_span_across(mesh, group_name, across):
    vg = mesh.vertex_groups.get(group_name)
    if vg is None:
        return None
    idx = vg.index
    coords = []
    for v in mesh.data.vertices:
        for g in v.groups:
            if g.group == idx and g.weight > 0.4:
                coords.append(mesh.matrix_world @ v.co)
                break
    if len(coords) < 4:
        return None
    dots = [p.dot(across) for p in coords]
    return {
        "n": len(coords),
        "min": round(min(dots), 5),
        "max": round(max(dots), 5),
        "span": round(max(dots) - min(dots), 5),
        "mid": round((min(dots) + max(dots)) * 0.5, 5),
    }


def main():
    arm, mesh = poc.import_hand()
    center, palm_n, finger_up = poc.palm_frame(arm)
    across = palm_n.cross(finger_up).normalized()
    print("PALM_N", fmt(palm_n))
    print("UP", fmt(finger_up))
    print("ACROSS_RADIAL", fmt(across))

    rest = {}
    for f in FINGERS:
        mcp, tip, d = finger_rest(arm, f)
        d_palm = project_onto_palm(d, palm_n)
        rest[f] = {
            "mcp": mcp,
            "tip": tip,
            "dir": d,
            "dir_palm": d_palm,
        }
        print(
            "REST",
            f,
            "mcp",
            fmt(mcp),
            "tip",
            fmt(tip),
            "dir",
            fmt(d),
            "dir_palm",
            fmt(d_palm),
            "len",
            round(d.length, 5),
            "palm_len",
            round(d_palm.length, 5),
        )

    mid = rest["Middle"]["dir_palm"]
    print("\n=== ANGLE vs MIDDLE (deg around palm_n; + toward radial/+Z) ===")
    for f in FINGERS:
        deg = signed_deg(mid, rest[f]["dir_palm"], palm_n)
        # rotation that takes finger dir to middle dir:
        to_mid = signed_deg(rest[f]["dir_palm"], mid, palm_n)
        print(f, "from_middle", round(deg, 3), "curl_to_align_proximal", round(to_mid, 3))

    print("\n=== ADJACENT MCP / TIP radial (across) ===")
    for a, b in zip(FINGERS, FINGERS[1:]):
        mcp_d = (rest[a]["mcp"] - rest[b]["mcp"]).length
        tip_d = (rest[a]["tip"] - rest[b]["tip"]).length
        mcp_rad = (rest[a]["mcp"] - rest[b]["mcp"]).dot(across)
        tip_rad = (rest[a]["tip"] - rest[b]["tip"]).dot(across)
        print(
            a,
            b,
            "mcp_dist",
            round(mcp_d, 5),
            "tip_dist",
            round(tip_d, 5),
            "mcp_radial_delta",
            round(mcp_rad, 5),
            "tip_radial_delta",
            round(tip_rad, 5),
        )

    print("\n=== VERTEX GROUP SPAN along across (weight>0.4) ===")
    for f in FINGERS:
        for seg in ("Proximal", "Intermediate", "Distal"):
            name = f"{f}_{seg}_R"
            row = group_span_across(mesh, name, across)
            print(name, row)

    print("\n=== PROXIMAL bone parents ===")
    for f in FINGERS:
        pb = arm.pose.bones[f"{f}_Proximal_R"]
        print(f, "parent", pb.parent.name if pb.parent else None, "length", round(pb.length, 5))


if __name__ == "__main__":
    main()
