# 第二轮：两个已复现问题的修正说明（环节1–3）

日期：2026-09-25。执行方：离线评测与工程工具席。
审查基线：`5b56abd`（= 本轮开始时实际 HEAD，工作区干净）。
复现：`bash tools/assessment/run-all-r2.sh` → 12/12 项符合预期。

**本轮修的是定义错误，不是代码风格。** 两个问题都能在修前稳定复现，且第一轮的 36/36 自检**恰好把问题 1 当成正确行为**。

---

## 1. 问题一：合成数据因标签来源被标为「已执行真人评估」

### 现象

`lib/report.mjs` 旧实现：

```js
const HUMAN_ORIGINS = ["human-annotation", "human-review", "human"];
const humanBuckets = labelOrigins.filter((o) => HUMAN_ORIGINS.includes(o));
humanEvaluation.executed = humanBuckets.length > 0;   // ← 只看标签来源
```

只要标签的 `truthOrigin` 是 `human-annotation`，就置 `executed = true`，**完全不看样本从哪来**。

### 复现（修前，用 `5b56abd` 的 report.mjs 跑本轮反例）

```
PRE-FIX label-only-human      executed=true  | note=存在真人来源标签桶，见 byTruthOrigin。
PRE-FIX source-orthogonality  executed=true  | note=存在真人来源标签桶，见 byTruthOrigin。
```

`label-only-human` 组的三个样本分别是 `synthetic` / `render` / `video`，**一个现场采集样本都没有**，却宣称「已执行真人评估」。
`source-orthogonality` 组同理：render 图和第三方视频被算进了真人成绩。

### 根因

把两条**正交**的轴压成了一个布尔：

- `sourceType` 描述**样本从哪来**（合成 / 渲染 / 第三方视频 / 现场真人）
- `truthOrigin` 描述**标签怎么产生**（构造 / spec / 人工标注）

「人工标注了合成数据」仍然不是「现场真人评估」。旧实现让标签来源触发了样本来源的判断。

### 修法

新增两条轴与一条四段证据链（`lib/report.mjs`）：

| 轴 | 函数/字段 |
|---|---|
| 样本来源轴 | `sourceAxis()` → `constructed` / `third_party_real` / `on_site_human`，报在 `bySourceAxis` |
| 标签来源轴 | 沿用 `byTruthOrigin`（不改） |

```
executed = collected>0 && independentlyLabeled>0 && decidable>0 && protocolDeclared
```

四件事**分开报**，不合并：

| 字段 | 含义 |
|---|---|
| `collected` | 确实来自现场采集（`sourceType=camera`） |
| `independentlyLabeled` | 其中有独立人工标签的 |
| `attempted` | 确实跑过一次评估 |
| `decidable` | 其中真正判得出来的 |
| `allAttemptsBlocked` | 尝试了但全被阻断 → 显式标出，**不算有效结果** |
| `protocolDeclared` | 采集声明了协议（`collection.protocol`） |

第三方实拍（`video`）单独成 `thirdPartyVideo` 桶，不与现场采集合并。

### 修后（实测）

```
label-only-human      executed=false | 现场采集 0 | 独立标签 0 | 已尝试 false | 可判定 0 | 协议声明 false
                      第三方实拍(单独统计): 采集 1 | 独立标签 1 | 可判定 1
source-orthogonality  executed=true  | 现场采集 1 | 独立标签 1 | 已尝试 true  | 可判定 1 | 协议声明 true
                      第三方实拍(单独统计): 采集 1
                      bySourceAxis: on_site_human 1, constructed 2, third_party_real 1
```

`label-only-human` 的标签仍然是 `human-annotation`（如实记录，没有被抹掉），只是**不再触发** `executed`。

### 连带修正：自检里把 bug 当正确的断言

旧断言：

```js
check("真人来源桶存在时才置 executed=true（合成桶不算真人）",
  synReport.humanEvaluation.executed === false && humanLabeled.humanEvaluation.executed === true);
```

它把「给合成样本套上 human-annotation 标签 → executed 变 true」**断言成正确行为**，正是 bug 1 本身。
已替换为 5 条正交断言（合成+人工标签不得宣称真人、`collected=0`、两条轴仍如实记录）。

---

## 2. 问题二：误接收/误拒绝的分母只在可判定样本里，却没标明是条件比例

### 现象

`lib/report.mjs` 旧实现：

