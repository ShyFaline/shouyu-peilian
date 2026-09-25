# 给 K3 的事实摘要（第二轮）

日期：2026-09-25。来源：离线评测与工程工具席（ds4.1flash）。
用途：供 K3 在 `docs/` 文书中引用。**只列事实，不含结论性评价。**

---

## 1. 一句话

第二轮修正了两个**定义错误**：一是「有真人标签」被当成了「已执行真人评估」，
二是误接收/误拒绝的分母只在可判定样本里却没标明。第一轮的评测报告因此**部分失效**，
引用时必须区分版本。

---

## 2. 报告版本对照（引用前请先看这张表）

| 报告 | 版本 | 是否可引用 | 说明 |
|---|---|---|---|
| `tools/assessment/out/*.json` | 第一轮（2026-09-24） | ⚠ **仅作历史证据** | 字段 `falseAcceptRate`/`falseRejectRate` 是**条件口径**（分母只含可判定样本），名字未标明；`humanEvaluation.executed` 由标签来源触发，**会误报** |
| `tools/assessment/out-r2/*.json` | 第二轮（2026-09-25） | ✅ 当前 | 字段已改为 `falseAcceptAll`/`falseRejectAll`（全体）+ `conditionalOnDecidable.*`（条件） |
| `tools/assessment/VERIFICATION.md`、`ACCEPTANCE.md` | 第一轮 | ⚠ **历史** | 指标口径已被取代 |
| `tools/assessment/ROUND2-VERIFICATION.md`、`ROUND2-ACCEPTANCE.md` | 第二轮 | ✅ 当前 | — |
| `tools/assessment/CONTRACT-DIFF.md` | 第一轮 | ✅ 仍有效 | 契约差异与可回放性矩阵未被第二轮推翻 |

**核心版本**：本轮所有报告对应 `out-r2/core-fingerprint.json` 的 `digest`。
核心文件由 Grok 持有写锁，**第二轮期间正在被修改**；核心再变，这些报告即作废。

---

## 3. 两条定义变化（K3 文书需要注意的表述）

### 3.1 「已执行真人评估」不再由标签来源触发

旧口径（**错**）：只要标签的 `truthOrigin` 是 `human-annotation`，就报「已执行真人评估」。
结果：合成图、Blender 渲染图、第三方视频被人工标注后，全都被算成了真人评估。

新口径：`executed` 需要**同时**满足四件事——

1. 样本来自现场采集（`sourceType = camera`）
2. 有独立人工标签
3. 确实跑过一次评估且**有可判定结果**（全被阻断不算）
4. 采集声明了协议（`collection.protocol`）

并且四件事**分开报**：`collected` / `independentlyLabeled` / `attempted` / `decidable`。
第三方实拍（`video`）**单独统计**，不与现场自愿参与者合并成一个真人成绩。

> 文书表述建议：区分「**合成样本 + 人工标注**」与「**现场真人采集**」。
> 前者可以说「有独立人工标注」，不能说「已执行真人评估」。

### 3.2 误接收/误拒绝有两层口径，名字必须写明

| 层 | 字段 | 分母 |
|---|---|---|
| 全体 | `falseAcceptAll` / `falseRejectAll` | 全部有独立标签的样本（含被阻断、不可判定的） |
| 条件 | `conditionalOnDecidable.falseAccept` / `.falseReject` | 仅在**可判定**样本里 |

条件口径的数值通常更好看，因为它把不可判定的样本从分母里去掉了。
**引用时必须写明是哪一层**；分母为 0 时报 `null`，不是 `0%`。

### 3.3 三类失败不再混为一种

`failureClass` 区分：`action_error`（动作错）/ `hold_incomplete`（保持未完成）/
`invalid_timeline`（时间轴无效）。文书里不要把「没停稳」和「动作做错」写成同一件事。

---

## 4. 关于「有没有真人数据」的确定事实

- `practice/src/fixtures/` 目前**为空**（0 个 JSON）。
- **未执行真人评估。** 所有报告都不含真人准确率。
- 全部评测样本为**合成/构造**夹具，`sourceType` 明确标为 `synthetic` / `render` / `video`。
- 第二轮的 `source-orthogonality` 反例组里有一个 `camera` 样本，**是构造出来验证逻辑的，不是真实采集**。
  它的作用是证明「只有现场采集才推 `executed=true`」，不能当作「我们已经有真人数据」。
- 合成夹具放在 `tools/assessment/samples/`，**不进** `practice/src/fixtures/`（避免污染真人数据目录）。

---

## 5. 采集协议需要写的字段（给 K3 的伦理/协议文书用）

若将来做现场采集，导出记录必须带：

| 字段 | 说明 |
|---|---|
| `sourceType: "camera"` | 标明是现场采集 |
| `collection.protocol` | 协议名，如 `voluntary-participant-onsite-v1` |
| `collection.consent` | 同意状态 |
| `collection.sessionId` | 会话 ID（匿名，不含姓名） |
| `schemaVersion: 2` | 当前只认 v2 |
| `imageWidth` / `imageHeight` | 有限正的尺寸；**缺了不可评估，不猜** |
| `targetLetterId` | 当时的选中目标，**不是正确答案** |
| `videoTime` + `nowMs` | 序列回放必需 |

标签**必须**来自独立文件，且 `independent: true`、`reviewedBy` 用真人标识
（不要用 `auto` / `model` / `judge`，会被判为伪标签并整份拒收）。

---

## 6. 旧离线产物的确定事实（`CONTRACT-DIFF.md` 摘要）

- `practice/src/render-loop/out/`（2 个 JSON）与 `practice/src/bili-loop/out/`（4 个 JSON）
  **全部不能按当前契约回放**：缺 `schemaVersion`、缺尺寸、缺 `targetLetterId`、缺可用时间轴。
- 这些是**渲染图**与**第三方视频抽帧**，本来就不构成评测成绩。
- 第二轮已迁移三个旧入口，**但历史产物本身没有被改写**，也没有事后补造元数据（尺寸仍然缺）。
- bili 素材：`letter_labeled: false`（**明确未标注字母**），U/V 只是对照目标不是标签；
  原始视频已不在 `tmp-media/`，尺寸无法追溯。

> 文书表述建议：这些产物只能作为「历史记录」引用，不能作为「当前版本的评测输入」。

---

## 7. 未验证 / 未知（文书里不要写成已确认）

1. 保持门阈值 `PASS_FRAMES=6` / `MAX_GAP_MS=400` **仍是 UNVERIFIED 初值**，不是实验结论。
2. 手型几何规则与 GF 0021-2019 国标外形的**符合性未验证**（只验证了回放接线）。
3. `practiceStatus` 分布：`pose_practice` 9 个、`pending_review` 18 个、`demo_only` 5 个。
   主路径 8 个字母里 `GF0021.U` 是 `pending_review`，产品对它恒 `blocked`——**U 不能出成绩**。
4. `types.js` 的 `ruleStatus` 注释与代码不符（注释写了三个代码里不存在的取值），**以代码为准**，已请 Grok 修。
