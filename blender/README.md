# GF 0021 标准手（Blender 内容工厂）

示范图只给练习页对照，**不进识别循环**。  
Blender：`C:\Program Files\Blender Foundation\Blender 4.5\blender.exe`（4.5.10 LTS）

## 1. 打开

```bat
"C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" "C:\Users\15424\Desktop\2026.9.15\blender\hand_gf0021.blend"
```

时间轴标记：`REST`、`GF0021.A` / `B` / `U` / `V` / `L` / `Y` / `I` / `W`。  
选中 `HandRig`，进入 Pose Mode。姿态按 GF 0021—2019，不要摆成 ASL。  
改网格、打光、拇指贴掌用 `blender\improve_mesh.py`（`-b` 打开现有 `.blend` 再 `-P`）。不改 U/V 开合。不要跑 `build_gf0021.py` 推倒 HandRig。

## 2. 摆手

跳到对应标记那一帧，对照国标图微调，再插入关键帧（插值是 Constant）。

只重建绑定和草稿姿态（会覆盖手动角度）：

```bat
cd /d C:\Users\15424\Desktop\2026.9.15
"C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" -b -P blender\build_gf0021.py
```

## 3. 渲染

```bat
cd /d C:\Users\15424\Desktop\2026.9.15
"C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" -b blender\hand_gf0021.blend -P blender\render_gf0021.py
```

输出必须带 `_front`：

```
practice/content/demos/GF0021.A_front.png
practice/content/demos/GF0021.B_front.png
practice/content/demos/GF0021.U_front.png
practice/content/demos/GF0021.V_front.png
practice/content/demos/GF0021.L_front.png
practice/content/demos/GF0021.Y_front.png
practice/content/demos/GF0021.I_front.png
practice/content/demos/GF0021.W_front.png
```
