/**
 * 对 bili-loop 抽帧 JSON 调共享核心 evaluate（迁移版）。
 *
 * 判定规则全部来自 practice/src/evaluate.js 与 coords.js，本文件不复制规则、不改阈值。
 *
 * 迁移要点（相对旧版）：
 *   - 旧版 `evaluate(letter, lm)` 不传尺寸，当前核心会返回 ruleStatus="missing_size"、
 *     pass=false。旧版把这个 false 当成 U/V 的「动作负例」写进 u_pass/v_pass，静默误导。
 *     本版：拿不到尺寸就整份标为**不可评估**，退出码 2，**不产出 u_pass/v_pass**。
 *   - 尺寸只在**可追溯**时使用：帧自带 imageWidth/imageHeight、显式 --width/--height、
 *     或 --video 经 ffprobe 读出。读不到就是不可评估，不猜。
 *   - 默认**不写文件**（只打印）。要落盘必须显式 --out，避免覆盖 bili-loop/out 历史产物。
 *   - letter_labeled=false 时 U/V 只是对照目标，不是标签；本文件不报任何准确率。
 *
 * 用法:
 *   bun practice/src/bili-loop/eval-frames.mjs <pack.json> [--video <path> | --width N --height N]
 *        [--out <path>] [--json]
 *
 * 退出码:
 *   0 已评估（u_pass/v_pass 有真实含义）
 *   2 不可评估（缺尺寸，或没有任何可判定帧）
 *   3 用法错误 / JSON 解析失败
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { evaluate } from "../evaluate.js";

export const EXIT_EVALUATED = 0;
export const EXIT_UNEVALUABLE = 2;
export const EXIT_USAGE = 3;

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const positional = [];
  const opts = { video: null, width: null, height: null, out: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--video") opts.video = argv[++i];
    else if (a === "--width") opts.width = Number(argv[++i]);
    else if (a === "--height") opts.height = Number(argv[++i]);
    else if (a === "--out") opts.out = argv[++i];
    else if (a === "--json") opts.json = true;
    else positional.push(a);
  }
  return { positional, opts };
}

/** 经 ffprobe 读视频宽高。读不到返回 null —— 不猜。 */
export function probeVideoSize(path) {
  const probe = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", path],
    { encoding: "utf8" },
  );
  if (probe.status !== 0 || !probe.stdout) return null;
  try {
    const s = JSON.parse(probe.stdout).streams?.[0];
    if (Number.isFinite(s?.width) && Number.isFinite(s?.height)) return { width: s.width, height: s.height };
  } catch {
    return null;
  }
  return null;
}

/** 尺寸来源优先级：帧自带 > 显式 --width/--height > --video(ffprobe)。 */
function resolveSize(pack, opts) {
  const f = (pack.frames ?? []).find((x) => Number.isFinite(x.imageWidth) && Number.isFinite(x.imageHeight));
  if (f) return { size: { width: f.imageWidth, height: f.imageHeight }, source: "frame.imageWidth/imageHeight" };
  if (Number.isFinite(opts.width) && Number.isFinite(opts.height)) {
    return { size: { width: opts.width, height: opts.height }, source: "--width/--height" };
  }
  if (opts.video) {
    const size = probeVideoSize(opts.video);
    if (size) return { size, source: `ffprobe:${opts.video}` };
    return { size: null, source: null, tried: [`ffprobe ${opts.video}`] };
  }
  return { size: null, source: null, tried: [] };
}

