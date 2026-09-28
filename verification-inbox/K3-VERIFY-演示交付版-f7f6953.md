# K3 独立验证报告：演示交付版 f7f6953

- 验证席：K3 验证窗口（独立验证，与文书席分离；自测/独立验证/总控验收不混称）
- 日期：2026-09-28
- 被测 worktree：`C:\Users\15424\Desktop\2026.9.15\工作副本\核心实现`
- 分支：`integration/closeout-20260926`；HEAD = `f7f6953f3e1c6caf0c4f1f2ad9e78504fe0a6d63`（与要求一致，无需冻结切换）
- 工作区：`git status` 显示一个与本任务无关的未提交删除（10班文化衫尺码调查 xlsx），属他人/其他窗口改动，本席未触碰、未提交
- 验证期间未 push、未改仓库文件；本报告写于仓库外 `verification-inbox/`

## 环境

- 本机无 Node（`node: command not found`，退出码 127）；Bun 1.4.1 可用
- 本机 8765 端口已有在跑的 http.server（PID 26020），目录即被测 worktree，复用，未启动/终止任何进程
- IAB 浏览器在本验证窗口不可用（宿主返回 "Browser is not available in subagent"），故第 3 项页面行为**未能做浏览器动态验证**，只能静态核验代码路径并如实降级标注

## 测试执行记录（命令 + 退出码）

| 命令 | 结果 | 退出码 |
|---|---|---|
| `bun practice/src/evaluate.test.js` | 32 passed，0 fixtures（真人未执行如实标注） | 0 |
| `bun tools/assessment/verify-skeleton.mjs` | 83/83 断言通过；真人评估 executed=false | 0 |
| `bun tools/assessment/verify-legacy-migration.mjs` | 57/57 断言通过；35 个受保护文件前后逐字节一致 | 0 |
| `node --experimental-vm-modules practice/src/reliability.test.js` | **未执行（本机无 Node）**，exit 127 | 127 |

未用 Bun 冒充 Node 跑 reliability；本机无 Node 属运行环境限制，不是产品缺陷，也不是测试加载器故障的判例。

## 逐条结论

