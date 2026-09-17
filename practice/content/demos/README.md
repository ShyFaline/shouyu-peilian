# 示范图约定

练习页示范区**优先**读本目录的 PNG，缺图时回退 `practice/fonts` 里的 SignPinyin 字体，不空白、不弹错。

## 文件名

```
{字母ID}_front.png
```

例子：

- `GF0021.U_front.png`
- `GF0021.V_front.png`
- `GF0021.A_front.png`

`字母ID` 必须与 `letters.json` 的 `id` 一致，不能叫 `fist1`、`hand_u` 这种私名。

## 视角

| 后缀 | 第一期 |
|---|---|
| `_front` | 必填。掌心可读的正面静图 |
| `_side` 等 | 以后再加，练习页暂不读 |

## 这是什么 / 不是什么

- **是** Blender（或同等）按 GF 0021—2019 摆好的标准手渲染图，给学习者对照。
- **不是** 识别模型，不进入 MediaPipe，不参与 `evaluate()`。
- SignPinyin 只是缺图时的字形回退，**也不是**识别模型。

渲染脚本应能用 `blender -b` 复现；姿态名与 `GF0021.*` 对齐。