```js
falseAcceptRate: rate(b.falseAccept, b.truthIncorrect),   // truthIncorrect 只在 status==="scored" 时累加
```

`truthCorrect` / `truthIncorrect` 只在 `status === "scored"` 时递增，所以分母**已经把被阻断、不可判定的样本排除掉了**。
字段名却叫 `falseAcceptRate`，看不出这是条件比例。

### 复现（修前，metric-cells 组）

```
PRE-FIX metric-cells  误接收(旧字段)=100.0% (1/1)  误拒绝(旧字段)=50.0% (1/2)
```

`1/1` 和 `1/2` 是条件口径。同一批数据按总控要求的**全体口径**应该是 `1/2` 和 `1/5`。
两个数都「不算错」，但**名字不区分**，引用时必然被当成全体口径。

### 修法

字段拆成两层，名字必须区分（`lib/report.mjs`）：

| 层 | 字段 | 分母 |
|---|---|---|
| 全体 | `falseAcceptAll` | **全部**有独立标签的错误样本（含被阻断/不可判定） |
| 全体 | `falseRejectAll` | **全部**有独立标签的正确样本 |
| 覆盖率 | `decidableCoverage.incorrect` / `.correct` | 真值分组里判得出来的 / 该组全体 |
| 条件 | `conditionalOnDecidable.falseAccept` / `.falseReject` / `.agreement` / `.issueAgreement` | 仅在可判定样本里 |

配套：

- 新增 `metricDefinitions` 字段，把每个指标的定义随报告一起输出，杜绝口头解释。
- 结果状态拆开：`blocked` / `undetermined` / `unknown` / `invalid` 各自计数（旧版把 `undetermined` 混进 `blocked`）。
- 分母为 0 一律 `null`，不报 `0%`。
- 新增 `failureClass` 封闭词表，**不把保持未完成、无效时间轴、动作错误混成同一种教学错误**。

### 修后（实测，metric-cells 组）

| 指标 | 修前 | 修后 |
|---|---|---|
| 误放行（全体） | 100.0% (1/1) | **50.0% (1/2)** |
| 明确失败（全体） | 50.0% (1/2) | **20.0% (1/5)** |
| 误放行（conditional） | — | 100.0% (1/1) |
| 明确失败（conditional） | — | 50.0% (1/2) |
| 可判定覆盖率 | 未报 | 错误组 50.0% (1/2)、正确组 40.0% (2/5) |
| 结果分布 | 混在一起 | blocked=2、undetermined=0、unknown=1、invalid=1 |

---

## 3. 失败原因不再混成一种：`failureClass`

序列任务的预期判定层级**先声明**在标签文件里：`labels.json` 的 `sequenceJudgmentLevel`，
当前为 `product_decision`（= `judge().decision === 'pass'`），**不是单帧几何 `pass`**。

`failureClass` 封闭词表（`lib/replay.mjs` 的 `FAILURE_CLASSES`）：

| 值 | 含义 |
|---|---|
| `none` | 预测 correct |
| `action_error` | 几何规则判了，且不合格（**动作错**） |
| `hold_incomplete` | 几何合格但没停稳（**保持未完成**） |
| `blocked_input` | 质量门拦下（出框 / 骨头退化 / 手数不对 / 缺尺寸） |
| `blocked_rules` | 规则本身不可判 |
| `blocked_status` | `practiceStatus` 非 `pose_practice` |
| `undetermined` | 无法判定 |
| `unknown_target` | 目标字母不在 letters.json |
| `invalid_timeline` | 时间轴缺失/无效（**根本没进判定链**） |
| `invalid_metadata` | 其它元数据/数据损坏 |

实测（sequence-levels 组）：`action_error`=1、`hold_incomplete`=1、`invalid_timeline`=1，三者互不相同。

---

## 4. 旧离线入口迁移（环节2-C）

三个入口的规则判定**全部复用共享核心**（`evaluate.js` / `coords.js`），没有复制第二套规则或阈值。

### 4.1 `practice/src/eval-handframe.mjs`

| | 旧版 | 新版 |
|---|---|---|
| 缺尺寸 | 打印 `geometry_pass false` + `missing_size`，**退出码 0** | `status unevaluable` + `not_an_action_negative true`，**退出码 2**；不打印 `geometry_pass` |
| 尺寸来源 | 帧自带 | 帧自带 → 同名兄弟图 → 显式 `--image`（**不用启发式按字母去 demos 找**） |
| 输出 | 固定写文件 | 默认只打印；`--out` 才落盘 |

