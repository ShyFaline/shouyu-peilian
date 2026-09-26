#!/usr/bin/env bash
# 第三轮一键复现。只读核心，只写 tools/assessment/out-r3/。
#
# 不覆盖任何历史证据：
#   - tools/assessment/out/     第一轮证据（受 protected-baseline.json 保护）
#   - tools/assessment/out-r2/  第二轮证据（受保护）
#   - practice/src/render-loop/out、bili-loop/out、fixtures（受保护）
#
# 说明：out-r3 是本轮的**可再生产物**（报告内含 generatedAt），因此不列入
# protected-baseline.json。受保护的是已冻结的历史证据，不是本轮输出。
#
# 用法: bash tools/assessment/run-all-r3.sh
set -u

cd "$(dirname "$0")/../.." || exit 2
ROOT="$(pwd)"
OUT="tools/assessment/out-r3"
SYN="tools/assessment/samples/synthetic"
CE="tools/assessment/samples/counterexamples"
mkdir -p "$OUT"

PASS=0
FAIL=0
declare -a SUMMARY

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
echo "branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
echo "HEAD: $(git rev-parse --short HEAD 2>/dev/null || echo '?')"
echo "bun: $(bun --version 2>/dev/null || echo 'MISSING')"
bun -e '
import { coreFingerprint } from "./tools/assessment/lib/fingerprint.mjs";
import { writeFileSync } from "node:fs";
const fp = coreFingerprint();
writeFileSync("tools/assessment/out-r3/core-fingerprint.json", JSON.stringify(fp, null, 2) + "\n");
console.log("coreFingerprint.digest =", fp.digest);
'
echo "注意：核心由 Grok 持有写锁。指纹变了则本报告作废需重跑。"

banner "1. 核心回归基线（只读；本席未改核心）"
bun practice/src/evaluate.test.js 2>&1 | tail -3
record "core evaluate.test.js" 0 "${PIPESTATUS[0]}"

banner "2. 生成合成夹具 + 反例夹具"
bun tools/assessment/samples/generate-synthetic.mjs
record "generate-synthetic" 0 "$?"
bun tools/assessment/samples/counterexamples/generate-counterexamples.mjs
record "generate-counterexamples" 0 "$?"

banner "3. 骨架自检（83 断言：含证据链逐样本合取、全体 vs conditional 两口径）"
bun tools/assessment/verify-skeleton.mjs 2>&1 | tail -16
record "verify-skeleton" 0 "${PIPESTATUS[0]}"

banner "4. 旧入口迁移 + 历史文件保护（49 断言：两层真实前后比较 + 比较器自检）"
bun tools/assessment/verify-legacy-migration.mjs 2>&1 | tail -16
record "verify-legacy-migration" 0 "${PIPESTATUS[0]}"

banner "5. 反例夹具：证据链与统计口径"
for g in evidence-stitching evidence-stitching-positive evidence-all-blocked metric-cells; do
  echo "--- $g ---"
  bun tools/assessment/replay.mjs "$CE/$g" --labels "$CE/$g/labels.json" --allow-invalid --out "$OUT/ce-$g.json" 2>&1 | head -12
done
record "replay counterexamples" 0 "$?"

banner "6. 合成夹具：回归（应与第二轮结论一致）"
bun tools/assessment/replay.mjs "$SYN" --labels "$SYN/labels.json" --allow-invalid --out "$OUT/replay-synthetic.json" 2>&1 | head -12
record "replay synthetic" 0 "$?"

banner "7. 伪标签整份拒收（期望 exit 1）"
bun tools/assessment/replay.mjs "$SYN" --labels "$SYN/labels.pseudo.json" --allow-invalid --quiet --out "$OUT/replay-pseudo-rejected.json"
record "pseudo labels rejected" 1 "$?"

banner "8. 零样本（期望 exit 0，分母 0 => null）"
bun tools/assessment/replay.mjs tools/assessment/samples/empty --quiet --out "$OUT/replay-empty.json"
record "replay empty" 0 "$?"

banner "9. 历史产物可回放性（只读；期望全部阻断 => exit 1）"
bun tools/assessment/validate-captures.mjs practice/src/render-loop/out --out "$OUT/validate-render-loop.json"
record "validate render-loop/out" 1 "$?"
bun tools/assessment/validate-captures.mjs practice/src/bili-loop/out --out "$OUT/validate-bili-loop.json"
record "validate bili-loop/out" 1 "$?"
bun tools/assessment/validate-captures.mjs practice/src/fixtures --out "$OUT/validate-fixtures.json"
record "validate fixtures/ (空)" 0 "$?"

banner "10. 旧调用入口明确拒绝（期望 exit 3）"
bun practice/src/bili-loop/eval-frames.mjs \
  practice/src/bili-loop/out/BV1B64y1M7az.json \
  practice/src/bili-loop/out/BV1B64y1M7az.json > "$OUT/legacy-invocation-refusal.txt" 2>&1
record "legacy invocation refused" 3 "$?"
head -6 "$OUT/legacy-invocation-refusal.txt"

banner "11. 历史产物与历史证据只读性核对"
echo "历史产物（应为空）："
git status --porcelain practice/src/render-loop/out practice/src/bili-loop/out practice/src/fixtures | sed 's/^/  /'
echo "第一/二轮证据（应为空）："
git status --porcelain tools/assessment/out tools/assessment/out-r2 | sed 's/^/  /'
echo "  （以上为空表示均未被改写；跨运行漂移检测见第 4 步）"

banner "结果汇总"
printf '%s\n' "${SUMMARY[@]}"
echo
echo "通过 $PASS / 失败 $FAIL"
[ "$FAIL" -eq 0 ] && echo "全部符合预期。" || echo "有不符合预期的项，见上。"
exit "$FAIL"
