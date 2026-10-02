# 示范图约定

练习页示范区**优先**读本目录的 PNG，缺图时回退 `practice/fonts` 里的 SignPinyin 字体，不空白、不弹错。

右手是正本（规范 GF0021-2019 §5.1）；左手版由右手图水平镜像生成，文件名加 `_L` 后缀，旋转帧在 `rot-left/`。左手重出图：改完右手图后跑 `python tools/standard-figures/make_left_demos.py`。

## 文件名

```
{字母ID}_front.png      # 右手正本
{字母ID}_front_L.png    # 左手镜像（由脚本生成，勿手改）
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

- **是** 按 GF 0021—2019 摆好的标准手渲染图，给学习者对照。
- **不是** 识别模型，不进入 MediaPipe，不参与 `evaluate()`。
- SignPinyin 只是缺图时的字形回退，**也不是**识别模型。

逐张网格、许可、接入日期与目检结论见同目录 `manifest.json`。2026-10-01 起全部 32 字母用 Godot XR（CC0）新手模按新姿态表重渲（`blender/build_godot_hand_poc.py`），旧 Human Base Meshes 图全部退役。

渲染脚本应能用 `blender -b` 复现；姿态名与 `GF0021.*` 对齐。
