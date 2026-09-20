不是真人实验。不是开源数据。不报准确率。

许可：B 站公开教学片，仅本机抽检，不当开源数据集，不转载进仓库。视频在 gitignore 的 tmp-media/，未 git add。
模型：practice/models/hand_landmarker.task
模式：IMAGE
阈值：与 practice/app.js 相同（numHands=2, minHandDetectionConfidence=0.6, minHandPresenceConfidence=0.5, minTrackingConfidence=0.5）
抽帧：每 2 秒 1 帧，每片最多 90 帧。帧图不保存。
JSON：practice/src/bili-loop/out/<bvid>.json（帧级；不写 fixtures/）

字母：四条标题/文件名均无法对应 GF0021.* ID。字母未标注，U/V 只是对照规则不是标签。不对 32 个字母乱报。主路径 A B U V L Y I W 无可用字幕锚点，故不按字母评。

规则冲突（只记录，不改 letters.json / 不改 evaluate 阈值）：本仓库 GF0021.U 是食指中指并拢伸直、其余收起；有的国标讲解把 U 画成四指并拢。本抽检仍用现有 rules。

| bvid | 下载 | 抽帧 | 有手 | 无手 | U pass 帧 | V pass 帧 | 仅 U | 仅 V | 同时 pass |
|---|---|---|---|---|---|---|---|---|---|
| BV1Xe4y1G794 | ok | 30 | 26 | 4 | 1 | 0 | 1 | 0 | 0 |
| BV1Khd6YgEDd | ok | 90 | 74 | 16 | 5 | 2 | 5 | 2 | 0 |
| BV1B64y1M7az | ok | 90 | 68 | 22 | 1 | 1 | 1 | 1 | 0 |
| BV1psRUYpEs7 | ok | 24 | 23 | 1 | 4 | 0 | 4 | 0 | 0 |

## BV1Xe4y1G794

- 来源：https://www.bilibili.com/video/BV1Xe4y1G794
- 标题：汉语手指字母教学
- 下载：ok
- 本机文件：tmp-media/BV1Xe4y1G794.mp4（gitignore，未入库）
- 抽帧：30（间隔 2s，上限 90）
- 有手帧：26
- 无手帧：4
- U 规则 pass 帧：1（对照规则，不是标签）
- V 规则 pass 帧：0（对照规则，不是标签）
- 仅 U pass：1；仅 V pass：0；同时 pass：0
- 字母未标注，U/V 只是对照规则不是标签。
- 帧级 JSON：practice/src/bili-loop/out/BV1Xe4y1G794.json

## BV1Khd6YgEDd

- 来源：https://www.bilibili.com/video/BV1Khd6YgEDd
- 标题：手语课堂，十一课，手指字母
- 下载：ok
- 本机文件：tmp-media/BV1Khd6YgEDd.mp4（gitignore，未入库）
- 抽帧：90（间隔 2s，上限 90）
- 有手帧：74
- 无手帧：16
- U 规则 pass 帧：5（对照规则，不是标签）
- V 规则 pass 帧：2（对照规则，不是标签）
- 仅 U pass：5；仅 V pass：2；同时 pass：0
- 字母未标注，U/V 只是对照规则不是标签。
- 帧级 JSON：practice/src/bili-loop/out/BV1Khd6YgEDd.json

## BV1B64y1M7az

- 来源：https://www.bilibili.com/video/BV1B64y1M7az
- 标题：手指语学习
- 下载：ok
- 本机文件：tmp-media/BV1B64y1M7az.mp4（gitignore，未入库）
- 抽帧：90（间隔 2s，上限 90）
- 有手帧：68
- 无手帧：22
- U 规则 pass 帧：1（对照规则，不是标签）
- V 规则 pass 帧：1（对照规则，不是标签）
- 仅 U pass：1；仅 V pass：1；同时 pass：0
- 字母未标注，U/V 只是对照规则不是标签。
- 帧级 JSON：practice/src/bili-loop/out/BV1B64y1M7az.json

## BV1psRUYpEs7

- 来源：https://www.bilibili.com/video/BV1psRUYpEs7
- 标题：手语基础 汉语手指字母
- 下载：ok
- 本机文件：tmp-media/BV1psRUYpEs7.mp4（gitignore，未入库）
- 抽帧：24（间隔 2s，上限 90）
- 有手帧：23
- 无手帧：1
- U 规则 pass 帧：4（对照规则，不是标签）
- V 规则 pass 帧：0（对照规则，不是标签）
- 仅 U pass：4；仅 V pass：0；同时 pass：0
- 字母未标注，U/V 只是对照规则不是标签。
- 帧级 JSON：practice/src/bili-loop/out/BV1psRUYpEs7.json
