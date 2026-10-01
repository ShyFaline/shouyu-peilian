# 手模重建与候选诊断进度（示范资产席）

更新日期：2026-10-01。

## 0c. 32 字母全量重渲（2026-10-01，本机执行）

- **范围**：letters.json 全部 32 个字母（含 ZH/CH/SH/NG/EH/UE）在 `build_godot_hand_poc.py` 的角度表（LETTERS/SPLAY/THUMB/ORIENT）下定稿，逐字母对照官方描述（letters.json `how`）+ REF 三联图视觉核对。本机 Blender 为 **5.2.1 LTS**（winget 安装，替代原 vendor 4.5 便携版）。
- **姿态要点**：J 勾手 = PIP 折 90°（中节指背向上）；NG 小指横伸（roll 270 系下 splay 用 +14）；Y 拇指 swing −5 斜向上展开（对齐判定器 pointing.up）；E 三指横伸系（F/G/Z/ZH/CH/NG/EH）全部 `("back", 270)`。
- **拇指 tuck 与判定器对齐**：判定器 thumb 卷曲 = 二维 IP 内角 ≤100°。TUCK_* 的 dist 分量加深到 −95…−100（golden 实测 92.5–97.0），否则 golden 回归门报 `thumb.not_curled`。
- **产物**：`poc/GF0021.*_{front,side}.png` ×32；turntable 脚本改从本脚本导入姿态（原 candidate 依赖已解除），32 字母 × 24 帧 webp → `blender/candidates/godot-xr-rot/`；golden 8 个重导至 `practice/src/pose-goldens/`。`node practice/src/pose-goldens.test.js` 及其余三套测试全绿。
- **已接入前端**：`practice/content/demos/` 32 张 front + `rot/` 32 组旋转帧，manifest/index 同步。U 的旋转帧限制解除（姿态层无争议，词汇层 pending_review 不变）。
- **遗留**：I 图文冲突（文字食指 vs 插图小指，按文字渲染）待领域复核人终裁；ü 实机验证未做。

---

## 0. Godot XR 绑定手 PoC（2026-09-29 追加，本机 Kimi 执行）

背景：Round1/Round2 两轮的 HBM 静态网格 + 自制权重路线失败（"幽灵手指"，Round2 渲染图全部带残影，与 DELIVERY_ROUND2.md 的"已修复"结论不符）。2026-09-29 核查确认 HBM bundle = Blender Studio 官方 CC0 demo 资产（证据已记入 `docs/来源与伦理草稿.md` 第 6 节），但静态网格无骨骼的问题不变，故评估替换为带正规绑定的 CC0 手模。

资产：Godot XR Tools `hand_r.gltf`（CC0，自包含 glTF，26 根命名骨骼）+ 上游 `License.md`，存于 `blender/vendor/godot-xr-hands/`（gitignore 不入库）。Blender 4.5.14 便携版解压于 `blender/vendor/blender-4.5.14-windows-x64/`（本机此前未装 Blender）。

脚本：`blender/build_godot_hand_poc.py`。已跑通的最短闭环：
- `inspect`：导入 → 删除 glTF 内混入的无蒙皮 Icosphere 占位网格（42 顶点，会撑爆包围盒）→ 输出 6 向朝向图与 bones.json；
- `letters`：固定世界轴卷曲（手指沿 +Y、拇指沿 +Z，故屈曲轴统一取世界 +Z；绕掌法线 +X 做收拢）→ A/B/U 掌心向相机渲染。坐标系结论：手指 +Y、拇指 +Z、掌心 +X。

**关键 bug（2026-09-29 同日修复）：** 骨骼旋转必须用平移包裹的铰链旋转（`T(head)·R·T(-head)`，支点在骨骼头），不能用 `R @ pb.matrix` 裸乘——后者绕世界原点旋转，会把每节骨骼甩离关节，蒙皮被拉成"面条爪"（侧面视角最吓人，正面因有遮挡不易察觉）。此教训与 Round1/Round2 的失败同源：凡是绕错支点的旋转，渲染图都会骗人，必须出侧面/背面验证视角。

实测结果：B（四指伸展收拇指）、U（食中伸直、无名小卷曲）的剪影已经正确可读；A 握拳结构正确（拳眼、指节朝向正确），指节根部有轻微挤压需调参。与"骨架永远正确、变形全由正规蒙皮负责"的预期一致，不再有幽灵手指问题。教训：不要按骨骼自身局部轴卷曲（该骨架各骨 roll 不一致，会拧成麻花），用固定世界轴 + 逐字母角度表。

待办：A 拳松紧与拇指贴食指侧的角度微调（当前 A 侧面拇指仍前伸，THUMB_OPPOSE 角度或轴向需再调）；逐个字母对照 GF 0021—2019 原图人工核对（ZH/CH/SH 的 OCR 疑点仍未解）；EEVEE 材质/白底渲染对齐现有基线风格；30 字母角度表化。

