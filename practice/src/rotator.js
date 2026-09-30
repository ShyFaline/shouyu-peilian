/** 示范手模拖动旋转。
 *
 * 帧约定见 blender/build_godot_hand_turntable.py：00 帧 = 正面机位，
 * 帧号增大 = 观者看到手模左侧，因此向右拖动 = 帧号增大。
 * 旋转帧目录缺失或索引读取失败时一律回退为静态正面图，不报错、不阻断练习。
 */

export function parseRotIndex(raw) {
  if (!raw || typeof raw !== 'object') return new Map();
  const frames = Number(raw.frames);
  if (!Number.isInteger(frames) || frames < 4 || frames > 360) return new Map();
  const out = new Map();
  const letters = raw.letters;
  if (!letters || typeof letters !== 'object') return out;
  for (const id of Object.keys(letters)) {
    if (typeof id === 'string' && letters[id] === true) out.set(id, frames);
  }
  return out;
}

export function rotFrameUrl(letterId, frame, frames) {
  if (!Number.isInteger(frame) || !Number.isInteger(frames) || frames <= 0) return '';
  const k = ((frame % frames) + frames) % frames;
  return `./content/demos/rot/${letterId}/${String(k).padStart(2, '0')}.webp`;
}

/** 拖动位移 → 帧号。拖满元素宽度 = 转半圈；startFrame 为按下时的帧。 */
export function frameForDrag({ dx, width, frames, startFrame }) {
  if (!Number.isFinite(dx) || !Number.isFinite(width) || width <= 0) return startFrame | 0;
  if (!Number.isInteger(frames) || frames <= 0) return startFrame | 0;
  const perFrame = width / (frames / 2);
  const delta = Math.round(dx / perFrame);
  return (((startFrame | 0) + delta) % frames + frames) % frames;
}

export function stepFrame(frame, step, frames) {
  if (!Number.isInteger(frames) || frames <= 0) return 0;
  return (((frame + step) % frames) + frames) % frames;
}

/**
 * 把拖动/键盘旋转绑到示范区。返回 detach；letter 无旋转帧时返回 null。
 * opts: { stage, image, letterId, frames, alt }
 */
export function attachRotator(opts) {
  const { stage, image, letterId, frames, alt } = opts || {};
  if (!stage || !image || !letterId || !Number.isInteger(frames) || frames < 4) return null;
  let frame = 0;
  let dragging = false;
  let startX = 0;
  let startFrame = 0;
  let lastApplied = -1;

  const apply = (next) => {
    if (next === lastApplied) return;
    lastApplied = next;
    image.src = rotFrameUrl(letterId, next, frames);
    image.alt = next === 0 ? alt : `${alt}（已旋转）`;
    stage.dataset.rotFrame = String(next);
  };

  const width = () => {
    const w = stage.clientWidth;
    return Number.isFinite(w) && w > 0 ? w : 320;
  };

  const onPointerDown = (ev) => {
    if (!ev || !Number.isFinite(ev.clientX)) return;
    dragging = true;
    startX = ev.clientX;
    startFrame = frame;
    try { stage.setPointerCapture?.(ev.pointerId); } catch { /* 合成环境无捕获 */ }
  };
  const onPointerMove = (ev) => {
    if (!dragging || !ev || !Number.isFinite(ev.clientX)) return;
    frame = frameForDrag({ dx: ev.clientX - startX, width: width(), frames, startFrame });
    apply(frame);
  };
  const endDrag = () => { dragging = false; };
  const onKeyDown = (ev) => {
    if (!ev || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')) return;
    frame = stepFrame(frame, ev.key === 'ArrowRight' ? 1 : -1, frames);
    apply(frame);
    ev.preventDefault?.();
  };

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('keydown', onKeyDown);
  stage.dataset.rot = 'true';
  stage.setAttribute('tabindex', '0');
  stage.setAttribute('role', 'slider');
  stage.setAttribute('aria-label', '示范手模角度，左右方向键或拖动旋转');
  stage.setAttribute('aria-valuemin', '0');
  stage.setAttribute('aria-valuemax', String(frames - 1));
  stage.setAttribute('aria-valuenow', '0');

  if (typeof Image === 'function') {
    for (let k = 1; k < frames; k++) {
      const pre = new Image();
      pre.src = rotFrameUrl(letterId, k, frames);
    }
  }

  return function detach() {
    stage.removeEventListener('pointerdown', onPointerDown);
    stage.removeEventListener('pointermove', onPointerMove);
    stage.removeEventListener('pointerup', endDrag);
    stage.removeEventListener('pointercancel', endDrag);
    stage.removeEventListener('keydown', onKeyDown);
    delete stage.dataset.rot;
    delete stage.dataset.rotFrame;
    stage.removeAttribute('tabindex');
    stage.removeAttribute('role');
    stage.removeAttribute('aria-label');
    stage.removeAttribute('aria-valuemin');
    stage.removeAttribute('aria-valuemax');
    stage.removeAttribute('aria-valuenow');
  };
}
