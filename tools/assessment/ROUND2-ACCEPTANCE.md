# 第二轮总控验收材料（环节5）

日期：2026-09-25。提交方：离线评测与工程工具席（ds4.1flash）。
审查基线：`5b56abd`（= 本轮开始时实际 HEAD，工作区干净）。
复现：`bash tools/assessment/run-all-r2.sh` → **13/13 项符合预期，exit 0**。

---

## 1. 本轮改动清单

### 1.1 写锁内（`tools/assessment/`）

| 文件 | 改动 |
|---|---|
| `lib/report.mjs` | **重写**：来源轴/标签轴正交；`executed` 四段证据链；全体口径 + conditional 口径；结果状态拆开；`metricDefinitions` 随报告输出 |
| `lib/replay.mjs` | 新增 `decision` / `failureClass` 字段与 `FAILURE_CLASSES` 封闭词表；时间轴问题独立归类 |
| `replay.mjs`（CLI） | 输出改为两层口径 + 结果分布 + 失败分类 + 四段真人证据 |
| `verify-skeleton.mjs` | **替换那条把 bug 1 当正确的断言**（→ 5 条正交断言）；新增 4 组反例共 21 条断言；修旧字段名 |
| `samples/lib/hand.mjs` | **新增**：共享合成手型构造器（从 generate-synthetic.mjs 抽出，避免复制第二份） |
| `samples/generate-synthetic.mjs` | 改为引用共享构造器；**产物字节不变**（仅 MANIFEST 时间戳变） |
| `samples/counterexamples/` | **新增**：生成器 + 4 组反例（`label-only-human` / `source-orthogonality` / `metric-cells` / `sequence-levels`） |
| `verify-legacy-migration.mjs` | **新增**：旧入口迁移专项验证（31 断言，含历史产物只读性） |
| `pre-fix-evidence.mjs` | **新增**：用 `5b56abd` 的旧 report.mjs 复现两个 bug，落盘到 `out-r2/pre-fix/` |
| `run-all-r2.sh` | **新增**：第二轮一键复现（13 步） |
| `run-all.sh` | 标注为第一轮历史脚本（保留，产出 `out/`） |
| `README.md` | 数据字典、指标定义、分桶铁律按第二轮口径更新 |
| `REQUESTS-TO-GROK.md` | 追加 R1–R7 第二轮重核 |
| `ROUND2.md` / `ROUND2-VERIFICATION.md` / `ROUND2-ACCEPTANCE.md` / `K3-FACT-SUMMARY.md` | **新增** |
| `out-r2/` | **新增**：本轮全部证据（不覆盖 `out/`） |

### 1.2 已授权迁移（三个旧离线入口）

| 文件 | 改动 |
|---|---|
| `practice/src/eval-handframe.mjs` | 缺尺寸 → `unevaluable` + 退出码 2，不打印 `geometry_pass`；尺寸只从帧字段/同名兄弟图/显式 `--image` 追溯；默认只打印，`--out` 才落盘 |
| `practice/src/bili-loop/eval-frames.mjs` | 缺尺寸 → 整份 `unevaluable` + 退出码 2，**不再产出 `u_pass`/`v_pass`**；**不再原地写回**；U/V 改称 `referenceTargets`；尺寸来源 帧/`--width,--height`/`--video`(ffprobe) |
| `practice/src/render-loop/run.py` | 传 `--image` 让尺寸可追溯；接受退出码 0/2；结果带 `evaluated`；RESULTS 表新增「已评估/不可评估原因」两列；缺图/检测失败/无手也标不可评估 |

### 1.3 明确未改

`practice/app.js`、`practice/src/evaluate.js`、`practice/src/judge.js`、`practice/src/types.js`、
`practice/content/letters.json`、`practice/src/evaluate.test.js`、`practice/src/coords.js`、
`practice/src/inputQuality.js`、`practice/src/snapshot.js`、`practice/src/passState.js`
—— 全部零改动。核心的 `ruleStatus` 词汇表与判定逻辑一行未动，本席只调用。

---

## 2. 定义变化（兼容性核心）

