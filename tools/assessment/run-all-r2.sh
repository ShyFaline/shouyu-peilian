#!/usr/bin/env bash
# 第二轮一键复现。只读核心，只写 tools/assessment/out-r2/。
# 不覆盖第一轮证据（tools/assessment/out/），也不碰历史产物（render-loop/out、bili-loop/out）。
#
# 用法: bash tools/assessment/run-all-r2.sh
set -u

cd "$(dirname "$0")/../.." || exit 2
ROOT="$(pwd)"
OUT="tools/assessment/out-r2"
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
echo "bun: $(bun --version 2>/dev/null || echo 'MISSING')"
bun -e '
import { coreFingerprint } from "./tools/assessment/lib/fingerprint.mjs";
import { writeFileSync } from "node:fs";
const fp = coreFingerprint();
writeFileSync("tools/assessment/out-r2/core-fingerprint.json", JSON.stringify(fp, null, 2) + "\n");
console.log("coreFingerprint.digest =", fp.digest);
'
echo "注意：核心由 Grok 持有写锁；本轮期间核心可能正在被改动。"
echo "若指纹与报告不一致，报告作废需重跑。"

banner "1. 核心回归基线（只读；本席未改核心）"
bun practice/src/evaluate.test.js 2>&1 | tail -3
record "core evaluate.test.js" 0 "${PIPESTATUS[0]}"

banner "2. 生成合成夹具 + 反例夹具"
bun tools/assessment/samples/generate-synthetic.mjs
record "generate-synthetic" 0 "$?"
bun tools/assessment/samples/counterexamples/generate-counterexamples.mjs
record "generate-counterexamples" 0 "$?"

banner "3. 骨架自检（62 断言：含来源/标签正交、全体 vs conditional、序列层级）"
bun tools/assessment/verify-skeleton.mjs 2>&1 | tail -20
record "verify-skeleton" 0 "${PIPESTATUS[0]}"

banner "4. 旧离线入口迁移专项验证（31 断言）"
bun tools/assessment/verify-legacy-migration.mjs 2>&1 | tail -12
record "verify-legacy-migration" 0 "${PIPESTATUS[0]}"

banner "4b. 修前证据（用 5b56abd 的旧 report.mjs 复现两个 bug）"
bun tools/assessment/pre-fix-evidence.mjs
record "pre-fix-evidence" 0 "$?"

banner "5. 反例夹具：修后行为"
for g in label-only-human source-orthogonality metric-cells sequence-levels; do
  echo "--- $g ---"
  bun tools/assessment/replay.mjs "$CE/$g" --labels "$CE/$g/labels.json" --allow-invalid --out "$OUT/ce-$g.json" 2>&1 | head -14
done
record "replay counterexamples" 0 "$?"

banner "6. 合成夹具：修后行为（应与第一轮结论一致，但字段口径更新）"
bun tools/assessment/replay.mjs "$SYN" --labels "$SYN/labels.json" --allow-invalid --out "$OUT/replay-synthetic.json" 2>&1 | head -14
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

banner "10. 历史产物与第一轮证据只读性核对"
echo "历史产物（应为空）："
git status --porcelain practice/src/render-loop/out practice/src/bili-loop/out practice/src/fixtures | sed 's/^/  /'
echo "第一轮证据 out/（应为空）："
git status --porcelain tools/assessment/out | sed 's/^/  /'
echo "  （以上为空表示均未被改写）"

banner "结果汇总"
printf '%s\n' "${SUMMARY[@]}"
echo
echo "通过 $PASS / 失败 $FAIL"
[ "$FAIL" -eq 0 ] && echo "全部符合预期。" || echo "有不符合预期的项，见上。"
exit "$FAIL"
