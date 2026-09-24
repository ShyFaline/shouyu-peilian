# HandFrame 夹具

本目录当前为空。没有真人数据。禁止伪造真人 fixtures。

把练习页导出的 JSON 放到这里。`evaluate.test.js` 读取 `*.json`。没有 json 时现有用例仍通过。不要上传。导出开关在练习页默认关闭。

有 JSON 但没有独立的人工核对时，**不得把 evaluate.pass / decision 当通过**。文件里即使误写 `expectedVerdict` / `pass` / `decision` / `practiceStatus`，测试也忽略，不当标签。

## schema v2

练习页本机下载（不上传）：

```json
{
  "schemaVersion": 2,
  "capturedAt": 0,
  "frameId": 0,
  "imageWidth": 640,
  "imageHeight": 480,
  "coordSpace": "image_normalized",
  "mirrored": true,
  "targetLetterId": "GF0021.U",
  "sourceType": "camera",
  "codeVersion": "practice-judge-1",
  "rulesVersion": "GF 0021-2019",
  "handedness": { "category": "Right" },
  "landmarks": [{ "x": 0, "y": 0, "z": 0 }]
}
```

`landmarks` 长度必须 21。`targetLetterId` 是当时选中目标，不是正确答案。缺 `imageWidth` / `imageHeight` 不得猜 1×1。

文件名建议：`handframe-{字母ID}-{ISO时间}.json`。
