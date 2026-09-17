# GF 0021 标准手（Blender 内容工厂）

示范图只给练习页对照，**不进识别循环**。  
Blender：`C:\Program Files\Blender Foundation\Blender 4.5\blender.exe`（4.5.10 LTS）

## 1. 打开

```bat
"C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" "C:\Users\15424\Desktop\2026.9.15\blender\hand_gf0021.blend"
```

时间轴标记：`REST`、`GF0021.A` / `B` / `U` / `V` / `L` / `Y` / `I` / `W`。  
选中 `HandRig`，进入 Pose Mode。

## 2. 摆手

对照 GF 0021—2019 微调当前标记那一帧，再插入关键帧（插值已是 Constant）。  
八个主路径姿态现在都是**可渲染草稿**，必须人眼过一遍国标图。

重建整只手（会覆盖 `.blend` 里手动摆过的角度）：

```bat
cd /d C:\Users\15424\Desktop\2026.9.15
"C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" -b -P blender\build_gf0021.py
```

## 3. 渲染

```bat
cd /d C:\Users\15424\Desktop\2026.9.15
"C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" -b blender\hand_gf0021.blend -P blender\render_gf0021.py
```

输出（必须带 `_front`）：

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
