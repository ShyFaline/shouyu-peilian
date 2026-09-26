# 手语学习陪练

浏览器本地跑的国标手指字母陪练：摄像头变成手的几何，几何再变成「像不像、差在哪」。识别在本机完成，默认不上传视频。

字母包覆盖 GF 0021—2019 的 **32 个手指字母**（A–Z 以及 zh / ch / sh / ng / ê / ü）。主路径只练 **A B U V L Y I W**，其余进可折叠图鉴。默认字母是 **U**。

规划总稿：`总体目标与并行拆分.md`。

## 在线试用

https://shyfaline.github.io/shouyu-peilian/

手机或电脑浏览器直接打开，不用装东西。首次加载要下约 17 MB 的识别资源（wasm + 模型），慢一点是正常的，之后就进缓存。

站点只发布 `practice/` 这一个目录，仓库里其它资料不上网。改动 `practice/**` 并推到 `main` 后，`.github/workflows/pages.yml` 会自动重新发布，大约一到两分钟生效。

浏览器只允许在**安全上下文**里开摄像头：`127.0.0.1`、`localhost` 或 `https://`。线上是 https，可以直接用；局域网内用 `http://192.168.x.x` 打开则读不到摄像头。

## 状态机

`practiceStatus` 只来自 `practice/content/letters.json`，运行时不准升格。本轮没有任何字母是 `accepted_practice`。

| 状态 | 判定 |
|---|---|
| `pending_review` | `decision` 不得为 pass。界面写「暂不判定」。开页 U 不能绿灯。 |
| `demo_only` | 不得 pass。界面写「仅示范」。 |
| `pose_practice` | 质量 ok 且几何通过且连续停稳后可以 pass。文案只写「姿态接近，停稳」。不得写「字母已掌握 / 完整 J、Z 已会」。 |
| 质量失败 | `undetermined`，文案「暂时无法判断」，不用「伸直 / 收起来」类动作 hint。 |
| 无目标 / 空规则 / 未知规则字段 / 状态不允许判定 | `blocked` |

J / Z 只核静态手型。示范优先读 `practice/content/demos/{字母ID}_front.png`；没有图时回退 SignPinyin 字体（字体不是识别模型）。

## 本地运行

需要桌面 Chrome。在本目录开静态服务（不要用 `file://`）：

```bash
python -m http.server 8765
```

打开：http://127.0.0.1:8765/practice/index.html

点「打开摄像头」，先比 U（未核定，不会绿灯），再切 V。可点「停止摄像头」：`getTracks().stop()`，`video.srcObject = null`，清循环状态，允许再开。模型文件已放在 `practice/models` 与 `practice/vendor`，断网后刷新仍应能加载。来源页：http://127.0.0.1:8765/practice/sources.html

镜像时视频和 canvas 一起翻（`.stage-media`），左下角判定文字不翻。视频与 canvas 同一盒、`object-fit: contain`。

## 测试

几何与编排是纯函数，不依赖摄像头（本机有 bun 或 Node 即可）：

```bash
bun practice/src/evaluate.test.js
```

或：

```bash
node practice/src/evaluate.test.js
node --experimental-vm-modules practice/src/reliability.test.js
```

第二条需要支持 `vm.SourceTextModule` 的 Node（本轮使用 Node 22.22.2），执行真实 app/core，只模拟 DOM、媒体、RAF、时钟和 vendor 边界。不安装依赖。原源码匹配用例标为结构检查，不等于行为验证；VM 测试也不是真实浏览器或真人实验，不报准确率。

`fixtures` 测试枚举实际 JSON，检查 schema v2 并调用共享核心；0 个时明确打印“真人未执行”。无独立标签不算准确性。`evaluate` 仅单帧几何，`judge` 增加质量/内容与连续帧门；离线合同见 `practice/src/types.js`。旧文件缺有限正尺寸拒绝回放，不猜尺寸。

`practice/src/fixtures/` 当前为空，不是真人数据。有 JSON 但无独立核对标注时，不得把 `evaluate.pass` / `decision` 当通过。禁止伪造真人 fixtures。

```
bun practice/src/eval-handframe.mjs <json路径> <字母ID>
读 HandFrame JSON，从 letters.json 取字母，调用 evaluate。
打印 geometry_pass 与 issues[].code / hint。缺手或缺字母时 geometry_pass=false。
缺 imageWidth / imageHeight（须 >0）时不调用 evaluate，geometry_pass=false，打印 missing_size，不猜尺寸。
不把文件里的 expectedVerdict / pass / decision 当标签。
```

