# 手模重建与候选诊断进度（示范资产席）

更新日期：2026-09-24。执行依据：《项目总控与多模型执行Prompt-2026-09-24.md》Prompt 4。未 commit。基准 HEAD 仍 `9f5dfc732ad6fe7b37ace3b7ae8a198da022ba05`。

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
