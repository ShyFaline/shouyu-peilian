import { FilesetResolver, HandLandmarker } from "./vendor/vision_bundle.mjs";
import { stopCamera, stopTracks } from "./src/camera.js";
import { MAX_GAP_MS } from "./src/passState.js";
import { loadVersionManifest } from "./src/versions.js";
import { judge, presentJudge, createHold, resetHold } from "./src/judge.js";
import { canExportSnapshot, createSnapshot, serializeSnapshot } from "./src/snapshot.js";

const MAIN_PATH_FALLBACK = [
  "GF0021.A",
  "GF0021.B",
  "GF0021.U",
  "GF0021.V",
  "GF0021.L",
  "GF0021.Y",
  "GF0021.I",
  "GF0021.W",
];
const UNSTABLE_FALLBACK = ["GF0021.M", "GF0021.N", "GF0021.S", "GF0021.E", "GF0021.EH"];

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

const els = {
  video: document.getElementById("video"),
  canvas: document.getElementById("overlay"),
  status: document.getElementById("status"),
  verdict: document.getElementById("verdict"),
  hint: document.getElementById("hint"),
  how: document.getElementById("how"),
  demoStage: document.getElementById("demo-stage"),
  demoImage: document.getElementById("demo-image"),
  demoGlyph: document.getElementById("demo-glyph"),
  demoBadge: document.getElementById("demo-badge"),
  demoLabel: document.getElementById("demo-label"),
  letterBtns: document.getElementById("letter-btns"),
  atlasBtns: document.getElementById("atlas-btns"),
  startBtn: document.getElementById("start-btn"),
  stopBtn: document.getElementById("stop-btn"),
  mirrorToggle: document.getElementById("mirror-toggle"),
  exportToggle: document.getElementById("export-toggle"),
  exportBtn: document.getElementById("export-btn"),
  stage: document.getElementById("stage"),
};

const ctx = els.canvas.getContext("2d");

let letters = [];
let versionManifest = null;
let current = null;
let landmarker = null;
let running = false;
let lastVideoTime = -1;
let lastTimestamp = 0;
let frameId = 0;
let mirror = true;
let lastSnapshot = null;
let exportEnabled = false;
let hold = createHold();
let loopHandle = 0;
let lastFrameAt = null; // monotonic time of last consumed video frame, independent of hold
let lastClockTime = null; // Retain clock high-water even when feedback is invalidated.
let starting = false;
let startGeneration = 0;
let modelPromise = null;
let trackCleanup = [];

function invalidateFrame(reason = "stale") {
  resetHold(hold);
  lastSnapshot = null;
  lastFrameAt = null;
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  applyJudge({ decision: "undetermined", practiceStatus: current?.practiceStatus,
    issues: [{ code: reason, hint: "暂时无法判断" }], quality: { ok: false, reason },
    hold: { frames: 0, elapsedMs: 0 } });
  // Do NOT reset lastVideoTime: invalidation is not a new camera session.
}

function activeFrameSource() {
  const tracks = els.video.srcObject?.getVideoTracks?.() || [];
  return running && !document.hidden && els.video.readyState >= 2 &&
    tracks.length > 0 && tracks.every(t => t.readyState === "live" && !t.muted);
}

function freshFrame(now = performance.now()) {
  return Number.isFinite(now) && Number.isFinite(lastFrameAt) &&
    now >= lastFrameAt && now - lastFrameAt <= MAX_GAP_MS;
}

function scheduleLoop() {
  if (running && !loopHandle) loopHandle = requestAnimationFrame(loop);
}

function setStatus(text, kind) {
  els.status.textContent = text;
  els.status.dataset.kind = kind || "";
}

function setVerdict(decision, issues, extra) {
  const presented = extra && extra.title
    ? extra
    : presentJudge({ decision, issues, practiceStatus: current?.practiceStatus });
  els.verdict.textContent = presented.title;
  els.verdict.dataset.state = presented.state || "idle";
  els.hint.textContent = presented.hint || "";
}

function demoSrc(letter) {
  return `./content/demos/${letter.id}_front.png`;
}

