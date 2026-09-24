# 总控验收材料（环节5）

日期：2026-09-24。提交方：离线评测与工程工具席（ds4.1flash）。写锁：`tools/assessment/`。

---

## 1. 交付清单

全部为**新增**文件，全部位于 `tools/assessment/` 内。**未修改任何他人文件**（证明见第 3 节）。

| 文件 | 环节 | 作用 |
|---|---|---|
| `CONTRACT-DIFF.md` | 1 | 契约差异 + 可回放性矩阵 + 迁移矩阵 |
| `lib/core.mjs` | 2 | 核心适配：只 import，不复制规则 |
| `lib/validate.mjs` | 2 | 最小元数据校验（缺尺寸不猜） |
| `lib/truth.mjs` | 2 | 独立标签装载 + 伪标签整份拒收 |
| `lib/replay.mjs` | 2 | 三层回放（几何 / 质量 / 序列） |
| `lib/report.mjs` | 2 | 带分子分母的指标 + 分桶铁律 |
| `lib/fingerprint.mjs` | 2 | 核心源指纹 |
| `validate-captures.mjs` | 2 | 校验 CLI |
| `replay.mjs` | 2 | 回放 CLI |
| `verify-skeleton.mjs` | 4 | 36 条断言自检 |
| `run-all.sh` | 5 | 一键复现 |
| `samples/generate-synthetic.mjs` | 2 | 合成夹具生成器（24 样本） |
| `samples/synthetic/**` | 2 | 24 个合成样本 + 独立标签 + 伪标签反例 |
| `samples/empty/` | 4 | 零样本目录 |
| `README.md` | 3 | 数据字典 / 运行命令 / 采集缺口 |
| `REQUESTS-TO-GROK.md` | 3 | 接口变更请求 R1–R7（不越锁） |
| `VERIFICATION.md` | 4 | 验证报告 |
| `ACCEPTANCE.md` | 5 | 本文件 |
| `out/**` | — | 全部新报告 + `run-all.log`，未覆盖任何历史产物 |

---

## 2. 基线与改动

| 项 | 基线（本轮开始，`HEAD=9f5dfc7`） | 本轮结束 |
|---|---|---|
| `tools/assessment/` | **不存在** | 18 个文件 + 报告 |
| 核心回归 `evaluate.test.js` | 29 passed / exit 0 | 29 passed / exit 0（**未变**） |
| `practice/src/fixtures/` | 0 个 JSON（仅 README） | 0 个 JSON（**未变**） |
| 历史产物 `render-loop/out`、`bili-loop/out` | 只读 | 只读（**未覆盖**） |
| 核心指纹 | `7a5f6608f0316517` | `7a5f6608f0316517`（**未变**） |
| 提交 | 未 commit / 未 push | 未 commit / 未 push（按要求） |

**未做**：训练任何模型、编造任何评测成绩、修改核心代码或 `evaluate.test.js`、覆盖历史产物、commit、push。

---

## 3. 写锁合规证明

```
git -c core.quotepath=false status --porcelain | grep -v '^??'   # 与初始快照逐行比对
=> 新增修改项：空
```

本席的全部产出都是 `??`（未跟踪）状态的新文件，路径前缀统一为 `tools/assessment/`。
`practice/src/**`、`practice/app.js`、`practice/content/letters.json`、`blender/**`、`docs/**` 均未被本席改动。
（`practice/src/fixtures/README.md` 与 8 张 demo PNG 在初始快照里就已是修改状态，mtime 为 09-22，非本席所为。）

---

## 4. 可复现证据

```bash
bash tools/assessment/run-all.sh
```

**结果：10/10 项符合预期，36/36 断言通过。** 完整日志：`tools/assessment/out/run-all.log`。

