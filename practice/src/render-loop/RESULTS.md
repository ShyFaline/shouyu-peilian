渲染图，不是真人。不报准确率。

模型：practice/models/hand_landmarker.task
模式：IMAGE
阈值：与 practice/app.js 相同（numHands=2, minHandDetectionConfidence=0.6, minHandPresenceConfidence=0.5, minTrackingConfidence=0.5）
JSON：practice/src/render-loop/out/<id>.json（有手才写；不写 fixtures/）

| 字母 | 手数 | pass | issue codes |
|---|---|---|---|
| GF0021.A | 1 | true | — |
| GF0021.B | 0 | false | no_hand |
| GF0021.U | 0 | false | no_hand |
| GF0021.V | 0 | false | no_hand |
| GF0021.L | 0 | false | no_hand |
| GF0021.Y | 0 | false | no_hand |
| GF0021.I | 1 | false | pinky.not_extended,thumb.not_curled |
| GF0021.W | 0 | false | no_hand |
