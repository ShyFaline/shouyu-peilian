/**
 * 旧离线入口迁移专项验证。
 *
 * 验证三件事，全部用**副本**，绝不碰历史产物：
 *   1. 缺尺寸 / 缺必要元数据 => 明确「不可评估」+ 非零退出码，且**不产出** geometry_pass / u_pass。
 *   2. 尺寸可追溯（帧自带 / --image / --width,--height）=> 正常评估，退出码 0。
 *   3. 历史产物目录在验证前后字节不变。
 *
 * 用法：bun tools/assessment/verify-legacy-migration.mjs
 * 退出码：0 全部通过；1 有断言失败。
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const HAND = join(ROOT, "practice", "src", "eval-handframe.mjs");
const BILI = join(ROOT, "practice", "src", "bili-loop", "eval-frames.mjs");
const RENDER_OUT = join(ROOT, "practice", "src", "render-loop", "out");
const BILI_OUT = join(ROOT, "practice", "src", "bili-loop", "out");

const results = [];
const check = (name, cond, detail = "") => {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? "ok  " : "FAIL"} - ${name}${detail ? `  [${detail}]` : ""}`);
};

const run = (args) => spawnSync("bun", args, { cwd: ROOT, encoding: "utf8" });
const dirHash = (dir) =>
  createHash("sha256")
    .update(
      readdirSync(dir)
        .sort()
        .filter((f) => f.endsWith(".json"))
        .map((f) => `${f}:${readFileSync(join(dir, f))}`)
        .join("\n"),
    )
    .digest("hex")
    .slice(0, 16);

const tmp = mkdtempSync(join(tmpdir(), "legacy-mig-"));

/** 历史产物会被重新渲染/重新导出，文件名不保证。只挑存在的帧，缺了就当「夹具缺失」如实报。 */
const jsonFiles = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : []);

// 历史产物的「验证前后字节不变」基线（缺目录时留 null，由断言报出来）
const hashBefore = {
  render: existsSync(RENDER_OUT) ? dirHash(RENDER_OUT) : null,
  bili: existsSync(BILI_OUT) ? dirHash(BILI_OUT) : null,
};

try {
  // ============================================================ 1. eval-handframe
  // 1a. 历史 render 帧：没有同名兄弟图（也可能没有尺寸）=> 一律当不可评估，不猜尺寸
  const { writeFileSync } = await import("node:fs");
  const renderFrames = jsonFiles(RENDER_OUT);
  const renderFrame = renderFrames.length ? join(RENDER_OUT, renderFrames[0]) : null;
  check(
    "历史 render 帧夹具存在（迁移验证依赖）",
    !!renderFrame,
    renderFrame ?? `${RENDER_OUT} 内没有 .json 帧`,
  );

  if (!renderFrame) {
    console.log("  跳过 eval-handframe 用例：历史 render 帧夹具缺失（见上，非代码缺陷）。");
  } else {
    const lm = JSON.parse(readFileSync(renderFrame, "utf8")).landmarks;
    const noSizeFrame = join(tmp, "no-size.json");
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

    // 1b. 显式 --image 追溯尺寸 => 已评估
    const r2 = run([HAND, noSizeFrame, "GF0021.A", "--image", join(ROOT, "practice/content/demos/GF0021.A_front.png")]);
    check("handframe 显式 --image => 退出码 0", r2.status === 0, `exit=${r2.status}`);
    check("handframe 显式 --image => geometry_pass 有真实含义", /geometry_pass (true|false)/.test(r2.stdout), r2.stdout.split("\n")[2]);

    // 1c. 帧自带尺寸 => 已评估
    const withSizeFrame = join(tmp, "with-size.json");
    writeFileSync(
      withSizeFrame,
      JSON.stringify({ schemaVersion: 2, coordSpace: "image_normalized", imageWidth: 768, imageHeight: 768, targetLetterId: "GF0021.A", landmarks: lm }),
      "utf8",
    );
    const r3 = run([HAND, withSizeFrame, "GF0021.A"]);
    check("handframe 帧自带尺寸 => 退出码 0", r3.status === 0, `exit=${r3.status}`);

    // 1d. 未知目标字母 => 不可评估
    const r4 = run([HAND, withSizeFrame, "GF0021.NOPE"]);
    check("handframe 未知目标 => 退出码 2 且 unevaluable", r4.status === 2 && /status unevaluable/.test(r4.stdout), `exit=${r4.status}`);
    check("handframe 未知目标 => 不打印 geometry_pass", !/geometry_pass/.test(r4.stdout));
  }

  // 1e. 用法错误 => 退出码 3（不依赖夹具）
  const r5 = run([HAND]);
  check("handframe 无参数 => 退出码 3", r5.status === 3, `exit=${r5.status}`);

  // ============================================================ 2. bili eval-frames
  const packSrc = join(BILI_OUT, "BV1B64y1M7az.json");
  const hasPack = existsSync(packSrc);
  check("历史 bili 包夹具存在（迁移验证依赖）", hasPack, hasPack ? packSrc : `${packSrc} 不存在`);

  if (!hasPack) {
    console.log("  跳过 bili eval-frames 用例：历史 bili 包夹具缺失（见上，非代码缺陷）。");
  } else {
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

    // bili 报告里 U/V 必须叫「对照目标」，不能叫 pass/标签
    const b4 = run([BILI, packNoSize, "--width", "1280", "--height", "720", "--json"]);
    const biliReport = JSON.parse(b4.stdout);
    check(
      "bili 报告用 referenceTargets（对照目标），不叫 pass 标签",
      biliReport.frames.some((f) => f.referenceTargets) && !biliReport.frames.some((f) => "u_pass" in f),
    );
    check("bili 报告带 letterLabeled=false（不报准确率）", biliReport.letterLabeled === false);

    const histBili = JSON.parse(readFileSync(packSrc, "utf8"));
    check("历史 bili 包仍无 letter_labeled 以外的标签（未被注入标签）", histBili.letter_labeled === false);
    check("历史 bili 帧仍无尺寸字段", histBili.frames.every((f) => f.imageWidth === undefined && f.imageHeight === undefined));
  }

  const b3 = run([BILI]);
  check("bili 无参数 => 退出码 3", b3.status === 3, `exit=${b3.status}`);

  // ============================================================ 3. 历史产物未被改写（验证前后逐字节对比）
  check(
    "render-loop/out 验证前后字节不变",
    hashBefore.render != null && existsSync(RENDER_OUT) && dirHash(RENDER_OUT) === hashBefore.render,
    hashBefore.render ?? `${RENDER_OUT} 不存在`,
  );
  check(
    "bili-loop/out 验证前后字节不变",
    hashBefore.bili != null && existsSync(BILI_OUT) && dirHash(BILI_OUT) === hashBefore.bili,
    hashBefore.bili ?? `${BILI_OUT} 不存在`,
  );
  if (renderFrame) {
    // 渲染管线现在会往帧里写尺寸（历史产物不保证缺尺寸），这里只如实报告，不作为断言。
    const histRender = JSON.parse(readFileSync(renderFrame, "utf8"));
    console.log(
      `  [信息] 现行历史 render 帧 ${renderFrames[0]} ${histRender.imageWidth !== undefined ? "自带" : "不带"}尺寸字段；本验证不据此推断，也不回写。`,
    );
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
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

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 断言通过`);
if (failed.length) {
  console.log("失败项:");
  for (const f of failed) console.log(`  - ${f.name} ${f.detail}`);
  process.exit(1);
}
