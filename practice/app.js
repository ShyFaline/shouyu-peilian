import { FilesetResolver, HandLandmarker } from "./vendor/vision_bundle.mjs";
import { stopCamera, stopTracks } from "./src/camera.js";
import { MAX_GAP_MS } from "./src/passState.js";
import { loadVersionManifest } from "./src/versions.js";
import { judge, presentJudge, createHold, resetHold } from "./src/judge.js";
import { createMotionState, resetMotion } from "./src/motion.js";
import { canExportSnapshot, createSnapshot, serializeSnapshot } from "./src/snapshot.js";
import { groupLetters, capabilityNote, letterAriaLabel, confusionCluster, isPracticeable } from "./src/letterLibrary.js";
import { attachRotator, parseRotIndex } from "./src/rotator.js";
import {
  MODE_LEARN,
  MODE_QUEST,
  parsePracticeMode,
  isRecordsHash,
  startAttempt,
  isSameAttempt,
  canRecordPass,
} from "./src/practiceSession.js";
import {
  emptyQuest,
  isQuestUnlocked,
  loadQuest,
  markQuestPassed,
  questStatus,
  saveQuest,
} from "./src/quest.js";
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
  modeLearn: document.getElementById("mode-learn"),
  modeQuest: document.getElementById("mode-quest"),
  questPanel: document.getElementById("quest-panel"),
  questBtns: document.getElementById("quest-btns"),
  questProgressText: document.getElementById("quest-progress-text"),
  questBarFill: document.getElementById("quest-bar-fill"),
  letterLibrary: document.getElementById("letter-library"),
  confettiLayer: document.getElementById("confetti-layer"),
  learnEyebrow: document.getElementById("learn-eyebrow"),
  learnTitle: document.getElementById("learn-title"),
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
let motion = createMotionState();
let loopHandle = 0;
let lastFrameAt = null; // monotonic time of last consumed video frame, independent of hold
let lastClockTime = null; // Retain clock high-water even when feedback is invalidated.
let starting = false;
let startGeneration = 0;
let modelPromise = null;
let trackCleanup = [];
let mode = MODE_LEARN;
let attempt = startAttempt(null, null);
let progress = emptyProgress();
let quest = emptyQuest();
let persisted = true;
let storage = null;
let rotIndex = new Map();
let detachRotator = null;
let demoLetterId = null;