| # | 检查 | 期望退出码 | 实测 |
|---|---|---|---|
| 1 | 核心回归 `evaluate.test.js` | 0 | 0 ✅ |
| 2 | 生成合成夹具 | 0 | 0 ✅ |
| 3 | 骨架自检（36 断言） | 0 | 0 ✅ |
| 4 | 校验合成夹具（含 5 个故意坏样本） | 1 | 1 ✅ |
| 5 | 回放 + 独立标签 | 0 | 0 ✅ |
| 6 | 回放 + 伪标签（整份拒收） | 1 | 1 ✅ |
| 7 | 零样本目录 | 0 | 0 ✅ |
| 8 | 校验 `render-loop/out`（全阻断） | 1 | 1 ✅ |
| 9 | 校验 `bili-loop/out`（全阻断） | 1 | 1 ✅ |
| 10 | 校验 `fixtures/`（空） | 0 | 0 ✅ |

产出报告：`out/replay-synthetic.json`、`out/replay-pseudo-rejected.json`、`out/replay-empty.json`、`out/validate-{synthetic,render-loop,bili-loop,fixtures}.json`、`out/core-fingerprint.json`。

---

## 5. 核心结论（需总控注意）

### 5.1 历史结果全部无法按当前版本等价回放

`render-loop/out` 2/2、`bili-loop/out` 4/4 **全部阻断**。缺 `schemaVersion`、缺尺寸、缺 `targetLetterId`、缺可用时间轴。

### 5.2 最危险的一条：缺 geom 的语义已静默反转

旧 `bili-loop/eval-frames.mjs` 调 `evaluate(letter, lm)` 不传 geom；当前核心对此返回 `pass=false, ruleStatus="missing_size"`（拒绝评估），旧契约下是**真的在算几何**。

实测 BV1B64y1M7az（68 个有手帧）：存档 `u_pass==true` 1 个，重算 0 个；一致率 67/68，但**差异恰好落在唯一的正例上**。重跑旧 CLI 会静默产出「全部 false」，看起来像一堆真负例。

**这不是「结果略有出入」，是「不知道」被伪装成「不合格」。** 已在 `REQUESTS-TO-GROK.md` R1 请求修复，本席未越锁代改。

### 5.3 三层判定已分离，互不冒充

- **几何单帧**（`evaluate.pass`）：手型是否符合规则
- **质量/内容**（`assessInputQuality.ok`）：输入够不够判
- **连续序列**（`judge.decision`）：保持门是否开放

`GF0021.U` 是 mainPath 里唯一 `pending_review` 的字母：几何 `correct`、产品 `decision=blocked`。本席把它固化成断言，两者不混算。

### 5.4 目标与预测都不当标签

- `targetLetterId` = 当时选中目标，不是正确答案（沿用 `snapshot.js` 首行约定）
- 历史产物里的 `u_pass`/`v_pass`/`u_issues`/`v_issues` 是旧工具的**预测**，只记 `pseudo_label_field` 警告
- 标签必须来自独立文件，`independent !== true` 或 `reviewedBy` 命中 `auto/model/judge/...` 即判伪标签，**整份拒收**

---

## 6. 接口冻结与写锁移交状态

### 已冻结（本席已适配并写入报告）

| 接口 | 冻结依据 |
|---|---|
| schema v2 字段集 | `snapshot.js` 的 `SNAPSHOT_FIELDS` |
| 坐标空间与缺尺寸裁决 | `coords.js` 的 `geometryError` |
| 几何判定 | `evaluate()` 的 `pass` / `ruleStatus` |
| 质量门 | `assessInputQuality()` 的 `ok` / `reason` |
| 编排 | `judge()` 的 `decision`（四值） |
| 回放契约 | `types.js` 的「DS frozen replay contract」注释 |
| `practiceStatus` 只来自 letters.json | `judge.js` 首行注释 |

### 未冻结 / 待裁定（阻塞旧脚本迁移）

