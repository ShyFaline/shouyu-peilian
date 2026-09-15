import { FilesetResolver, HandLandmarker } from "./vendor/vision_bundle.mjs";

const FINGER_TIPS = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
const FINGER_PIPS = { thumb: 3, index: 6, middle: 10, ring: 14, pinky: 18 };
const FINGER_MCPS = { thumb: 2, index: 5, middle: 9, ring: 13, pinky: 17 };
const FINGERS = ["thumb", "index", "middle", "ring", "pinky"];

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

const PASS_FRAMES = 8;
const EXTENDED_DEG = 158;
const CURLED_DEG = 108;
const TOGETHER_DEG = 18;
const APART_DEG = 28;

const els = {
  video: document.getElementById("video"),
  canvas: document.getElementById("overlay"),
  status: document.getElementById("status"),
  verdict: document.getElementById("verdict"),
  hint: document.getElementById("hint"),
  how: document.getElementById("how"),
  demoGlyph: document.getElementById("demo-glyph"),
  demoLabel: document.getElementById("demo-label"),
  letterBtns: document.getElementById("letter-btns"),
  startBtn: document.getElementById("start-btn"),
  mirrorToggle: document.getElementById("mirror-toggle"),
  stage: document.getElementById("stage"),
};

const ctx = els.canvas.getContext("2d");

let letters = [];
let current = null;
let landmarker = null;
let running = false;
let lastVideoTime = -1;
let passStreak = 0;
let mirror = true;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleDeg(a, b, c) {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const den = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (den < 1e-6) return 180;
  const cos = Math.min(1, Math.max(-1, (abx * cbx + aby * cby) / den));
  return (Math.acos(cos) * 180) / Math.PI;
}

function vecAngle(ax, ay, bx, by) {
  const den = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (den < 1e-6) return 0;
  const cos = Math.min(1, Math.max(-1, (ax * bx + ay * by) / den));
  return (Math.acos(cos) * 180) / Math.PI;
}

function fingerCurlDeg(lm, name) {
  const mcp = lm[FINGER_MCPS[name]];
  const pip = lm[FINGER_PIPS[name]];
  const tip = lm[FINGER_TIPS[name]];
  if (name === "thumb") {
    const ip = lm[3];
    return angleDeg(lm[2], ip, lm[4]);
  }
  const dip = lm[FINGER_TIPS[name] - 1];
  return (angleDeg(mcp, pip, dip) + angleDeg(pip, dip, tip)) / 2;
}

function classifyCurl(deg) {
  if (deg >= EXTENDED_DEG) return "none";
  if (deg <= CURLED_DEG) return "full";
  return "half";
}

function indexMiddleSpread(lm) {
  const iMcp = lm[5];
  const iTip = lm[8];
  const mMcp = lm[9];
  const mTip = lm[12];
  return vecAngle(iTip.x - iMcp.x, iTip.y - iMcp.y, mTip.x - mMcp.x, mTip.y - mMcp.y);
}

function inFrameOf(lm) {
  const margin = 0.03;
  return lm.every((p) => p.x > margin && p.x < 1 - margin && p.y > margin && p.y < 1 - margin);
}

