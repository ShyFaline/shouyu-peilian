# tools/assessment —— 离线评测与回放骨架

日期：2026-09-25（第二轮）。写锁：`tools/assessment/` + 已授权迁移的 `practice/src/eval-handframe.mjs`、`practice/src/bili-loop/eval-frames.mjs`、`practice/src/render-loop/run.py`。
**不改 app.js / evaluate.js / judge.js / types.js / letters.json / 核心测试；不覆盖历史产物。**

用途：把「一帧/一段采集记录」按当前核心契约回放，并区分**几何单帧判定**、**质量/内容判定**、**连续序列判定**三层，产出带分子分母的报告。
**本目录不产生任何准确率。** 没有真人数据，就没有真人评估。

---

## 1. 运行命令

全部用 `bun`（本机 1.4.1）。在仓库根目录执行。

```bash
# 合成夹具重新生成（产物全部标记 synthetic）
bun tools/assessment/samples/generate-synthetic.mjs

# 元数据校验（只读，不改输入）
bun tools/assessment/validate-captures.mjs <dir> [--out <report.json>] [--json]

# 回放 + 评分
bun tools/assessment/replay.mjs <dir> \
    [--level geometry|quality|sequence] \
    [--labels <labels.json>] \
    [--out <report.json>] [--json] [--quiet] [--allow-invalid]

# 骨架自检（62 条断言：六类边界 + 来源/标签正交 + 全体 vs conditional + 序列层级）
bun tools/assessment/verify-skeleton.mjs

# 旧离线入口迁移专项验证（31 条断言，含历史产物只读性）
bun tools/assessment/verify-legacy-migration.mjs

# 一键复现第二轮全部证据（当前行为）
bash tools/assessment/run-all-r2.sh

# 第一轮历史脚本（产出 out/，字段口径已过时，不要与第二轮混引）
# bash tools/assessment/run-all.sh
```

退出码：`validate-captures` / `replay` 有阻断项或标签被拒返回 1；`verify-skeleton` 有断言失败返回 1。目录本来就是放反例夹具时，显式加 `--allow-invalid`，默认仍如实报错。

### 三个 level 的含义（互不冒充）

| level | 判定函数 | `predicted=correct` 的含义 |
|---|---|---|
| `geometry` | `evaluate().pass` | 手型符合该字母的几何规则 |
| `quality` | `assessInputQuality().ok` | 输入质量足够判（不是「动作对」） |
| `sequence` | `judge().decision === "pass"` | 连续保持门开放 |

缺省推断：有 `frames` → `sequence`，否则 → `geometry`。

---

## 2. 数据字典

### 2.1 采集记录（输入）

单帧：

| 字段 | 类型 | 必需 | 说明 |
|---|---|---|---|
| `sampleId` | string | 建议 | 标签靠它对齐；缺省用文件名 |
| `schemaVersion` | number | **是** | 当前只认 `2` |
| `coordSpace` | string | 是 | `image_normalized`（默认）或 `equal_scale_unit`（显式合成通道） |
| `imageWidth` / `imageHeight` | number | `image_normalized` 时**必需** | 有限且 >0；**缺了不猜**，直接 `missing_size` |
| `landmarks` | array[21] | **是** | 每点 `{x,y,z?}`；`x/y` 必须有限；`z` 可缺但不可为 NaN |
| `targetLetterId` | string | **是** | 当时的**选中目标**，不是正确答案 |
| `sourceType` | string | 建议 | `synthetic` / `render` / `video` / `camera`；分桶用 |
| `capturedAt` / `frameId` | number | 否 | 快照溯源 |
| `collection` | object | 现场采集**必需** | 如 `{protocol:"voluntary-participant-onsite-v1", consent:true, sessionId}`；缺它 `humanEvaluation.executed` 不成立 |

序列：把 `landmarks` 换成 `frames: [{ frameId, videoTime, nowMs, landmarks }]`。
`videoTime`（同一帧不得重复）与 `nowMs`（真实时钟）**都必需**——保持门靠它们算 400ms 间隔。

**禁止出现的字段**（出现即记 `pseudo_label_field` 警告，一律不采信）：
`expectedVerdict`、`expectedIssueCodes`、`verdict`、`pass`、`decision`、`practiceStatus`、`label`、`truth`、`groundTruth`。

### 2.2 标签文件（独立输入）

标签**只能**来自独立文件，不能来自采集记录。