| # | 声明 | 结论 | 证据 |
|---|---|---|---|
| 1 | letters.json：32 项；pose_practice 恰为 A/B/L/V/W/Y 6 个；I/J/Z/U/R/X pending_review；demo_only 为 E/M/N/S/Ê 5 个；无 accepted_practice | **通过** | 实读统计：total 32；pose_practice 6（A,B,L,V,W,Y）；pending_review 21（含 I,J,Z,U,R,X）；demo_only 5（E,M,N,S,EH）；无 accepted_practice |
| 2 | evaluate.test.js 无强制 I/J/Z 为 pose_practice 的断言 | **通过** | 测试反而断言 I/J/Z = pending_review、U = pending_review、A/B/L/Y/V/W = pose_practice（L255-265），且断言全包无 accepted_practice；运行 32/32 通过，断言与数据一致 |
| 3 | 页面行为（IAB 虚拟摄像头）：默认 U 暂不判定；I/J/Z 暂不判定+字形回退文案；V 比这个手型；摄像头开/停/重开按钮与流状态；无输入时下载 JSON 不触发 | **未执行（浏览器在本窗口不可用）+ 静态代码核验一致** | 静态证据：main() 默认 `selectLetter(byId.get("GF0021.U"))`（app.js:526）；`presentLetterIdle` 对非 pose_practice 一律 `setVerdict("blocked",…"暂不判定")`，对 pose_practice（含 V）`setVerdict("fail",…"比这个手型")`（app.js:177-186）；回退链 showDemo 先探 approved 再探 fontRef，失败显示「临时字形参考，尚未逐项核定」/「该项参考图待完善」（app.js:124-176）；开/停按钮 `startBtn.disabled=live / stopBtn.disabled=!live`（app.js:383-384），停止走 `stopCamera(video)` 并置「摄像头已停，可再开」（app.js:433-444）；下载有双闸：exportToggle 默认关且 exportBtn.disabled=true（app.js:537-541），downloadHandFrame 中 exportEnabled 关或快照无效（无手/缺尺寸/切目标/帧过期）直接 return 不创建 a.click（app.js:451-486）。**以上均为静态核验；动态浏览器行为（含虚拟摄像头 mock）本窗口未执行，与真实设备测试须分开标注** |
| 4 | 回退链：正式槽只读 approved/（不存在/为空）；页面不回退到 demos/ 根目录 8 张旧三维存档 PNG；font-reference 是否被引用如实记录 | **通过（静态）** | `practice/content/demos/approved/` 在磁盘上**不存在**；app.js demoSrc 只构造 `approved/` 与 `font-reference/` 两个 URL，注释明确「被否定的三维渲染图留在 demos/ 根目录作存档，页面永不读取」，缺图时显示字形示意而非回退旧 PNG（app.js:114-150）；font-reference/ 实际存在 11 张（A,B,C,D,F,K,L,O,V,W,Y）且**确实被页面作为二级回退引用**；demos/ 根目录 8 张存档 PNG 无任何页面引用 |
| 5 | 页脚不再称「渲染草稿」；sources.html GF0021 官方链接不是「未找到官方 URL」 | **通过** | index.html 页脚（L74-78）：「内容：GF 0021—2019 · 来源与许可 · 示范为临时字形参考，尚未逐项核定，不参与识别」，无「渲染草稿」字样；sources.html L48 给出教育部官网 PDF 链接 `http://www.moe.gov.cn/jyb_sjzl/ziliao/A19/201404/W020191101556565933988.pdf`，无「未找到官方 URL」表述 |
| 6 | practice/fonts/OFL-SignPinyin.txt 存在且为 SIL OFL 1.1 全文 | **通过** | 文件存在，93 行，含版权行（ErSanSan233 & Zhang 3-er，保留字体名 SignPinyin/SignPinYin）与「SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007」全文结构 |
| 7 | 文档一致性抽查 | **部分通过（两处如实降级，另有历史路径引用需注意）** | (a) 说明书不含「4 passed / 22 failed」「36/36」字样（grep 无命中）；(b) 「hour5/connect/r2」仍出现，但**全部以「该目录在当前分支已不存在、旧候选已退役/归档、旧引用失效」的失效声明形式出现**（说明书 L64、B/Y/L 卡第 25/24/26 行、证据索引 C1/C2），属如实记录而非失效引用；(c) B/Y/L 卡引用的 `../pages/p05.png`、`p06.png`、`p08.png`、`practice/content/demos/GF0021.{B,L,Y}_front.png` 均 ls 核实存在；`approved/` 不存在与「当前为空」表述相容；(d) 证据索引 C2 引用的 `blender/s1p5_med_check.py` 与根级 `render-loop/run.py` **在当前分支不存在**（实际为 `practice/src/render-loop/run.py` 与 `practice/src/bili-loop/run.py`），但该行明确标注「历史自报，保留追溯，候选已退役，不再复验」，属追溯性引用；(e) README.md 启动命令确为 `python -m http.server 8765 --bind 127.0.0.1`（L38），能力数字与 letters.json 一致：32 字母、6 个 pose_practice（A,B,L,V,W,Y）、21 个 pending_review、5 个 demo_only、默认 U 未核定不绿灯（README L5） |
| 8 | 说明书「未执行/待人工核定」区如实包含：真实摄像头、真机/手机、物理断网、letters.json 加载失败路径、规范原图人工对照（U 等）、reliability 的 Node 复跑 | **部分通过** | 附 2 清单如实包含：物理断网演练【未做】、规范原图人工对照【未做，B/Y/L 卡复核栏留空】、reliability 本机 Node 未执行（并如实引用 K3 旧提交 1a8d792/Node 22.22.2 曾报 29/29，注明基线与环境不同不等于本提交已验证）、真人试用与独立标注【全部未开始】。**但未见对「真实摄像头实测」「真机/手机」「letters.json 加载失败路径」的显式未执行条目**——说明书 L61 只讲了 reliability 未执行；加载失败路径在 app.js 有处理代码（main() catch 显示「字母包没读到」），但说明书未将其列为未验证项。建议补记 |
| 9 | 夹带检查：`git diff c142e9d..f7f6953 --stat` | **通过** | 全量 11 文件：README.md、docs/standards/cards/{B,L,Y}.md、产品说明书草稿.md、内容核定表.md、证据索引.md、情况简述.md、practice/content/letters.json（6 行）、practice/index.html（2 行，页脚）、practice/src/evaluate.test.js（5 行）。无新素材、无二进制、无阈值/规则文件改动 |

## 一页总结

**这版能否作为「演示交付版」：可以作为本机演示用交付候选，但带条件。**

- 支撑面：三套 Bun 测试全绿（32/83/57 断言，退出码均 0）；letters.json 能力分级与测试断言、README、说明书数字一致；回退链与页脚/sources/OFL 表述核验通过；diff 干净无夹带。
- **必须修复项（不阻断演示，阻断正式口径）**：
  1. 说明书附 2 未执行清单未显式列出「真实摄像头实测」「真机/手机」「letters.json 加载失败路径」三项——演示前若有人按清单核对覆盖范围会发现缺口，建议补记（文书席事项）。
  2. 证据索引 C2 引用的 `blender/s1p5_med_check.py`、根级 `render-loop/run.py` 在当前分支不存在，虽有「历史追溯」标注，建议补一句「路径已迁移/已移除」以免误读。
- **未执行项（本窗口）**：`node --experimental-vm-modules practice/src/reliability.test.js`（本机无 Node，exit 127）；页面动态浏览器行为验证（IAB 在本窗口不可用，第 3 项仅有静态代码证据，动态行为、虚拟摄像头 mock 与真实设备测试均待执行）。
- 物理断网演练、规范原图人工对照、真人采集与标注按说明书现状均属未做，任何「真人准确率/学习效果」表述不得出现——说明书本身已遵守此禁则。
