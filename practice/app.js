import { FilesetResolver, HandLandmarker } from "./vendor/vision_bundle.mjs";
import { stopCamera, stopTracks } from "./src/camera.js";
import { MAX_GAP_MS } from "./src/passState.js";
import { loadVersionManifest } from "./src/versions.js";
import { judge, presentJudge, createHold, resetHold } from "./src/judge.js";
import { canExportSnapshot, createSnapshot, serializeSnapshot } from "./src/snapshot.js";
import { groupLetters, capabilityNote, letterAriaLabel, confusionCluster, isPracticeable } from "./src/letterLibrary.js";
import { attachRotator, parseRotIndex } from "./src/rotator.js";
import { mountScopeSwitch } from "./src/scopeSwitch.js";
import {
  SCOPE_META,
  resolveScope,
  writeStoredScope,
  filterByScope,
  scopeSearch,
} from "./src/scope.js";
import {
  MODE_LEARN,
  MODE_TEST,
  parsePracticeMode,
  isRecordsHash,
  startAttempt,
  isSameAttempt,
  testScopeText,
  presentTestJudge,
  canRecordPass,
} from "./src/practiceSession.js";
import {
  readStorage,
  loadProgress,
  saveProgress,
  clearProgressKey,
  recordPass,
  visibleEntries,
  emptyProgress,
} from "./src/progress.js";

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
  demoLabel: document.getElementById("demo-label"),
  demoRotHint: document.getElementById("demo-rot-hint"),
  capability: document.getElementById("capability"),
  letterBtns: document.getElementById("letter-btns"),
  atlasBtns: document.getElementById("atlas-btns"),
  demoBtns: document.getElementById("demo-btns"),
  practiceGroup: document.getElementById("practice-group"),
  reviewGroup: document.getElementById("review-group"),
  demoGroup: document.getElementById("demo-group"),
  practiceCount: document.getElementById("practice-count"),
  reviewCount: document.getElementById("review-count"),
  demoCount: document.getElementById("demo-count"),
  similarHints: document.getElementById("similar-hints"),
  similarHintsText: document.getElementById("similar-hints-text"),
  similarHintBtns: document.getElementById("similar-hint-btns"),
  startBtn: document.getElementById("start-btn"),
  stopBtn: document.getElementById("stop-btn"),
  mirrorToggle: document.getElementById("mirror-toggle"),
  exportToggle: document.getElementById("export-toggle"),
  exportBtn: document.getElementById("export-btn"),
  stage: document.getElementById("stage"),
  demoPanel: document.getElementById("demo-panel"),
  testPanel: document.getElementById("test-panel"),
  testLetter: document.getElementById("test-letter"),
  testScope: document.getElementById("test-scope"),
  testRetry: document.getElementById("test-retry"),
  testNext: document.getElementById("test-next"),
  testBack: document.getElementById("test-back"),
  testLetterBtns: document.getElementById("test-letter-btns"),
  testOutcome: document.getElementById("test-outcome"),
  modeLearn: document.getElementById("mode-learn"),
  modeTest: document.getElementById("mode-test"),
  learnEyebrow: document.getElementById("learn-eyebrow"),
  learnTitle: document.getElementById("learn-title"),
  liveTitle: document.getElementById("live-title"),
  passSeal: document.getElementById("pass-seal"),
  passSealText: document.getElementById("pass-seal-text"),
  records: document.getElementById("records"),
  recordsList: document.getElementById("records-list"),
  recordsEmpty: document.getElementById("records-empty"),
  persistNote: document.getElementById("persist-note"),
  recordsClear: document.getElementById("records-clear"),
  recordsClearConfirm: document.getElementById("records-clear-confirm"),
  recordsClearYes: document.getElementById("records-clear-yes"),
  recordsClearNo: document.getElementById("records-clear-no"),
  scopeSwitch: document.getElementById("scope-switch"),
  scopeNote: document.getElementById("scope-note"),
  recordsScopeNote: document.getElementById("records-scope-note"),
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
let mode = MODE_LEARN;
let attempt = startAttempt(null, null);
let testOutcome = null;
let progress = emptyProgress();
let persisted = true;
let storage = null;
let rotIndex = new Map();
let detachRotator = null;
let demoLetterId = null;
let scope = "full";
let scopeControl = null;
let scopedLetters = [];

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

function presentForMode(judged) {
  return mode === MODE_TEST ? presentTestJudge(judged) : presentJudge(judged);
}

