渲染图，不是真人。不报准确率。

模型：practice/models/hand_landmarker.task
模式：IMAGE
阈值：与 practice/app.js 相同（numHands=2, minHandDetectionConfidence=0.6, minHandPresenceConfidence=0.5, minTrackingConfidence=0.5）
JSON：practice/src/render-loop/out/<id>.json（有手才写；不写 fixtures/）

| 字母 | 手数 | 已评估 | 几何 pass | 不可评估原因 | issue codes |
|---|---|---|---|---|---|

「已评估」= 尺寸可追溯且核心真的算完。`几何 pass` 只在已评估时有意义；
不可评估的行**不是动作负例**，不得计入任何通过率分子分母。
| GF0021.A | 0 | **否** | n/a | no_hand | no_hand |
| GF0021.B | 0 | **否** | n/a | no_hand | no_hand |
| GF0021.U | 0 | **否** | n/a | no_hand | no_hand |
| GF0021.V | 1 | 是 | false | — | thumb.not_curled,pinky.not_curled,pointing.up |
| GF0021.L | 0 | **否** | n/a | no_hand | no_hand |
| GF0021.Y | 1 | 是 | true | — | — |
| GF0021.I | 0 | **否** | n/a | no_hand | no_hand |
| GF0021.W | 0 | **否** | n/a | no_hand | no_hand |
