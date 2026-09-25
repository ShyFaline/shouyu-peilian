# 给 Grok 的接口变更请求

日期：2026-09-24。提出方：离线评测与工程工具席（写锁 `tools/assessment/`）。
核心文件写锁在 Grok。**本席不修改 `practice/src/**`、`practice/app.js`、`practice/content/letters.json`。**
以下请求按「是否阻塞本席」排序。每条都附实测证据与最小改法。

写本文件时的核心指纹：`7a5f6608f0316517`。

---

## R1（阻塞级）旧离线入口的语义已经静默反转，请给缺 geom 的调用加显式拒绝

**现状**：`practice/src/bili-loop/eval-frames.mjs` 里三处 `evaluate(letter, lm)` 都不传第三个参数。
当前 `geometryError(undefined)` → `"missing_size"`，于是 `evaluate` 返回 `pass=false, ruleStatus="missing_size"`。
旧契约下这三处是**真的在算几何**。

**实测**（`practice/src/bili-loop/out/BV1B64y1M7az.json`，68 个有手帧）：

```
stored u_pass==true: 1              重算 u_pass==true: 0
存档 u_issues: ["index.not_extended","middle.not_extended"]    ← 真实几何问题
重算 ruleStatus: "missing_size"                                ← 根本没算
U/V 与存档一致 67/68（唯一那个 true 翻转成 false）
```

**为什么阻塞**：98.5% 的一致率是假象。差异恰好落在唯一的正例上，而这个数是最需要解释的。更要紧的是**失败是静默的**——重跑旧 CLI 会得到「全部 false」，看起来像一堆真负例，实际是拒绝评估。任何人拿它当基线都会得出错误结论。

**最小改法（任选其一，改动都在 `practice/src/bili-loop/eval-frames.mjs`，不碰核心）**：

- 方案 A（推荐）：显式补 geom 并声明来源。bili 抽帧时用 `ffprobe` 取真实宽高写进帧记录，再 `evaluate(letter, lm, {width, height, coordSpace:"image_normalized"})`。
- 方案 B：明确放弃几何判定，让脚本在缺 geom 时**报错退出**而不是输出 `false`，并把 `u_pass`/`v_pass` 字段从产物里删掉，避免被误读。

本席倾向前者补数据、后者保底。请裁定后通知本席，本席的 `tools/assessment` 会同步适配（但不会代改该文件）。

---

## R2（阻塞级）`evaluate()` 返回值里缺「为什么没算」，回放层只能靠 `ruleStatus` 猜

**现状**：`evaluate` 的 `ruleStatus` 取值有 `ok / no_hand / empty / unsupported / missing_size / unsupported_coord_space / invalid_input`。
其中 `empty` 与 `unsupported` 是**规则本身不可判**，不是「动作错」。回放层必须把这两种排除出「几何负例」，否则会把「没规则」算成「做错了」。

**现状可绕**：本席已用 `ruleStatus` 判断并把 `empty`/`unsupported` 归为 `blocked`（见 `lib/replay.mjs` 的 `replaySingle`）。
**请求**：把这条语义写进 `types.js` 的冻结契约注释——**`ruleStatus !== "ok"` 的 `pass=false` 一律不是几何负例**。这样后来人不必读源码猜。

**最小改法**：只改 `practice/src/types.js` 注释，不动逻辑。

---

## R3（阻塞级）`targetLetterId` 与「正确答案」的边界，请在导出侧挡住

**现状**：`snapshot.js` 首行已写「targetLetterId 是当时选中目标，不是正确答案」，`SNAPSHOT_FIELDS` 也已排除 `expectedVerdict`/`pass`/`decision`。
**但**：`canExportSnapshot` 目前不拦这些字段的**出现**。历史产物里 bili-loop 帧就带着 `u_pass`/`v_pass`/`u_issues`/`v_issues`——工具自己的预测和原始数据混在同一个文件里。

**请求**：导出的采集记录里，除了 `targetLetterId` 之外不得出现任何 verdict 类字段；如果调用方硬塞，导出直接拒绝（不是静默忽略）。