S1.5 渲染图闭环（不是真人，不是 S2）。对主路径 8 张 `practice/content/demos/GF0021.*_front.png` 跑 Hand Landmarker IMAGE 模式。有手写出 `practice/src/render-loop/out/<id>.json`，再调用上面的 eval。无手或检测失败记 `no_hand`，不编 landmarks。不写 `fixtures/`。阈值与 `practice/src/evaluate.js` 相同。汇总：`practice/src/render-loop/RESULTS.md`。渲染图，不是真人。不报准确率。

```bash
python practice/src/render-loop/run.py
```

## 导出当前手 JSON

练习页摄像头下方工具栏，「导出当前手 JSON（本机下载，不上传）」**默认关闭**。勾选后点「下载 JSON」，浏览器只在本机保存一帧 schema v2。无手 / 多手 / 质量无效 / 过期 / 切目标后不得下载旧快照。缺 `imageWidth` / `imageHeight` 不得猜 1×1。

允许字段：`schemaVersion`, `capturedAt`, `frameId`, `imageWidth`, `imageHeight`, `coordSpace`, `mirrored`, `targetLetterId`, `sourceType`, `codeVersion`, `rulesVersion`, `handedness`, `landmarks`。

`targetLetterId` 是当时选中目标，不是正确答案。禁止 `expectedVerdict` / `pass` / `decision` / `practiceStatus` 当标签。

```json
{
  "schemaVersion": 2,
  "capturedAt": 0,
  "frameId": 0,
  "imageWidth": 640,
  "imageHeight": 480,
  "coordSpace": "image_normalized",
  "mirrored": true,
  "targetLetterId": "GF0021.U",
  "sourceType": "camera",
  "codeVersion": "sha256:<启动时实际源码清单组合哈希>",
  "rulesVersion": "sha256:<规则源码与letters组合哈希>",
  "handedness": { "category": "Right" },
  "landmarks": [{ "x": 0, "y": 0, "z": 0 }]
}
```

上例为字段示意（非可回放样本）；`landmarks` 必须有 21 个有限点。`capturedAt` 是检测开始时的 epoch 毫秒，`frameId` 为非负安全整数；`mirrored` 仅指显示镜像，JSON 点不翻转。视频和 JSON 都不上传。

下载入口独立检查 epoch 帧龄及单调时钟/活动流门，不依赖后台 RAF：年龄 0–400ms 可用，>400ms 或时间回退拒绝。重复视频帧不累计；失效后需重新累计 6 个新有效帧，6 帧不是持续 400ms，两参数仍为 UNVERIFIED。隐藏/恢复、mute、异常、切目标和停止会清掉旧成功、快照与骨架。

启动会读取 `practice/src/versions.js` 清单中的实际核心源码与同一次加载的 letters 原文，记录逐文件 SHA-256 manifest 到控制台 `practice version manifest`；组合得到导出的两个版本，不使用 HEAD 或标准编号代替。哈希 helper 自身明确排除，schema 仍为 v2。采集期间冻结服务目录，修改代码后刷新并保存新 manifest；加载源码/哈希失败不启动。浏览器、实机摄像头及真人验证需另做。

## 目录

| 路径 | 说明 |
|---|---|
| `practice/` | 可运行的初版 |
| `practice/src/evaluate.js` | 几何与 `evaluate()` 纯函数 |
| `practice/src/judge.js` | 编排：质量门 + 状态 + 连续保持 |
| `practice/src/evaluate.test.js` | 几何夹具 + A01–A09 |
| `practice/src/fixtures/` | 导出的 HandFrame JSON（当前空） |
| `practice/src/render-loop/` | S1.5：渲染 PNG → Hand Landmarker → evaluate。结果在 `RESULTS.md` 与 `out/`。不是真人。 |
| `practice/content/demos/` | 标准手 PNG，文件名 `{id}_front.png` |
| `practice/sources.html` | 来源与许可 |
| `技术栈前期规划.md` | 技术选型 |
| `手语陪练-项目日志与框架.md` | 产品框架与日志 |

感知：MediaPipe Hand Landmarker（Apache-2.0）。示范字形：SignPinyin（SIL OFL 1.1），字体不是识别模型。内容对齐 GF 0021—2019。

## Contributors

- [ShyFaline](https://github.com/ShyFaline)
- [lingr25](https://github.com/lingr25)
