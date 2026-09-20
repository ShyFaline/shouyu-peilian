import { FilesetResolver, HandLandmarker } from "./vendor/vision_bundle.mjs";
import { evaluate, inFrameOf, isReadyToScore } from "./src/evaluate.js";

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

const PASS_FRAMES = 6;

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
  mirrorToggle: document.getElementById("mirror-toggle"),
  exportToggle: document.getElementById("export-toggle"),
  exportBtn: document.getElementById("export-btn"),
  stage: document.getElementById("stage"),
};

const ctx = els.canvas.getContext("2d");

let letters = [];
let current = null;
let landmarker = null;
let running = false;
let lastVideoTime = -1;
let lastTimestamp = 0;
let passStreak = 0;
let mirror = true;
let lastFrame = null;
let exportEnabled = false;

function setStatus(text, kind) {
  els.status.textContent = text;
  els.status.dataset.kind = kind || "";
}

function setVerdict(pass, issues, extra) {
  if (extra) {
    els.verdict.textContent = extra.title;
    els.verdict.dataset.state = extra.state || "idle";
    els.hint.textContent = extra.hint || "";
    return;
  }
  if (pass) {
    els.verdict.textContent = "到位";
    els.verdict.dataset.state = "ok";
    els.hint.textContent = "手型对上了。保持一下，换个光照或换人再试。";
    return;
  }
  els.verdict.textContent = "还不到位";
  els.verdict.dataset.state = "bad";
  const hints = issues.map((x) => x.hint).filter(Boolean);
  els.hint.textContent = hints.length
    ? hints.join("；")
    : "对照左边，把手指放到位。";
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
    els.demoImage.alt = `${letter.title}标准手示范（渲染图，不是识别模型）`;
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

function selectLetter(letter) {
  current = letter;
  passStreak = 0;
  showDemo(letter);
  els.demoLabel.textContent = `${letter.title} · ${letter.standard}`;
  els.how.textContent = letter.how;
  setVerdict(false, [], { title: "比这个手型", state: "idle", hint: letter.how });
  for (const btn of document.querySelectorAll(".letter-btns button")) {
    btn.dataset.active = btn.dataset.id === letter.id ? "true" : "false";
  }
}

function addLetterButton(letter, parent, unstable) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.id = letter.id;
  btn.textContent = letter.label;
  if (unstable) {
    btn.dataset.unstable = "true";
    btn.title = "规则尚未能稳定分开，仅供对照国标外形";
    btn.textContent = `${letter.label} · 易混`;
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
  const w = els.video.videoWidth || 640;
  const h = els.video.videoHeight || 480;
  if (els.canvas.width !== w) els.canvas.width = w;
  if (els.canvas.height !== h) els.canvas.height = h;
}

async function loop() {
  if (!running || !landmarker) return;
  try {
    const now = performance.now();
    if (els.video.readyState < 2) {
      requestAnimationFrame(loop);
      return;
    }
    if (els.video.currentTime === lastVideoTime) {
      requestAnimationFrame(loop);
      return;
    }
    lastVideoTime = els.video.currentTime;
    lastTimestamp = Math.max(lastTimestamp + 1, now);
    resizeCanvas();

    const result = landmarker.detectForVideo(els.video, lastTimestamp);
    const w = els.canvas.width;
    const h = els.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const hands = result.landmarks || [];
    const handedness = result.handednesses || result.handedness || [];

    if (hands.length === 0) {
      passStreak = 0;
      setVerdict(false, [], {
        title: "还没看到完整的手",
        state: "idle",
        hint: "单手、掌心对着镜头，手指朝上，光线打在手上。",
      });
      requestAnimationFrame(loop);
      return;
    }

    if (hands.length > 1) {
      passStreak = 0;
      for (const lm of hands) drawHand(lm, w, h, "rgba(255,196,72,0.9)");
      setVerdict(false, [], {
        title: "请只伸一只手",
        state: "bad",
        hint: "现在看到两只手，判定会乱。放下另一只。",
      });
      requestAnimationFrame(loop);
      return;
    }

    const lm = hands[0];
    const conf =
      handedness[0]?.[0]?.score ??
      handedness[0]?.score ??
      1;
    captureFrame(lm, handedness, conf, now);
    drawHand(lm, w, h, conf > 0.5 ? "#7ee0c6" : "#f0c36a");

    if (!current) {
      setVerdict(false, [], {
        title: "先选一个字母",
        state: "idle",
        hint: "点左边的字母。",
      });
      requestAnimationFrame(loop);
      return;
    }

    if (!isReadyToScore({ handCount: 1, conf, lm }) || !inFrameOf(lm)) {
      passStreak = 0;
      setVerdict(false, [], {
        title: "手再进一点",
        state: "idle",
        hint: "腕部可以贴下沿，但掌心和四指尽量留在画面里。",
      });
      requestAnimationFrame(loop);
      return;
    }

    const judged = evaluate(current, lm);
    if (judged.pass && isReadyToScore({ handCount: hands.length, conf, lm })) {
      passStreak += 1;
      if (passStreak >= PASS_FRAMES) setVerdict(true, []);
      else {
        setVerdict(false, [], {
          title: "接近了，停稳",
          state: "idle",
          hint: `正在核对 ${current.label}：手指已经对上，保持这个姿势。`,
        });
      }
    } else {
      passStreak = 0;
      setVerdict(false, judged.issues);
    }
  } catch (err) {
    console.warn("detect loop", err);
    setVerdict(false, [], {
      title: "这一帧没判出来",
      state: "idle",
      hint: "骨架还在就继续比。若一直如此，刷新后再开摄像头。",
    });
  }
  requestAnimationFrame(loop);
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

async function startCamera() {
  setStatus("请求摄像头…", "busy");
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } },
  });
  els.video.srcObject = stream;
  await els.video.play();
  els.stage.dataset.live = "true";
  running = true;
  setStatus("识别在本机进行，视频不上传", "ok");
  requestAnimationFrame(loop);
}

function applyMirror() {
  els.stage.dataset.mirror = mirror ? "true" : "false";
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

function captureFrame(lm, handedness, conf, t) {
  lastFrame = {
    t,
    handedness: handednessOf(handedness),
    landmarks: Array.from(lm, (p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })),
    conf,
  };
}

function downloadHandFrame() {
  if (!exportEnabled) {
    setStatus("导出默认关闭，先勾选再下载", "idle");
    return;
  }
  if (!lastFrame || !lastFrame.landmarks || lastFrame.landmarks.length < 21) {
    setStatus("还没看到完整的手，没法导出", "bad");
    return;
  }
  const letterId = current?.id || "unknown";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const payload = {
    t: lastFrame.t,
    handedness: lastFrame.handedness,
    landmarks: lastFrame.landmarks,
    conf: lastFrame.conf,
  };
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
    const res = await fetch("./content/letters.json");
    if (!res.ok) throw new Error(`字母包加载失败 (${res.status})`);
    pack = await res.json();
  } catch (err) {
    console.error(err);
    setStatus("字母包没读到", "bad");
    setVerdict(false, [], {
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
  applyMirror();

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

  els.startBtn.addEventListener("click", async () => {
    els.startBtn.disabled = true;
    try {
      if (!landmarker) await initModel();
      await startCamera();
      els.startBtn.textContent = "摄像头已开";
    } catch (err) {
      console.error(err);
      els.startBtn.disabled = false;
      setStatus("摄像头或模型失败，可先看左边示范", "bad");
      setVerdict(false, [], {
        title: "无摄像头模式",
        state: "idle",
        hint: String(err && err.message ? err.message : err),
      });
    }
  });
}

main();