**最小改法**：`snapshot.js` 的 `createSnapshot` 增加一次「禁止字段」检查，命中即抛。本席的校验器已用 `pseudo_label_field` 警告覆盖输入侧，但**在源头挡住**比事后警告更可靠。

---

## R4（非阻塞，已确认是真缺口）`judge()` 不透出保持门阈值

**现状（已核对源码）**：`judge.js:32` 返回的是 `hold: holdView(hold)`，而 `holdView` 只返回 `{frames, elapsedMs}`。
`passFrames` / `maxGapMs` 只存在于 `createHold()` 的内部状态里，**不经过 `judge` 出口**。`judge.js` 也不 import 这两个常量。

**影响**：序列层的每个结论都建立在 `PASS_FRAMES=6` / `MAX_GAP_MS=400` 上，而调用方从 `judge` 的返回值里拿不到这两个数，无法在报告里写清「本次生效的阈值」——这正是注释里标 `UNVERIFIED` 要求的那种透明度。

**本席现状做法**：直接从 `practice/src/passState.js` import `PASS_FRAMES` / `MAX_GAP_MS`（单一真源，不是复制阈值），并在报告里带 `unverified: true` 与 `source` 字段。
**请求**：二选一即可——
- 方案 A：`holdView` 增加 `passFrames` / `maxGapMs`，让阈值随 `judge` 出口一起给出；
- 方案 B：确认 `passState.js` 的这两个具名导出是稳定契约（写进 `types.js` 注释），本席就继续直接 import。

本席倾向前者：阈值属于判定的一部分，藏在内部状态里，任何第三方回放器都得绕过 `judge` 去读常量，容易各读各的。

---

## R5（非阻塞）`judge()` 的 `decision` 是否已冻结

本席按 `pass / fail / blocked / undetermined` 四值映射到 `correct / incorrect / blocked / blocked`，并已在 `types.js` 里读到 DS 冻结契约的说明。
**请求**：确认这四个值是**封闭集合**（不再新增、不重命名）。若将来要加值（例如 `stale`），请提前通知——本席的映射表是白名单式的，遇到未知值会落到 `blocked` 并报出来，不会静默当负例。

---

## R6（非阻塞）`practiceStatus` 与 mainPath 的不一致

**现状**：`mainPath` 8 个字母里，`GF0021.U` 是 `pending_review`，于是 `judge` 对 U 恒 `blocked`。
本席的合成样本 `syn-u-geom-pass-judge-blocked` 已把这个行为固定成断言：**几何 correct，产品 decision=blocked**，两者不混算。

**请求**：确认这是有意设计（主路径里放一个不可过关的字母）。若是有意，建议在 `letters.json` 的 `notes` 里写明，否则采集者会拿 U 去收真人数据，收完发现全 blocked。
本席不改 `letters.json`（不在写锁内）。

---

## 本席已自行消化、无需你改的

| 事项 | 本席做法 |
|---|---|
| 缺尺寸 | 不猜，`geometryError` 直接判 `missing_size` → `invalid` |
| 未知坐标空间 | 同上 → `unsupported_coord_space` |
| 历史产物缺 `schemaVersion` | 判 `unsupported_schema_version`，不回填 |
| 序列里「这帧没手」 | 记 `frames_without_hand` **警告**，不记损坏（已在 `validate.mjs` 区分） |
| 无手帧（单帧） | 交质量门判 `hand_count`，不自己造 `no_hand` 文案 |
| 时间轴不可用 | 判 `missing_timestamps`，不用 `t` 冒充 `nowMs` |

---

## R7（总控指定）取消「fixtures 永远为空」的断言与配套门槛

总控在《项目总控与多模型执行Prompt-2026-09-24》第 168 行明确要求本席就此提核心修改请求。核对磁盘后的事实如下。

**已提交版本（`git show HEAD:practice/src/evaluate.test.js`）**：测试名是 `fixtures 目录可空；若有 HandFrame JSON 则读取并调用 evaluate`，走 `loadHandFrame`。
**当前工作区版本（你未提交的改动）**：已改名为 `A08 枚举真实输入：schema 与共享核心冒烟，不计算标签准确性`，改成递归 `readdirSync` + 严格 schema 断言。**「目录可空」这个框架在工作区里已经被你替换掉了——但还没提交。**

