# 验证报告（环节4）

日期：2026-09-24。执行者：离线评测与工程工具席。
复现：`bash tools/assessment/run-all.sh`（10/10 项符合预期，36/36 断言通过）。
核心指纹：`7a5f6608f0316517`。保持门阈值：`passFrames=6` / `maxGapMs=400`（**仍标 UNVERIFIED**）。

> **本报告不含任何真人评估结果。** 全部样本为合成夹具。合成桶的百分比只证明骨架接线正确，**不是准确率**，不得对外引用。

---

## 0. 前置声明

| 项 | 值 |
|---|---|
| 真人数据 | **无**。`practice/src/fixtures/` 为空（0 个 JSON） |
| 真人评估 | **未执行**。`humanEvaluation.executed = false` |
| 样本来源 | 100% `sourceType=synthetic`，`humanReviewed=false` |
| 训练 | 未训练任何模型 |
| 历史产物 | 只读，未覆盖（`git status` 无改动） |

---

## 1. 六类边界的覆盖结果

### 1.1 缺尺寸

| 样本 | 期望 | 实测 | 通过 |
|---|---|---|---|
| `syn-missing-size` | `invalid` / `missing_size`，不猜尺寸 | `invalid` / `missing_size` | ✅ |
| `syn-unsupported-space` | `invalid` / `unsupported_coord_space` | `invalid` / `unsupported_coord_space` | ✅ |
| `syn-equal-scale-unit` | 显式合成通道可回放 | `scored` | ✅ |

**误接收 0/1。** 缺尺寸没有被当成「几何不合格」，也没有被补成 1×1——它根本没进判定链。

### 1.2 坏数值

| 样本 | 期望 | 实测 | 通过 |
|---|---|---|---|
| `syn-bad-number-nan` | `invalid` / `missing_xy` | `invalid` / `missing_xy` | ✅ |
| `syn-bad-number-null` | `invalid` / `missing_xy` | `invalid` / `missing_xy` | ✅ |
| `syn-bad-number-short`（20 点） | `invalid` / `landmark_count` | `invalid` / `landmark_count` | ✅ |

**坏数值产生预测数 = 0。** 三条都 `predicted === null`，没有一个被质量门放过。

### 1.3 伪标签

| 检查 | 实测 | 通过 |
|---|---|---|
| `labels.pseudo.json` 整份拒收 | 接受 0 / 拒收 3 | ✅ |
| 拒收原因覆盖 | `label_not_independent`×1、`label_derived_from_prediction`×1、`label_bad_level`×1 | ✅ |
| 整份被拒后不评分 | `scored = 0` | ✅ |
| 采集文件内 `expectedVerdict`/`pass`/`decision` | 只记 `pseudo_label_field` 警告，不当标签 | ✅ |
| 标签指向不存在样本 | `label_unknown_sample`（孤立） | ✅ |

**伪标签误接收 0/3。** 三条都来自「工具自己的预测」（`derivedFrom: u_pass`、`reviewedBy: model:judge`、`independent: false`），全部拦住。

### 1.4 无标签

| 检查 | 实测 | 通过 |
|---|---|---|
| 无标签样本仍回放 | `syn-unlabeled` → `scored`（有预测） | ✅ |
| 不进分子分母 | 无标签时 `scored = 0` | ✅ |
| 不报准确率 | `agreement = null (0/0)`、`scoredCoverage = null (0/0)` | ✅ |
| 回放覆盖仍如实 | `replayCoverage = 78.3% (18/23)` | ✅ |

**关键区分**：无标签时「评分覆盖率」分母为 0 → `null`（不报 0%），而「回放覆盖率」仍然给出真实数字。两者分开，避免把「没标签」读成「全错」。

### 1.5 零样本

| 检查 | 实测 | 通过 |
|---|---|---|
| 空目录 | `samples = 0` | ✅ |
| 不报比率 | `replayCoverage / scoredCoverage / agreement` 全部 `null (0/0)` | ✅ |
| 不报真人评估 | `humanEvaluation.executed = false` | ✅ |
| 退出码 | 0（空目录不是错误） | ✅ |

