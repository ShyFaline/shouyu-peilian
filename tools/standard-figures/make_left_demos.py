"""从右手示范图镜像生成左手版（GF0021-2019 §5.1：用左手表示时方向作相应改变，即整体镜像）。

输入（右手正本，由 Blender 管线产出）：
  practice/content/demos/{letterId}_front.png
  practice/content/demos/rot/{letterId}/{NN}.webp
  practice/content/demos/rot/index.json

输出（左手镜像，不覆盖右手文件）：
  practice/content/demos/{letterId}_front_L.png
  practice/content/demos/rot-left/{letterId}/{NN}.webp
  practice/content/demos/rot-left/index.json（frames 数与右手索引一致）

旋转帧约定：右手帧号增大 = 观者看到手模左侧（向右拖动）。水平镜像后
帧号增大 = 观者看到左手右侧，因此左手版拖动方向与右手相反，属预期。

用法：python tools/standard-figures/make_left_demos.py
"""

import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent.parent
DEMOS = ROOT / "practice" / "content" / "demos"
ROT = DEMOS / "rot"
ROT_LEFT = DEMOS / "rot-left"


def main() -> int:
    index_path = ROT / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    letters = index.get("letters", {})

    front_ok, rot_ok, missing = 0, 0, []
    for letter_id in sorted(letters):
        front = DEMOS / f"{letter_id}_front.png"
        if not front.exists():
            missing.append(str(front.relative_to(ROOT)))
            continue
        out = DEMOS / f"{letter_id}_front_L.png"
        with Image.open(front) as im:
            im.transpose(Image.FLIP_LEFT_RIGHT).save(out)
        front_ok += 1

        src_dir = ROT / letter_id
        dst_dir = ROT_LEFT / letter_id
        dst_dir.mkdir(parents=True, exist_ok=True)
        for src in sorted(src_dir.glob("*.webp")):
            with Image.open(src) as im:
                im.transpose(Image.FLIP_LEFT_RIGHT).save(
                    dst_dir / src.name, format="WEBP", lossless=True
                )
            rot_ok += 1

    left_index = {
        "id": "practice-content-demos-rot-left",
        "updated": index.get("updated"),
        "purpose": "练习页左手示范拖动旋转帧索引。由右手帧水平镜像生成（规范 5.1），帧文件在 ./GF0021.{X}/NN.webp。",
        "frameConvention": "00 帧 = 正面机位；帧号增大 = 观者看到手模右侧（左手拖动方向与右手相反，属镜像预期）",
        "generator": "tools/standard-figures/make_left_demos.py",
        "source": "practice/content/demos/rot/",
        "frames": index.get("frames"),
        "letters": letters,
    }
    (ROT_LEFT / "index.json").write_text(
        json.dumps(left_index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    if missing:
        print("缺少右手源文件：", *missing, sep="\n  ", file=sys.stderr)
        return 1
    print(f"正面图 {front_ok} 个字母，旋转帧 {rot_ok} 张，索引 {len(letters)} 个字母")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