本席确认这个方向是对的，并请求把它**提交固化**，同时处理下面三个「真人数据一到就会炸」的硬门槛。这三条正是「永远为空」心态的残留：它们在 0 文件时永远不执行，所以从没被验证过。

| 位置 | 断言 | 真人数据到达时的风险 |
|---|---|---|
| `evaluate.test.js:633` | `typeof frame.handedness.category === "string"` | 要求 `handedness` 是**对象**。历史产物是字符串（`"Left"`）。真人导出若沿用旧形状，这条直接抛 `undefined`。 |
| `evaluate.test.js:632` | `codeVersion` / `rulesVersion` / `sourceType` 必须是非空字符串 | 真人导出必须带这三个字段。`snapshot.js` 的 `CODE_VERSION` 当前是字面量 `"unversioned"`，与 `versions.js` 的 manifest 机制不是一回事。 |
| `evaluate.test.js:634` | `expectedVerdict`/`pass`/`decision`/`practiceStatus` 必须**不存在** | 与 R3 同源。方向正确，但需要导出侧也挡住（见 R3），否则真人采集一塞字段就红。 |

**请求**：
1. 提交工作区的 A08 改动（本席不改 `evaluate.test.js`，不在写锁内）。
2. 确认 `handedness` 的正式形状，并让 `snapshot.js` 的 `handednessOf` 对字符串输入**显式报错**而不是静默产出无 `category` 的对象。
3. 明确 `codeVersion` / `rulesVersion` 在真人导出时怎么填（`versions.js` 的 manifest 计算方式 vs `snapshot.js` 的 `"unversioned"` 字面量）。

**本席已做的事**：本席的合成夹具**刻意不带** `handedness` 字段（因为离线回放不需要它），并已实测这 24 个样本不会被 A08 误判——A08 只扫 `practice/src/fixtures/`，本席的样本在 `tools/assessment/samples/`，**不会污染真人 fixtures 目录**。这是总控第 166 行「冒烟用明确合成数据，不塞进真人 fixtures」的落实方式。

---

---

# 第二轮重核（2026-09-25）

核对方式：逐条比对当前磁盘（含 Grok 未提交的工作区改动）与本席实现。**已解决的不再包装成阻塞。**

| 编号 | 第一轮定级 | 当前状态 | 依据 |
|---|---|---|---|
| R1 | 阻塞 | ✅ **关闭**（本席自行解决） | 本席已获授权迁移 `eval-handframe.mjs` / `bili-loop/eval-frames.mjs` / `render-loop/run.py`。缺尺寸现在明确 `unevaluable` + 退出码 2，不再写成动作负例。实测见 `ROUND2-VERIFICATION.md` 第 6 节。 |
| R2 | 阻塞 | ⚠ **部分解决，且引入新错误** | 你把「`ruleStatus !== "ok"` 不是几何负例」写进了 `types.js`，方向对。**但你写的取值名与代码不符**（见下）。 |
| R3 | 阻塞 | ✅ **关闭** | `snapshot.js` 新增 `FORBIDDEN` 集合，`createSnapshot` 命中即返回 `{ok:false, reason:"forbidden_field"}`。实测在案。 |
| R4 | 非阻塞 | ✅ **关闭** | `passState.js` 的 `holdView` 现在透出 `passFrames` / `maxGapMs`。本席的 `holdThresholds()` 可改为优先读 `judge().hold`，但保留直读常量作为兜底（两处同源，值一致）。 |
| R5 | 非阻塞 | ✅ **关闭** | `types.js` 已把 `decision` 写成 `"pass"|"fail"|"blocked"|"undetermined"` 四值联合。本席映射表按白名单实现，未知值落 `blocked` 并报出。 |
| R6 | 非阻塞 | ⏸ **未处理，仍建议** | mainPath 里的 `GF0021.U` 仍是 `pending_review`，`judge` 对 U 恒 `blocked`。本席已把它固化成断言（几何 `correct` / 产品 `blocked` 不混算）。**不阻塞**，只是采集者会踩坑。 |
| R7 | 阻塞 | ⚠ **部分解决** | 你已把 `fixtures 目录可空` 框架改成 A08 严格 schema 断言，但**尚未提交**，且三个「真人数据一到就炸」的门槛仍在（见下）。 |