### 1.6 合成正负例

几何层（`level=geometry`，n=18，含 5 个故意坏样本）：

| 样本 | 期望 | 实测 |
|---|---|---|
| `syn-v-pos` | correct | correct ✅ |
| `syn-l-pos` | correct | correct ✅ |
| `syn-y-pos` | correct | correct ✅ |
| `syn-a-pos` | correct | correct ✅ |
| `syn-b-pos` | correct | correct ✅ |
| `syn-w-pos` | correct | correct ✅ |
| `syn-i-pos` | correct | correct ✅ |
| `syn-v-neg-spread` | incorrect + `index_middle.not_apart` | 一致 ✅ |
| `syn-l-neg-angle` | incorrect + `thumb_index.angle` | 一致 ✅ |
| `syn-u-geom-pass-judge-blocked` | 几何 correct，产品 blocked | 一致 ✅ |

序列层（`level=sequence`，n=6）：

| 样本 | 期望 | 实测 |
|---|---|---|
| `syn-seq-v-pass`（6 帧 / 100ms） | 门开放 | correct ✅ |
| `syn-seq-v-short`（5 帧） | 门不开放 | incorrect ✅ |
| `syn-seq-v-expired`（401ms 间隔） | 门不开放 | incorrect ✅ |
| `syn-seq-v-dup`（重复 videoTime） | 门不开放 | incorrect ✅ |
| `syn-seq-v-backwards`（时间倒退） | 门不开放 | incorrect ✅ |
| `syn-seq-v-nohand-then-pass`（前两帧没手） | 警告不阻断，后 6 帧开放 | correct ✅ |

---

## 2. 指标（合成集，分子分母齐全）

> 再次强调：**这些不是准确率。** 样本是构造出来的，正负例由构造决定。数字只说明「回放骨架把构造意图正确翻译成了预测」。

### 总量

| 指标 | 值 | 分子含义 |
|---|---|---|
| 样本总数 | 24 | — |
| 有标签 | 15 | — |
| 已评分 | 15 | — |
| 能产出预测 | 19 | — |
| 回放覆盖率 | **79.2% (19/24)** | 能产出预测的样本 / 全部样本 |
| 评分覆盖率 | **100.0% (15/15)** | 有标签且已评分 / 有标签样本 |
| **误接收** | **0.0% (0/6)** | 预测 `correct` 但真值 `incorrect` / 真值 `incorrect` 总数 |
| **误拒绝** | **0.0% (0/9)** | 预测 `incorrect` 但真值 `correct` / 真值 `correct` 总数 |
| 一致率 | 100.0% (15/15) | (TP+TN) / (TP+TN+FA+FR) |
| 问题码一致率 | 100.0% (2/2) | 预期问题码全命中 / 有 `expectedIssueCodes` 的样本 |
| 混淆 | TP=9, TN=6, FA=0, FR=0 | — |

### 分层

| level | 样本 | 已评分 | TP | FA | FR | TN | blocked | unknown | invalid |
|---|---|---|---|---|---|---|---|---|---|
| geometry | 18 | 9 | 7 | 0 | 0 | 2 | 0 | 0 | 5 |
| sequence | 6 | 6 | 2 | 0 | 0 | 4 | 0 | 0 | 0 |

### unknown / blocked / invalid 明细

| 状态 | 数量 | 原因分布 |
|---|---|---|
| `blocked` | 0 | — |
| `unknown` | 0 | — |
| `invalid` | 5 | `missing_xy`×2、`landmark_count`×1、`missing_size`×1、`unsupported_coord_space`×1 |

`invalid` 的 5 个**都是故意构造的坏样本**（见 1.1/1.2），不是意外失败。这也解释了 79.2% 的回放覆盖率：分母里含 5 个反例夹具。

### 分桶（铁律核对）

| truthOrigin | 样本 | 已评分 |
|---|---|---|
| `synthetic-construction` | 9 | 9 |
| `spec-derived-gate` | 6 | 6 |
| `unlabeled` | 9 | 0 |