| 项 | 修前 | 修后 |
|---|---|---|
| `executed` 的触发 | 只看标签来源（`truthOrigin` ∈ human-*） | 只看样本来源 + 四段证据链（现场采集 ∧ 独立标签 ∧ 可判定 ∧ 协议声明） |
| 真人证据 | 一个布尔 + 一句话 | `collected` / `independentlyLabeled` / `attempted` / `decidable` / `allAttemptsBlocked` / `protocolDeclared` 分开报 |
| 第三方实拍 | 混进「真人」 | `thirdPartyVideo` 单独成桶 |
| 误接收/误拒绝 | `falseAcceptRate` / `falseRejectRate`（条件口径，名字未标明） | `falseAcceptAll` / `falseRejectAll`（全体）+ `conditionalOnDecidable.*`（条件），名字强制区分 |
| 结果状态 | `blocked` 笼统 | `blocked` / `undetermined` / `unknown` / `invalid` 分开计数 |
| 失败原因 | 未区分 | `failureClass` 封闭词表：`action_error` ≠ `hold_incomplete` ≠ `invalid_timeline` |
| 序列判定层级 | 未声明 | 标签文件 `sequenceJudgmentLevel`（当前 `product_decision`） |
| 指标定义 | 靠口头解释 | `metricDefinitions` 随报告输出 |
| 旧入口缺尺寸 | 静默 `pass=false` / 退出码 0 | `unevaluable` / 退出码 2 / 不产出 pass 字段 |

---

## 3. 修前 / 修后证据

全部可复现（`pre-fix-evidence.mjs` 用 `5b56abd` 的旧 report.mjs 跑同一批反例）。

### 3.1 问题一：`executed` 误报

| 反例组 | 修前 | 修后 |
|---|---|---|
| `label-only-human`（synthetic/render/video + 全 human-annotation 标签，**无现场采集**） | `executed=true`，note=「存在真人来源标签桶」 | **`executed=false`**，`collected=0` |
| `source-orthogonality`（4 来源 + 同一批 human-annotation 标签） | `executed=true`，render/video 被算进真人 | `executed=true` **但仅因那 1 个 `camera`+协议样本**；`bySourceAxis` 显示 `constructed 2 / third_party_real 1 / on_site_human 1` |

### 3.2 问题二：分母口径

| 指标（`metric-cells` 组） | 修前 | 修后 |
|---|---|---|
| 误放行 | 100.0% (**1/1**) | 全体 **50.0% (1/2)**；conditional 100.0% (1/1) |
| 明确失败 | 50.0% (**1/2**) | 全体 **20.0% (1/5)**；conditional 50.0% (1/2) |
| 可判定覆盖率 | 未报 | 错误组 50.0% (1/2)、正确组 40.0% (2/5) |
| 结果分布 | 只有 `blocked` | `blocked=2`、`undetermined=0`、`unknown=1`、`invalid=1` |

分母正确性核对：正确组全体 5 = 1(TP)+1(明确失败)+1(阻断)+1(invalid)+1(unknown)；错误组全体 2 = 1(误放行)+1(阻断)。

### 3.3 旧入口（同一份 bili 包副本）

| | 修前 | 修后 |
|---|---|---|
| 退出码 | 0（宣称成功） | **2**（不可评估） |
| 写入 `u_pass`/`v_pass` | 90 帧全写 | **不写** |
| `u_issues` | `missing_size` × 68 + `no_hand` × 22 | 不出现在输出 |
| 写回输入文件 | 是 | **否** |

`eval-handframe` 同理：修前 `geometry_pass false` + `missing_size` + exit 0；修后 `status unevaluable` + exit 2，且不打印 `geometry_pass`。

---

## 4. 命令与退出码

| 命令 | 退出码 | 含义 |
|---|---|---|
| `bash tools/assessment/run-all-r2.sh` | 0 | 13/13 符合预期 |
| `bun tools/assessment/verify-skeleton.mjs` | 0 | 62/62 断言通过 |
| `bun tools/assessment/verify-legacy-migration.mjs` | 0 | 31/31 断言通过 |
| `bun tools/assessment/pre-fix-evidence.mjs` | 0 | 修前证据生成成功 |
| `bun practice/src/evaluate.test.js` | 0 | 29 passed（核心，本席未改） |
| `bun tools/assessment/replay.mjs <dir> --labels …` | 0 / 1 | 1 = 有 invalid 或标签被拒 |
| `bun practice/src/eval-handframe.mjs` | 0 / 2 / 3 | 0 已评估 / 2 不可评估 / 3 用法错误 |
| `bun practice/src/bili-loop/eval-frames.mjs` | 0 / 2 / 3 | 同上 |