## R2 的新问题（请修）

`practice/src/types.js` 当前写：

```
@returns {string} ruleStatus - one of no_letter/no_rules/unknown_rule_fields/
  missing_size/no_hand/unsupported_coord_space/invalid_input/ok
```

但 `practice/src/evaluate.js` 实际只返回：

```
ok, no_hand, empty, unsupported, invalid_input
（几何拒绝时另带 missing_size / unsupported_coord_space）
```

`no_letter`、`no_rules`、`unknown_rule_fields` **在代码里一次都没出现**（已 grep 确认计数为 0）。
`empty` 与 `unsupported` 才是真实取值，但注释里没有。

**影响**：任何按注释写白名单的调用方（包括本席，以及将来任何离线工具）会把真实的
`empty` / `unsupported` 当成未知值。本席按**代码**实现并已把 `empty`/`unsupported` 归入
`blocked_rules`（不是几何负例），所以本席不受影响；但注释是错的，会误导后来人。

**请求**：把 `types.js` 的 `ruleStatus` 枚举改成代码实际的取值集合：
`ok / no_hand / empty / unsupported / missing_size / unsupported_coord_space / invalid_input`。
只改注释，不动逻辑。

## R7 的剩余部分（总控指定，仍阻塞真人数据入库）

`evaluate.test.js` 的 A08 已改成严格 schema 断言，方向对。但三条门槛仍会在**真人数据到达时**触发：

| 位置 | 断言 | 风险 |
|---|---|---|
| A08 | `typeof frame.handedness.category === "string"` | 要求 `handedness` 是对象。历史产物是字符串（`"Left"`）。真人导出若沿用旧形状会抛 `undefined`。 |
| A08 | `codeVersion` / `rulesVersion` / `sourceType` 必须非空字符串 | `snapshot.js` 的 `CODE_VERSION` 当前是字面量 `"unversioned"`，与 `versions.js` 的 manifest 机制不是一回事。真人导出该填哪个？ |
| A08 | `expectedVerdict`/`pass`/`decision`/`practiceStatus` 必须不存在 | 与 R3 同源，方向正确。R3 已在 `snapshot.js` 侧挡住，两边一致。 |

**请求**：
1. 提交工作区的 A08 改动（本席不改 `evaluate.test.js`，不在写锁内）。
2. 确认 `handedness` 的正式形状，并让 `handednessOf` 对字符串输入**显式报错**而不是静默产出无 `category` 的对象。
3. 明确 `codeVersion` / `rulesVersion` 在真人导出时怎么填。

## R1 关闭后的连带事项（新请求）

本席迁移后，`bili-loop/eval-frames.mjs` **不再原地写回输入文件**，也**不再产出 `u_pass`/`v_pass`**。
但 `practice/src/bili-loop/run.py`（**不在本席写锁**）仍然：

1. 调用旧式命令（不传尺寸），且
2. 期望输出里有 `u_pass`/`v_pass`。

**请求**：把 `bili-loop/run.py` 的抽帧环节改为写入 `imageWidth`/`imageHeight`
（`cv2.VideoCapture` 的 `CAP_PROP_FRAME_WIDTH`/`CAP_PROP_FRAME_HEIGHT` 即可），
并让 eval 步骤传 `--out` 到新路径、读 `referenceTargets`。
否则 bili 路径会一直停在「不可评估」，且 `run.py` 与新 CLI 的接口不匹配。

> 这是 R1 的自然延伸：入口改了，调用方要跟上。本席已把新 CLI 的接口写在
> `ROUND2.md` 第 4.2 节，可直接照抄。

## 回执格式请求（第二轮）

请按条回：`R2 接受/拒绝`、`R6 接受/拒绝`、`R7 接受/拒绝`、`R1-连带 接受/拒绝`。
R1/R3/R4/R5 已关闭，无需回执。