| sourceType | 样本 |
|---|---|
| `synthetic` | 24 |

**合成桶与真人桶没有混算**：本报告里真人桶数量为 0。`humanEvaluation.executed = false`，`note` = 「没有真人来源标签。未执行真人评估，本报告不含任何真人准确率。」

`spec-derived-gate` 单独成桶：序列标签的期望来自 `passState` 当前 spec（仍是 UNVERIFIED 初值），既不是真人也不是测量结果，不能与几何标签混在一张表里。

---

## 3. 历史产物的回放验证（只读）

| 产物 | 文件 | 可回放 | 阻断码 |
|---|---|---|---|
| `practice/src/render-loop/out/` | 2 | **0** | `unsupported_schema_version`×2、`missing_size`×2 |
| `practice/src/bili-loop/out/` | 4 | **0** | `unsupported_schema_version`×4、`missing_size`×4、`missing_timestamps`×234 |
| `practice/src/fixtures/` | 0 | — | 空目录 |

警告：`missing_target`×6、`frames_without_hand`×4（bili 的 234 帧里有 43 帧没检测到手，按合法观测记警告，不算损坏）。

**实证「旧结果不能等价回放」**（BV1B64y1M7az，68 个有手帧）：

```
stored u_pass==true: 1              重算 u_pass==true: 0
存档 u_issues: ["index.not_extended","middle.not_extended"]    ← 真实几何问题
重算 ruleStatus: "missing_size"                                ← 根本没算
U/V 与存档一致 67/68（唯一那个 true 翻转成 false）
```

98.5% 的一致率是假象：差异恰好落在唯一的正例上。当前核心对「缺 geom」的裁决是**拒绝评估**，而旧 CLI 把它当**真实几何**在算。重跑旧 CLI 会静默产出「全部 false」——看起来像一堆真负例，实际是拒绝评估。这是本轮发现的最危险差异，已列入 `REQUESTS-TO-GROK.md` 的 R1。

---

## 4. 自检断言清单

`bun tools/assessment/verify-skeleton.mjs` → **36/36 通过**，覆盖：

- 合成正例 7 条、合成负例 2 条（含问题码命中）、几何/产品分层 1 条
- 序列放行 1 条、序列不放行 4 条、无手帧 1 条
- 缺尺寸 1 条、未知坐标空间 1 条、显式合成通道 1 条
- 坏数值 3 条 + 「坏数值不产生预测」1 条
- 伪标签 4 条（整份拒收、原因覆盖、拒后不评分、采集文件内伪标签字段）
- 孤立标签 1 条
- 无标签 3 条（仍回放、不报准确率、不报真人）
- 零样本 2 条
- 真人桶判定 1 条（合成桶不算真人）
- 合成标签集接受 2 条

---

## 5. 未执行的部分（如实列出）

1. **真人评估未执行**——没有真人数据，且导出开关在练习页默认关闭。
2. **`pending_review` 字母未评测**——letters.json 里 18 个 `pending_review` + 5 个 `demo_only`；mainPath 里的 `GF0021.U` 恒 `blocked`。本报告对 U 只断言了「几何 correct 但产品 blocked」，没有对 U 报任何通过率。
3. **保持门阈值未验证**——`PASS_FRAMES=6` / `MAX_GAP_MS=400` 仍标 UNVERIFIED。序列层的 6 个样本只证明「骨架按这两个值正确接线」，不证明这两个值合适。
4. **手型几何规则的国标符合性未验证**——本报告只验证「回放接线」，不验证 `letters.json` 里的规则是否与国标外形一致。那是另一件事，需要对照国标图。
5. **渲染图与视频抽帧未回放**——历史产物元数据不足，见第 3 节。未尝试用补数据的方式强行回放（补数据需要人工提供原始尺寸与时间轴）。
6. **未做跨核心版本回归**——本报告只对应指纹 `7a5f6608f0316517`。核心被改动后本报告作废，需重跑 `run-all.sh`。
