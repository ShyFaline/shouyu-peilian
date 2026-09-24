"""S1.5：对主路径 8 张渲染 PNG 跑 Hand Landmarker IMAGE 模式，再 evaluate。

渲染图，不是真人。不报准确率。
阈值与 practice/app.js createLandmarker 相同，禁止改。
有手才写 HandFrame JSON；无手或检测失败记 no_hand，不编 landmarks。
输出：practice/src/render-loop/out/<id>.json 与 RESULTS.md。
不要写入 practice/src/fixtures/。
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import mediapipe as mp
import numpy as np
from mediapipe.tasks.python.core.base_options import BaseOptions
from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions, RunningMode
from PIL import Image

HERE = Path(__file__).resolve().parent
SRC = HERE.parent
PRACTICE = SRC.parent
ROOT = PRACTICE.parent
OUT_DIR = HERE / "out"
DEMOS = PRACTICE / "content/demos"
MODEL = PRACTICE / "models/hand_landmarker.task"
EVAL_JS = SRC / "eval-handframe.mjs"
RESULTS = HERE / "RESULTS.md"

LETTER_IDS = [
    "GF0021.A",
    "GF0021.B",
    "GF0021.U",
    "GF0021.V",
    "GF0021.L",
    "GF0021.Y",
    "GF0021.I",
    "GF0021.W",
]

# 与 practice/app.js createLandmarker 相同。禁止改。
NUM_HANDS = 2
MIN_HAND_DETECTION_CONFIDENCE = 0.6
MIN_HAND_PRESENCE_CONFIDENCE = 0.5
MIN_TRACKING_CONFIDENCE = 0.5


def find_bun() -> str:
    found = shutil.which("bun")
    if found:
        return found
    home = Path.home()
    for candidate in (home / ".bun/bin/bun.exe", home / ".bun/bin/bun"):
        if candidate.exists():
            return str(candidate)
    raise FileNotFoundError("未找到 bun")


def png_to_srgb(path: Path) -> tuple[mp.Image, int, int]:
    rgba = Image.open(path).convert("RGBA")
    width, height = rgba.size
    bg = Image.new("RGB", rgba.size, (0, 0, 0))
    bg.paste(rgba, mask=rgba.split()[-1])
    arr = np.ascontiguousarray(np.array(bg), dtype=np.uint8)
    return mp.Image(image_format=mp.ImageFormat.SRGB, data=arr), width, height


def handedness_of(cats) -> tuple[str, float]:
    cat = cats[0] if cats else None
    name = getattr(cat, "category_name", None) or getattr(cat, "display_name", None) or ""
    score = float(getattr(cat, "score", 0.0) or 0.0)
    if name in ("Left", "Right"):
        return name, score
    return "Unknown", score


def pick_hand(result) -> tuple[int, dict | None]:
    hands = list(result.hand_landmarks or [])
    n = len(hands)
    if n == 0:
        return 0, None
    best_i = 0
    best_score = -1.0
    for i, item in enumerate(result.handedness or []):
        score = float(getattr(item[0], "score", 0.0) or 0.0) if item else 0.0
        if score > best_score:
            best_score = score
            best_i = i
    lm = hands[best_i]
    if len(lm) < 21:
        return n, None
    name, _score = handedness_of(result.handedness[best_i] if result.handedness else None)
    frame = {
        "t": 0,
        "handedness": {"category": name},
        "landmarks": [{"x": float(p.x), "y": float(p.y), "z": float(p.z or 0.0)} for p in lm[:21]],
    }
    return n, frame


def eval_json(bun: str, json_path: Path, letter_id: str) -> tuple[bool, list[str]]:
    proc = subprocess.run(
        [bun, str(EVAL_JS), str(json_path), letter_id],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"eval-handframe 失败 {letter_id}: {proc.stderr or proc.stdout}")
    passed = False
    codes: list[str] = []
    for line in proc.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("geometry_pass "):
            passed = line.split(None, 1)[1].strip() == "true"
            continue
        codes.append(line.split(None, 1)[0])
    return passed, codes


def write_results(rows: list[dict]) -> None:
    lines = [
        "渲染图，不是真人。不报准确率。",
        "",
        "模型：practice/models/hand_landmarker.task",
        "模式：IMAGE",
        "阈值：与 practice/app.js 相同（numHands=2, minHandDetectionConfidence=0.6, minHandPresenceConfidence=0.5, minTrackingConfidence=0.5）",
        "JSON：practice/src/render-loop/out/<id>.json（有手才写；不写 fixtures/）",
        "",
        "| 字母 | 手数 | pass | issue codes |",
        "|---|---|---|---|",
    ]
    for row in rows:
        codes = ",".join(row["issues"]) if row["issues"] else "—"
        lines.append(f"| {row['id']} | {row['hands']} | {str(row['pass']).lower()} | {codes} |")
    lines.append("")
    RESULTS.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    if not MODEL.exists():
        print(f"缺少模型：{MODEL}", file=sys.stderr)
        return 1
    bun = find_bun()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for stale in OUT_DIR.glob("*.json"):
        stale.unlink()

    options = HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(MODEL)),
        running_mode=RunningMode.IMAGE,
        num_hands=NUM_HANDS,
        min_hand_detection_confidence=MIN_HAND_DETECTION_CONFIDENCE,
        min_hand_presence_confidence=MIN_HAND_PRESENCE_CONFIDENCE,
        min_tracking_confidence=MIN_TRACKING_CONFIDENCE,
    )
    detector = HandLandmarker.create_from_options(options)
    rows: list[dict] = []

    for letter_id in LETTER_IDS:
        png = DEMOS / f"{letter_id}_front.png"
        json_path = OUT_DIR / f"{letter_id}.json"
        if not png.exists():
            rows.append({"id": letter_id, "hands": 0, "pass": False, "issues": ["no_hand"]})
            print(f"{letter_id} 缺图")
            continue
        try:
            image, width, height = png_to_srgb(png)
            result = detector.detect(image)
            hands, frame = pick_hand(result)
            if frame is not None:
                frame["imageWidth"] = width
                frame["imageHeight"] = height
        except Exception as exc:
            print(f"{letter_id} 检测失败：{exc}")
            rows.append({"id": letter_id, "hands": 0, "pass": False, "issues": ["no_hand"]})
            continue
        if frame is None:
            rows.append({"id": letter_id, "hands": hands, "pass": False, "issues": ["no_hand"]})
            print(f"{letter_id} hands={hands} pass=false issues=no_hand")
            continue
        json_path.write_text(json.dumps(frame, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        passed, codes = eval_json(bun, json_path, letter_id)
        rows.append({"id": letter_id, "hands": hands, "pass": passed, "issues": codes})
        print(f"{letter_id} hands={hands} pass={str(passed).lower()} issues={','.join(codes) or '—'}")

    write_results(rows)
    print(f"wrote {RESULTS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
