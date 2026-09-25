# 第二轮验证报告（环节4）

日期：2026-09-25。执行方：离线评测与工程工具席。
复现：`bash tools/assessment/run-all-r2.sh` → **12/12 项符合预期**。
独立自检：`bun tools/assessment/verify-skeleton.mjs` → **62/62 断言通过**（exit 0）；
`bun tools/assessment/verify-legacy-migration.mjs` → **31/31 断言通过**（exit 0）；
核心回归 `bun practice/src/evaluate.test.js` → **29 passed**（exit 0，核心由 Grok 持有，本席未改）。

> **本报告不含任何真人评估结果。** 全部样本为合成/构造夹具。`humanEvaluation.executed` 在除
> `source-orthogonality` 反例组（其唯一 `camera` 样本是**构造出来验证逻辑的**，不是真实采集）之外均为 `false`。
> 合成桶的百分比只证明骨架接线正确，**不是准确率**。

---

## 0. 方法：先写修前能失败的反例

第一轮 36/36 通过**不能**证明定义正确——其中一条断言恰好把 bug 1 当成正确行为。
所以本轮先写反例（`samples/counterexamples/`，4 组），**在修改前跑**，确认它们确实失败。

### 修前（`5b56abd` 的 `lib/report.mjs`，跑本轮反例）

| 反例组 | 修前实测 | 是否暴露问题 |
|---|---|---|
| `label-only-human`（synthetic/render/video + 全 human-annotation 标签） | `executed=true`，note=「存在真人来源标签桶」 | ✅ 暴露问题 1 |
| `source-orthogonality`（4 来源 + 同一批 human-annotation 标签） | `executed=true`，render/video 被算进真人 | ✅ 暴露问题 1 |
| `metric-cells` | 误接收 `1/1`、误拒绝 `1/2`（条件口径，名字未标明） | ✅ 暴露问题 2 |
| `metric-cells` 结果状态 | 只有 `blocked` 一个笼统计数 | ✅ 暴露问题 2 |

### 修前（旧离线入口）

```
$ bun <5b56abd 的 eval-handframe.mjs> render-loop/out/GF0021.A.json GF0021.A
geometry_pass false
missing_size
EXIT=0          ← 把 missing_size 写成动作负例，且退出码 0

$ bun <5b56abd 的 eval-frames.mjs> <BV1B64y1M7az 副本>
wrote <副本>
EXIT=0          ← 宣称成功
  副本里写入：u_pass false × 90、v_pass false × 90
  u_issues 分布：{('missing_size',): 68, ('no_hand',): 22}   ← 68 个有手帧全被拒绝评估
```

---

## 1. 反例组 1：synthetic + human-annotation 不得宣称真人评估

**修前**：`executed=true`（bug）。
**修后**：

```
样本 3 | 有标签 3 | 已评分 3
真人评估 executed=false | 现场采集 0 | 独立标签 0 | 已尝试 false | 可判定 0 | 协议声明 false
第三方实拍(单独统计): 采集 1 | 独立标签 1 | 可判定 1
byTruthOrigin:  human-annotation 3     ← 标签轴如实记录，没有被抹掉
bySourceAxis:   constructed 2, third_party_real 1
```

| 断言 | 结果 |
|---|---|
| 仅人工标签(合成/渲染/视频) => executed=false | ✅ |
| 标签确实是 human-annotation（不是没标签） | ✅ |
| 第三方视频单独成桶，不与现场真人合并 | ✅ |

**误报消除：修前 1 例误报「已执行真人评估」，修后 0 例。**

---

## 2. 反例组 2：render + 人工标注不得混入现场真人桶

```
样本 4 | 有标签 4 | 已评分 4
真人评估 executed=true | 现场采集 1 | 独立标签 1 | 已尝试 true | 可判定 1 | 协议声明 true
第三方实拍(单独统计): 采集 1 | 独立标签 1 | 可判定 1
bySourceAxis: on_site_human 1, constructed 2, third_party_real 1
```

| 断言 | 结果 |
|---|---|
| render 不得混入现场真人桶（`constructed`=2，`onSiteHuman.collected`=1） | ✅ |
| 现场采集样本声明了协议 => executed=true，且四件事分开报 | ✅ |
| 第三方实拍单独统计，不与现场真人合并 | ✅ |

关键：四个样本**标签完全相同**（都是 human-annotation），只有 `sourceType` 不同；
`executed` 仍能正确区分，证明两条轴已正交。

---

## 3. 反例组 3：全体口径 vs conditional 口径

样本被刻意钉在特定 (真值, 预测) 格子上：错误组 2 个（一通过、一阻断），正确组 5 个（一 TP、一明确失败、一阻断、一 invalid、一 unknown）。