## 0b. 8 字母全量 PoC（2026-09-29 当日续）

- **8 个字母全部角度表化并渲染**：`LETTERS`/`SPLAY`/`THUMB` 三张表按《docs/给Gemini的姿态规格.md》原文配置，每字母出 front + side 双视角（side 用于防支点类回归，见 0 节教训）。
- **拇指轴向修正**：四指屈曲轴 = 世界 +Z；拇指屈曲轴 = finger_up（+Y），负角扫向掌心；拇指摆动轴 = 掌法线（+X），负角竖起。此前拇指绕 +Z 卷曲实为绕自身纵轴拧转，无效果。
- **呈现角度按规格**：A 为「手背向右」→ 用背面视角；其余掌心视角绕竖轴偏 20° 模拟「掌心向前偏左」。注意现用胶囊基线的 A 画的是掌心，与 2019 呈现角度调整名单不符，新管线已按名单执行。
- **风格对齐基线**：RGBA 透明底（基线即透明底 RGBA，练习页白卡片显示）；Standard view transform（AgX 会压灰白底）；暖肤材质 (1.0, 0.65, 0.48)；Workbench `paint.sl` 工作室光（rim.sl 过暗、FLAT 无体积感）。采样对齐基线肤色 (240,205,180)。
- **遗留争议（渲染按仓库规则，未裁定）**：U「食中二指 vs 中无小」、「食指 vs 小指」均按仓库规则；ZH/CH/SH「OCR疑」未做；所有角度为工程近似值，未经人工对照 GF 原图。
- **已知待调**：A 的拇指在握拳位仍偏显眼；V/W/L/Y 拇指为近似位；各字母姿态未经人工对图验收前不替换 `practice/content/demos/`。

## 0c. 判定交叉验证（2026-09-29 当日续）：示范姿态 ↔ 判定规则一致性

做法：`build_godot_hand_poc.py -- landmarks` 把每个摆好姿的字母的 21 个 MediaPipe 式关键点（骨骼关节映射：Proximal.head=MCP、Intermediate.head=PIP、Distal.head=DIP、Distal.tail=指尖）经渲染相机投影为归一化图像坐标，导出 frame JSON，逐个喂给官方离线判定器 `practice/src/eval-handframe.mjs`（共享 evaluate.js 同一套规则，未复制阈值）。

结果：**8/8 geometry_pass**。首跑仅 A 通过，失败模式与修正：
1. B/U/V/W/I `thumb.not_curled`：判定器 thumb 卷曲只看 IP 关节（lm 2/3/4）**二维内角 ≤100°**。拇指绕 finger_up(+Y) 的屈曲发生在深度方向，投影上不可见；改为"掌骨横摆（绕掌法线）+ 近/远节在掌面内折叠"，拇指二维投影弯折达标。这是"3D 解剖正确 ≠ 判定器 2D 可见"的典型例。
2. L `thumb_index.not_90deg`：拇指横摆角 -35° 在 20° 偏航下投影不足 60°；提到 -75°。
3. W `middle_ring.not_apart`：食/无各 ±12° 开合经投影压缩到 22°（阈值 24°）；提到 ±18°。

结论：示范资产与判定规则无系统性冲突；3D 姿态可作为规则的回归基准（改规则后重跑 landmarks → eval 即可验证）。局限：关键点是关节投影而非 MediaPipe 检测输出，未覆盖检测噪声路径。

## 0d. golden 回归门固化（2026-09-30）

交叉验证固化为持续门禁：`-- landmarks` 模式的导出目标从 vendor 临时目录改为 `practice/src/pose-goldens/`（入库，8 个 JSON + README）；新增 `practice/src/pose-goldens.test.js`，断言 8×8 恒等矩阵（每个 golden 仅通过自身字母——矩阵恰为满秩单位阵，先离线验证过再固化）。运行：`node practice/src/pose-goldens.test.js`。与 `fixtures/` 的分工：golden 是合成标准姿态、可直接断言 pass/fail；真人 fixtures 无独立标注、只做冒烟。规则或角度表任何一侧变更，矩阵必须仍为单位阵。

---

## 1. 资产与页面对应关系核查

| 资产文件 | 来源/阶段 | 状态说明 |
|---|---|---|
| `blender/hand_gf0021.blend` | 第 3 小时整皮状态 | 831 顶点整皮网格（来自 HBM Realistic Hand），绑定 HandRig。在 U/A 弯指时整皮产生严重拧皮。 |
| `blender/hand_gf0021.pre_v2.blend` | 早期草稿 | 离散指节 + 掌心（无整皮）。 |
| `blender/hand_gf0021.hour4_hybrid.blend` | 第 4 小时混合备份 | 494 顶点掌心 + 16 个独立指节刚体。字母辨识度提升，但存在残余鬼影手指、掌指断开与拇指片状变形问题。 |
| `blender/hour5_connect.py` | 历史草稿脚本 | 磁盘存在，但其直接覆盖主 `hand_gf0021.blend`，未独立作为候选验证，且存在网格截断致局部断连缺陷。 |
| `practice/content/demos/GF0021.*_front.png` | 页面现用示范图 | 保持 2026-09-20/23 提交基线状态（未受本轮覆盖），总控未批准前严格保持原状。 |