function setVerdict(decision, issues, extra) {
  const presented = extra && extra.title
    ? extra
    : presentForMode({ decision, issues, practiceStatus: current?.practiceStatus });
  els.verdict.textContent = presented.title;
  els.verdict.dataset.state = presented.state || "idle";
  els.hint.textContent = presented.hint || "";
}

function demoSrc(letter) {
  return `./content/demos/${letter.id}_front.png`;
}

function clearDemoVisuals() {
  applyDemoRotator(null);
  els.demoGlyph.textContent = "";
  els.demoStage.dataset.mode = "font";
  els.demoImage.removeAttribute("src");
  els.demoImage.alt = "";
}

function updateRotHint() {
  if (!els.demoRotHint) return;
  els.demoRotHint.hidden = !(mode === MODE_LEARN && rotIndex.has(current?.id));
}

function applyDemoRotator(letter) {
  if (detachRotator) {
    detachRotator();
    detachRotator = null;
  }
  demoLetterId = letter ? letter.id : null;
  updateRotHint();
  const frames = letter ? rotIndex.get(letter.id) : 0;
  if (!frames) return;
  detachRotator = attachRotator({
    stage: els.demoStage,
    image: els.demoImage,
    letterId: letter.id,
    frames,
    alt: `${letter.title}渲染手型参考`,
  });
}