function invalidateFrame(reason = "stale") {
  resetHold(hold);
  resetMotion(motion);
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

function updateRotHint() {
  if (!els.demoRotHint) return;
  els.demoRotHint.hidden = !rotIndex.has(current?.id);
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
    alt: `${letter.title}标准手示范图`,
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
    if (current?.id !== letter.id) return;
    els.demoImage.src = src;
    els.demoImage.alt = `${letter.title}标准手示范图`;
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

function renderQuest() {
  if (!els.questBtns) return;
  const status = questStatus(quest, letters);
  els.questBtns.replaceChildren();
  status.sequence.forEach((letter, index) => {
    const passed = status.passedSet.has(letter.id);
    const unlocked = index <= status.unlockedIndex;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.id = letter.id;
    btn.className = passed
      ? "quest-letter is-passed"
      : index === status.unlockedIndex
        ? "quest-letter is-current"
        : unlocked
          ? "quest-letter"
          : "quest-letter is-locked";
    btn.textContent = passed ? `${letter.label} ✓` : letter.label;
    btn.disabled = !unlocked;
    btn.setAttribute("aria-pressed", current?.id === letter.id ? "true" : "false");
    btn.setAttribute(
      "aria-label",
      passed
        ? `第 ${index + 1} 关，${letter.title}，已通过`
        : unlocked
          ? `第 ${index + 1} 关，${letter.title}`
          : `第 ${index + 1} 关，未解锁`,
    );
    if (unlocked) btn.addEventListener("click", () => selectLetter(letter));
    els.questBtns.appendChild(btn);
  });
  if (els.questProgressText) {
    els.questProgressText.textContent = status.complete
      ? `全部通过 · 共 ${status.total} 关`
      : `第 ${status.unlockedIndex + 1} 关 · 共 ${status.total} 关`;
  }
  if (els.questBarFill) {
    const pct = status.total ? Math.round((status.passedCount / status.total) * 100) : 0;
    els.questBarFill.style.width = `${pct}%`;
  }
}

function celebrateQuestPass(finalPass) {
  if (!els.confettiLayer) return;
  const layer = els.confettiLayer;
  layer.replaceChildren();
  const count = finalPass ? 48 : 24;
  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement("i");
    piece.style.setProperty("--x", `${Math.random() * 100}%`);
    piece.style.setProperty("--dx", `${(Math.random() - 0.5) * 240}px`);
    piece.style.setProperty("--rot", `${Math.random() * 720 - 360}deg`);
    piece.style.setProperty("--delay", `${(Math.random() * 0.25).toFixed(2)}s`);
    piece.style.setProperty("--hue", String(Math.floor(Math.random() * 360)));
    layer.appendChild(piece);
  }
  layer.classList.remove("is-burst");
  void layer.offsetWidth;
  layer.classList.add("is-burst");
}

function hidePassSeal() {
  if (!els.passSeal) return;
  els.passSeal.hidden = true;
  els.passSeal.dataset.animate = "false";
  if (els.passSealText) els.passSealText.textContent = "";
}

function showPassSeal(judged) {
  if (!els.passSeal || !els.passSealText) return;
  els.passSealText.textContent = "";
  els.passSeal.hidden = false;
  els.passSeal.dataset.animate = "true";
  els.passSealText.textContent = judged?.motion ? "记下一次手型与动作通过" : "记下一次静态通过";
}

function renderSimilarHints(letter) {
  els.similarHints.open = false;
  els.similarHintsText.textContent = "";
  els.similarHintBtns.replaceChildren();
  if (mode !== MODE_LEARN) {
    els.similarHints.hidden = true;
    return;
  }
  const cluster = confusionCluster(letter?.id);
  if (!cluster) {
    els.similarHints.hidden = true;
    return;
  }
  els.similarHintsText.textContent = cluster.note;
  const byId = new Map(letters.map((item) => [item.id, item]));
  for (const id of cluster.ids) {
    const item = byId.get(id);
    if (item) addLetterButton(item, els.similarHintBtns);
  }
  els.similarHints.hidden = false;
}

function applyModeUi() {
  const questing = mode === MODE_QUEST;
  if (els.letterLibrary) els.letterLibrary.hidden = questing;
  if (els.questPanel) els.questPanel.hidden = !questing;
  if (els.modeLearn) els.modeLearn.setAttribute("aria-pressed", String(mode === MODE_LEARN));
  if (els.modeQuest) els.modeQuest.setAttribute("aria-pressed", String(questing));
  if (els.learnEyebrow) {
    els.learnEyebrow.textContent = questing
      ? "闯关 · 一关一个手型"
      : "跟着练 · 一次一个手型";
  }
  if (els.learnTitle) {
    els.learnTitle.textContent = questing
      ? "按顺序闯关，过了这关开下关。"
      : "看清楚，再试一试。";
  }
  if (questing) renderQuest();
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
  if (!letter) return;
  if (mode === MODE_QUEST && !isQuestUnlocked(quest, letter.id, letters)) return;
  if (letter.id === current?.id) {
    syncLetterButtons(letter.id);
    return;
  }
  current = letter;
  hidePassSeal();
  beginAttemptFor(letter);
  invalidateFrame("target_changed");
  lastSnapshot = null;
  showDemo(letter);
  els.demoLabel.textContent = letter.title;
  els.capability.textContent = capabilityNote(letter);
  els.how.textContent = letter.how;
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
  if (next !== MODE_LEARN && next !== MODE_QUEST) return;
  if (next === mode) return;
  stopLive();
  mode = next;
  hidePassSeal();
  lastSnapshot = null;
  resetHold(hold);
  resetMotion(motion);
  applyModeUi();
  if (mode === MODE_QUEST && !isQuestUnlocked(quest, current?.id, letters)) {
    const nextLetter = questStatus(quest, letters).current;
    if (nextLetter) selectLetter(nextLetter);
    else {
      attempt = startAttempt(mode, current?.id || null);
      presentLetterIdle(current);
    }
  } else if (current) {
    attempt = startAttempt(mode, current.id);
    showDemo(current);
    presentLetterIdle(current);
    renderSimilarHints(current);
    syncLetterButtons(current.id);
  }
  setStatus(
    mode === MODE_QUEST
      ? "闯关按顺序来。通过当前关，下一关才会解锁。"
      : "先看示范，准备好后再打开摄像头。",
  );
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
  const rows = visibleEntries(progress, letters);
  if (els.recordsEmpty) els.recordsEmpty.hidden = rows.length > 0;
  for (const row of rows) {
    const letter = letters.find((item) => item.id === row.letterId);
    const item = document.createElement("div");
    item.dataset.letterId = row.letterId;
    item.dataset.mode = row.mode;
    item.dataset.count = String(row.count);
    const modeLabel = row.mode === "test" ? "自测" : "跟练";
    const name = letter?.title || row.letterId;
    const when = formatRecordTime(row.lastAt);
    item.textContent = when ? `${modeLabel} · ${name} · ${row.count} 次 · ${when}` : `${modeLabel} · ${name} · ${row.count} 次`;
    els.recordsList.appendChild(item);
  }
  if (els.persistNote) {
    els.persistNote.hidden = persisted;
    if (!persisted) els.persistNote.textContent = "当前记录只留在本次页面，未能写入此浏览器存储。";
  }
}

function notePass(judged) {
  if (!canRecordPass({ judged, letter: current, mode, attempt })) return;
  attempt.recorded = true;
  if (mode === MODE_QUEST) {
    if (!markQuestPassed(quest, current.id, letters)) return;
    attempt.recorded = false;
    const status = questStatus(quest, letters);
    persisted = saveQuest(storage, quest);
    showPassSeal(judged);
    renderQuest();
    celebrateQuestPass(status.complete);
    setStatus(
      status.complete
        ? "全部关卡通过，厉害！"
        : `过关！已解锁第 ${status.unlockedIndex + 1} 关：${status.current.title}`,
      "ok",
    );
    renderRecords();
    return;
  }
  progress = recordPass(progress, {
    letterId: current.id,
    mode,
    at: new Date(Date.now()).toISOString(),
    letters,
  });
  const saved = saveProgress(storage, progress);
  persisted = saved.persisted;
  showPassSeal(judged);
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
    }, hold, motion);
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
    if (mode === MODE_QUEST && judged.decision === "pass" && judged.quality.ok) {
      applyJudge({
        ...judged,
        speech: { title: "过关！", hint: "这一关记为通过，下一关已解锁。" },
      });
    }
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
  resetMotion(motion);
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
      if (rotIndex.has(demoLetterId)) applyDemoRotator(demoLetterId ? byId.get(demoLetterId) : null);
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
  quest = loadQuest(storage, letters);

  const byId = new Map(letters.map((letter) => [letter.id, letter]));
  const grouped = groupLetters(letters);
  for (const letter of grouped.practice) addLetterButton(letter, els.letterBtns);
  for (const letter of grouped.review) addLetterButton(letter, els.atlasBtns);
  for (const letter of grouped.demo) addLetterButton(letter, els.demoBtns);
  const showGroup = (section, countEl, n) => {
    if (countEl) countEl.textContent = String(n);
    if (section) section.hidden = n === 0;
  };
  showGroup(els.practiceGroup, els.practiceCount, grouped.practice.length);
  showGroup(els.reviewGroup, els.reviewCount, grouped.review.length);
  showGroup(els.demoGroup, els.demoCount, grouped.demo.length);

  applyModeUi();
  hidePassSeal();
  const initial = mode === MODE_QUEST
    ? (questStatus(quest, letters).current || questStatus(quest, letters).sequence[0])
    : (byId.get("GF0021.A") || letters[0]);
  if (initial) selectLetter(initial);
  setStatus(
    mode === MODE_QUEST
      ? "闯关按顺序来。通过当前关，下一关才会解锁。"
      : "先看示范，准备好后再打开摄像头。",
  );
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
      setStatus("摄像头或模型失败，可先看左边示范", "bad");
    } finally {
      if (generation === startGeneration) starting = false;
    }
  });
  if (els.stopBtn) els.stopBtn.addEventListener("click", stopLive);
  if (els.modeLearn) els.modeLearn.addEventListener("click", () => setMode(MODE_LEARN));
  if (els.modeQuest) els.modeQuest.addEventListener("click", () => setMode(MODE_QUEST));
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
