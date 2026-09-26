/**
 * 旧离线入口迁移专项验证。
 *
 * 验证三件事：
 *   1. 缺尺寸 / 缺必要元数据 => 明确「不可评估」+ 非零退出码，且**不产出** geometry_pass / u_pass。
 *   2. 尺寸可追溯（帧自带 / --image / --width,--height）=> 正常评估，退出码 0。
 *   3. 历史产物逐字节不变 —— 两层真实比较：
        (a) 本次运行内 操作前 vs 操作后；
        (b) 与记录在案的基线清单 protected-baseline.json 比对（发现跨运行漂移）。
 *
 * 另含：
 *   - 旧调用入口（多个位置参数）必须明确拒绝（退出码 3），不得静默产出错误结果。
 *   - 保护性检查**自身的自检**：故意改一个字节，确认比较器能发现（证明它不是空壳）。
 *
 * 用法：bun tools/assessment/verify-legacy-migration.mjs
 * 退出码：0 全部通过；1 有断言失败。
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const HAND = join(ROOT, "practice", "src", "eval-handframe.mjs");
const BILI = join(ROOT, "practice", "src", "bili-loop", "eval-frames.mjs");
const RENDER_OUT = join(ROOT, "practice", "src", "render-loop", "out");
const BILI_OUT = join(ROOT, "practice", "src", "bili-loop", "out");
const FIXTURES = join(ROOT, "practice", "src", "fixtures");
const R1_OUT = join(HERE, "out");
const R2_OUT = join(HERE, "out-r2");
/** 记录在案的基线清单。跨运行比对，才能发现「上次之后被改过」。 */
const BASELINE = join(HERE, "protected-baseline.json");
/** 显式重录基线；必须人工决定，不能自动发生。 */
const RECORD = process.argv.includes("--record-baseline");

/** 受保护目录：本轮任何操作都不许改动它们。 */
const PROTECTED = [
  ["render-loop/out", RENDER_OUT],
  ["bili-loop/out", BILI_OUT],
  ["fixtures", FIXTURES],
  ["assessment/out (第一轮证据)", R1_OUT],
  ["assessment/out-r2 (第二轮证据)", R2_OUT],
];