function main() {
  const { positional, opts } = parseArgs(process.argv.slice(2));
  const packArg = positional[0];
  if (!packArg) {
    console.error(
      "用法: bun practice/src/bili-loop/eval-frames.mjs <pack.json> [--video <path> | --width N --height N] [--out <path>] [--json]",
    );
    return EXIT_USAGE;
  }

  const packPath = resolve(packArg);
  let pack;
  try {
    pack = JSON.parse(readFileSync(packPath, "utf8"));
  } catch (e) {
    console.error(`无法读取帧 JSON: ${packPath}\n  ${e.message ?? e}`);
    return EXIT_USAGE;
  }

  const lettersPath = resolve(here, "..", "..", "content", "letters.json");
  const all = JSON.parse(readFileSync(lettersPath, "utf8")).letters;
  const letterU = all.find((l) => l.id === "GF0021.U");
  const letterV = all.find((l) => l.id === "GF0021.V");

  const { size, source, tried } = resolveSize(pack, opts);
  const letterLabeled = pack.letter_labeled === true;

  const report = {
    pack: packPath,
    bvid: pack.bvid ?? null,
    letterLabeled,
    coordSpace: "image_normalized",
    size: size ?? null,
    sizeSource: source ?? null,
    evaluable: false,
    status: null,
    reason: null,
    notAnActionNegative: false,
    note: null,
    totals: { frames: 0, withHand: 0, withoutHand: 0, evaluated: 0, unevaluable: 0 },
    frames: [],
  };

  if (!size) {
    // 旧版正是在这里把 missing_size 的 false 写成 u_pass/v_pass 的动作负例。
    report.status = "unevaluable";
    report.reason = "missing_size";
    report.notAnActionNegative = true;
    report.note =
      `缺尺寸，整份不可评估（不是动作负例）。尝试过的来源：${(tried ?? []).join(", ") || "无"}。` +
      " 尺寸只能来自帧自带字段、显式 --width/--height 或 --video 的 ffprobe，禁止猜测。";
    report.totals.frames = (pack.frames ?? []).length;
    report.totals.withoutHand = (pack.frames ?? []).filter((f) => !Array.isArray(f.landmarks) || f.landmarks.length < 21).length;
    report.totals.withHand = report.totals.frames - report.totals.withoutHand;
    report.totals.unevaluable = report.totals.frames;
  } else {
    const geom = { width: size.width, height: size.height, coordSpace: "image_normalized" };
    for (const fr of pack.frames ?? []) {
      report.totals.frames += 1;
      const lm = Array.isArray(fr.landmarks) && fr.landmarks.length >= 21 ? fr.landmarks : null;
      if (!lm) {
        report.totals.withoutHand += 1;
        report.frames.push({ t: fr.t, status: "unevaluable", reason: "no_hand", notAnActionNegative: true });
        continue;
      }
      report.totals.withHand += 1;
      const u = evaluate(letterU, lm, geom);
      const v = evaluate(letterV, lm, geom);
      const ok = u.ruleStatus === "ok" && v.ruleStatus === "ok";
      if (ok) {
        report.totals.evaluated += 1;
        report.frames.push({
          t: fr.t,
          status: "evaluated",
          // U/V 是**对照目标**，不是标签。letter_labeled=false 时更不构成成绩。
          referenceTargets: { U: { pass: u.pass, issues: (u.audit ?? []).map((x) => x.code) }, V: { pass: v.pass, issues: (v.audit ?? []).map((x) => x.code) } },
        });
      } else {
        report.totals.unevaluable += 1;
        report.frames.push({
          t: fr.t,
          status: "unevaluable",
          reason: u.ruleStatus !== "ok" ? `U:${u.ruleStatus}` : `V:${v.ruleStatus}`,
          notAnActionNegative: true,
        });
      }
    }
    report.evaluable = report.totals.evaluated > 0;
    report.status = report.evaluable ? "evaluated" : "unevaluable";
    report.reason = report.evaluable ? "evaluated" : "no_evaluable_frame";
    report.notAnActionNegative = !report.evaluable;
    report.note = report.evaluable
      ? "已用可追溯尺寸评估。U/V 是对照目标不是标签；未标注字母的片段不报准确率。"
      : "没有任何可判定帧。这不是动作负例。";
  }

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`status ${report.status}`);
    console.log(`reason ${report.reason}`);
    console.log(`size ${report.size ? `${report.size.width}x${report.size.height} (${report.sizeSource})` : "none"}`);
    console.log(`letter_labeled ${report.letterLabeled}`);
    console.log(`totals ${JSON.stringify(report.totals)}`);
    if (!report.evaluable) {
      console.log(`unevaluable true`);
      console.log(`not_an_action_negative ${report.notAnActionNegative}`);
      console.log(`note ${report.note}`);
    }
  }

  if (opts.out) {
    const p = resolve(opts.out);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.error(`报告写入: ${p}（未覆盖 bili-loop/out 历史产物）`);
  }

  return report.evaluable ? EXIT_EVALUATED : EXIT_UNEVALUABLE;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
