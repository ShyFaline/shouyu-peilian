#!/usr/bin/env bash
# ⚠ 第一轮历史脚本，已被 run-all-r2.sh 取代。
# 保留原因：它产出第一轮证据 tools/assessment/out/，该目录是历史证据，不得覆盖。
# 指标字段口径已在第二轮修正（falseAcceptRate -> falseAcceptAll 等），本脚本的输出
# 不能与第二轮报告混引。要复现当前行为请用 bash tools/assessment/run-all-r2.sh。
#
# 原说明：一键复现第一轮全部证据。只读核心，只写 tools/assessment/out/。
# 用法: bash tools/assessment/run-all.sh
set -u

cd "$(dirname "$0")/../.." || exit 2
ROOT="$(pwd)"
OUT="tools/assessment/out"
SYN="tools/assessment/samples/synthetic"
mkdir -p "$OUT"

PASS=0
FAIL=0
declare -a SUMMARY

# 期望退出码: <名称> <期望> <实际>
record() {
  local name="$1" want="$2" got="$3"
  if [ "$want" = "$got" ]; then
    PASS=$((PASS + 1)); SUMMARY+=("  ok   ${name}  exit=${got} (期望 ${want})")
  else
    FAIL=$((FAIL + 1)); SUMMARY+=("  FAIL ${name}  exit=${got} (期望 ${want})")
  fi
}

banner() { printf '\n\033[1m===== %s =====\033[0m\n' "$1"; }

banner "0. 环境与核心指纹"
echo "workspace: $ROOT"
echo "bun: $(bun --version 2>/dev/null || echo 'MISSING')"
bun -e '
import { coreFingerprint } from "./tools/assessment/lib/fingerprint.mjs";
import { writeFileSync } from "node:fs";
const fp = coreFingerprint();
writeFileSync("tools/assessment/out/core-fingerprint.json", JSON.stringify(fp, null, 2) + "\n");
console.log("coreFingerprint.digest =", fp.digest);
for (const [k, v] of Object.entries(fp.files)) console.log("  ", k, v);
'

banner "1. 核心回归基线（只读，验证本席未扰动核心）"
bun practice/src/evaluate.test.js 2>&1 | tail -3
record "core evaluate.test.js" 0 "${PIPESTATUS[0]}"

banner "2. 生成合成夹具"
bun tools/assessment/samples/generate-synthetic.mjs
record "generate-synthetic" 0 "$?"

banner "3. 骨架自检（36 断言，六类边界）"
bun tools/assessment/verify-skeleton.mjs 2>&1 | tail -25
record "verify-skeleton" 0 "${PIPESTATUS[0]}"

banner "4. 校验合成夹具（含 5 个故意坏样本 => 期望 exit 1）"
bun tools/assessment/validate-captures.mjs "$SYN" --out "$OUT/validate-synthetic.json"
record "validate synthetic" 1 "$?"

banner "5. 回放合成夹具 + 独立标签"
bun tools/assessment/replay.mjs "$SYN" --labels "$SYN/labels.json" --allow-invalid --out "$OUT/replay-synthetic.json"
record "replay synthetic (labeled)" 0 "$?"

banner "6. 回放合成夹具 + 伪标签（期望整份拒收 => exit 1）"
bun tools/assessment/replay.mjs "$SYN" --labels "$SYN/labels.pseudo.json" --allow-invalid --quiet --out "$OUT/replay-pseudo-rejected.json"
record "replay pseudo-labels rejected" 1 "$?"

banner "7. 零样本目录（期望 exit 0，指标分母为 0 => null）"
bun tools/assessment/replay.mjs tools/assessment/samples/empty --quiet --out "$OUT/replay-empty.json"
record "replay empty dir" 0 "$?"

banner "8. 历史产物可回放性（只读，期望全部阻断 => exit 1）"
bun tools/assessment/validate-captures.mjs practice/src/render-loop/out --out "$OUT/validate-render-loop.json"
record "validate render-loop/out" 1 "$?"
bun tools/assessment/validate-captures.mjs practice/src/bili-loop/out --out "$OUT/validate-bili-loop.json"
record "validate bili-loop/out" 1 "$?"
bun tools/assessment/validate-captures.mjs practice/src/fixtures --out "$OUT/validate-fixtures.json"
record "validate fixtures/ (空)" 0 "$?"

banner "9. 历史产物只读性核对（应无改动）"
git status --porcelain practice/src/render-loop/out practice/src/bili-loop/out practice/src/fixtures | sed 's/^/  /' || true
echo "  (以上为空表示历史产物未被触碰)"

banner "结果汇总"
printf '%s\n' "${SUMMARY[@]}"
echo
echo "通过 $PASS / 失败 $FAIL"
[ "$FAIL" -eq 0 ] && echo "全部符合预期。" || echo "有不符合预期的项，见上。"
exit "$FAIL"
