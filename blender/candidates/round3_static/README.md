# 静态手模有限补救候选

**视觉未验收，待负责人打开 PNG 确认。草稿，不是核定教学示范，不得据此替换页面或上线。**

仅处理 A/L/B，最多两轮；没有扩展八图，没有改变骨骼关键帧、规则或 U 定义。当前模型通道无法显示图片，因此代理没有目视确认外观改善、解剖准确性或教学可读性。

## 基准与来源

- 基准 main：`3bf76522bf7b37a6e80a3c409abb36c5a0fede3b`。
- 分支：`asset/hand-rescue-20260926`；隔离目录：`工作副本/手模补救`。
- 输入：`blender/candidates/round2/hand_gf0021.candidate_r2.blend`。
- 输入 SHA-256：`8d3be3fc3ee0955c851c533a9507f379ee4d267cb3042b6641e364f652a93ee5`，与主目录一致；主工程及 A/L/B 源 PNG 也已逐字节核对一致。
- 延用仓库 R2 派生资产。既有 `blender/DELIVERY_ROUND2.md` 记录基础 Hand - Realistic 网格来自 Blender Studio HBM v1.4.1，内置许可为 CC0；本次不上传上游包、真人素材或个人资料。

## 实际处理

以 Blender 4.5.10 LTS（6dc0b208d1b5）执行。按 A=10、L=50、B=20 烘焙现有变形网格；各指关节添加圆润几何、拇指权重区域沿表面法向有限增厚 2.5 mm；逐指及全手进行 0.5 mm 体素融合与 factor 0.2 / 3 次轻平滑。使用统一哑光材质，512×512 EEVEE 正面及左右 30° 图，日志实际为 64 samples。

第一轮出现较大分离组件。第二轮仅将分离组件连接到主要组件的下部掌面（z<0.088m），使用半径 4.5 mm 的重叠椭球桥，端点深入 2 mm，最长允许间隙 35 mm；实际间隙 1.8–17.1 mm。删除小于 100 顶点的孤立体素碎屑，不删除大组件。

| 姿态 | 第一轮大组件数（≥100点） | 第二轮组件数 | 第二轮顶点数 | 边界边 / 非流形边 |
|---|---:|---:|---:|---:|
| A | 4 | 1 | 196464 | 0 / 0 |
| L | 3 | 1 | 201094 | 0 / 0 |
| B | 6 | 1 | 185716 | 0 / 0 |

单一闭合组件仅证明拓扑连接；不证明没有穿插、错误桥接或指间粘连。指间距离报告是在全手融合前对四指表面顶点进行的启发式检查，不包括拇指，也不是精确面碰撞或融合后验证。两轮该启发式未报告近距离指对，不能据此声称“无粘连”。

## 打开预览

- `GF0021.{A,L,B}_compare_R2_r1_r2.png`：从左至右为原 R2、补救第一轮、补救第二轮。1536×512，无修图；原 R2 缩至512。原图与候选材质、取景可能不同，不是严格同灯光对照。
- `preview_r2/GF0021.{A,L,B}_front.png`：第二轮正面。
- 同目录 `*_oblique_m30.png` / `*_oblique_p30.png`：必要斜面检查。
- `preview_r1/` 保留失败连接状态及报告，以免将首轮误称通过。
- 每轮 `checks.json` 保存来源、参数、执行时脚本哈希与逐姿态检查。脚本随后仅增加对比图入口、将可选姿态收窄为 A/L/B；记录中的历史脚本哈希不改写。
- 每姿态 `.static.blend` 仅本机保留，不提交；可用脚本再生。

## 重现命令

Git Bash，从该工作副本根目录运行（脚本输出依自身绝对位置定位，不依赖 cwd）：

```bash
'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe' --background --factory-startup --disable-autoexec --python-exit-code 1 --python blender/rescue_static_hand.py -- --letters A L B --round 1 --resolution 512
'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe' --background --factory-startup --disable-autoexec --python-exit-code 1 --python blender/rescue_static_hand.py -- --letters A L B --round 2 --resolution 512
'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe' --background --factory-startup --disable-autoexec --python-exit-code 1 --python blender/rescue_static_hand.py -- --comparisons-only
```

两轮渲染与对比命令实际退出码均为 0。脚本拒绝覆盖已有 `preview_r1` / `preview_r2`，需在独立复现副本中先将这两个已有证据目录移出输出位置保存，再执行；不要覆盖现有证据。所有生成物限制在 `blender/candidates/round3_static/`。

## 待负责人确认与限制

需查看三张正面及全部斜面：机械关节接缝、尖角是否改善；拇指是否仍呈薄片/鼓包；掌指连接桥是否自然；蜷指是否可辨；是否有教学关键手指遮挡或被融合成板。A 方位及既有内容争议保留，本轮不作内容核定。没有用相机遮挡、裁切或景深有意隐藏缺陷，但实际可见性仍须目视检查。

第二轮后停止建模，不追加第三轮；未执行网页、真人或业务规则测试，因为本次没有相关改动。候选不代表独立视觉验证或总控验收通过。
