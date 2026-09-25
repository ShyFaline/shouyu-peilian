/**
 * 修前证据生成器。用 **5b56abd 的旧 report.mjs** 跑本轮反例夹具，把 bug 的暴露结果落盘。
 *
 * 为什么要这个：第二轮的两个问题是**定义错误**，不是崩溃。要证明「修前确实错」，
 * 必须保留旧口径下的输出，而不是只在报告里写一句话。
 *
 * 做法：从 git 取旧 report.mjs 到临时文件，与当前 replay/truth/core 组合（那三层本轮未改口径），
 * 跑四组反例，写入 out-r2/pre-fix/。
 *
 * 用法：bun tools/assessment/pre-fix-evidence.mjs
 * 退出码：0 生成成功；1 生成失败（例如 git 取不到旧版本）。
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const CE = join(HERE, "samples", "counterexamples");
const OUT = join(HERE, "out-r2", "pre-fix");
const BASELINE = "5b56abd";

const { loadLetters } = await import("./lib/core.mjs");
const { loadSamples, replayAll } = await import("./lib/replay.mjs");
const { alignLabels, loadLabels } = await import("./lib/truth.mjs");

// 取旧 report.mjs
const tmp = join(HERE, "lib", "_prefix-report.tmp.mjs");
const show = spawnSync("git", ["show", `${BASELINE}:tools/assessment/lib/report.mjs`], {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});
if (show.status !== 0 || !show.stdout) {
  console.error(`无法从 ${BASELINE} 取旧 report.mjs：${show.stderr || "空输出"}`);
  process.exit(1);
}
writeFileSync(tmp, show.stdout, "utf8");

try {
  const { buildReport: buildReportPrefix } = await import(pathToFileURL(tmp).href);
  const letters = loadLetters(ROOT);
  mkdirSync(OUT, { recursive: true });

  const groups = ["label-only-human", "source-orthogonality", "metric-cells", "sequence-levels"];
  const summary = { baseline: BASELINE, note: "旧口径下的输出，用于对比修后行为。", groups: {} };

  for (const g of groups) {
    const dir = join(CE, g);
    const reps = replayAll(loadSamples(dir), letters);
    const lb = loadLabels(JSON.parse(readFileSync(join(dir, "labels.json"), "utf8")));
    const { aligned } = alignLabels(lb.accepted, reps.map((r) => r.sampleId));
    const rep = buildReportPrefix({
      replays: reps,
      labels: aligned,
      level: "auto",
      coreFingerprint: {},
      labelInfo: { provided: true },
    });
    const slim = {
      baseline: BASELINE,
      group: g,
      humanEvaluation: { executed: rep.humanEvaluation.executed, note: rep.humanEvaluation.note },
      totals: {
        samples: rep.totals.samples,
        labeled: rep.totals.labeled,
        scored: rep.totals.scored,
        falseAcceptRate: rep.totals.falseAcceptRate,
        falseRejectRate: rep.totals.falseRejectRate,
        coverage: rep.totals.coverage,
        agreement: rep.totals.agreement,
      },
      byTruthOrigin: (rep.byTruthOrigin ?? []).map((b) => ({ key: b.key, samples: b.samples })),
      bySourceType: (rep.bySourceType ?? []).map((b) => ({ key: b.key, samples: b.samples })),
    };
    writeFileSync(join(OUT, `${g}.json`), `${JSON.stringify(slim, null, 2)}\n`, "utf8");
    summary.groups[g] = {
      executed: rep.humanEvaluation.executed,
      falseAcceptRate: rep.totals.falseAcceptRate,
      falseRejectRate: rep.totals.falseRejectRate,
    };
    console.log(
      `PRE-FIX ${g.padEnd(22)} executed=${String(rep.humanEvaluation.executed).padEnd(5)}` +
        ` 误接收(旧)=${rep.totals.falseAcceptRate.num}/${rep.totals.falseAcceptRate.den}` +
        ` 误拒绝(旧)=${rep.totals.falseRejectRate.num}/${rep.totals.falseRejectRate.den}`,
    );
  }

  writeFileSync(join(OUT, "SUMMARY.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`\n修前证据写入 ${OUT}（基线 ${BASELINE}）`);
} finally {
  rmSync(tmp, { force: true });
}
