# 真人验证前工程候选交付包

日期：2026-10-08。本文为新交付文档，不覆盖旧 `docs/交件-2026-10-08/`。**限定工程验证通过，GUI部分闭环；不是正式标准32项全识别成品，不是100%任务完成，不含已完成视频。**

## 应用冻结与版本绑定

- 应用提交：`38f72b1ac77361a279c5fa239375bd18d55726c6`。
- 来源副本：`C:/Users/15424/Desktop/scope-navigation-20261008`；任务分支：`fix/scope-navigation-20261008`，不是 main。
- 核心交付：`b1e2111` 范围切换失效/去重，`6711c4d` scope源码指纹，`27a28d4` 范围与记录回归，`d44e8c2` 限定教学文案，`38f72b1` 来源文案；均已commit/push（总控回执）。冻结时工作区clean。
- 本目录文档提交在应用冻结之后，只增加文档，不改应用。运行包从上述冻结 Git 对象提取 `practice/**` 和 `启动服务.bat`，正式文档从本目录的文档提交对象提取。应用冻结hash不因文档提交改称新的应用版本；包内 `package-metadata.json` 分列两个commit，`manifest-sha256.txt` 给出逐文件SHA-256。
- 旧交件标题及 `1c987ed` 是历史版本，不作本次版本声明。任务分支push不等于main合并、验收或Pages上线；既有在线站点不保证与本包相同。

## 产品与能力边界

汉语手指字母拼写层陪练：介绍首页、26/32范围导航、图鉴、静态跟练、自测、本机记录、摄像头关键点、几何提示及有效快照排查工具。不是ASL，不翻译中文词句。

完整32：9 `pose_practice` /18 `pending_review` /5 `demo_only`；基础26：9/13/4；`accepted_practice=0`。当前旧规则：I小指，J静态同I，U食中二指并拢且pending，Z单食指。**无quest动态模块，I/J不可据同规则区分；J/Z仅本版静态近似，完整规范指式待核对**。手改main映射仍未知，不授权本包推断或替换映射。

6个新有效帧、最大相邻间隔400ms是UNVERIFIED初值，不是持续400ms才通过；快照另有400ms新鲜度门。可跟练不等于内容认证、全32可区分、真人准确率或学习收益。

## 证据与实际结果

| 层级 | 实际结果与限制 |
|---|---|
| 核心自测 | 与独立验证、总控验收分席；核心提交及push按总控回执记录 |
| 独立general-purpose只读验证 | `C:/Users/15424/Desktop/pre-human-delivery-20261008/independent/report.md`：五套88项通过（38+33+3+6+8），补测4/4；HTTP资源11/11字节相同；合成CLI2/2有效，无独立标签、scored=0、真人未执行 |
| 冻结核对 | 独立前后HEAD相同、clean；693 tracked文件SHA-256相同。相对67b9818，32个id/rules/status及mainPath未变；notes及I/J/Z how等文案改变。RULE_FILES包含完整letters文本，故不能声称整体rulesVersion不变 |
| 本文书席复跑 | ZCode.exe以ELECTRON_RUN_AS_NODE=1，Node24.14.0：evaluate38、reliability33、goldens3、scope6、scope-page8，均exit0；外置 `deliverable/documentation-tests.log`。不是GUI/真人验证 |
| 总控亲自GUI | IAB localhost63210；有限导航/页面事件观察，整体partial，不是完整鼠标黑盒验收。准确事实见验收表及外置gui-report.json |
| GUI未闭环 | 高层locator多次Timeout；学习full一次DOM click无变化后页面el.click正常；摄像头/镜像/浏览器导出未执行；非空记录GUI未测；截图已保存但模型不支持视觉input，不声称视觉验收 |
| 视频 | recording文档not found；未录，无同版本视频产物，不用截图或步骤代替 |
| 最终结论 | 可交付带证据与限制的工程候选包；本表不代签全面验收、内容认证、公开授权或上线 |

## 负责人既有确认

保留“负责人确认其余真人验收通过”，关联仓库AGENTS第4项、`docs/证据索引.md` N1和旧交件04。确认的版本归属/细化范围未明；不撤销、不要求重复验收、不冒充本次代理独立复验。新工程、新素材、内容核定和公开使用授权不自动继承旧确认，新成果不自动覆盖旧。

## 文件导航与交付位置

- `01-十二项工程验收表.md`：通过/部分/未闭环分别标注。
- `02-三十二项能力与限制.md`：冻结32行矩阵与素材边界。
- `03-AI真实过程.md`：指定Grok未配置、实际general-purpose及分席和工具限制。
- `04-复现命令与演示脚本.md`：复现、离线边界、演示步骤及本地包。

外置交付根：`C:/Users/15424/Desktop/pre-human-delivery-20261008/deliverable`。运行ZIP为 `engineering-candidate-38f72b1.zip`，解压目录为 `engineering-candidate-38f72b1`；不附.git或用户工作区修改。包实际SHA-256、大小及文档commit/push另见本次交付回执和外置 `package-receipt.json`，避免把ZIP自身哈希写回ZIP形成循环。