| 编号 | 事项 | 阻塞什么 |
|---|---|---|
| R1 | 旧 CLI 缺 geom 的静默反转 | **阻塞** `bili-loop/eval-frames.mjs` 的迁移 |
| R2 | `ruleStatus !== "ok"` 不是几何负例，需写进契约注释 | 阻塞第三方回放器 |
| R3 | 导出侧挡住 verdict 类字段 | 阻塞真人采集 |
| R4 | `judge` 不透出保持门阈值 | 不阻塞（本席直读常量），但影响可解释性 |
| R5 | `decision` 是否封闭四值 | 不阻塞（白名单 + 未知值落 blocked 并报出） |
| R6 | mainPath 含 `pending_review` 的 U 是否有意 | 不阻塞，但采集者会踩坑 |
| R7 | 提交 A08、修 `handedness` 形状门槛（总控指定） | 阻塞真人数据入库 |

### 关于「迁移旧离线脚本」

**本轮不迁移。** 按总控要求，只有**接口冻结且写锁正式移交**后才能动 `practice/src/eval-handframe.mjs` 与 `practice/src/bili-loop/eval-frames.mjs`。

当前状态：**写锁未移交**（两文件不在本席写锁内，本席未改动它们），且 R1/R7 未回执。
移交后本席的计划（已备好，等授权）：

1. 把 `lib/` 的三层回放接到两个旧入口，删除重复的规则副本，统一走核心。
2. `eval-handframe.mjs` 缺尺寸时**报错退出**而非输出 `false`（或补真实尺寸后正常判定，取决于 R1 裁定）。
3. `bili-loop` 产物移除 `u_pass`/`v_pass`/`u_issues`/`v_issues`（预测混入数据），或移入 `_legacy` 命名空间。
4. 重跑 `run-all.sh`，更新 `CONTRACT-DIFF.md` 矩阵与 `VERIFICATION.md`。

---

## 7. 未执行与限制（如实列出）

1. **真人评估未执行。** 无真人数据；`humanEvaluation.executed = false`；本报告不含任何真人准确率。
2. **合成集的百分比不是准确率。** 24 个样本全部 `sourceType=synthetic`、`humanReviewed=false`，正负例由构造决定，只证明骨架接线正确。
3. **`pending_review` / `demo_only` 字母未评测。** letters.json 里 18 + 5 个；仅 9 个 `pose_practice`。
4. **保持门阈值未验证。** `PASS_FRAMES=6` / `MAX_GAP_MS=400` 仍标 UNVERIFIED；序列层结论受此限制，报告已随附这两个值与警告。
5. **国标符合性未验证。** 本席只验证「回放接线」，不验证 `letters.json` 的规则是否与 GF 0021-2019 外形一致。
6. **未跨核心版本回归。** 报告只对应指纹 `7a5f6608f0316517`；核心改动后本报告作废，需重跑 `run-all.sh`。
7. **未尝试强行回放历史产物。** 补尺寸/时间轴需要人工提供原始信息（渲染分辨率、`ffprobe` 时间轴、字母标注），本席不猜。
8. **合成手型是几何构造，不是真人手。** 生成器只摆关节角，不含皮肤、遮挡、运动模糊、摄像头畸变，**不能**用来估计真人场景下的性能。

---

## 8. 需要总控裁定的事项

1. **R1 选方案 A（补真实尺寸）还是 B（缺 geom 直接报错）？** 本席倾向 A 补数据 + B 保底。
2. **`practiceStatus` 是否调整？** 若要让 U 出数，需把 U 从 `pending_review` 改出，那是核心文件改动，本席不在写锁内。
3. **真人采集的导出字段是否现在冻结？** 建议在开采集之前定死 `handedness` 形状与 `codeVersion`/`rulesVersion` 填法（R3、R7），否则采完发现字段不符，数据要重采。
4. **是否把本席的合成夹具纳入 `evaluate.test.js` 的 A08 枚举？** 本席刻意放在 `tools/assessment/samples/` 以**避免污染真人 fixtures**（总控第 166 行要求）。若总控希望 A08 也扫合成样本，需要改 `evaluate.test.js`（不在本席写锁内）。
