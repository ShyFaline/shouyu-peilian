# 手语学习陪练

浏览器本地跑的国标手指字母陪练：摄像头变成手的几何，几何再变成「像不像、差在哪」。识别在本机完成，默认不上传视频。

字母包覆盖 GF 0021—2019 的 **32 个手指字母**（A–Z 以及 zh / ch / sh / ng / ê / ü）。反馈只有「到位 / 还不到位」和一句提示，不显示分数。J、Z 带轨迹，第一期只核静态手型。

## 本地运行

需要桌面 Chrome。在本目录开静态服务（不要用 `file://`）：

```bash
python -m http.server 8765
```

打开：http://127.0.0.1:8765/practice/index.html

点「打开摄像头」，先比 U，再切 V。模型文件已放在 `practice/models` 与 `practice/vendor`，断网后刷新仍应能加载。

## 目录

| 路径 | 说明 |
|---|---|
| `practice/` | 可运行的初版 |
| `技术栈前期规划.md` | 技术选型 |
| `手语陪练-项目日志与框架.md` | 产品框架与日志 |

感知：MediaPipe Hand Landmarker（Apache-2.0）。示范字形：SignPinyin（SIL OFL 1.1），字体不是识别模型。内容对齐 GF 0021—2019。

## Contributors

- [ShyFaline](https://github.com/ShyFaline)
- [lingr25](https://github.com/lingr25)