function showDemo(letter) {
  els.demoGlyph.textContent = letter.demo;
  els.demoGlyph.dataset.wide = letter.demo.length > 1 ? "true" : "false";
  els.demoBadge.textContent = letter.demo;
  els.demoBadge.dataset.wide = letter.demo.length > 1 ? "true" : "false";
  els.demoStage.dataset.mode = "font";
  els.demoImage.removeAttribute("src");
  els.demoImage.alt = "";

  const src = demoSrc(letter);
  const probe = new Image();
  probe.onload = () => {
    if (current?.id !== letter.id) return;
    els.demoImage.src = src;
    els.demoImage.alt = `${letter.title}示范草稿（渲染图，未经标准核定，不参与识别）`;
    els.demoStage.dataset.mode = "image";
  };
  probe.onerror = () => {
    if (current?.id !== letter.id) return;
    els.demoImage.removeAttribute("src");
    els.demoImage.alt = "";
    els.demoStage.dataset.mode = "font";
  };
  probe.src = src;
}

function presentLetterIdle(letter) {
  if (!letter) {
    setVerdict("blocked", [], { title: "暂不判定", state: "idle", hint: "" });
    return;
  }
  const idle = presentJudge({
    decision: "blocked",
    practiceStatus: letter.practiceStatus,
    issues: [{ code: `status.${letter.practiceStatus}`, hint: letter.how }],
  });
  if (letter.practiceStatus === "pose_practice") {
    setVerdict("fail", [], { title: "比这个手型", state: "idle", hint: letter.how });
  } else {
    setVerdict("blocked", idle.hint ? [{ hint: idle.hint }] : [], idle);
  }
}

function selectLetter(letter) {
  current = letter;
  invalidateFrame("target_changed");
  lastSnapshot = null;
  showDemo(letter);
  els.demoLabel.textContent = `${letter.title} · ${letter.standard}`;
  els.how.textContent = letter.how;
  presentLetterIdle(letter);
  for (const btn of document.querySelectorAll(".letter-btns button")) {
    btn.dataset.active = btn.dataset.id === letter.id ? "true" : "false";
  }
}

function addLetterButton(letter, parent, unstable) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.id = letter.id;
  btn.dataset.status = letter.practiceStatus || "pending_review";
  btn.textContent = letter.label;
  if (unstable) {
    btn.dataset.unstable = "true";
    btn.title = "规则尚未能稳定分开，仅供对照国标外形";
    btn.textContent = `${letter.label} · 易混`;
  } else if (letter.practiceStatus === "pending_review") {
    btn.title = "未核定，暂不判定";
  } else if (letter.practiceStatus === "pose_practice") {
    btn.title = letter.id === "GF0021.J" || letter.id === "GF0021.Z"
      ? "只核静态姿态，不是完整掌握"
      : "可练静态姿态";
  } else if (letter.practiceStatus === "demo_only") {
    btn.title = "仅示范";
  }
  btn.addEventListener("click", () => selectLetter(letter));
  parent.appendChild(btn);
}