实测修前：`geometry_pass false` / `missing_size` / exit 0 —— 正是被禁止的「把 missing_size 写成动作负例」。

### 4.2 `practice/src/bili-loop/eval-frames.mjs`

这是第一轮发现的最危险差异。旧版调 `evaluate(letter, lm)` 不传尺寸，把核心的 `missing_size` 拒绝评估
**静默写成了 U/V 的动作负例**。

实测（同一份 BV1B64y1M7az 副本，68 个有手帧）：

| | 旧版 | 新版 |
|---|---|---|
| 退出码 | 0（宣称成功） | 2（不可评估） |
| 写入 `u_pass`/`v_pass` | 90 帧全写 | **不写** |
| `u_issues` | `missing_size` × 68 + `no_hand` × 22 | 不出现在输出里 |
| 判定 | 静默「全 false」 | 明确 `unevaluable` + `not_an_action_negative` |
| U/V 命名 | `u_pass`/`v_pass`（像标签） | `referenceTargets`（对照目标，不是标签） |
| 写回输入文件 | 是（原地改写） | **否**，必须 `--out` |

尺寸来源：帧自带 → `--width/--height` → `--video` 经 ffprobe。读不到就是不可评估，不猜。

### 4.3 `practice/src/render-loop/run.py`

- 调 `eval-handframe` 时传 `--image <渲染图>`，让尺寸从**渲染图文件头**可追溯。
- 接受退出码 0 与 2；3 才当错误。不再把不可评估当异常。
- 结果带 `evaluated` 字段；`RESULTS.md` 新增「已评估 / 不可评估原因」两列，明确写出
  「不可评估的行**不是动作负例**，不得计入任何通过率分子分母」。
- 缺图 / 检测失败 / 无手 也标为不可评估（`missing_image` / `detect_error` / `no_hand`），`pass` 置 `None` 而不是 `False`。

> ⚠ `run.py` 会清空重建 `render-loop/out/`（原有行为，未改动）。要留档请先自行复制。
> 本轮验证**没有运行 `run.py`**，历史产物字节未变（见 `ROUND2-VERIFICATION.md` 第 4 节）。

### 4.4 迁移的边界（未做的部分）

- **`bili-loop/run.py` 未改**：本轮写锁只含 `eval-frames.mjs`。`run.py` 若要写尺寸进帧记录，需要另一轮授权。
  目前 bili 的原始视频已不在 `tmp-media/`，所以 `--video` 这条路在历史数据上**不可用**，只能靠 `--width/--height` 显式声明。
- **没有回填历史产物的元数据**：不猜尺寸、不补 `schemaVersion`、不注入标签。历史产物仍然是缺尺寸的，只是不再被误读。

---

## 5. 兼容性影响

| 变更 | 影响 | 处理 |
|---|---|---|
| `totals.falseAcceptRate` / `falseRejectRate` 删除 | 读旧字段的下游会拿到 `undefined` | 改用 `falseAcceptAll` / `falseRejectAll`（全体）或 `conditionalOnDecidable.*`（条件） |
| `totals.agreement` / `.issueAgreement` 移入 `conditionalOnDecidable` | 同上 | 显式选择层级 |
| `totals.coverage` / `labeledCoverage` → `replayCoverage` / `scoredCoverage` | 第一轮已改，本轮不变 | — |
| `humanEvaluation.note` 语义变化 | 不再由标签来源触发 | 读 `executed` + `onSiteHuman.*` 四段 |
| `humanEvaluation.byTruthOrigin` 桶仍在 | 无破坏 | 标签轴如实保留 |
| `replayOne()` 返回值新增 `decision` / `failureClass` | 纯新增 | — |
| `eval-handframe.mjs` 退出码 0 → 2（不可评估） | 调用方必须区分 0/2/3 | `run.py` 已适配；其它调用方需自查 |
| `eval-frames.mjs` 不再原地写回、不再产出 `u_pass` | 依赖 `u_pass` 的下游会失效 | 改读 `referenceTargets`；且必须显式 `--out` |
| 第一轮报告 `out/*.json` | 字段口径过时 | **保留为历史证据**，不与第二轮混引；`run-all.sh` 已标注历史 |

**核心文件零改动**：`app.js`、`evaluate.js`、`judge.js`、`types.js`、`letters.json`、`evaluate.test.js` 本席均未触碰。