| 字段 | 必需 | 说明 |
|---|---|---|
| `expectedVerdict` | **是** | `correct` / `incorrect` |
| `level` | **是** | `geometry` / `quality` / `sequence`，决定 `expectedVerdict` 的含义 |
| `independent` | **是** | 必须为 `true` |
| `reviewedBy` | **是** | 命中 `auto/model/judge/evaluate/prediction/self/工具/模型/预测` 即判伪标签 |
| `reviewedAt` | **是** | 非空字符串 |
| `derivedFrom` | 否 | 命中 `prediction/tool_output/self_label/模型/预测` 即判伪标签 |
| `expectedIssueCodes` | 否 | 命中即计入「问题码一致率」分子分母 |
| `truthOrigin` | 否 | 覆盖文件级来源，如 `synthetic-construction`、`spec-derived-gate`、`human-annotation` |
| （文件级）`sequenceJudgmentLevel` | 序列**必需** | 先声明序列任务的预期判定层级，当前 `product_decision`（= `judge().decision==='pass'`），不是单帧几何 `pass` |

伪标签拒收码：`label_not_independent`、`label_derived_from_prediction`、`label_bad_level`、`label_bad_verdict`、`label_missing_reviewer`、`label_missing_time`、`label_origin_conflict`、`label_malformed`、`label_missing_sample`。
**任一条被拒 → 整份标签集拒收，一个都不用**（不偷偷用一半）。标签指向不存在的样本 → `label_unknown_sample`（孤立）。

### 2.3 回放结果状态

| status | 含义 | 是否进指标 |
|---|---|---|
| `scored` | 回放成功且有标签，产出了预测 | 进（真值分组与混淆格子） |
| `blocked` | 规则/状态拒绝（规则为空、practiceStatus 非 pose_practice） | 只进阻断原因 |
| `undetermined` | 无法判定（质量门失败、异常）。**与 blocked 分开计** | 只进阻断原因 |
| `unknown` | 无目标字母 / 目标字母不在 letters.json | 只进阻断原因 |
| `invalid` | 元数据或数据本身损坏（schema 版本、点数、NaN、缺时间） | 只进阻断原因 |

每条结果另带两个正交字段：

| 字段 | 取值 | 用途 |
|---|---|---|
| `decision` | `pass` / `fail` / `blocked` / `undetermined` | 产品编排结论，来自核心 `judge()` |
| `failureClass` | `none`、`action_error`、`hold_incomplete`、`blocked_input`、`blocked_rules`、`blocked_status`、`undetermined`、`unknown_target`、`invalid_timeline`、`invalid_metadata` | 「为什么没判对」，**不把动作错误 / 保持未完成 / 无效时间轴混成一种** |

`failureClass` 是封闭词表（`lib/replay.mjs` 的 `FAILURE_CLASSES`），报告与自检都按它核对。
关键区分：`action_error`（几何不合格）≠ `hold_incomplete`（几何合格但没停稳）≠ `invalid_timeline`（时间轴无效，根本没进判定链）。

### 2.4 校验码

| code | 触发 |
|---|---|
| `unsupported_schema_version` | `schemaVersion !== 2` |
| `unsupported_coord_space` | `coordSpace` 不是两个受支持值之一 |
| `missing_size` | `image_normalized` 但没有有限正的宽高（复用核心 `geometryError`） |
| `landmark_count` | 点数 ≠ 21 |
| `missing_xy` / `non_finite_z` | `x/y` 缺失或非有限 / `z` 非有限 |
| `missing_landmarks` | 单帧缺 `landmarks`，或帧里 `landmarks` 存在但畸形 |
| `missing_timestamps` | 帧缺有限 `videoTime` / `nowMs` → `failureClass=invalid_timeline` |
| `empty_frames` | 序列没有任何帧 |
| `frames_without_hand`（警告） | 该帧没检测到手。**合法观测，不是损坏** |
| `missing_target`（警告） | 没有 `targetLetterId`，无法判几何规则 |
| `pseudo_label_field`（警告） | 采集记录里出现标签/预测字段 |

### 2.5 核心词汇表（照抄核心，不另造）

- 质量门 `assessInputQuality().reason`：`ok`、`hand_count`、`landmarks`、`missing_xy`、`non_finite`、`missing_size`、`unsupported_coord_space`、`degenerate_bone`、`fingertip_oob`
- 几何 `evaluate().ruleStatus`：`ok`、`no_hand`、`empty`、`unsupported`、`missing_size`、`unsupported_coord_space`、`invalid_input`
- 编排 `judge().decision`：`pass`、`fail`、`blocked`、`undetermined`
- `practiceStatus`（只来自 letters.json，运行时不得升格）：`pose_practice`(9)、`pending_review`(18)、`demo_only`(5)
- 保持门常量（`passState.js`，**仍标 UNVERIFIED**）：`PASS_FRAMES=6`、`MAX_GAP_MS=400`；已随 `judge().hold` 透出