function drawHand(lm, w, h, color) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.beginPath();
  for (const [a, b] of CONNECTIONS) {
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
  }
  ctx.stroke();
  for (let i = 0; i < lm.length; i++) {
    ctx.fillStyle = i === 0 ? "#fff" : color;
    ctx.beginPath();
    ctx.arc(lm[i].x * w, lm[i].y * h, i === 0 ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function resizeCanvas() {
  const w = els.video.videoWidth;
  const h = els.video.videoHeight;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;
  if (els.canvas.width !== w) els.canvas.width = w;
  if (els.canvas.height !== h) els.canvas.height = h;
  return true;
}

function handednessOf(handedness) {
  const raw =
    handedness?.[0]?.[0]?.categoryName ??
    handedness?.[0]?.categoryName ??
    handedness?.[0]?.[0]?.displayName ??
    "";
  if (raw === "Left" || raw === "Right") return raw;
  return "Unknown";
}

function handednessPayload(handedness) {
  const score = handedness?.[0]?.[0]?.score ?? handedness?.[0]?.score;
  const out = { category: handednessOf(handedness) };
  if (typeof score === "number" && Number.isFinite(score)) out.score = score;
  return out;
}

function rememberSnapshot(lm, handedness, w, h, capturedAt) {
  const built = createSnapshot({
    capturedAt,
    frameId,
    imageWidth: w,
    imageHeight: h,
    coordSpace: "image_normalized",
    mirrored: mirror,
    targetLetterId: current?.id || "",
    sourceType: "camera",
    codeVersion: versionManifest.codeVersion,
    rulesVersion: versionManifest.rulesVersion,
    handedness: handednessPayload(handedness),
    landmarks: Array.from(lm, (p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })),
  });
  lastSnapshot = built.ok ? built.snapshot : null;
}

function applyJudge(judged) {
  const presented = presentJudge(judged);
  setVerdict(judged.decision, judged.issues, presented);
}

async function loop() {
  loopHandle = 0;
  if (!running || !landmarker) return;
  try {
    const now = performance.now();
    if (!Number.isFinite(now) || now < 0 || (lastClockTime != null && now < lastClockTime)) {
      invalidateFrame("invalid_time");
      return;
    }
    lastClockTime = now;
    // Check before every early return; background RAF is not an export authority.
    if (!freshFrame(now)) invalidateFrame("stale");
    if (!activeFrameSource()) {
      invalidateFrame("inactive");
      return;
    }
    const videoTime = els.video.currentTime;
    if (!Number.isFinite(now) || !Number.isFinite(videoTime) || videoTime < 0 || videoTime < lastVideoTime) {
      invalidateFrame("invalid_time");
      return;
    }
    if (videoTime === lastVideoTime) return;
    lastVideoTime = videoTime;
    lastFrameAt = now;
    const capturedAt = Date.now(); // Before detection, not completion time.
    lastTimestamp = Math.max(lastTimestamp + 1, now);
    frameId += 1;
    if (!resizeCanvas()) {
      invalidateFrame("missing_size");
      return;
    }
    const result = landmarker.detectForVideo(els.video, lastTimestamp);
    const w = els.canvas.width;
    const h = els.canvas.height;
    ctx.clearRect(0, 0, w, h);
    const hands = result.landmarks || [];
    const handedness = result.handednesses || result.handedness || [];
    const judged = judge({
      letter: current, hands, lm: hands[0],
      geom: { width: w, height: h, coordSpace: "image_normalized" },
      videoTime, nowMs: now,
    }, hold);
    const epochAge = Date.now() - capturedAt;
    if (!activeFrameSource() || !freshFrame() || !Number.isFinite(epochAge) || epochAge < 0 || epochAge > MAX_GAP_MS) {
      invalidateFrame("stale");
      return;
    }
    if (judged.quality.ok && hands.length === 1) {
      rememberSnapshot(hands[0], handedness, w, h, capturedAt);
      drawHand(hands[0], w, h, "#7ee0c6");
    } else {
      invalidateFrame(judged.quality.reason);
    }
    applyJudge(judged);
  } catch (err) {
    console.warn("detect loop", err);
    invalidateFrame("exception");
  } finally {
    scheduleLoop();
  }
}

async function createLandmarker(fileset, delegate) {
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: "./models/hand_landmarker.task",
      delegate,
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

async function initModel() {
  setStatus("正在加载本地模型…", "busy");
  const fileset = await FilesetResolver.forVisionTasks("./vendor/wasm");
  try {
    landmarker = await createLandmarker(fileset, "GPU");
  } catch (err) {
    console.warn("GPU delegate failed, falling back to CPU", err);
    landmarker = await createLandmarker(fileset, "CPU");
  }
  setStatus("模型已在本机就绪", "ok");
}

function setLiveButtons(live) {
  if (els.startBtn) els.startBtn.disabled = live;
  if (els.stopBtn) els.stopBtn.disabled = !live;
}

async function startCamera(generation) {
  setStatus("请求摄像头…", "busy");
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } },
  });
  if (generation !== startGeneration) { stopTracks(stream); return; }
  els.video.srcObject = stream;
  for (const track of stream.getVideoTracks()) {
    const guard = fn => () => { if (generation === startGeneration) fn(); };
    const handlers = {
      mute: guard(() => invalidateFrame("track_muted")),
      unmute: guard(() => invalidateFrame("track_unmuted")),
      ended: guard(stopLive),
    };
    for (const [event, handler] of Object.entries(handlers)) {
      track.addEventListener(event, handler);
      trackCleanup.push(() => track.removeEventListener(event, handler));
    }
  }
  try { await els.video.play(); }
  catch (err) {
    if (generation !== startGeneration) return; // stopLive already released this stream.
    throw err;
  }
  if (generation !== startGeneration) return;
  els.stage.dataset.live = "true";
  running = true;
  lastVideoTime = -1;
  lastTimestamp = 0;
  invalidateFrame("camera_started");
  setLiveButtons(true);
  setStatus("识别在本机进行，视频不上传", "ok");
  scheduleLoop();
}

