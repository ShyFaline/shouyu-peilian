/**
 * 合成手型几何构造器（共享）。只摆关节角，**不含任何国标规则、角度阈值或分类逻辑**。
 * 对错一律交给核心 evaluate/judge 判。
 *
 * 从 samples/generate-synthetic.mjs 抽出，供合成夹具与反例夹具共用，避免复制第二份。
 */

const rad = (d) => (d * Math.PI) / 180;
const S = 0.22;
const WRIST = [0.5, 0.86];

/** 0° = 指尖朝上（-y）。turns 是逐关节累计转角，0 表示伸直。 */
function buildFinger(origin, baseDeg, turns, segs) {
  const pts = [origin.slice()];
  let a = baseDeg;
  for (let i = 0; i < 3; i += 1) {
    a += turns[i];
    const p = pts[pts.length - 1];
    pts.push([p[0] + segs[i] * Math.sin(rad(a)), p[1] - segs[i] * Math.cos(rad(a))]);
  }
  return pts;
}

const MCP_X = { index: -0.22, middle: 0.0, ring: 0.22, pinky: 0.44 };
const MCP_Y = -0.55;
const SEG = [0.36, 0.24, 0.18];

/**
 * @param {Record<string, "extended"|"half"|"curled">} fingers
 * @param {{ index?:number, middle?:number, ring?:number, pinky?:number, thumb?:number }} base
 * @param {{ thumb?:number }} thumbTurn 仅覆盖拇指 IP 转角
 */
export function buildHand({ fingers, base = {}, thumbTurn }) {
  const lm = new Array(21);
  lm[0] = { x: WRIST[0], y: WRIST[1] };

  const turnsFor = (state) =>
    state === "extended" ? [0, 0, 0] : state === "half" ? [0, 40, 40] : [0, 90, 90];

  for (const name of ["index", "middle", "ring", "pinky"]) {
    const origin = [WRIST[0] + MCP_X[name] * S, WRIST[1] + MCP_Y * S];
    const pts = buildFinger(origin, base[name] ?? 0, turnsFor(fingers[name]), SEG.map((s) => s * S));
    const first = { index: 5, middle: 9, ring: 13, pinky: 17 }[name];
    for (let i = 0; i < 4; i += 1) lm[first + i] = { x: pts[i][0], y: pts[i][1] };
  }

  // 拇指的 curl 只由 IP 折叠角决定（evaluate 量的是 lm[2],lm[3],lm[4] 的夹角），
  // 所以前两段保持朝外，只折最后一段：0°→180°(伸直)、50°→130°(半屈)、120°→60°(屈)。
  const thumbOrigin = [WRIST[0] - 0.3 * S, WRIST[1] - 0.3 * S];
  const tState = fingers.thumb;
  const tTurns =
    tState === "extended" ? [0, 0, 0] : tState === "half" ? [0, 0, 50] : [0, 0, thumbTurn ?? 120];
  const tPts = buildFinger(thumbOrigin, base.thumb ?? -90, tTurns, [0.3, 0.26, 0.22].map((s) => s * S));
  for (let i = 0; i < 4; i += 1) lm[1 + i] = { x: tPts[i][0], y: tPts[i][1] };

  return lm.map((p) => ({ x: Number(p.x.toFixed(9)), y: Number(p.y.toFixed(9)), z: 0 }));
}

/** 手型意图：与 letters.json 的规则同名，但这里只给形状，不判定。 */
export const POSES = {
  V_OK: { fingers: { index: "extended", middle: "extended", ring: "curled", pinky: "curled", thumb: "curled" }, base: { index: -18, middle: 18, thumb: -40 } },
  V_TOGETHER: { fingers: { index: "extended", middle: "extended", ring: "curled", pinky: "curled", thumb: "curled" }, base: { index: -5, middle: 5, thumb: -40 } },
  U_OK: { fingers: { index: "extended", middle: "extended", ring: "curled", pinky: "curled", thumb: "curled" }, base: { index: -5, middle: 5, thumb: -40 } },
  L_OK: { fingers: { index: "extended", middle: "curled", ring: "curled", pinky: "curled", thumb: "extended" }, base: { index: 0, thumb: -90 } },
  L_PARALLEL: { fingers: { index: "extended", middle: "curled", ring: "curled", pinky: "curled", thumb: "extended" }, base: { index: 0, thumb: -12 } },
  Y_OK: { fingers: { index: "curled", middle: "curled", ring: "curled", pinky: "extended", thumb: "extended" }, base: { pinky: 12, thumb: -70 } },
  A_OK: { fingers: { index: "curled", middle: "curled", ring: "curled", pinky: "curled", thumb: "extended" }, base: { thumb: -60 } },
  B_OK: { fingers: { index: "extended", middle: "extended", ring: "extended", pinky: "extended", thumb: "curled" }, base: { index: -6, middle: -2, ring: 2, pinky: 6, thumb: -30 } },
  W_OK: { fingers: { index: "extended", middle: "extended", ring: "extended", pinky: "curled", thumb: "curled" }, base: { index: -26, middle: 0, ring: 26, thumb: -30 } },
  I_OK: { fingers: { index: "curled", middle: "curled", ring: "curled", pinky: "extended", thumb: "curled" }, base: { pinky: 0, thumb: -30 } },
};

export const SYNTHETIC_SIZE = { imageWidth: 640, imageHeight: 480 };

/** 把关键点整体平移到画面外，触发质量门 fingertip_oob（归一化框外）。 */
export function shiftOutOfFrame(lm) {
  return lm.map((p) => ({ ...p, x: p.x + 3, y: p.y + 3 }));
}

/** 让某根骨头两点重合，触发质量门 degenerate_bone。 */
export function collapseBone(lm, index) {
  return lm.map((p, i) => (i === index ? { ...lm[index - 1] } : { ...p }));
}
