"""从规范扫描页裁出逐字母参考图。

数据源：docs/standards/pages/p05-p09.png（GF 0021—2019 扫描页，逐字母表格）。
输出：docs/standards/letters/{ID}.png + _contact_sheet.png（全部裁剪结果的拼图，供人工过目）。

行坐标为 2026-09-30 对扫描页量测的程序初值（虚线行分隔 + ASCII 墨水密度核验），
未经人工逐格确认——_contact_sheet.png 就是用来确认"每个文件里装的是不是标题上那个字母"的。
字母顺序依据 docs/GF0021-2019检索记录.md 第 3 节印刷页码映射。
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
PAGES = ROOT / "docs" / "standards" / "pages"
OUT = ROOT / "docs" / "standards" / "letters"

# 裁剪 x 范围：字母标号格 + 指式图格（量测初值，左右留白宁宽勿缺）
CROP_X = (160, 344)
# 行上下内缩：避开行分隔虚线
CROP_PAD_Y = 6

# 每页：行分隔线 y 坐标（量测值）、逐行字母。None = 该行是表头/节标题，跳过。
PAGE_ROWS = [
    # 印刷页 2：4.1 单字母 A-D（表在本页下半）
    {"file": "p05.png", "rules": [982, 1135, 1289, 1442, 1596],
     "letters": ["A", "B", "C", "D"]},
    # 印刷页 3：E-L
    {"file": "p06.png", "rules": [296, 460, 625, 790, 957, 1120, 1287, 1449, 1554],
     "letters": ["E", "F", "G", "H", "I", "J", "K", "L"]},
    # 印刷页 4：M-T
    {"file": "p07.png", "rules": [225, 391, 556, 721, 886, 1051, 1216, 1381, 1547],
     "letters": ["M", "N", "O", "P", "Q", "R", "S", "T"]},
    # 印刷页 5：U-Z + 4.2 ZH；首行为续表表头
    {"file": "p08.png", "rules": [221, 387, 551, 717, 882, 1047, 1212, 1358, 1535],
     "letters": [None, "U", "V", "W", "X", "Y", "Z", "ZH"]},
    # 印刷页 6：CH、SH、NG；4.3  ê、ü（4.4 声调为书空文字，无表行）
    {"file": "p09.png", "rules": [237, 421, 606, 790, 975, 1133, 1344],
     "letters": ["CH", "SH", "NG", None, "EH", "UE"]},
]

EXPECTED_COUNT = 30 + 2  # 26 单字母 + ZH/CH/SH/NG + ê/ü，None 行不计


def ink_fraction(img_arr):
    return float((img_arr < 230).mean())


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    crops = []  # (letter_id, PIL image)
    warnings = []
    for page in PAGE_ROWS:
        im = Image.open(PAGES / page["file"]).convert("L")
        rules = page["rules"]
        rows = list(zip(rules, rules[1:]))
        letters = page["letters"]
        if len(rows) != len(letters):
            warnings.append(f"{page['file']}: 行数 {len(rows)} != 字母数 {len(letters)}")
            continue
        for (y0, y1), letter in zip(rows, letters):
            if letter is None:
                continue
            crop = im.crop((CROP_X[0], y0 + CROP_PAD_Y, CROP_X[1], y1 - CROP_PAD_Y))
            arr = np.array(crop)
            frac = ink_fraction(arr)
            if frac < 0.01:
                warnings.append(f"{letter} ({page['file']} y{y0}-{y1}): 墨水占比 {frac:.3f} 过低，可能裁空")
            crop = crop.convert("RGB")
            crop.save(OUT / f"{letter}.png")
            crops.append((letter, crop, frac))
    if len(crops) != EXPECTED_COUNT:
        warnings.append(f"裁出 {len(crops)} 张，应为 {EXPECTED_COUNT} 张")

    # 拼图：每行 6 张，带字母标号，供人工核对
    cols = 6
    cell_w, cell_h = 260, 260
    rows_n = (len(crops) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell_w, rows_n * cell_h), "white")
    draw = ImageDraw.Draw(sheet)
    for i, (letter, crop, _frac) in enumerate(crops):
        thumb = crop.copy()
        thumb.thumbnail((cell_w - 20, cell_h - 40))
        x = (i % cols) * cell_w
        y = (i // cols) * cell_h
        sheet.paste(thumb, (x + 10, y + 30))
        draw.text((x + 10, y + 8), letter, fill="black")
        draw.rectangle([x, y, x + cell_w - 1, y + cell_h - 1], outline="gray")
    sheet.save(OUT / "_contact_sheet.png")

    print(f"裁出 {len(crops)} 张 -> {OUT}")
    for letter, _crop, frac in crops:
        print(f"  {letter}: ink={frac:.3f}")
    for w in warnings:
        print("WARNING:", w)
    if warnings:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