function evaluate(letter, lm) {
  const issues = [];
  const curls = {};
  for (const name of FINGERS) {
    curls[name] = classifyCurl(fingerCurlDeg(lm, name));
  }
  const spread = indexMiddleSpread(lm);
  const rules = letter.rules;

  const curlHint = {
    index: { none: "食指再伸直", full: "食指收起来" },
    middle: { none: "中指再伸直", full: "中指收起来" },
    ring: { none: "无名指再伸直", full: "无名指收起来" },
    pinky: { none: "小指再伸直", full: "小指收起来" },
    thumb: { none: "拇指再伸直", full: "拇指收一点" },
  };

  for (const finger of ["index", "middle", "ring", "pinky"]) {
    const want = rules[finger]?.curl;
    if (!want) continue;
    const got = curls[finger];
    if (want === "none" && got !== "none") {
      issues.push({
        finger,
        code: `${finger}.not_extended`,
        hint: curlHint[finger].none,
      });
    }
    if (want === "full" && got === "none") {
      issues.push({
        finger,
        code: `${finger}.not_curled`,
        hint: curlHint[finger].full,
      });
    }
  }

  if (rules.spread === "together" && spread > TOGETHER_DEG) {
    issues.push({
      code: "fingers.not_together",
      hint: "食指中指并拢",
    });
  }
  if (rules.spread === "apart" && spread < APART_DEG) {
    issues.push({
      code: "fingers.not_spread",
      hint: "食指中指分开成 V",
    });
  }

  return { issues: issues.slice(0, 2), curls, spread };
}

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
    els.hint.textContent = "保持一下，换一个光照或换人再试。";
    return;
  }
  els.verdict.textContent = "再试试";
  els.verdict.dataset.state = "bad";
  els.hint.textContent = issues[0]?.hint || "对照左边，把手指放到位。";
}

function selectLetter(letter) {
  current = letter;
  passStreak = 0;
  els.demoGlyph.textContent = letter.demo;
  els.demoLabel.textContent = `${letter.title} · ${letter.standard}`;
  els.how.textContent = letter.how;
  setVerdict(false, [], { title: "比这个手型", state: "idle", hint: letter.how });
  for (const btn of els.letterBtns.querySelectorAll("button")) {
    btn.dataset.active = btn.dataset.id === letter.id ? "true" : "false";
  }
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
  const now = performance.now();
  if (els.video.currentTime === lastVideoTime) {
    requestAnimationFrame(loop);
    return;
  }
  lastVideoTime = els.video.currentTime;
  resizeCanvas();

  const result = landmarker.detectForVideo(els.video, now);
  const w = els.canvas.width;
  const h = els.canvas.height;
  ctx.clearRect(0, 0, w, h);

  const hands = result.landmarks || [];
  const handedness = result.handednesses || result.handedness || [];

  if (hands.length === 0) {
    passStreak = 0;
    setVerdict(false, [], {
      title: "把手放进框里",
      state: "idle",
      hint: "单手、掌心对着镜头，光线尽量打在手上。",
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
      hint: "第二只手会干扰判定。",
    });
    requestAnimationFrame(loop);
    return;
  }

  const lm = hands[0];
  const conf =
    handedness[0]?.[0]?.score ??
    handedness[0]?.score ??
    1;
  drawHand(lm, w, h, conf > 0.6 ? "#7ee0c6" : "#f0c36a");

  if (conf < 0.45 || !inFrameOf(lm)) {
    passStreak = 0;
    setVerdict(false, [], {
      title: "把手放进框里",
      state: "idle",
      hint: "手不要贴边，也不要挡脸。",
    });
    requestAnimationFrame(loop);
    return;
  }

  const { issues } = evaluate(current, lm);
  if (issues.length === 0) {
    passStreak += 1;
    if (passStreak >= PASS_FRAMES) setVerdict(true, []);
    else {
      setVerdict(false, [], {
        title: "再停一下",
        state: "idle",
        hint: "手型接近了，保持稳定。",
      });
    }
  } else {
    passStreak = 0;
    setVerdict(false, issues);
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

async function main() {
  const pack = await fetch("./content/letters.json").then((r) => r.json());
  letters = pack.letters;
  for (const letter of letters) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = letter.label;
    btn.dataset.id = letter.id;
    btn.addEventListener("click", () => selectLetter(letter));
    els.letterBtns.appendChild(btn);
  }
  selectLetter(letters[0]);
  applyMirror();

  els.mirrorToggle.checked = true;
  els.mirrorToggle.addEventListener("change", () => {
    mirror = els.mirrorToggle.checked;
    applyMirror();
  });

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