> ⚠ 已知不一致（第二轮发现，已请 Grok 修）：当前 `types.js` 的注释把 `ruleStatus` 写作
> `no_letter/no_rules/unknown_rule_fields`，但 `evaluate.js` 实际只返回
> `ok/no_hand/empty/unsupported/invalid_input`（另有几何拒绝时带的 `missing_size`、
> `unsupported_coord_space`）。**以代码为准**，本目录按代码实现。

### 2.6 指标定义（两条正交轴 + 两层口径）

#### 两条正交轴（绝不互相触发）

| 轴 | 字段 | 取值 | 含义 |
|---|---|---|---|
| 样本来源 | `sourceType` | `synthetic`、`render`、`video`、`camera` | 样本**从哪来** |
| 标签来源 | `truthOrigin` | `synthetic-construction`、`spec-derived-gate`、`human-annotation`… | 标签**怎么产生** |

报告里对应 `bySourceAxis`（`constructed` / `third_party_real` / `on_site_human`）与 `byTruthOrigin`。

**人工标注了合成样本，仍然是「合成样本 + 人工标签」，不是「已执行现场真人评估」。**
`humanEvaluation.executed` 只看**样本来源轴**，不看标签来源轴。

#### 真人评估证据链（四件事分开报，不合并成一个布尔）

| 字段 | 含义 |
|---|---|
| `onSiteHuman.collected` | 确实来自现场采集的样本数（`sourceType=camera`） |
| `onSiteHuman.independentlyLabeled` | 其中有独立人工标签的 |
| `onSiteHuman.attempted` | 确实跑过一次评估（有标签且有回放记录） |
| `onSiteHuman.decidable` | 其中真正判得出来的数量 |
| `onSiteHuman.allAttemptsBlocked` | 尝试了但**全被阻断** → 不算有效结果 |
| `onSiteHuman.protocolDeclared` | 采集声明了协议（如 `voluntary-participant-onsite-v1`） |
| `thirdPartyVideo.*` | 第三方实拍，**单独统计**，不与现场采集合并成一个真人成绩 |

`executed = collected>0 && independentlyLabeled>0 && decidable>0 && protocolDeclared`。
四项缺一即为 `false`，并在 `note` 里说明缺哪一项。

#### 两层口径（名字必须区分，禁止互换引用）

| 指标 | 分子 / 分母 |
|---|---|
| **全体口径** `falseAcceptAll` | 误放行 / **全部有独立标签的错误样本**（含被阻断、不可判定的） |
| **全体口径** `falseRejectAll` | 明确失败 / **全部有独立标签的正确样本**（含被阻断、不可判定的） |
| **可判定覆盖率** `decidableCoverage` | 真值分组里判得出来的 / 该真值组全体（正确组、错误组各算各的） |
| **条件口径** `conditionalOnDecidable.falseAccept` | 误放行 / **仅可判定的**错误样本 |
| **条件口径** `conditionalOnDecidable.falseReject` | 明确失败 / **仅可判定的**正确样本 |
| **条件口径** `conditionalOnDecidable.agreement` | (TP+TN) / (TP+TN+FA+FR)，仅可判定 |
| 回放覆盖率 `replayCoverage` | 能产出预测的样本 / 全部样本（与有无标签无关） |
| 评分覆盖率 `scoredCoverage` | 有标签且已评分 / 有标签样本（无标签时 = null） |
| 结果分布 | `blocked`、`undetermined`、`unknown`、`invalid` 各自计数 + `blockReasons` |
| 失败分类 | `failureClassCounts`，见 2.3 的封闭词表 |

分母为 0 时一律 `null`，**不报 0、不报「0% 正确」、不报「准确率」**。

> 条件口径的数值通常比全体口径好看，因为它把不可判定的样本从分母里去掉了。
> **引用时必须写明是哪一层。** 第一轮的 `falseAcceptRate`/`falseRejectRate` 就是只在可判定样本里算的，
> 但没有在名字上标明，容易被当成全体口径——这是第二轮修掉的第二个问题。

### 2.7 分桶铁律

