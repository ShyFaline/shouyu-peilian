# AGENTS.md

## 提交规范（最高优先级）

- **一改一提交**：每完成一处改动立即单独提交并推送（`git push`），不攒批、不囤积未提交的改动。
- 一个提交只做一件事：一个功能、一个修复、一次内容调整，各自独立成提交。
- 提交信息用一句话说清改了什么、为什么。
- 提交前必须通过测试：
  - `node practice/src/evaluate.test.js`
  - `node --experimental-vm-modules practice/src/reliability.test.js`
  - `node practice/src/pose-goldens.test.js`（合成 golden，只做规则回归，不等于国标或真实检测通过）
  - `node practice/src/motion.test.js`（动态判定合成序列回归，同上不等价声明）
  - `node practice/src/pose-collision.test.js`（示范手模胶囊重合门禁；FK 锚点对齐 + 修复基线，修好基线字母后从 KNOWN_VIOLATIONS 移除）

## 项目速览

- `practice/`：手语陪练主应用，纯静态页面 + MediaPipe 本机识别，视频不上传。
- `practice/content/letters.json`：字母规则与 `practiceStatus` 的唯一事实来源，运行时不得升格。
- `tools/assessment/`：离线验收评估工具链。
- `blender/`：手部 3D 演示图生成管线。

## 本地运行

双击根目录 `启动服务.bat`（或 `cd practice && python -m http.server 8000`），访问 <http://localhost:8000/>。
