# 国标标准手（Blender 内容工厂）

识别不走这里。练习页只吃 `practice/content/demos/<id>_front.png`。

Blender 4.5 不在 PATH 时用全路径：

```
"C:\Program Files\Blender Foundation\Blender 4.5\blender.exe"
```

重建绑定手和姿态草稿：

```
"C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" -b -P blender/build_gf0021.py
```

渲染 8 张正面图：

```
"C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" -b blender/hand_gf0021.blend -P blender/render_gf0021.py
```

姿态名必须是 `GF0021.A` 这类 ID。当前 PNG 是脚本草稿，U/V 还需要人对照国标再摆。不要用 ASL 手模替换。