- **构造来源**（`synthetic`/`render`）永远单独成桶，不与实拍/现场混算。
- **第三方实拍**（`video`）单独成桶，不与现场采集合并成真人成绩。
- **现场采集**（`camera`）只有同时具备独立标签、可判定结果、协议声明，才能推 `executed=true`。
- 序列标签的期望来自 `passState` spec（仍 UNVERIFIED），记 `truthOrigin=spec-derived-gate`，与几何标签分开。
- **序列任务的预期判定层级必须先声明**：`labels.json` 的 `sequenceJudgmentLevel`（当前 `product_decision`，
  即 `judge().decision==='pass'`），不是单帧几何 `pass`。

## 3. 冒烟与反例样本（全部合成）

### 3.1 合成冒烟 `samples/synthetic/`（24 个）

由 `samples/generate-synthetic.mjs` 生成，每个都带 `_synthetic: {synthetic:true, humanReviewed:false, intent}`。
手型几何来自 `samples/lib/hand.mjs`（与反例夹具共用一份，不复制）。

生成器**不实现任何国标规则**：它只按关节角摆出手型，对错由核心判。拇指的折叠角是按核心量角位置（`lm[2],lm[3],lm[4]` 的夹角）调的，不是复制阈值。

| 样本 | 意图 | 期望 |
|---|---|---|
| `syn-v-pos` / `syn-l-pos` / `syn-y-pos` / `syn-a-pos` / `syn-b-pos` / `syn-w-pos` / `syn-i-pos` | 各字母几何正例 | `scored` / `correct` |
| `syn-v-neg-spread` | V 两指未分开 | `incorrect` + `index_middle.not_apart` |
| `syn-l-neg-angle` | L 拇指食指未成直角 | `incorrect` + `thumb_index.angle` |
| `syn-u-geom-pass-judge-blocked` | U 几何对但 U 是 `pending_review` | 几何 `correct`，产品 `decision=blocked` |
| `syn-missing-size` | 缺尺寸 | `invalid` / `missing_size` |
| `syn-unsupported-space` | 未知坐标空间 | `invalid` / `unsupported_coord_space` |
| `syn-bad-number-nan` / `-null` / `-short` | NaN / null / 20 点 | `invalid` / `missing_xy`·`landmark_count` |
| `syn-pseudo-label` | 记录里塞了 `expectedVerdict`/`pass`/`decision` | 只当 `pseudo_label_field` 警告 |
| `syn-unlabeled` | 无标签 | 回放但不进分子分母 |
| `syn-equal-scale-unit` | 显式合成通道 | 可回放 |
| `syn-seq-v-pass` | 6 帧 / 100ms | `correct`（门开放） |
| `syn-seq-v-short` / `-expired` / `-dup` / `-backwards` | 5 帧 / 401ms / 重复 videoTime / 时间倒退 | `incorrect`（门不开放） |
| `syn-seq-v-nohand-then-pass` | 前两帧没手 | 记 `frames_without_hand` 警告，后 6 帧仍开放 |
| `labels.json` | 15 条独立标签 | 全部接受 |
| `labels.pseudo.json` | 3 条伪标签 | **整份拒收** |

### 3.2 反例夹具 `samples/counterexamples/`（第二轮新增，4 组）

由 `samples/counterexamples/generate-counterexamples.mjs` 生成。存在的理由：**36/36 自检通过并不能证明定义正确**——
第一轮的断言恰好把 bug 1 当成正确行为。这四组是**修前就能失败的**反例，用来钉死修正后的定义。

| 组 | 样本 | 钉住什么 |
|---|---|---|
| `label-only-human` | 3（synthetic/render/video）+ 全 human-annotation 标签 | 有人工标签、**无现场采集** → `executed` 必须 `false` |
| `source-orthogonality` | 4（synthetic/render/video/camera）+ 同一批 human-annotation 标签 | 标签来源相同、样本来源不同 → 只有 `camera`+协议 才推 `executed=true`；render 不得混入现场真人桶；第三方视频单独统计 |
| `metric-cells` | 7，钉在特定 (真值, 预测) 格子 | 全体口径 误放行 **1/2**、明确失败 **1/5**；conditional 口径 **1/1**、**1/2**；可判定覆盖率 错误组 1/2、正确组 2/5；blocked/undetermined/invalid/unknown 分开计 |
| `sequence-levels` | 4 | 动作错误 `action_error` ≠ 保持未完成 `hold_incomplete` ≠ 无效时间轴 `invalid_timeline` |

**这些数字不是准确率。** 正负例由构造决定。它们只证明：合成正例能被判对、合成负例能被判错、坏输入能被拦住、来源与标签不再互相触发。

---

## 4. 采集缺口（必须先补，才能做真人评估）

当前 `practice/src/fixtures/` 为空。**没有真人数据，未执行真人评估。**

要产出任何可对外引用的数字，需要：