function showDemo(letter) {
  els.demoGlyph.textContent = letter.demo;
  els.demoGlyph.dataset.wide = letter.demo.length > 1 ? "true" : "false";
  els.demoStage.dataset.mode = "font";
  els.demoImage.removeAttribute("src");
  els.demoImage.alt = "";

  const src = demoSrc(letter);
  const probe = new Image();
  probe.onload = () => {
    if (current?.id !== letter.id || mode !== MODE_LEARN) return;
    els.demoImage.src = src;
    els.demoImage.alt = `${letter.title}渲染手型参考`;
    els.demoStage.dataset.mode = "image";
    applyDemoRotator(letter);
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
  if (mode === MODE_TEST) {
    setVerdict("fail", [], {
      title: "比出这个手型",
      state: "idle",
      hint: "只核静态手型。准备好后再打开摄像头。",
    });
    return;
  }
  const idle = presentJudge({
    decision: "blocked",
    practiceStatus: letter.practiceStatus,
    issues: [{ code: `status.${letter.practiceStatus}`, hint: letter.how }],
  });
  if (isPracticeable(letter)) {
    setVerdict("fail", [], { title: "比这个手型", state: "idle", hint: letter.how });
  } else {
    setVerdict("blocked", idle.hint ? [{ hint: idle.hint }] : [], idle);
  }
}

function syncLetterButtons(letterId) {
  for (const btn of document.querySelectorAll(".letter-btns button")) {
    const on = btn.dataset.id === letterId;
    btn.dataset.active = on ? "true" : "false";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

function hideTestOutcome() {
  testOutcome = null;
  if (els.testOutcome) {
    els.testOutcome.hidden = true;
    els.testOutcome.textContent = "";
  }
}

function showTestOutcome() {
  if (!els.testOutcome || !testOutcome) return;
  els.testOutcome.hidden = false;
  els.testOutcome.textContent = "本题已通过静态手型。可重试或选下一题。";
}

function hidePassSeal() {
  if (!els.passSeal) return;
  els.passSeal.hidden = true;
  els.passSeal.dataset.animate = "false";
  if (els.passSealText) els.passSealText.textContent = "";
}

function showPassSeal() {
  if (!els.passSeal || !els.passSealText) return;
  els.passSealText.textContent = "";
  els.passSeal.hidden = false;
  els.passSeal.dataset.animate = "true";
  els.passSealText.textContent = "记下一次静态通过";
}

function updateTestPrompt(letter) {
  if (els.testLetter) els.testLetter.textContent = letter?.title || "字母";
  if (els.testScope) els.testScope.textContent = testScopeText(letter);
}

function renderSimilarHints(letter) {
  els.similarHints.open = false;
  els.similarHintsText.textContent = "";
  els.similarHintBtns.replaceChildren();
  if (mode === MODE_TEST) {
    els.similarHints.hidden = true;
    return;
  }
  const cluster = confusionCluster(letter?.id);
  if (!cluster) {
    els.similarHints.hidden = true;
    return;
  }
  els.similarHintsText.textContent = cluster.note;
  const byId = new Map(scopedLetters.map((item) => [item.id, item]));
  for (const id of cluster.ids) {
    const item = byId.get(id);
    if (item) addLetterButton(item, els.similarHintBtns);
  }
  els.similarHints.hidden = false;
}

function applyModeUi() {
  const testing = mode === MODE_TEST;
  if (els.demoPanel) {
    els.demoPanel.hidden = testing;
    els.demoPanel.inert = testing;
  }
  if (els.testPanel) els.testPanel.hidden = !testing;
  if (els.demoStage) els.demoStage.hidden = testing;
  if (els.how) els.how.hidden = testing;
  if (els.capability) els.capability.hidden = testing;
  if (els.modeLearn) els.modeLearn.setAttribute("aria-pressed", testing ? "false" : "true");
  if (els.modeTest) els.modeTest.setAttribute("aria-pressed", testing ? "true" : "false");
  if (els.learnEyebrow) els.learnEyebrow.textContent = testing ? "自测 · 只核静态手型" : "跟着练 · 一次一个手型";
  if (els.learnTitle) els.learnTitle.textContent = testing ? "不看示范，自己试试。" : "看清楚，再试一试。";
  if (els.liveTitle) els.liveTitle.textContent = testing ? "02 / 自己摆手" : "02 / 动手试试";
  if (testing) {
    clearDemoVisuals();
    if (els.similarHints) els.similarHints.hidden = true;
  }
}

function practiceableLetters() {
  return scopedLetters.filter(isPracticeable);
}

function beginAttemptFor(letter) {
  if (!letter) {
    attempt = startAttempt(mode, null);
    return;
  }
  if (isSameAttempt(attempt, mode, letter.id)) return;
  attempt = startAttempt(mode, letter.id);
}

function selectLetter(letter) {
  if (!letter || !scopedLetters.some((item) => item.id === letter.id)) return;
  if (mode === MODE_TEST && !isPracticeable(letter)) return;
  if (letter.id === current?.id) {
    syncLetterButtons(letter.id);
    return;
  }
  current = letter;
  hideTestOutcome();
  hidePassSeal();
  beginAttemptFor(letter);
  invalidateFrame("target_changed");
  lastSnapshot = null;
  if (mode === MODE_LEARN) showDemo(letter);
  else clearDemoVisuals();
  els.demoLabel.textContent = letter.title;
  els.capability.textContent = capabilityNote(letter);
  els.how.textContent = letter.how;
  updateTestPrompt(letter);
  presentLetterIdle(letter);
  renderSimilarHints(letter);
  syncLetterButtons(letter.id);
}

function addLetterButton(letter, parent) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.id = letter.id;
  btn.dataset.status = letter.practiceStatus || "pending_review";
  btn.textContent = letter.label;
  btn.setAttribute("aria-label", letterAriaLabel(letter));
  btn.setAttribute("aria-pressed", "false");
  btn.addEventListener("click", () => selectLetter(letter));
  parent.appendChild(btn);
}

function setMode(next) {
  if (next !== MODE_LEARN && next !== MODE_TEST) return;
  if (next === mode) return;
  stopLive();
  mode = next;
  hideTestOutcome();
  hidePassSeal();
  lastSnapshot = null;
  resetHold(hold);
  applyModeUi();
  if (mode === MODE_TEST && !isPracticeable(current)) {
    const nextLetter = practiceableLetters()[0];
    if (nextLetter) selectLetter(nextLetter);
    else {
      attempt = startAttempt(mode, current?.id || null);
      presentLetterIdle(current);
    }
  } else if (current) {
    attempt = startAttempt(mode, current.id);
    if (mode === MODE_LEARN) showDemo(current);
    else clearDemoVisuals();
    updateTestPrompt(current);
    presentLetterIdle(current);
    renderSimilarHints(current);
    syncLetterButtons(current.id);
  }
  setStatus(mode === MODE_TEST ? "自测不看示范。准备好后再打开摄像头。" : "先看示范，准备好后再打开摄像头。");
}

function retryCurrent() {
  if (!current) return;
  hideTestOutcome();
  hidePassSeal();
  attempt = startAttempt(mode, current.id);
  resetHold(hold);
  lastSnapshot = null;
  invalidateFrame("retry");
  presentLetterIdle(current);
}

function selectNextPracticeable() {
  const list = practiceableLetters();
  if (!list.length) return;
  const index = list.findIndex((item) => item.id === current?.id);
  const next = list[(index + 1) % list.length];
  if (next) selectLetter(next);
}

function formatRecordTime(iso) {
  try {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleString("zh-CN");
  } catch {
    return "";
  }
}

function renderRecords() {
  if (!els.recordsList) return;
  els.recordsList.replaceChildren();
  const rows = visibleEntries(progress, scopedLetters);
  if (els.recordsEmpty) els.recordsEmpty.hidden = rows.length > 0;
  for (const row of rows) {
    const letter = letters.find((item) => item.id === row.letterId);
    const item = document.createElement("div");
    item.dataset.letterId = row.letterId;
    item.dataset.mode = row.mode;
    item.dataset.count = String(row.count);
    const modeLabel = row.mode === MODE_TEST ? "自测" : "跟练";
    const name = letter?.title || row.letterId;
    const when = formatRecordTime(row.lastAt);
    item.textContent = when ? `${modeLabel} · ${name} · ${row.count} 次 · ${when}` : `${modeLabel} · ${name} · ${row.count} 次`;
    els.recordsList.appendChild(item);
  }
  if (els.recordsScopeNote) {
    const hiddenCount = visibleEntries(progress, letters).length - rows.length;
    els.recordsScopeNote.hidden = hiddenCount <= 0;
    if (hiddenCount > 0) {
      els.recordsScopeNote.textContent = `另有 ${hiddenCount} 条记录属于另一范围，未被清除，切换到对应范围即可看到。`;
    }
  }
  if (els.persistNote) {
    els.persistNote.hidden = persisted;
    if (!persisted) els.persistNote.textContent = "当前记录只留在本次页面，未能写入此浏览器存储。";
  }
}

function notePass(judged) {
  if (!canRecordPass({ judged, letter: current, mode, attempt })) return;
  attempt.recorded = true;
  progress = recordPass(progress, {
    letterId: current.id,
    mode,
    at: new Date(Date.now()).toISOString(),
    letters,
  });
  const saved = saveProgress(storage, progress);
  persisted = saved.persisted;
  if (mode === MODE_TEST) {
    testOutcome = { letterId: current.id };
    showTestOutcome();
  }
  showPassSeal();
  renderRecords();
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
  const presented = presentForMode(judged);
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
    if (judged.decision === "pass" && judged.quality.ok) notePass(judged);
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
  setStatus("模型已就绪", "ok");
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
  setStatus("识别进行中", "ok");
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
  setStatus("已下载 JSON", "ok");
}

function renderLibrary() {
  const grouped = groupLetters(scopedLetters);
  els.letterBtns.replaceChildren();
  els.atlasBtns.replaceChildren();
  els.demoBtns.replaceChildren();
  if (els.testLetterBtns) els.testLetterBtns.replaceChildren();
  for (const letter of grouped.practice) addLetterButton(letter, els.letterBtns);
  for (const letter of grouped.review) addLetterButton(letter, els.atlasBtns);
  for (const letter of grouped.demo) addLetterButton(letter, els.demoBtns);
  if (els.testLetterBtns) {
    for (const letter of grouped.practice) addLetterButton(letter, els.testLetterBtns);
  }
  const showGroup = (section, countEl, n) => {
    if (countEl) countEl.textContent = String(n);
    if (section) section.hidden = n === 0;
  };
  showGroup(els.practiceGroup, els.practiceCount, grouped.practice.length);
  showGroup(els.reviewGroup, els.reviewCount, grouped.review.length);
  showGroup(els.demoGroup, els.demoCount, grouped.demo.length);
  if (current) syncLetterButtons(current.id);
}

function updateScopeNote() {
  if (!els.scopeNote) return;
  els.scopeNote.textContent = `${SCOPE_META[scope].note}两个范围共用同一套汉语手指字母与判定规则；切换范围不会清除本机练习记录。`;
}

function syncScopeUrl() {
  try {
    const url = scopeSearch(globalThis.location?.search, scope) + (globalThis.location?.hash || "");
    globalThis.history?.replaceState?.(null, "", url);
  } catch { /* file:// 等场景写不进地址栏，不影响练习 */ }
}

function setScope(next, { announce = true } = {}) {
  if (next === scope) return;
  invalidateFrame("scope_changed");
  hidePassSeal();
  hideTestOutcome();
  scope = next;
  scopedLetters = filterByScope(letters, scope);
  writeStoredScope(storage, scope);
  syncScopeUrl();
  if (scopeControl) scopeControl.update(scope);
  updateScopeNote();
  renderLibrary();
  renderRecords();
  const stillVisible = current && scopedLetters.some((item) => item.id === current.id);
  if (!stillVisible) {
    const fallback = mode === MODE_TEST
      ? practiceableLetters()[0]
      : (scopedLetters.find((item) => item.id === "GF0021.A") || practiceableLetters()[0] || scopedLetters[0]);
    current = null;
    if (fallback) selectLetter(fallback);
  } else {
    renderSimilarHints(current);
  }
  if (announce) {
    setStatus(`${SCOPE_META[scope].note}本机练习记录仍保留，未被清除。`, "idle");
  }
}

function showClearConfirm(on) {
  if (els.recordsClearConfirm) els.recordsClearConfirm.hidden = !on;
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

  fetch("./content/demos/rot/index.json", { cache: "no-store" })
    .then((r) => (r && r.ok ? r.json() : null))
    .then((raw) => {
      rotIndex = parseRotIndex(raw);
      if (mode === MODE_LEARN && rotIndex.has(demoLetterId)) applyDemoRotator(demoLetterId ? byId.get(demoLetterId) : null);
      updateRotHint();
    })
    .catch(() => { /* 无旋转帧时示范区保持静态图 */ });

  try {
    mode = parsePracticeMode(globalThis.location?.search);
  } catch {
    mode = MODE_LEARN;
  }
  storage = readStorage();
  const loaded = loadProgress(storage, letters);
  progress = loaded.progress;
  persisted = loaded.persisted;

  scope = resolveScope({ search: globalThis.location?.search, storage });
  writeStoredScope(storage, scope);
  scopedLetters = filterByScope(letters, scope);
  syncScopeUrl();
  scopeControl = els.scopeSwitch
    ? mountScopeSwitch(els.scopeSwitch, { scope, onChange: (next) => setScope(next) })
    : null;
  updateScopeNote();

  const byId = new Map(scopedLetters.map((letter) => [letter.id, letter]));
  const grouped = groupLetters(scopedLetters);
  renderLibrary();

  applyModeUi();
  hidePassSeal();
  hideTestOutcome();
  const initial = mode === MODE_TEST
    ? (byId.get("GF0021.A") && isPracticeable(byId.get("GF0021.A")) ? byId.get("GF0021.A") : grouped.practice[0])
    : (byId.get("GF0021.A") || scopedLetters[0]);
  if (initial) selectLetter(initial);
  setStatus(mode === MODE_TEST ? "自测不看示范。准备好后再打开摄像头。" : "先看示范，准备好后再打开摄像头。");
  applyMirror();
  setLiveButtons(false);
  renderRecords();
  try {
    if (isRecordsHash(globalThis.location?.hash)) els.records?.scrollIntoView?.();
  } catch { /* location 不可用时仍可练 */ }

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
      setStatus(mode === MODE_TEST ? "摄像头或模型失败，可先回到跟练看示范" : "摄像头或模型失败，可先看左边示范", "bad");
    } finally {
      if (generation === startGeneration) starting = false;
    }
  });
  if (els.stopBtn) els.stopBtn.addEventListener("click", stopLive);
  if (els.modeLearn) els.modeLearn.addEventListener("click", () => setMode(MODE_LEARN));
  if (els.modeTest) els.modeTest.addEventListener("click", () => setMode(MODE_TEST));
  if (els.testBack) els.testBack.addEventListener("click", () => setMode(MODE_LEARN));
  if (els.testRetry) els.testRetry.addEventListener("click", retryCurrent);
  if (els.testNext) els.testNext.addEventListener("click", selectNextPracticeable);
  if (els.recordsClear) els.recordsClear.addEventListener("click", () => showClearConfirm(true));
  if (els.recordsClearNo) els.recordsClearNo.addEventListener("click", () => showClearConfirm(false));
  if (els.recordsClearYes) {
    els.recordsClearYes.addEventListener("click", () => {
      const result = clearProgressKey(storage);
      if (!result.ok) {
        setStatus("未能清除本机记录", "bad");
        if (els.persistNote) {
          els.persistNote.hidden = false;
          els.persistNote.textContent = "未能清除本机记录，现有记录仍保留。";
        }
        showClearConfirm(false);
        return;
      }
      progress = emptyProgress();
      persisted = Boolean(storage);
      showClearConfirm(false);
      hidePassSeal();
      renderRecords();
      setStatus("已清除此浏览器中的练习记录", "idle");
    });
  }
}

main();
