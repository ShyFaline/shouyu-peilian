# 契约差异与可回放性矩阵

日期：2026-09-24。性质：只读盘点，不改核心、不改旧脚本、不覆盖历史产物。
核心指纹（写本文件时的核心版本）：`7a5f6608f0316517`
（= coords.js + evaluate.js + inputQuality.js + passState.js + judge.js + snapshot.js + types.js + letters.json 的 sha256 前 16 位；重算方式见 README）

---

## 1. 四条路径的契约

| 路径 | 入口 | 判定链 | 坐标空间 | 时间字段 | 输出 |
|---|---|---|---|---|---|
| 实时 judge | `practice/app.js:299` → `src/judge.js` | 质量门 → 几何 evaluate → 保持门 passState | `image_normalized`，geom=`{width: videoWidth, height: videoHeight}` | `videoTime` + `nowMs`（真实时钟） | `decision` ∈ pass/fail/blocked/undetermined |
| schema v2 快照 | `src/snapshot.js` | 只导出，不判定 | 记录 `coordSpace` + `imageWidth/imageHeight` | `capturedAt` + `frameId` | JSON 帧 |
| 旧 CLI（单帧） | `src/eval-handframe.mjs` | 直接调 `evaluate`，**不**过质量门、**不**过保持门 | 读 `frame.imageWidth/imageHeight`；缺失则直接输出 `missing_size` | 只用 `t` | 文本行 `geometry_pass` / `ruleStatus` |
| render-loop | `src/render-loop/run.py` | 渲染 PNG → Landmarker IMAGE → 调旧 CLI | 同旧 CLI | `t` | `render-loop/out/<id>.json` + RESULTS.md |
| bili-loop | `src/bili-loop/run.py` + `bili-loop/eval-frames.mjs` | 抽帧 → Landmarker IMAGE → `evaluate(letter, lm)` **完全不传 geom** | 无 | `t`（秒） | `bili-loop/out/*.json`（含 `u_pass`/`v_pass`/`u_issues`/`v_issues`） |

### 关键差异（按严重度）

**D1 — 缺 geom 的语义已经反转（最严重，且是静默的）。**
旧 `bili-loop/eval-frames.mjs` 调 `evaluate(letterU, lm)` 时第三个参数是 `undefined`。
当前核心 `geometryError(undefined)` 返回 `"missing_size"`，于是 `evaluate` 直接 `pass=false, ruleStatus="missing_size"`。
旧契约下同一调用是**真的在算几何**。实测（BV1B64y1M7az，68 个有手帧）：

```
stored u_pass==true: 1        重算 u_pass==true: 0
U 与存档一致 67/68            V 与存档一致 67/68
存档 u_issues:  ["index.not_extended","middle.not_extended"]   ← 真实几何问题
重算 ruleStatus: "missing_size"                                ← 根本没算
```

后果：拿当前核心重跑旧 CLI，输出是「全部 false」而不是报错。**看起来像一堆真负例，其实是拒绝评估。**这是最危险的一类差异——它不抛异常，只是把「不知道」伪装成「不合格」。

**D2 — 历史产物没有 schemaVersion / 尺寸 / 目标。**
`render-loop/out/*.json` = `{t, handedness:"Left", landmarks[21], conf}`；
`bili-loop/out/*.json` 帧 = `{t, hand_count, handedness:"", conf, u_pass, v_pass, u_issues, v_issues, landmarks?}`。
两者都没有 `schemaVersion`、没有 `imageWidth/imageHeight`、没有 `targetLetterId`。
按当前 schema v2 校验：**6/6 全部阻断**（详见下表）。

**D3 — 存档里混着工具自己的预测，不能当标签。**
`u_pass` / `v_pass` / `u_issues` / `v_issues` 是旧 CLI 当时的输出，属于**预测**，不是标注。
任何把 `u_pass==true` 当「正确答案」的做法都是自证。本目录的回放器对这类字段一律只当警告（`pseudo_label_field`），从不采信。

**D4 — handedness 形状不同。**
历史产物是字符串（`"Left"` / `"Right"` / `""`）；当前 schema v2 是对象数组（含 `categoryName` / `score`）。旧产物缺 `score`，而质量门**不读** `handedness.score`（`inputQuality.js` 首行注释明确），所以这不是阻断项，只是形状不兼容、不能直接喂给 `judge` 的 `hands` 参数。

**D5 — 时间字段不同名。**
历史产物只有 `t`（秒，抽帧间隔 2s）。保持门要 `videoTime`（同一帧不得重复）**和** `nowMs`（真实时钟，算 maxGap=400ms）。
bili 每 2 秒一帧，任何真实 `nowMs` 都会让 400ms 门必然超时；而 `t` 直接当 `nowMs` 用又是编造时间。**保持门在旧产物上不可回放**，这是设计使然，不是缺字段那么简单。