1. **真人采集**。至少覆盖 mainPath 8 个字母，每字母多个被试、多个重复。
   - 导出开关在练习页默认关闭（`app.js:426 canExportSnapshot`），需要显式开启。
   - 导出必须带齐：`schemaVersion`、`coordSpace`、`imageWidth/imageHeight`、`targetLetterId`、`videoTime`、`nowMs`。
2. **独立人工标注**。标注人不得看到工具的 `decision`；否则标签是自证。
   - 每条标签要填 `independent: true`、`reviewedBy`（真人标识，不要用 `auto`/`model`）、`reviewedAt`。
   - 建议双人标注 + 分歧仲裁，否则无法估计标签噪声。
3. **`pending_review` 的字母不能算成绩**。letters.json 里 18 个 `pending_review` + 5 个 `demo_only`，只有 9 个 `pose_practice`。U 在 mainPath 里但是 `pending_review` → `judge` 恒 `blocked`。要对 U 出数，先改 `practiceStatus`，那是核心文件的改动，需要另行申请。
4. **保持门阈值未验证**。`PASS_FRAMES=6` / `MAX_GAP_MS=400` 标着 `UNVERIFIED`。任何序列层的「通过率」都建立在这两个未验证常量上，报告里必须同时给出这两个值。
5. **历史产物不能替代采集**。见 `CONTRACT-DIFF.md`：render-loop 与 bili-loop 的产物元数据不满足当前契约，6/6 不可回放。
6. **现场采集必须带 `collection` 协议声明**，否则即使有标签、能判定，也不推 `executed=true`（见 2.6）。

### 关于 bili-loop 素材的边界

`bili-loop/out/*.json` 是 B 站公开教学片的本机抽检，`letter_labeled: false`（**明确未标注字母**，只对 U/V 做对照）。
即使补齐尺寸与时间轴，它也**不构成真人评测集**：无字母标注、单一视频来源、抽帧间隔 2s。只能当「真实视频分布下的冒烟」，不能报准确率。

---

## 5. 目录

```
tools/assessment/
  README.md                       本文件：数据字典 / 运行命令 / 采集缺口（第二轮口径）
  CONTRACT-DIFF.md                契约差异与可回放性矩阵（第一轮）
  REQUESTS-TO-GROK.md             给 Grok 的接口变更请求 R1–R7 + 第二轮重核
  VERIFICATION.md                 第一轮验证报告（历史；字段口径已被第二轮取代）
  ACCEPTANCE.md                   第一轮验收材料（历史）
  ROUND2.md                       第二轮：两个已复现问题的修正说明（环节1-3）
  ROUND2-VERIFICATION.md          第二轮验证报告（环节4，当前口径）
  ROUND2-ACCEPTANCE.md            第二轮验收材料（环节5，当前）
  K3-FACT-SUMMARY.md              给 K3 的简明事实摘要（旧报告/修正后报告/适用版本）
  run-all.sh                      ⚠ 第一轮历史脚本（产出 out/，不要与第二轮混引）
  run-all-r2.sh                   第二轮一键复现（当前行为）
  lib/
    core.mjs                      核心适配（只 import，不复制规则）
    validate.mjs                  最小元数据校验
    truth.mjs                     独立标签装载 + 伪标签拒收
    replay.mjs                    三层回放 + decision/failureClass
    report.mjs                    正交轴 + 全体/conditional 两层口径
    fingerprint.mjs               核心源指纹
  samples/
    lib/hand.mjs                  共享合成手型构造器（无国标规则）
    generate-synthetic.mjs        合成冒烟夹具生成器（24 个）
    counterexamples/              反例夹具生成器 + 4 组（钉死修正后的定义）
  verify-skeleton.mjs             骨架自检（62 断言）
  verify-legacy-migration.mjs     旧离线入口迁移专项验证（31 断言）
  pre-fix-evidence.mjs            修前证据生成（用 5b56abd 旧 report.mjs 复现两个 bug）
  out/                            第一轮证据（只读，历史）
  out-r2/                         第二轮证据（当前）
    synthetic/              24 个合成样本 + 标签 + 伪标签反例
    empty/                  零样本目录
  out/                      新报告（不覆盖任何历史产物）
```

核心指纹 = 下列 8 个文件的 sha256 前 16 位拼接后再取 sha256 前 16 位：
`practice/src/{coords,evaluate,inputQuality,passState,judge,snapshot,types}.js`、`practice/content/letters.json`。
报告里带 `coreFingerprint`，才能说明「这一版结果对应哪一版核心」。核心被改过之后，旧报告作废。
