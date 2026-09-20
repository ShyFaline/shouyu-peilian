# 手语学习陪练

浏览器本地跑的国标手指字母陪练：摄像头变成手的几何，几何再变成「像不像、差在哪」。识别在本机完成，默认不上传视频。

字母包覆盖 GF 0021—2019 的 **32 个手指字母**（A–Z 以及 zh / ch / sh / ng / ê / ü）。主路径只练 **A B U V L Y I W**，其余进可折叠图鉴。反馈只有「到位 / 还不到位」和一句提示，不显示分数。J、Z 带轨迹，第一期只核静态手型。示范优先读 `practice/content/demos/{字母ID}_front.png`；没有图时回退 SignPinyin 字体（字体不是识别模型）。

规划总稿：`总体目标与并行拆分.md`。

## 本地运行

需要桌面 Chrome。在本目录开静态服务（不要用 `file://`）：

```bash
python -m http.server 8765
```

打开：http://127.0.0.1:8765/practice/index.html

点「打开摄像头」，先比 U，再切 V。模型文件已放在 `practice/models` 与 `practice/vendor`，断网后刷新仍应能加载。来源页：http://127.0.0.1:8765/practice/sources.html

## 测试

几何判定是纯函数，不依赖摄像头（本机有 bun 或 Node 即可）：

```bash
bun practice/src/evaluate.test.js
```

或：

```bash
node practice/src/evaluate.test.js
```

12 passed（含 fixtures 空目录用例）。夹具：U 并拢通过；V 并拢失败并提示分开；缺手不得到位；V 分开通过；U 分开失败并提示并拢；主路径 A B L Y I W 各一条正例。不是真人实验，不报准确率。

`practice/src/fixtures/` 当前为空，不是真人数据。放入导出的 HandFrame JSON（`t`、`handedness`、`landmarks` 长度 21、`conf`）后，同一条测试命令会读取并调用 `evaluate()`。

```
bun practice/src/eval-handframe.mjs <json路径> <字母ID>
读 HandFrame JSON，从 letters.json 取字母，调用 evaluate。
打印 pass 与 issues[].code / hint。缺手或缺字母时 pass=false。
```

## 导出当前手 JSON

练习页摄像头下方工具栏，「导出当前手 JSON（本机下载，不上传）」**默认关闭**。勾选后点「下载 JSON」，浏览器只在本机保存一帧 HandFrame：

```json
{ "t": 0, "handedness": "Right", "landmarks": [{ "x": 0, "y": 0, "z": 0 }], "conf": 0.9 }
```

`landmarks` 长度 21。视频和 JSON 都不上传。明天真人试时把下载文件放进 `practice/src/fixtures/`，即可当夹具喂给 `evaluate()`。

## 目录

| 路径 | 说明 |
|---|---|
| `practice/` | 可运行的初版 |
| `practice/src/evaluate.js` | 几何与 `evaluate()` 纯函数 |
| `practice/src/evaluate.test.js` | U / V / 缺手 + A B L Y I W 正例夹具 |
| `practice/src/fixtures/` | 真人试导出的 HandFrame JSON |
| `practice/content/demos/` | 标准手 PNG，文件名 `{id}_front.png` |
| `practice/sources.html` | 来源与许可 |
| `技术栈前期规划.md` | 技术选型 |
| `手语陪练-项目日志与框架.md` | 产品框架与日志 |

感知：MediaPipe Hand Landmarker（Apache-2.0）。示范字形：SignPinyin（SIL OFL 1.1），字体不是识别模型。内容对齐 GF 0021—2019。

## Contributors

- [ShyFaline](https://github.com/ShyFaline)
- [lingr25](https://github.com/lingr25)
