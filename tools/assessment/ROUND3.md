# 第三轮：评测工具明确问题修正

日期：2026-09-26。执行方：离线评测与工程工具席（DS）。
基线：`3bf7652`（本轮开始时 HEAD）。分支：`ds-assessment-20260926`。
范围：**只修已有评测工具的明确问题**，不扩建系统、不训练、不采集素材、不重跑会覆盖历史文件的流程。

复现：`bash tools/assessment/run-all-r3.sh`
独立自检：`verify-skeleton` **83/83**、`verify-legacy-migration` **49/49**、核心回归 **31 passed**。

---

## 1. 问题一：真人评估的认定可以跨样本拼出来

### 现象（修前，可复现）

第二轮实现的 `humanEvidence` 用**四个独立计数**再 AND：

```js
executed = collected>0 && independentlyLabeled>0 && decidable>0 && protocolDeclared;
```

四个计数各自在**不同子集**上统计，所以四条条件可以来自**不同样本**。

### 反例 `evidence-stitching`（三个样本，四条条件分散）

| 样本 | camera | 独立人工标签 | 协议 | 可判定结果 |
|---|---|---|---|---|
| `ce-stitch-a-protocol-blocked` | ✅ | ✅ | ✅ | ❌ 出框被阻断 |
| `ce-stitch-b-decidable-noproto` | ✅ | ✅ | ❌ 无协议 | ✅ |
| `ce-stitch-c-camera-synthetic-label` | ✅ | ❌ 构造标签 | ✅ | ✅ |

**没有任何一个样本四条齐全**，但修前实测：

```
executed=true
collected=3  independentlyLabeled=3  decidable=2  protocolDeclared=true
```

四条条件分别由 a（协议）、b（结果）、c 之外的样本凑出，**拼成了一个不存在的"合格样本"**。

### 修法：逐样本合取

`lib/report.mjs` 改为对每个现场样本算四条条件的**合取**：

```js
qualified = onSite && independentHumanLabel && protocol && decidable   // 同一样本
executed  = 存在 qualified 的样本
```

其中「合格独立人工标签」要求标签来源落在人工轴（`human-annotation` / `human-review` / `human`）**且** `independent !== false`——
`camera` 来源配 `synthetic-construction` 标签**不算**人工标签。

### 修后实测

| 组 | 样本 | executed | qualified | 旧口径 naive | naiveWouldMisreport |
|---|---|---|---|---|---|
| `evidence-stitching`（纯拼接陷阱） | 3 | **false** | **0** | `true` | **`true`** |
| `evidence-stitching-positive`（阳性对照） | 1 | **true** | **1** | `true` | `false` |
| `evidence-all-blocked` | 2 | **false** | **0** | `false` | `false` |

**阳性对照是必要的**：没有它，「一律返回 false」也能通过测试。

### 报告里新增的可核查结构

```
onSiteHuman.funnel = {
  collected: 3,
  withIndependentHumanLabel: 2,          // c 掉出去（构造标签）
  withProtocol: 2,                       // b 掉出去（无协议）
  withProtocolAndIndependentHumanLabel: 1,
  decidableWithIndependentHumanLabel: 1,
  qualified: 0                           // a 掉出去（被阻断）
}
onSiteHuman.perSample = [                // 逐样本四条件矩阵
  { sampleId, onSite, independentHumanLabel, protocol, decidable, qualified, missing: ["decidable"] },
  ...
]
humanEvaluation.stitchingCheck = {
  perSampleConjunction: false,
  naiveAndOfCounts: true,
  naiveWouldMisreport: true,             // 旧口径会误报
  naiveFormula, fixedFormula
}
```

`missing` 数组直接写出每个样本缺哪一条 —— 不需要读代码就能核查「不能跨样本拼」。

### 字段声明不是真实性证明

`collection.protocol` 只是**声明**。报告里 `protocolDeclared` 明确标注：

> protocolDeclared 表示 collection.protocol 字段按样本关联到位，是声明，不是协议真实性的验证。

本函数**不校验协议内容**，只要求它按样本关联到位。要真正验证协议，需要采集流程与伦理文书侧的独立证据，
不在本工具职责内。