**D6 — 单帧 vs 序列 vs 质量，三层不能互相冒充。**
旧 CLI 只算单帧几何；实时 judge 还要过质量门和保持门。历史 `RESULTS.md` 里的 `pass` 列是**单帧几何 pass**，不等于产品 `decision=pass`。

---

## 2. 可回放性矩阵

实测命令与结果（`bun tools/assessment/validate-captures.mjs <dir>`）：

| 产物 | 文件数 | schemaVersion | 尺寸 | target | 时间 | 可回放 | 阻断码（实测） |
|---|---|---|---|---|---|---|---|
| `practice/src/render-loop/out/` | 2 | 缺 | 缺 | 缺 | 仅 `t` | **否** | `unsupported_schema_version`×2, `missing_size`×2；警告 `missing_target`×2 |
| `practice/src/bili-loop/out/` | 4 | 缺 | 缺 | 缺 | 仅 `t` | **否** | `unsupported_schema_version`×4, `missing_size`×4, `missing_timestamps`×234；警告 `frames_without_hand`×4, `missing_target`×4 |
| `practice/src/fixtures/` | 0 | — | — | — | — | — | 空目录。没有真人数据。 |
| `tools/assessment/samples/synthetic/` | 24 | 有 | 有 | 有 | 有 | **是**（19/24） | 5 个反例夹具故意阻断 |

**结论：当前磁盘上没有任何历史离线产物能按当前契约等价回放。** 不是「结果略有出入」，而是元数据层面就不成立：缺版本、缺尺寸、缺目标、缺可用的时间轴。

---

## 3. 迁移矩阵（旧产物 → 当前契约）

| 旧产物字段 | 当前契约 | 迁移动作 | 能否自动补 | 理由 |
|---|---|---|---|---|
| （无）`schemaVersion` | 必需，=2 | 写入 `schemaVersion: 2` | 可，但**须标记为推断** | 值本身无歧义，但「这帧确实按 v2 采集」是假设 |
| （无）`imageWidth/imageHeight` | `image_normalized` 必需 | **不可补** | **否** | 猜 1×1 等于伪造几何；渲染图尺寸要从渲染脚本取，视频要从视频取 |
| （无）`targetLetterId` | 判规则必需 | **不可补** | **否** | 当时选中目标只有当事人知道；bili 片**明确未标注字母**（`letter_labeled: false`） |
| `t`（秒） | `videoTime` + `nowMs` | 语义改名 + **补真实时钟** | **否** | `t` 当 `videoTime` 可以；`nowMs` 无法从 `t` 反推，抽帧间隔 2s 也与 400ms 门不兼容 |
| `handedness: "Left"` | 对象数组 | 改形 | 部分 | 缺 `score`，且质量门本就不读 score，影响有限 |
| `u_pass`/`v_pass`/`u_issues`/`v_issues` | 无对应 | **丢弃** | **否** | 是旧工具的预测，不是标注；保留只会诱导自证 |
| `conf` | 无对应 | 丢弃或移入 `_legacy` | — | 当前核心不读 `conf`（`inputQuality.js` 明确「不补 conf=1」） |

### 可以回放的历史结果

**没有。** 逐项说明：

- render-loop 的 `pass` 列：单帧几何结论，但缺尺寸 → 当前核心拒绝评估，无法复现。
- bili-loop 的 `u_pass`/`v_pass`：实测 67/68 与重算一致，但**唯一那个 `true` 翻转成 `false`**，且 `ruleStatus` 从真实问题码变成 `missing_size`。一致率 98.5% 是假象——差异恰好落在唯一的正例上，而这正是最需要解释的那个数。
- 两者的 `RESULTS.md` 都是「渲染图/视频抽帧，不是真人，不报准确率」，本来就不构成评测成绩，不需要回放。

### 想回放历史产物，必须先补什么（人工，不可自动）

1. 每帧的原始采集尺寸（渲染图从 `render_gf0021.py` 的相机/分辨率取；视频从 `ffprobe` 取）。
2. 视频片段的真实时间轴（`t` 秒 → 真实墙钟），或明确放弃保持门、只回放单帧几何。
3. 人工字母标注（bili 片当前 `letter_labeled: false`，只对 U/V 做对照，不是标签）。
4. 明确「这次回放用的是哪一版核心」——即本目录报告里的 `coreFingerprint`。

在补齐之前，历史产物只能作为**历史记录**引用，不能作为**当前版本的评测输入**。
