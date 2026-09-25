/**
 * 离线单帧入口（迁移版）。对一帧 HandFrame JSON 调共享核心 evaluate。
 *
 * 判定规则全部来自 practice/src/evaluate.js 与 coords.js，本文件不复制任何规则或阈值。
 *
 * 迁移要点（相对旧版）：
 *   - 缺尺寸 / 缺必要元数据 => 明确标为「不可评估」(unevaluable)，退出码 2。
 *     旧版会把 missing_size 产生的 false 当成普通动作负例打印出来，静默误导。
 *   - 尺寸只在**可追溯**时使用：帧自带 imageWidth/imageHeight，或从同源图像文件头读出。
 *     读不到就不可评估，**不猜、不补 1x1**。
 *   - 默认不写任何文件（只打印）；需要落盘时显式给 --out，避免覆盖历史产物。
 *
 * 用法:
 *   bun practice/src/eval-handframe.mjs <frame.json> [letterId] [--image <path>] [--out <path>] [--json]
 *
 * 退出码:
 *   0 已评估（geometry_pass 有真实含义）
 *   2 不可评估（缺尺寸 / 缺目标字母 / 无手等，不是动作负例）
 *   3 用法错误或 JSON 解析失败
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluate } from "./evaluate.js";

const root = dirname(fileURLToPath(import.meta.url));

export const EXIT_EVALUATED = 0;
export const EXIT_UNEVALUABLE = 2;
export const EXIT_USAGE = 3;

// ---------------------------------------------------------------- 图像尺寸（仅 I/O，非判定规则）
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

/** 从图像文件头读宽高。读不出返回 null，绝不猜。 */
export function readImageSize(path) {
  try {
    const buf = readFileSync(path);
    return pngSize(buf) ?? jpegSize(buf) ?? null;
  } catch {
    return null;
  }
}

/**
 * 追溯同源图像尺寸。只认**强关联**来源，避免拿别的图去顶：
 *   1. 帧自带的 imageWidth/imageHeight
 *   2. 与 JSON 同名的兄弟图像文件（同一 basename，强关联）
 *   3. 显式 --image（调用方明确声明这帧来自哪张图）
 * 不用「按字母去 demos 目录找」这类启发式——那等于猜尺寸。
 * 读不到就返回 null，交给核心报 missing_size。
 */
function traceSize(frame, { imagePath, framePath }) {
  if (Number.isFinite(frame.imageWidth) && Number.isFinite(frame.imageHeight)) {
    return { size: { width: frame.imageWidth, height: frame.imageHeight }, source: "frame.imageWidth/imageHeight" };
  }
  const candidates = [];
  if (framePath) {
    const base = framePath.replace(/\.json$/i, "");
    for (const ext of [".png", ".jpg", ".jpeg"]) candidates.push([`${base}${ext}`, "sibling image"]);
  }
  if (imagePath) candidates.push([imagePath, "--image"]);
  for (const [p, src] of candidates) {
    if (p && existsSync(p)) {
      const size = readImageSize(p);
      if (size) return { size, source: `${src}:${p}` };
    }
  }
  return { size: null, source: null, tried: candidates.map(([p]) => p).filter(Boolean) };
}

// ---------------------------------------------------------------- 主流程
function parseArgs(argv) {
  const positional = [];
  const opts = { image: null, out: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--image") opts.image = argv[++i];
    else if (a === "--out") opts.out = argv[++i];
    else if (a === "--json") opts.json = true;
    else positional.push(a);
  }
  return { positional, opts };
}

