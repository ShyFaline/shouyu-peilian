# HandFrame 夹具

本目录当前为空。没有真人数据。

把练习页导出的 JSON 放到这里。`evaluate.test.js` 读取 `*.json` 并调用 `evaluate()`。没有 json 时现有用例仍通过。不要上传。导出开关在练习页默认关闭。

## 字段约定

练习页本机下载（不上传）：

```json
{
  "t": 0,
  "handedness": "Right",
  "landmarks": [{ "x": 0, "y": 0, "z": 0 }],
  "conf": 0.9
}
```

| 字段 | 类型 | 约定 |
|---|---|---|
| `t` | number | 帧时间戳 |
| `handedness` | string | `Left` / `Right` / `Unknown` |
| `landmarks` | array | 长度必须 21。每点 `{ x, y, z? }` |
| `conf` | number | 手置信度 |

文件名建议与练习页一致：`handframe-{字母ID}-{ISO时间}.json`，例如 `handframe-GF0021.U-2026-09-20T12-00-00-000Z.json`。测试从文件名解析 `GF0021.*` 对应字母；解析不到则用 U，仍调用 `evaluate()`。不按 `pass` 决定测试成败，不报准确率。