```
样本 7 | 有标签 7 | 已评分 3 | blocked 2 | undetermined 0 | unknown 1 | invalid 1
真值：correct 5（可判定 2）、incorrect 2（可判定 1）
混淆：TP=1 FA=1 FR=1 TN=0
failureClass: blocked_input 2, none 2, action_error 1, invalid_metadata 1, unknown_target 1
blockReasons: fingertip_oob 2, missing_size 1, unknown_target 1
```

| 指标 | 分子/分母 | 期望 | 结果 |
|---|---|---|---|
| **全体** 误放行 `falseAcceptAll` | 1/2 | 1/2 | ✅ |
| **全体** 明确失败 `falseRejectAll` | 1/5 | 1/5 | ✅ |
| **conditional** 误放行 | 1/1 | 1/1（单列） | ✅ |
| **conditional** 明确失败 | 1/2 | 1/2（单列） | ✅ |
| 可判定覆盖率 错误组 | 1/2 | 1/2 | ✅ |
| 可判定覆盖率 正确组 | 2/5 | 2/5 | ✅ |
| blocked / undetermined / invalid / unknown 分开 | 2 / 0 / 1 / 1 | 分开计数 | ✅ |
| blocked 原因可查 | `fingertip_oob` × 2 | 可查 | ✅ |
| 全体口径 ≠ conditional 口径（禁止互换） | 50.0% vs 100.0% | 不同 | ✅ |
| 缺尺寸样本 => `invalid` / `missing_size` | ✅ | ✅ | ✅ |
| 未知目标字母 => `unknown`，不折算成 incorrect | `predicted=null` | ✅ | ✅ |

**分母正确性**：正确组全体分母 5 = 1(TP) + 1(明确失败) + 1(阻断) + 1(invalid) + 1(unknown)；
错误组全体分母 2 = 1(误放行) + 1(阻断)。修前的 `1/1`、`1/2` 只是条件口径。

---

## 4. 反例组 4：序列判定层级（三类失败不混同）

标签文件先声明 `sequenceJudgmentLevel: "product_decision"`（= `judge().decision==='pass'`，不是单帧几何）。

```
样本 4 | 有标签 4 | 已评分 3 | invalid 1
failureClass: action_error 1, hold_incomplete 1, invalid_timeline 1, none 1
可判定覆盖率：错误组 2/3、正确组 1/1
```

| 断言 | 结果 |
|---|---|
| 序列标签先声明预期判定层级 product_decision | ✅ |
| 动作错误 => `action_error` | ✅ |
| 保持未完成 => `hold_incomplete` | ✅ |
| 无效时间轴 => `invalid_timeline`（`status=invalid`） | ✅ |
| 三种失败原因互不相同 | ✅ |
| 序列通过 => `none` + `decision=pass` | ✅ |

---

## 5. 原有有效回归（全部保留）

以下第一轮断言**未修改**且仍通过：

- 几何正例 7 条、几何负例 2 条（含问题码命中 `index_middle.not_apart` / `thumb_index.angle`）
- U 几何 `correct` 但产品 `decision=blocked`（不混算）
- 序列放行 1 条、不放行 4 条（帧数不足 / 401ms / 重复 videoTime / 时间倒退）
- 序列内无手帧记 `frames_without_hand` 警告，不阻断
- 缺尺寸 => `invalid` / `missing_size`，不猜尺寸
- 未知坐标空间 => `unsupported_coord_space`；`equal_scale_unit` 显式通道可回放
- 坏数值 3 条（NaN / null / 20 点）+「坏数值不产生任何预测」
- 伪标签 4 条：整份拒收、原因覆盖、拒后不评分、采集文件内伪标签字段只当警告
- 孤立标签 1 条
- 无标签 3 条：仍回放、不报准确率、`executed=false`
- 零样本 2 条：0 样本、分母 0 => `null`、不报真人评估

**唯一被替换的断言**是那条把 bug 1 当正确的：已换成 5 条正交断言。

---

## 6. 旧离线入口迁移验证（31 断言）

| 场景 | 命令 | 退出码 | 输出要点 |
|---|---|---|---|
| handframe 缺尺寸 | `<frame> <letter>`（无尺寸、无兄弟图） | **2** | `status unevaluable`、`not_an_action_negative true`、**不打印 `geometry_pass`** |
| handframe 显式 `--image` | `... --image demos/GF0021.A_front.png` | **0** | `geometry_pass` 有真实含义 |
| handframe 帧自带尺寸 | `...`（帧含 `imageWidth/Height`） | **0** | 已评估 |
| handframe 未知目标 | `<frame> GF0021.NOPE` | **2** | `unevaluable`，不打印 `geometry_pass` |
| handframe 无参数 | `...` | **3** | 用法错误 |
| bili 缺尺寸 | `<pack>` | **2** | `unevaluable`、**不产出 `u_pass`/`v_pass`**、**不写回输入文件** |
| bili 显式尺寸 | `<pack> --width 1280 --height 720` | **0** | 68/90 帧可判定，仍不写回输入 |
| bili 无参数 | `...` | **3** | 用法错误 |