---

## 2. 问题二：两种统计口径与"无法判断"的可见性

### 保留两种口径，名字强制区分

| 层 | 字段 | 分母 |
|---|---|---|
| **全体** | `falseAcceptAll` / `falseRejectAll` | **全部**有独立标签的样本（含被阻断、不可判定的） |
| **条件** | `conditionalOnDecidable.falseAccept` / `.falseReject` | 仅在**可判定**样本里 |

实测（`metric-cells` 组）：全体 `1/2`、`1/5`；条件 `1/1`、`1/2`。两者差 1 和 3，正是被隐藏的不可判定样本数。
报告随附 `metricDefinitions` 写明每个指标的定义，杜绝口头解释。

### 不隐藏"无法判断"

| 字段 | 作用 |
|---|---|
| `blocked` / `undetermined` / `unknown` / `invalid` | 分开计数，不混成一个 |
| `blockReasons` | 每个原因各多少 |
| `onSiteHuman.undecidableButOtherwiseQualified` | **除「有结果」外都满足**的现场样本，逐条列出 id 与原因 |
| `onSiteHuman.allAttemptsBlocked` | 尝试过但零可判定结果 |
| `onSiteHuman.attemptedButNoQualified` | 尝试过但没有任何样本四条齐全 |
| `attempted` vs `decidable` | 「已尝试」与「有可判定结果」分开报 |

`evidence-stitching` 组实测：`undecidableButOtherwiseQualified = [{ce-stitch-a-protocol-blocked, fingertip_oob}]`——
那个"本该可判但没判出来"的样本被显式列出，而不是消失在分母里。

---

## 3. 问题三：历史文件保护测试与旧调用入口

### 3.1 保护测试从"算了个哈希"改成真实比较

**旧写法（空壳）**：

```js
check("render-loop/out 未被改写（目录哈希稳定）", typeof dirHash(RENDER_OUT) === "string", dirHash(RENDER_OUT));
```

`typeof x === "string"` 恒真 —— 它只检查"算出了一个哈希"，**不比较任何东西**。

**新写法：两层真实比较**

| 层 | 比较对象 | 能发现 |
|---|---|---|
| (a) 运行内 | 操作**前**快照 vs 操作**后**快照 | 本次操作造成的改动 |
| (b) 跨运行 | 与 `protected-baseline.json` 记录基线比对 | **上次跑完之后**被改过 |

受保护范围（37 个文件）：`render-loop/out`、`bili-loop/out`、`fixtures`、`out`（第一轮证据）、`out-r2`（第二轮证据）。

**比较器自身的自检**（证明它不是空壳）：

| 自检 | 结果 |
|---|---|
| 快照能列出文件（含子目录） | ✅ |
| 未改动时差异为空 | ✅ |
| **单字节改动能被发现** | ✅ `内容改变 a.json` |
| 新增文件能被发现 | ✅ |
| 删除文件能被发现 | ✅ |
| 仅重写同样内容不报差异（按内容而非 mtime） | ✅ |

**端到端验证**（人工制造真实改动）：

```
$ printf '\n' >> practice/src/bili-loop/out/BV1B64y1M7az.json
$ bun tools/assessment/verify-legacy-migration.mjs
FAIL - 受保护文件与记录基线一致（跨运行漂移检测）
        [发现 1 处漂移：bili-loop/out: 内容改变 BV1B64y1M7az.json]
exit 1
```

> 这里有个值得记下的教训：**我第一版新测试仍然是空壳。** 它只做运行内前后比较，
> 所以我手工改了一个受保护文件后再跑，它依然报"37 个文件全部一致"——因为改动发生在
> 两次快照**之间**。加了跨运行基线比对后才真正发现。测试自己也要被测试。

基线重录必须人工显式执行：`bun tools/assessment/verify-legacy-migration.mjs --record-baseline`，
并提示"重录基线等于承认当前状态为已知良好"。

### 3.2 旧调用入口明确拒绝

`bili-loop/run.py` 仍按旧形式调用：`[bun, EVAL_JS, json_path, json_path]`（两个位置参数 + 原地改写）。
新 CLI 已不再原地写回、不再产出 `u_pass`/`v_pass`、且要求显式尺寸。

