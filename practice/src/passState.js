/**
 * 连续有效才开放 pass。
 * passFrames=6, maxGapMs=400 是初值，UNVERIFIED 待验证，不是实验结论。
 */

export const PASS_FRAMES = 6; // UNVERIFIED 待验证
export const MAX_GAP_MS = 400; // UNVERIFIED 待验证

export function createHold(opts = {}) {
  return {
    frames: 0,
    elapsedMs: 0,
    lastVideoTime: null,
    lastTs: null,
    passFrames: opts.passFrames ?? PASS_FRAMES,
    maxGapMs: opts.maxGapMs ?? MAX_GAP_MS,
  };
}

export function resetHold(hold) {
  if (!hold) return hold;
  hold.frames = 0;
  hold.elapsedMs = 0;
  hold.lastVideoTime = null;
  hold.lastTs = null;
  return hold;
}

export function holdView(hold) {
  return {
    frames: hold?.frames || 0,
    elapsedMs: hold?.elapsedMs || 0,
    // 透出保持门阈值，供离线统计与调试读取；值仍为 UNVERIFIED 初值，不代表实验结论。
    passFrames: hold?.passFrames ?? PASS_FRAMES,
    maxGapMs: hold?.maxGapMs ?? MAX_GAP_MS,
  };
}

/**
 * 同一 videoTime 不双计。gap 超时归零后再计本帧。
 * ok=false（undetermined/fail/blocked/停流/切字母）必须清零。
 */
export function observePass(hold, { ok, videoTime, nowMs } = {}) {
  try {
    if (!hold) return holdView(hold);
    // Invalidation preserves the high-water marks: an old frame cannot become new.
    const clear = () => { hold.frames = 0; hold.elapsedMs = 0; };
    if (!ok || !Number.isFinite(videoTime) || !Number.isFinite(nowMs) ||
        videoTime < 0 || nowMs < 0 ||
        (hold.lastVideoTime != null && videoTime < hold.lastVideoTime) ||
        (hold.lastTs != null && nowMs < hold.lastTs)) {
      clear();
      return holdView(hold);
    }
    if (hold.lastTs != null && nowMs - hold.lastTs > hold.maxGapMs) clear();
    // Expiry MUST precede deduplication, without resetting the last videoTime.
    if (videoTime === hold.lastVideoTime) return holdView(hold);
    if (hold.frames > 0 && hold.lastTs != null) hold.elapsedMs += nowMs - hold.lastTs;
    hold.frames += 1;
    hold.lastVideoTime = videoTime;
    hold.lastTs = nowMs;
    return holdView(hold);
  } catch {
    resetHold(hold);
    return holdView(hold);
  }
}

export function holdReady(hold) {
  return (hold?.frames || 0) >= (hold?.passFrames ?? PASS_FRAMES);
}
