"""合成三联评审图：规范插图 | 正面渲染 | 侧面渲染。

输入：
  docs/standards/letters/{ID}.png                     （crop_figures.py 产出，规范参考）
  blender/vendor/godot-xr-hands/poc/GF0021.{ID}_front.png  （build_godot_hand_poc.py -- letters 产出）
  blender/vendor/godot-xr-hands/poc/GF0021.{ID}_side.png
输出：docs/standards/review/GF0021.{ID}_triptych.png

侧面视角必须保留：HBM 管线的支点类回归（面条爪/幽灵手指）全是正面看着正常、侧面露馅。
三联图是人工对图签字（docs/内容核定表.md C 节）的评审附件，本身不构成通过证明。
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
REFS = ROOT / "docs" / "standards" / "letters"
POC = ROOT / "blender" / "vendor" / "godot-xr-hands" / "poc"
OUT = ROOT / "docs" / "standards" / "review"

CELL = 512
LABEL_H = 36

# 当前 PoC 角度表覆盖的字母；扩充角度表后在此追加
LETTERS = ["A", "B", "I", "L", "U", "V", "W", "Y"]


def fit(img, size):
    thumb = img.copy()
    thumb.thumbnail((size, size))
    cell = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    cell.paste(thumb, ((size - thumb.width) // 2, (size - thumb.height) // 2), thumb if thumb.mode == "RGBA" else None)
    return cell


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    problems = []
    made = 0
    for letter in LETTERS:
        ref_path = REFS / f"{letter}.png"
        front_path = POC / f"GF0021.{letter}_front.png"
        side_path = POC / f"GF0021.{letter}_side.png"
        missing = [str(p.relative_to(ROOT)) for p in (ref_path, front_path, side_path) if not p.exists()]
        if missing:
            problems.append(f"{letter}: 缺 {missing}")
            continue
        ref = Image.open(ref_path).convert("RGBA")
        front = Image.open(front_path).convert("RGBA")
        side = Image.open(side_path).convert("RGBA")
        w = CELL * 3
        h = CELL + LABEL_H
        sheet = Image.new("RGBA", (w, h), (255, 255, 255, 255))
        draw = ImageDraw.Draw(sheet)
        for i, (label, img) in enumerate([("REF", ref), ("FRONT", front), ("SIDE", side)]):
            sheet.paste(fit(img, CELL), (i * CELL, LABEL_H))
            draw.text((i * CELL + 10, 10), f"GF0021.{letter}  {label}", fill=(0, 0, 0, 255))
            draw.rectangle([i * CELL, LABEL_H, (i + 1) * CELL - 1, h - 1], outline=(160, 160, 160, 255))
        out_path = OUT / f"GF0021.{letter}_triptych.png"
        sheet.convert("RGB").save(out_path)
        made += 1
        print("WROTE", out_path.relative_to(ROOT))
    for p in problems:
        print("WARNING:", p)
    print(f"{made}/{len(LETTERS)} 张三联图")
    if problems:
        sys.exit(1)


if __name__ == "__main__":
    main()