function stopLive() {
  startGeneration += 1;
  starting = false;
  running = false;
  for (const cleanup of trackCleanup) cleanup();
  trackCleanup = [];
  lastFrameAt = null;
  lastClockTime = null;
  if (loopHandle) cancelAnimationFrame(loopHandle);
  loopHandle = 0;
  stopCamera(els.video);
  resetHold(hold);
  lastVideoTime = -1;
  lastTimestamp = 0;
  lastSnapshot = null;
  els.stage.dataset.live = "false";
  const w = els.canvas.width;
  const h = els.canvas.height;
  if (w && h) ctx.clearRect(0, 0, w, h);
  setLiveButtons(false);
  setStatus("摄像头已停，可再开", "idle");
  presentLetterIdle(current);
}

function applyMirror() {
  els.stage.dataset.mirror = mirror ? "true" : "false";
}

function downloadHandFrame() {
  if (!exportEnabled) {
    setStatus("导出默认关闭，先勾选再下载", "idle");
    return;
  }
  const active = activeFrameSource();
  const stale = !freshFrame();
  const allowed = canExportSnapshot(lastSnapshot, {
    active, stale, nowMs: Date.now(),
    hasHand: Boolean(lastSnapshot),
    qualityOk: true,
    currentLetterId: current?.id || "",
    handCount: lastSnapshot ? 1 : 0,
  });
  if (!allowed) {
    invalidateFrame("export_invalid");
    setStatus("当前不能导出（无手、质量无效、缺尺寸或已切目标）", "bad");
    return;
  }
  const payload = serializeSnapshot(lastSnapshot);
  if (!payload) {
    setStatus("当前不能导出（无手、质量无效、缺尺寸或已切目标）", "bad");
    return;
  }
  const letterId = payload.targetLetterId || "unknown";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `handframe-${letterId}-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus("已在本机下载 JSON，未上传", "ok");
}

async function main() {
  let pack;
  try {
    const res = await fetch("./content/letters.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`字母包加载失败 (${res.status})`);
    const lettersText = await res.text();
    pack = JSON.parse(lettersText);
    versionManifest = await loadVersionManifest(lettersText);
    console.info("practice version manifest", versionManifest);
  } catch (err) {
    console.error(err);
    setStatus("字母包没读到", "bad");
    setVerdict("blocked", [], {
      title: "内容层失败",
      state: "bad",
      hint: String(err && err.message ? err.message : err),
    });
    return;
  }
  letters = pack.letters || [];
  if (!letters.length) {
    setStatus("字母包是空的", "bad");
    return;
  }

  const byId = new Map(letters.map((letter) => [letter.id, letter]));
  const mainIds = (pack.mainPath || MAIN_PATH_FALLBACK).filter((id) => byId.has(id));
  const unstable = new Set(pack.unstableIds || UNSTABLE_FALLBACK);
  const mainSet = new Set(mainIds);

  for (const id of mainIds) {
    addLetterButton(byId.get(id), els.letterBtns, false);
  }
  for (const letter of letters) {
    if (!mainSet.has(letter.id)) {
      addLetterButton(letter, els.atlasBtns, unstable.has(letter.id));
    }
  }

  selectLetter(byId.get("GF0021.U") || byId.get(mainIds[0]) || letters[0]);
  setStatus("打开摄像头，对照左边示范。识别在本机，视频不上传。");
  applyMirror();
  setLiveButtons(false);

  els.mirrorToggle.checked = true;
  els.mirrorToggle.addEventListener("change", () => {
    mirror = els.mirrorToggle.checked;
    applyMirror();
  });

  els.exportToggle.checked = false;
  els.exportBtn.disabled = true;
  els.exportToggle.addEventListener("change", () => {
    exportEnabled = els.exportToggle.checked;
    els.exportBtn.disabled = !exportEnabled;
  });
  els.exportBtn.addEventListener("click", downloadHandFrame);

  document.addEventListener("visibilitychange", () => invalidateFrame("visibility_changed"));
  els.startBtn.addEventListener("click", async () => {
    if (starting || running) return;
    starting = true;
    const generation = ++startGeneration;
    setLiveButtons(true); // Stop remains available during permission/play/model waits.
    try {
      if (!landmarker) {
        if (!modelPromise) modelPromise = initModel().finally(() => { modelPromise = null; });
        await modelPromise;
      }
      if (generation !== startGeneration) return;
      await startCamera(generation);
    } catch (err) {
      if (generation !== startGeneration) return;
      console.error(err);
      stopLive();
      setStatus("摄像头或模型失败，可先看左边示范", "bad");
    } finally {
      if (generation === startGeneration) starting = false;
    }
  });
  if (els.stopBtn) els.stopBtn.addEventListener("click", stopLive);
}

main();
