"""B 站公开手指字母教学片：本机抽帧 → Hand Landmarker → evaluate。

不是真人实验。不是开源数据。不报准确率。
视频只进 gitignore 的 tmp-media/，不入库。
阈值与 practice/app.js createLandmarker 相同，禁止改。
不改 letters.json rules。字母未标注时不对 32 个乱报，只记有手/无手并对 U、V 各评一次。
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python.core.base_options import BaseOptions
from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions, RunningMode

HERE = Path(__file__).resolve().parent
SRC = HERE.parent
PRACTICE = SRC.parent
ROOT = PRACTICE.parent
TMP = ROOT / "tmp-media"
OUT_DIR = HERE / "out"
MODEL = PRACTICE / "models/hand_landmarker.task"
EVAL_JS = HERE / "eval-frames.mjs"
RESULTS = HERE / "RESULTS.md"

# 与 practice/app.js createLandmarker 相同。禁止改。
NUM_HANDS = 2
MIN_HAND_DETECTION_CONFIDENCE = 0.6
MIN_HAND_PRESENCE_CONFIDENCE = 0.5
MIN_TRACKING_CONFIDENCE = 0.5

INTERVAL_S = 2.0
MAX_FRAMES = 90

CANDIDATES = [
    {
        "bvid": "BV1Xe4y1G794",
        "url": "https://www.bilibili.com/video/BV1Xe4y1G794",
        "title": "汉语手指字母教学",
    },
    {
        "bvid": "BV1Khd6YgEDd",
        "url": "https://www.bilibili.com/video/BV1Khd6YgEDd",
        "title": "手语课堂，十一课，手指字母",
    },
    {
        "bvid": "BV1B64y1M7az",
        "url": "https://www.bilibili.com/video/BV1B64y1M7az",
        "title": "手指语学习",
    },
    {
        "bvid": "BV1psRUYpEs7",
        "url": "https://www.bilibili.com/video/BV1psRUYpEs7",
        "title": "手语基础 汉语手指字母",
    },
]


def find_bun() -> str:
    found = shutil.which("bun")
    if found:
        return found
    home = Path.home()
    for candidate in (home / ".bun/bin/bun.exe", home / ".bun/bin/bun"):
        if candidate.exists():
            return str(candidate)
    raise FileNotFoundError("未找到 bun")


def find_existing(bvid: str) -> Path | None:
    for path in sorted(TMP.glob(f"{bvid}.*")):
        if path.suffix.lower() in {".mp4", ".flv", ".mkv", ".webm", ".mov"}:
            return path
    return None


def download(item: dict) -> tuple[str, Path | None, str]:
    """返回 (status, path, note)。status 为 ok 或 fail。失败不改用 ASL。"""
    TMP.mkdir(parents=True, exist_ok=True)
    existing = find_existing(item["bvid"])
    if existing and existing.stat().st_size > 0:
        return "ok", existing, "already"

    outtmpl = str(TMP / f"{item['bvid']}.%(ext)s")
    cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--no-playlist",
        "--no-mtime",
        "--retries",
        "3",
        "-f",
        "bv*[ext=mp4]/bv*",
        "-o",
        outtmpl,
        item["url"],
    ]
    proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, check=False)
    existing = find_existing(item["bvid"])
    if proc.returncode == 0 and existing and existing.stat().st_size > 0:
        return "ok", existing, "downloaded"
    err = (proc.stderr or proc.stdout or "yt-dlp fail").strip().splitlines()
    tail = err[-1] if err else "yt-dlp fail"
    return "fail", None, tail[:240]


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
    if best_i >= len(hands):
        best_i = 0
    lm = hands[best_i]
    if len(lm) < 21:
        return n, None
    name, conf = handedness_of(result.handedness[best_i] if result.handedness else None)
    frame = {
        "handedness": name,
        "landmarks": [{"x": float(p.x), "y": float(p.y), "z": float(p.z or 0.0)} for p in lm[:21]],
        "conf": conf,
    }
    return n, frame


def bgr_to_mp_image(bgr: np.ndarray) -> mp.Image:
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    arr = np.ascontiguousarray(rgb, dtype=np.uint8)
    return mp.Image(image_format=mp.ImageFormat.SRGB, data=arr)


def sample_frames(video_path: Path, detector: HandLandmarker) -> list[dict]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        cap.release()
        raise RuntimeError(f"打不开视频：{video_path}")
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0) or 25.0
    step = max(1, int(round(fps * INTERVAL_S)))
    frames: list[dict] = []
    idx = 0
    try:
        while len(frames) < MAX_FRAMES:
            if idx % step != 0:
                ok = cap.grab()
                if not ok:
                    break
                idx += 1
                continue
            ok, bgr = cap.read()
            if not ok:
                break
            t = idx / fps
            row: dict = {
                "t": round(float(t), 3),
                "hand_count": 0,
            }
            try:
                image = bgr_to_mp_image(bgr)
                result = detector.detect(image)
                n, hand = pick_hand(result)
            except Exception:
                n, hand = 0, None
            row["hand_count"] = int(n)
            if hand is None:
                row["handedness"] = ""
                row["conf"] = 0.0
            else:
                row["handedness"] = hand["handedness"]
                row["conf"] = hand["conf"]
                row["landmarks"] = hand["landmarks"]
            frames.append(row)
            idx += 1
    finally:
        cap.release()
    return frames


def eval_video_json(bun: str, json_path: Path) -> None:
    proc = subprocess.run(
        [bun, str(EVAL_JS), str(json_path), str(json_path)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"eval-frames 失败 {json_path.name}: {proc.stderr or proc.stdout}")


def summarize(payload: dict) -> dict:
    frames = payload.get("frames") or []
    has_hand = 0
    no_hand = 0
    u_pass = 0
    v_pass = 0
    only_u = 0
    only_v = 0
    both = 0
    for frame in frames:
        if int(frame.get("hand_count") or 0) >= 1 and frame.get("landmarks"):
            has_hand += 1
            u = bool(frame.get("u_pass"))
            v = bool(frame.get("v_pass"))
            if u:
                u_pass += 1
            if v:
                v_pass += 1
            if u and v:
                both += 1
            elif u:
                only_u += 1
            elif v:
                only_v += 1
        else:
            no_hand += 1
    return {
        "sampled": len(frames),
        "has_hand": has_hand,
        "no_hand": no_hand,
        "u_pass": u_pass,
        "v_pass": v_pass,
        "only_u": only_u,
        "only_v": only_v,
        "both": both,
    }


def write_results(rows: list[dict]) -> None:
    lines = [
        "不是真人实验。不是开源数据。不报准确率。",
        "",
        "许可：B 站公开教学片，仅本机抽检，不当开源数据集，不转载进仓库。视频在 gitignore 的 tmp-media/，未 git add。",
        "模型：practice/models/hand_landmarker.task",
        "模式：IMAGE",
        "阈值：与 practice/app.js 相同（numHands=2, minHandDetectionConfidence=0.6, minHandPresenceConfidence=0.5, minTrackingConfidence=0.5）",
        f"抽帧：每 {INTERVAL_S:g} 秒 1 帧，每片最多 {MAX_FRAMES} 帧。帧图不保存。",
        "JSON：practice/src/bili-loop/out/<bvid>.json（帧级；不写 fixtures/）",
        "",
        "字母：四条标题/文件名均无法对应 GF0021.* ID。字母未标注，U/V 只是对照规则不是标签。不对 32 个字母乱报。主路径 A B U V L Y I W 无可用字幕锚点，故不按字母评。",
        "",
        "规则冲突（只记录，不改 letters.json / 不改 evaluate 阈值）：本仓库 GF0021.U 是食指中指并拢伸直、其余收起；有的国标讲解把 U 画成四指并拢。本抽检仍用现有 rules。",
        "",
        "| bvid | 下载 | 抽帧 | 有手 | 无手 | U pass 帧 | V pass 帧 | 仅 U | 仅 V | 同时 pass |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for row in rows:
        if row["download"] != "ok":
            lines.append(
                f"| {row['bvid']} | fail | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |"
            )
            continue
        s = row["summary"]
        lines.append(
            f"| {row['bvid']} | ok | {s['sampled']} | {s['has_hand']} | {s['no_hand']} "
            f"| {s['u_pass']} | {s['v_pass']} | {s['only_u']} | {s['only_v']} | {s['both']} |"
        )
    lines.append("")
    for row in rows:
        lines.append(f"## {row['bvid']}")
        lines.append("")
        lines.append(f"- 来源：{row['url']}")
        lines.append(f"- 标题：{row['title']}")
        lines.append(f"- 下载：{row['download']}")
        if row["download"] != "ok":
            lines.append(f"- 失败原因：{row['note']}")
            lines.append("- 未改用 ASL 顶替。")
            lines.append("")
            continue
        s = row["summary"]
        lines.append(f"- 本机文件：tmp-media/{row['file_name']}（gitignore，未入库）")
        lines.append(f"- 抽帧：{s['sampled']}（间隔 {INTERVAL_S:g}s，上限 {MAX_FRAMES}）")
        lines.append(f"- 有手帧：{s['has_hand']}")
        lines.append(f"- 无手帧：{s['no_hand']}")
        lines.append(f"- U 规则 pass 帧：{s['u_pass']}（对照规则，不是标签）")
        lines.append(f"- V 规则 pass 帧：{s['v_pass']}（对照规则，不是标签）")
        lines.append(f"- 仅 U pass：{s['only_u']}；仅 V pass：{s['only_v']}；同时 pass：{s['both']}")
        lines.append("- 字母未标注，U/V 只是对照规则不是标签。")
        lines.append(f"- 帧级 JSON：practice/src/bili-loop/out/{row['bvid']}.json")
        lines.append("")
    RESULTS.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    if not MODEL.exists():
        print(f"缺少模型：{MODEL}", file=sys.stderr)
        return 1
    bun = find_bun()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

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

    for item in CANDIDATES:
        bvid = item["bvid"]
        json_path = OUT_DIR / f"{bvid}.json"
        status, path, note = download(item)
        print(f"{bvid} download={status} {note}")
        payload = {
            "bvid": bvid,
            "url": item["url"],
            "title": item["title"],
            "download": status,
            "letter_labeled": False,
            "note": "字母未标注，U/V 只是对照规则不是标签",
            "interval_s": INTERVAL_S,
            "max_frames": MAX_FRAMES,
            "model": "practice/models/hand_landmarker.task",
            "running_mode": "IMAGE",
            "thresholds": {
                "numHands": NUM_HANDS,
                "minHandDetectionConfidence": MIN_HAND_DETECTION_CONFIDENCE,
                "minHandPresenceConfidence": MIN_HAND_PRESENCE_CONFIDENCE,
                "minTrackingConfidence": MIN_TRACKING_CONFIDENCE,
            },
            "frames": [],
        }
        row = {
            "bvid": bvid,
            "url": item["url"],
            "title": item["title"],
            "download": status,
            "note": note,
            "file_name": path.name if path else "",
            "summary": {
                "sampled": 0,
                "has_hand": 0,
                "no_hand": 0,
                "u_pass": 0,
                "v_pass": 0,
                "only_u": 0,
                "only_v": 0,
                "both": 0,
            },
        }
        if status != "ok" or path is None:
            json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            rows.append(row)
            continue
        payload["file_name"] = path.name
        try:
            payload["frames"] = sample_frames(path, detector)
        except Exception as exc:
            payload["download"] = "ok"
            payload["detect_error"] = str(exc)
            json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"{bvid} detect fail: {exc}")
            rows.append(row)
            continue
        json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        eval_video_json(bun, json_path)
        judged = json.loads(json_path.read_text(encoding="utf-8"))
        row["summary"] = summarize(judged)
        rows.append(row)
        s = row["summary"]
        print(
            f"{bvid} sampled={s['sampled']} has_hand={s['has_hand']} no_hand={s['no_hand']} "
            f"u_pass={s['u_pass']} v_pass={s['v_pass']}"
        )

    write_results(rows)
    print(f"wrote {RESULTS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