**修前行为**：第二个位置参数被静默忽略，然后生成一份"看着正常、实际无意义"的结果。

**修后行为**：检测到多个位置参数即**明确拒绝**，退出码 3，并打印可执行说明：

```
拒绝执行：检测到旧调用入口（多个位置参数）。
  收到: "…/BV1B64y1M7az.json" "…/BV1B64y1M7az.json"

本版 eval-frames.mjs 与旧接口不兼容，原因有三：
  1. 不再原地改写输入文件（旧版把结果写回同一个 JSON）；
  2. 不再产出 u_pass / v_pass 字段（旧版把 missing_size 的拒绝评估写成动作负例）；
  3. 必须显式提供尺寸（--width/--height 或 --video），否则整份不可评估。

调用方需要改：practice/src/bili-loop/run.py 的 eval_video_json()。
  旧: [bun, EVAL_JS, json_path, json_path]
  新: [bun, EVAL_JS, json_path, '--width', str(w), '--height', str(h), '--out', str(out_path)]
  并把 summarize() 里读 u_pass/v_pass 改为读 frames[].referenceTargets。
```

实测：退出码 3、输入文件未被改写、不产出任何结果。

---

## 4. 未解决项（如实列出）

| 项 | 状态 | 说明 |
|---|---|---|
| `bili-loop/run.py` 未适配新 CLI | **未解决** | 不在本席写锁（`tools/assessment/` + 三个已授权入口）。它现在会收到退出码 3 并被明确拒绝，**不会悄悄产出错误结果**，但 bili 路径处于"停用"状态。改法见第 3.2 节，已作为请求提交 Grok。 |
| `bili-loop/run.py` 仍读 `u_pass`/`v_pass` | **未解决** | 同上。新 CLI 不再产出这些字段。 |
| 协议真实性未验证 | **设计如此** | 本工具只检查 `collection.protocol` 是否按样本关联到位，不验证协议内容。 |
| 真人评估未执行 | **未执行** | 无真人数据；`practice/src/fixtures/` 为空。报告不含任何真人准确率。 |
| 反例中的 `camera` 样本是构造的 | **必须声明** | 用于验证逻辑，**不是真实采集**。 |
| 保持门阈值 | **仍 UNVERIFIED** | `PASS_FRAMES=6` / `MAX_GAP_MS=400`，序列层结论受此限制。 |
| 未运行会覆盖历史文件的流程 | **有意为之** | 未跑 `render-loop/run.py`（它会清空重建 `render-loop/out/`），只做静态检查。 |

---

## 5. 本轮改动清单

| 文件 | 改动 |
|---|---|
| `lib/report.mjs` | `humanEvidence` 改为**逐样本合取**；新增 `funnel`、`perSample` 矩阵、`stitchingCheck`、`undecidableButOtherwiseQualified`、`attemptedButNoQualified`、`protocolDeclaredNote` |
| `verify-skeleton.mjs` | 新增反例 5/6/7/8 共 21 条断言（62 → 83） |
| `verify-legacy-migration.mjs` | 保护测试改为两层真实比较 + 比较器自检；新增旧调用入口拒绝断言（31 → 49） |
| `samples/counterexamples/generate-counterexamples.mjs` | 新增 `evidence-stitching`（纯陷阱）、`evidence-stitching-positive`（阳性对照）、`evidence-all-blocked` 三组 |
| `protected-baseline.json` | **新增**：受保护文件的记录基线 |
| `practice/src/bili-loop/eval-frames.mjs` | 旧调用入口明确拒绝（退出码 3 + 可执行说明） |
| `ROUND3.md` / `K3-FACT-SUMMARY.md`（更新） | 本文件与给 K3 的事实摘要 |

**未改**：`app.js`、`evaluate.js`、`judge.js`、`types.js`、`letters.json`、`coords.js`、`inputQuality.js`、
`snapshot.js`、`passState.js`、`evaluate.test.js`、`practice/src/fixtures/**`、所有历史 `out*/` 目录。