bili 报告结构：帧用 `referenceTargets: {U: {...}, V: {...}}`（**对照目标，不是标签**），
不再有 `u_pass`/`v_pass`；报告带 `letterLabeled: false`（不报准确率）。

### 历史产物只读性（第 4 节验证）

| 检查 | 结果 |
|---|---|
| `practice/src/render-loop/out` 目录哈希稳定 | ✅ |
| `practice/src/bili-loop/out` 目录哈希稳定 | ✅ |
| 历史 render 帧仍无 `imageWidth/imageHeight`（**没有事后补造元数据**） | ✅ |
| 历史 bili 帧仍无尺寸字段 | ✅ |
| 历史 bili 包未被注入标签 | ✅ |
| 第一轮证据 `tools/assessment/out/` 未被改写 | ✅（`run-all-r2.sh` 第 10 节核对） |

`run.py` 静态检查：传 `--image`、接受退出码 2、结果带 `evaluated`、不再写 `pass=false` 行、RESULTS 表区分已评估。5/5 ✅。

> 本轮**没有运行 `render-loop/run.py`**（它会清空重建 `render-loop/out/`）。该脚本的改动只做静态检查，
> 未在真实渲染流程上跑过。这是本报告的剩余风险之一。

---

## 7. 覆盖率与结果分布（修后，各反例组）

| 组 | 样本 | 有标签 | 已评分 | blocked | undetermined | unknown | invalid | 回放覆盖 |
|---|---|---|---|---|---|---|---|---|
| `label-only-human` | 3 | 3 | 3 | 0 | 0 | 0 | 0 | 100% |
| `source-orthogonality` | 4 | 4 | 4 | 0 | 0 | 0 | 0 | 100% |
| `metric-cells` | 7 | 7 | 3 | 2 | 0 | 1 | 1 | 100% |
| `sequence-levels` | 4 | 4 | 3 | 0 | 0 | 0 | 1 | 100% |
| `samples/synthetic` | 24 | 15 | 15 | 0 | 0 | 0 | 5 | 79.2% (19/24) |

`invalid` 全部是**故意构造**的坏样本（缺尺寸、NaN、点数不足、未知坐标空间、缺时间轴）。

---

## 8. 未执行 / 限制（如实列出）

1. **真人评估未执行。** 无真人数据；`practice/src/fixtures/` 为空。本报告不含任何真人准确率。
2. **反例组 2 的 `camera` 样本是构造的**，用于验证 `executed` 的判定逻辑，**不是真实采集**。
   它声明了 `collection.protocol` 以走通逻辑；真实采集时必须由采集流程写入该字段。
3. **`render-loop/run.py` 未在真实渲染流程上运行**，只做静态检查（避免清空历史 `out/`）。
4. **`bili-loop/run.py` 未改**（不在本轮写锁）。bili 原始视频已不在 `tmp-media/`，
   所以历史数据无法用 `--video` 追溯尺寸，只能用 `--width/--height` 显式声明。
5. **保持门阈值仍 UNVERIFIED**（`PASS_FRAMES=6` / `MAX_GAP_MS=400`）。序列层结论受此限制，报告随附生效值与 `unverified: true`。
6. **国标符合性未验证。** 只验证回放接线，不验证 `letters.json` 的规则是否与 GF 0021-2019 外形一致。
7. **核心正在被并发修改。** 本轮期间 Grok 在改 `passState.js`/`snapshot.js`/`types.js`/`evaluate.test.js`。
   本报告对应 `core-fingerprint.json` 的指纹；核心再变则本报告作废，需重跑 `run-all-r2.sh`。
8. **`types.js` 的 `ruleStatus` 注释与代码不一致**（见第 9 节），本目录按代码实现，不按注释。

---

## 9. 给总控的事实提示（不属本轮写锁，未改）

1. `types.js` 注释把 `ruleStatus` 写作 `no_letter/no_rules/unknown_rule_fields`，
   但 `evaluate.js` 实际只返回 `ok/no_hand/empty/unsupported/invalid_input`
   （另有几何拒绝时带的 `missing_size`、`unsupported_coord_space`）。**以代码为准**，已请 Grok 修。
2. `snapshot.js` 的 `FORBIDDEN` 集合含 `t`。但 `t` 是**旧离线产物**的合法字段名（render/bili 都用它），
   与采集快照的 `frameId`/`capturedAt` 不冲突。本席的离线回放器**不调用** `createSnapshot`，所以不受影响；
   但若将来用 `createSnapshot` 校验历史帧，会被 `forbidden_field` 挡住——这是有意的，历史帧本来就不合规。
3. `evaluate.test.js` 的 A08 会扫 `practice/src/fixtures/` 并对每条 JSON 做严格 schema 断言。
   本席的合成夹具放在 `tools/assessment/samples/`，**不进真人 fixtures 目录**，不会触发 A08。