const results = [];
const check = (name, cond, detail = "") => {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? "ok  " : "FAIL"} - ${name}${detail ? `  [${detail}]` : ""}`);
};

const run = (args) => spawnSync("bun", args, { cwd: ROOT, encoding: "utf8" });

// ---------------------------------------------------------------- 目录快照（逐文件内容哈希）
/** 递归列出目录下所有文件（相对路径）。 */
function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return; // 目录不存在
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * 行尾归一化：CRLF -> LF。含 NUL 视为二进制，原样返回。
 *
 * 为什么必须归一化：同一个文件在不同检出里可能是 LF 或 CRLF（受 git core.autocrlf /
 * .gitattributes 影响），git 认为它们**没有改动**。若按原始字节哈希，基线就会把
 * 一次正常的检出判成漂移。归一化后哈希与检出方式无关，与 git 的语义一致。
 */
function normalizeEol(buf) {
  if (buf.includes(0)) return buf; // 二进制：不碰
  const out = [];
  for (let i = 0; i < buf.length; i += 1) {
    if (buf[i] === 0x0d && buf[i + 1] === 0x0a) continue; // 丢掉 CR
    out.push(buf[i]);
  }
  return Buffer.from(out);
}

/**
 * git 跟踪的文件集合（绝对路径）。
 *
 * 受保护基线只应覆盖 **git 跟踪** 的文件：那些才是提交进仓库的历史证据。
 * 未跟踪的生成物（如 out/run-all.log，报告内含 generatedAt）在每个检出里
 * 可能不存在或不同，把它们纳入基线会让基线依赖本地环境，换个副本就误报。
 */
function gitTrackedSet(dir) {
  const r = spawnSync("git", ["ls-files", "-z", "--", dir], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0 || !r.stdout) return null; // 非 git 环境 => 不过滤
  return new Set(r.stdout.split("\0").filter(Boolean).map((p) => resolve(ROOT, p)));
}

/** 受保护目录里未被 git 跟踪的文件（绝对路径）。用于发现"往证据目录里塞新文件"。 */
function gitUntrackedIn(dir) {
  const r = spawnSync("git", ["ls-files", "-z", "--others", "--exclude-standard", "--", dir], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (r.status !== 0 || !r.stdout) return [];
  return r.stdout.split("\0").filter(Boolean).map((p) => resolve(ROOT, p));
}

/** 目录快照：{ relPath: sha256(归一化内容) }。trackedOnly 时只收 git 跟踪的文件。 */
function snapshotTree(dir, { trackedOnly = false } = {}) {
  const tracked = trackedOnly ? gitTrackedSet(dir) : null;
  const snap = {};
  for (const f of listFiles(dir)) {
    if (tracked && !tracked.has(resolve(f))) continue;
    const rel = relative(dir, f).split(sep).join("/");
    snap[rel] = createHash("sha256").update(normalizeEol(readFileSync(f))).digest("hex");
  }
  return snap;
}

/** 比较两个快照，返回差异列表。空数组 = 完全一致。 */
function diffTrees(before, after) {
  const diffs = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of [...keys].sort()) {
    if (!(k in before)) diffs.push(`新增 ${k}`);
    else if (!(k in after)) diffs.push(`删除 ${k}`);
    else if (before[k] !== after[k]) diffs.push(`内容改变 ${k}`);
  }
  return diffs;
}

function snapshotAll() {
  const out = {};
  for (const [label, dir] of PROTECTED) out[label] = snapshotTree(dir, { trackedOnly: true });
  return out;
}

function compareAll(before, after) {
  const diffs = [];
  for (const [label] of PROTECTED) {
    for (const d of diffTrees(before[label] ?? {}, after[label] ?? {})) diffs.push(`${label}: ${d}`);
  }
  return diffs;
}

const totalProtectedFiles = () =>
  PROTECTED.reduce((n, [, dir]) => n + Object.keys(snapshotTree(dir, { trackedOnly: true })).length, 0);

// ---------------------------------------------------------------- 保护性检查的自检
// 「算出了一个哈希」不算保护。这里故意改一个字节，确认比较器真的能发现。
{
  const sandbox = mkdtempSync(join(tmpdir(), "guard-selftest-"));
  try {
    mkdirSync(join(sandbox, "sub"), { recursive: true });
    writeFileSync(join(sandbox, "a.json"), '{"v":1}\n', "utf8");
    writeFileSync(join(sandbox, "sub", "b.json"), '{"v":2}\n', "utf8");

    const s0 = snapshotTree(sandbox);
    check("自检 快照能列出文件（含子目录）", Object.keys(s0).length === 2, JSON.stringify(Object.keys(s0)));
    check("自检 未改动时差异为空", diffTrees(s0, snapshotTree(sandbox)).length === 0);

    // 改一个字节
    writeFileSync(join(sandbox, "a.json"), '{"v":9}\n', "utf8");
    const d1 = diffTrees(s0, snapshotTree(sandbox));
    check("自检 单字节改动能被发现", d1.length === 1 && d1[0] === "内容改变 a.json", JSON.stringify(d1));

    // 新增文件
    writeFileSync(join(sandbox, "sub", "c.json"), "{}\n", "utf8");
    const d2 = diffTrees(s0, snapshotTree(sandbox));
    check("自检 新增文件能被发现", d2.some((x) => x.startsWith("新增")), JSON.stringify(d2));

    // 删除文件
    rmSync(join(sandbox, "a.json"));
    const d3 = diffTrees(s0, snapshotTree(sandbox));
    check("自检 删除文件能被发现", d3.some((x) => x.startsWith("删除")), JSON.stringify(d3));

    // 只改 mtime、内容不变 => 不应报差异（避免用 mtime 误报）
    const sBefore = snapshotTree(sandbox);
    writeFileSync(join(sandbox, "sub", "b.json"), '{"v":2}\n', "utf8");
    check("自检 仅重写同样内容不报差异（按内容而非 mtime）", diffTrees(sBefore, snapshotTree(sandbox)).length === 0);

    // 行尾 LF -> CRLF 不应报差异（否则换个检出方式就误报漂移）
    const eolFile = join(sandbox, "eol.json");
    writeFileSync(eolFile, '{"a":1}\n{"b":2}\n', "utf8");
    const sLf = snapshotTree(sandbox);
    writeFileSync(eolFile, '{"a":1}\r\n{"b":2}\r\n', "utf8");
    check(
      "自检 仅行尾 LF->CRLF 不报差异（哈希与检出方式无关）",
      diffTrees(sLf, snapshotTree(sandbox)).length === 0,
      JSON.stringify(diffTrees(sLf, snapshotTree(sandbox))),
    );
    // 但归一化之后，真实内容改动仍要报
    writeFileSync(eolFile, '{"a":1}\r\n{"b":3}\r\n', "utf8");
    check("自检 行尾归一化后仍能发现真实内容改动", diffTrees(sLf, snapshotTree(sandbox)).length === 1);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- 保护前快照
const beforeAll = snapshotAll();
check(
  "保护范围非空（真的在比较文件，不是空目录）",
  totalProtectedFiles() > 0,
  `受保护文件共 ${totalProtectedFiles()} 个`,
);

// ---------------------------------------------------------------- 跨运行基线比对
// 单次运行内的「前后比较」只能发现**本次操作**造成的改动；
// 对「上次跑完之后被改过」无能为力。所以再对一份记录在案的基线比对。
if (RECORD) {
  const payload = {
    _format: "protected-baseline/1",
    _eolNormalization: "CRLF->LF；含 NUL 的二进制原样哈希。哈希与检出方式无关。",
    _protectedLabels: PROTECTED.map(([label]) => label),
    trees: beforeAll,
  };
  writeFileSync(BASELINE, `${JSON.stringify(payload, null, 2)}
