# 给 K3 的事实摘要（第二轮 + 第三轮）

日期：2026-09-26（第三轮更新）。来源：离线评测与工程工具席（ds4.1flash）。
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
| `tools/assessment/ROUND2-VERIFICATION.md`、`ROUND2-ACCEPTANCE.md` | 第二轮 | ⚠ 部分过时 | 其中「真人评估认定」的判定口径已被第三轮取代 |
| `tools/assessment/out-r3/*.json`、`ROUND3.md` | 第三轮（2026-09-26） | ✅ **当前** | 真人评估认定改为逐样本合取；历史文件保护改为真实前后比较 |
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


---

# 第三轮补充（2026-09-26）

## 8. 第三轮修了什么（K3 文书必须更新的两处表述）

### 8.1 「已执行真人评估」的认定：四条必须落在同一个样本上

**第二轮的口径仍有漏洞**：它用四个独立计数再 AND，所以四条条件可以来自**不同样本**。

举例（第三轮反例 `evidence-stitching`，三个样本）：

| 样本 | camera 来源 | 独立人工标签 | 协议声明 | 可判定结果 |
|---|---|---|---|---|
| A | ✅ | ✅ | ✅ | ❌ 被阻断 |
| B | ✅ | ✅ | ❌ 无协议 | ✅ |
| C | ✅ | ❌ 标签是构造的 | ✅ | ✅ |

**没有任何一个样本四条齐全**，但第二轮口径报 `executed=true`——因为 A 提供了协议、B 提供了结果，
条件被拼成了一个不存在的"合格样本"。

**第三轮口径**：`executed` 只在**存在单个样本同时满足四条**时为真。
实测同一反例组：`executed=false`（修正后），旧口径 `naiveWouldMisreport=true`（证明漏洞真实存在）。

> **文书表述**：说「已执行真人评估」时，必须能指认出**具体哪个样本**同时具备
> 现场采集来源、独立人工标签、协议关联、实际可判定结果。四条分散在不同样本上不算。

**「协议声明」不等于协议真实性。** 工具只检查 `collection.protocol` 字段是否按样本关联到位，
不验证协议内容。协议是否真实、同意是否有效，需要伦理文书侧的独立证据。

### 8.2 两种统计口径并列，且不隐藏"无法判断"

| 口径 | 分母 | 用途 |
|---|---|---|
| **全体** `falseAcceptAll` / `falseRejectAll` | 全部有独立标签的样本（**含被阻断、不可判定的**） | 诚实反映整体表现 |
| **条件** `conditionalOnDecidable.*` | 仅在**可判定**样本里 | 反映"判得出来时"的表现 |

两者通常不同，差值就是被排除的不可判定样本数。引用时必须写明是哪一层。

报告里另有显式字段避免"隐藏无法判断"：

- `undecidableButOtherwiseQualified`：**除「有结果」外都满足**的现场样本，逐条列出 id 与原因
- `allAttemptsBlocked`：尝试过但零可判定结果
- `attempted` 与 `decidable` 分开报：「已尝试」不等于「有结果」
- `blocked` / `undetermined` / `unknown` / `invalid` 分开计数，各有原因

### 8.3 历史文件保护测试已改为真实比较

旧测试只检查"算出了一个哈希"（`typeof x === "string"`，恒真），**不比较任何东西**。
现已改为两层真实比较：运行内 操作前 vs 操作后；以及与该轮记录基线比对（发现跨运行漂移）。
比较器自身有自检：单字节改动、新增、删除都能被发现。

**对 K3 的意义**：`practice/src/render-loop/out`、`bili-loop/out`、`fixtures`
以及第一/二轮证据目录现在有**可核查的保护**。若这些文件被改动，验证会失败并指名道姓。

### 8.4 旧调用入口不兼容时明确拒绝

`practice/src/bili-loop/run.py` 仍按旧形式调用 `eval-frames.mjs`。新 CLI 与旧接口不兼容，
现在会**明确拒绝**（退出码 3）并打印改法，**不再静默生成一份看着正常、实际无意义的结果**。

> 这条对文书的直接意义：**bili 离线路径当前处于停用状态**，不是"跑通了"。
> 在 `run.py` 适配之前，不要引用任何 bili 路径的新结果。

## 9. 第三轮仍未解决（文书不要写成已完成）

| 项 | 状态 |
|---|---|
| `bili-loop/run.py` 适配新 CLI | **未解决**，不在本席写锁，已提交请求给 Grok |
| `bili-loop/run.py` 仍读 `u_pass`/`v_pass` | **未解决**，新 CLI 不再产出这些字段 |
| 协议真实性验证 | **不在工具职责内**，需伦理文书侧独立证据 |
| 真人评估 | **仍未执行**，`fixtures/` 为空 |
| 反例中的 `camera` 样本 | **是构造的**，只用于验证逻辑，不是真实采集 |
| 保持门阈值 | 仍 UNVERIFIED（`PASS_FRAMES=6` / `MAX_GAP_MS=400`） |
