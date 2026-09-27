import os
import json
from PIL import Image, ImageFont, ImageDraw

FONT_PATH = 'practice/fonts/SignPinyin-Regular-0.6.ttf'
OUT_DIR = 'practice/content/demos/font-reference-candidates'
os.makedirs(OUT_DIR, exist_ok=True)

# Targets with clear character mapping in SignPinyin-Regular-0.6.ttf:
TARGETS = [
    # Main path targets
    ('GF0021.A', 'a', 'GF0021.A_512.png', 'GF0021.A_256.png', '右手伸拇指，手背向右，四指握拳'),
    ('GF0021.B', 'b', 'GF0021.B_512.png', 'GF0021.B_256.png', '右手四指并拢直立，拇指向掌心弯曲，掌心向前偏左'),
    ('GF0021.V', 'v', 'GF0021.V_512.png', 'GF0021.V_256.png', '右手食中指直立分开成V，拇指搭无名指，掌心向前偏左'),
    ('GF0021.L', 'l', 'GF0021.L_512.png', 'GF0021.L_256.png', '右手拇食指张开成角，食指朝上，其余弯曲，掌心向前偏左'),
    ('GF0021.Y', 'y', 'GF0021.Y_512.png', 'GF0021.Y_256.png', '右手伸拇小指，其余弯曲，掌心向前偏左'),
    ('GF0021.I', 'i', 'GF0021.I_512.png', 'GF0021.I_256.png', '右手小指直立，其余握拳，掌心向前偏左（规范文字OCR疑排查中）'),
    ('GF0021.W', 'w', 'GF0021.W_512.png', 'GF0021.W_256.png', '右手食中无名三指分开直立成W，掌心向前偏左'),
    ('GF0021.U', 'u', 'GF0021.U_512.png', 'GF0021.U_256.png', '食中并拢直立手型（二指/四指规范争议单列中）'),
    # Secondary targets
    ('GF0021.C', 'c', 'GF0021.C_512.png', 'GF0021.C_256.png', '五指弯曲成C形'),
    ('GF0021.D', 'd', 'GF0021.D_512.png', 'GF0021.D_256.png', '食指直立，拇指与中指相抵'),
    ('GF0021.F', 'f', 'GF0021.F_512.png', 'GF0021.F_256.png', '拇指与食指捏合，其余三指伸直'),
    ('GF0021.K', 'k', 'GF0021.K_512.png', 'GF0021.K_256.png', '食中指分开直立，拇指贴中指'),
    ('GF0021.O', 'o', 'GF0021.O_512.png', 'GF0021.O_256.png', '五指弯曲成O形'),
    ('GF0021.CH', 'ĉ', 'GF0021.CH_512.png', 'GF0021.CH_256.png', '字形含规范新手型扁O；注意规范为晃动手型'),
    ('GF0021.SH', 'ŝ', 'GF0021.SH_512.png', 'GF0021.SH_256.png', '字形呈现微曲手型'),
    ('GF0021.NG', 'ŋ', 'GF0021.NG_512.png', 'GF0021.NG_256.png', '小指横伸字形'),
]

def render_glyph(char, size=512, font_path=FONT_PATH, target_box=360):
    f_test = ImageFont.truetype(font_path, 100)
    bb = f_test.getbbox(char)
    bw = bb[2] - bb[0]
    bh = bb[3] - bb[1]
    scale = target_box / max(bw, bh)
    fs = int(100 * scale)
    
    supersample = 4
    s_size = size * supersample
    s_fs = fs * supersample
    s_font = ImageFont.truetype(font_path, s_fs)
    
    img = Image.new('RGB', (s_size, s_size), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    
    s_bb = s_font.getbbox(char)
    s_w = s_bb[2] - s_bb[0]
    s_h = s_bb[3] - s_bb[1]
    
    s_x = (s_size - s_w) / 2.0 - s_bb[0]
    s_y = (s_size - s_h) / 2.0 - s_bb[1]
    
    draw.text((s_x, s_y), char, fill=(0, 0, 0), font=s_font)
    img_final = img.resize((size, size), Image.Resampling.LANCZOS)
    return img_final

for target_id, char, fn512, fn256, desc in TARGETS:
    im512 = render_glyph(char, size=512)
    im256 = im512.resize((256, 256), Image.Resampling.LANCZOS)
    im512.save(os.path.join(OUT_DIR, fn512))
    im256.save(os.path.join(OUT_DIR, fn256))
    print(f'Exported {target_id}: 512px -> {fn512}, 256px -> {fn256}')