`, "utf8");
  console.log(`
已重录基线: ${BASELINE}（${totalProtectedFiles()} 个文件）`);
  console.log("注意：重录基线等于承认当前状态为已知良好；请确认这些改动是有意的。");
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  check("基线清单存在", false, `缺少 ${BASELINE}；请先运行 --record-baseline 并提交该文件`);
} else {
  const recordedFile = JSON.parse(readFileSync(BASELINE, "utf8"));
  const recorded = recordedFile.trees ?? recordedFile;
  // 基线必须覆盖当前全部受保护目录，否则比对是不完整的。
  const missingLabels = PROTECTED.map(([label]) => label).filter((l) => !(l in recorded));
  check(
    "基线覆盖全部受保护目录（无遗漏）",
    missingLabels.length === 0,
    missingLabels.length ? `缺少: ${missingLabels.join(", ")}` : `${PROTECTED.length} 个目录`,
  );
  const drift = compareAll(recorded, beforeAll);
  check(
    "受保护文件与记录基线一致（跨运行漂移检测）",
    drift.length === 0,
    drift.length
      ? `发现 ${drift.length} 处漂移：${drift.slice(0, 5).join("; ")}`
      : `${totalProtectedFiles()} 个文件与基线一致`,
  );
  if (drift.length) {
    console.log("    漂移明细：");
    for (const d of drift) console.log(`      - ${d}`);
    console.log("    处理：确认改动是否有意。若是误改，恢复原文件；若是有意，人工运行 --record-baseline 并提交。");
  }
}

const tmp = mkdtempSync(join(tmpdir(), "legacy-mig-"));

try {
  // ============================================================ 1. eval-handframe
  const noSizeFrame = join(tmp, "no-size.json");
  const lm = JSON.parse(readFileSync(join(RENDER_OUT, "GF0021.A.json"), "utf8")).landmarks;
  writeFileSync(
    noSizeFrame,
    JSON.stringify({ schemaVersion: 2, coordSpace: "image_normalized", targetLetterId: "GF0021.A", landmarks: lm }),
    "utf8",
  );
  const r1 = run([HAND, noSizeFrame, "GF0021.A"]);
  check("handframe 缺尺寸 => 退出码 2", r1.status === 2, `exit=${r1.status}`);
  check("handframe 缺尺寸 => status unevaluable", /status unevaluable/.test(r1.stdout), r1.stdout.split("\n")[0]);
  check(
    "handframe 缺尺寸 => 不打印 geometry_pass（不得写成动作负例）",
    !/geometry_pass/.test(r1.stdout),
    r1.stdout.includes("geometry_pass") ? "仍打印了 geometry_pass" : "无 geometry_pass",
  );
  check("handframe 缺尺寸 => 明确标 not_an_action_negative", /not_an_action_negative true/.test(r1.stdout));

  const r2 = run([HAND, noSizeFrame, "GF0021.A", "--image", join(ROOT, "practice/content/demos/GF0021.A_front.png")]);
  check("handframe 显式 --image => 退出码 0", r2.status === 0, `exit=${r2.status}`);
  check("handframe 显式 --image => geometry_pass 有真实含义", /geometry_pass (true|false)/.test(r2.stdout), r2.stdout.split("\n")[2]);

  const withSizeFrame = join(tmp, "with-size.json");
  writeFileSync(
    withSizeFrame,
    JSON.stringify({ schemaVersion: 2, coordSpace: "image_normalized", imageWidth: 768, imageHeight: 768, targetLetterId: "GF0021.A", landmarks: lm }),
    "utf8",
  );
  const r3 = run([HAND, withSizeFrame, "GF0021.A"]);
  check("handframe 帧自带尺寸 => 退出码 0", r3.status === 0, `exit=${r3.status}`);

  const r4 = run([HAND, withSizeFrame, "GF0021.NOPE"]);
  check("handframe 未知目标 => 退出码 2 且 unevaluable", r4.status === 2 && /status unevaluable/.test(r4.stdout), `exit=${r4.status}`);
  check("handframe 未知目标 => 不打印 geometry_pass", !/geometry_pass/.test(r4.stdout));

  const r5 = run([HAND]);
  check("handframe 无参数 => 退出码 3", r5.status === 3, `exit=${r5.status}`);

  // ============================================================ 2. bili eval-frames
  const packSrc = join(BILI_OUT, "BV1B64y1M7az.json");
  const packNoSize = join(tmp, "bili-no-size.json");
  cpSync(packSrc, packNoSize);

  const b1 = run([BILI, packNoSize]);
  check("bili 缺尺寸 => 退出码 2", b1.status === 2, `exit=${b1.status}`);
  check("bili 缺尺寸 => status unevaluable", /status unevaluable/.test(b1.stdout));
  check(
    "bili 缺尺寸 => 不产出 u_pass/v_pass（旧版正是这里静默误导）",
    !/u_pass/.test(b1.stdout) && !/v_pass/.test(b1.stdout),
    b1.stdout.includes("u_pass") ? "仍产出 u_pass" : "无 u_pass",
  );
  check("bili 缺尺寸 => 明确标 not_an_action_negative", /not_an_action_negative true/.test(b1.stdout));
  check("bili 缺尺寸 => 不写回输入文件", JSON.stringify(JSON.parse(readFileSync(packNoSize, "utf8"))) === JSON.stringify(JSON.parse(readFileSync(packSrc, "utf8"))));

  const b2 = run([BILI, packNoSize, "--width", "1280", "--height", "720"]);
  check("bili 显式尺寸 => 退出码 0", b2.status === 0, `exit=${b2.status}`);
  check("bili 显式尺寸 => 有可判定帧", /"evaluated":\s*[1-9]/.test(b2.stdout), b2.stdout.match(/"evaluated":\s*\d+/)?.[0] ?? "");
  check("bili 显式尺寸 => 仍不写回输入文件", JSON.stringify(JSON.parse(readFileSync(packNoSize, "utf8"))) === JSON.stringify(JSON.parse(readFileSync(packSrc, "utf8"))));

  const b3 = run([BILI]);
  check("bili 无参数 => 退出码 3", b3.status === 3, `exit=${b3.status}`);

  // 旧调用入口：两个位置参数（bili-loop/run.py 的旧写法）必须明确拒绝
  const b4 = run([BILI, packNoSize, packNoSize]);
  check("bili 旧调用入口（2 个位置参数）=> 退出码 3 明确拒绝", b4.status === 3, `exit=${b4.status}`);
  check(
    "bili 旧调用入口 => 报错说明不兼容原因，且不产出结果",
    /拒绝执行/.test(b4.stderr + b4.stdout) &&
      /不兼容/.test(b4.stderr + b4.stdout) &&
      !/status evaluated/.test(b4.stdout),
    (b4.stderr || b4.stdout).split("\n")[0],
  );
  check(
    "bili 旧调用入口 => 给出调用方改法（含 --width/--height/--out）",
    /--width/.test(b4.stderr + b4.stdout) && /--out/.test(b4.stderr + b4.stdout) && /referenceTargets/.test(b4.stderr + b4.stdout),
  );
  check("bili 旧调用入口 => 输入文件未被改写", JSON.stringify(JSON.parse(readFileSync(packNoSize, "utf8"))) === JSON.stringify(JSON.parse(readFileSync(packSrc, "utf8"))));

  const b5 = run([BILI, packNoSize, "--width", "1280", "--height", "720", "--json"]);
  const biliReport = JSON.parse(b5.stdout);
  check(
    "bili 报告用 referenceTargets（对照目标），不叫 pass 标签",
    biliReport.frames.some((f) => f.referenceTargets) && !biliReport.frames.some((f) => "u_pass" in f),
  );
  check("bili 报告带 letterLabeled=false（不报准确率）", biliReport.letterLabeled === false);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// ============================================================ 3. 历史产物逐字节未变（真实前后比较）
{
  const afterAll = snapshotAll();
  const diffs = compareAll(beforeAll, afterAll);
  check(
    "全部受保护目录在验证前后逐字节一致（真实前后比较）",
    diffs.length === 0,
    diffs.length ? diffs.slice(0, 5).join("; ") : `${totalProtectedFiles()} 个文件全部一致`,
  );
  for (const [label, dir] of PROTECTED) {
    const n = Object.keys(beforeAll[label] ?? {}).length;
    const d = diffTrees(beforeAll[label] ?? {}, afterAll[label] ?? {});
    check(`  ${label} 未改动（${n} 个跟踪文件）`, d.length === 0, d.slice(0, 3).join("; "));
  }

  // 往受保护目录里塞新的未跟踪文件也要被发现
  for (const [label, dir] of PROTECTED) {
    const extra = gitUntrackedIn(dir).map((p) => relative(dir, p).split(sep).join("/"));
    check(
      `  ${label} 无未跟踪新文件`,
      extra.length === 0,
      extra.length ? `发现: ${extra.slice(0, 5).join(", ")}` : "无",
    );
  }

  // 历史产物必须仍然缺尺寸、缺 schemaVersion —— 只是不再误读它们，没有伪造元数据
  const histRender = JSON.parse(readFileSync(join(RENDER_OUT, "GF0021.A.json"), "utf8"));
  check(
    "历史 render 帧仍无 imageWidth/imageHeight（没有事后补造元数据）",
    histRender.imageWidth === undefined && histRender.imageHeight === undefined,
  );
  const histBili = JSON.parse(readFileSync(join(BILI_OUT, "BV1B64y1M7az.json"), "utf8"));
  check("历史 bili 包未被注入标签", histBili.letter_labeled === false);
  check("历史 bili 帧仍无尺寸字段", histBili.frames.every((f) => f.imageWidth === undefined && f.imageHeight === undefined));
}

// ============================================================ 4. render-loop/run.py 静态检查
{
  const src = readFileSync(join(ROOT, "practice", "src", "render-loop", "run.py"), "utf8");
  check("run.py 传 --image 给 eval-handframe（尺寸可追溯，不猜）", src.includes('"--image"'));
  check("run.py 接受退出码 2（不可评估）而不是当失败", /returncode not in \(0, 2\)/.test(src));
  check("run.py 结果带 evaluated 字段", src.includes('"evaluated"'));
  check("run.py 不再把 missing_size 写成 pass=false 行", !/"pass": False, "issues": \["no_hand"\]\}/.test(src));
  check("run.py RESULTS 表区分「已评估」与不可评估", src.includes("已评估"));
}

// ============================================================ 5. bili-loop/run.py 不兼容现状（只读，不在本席写锁）
{
  const src = readFileSync(join(ROOT, "practice", "src", "bili-loop", "run.py"), "utf8");
  check(
    "bili-loop/run.py 仍是旧调用形式（已知不兼容，已提请求给 Grok，不在本席写锁）",
    /\[bun, str\(EVAL_JS\), str\(json_path\), str\(json_path\)\]/.test(src),
    "它现在会收到退出码 3 并被明确拒绝，不会悄悄产出错误结果",
  );
  check(
    "bili-loop/run.py 仍读 u_pass/v_pass（新 CLI 不再产出，属未解决项）",
    src.includes('frame.get("u_pass")'),
    "已记入 ROUND3.md 未解决项",
  );
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 断言通过`);
if (failed.length) {
  console.log("失败项:");
  for (const f of failed) console.log(`  - ${f.name} ${f.detail}`);
  process.exit(1);
}