---

## 5. 核心指纹与并发改动

本轮开始时核心指纹 `7a5f6608f0316517`（第一轮值）；结束时为 **`0028db7556de2303`**。

变化来自 **Grok 在会话期间的未提交改动**（本席未触碰）：
`passState.js`（`holdView` 透出阈值）、`snapshot.js`（新增 `FORBIDDEN`）、`types.js`（`decision` 四值联合 + 回放契约注释）、`evaluate.test.js`（A08）。

这些改动**没有改变本席依赖的任何判定语义**（`coords.js` / `evaluate.js` / `judge.js` 哈希未变），
所以本轮结论仍然成立。但按规矩：**报告只对应 `out-r2/core-fingerprint.json` 的指纹；核心再变则报告作废，需重跑 `run-all-r2.sh`。**

---

## 6. 剩余风险

1. **真人评估仍未执行。** `practice/src/fixtures/` 为空，报告不含任何真人准确率。
2. **反例组 2 的 `camera` 样本是构造的**，只用于验证 `executed` 逻辑，不是真实采集。
   真实采集必须由采集流程写入 `collection.protocol`。
3. **`render-loop/run.py` 未在真实渲染流程上跑过**（它会清空重建 `render-loop/out/`，为避免覆盖历史产物，只做静态检查）。
4. **`bili-loop/run.py` 未改**（不在本轮写锁）。它仍按旧接口调用，会与新 CLI 不匹配；
   已作为「R1-连带」请求提交 Grok。bili 原始视频已不在 `tmp-media/`，历史数据只能靠 `--width/--height` 显式声明尺寸。
5. **保持门阈值仍 UNVERIFIED**（`PASS_FRAMES=6` / `MAX_GAP_MS=400`），序列层结论受此限制。
6. **国标符合性未验证**：只验证回放接线，不验证 `letters.json` 规则与 GF 0021-2019 外形是否一致。
7. **`types.js` 的 `ruleStatus` 注释与代码不符**（注释写了 `no_letter/no_rules/unknown_rule_fields`，
   代码实际是 `ok/no_hand/empty/unsupported/invalid_input`）。本席按**代码**实现，已请 Grok 修注释。
   若将来有人按注释写白名单，会把真实的 `empty`/`unsupported` 当未知值。
8. **`run-all.sh`（第一轮）仍会产出旧口径报告**。已加历史标注，但若有人误跑并引用 `out/`，会得到条件口径数字。
9. **未做跨核心版本回归**：本轮只对应上述指纹，未验证在其它核心版本下的行为。

---

## 7. 需要总控裁定

1. **`bili-loop/run.py` 的接口跟进**（R1-连带）：是否授权下一轮改它，把尺寸写进帧记录并适配新 CLI？
2. **`types.js` 的 `ruleStatus` 注释修正**（R2 剩余）：是否要求 Grok 立即修，还是等核心稳定后一起改？
3. **真人采集的字段冻结**（R7 剩余）：`handedness` 形状、`codeVersion`/`rulesVersion` 填法需在开采集前定死。
4. **是否把反例夹具纳入 A08**：本席刻意放在 `tools/assessment/samples/` 以免污染 `practice/src/fixtures/`。
5. **第一轮报告 `out/` 是否保留**：本席按「不覆盖历史产物」保留，并加了历史标注。若总控希望删除以免误引，请指示。

---

## 8. 自检（本席对自己工作的核对）

- ✅ 全部产出在写锁内，或在本轮明确授权的三个文件内。
- ✅ 未改 `app.js` / `evaluate.js` / `judge.js` / `types.js` / `letters.json` / 核心测试。
- ✅ 历史产物 `render-loop/out`、`bili-loop/out` 与第一轮证据 `out/` 字节未变（`run-all-r2.sh` 第 10 节核对）。
- ✅ 未训练任何模型、未编造评测成绩、未 commit / push / 上传。
- ✅ 全部测试数据标为合成，不进真人 `fixtures`。
- ✅ 未复制第二套规则：三个旧入口的判定全部调用共享核心。
- ⚠ 未做真人评估（无数据），已如实报告。