function main() {
  const { positional, opts } = parseArgs(process.argv.slice(2));
  const [frameArg, letterArg] = positional;
  if (!frameArg) {
    console.error("用法: bun practice/src/eval-handframe.mjs <frame.json> [letterId] [--image <path>] [--out <path>] [--json]");
    return EXIT_USAGE;
  }

  const framePath = resolve(frameArg);
  let frame;
  try {
    frame = JSON.parse(readFileSync(framePath, "utf8"));
  } catch (e) {
    console.error(`无法读取帧 JSON: ${framePath}\n  ${e.message ?? e}`);
    return EXIT_USAGE;
  }

  const lettersPath = join(root, "..", "content", "letters.json");
  const pack = JSON.parse(readFileSync(lettersPath, "utf8"));
  const letterId = letterArg ?? frame.targetLetterId ?? null;
  const letter = letterId ? pack.letters.find((l) => l.id === letterId) : null;

  const report = {
    frame: framePath,
    letterId,
    evaluated: false,
    status: null,
    reason: null,
    geometryPass: null,
    ruleStatus: null,
    issueCodes: [],
    size: null,
    sizeSource: null,
    notAnActionNegative: false,
    note: null,
  };

  // 1) 目标字母
  if (!letter) {
    report.status = "unevaluable";
    report.reason = letterId ? "unknown_target" : "missing_target";
    report.notAnActionNegative = true;
    report.note = "没有可判定的目标字母。这不是动作负例。";
  } else {
    // 2) 尺寸：只在可追溯时使用（帧自带字段或同源图像文件头）。读不到就交给核心报 missing_size。
    const { size, source, tried } = traceSize(frame, { imagePath: opts.image, letterId, framePath });
    report.size = size;
    report.sizeSource = source;

    // 3) 共享核心判定。规则、阈值、坐标变换全部由 evaluate/coords 负责，本文件不复制。
    const geom = { coordSpace: frame.coordSpace ?? "image_normalized" };
    if (size) {
      geom.width = size.width;
      geom.height = size.height;
    }
    const res = evaluate(letter, frame.landmarks, geom);
    report.ruleStatus = res.ruleStatus;
    report.issueCodes = (res.audit ?? []).map((x) => x.code);

    if (res.ruleStatus === "ok") {
      // 只有核心真的算完了，geometry_pass 才有意义。
      report.evaluated = true;
      report.status = "evaluated";
      report.reason = "geometry_evaluated";
      report.geometryPass = res.pass;
    } else {
      // missing_size / no_hand / empty / unsupported / unsupported_coord_space / invalid_input
      // 一律是不可评估，**不是动作负例**。旧版正是把这里的 missing_size 写成 pass=false。
      report.status = "unevaluable";
      report.reason = res.ruleStatus;
      report.notAnActionNegative = true;
      const hint =
        res.ruleStatus === "missing_size"
          ? `缺尺寸，不可评估。尝试过的来源：${(tried ?? []).join(", ") || "无"}。尺寸只能从帧自带字段或同源图像文件头追溯，禁止猜测。`
          : res.ruleStatus === "no_hand"
            ? "没有手，不可评估。这不是动作负例。"
            : res.ruleStatus === "empty" || res.ruleStatus === "unsupported"
              ? "规则本身不可判，不是动作负例。"
              : "输入不可用，不是动作负例。";
      report.note = hint;
    }
  }

  // 输出：保持旧版的 geometry_pass 行（仅在真的评估过时），并新增 status 行
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`status ${report.status}`);
    console.log(`reason ${report.reason}`);
    if (report.evaluated) {
      console.log(`geometry_pass ${report.geometryPass}`);
      console.log(`ruleStatus ${report.ruleStatus}`);
      console.log(`size ${report.size.width}x${report.size.height} (${report.sizeSource})`);
      for (const c of report.issueCodes) console.log(c);
    } else {
      // 旧版这里会打印 geometry_pass false —— 正是被禁止的「把 missing_size 写成动作负例」。
      console.log(`unevaluable true`);
      console.log(`not_an_action_negative ${report.notAnActionNegative}`);
      console.log(`note ${report.note}`);
    }
  }

  if (opts.out) {
    const p = resolve(opts.out);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.error(`报告写入: ${p}`);
  }

  return report.evaluated ? EXIT_EVALUATED : EXIT_UNEVALUABLE;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
