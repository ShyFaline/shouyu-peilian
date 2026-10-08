# 2026-10-04 十轮现有流程检查事实报告

## 状态、基线与责任边界

**实现席结果；主协调已完成本地代码/文书差异检查与 75 项自动化测试复核。** 本文按本次交接事实整理，不是文书席独立执行记录，不代表 K3 独立验证、总体产品验收、合并或上线。

- 基线：`material-gathering-a-z@1c987edd`。文书席开工只读查询显示同一分支，短 HEAD 为 `1c987ed`，已有 `practice/src/reliability.test.js` 未提交修改，归实现席所有。
- 用户本轮要求不做 Git 修改操作，不提交、不推送、不切分支。文书席仅编辑 `README.md` 和新增本文，不改实现席文件。
- 本轮是 **10 轮检查，有证据才修**，不是 10 次功能迭代。实现席唯一代码改动为 `practice/src/reliability.test.js`：修复损坏的 harness 和孤立闭合，保留原 26 个用例，新增 8 个用例；未据此宣称修改业务逻辑或示范资产。
- 规划 grok 和编码 glm 不可用，实际回退到 `general-purpose` 实现；不冒称由其他模型完成。
- 真人示范、素材处理、扩字母、训练与三维重建继续暂停。字体回退、合成输入和模拟通过均不升格为正式标准示范或真人效果证据。

## 十轮检查（实现席结果）

测试数量顺序统一为 `evaluate / reliability / pose-goldens`。

| 轮次 | 检查及结果 | 证据性质与限制 |
|---|---|---|
| 1 | 恢复测试 harness 及孤立闭合后，三套测试为 **38 / 26 / 3**，通过。 | 实现席本地执行结果；原 26 个可靠性用例保留，不是新增 26 个。 |
| 2 | 静态检查 **22 处引用存在**；临时 HTTP 检查 **10 个资源返回 200**。 | 文件存在与 HTTP 可达证据；未进行浏览器加载，不代表模型在真实浏览器成功初始化。 |
| 3 | 图鉴分组覆盖 **32 项**；检查示范加载失败回退、旧图回调隔离。**24 项无静态图，使用字体回退**。 | 分组与回退行为检查；字体不是正式标准示范，不据此升格内容。 |
| 4 | 模拟 GPU/CPU 初始化失败、回退与重试、取消，以及权限和 video.play 相关路径。 | 执行真实 app/core，模拟 DOM、媒体及 vendor 边界；不是实际 GPU、权限弹窗或摄像头验证。 |
| 5 | 模拟 stop / mute / ended、恢复及旧轨道事件隔离。 | 模拟媒体生命周期证据；不是物理设备拔插或真机恢复验证。 |
| 6 | 镜像开关只影响展示；快照记录镜像标记，保留原始坐标。 | 合成输入与导出断言，不是真人坐标采集。 |
| 7 | 检查合成无效点、多手和过期数据路径。 | 合成异常输入检查，不报告真实检测准确率。 |
| 8 | 检查模式和目标切换，以及 storage 读写失败路径。 | 模拟状态切换与存储故障；不代表真实浏览器跨会话兼容性复验。 |
| 9 | 用合成有效快照导出，实际启动离线 CLI，得到 **exit 0**；去除尺寸且无可追溯图像时得到 **exit 2**、`unevaluable`、`geometryPass=null`。 | CLI 子进程实际执行，但输入是合成数据。exit 0 只表示完成单帧几何评估，不等于在线保持通过。 |
| 10 | 最终 **38 / 34 / 3 = 75** 个测试全通过；实现席报告 diff-check 通过，并检查静态 CI 测试门。 | 可靠性用例由 26 增至 34；静态工作流检查不等于远端 CI 已执行或部署成功。 |

## 可核查的代码与配置依据

- `practice/src/reliability.test.js`：当前 diff 包含 harness 恢复、必要模拟边界及 8 个新增用例，覆盖图鉴回退、delegate 失败与重试、初始化取消、旧轨道隔离、镜像导出、模式切换、storage 故障和实际 CLI 回放。
- `practice/src/eval-handframe.mjs`：报告初始 `geometryPass=null`。缺目标或未知目标标为 `unevaluable`；共享核心返回 `no_hand`、`missing_size` 等不可判状态时也保留 null，退出码 2，并明确不是动作负例。仅可评估时输出文本 `geometry_pass`，退出码 0；几何结果本身可为 true 或 false。
- 尺寸允许来自帧字段或可追溯同源图像文件头；无法追溯时不猜尺寸。缺尺寸并非“不调用 evaluate”，而是交由共享核心返回 `missing_size`。
- 单帧 `evaluate` 与在线 `judge` 的质量、内容及连续保持门不同，离线几何结果不能替代在线保持通过。
- `.github/workflows/test.yml` 静态配置使用 Node 22，包含三条测试命令：`node practice/src/evaluate.test.js`、`node --experimental-vm-modules practice/src/reliability.test.js`、`node practice/src/pose-goldens.test.js`。这里只确认配置存在，不宣称远端执行通过。

## 环境与未覆盖项

实现席环境的 PATH 无 `node`，实际通过 `ELECTRON_RUN_AS_NODE=1` 启动 ZCode.exe，运行时为 **Node 24.14.0**。不得把这次结果写成 Node 22 运行通过。

本轮未完成或未执行：Node 22 实跑、远端 CI、部署验证、真实浏览器加载、真机摄像头与真人实验、K3 独立复验。主协调已完成下述限定范围的本地复核，无总体产品验收或部署结论。既有负责人确认不等于本次代理独立复验，也不自动覆盖新素材、内容核定和公开使用授权。

文书席仅核对规则文件、README 相关行、CLI 返回语义、实现席必要 diff 和静态 CI 测试门，并整理交接事实；未重跑上述 75 个测试、HTTP 检查或模拟检查。本文不补造执行日志、参与者、样本或指标。

## 总控复核补记

据主协调本次反馈，主协调已亲自检查 `README.md` 与 `practice/src/reliability.test.js` 的完整 Git diff，并执行 `git diff --check`，无错误，仅有 LF 转 CRLF 提示。本地代码/文书差异检查通过。

主协调通过 `ELECTRON_RUN_AS_NODE=1` 的 ZCode.exe 亲自运行三套测试：`evaluate` 为 **38 passed**，`reliability` 为 **34 passed、0 failed**，`pose-goldens` 为 **3 passed**，合计 **75 项自动化测试通过**。此为主协调复核事实，不是文书席重跑结果。主协调另以 `--version` 确认运行时为 `v24.14.0`，亲读 `eval-handframe.mjs` 第 120–223 行确认 README 语义一致；最终 status 仅含 `README.md`、`practice/src/reliability.test.js` 及新增本文，分支与 HEAD 未变。

主协调未独立重复 HTTP 检查，未执行浏览器、真人、K3 独立复验或远端 CI 验证；本次本地复核不构成总体产品验收或部署结论。