---

## 2. 根因诊断

1. **掌指断开（MCP 裂缝）：** 独立刚体指节网格直接从骨骼 Head（关节点）开始绘制，骨骼在弯曲时旋转中心附近缺乏几何体重叠，导致近端指节离开掌心网格表面。
2. **残留鬼影手指：** 第 4 小时采用粗略坐标框剔除手指顶点（`z > 0.092 & x < 0.032`），仍有 114 个指根残留顶点留在 HandBody 上，与新生成的独立指节几何重叠。
3. **拇指片状/板状变形：** 
   - HBM 原网格手腕骨骼（`wrist`）的起始点 (0, 0, 0) 过于靠近拇指根部，导致径向基函数权重计算时，拇指肉身被赋上了 70%~90% 的 `wrist` 权重；
   - 当拇指骨骼（`thumb.MCP`, `thumb.IP`）做外展旋转（L、Y）或伸展旋转（A）时，拇指顶点被 `wrist` 牢牢拽死在掌心平面（Y 坐标被锁在 0 附近），造成严重的厚度坍塌，形如薄铁片。
4. **弯指拧皮（整皮局限）：** 831 顶点低模网格在关节处仅有 1~2 圈拓扑支撑，单纯依靠线性蒙皮或自动骨骼加权无法解决 90° 极端弯曲时的体积收缩与自穿模。

---

## 3. 两轮候选修复记录

为严格遵守写锁隔离与总控要求，所有新产物均隔离输出至 `blender/candidates/`，不触碰正式文件。

### 第一轮候选（Candidate Round 1）
- **输入：** `blender/hand_gf0021.hour4_hybrid.blend`
- **脚本：** `blender/build_candidate_r1.py`
- **产物：** `blender/candidates/round1/hand_gf0021.candidate_r1.blend`
- **渲染目录：** `blender/candidates/round1/demos/GF0021.{A,B,U,V,L,Y,I,W}_front.png`
- **假设与修复：**
  - 剔除 `z > 0.068 & x < 0.038` 的 114 个指根残留点；
  - 指节近端向掌心内部延伸 `OVERLAP = 0.012m`；
  - 重新绑定掌心骨骼。
- **效果与失败：**
  - 四指断裂消除，字母 U/V 辨识度明确；
  - 但因切除了 `z > 0.068` 区域，误切断了虎口蹼缘（48 个离散顶点）与小鱼际边缘（69 个离散顶点），HandBody 断裂成 3 个不连通组件；拇指仍因 `wrist` 权重过大而扁平。

### 第二轮候选（Candidate Round 2）
- **输入：** `blender/hand_gf0021.blend`（Hour 3 原始整皮连通基线）
- **脚本：** `blender/build_candidate_r2.py`
- **产物：** `blender/candidates/round2/hand_gf0021.candidate_r2.blend`
- **渲染目录：** `blender/candidates/round2/demos/GF0021.{A,B,U,V,L,Y,I,W}_front.png`
- **假设与修复：**
  - 将四指切除界限提高至 `z > 0.096 & x < 0.030`，保留完整的掌心虎口与鱼际连通性；
  - 重构蒙皮权重算法：针对拇指肉身区域（`p.x > 0.015 & p.z < 0.085`），将 `wrist` 骨骼的权重大幅削减（`w *= 0.05`），并将 `thumb.*` 骨骼权重增强 2.5 倍，释放拇指变形自由度；
  - 指节向掌心重叠 0.012m。
- **效果评估：**
  - 四指掌指关节完全闭合，无空洞无鬼影；
  - 拇指在 A 姿态下厚度提升至 0.041m（提升 25%），Y 姿态下外展展开至 X=0.084m（提升 20%），板状扁平现象显著缓解；
  - 但由于 HBM 原始拇指模型在静态时就紧贴掌心，且 HandRig 骨骼朝向与 HBM 原始生理轴存在夹角，在做大幅度外展时仍能看出根部拉伸痕迹。

---

## 4. 规范与伦理约束

1. **U 字母未定稿：** 当前候选图中 U 保持“食中伸、无名小指收”的二指形态，仅作为几何结构测试样本。严格遵从总控“U 争议未裁定前不升格”原则，不作为正式国标定稿。
2. **资产来源追溯（交 K3 登记）：**
   - 基础网格源自 Blender Studio 官方资产库 `human-base-meshes-bundle-v1.4.1`（`Hand - Realistic`）；
   - 内部打包文件 `human_base_meshes_bundle.blend` 内置 README 文本确认：*"All provided assets are public domain under the CC0 license."*
   - 本地缓存路径：`blender/vendor/human-base-meshes-bundle-v1.4.1/`。
