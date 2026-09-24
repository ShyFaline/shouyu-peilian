/** 导出 schema v2。targetLetterId 是当时选中目标，不是正确答案。禁止当标签写 verdict。 */

export const SCHEMA_VERSION = 2;
import { MAX_GAP_MS } from "./passState.js";
export const CODE_VERSION = "unversioned"; // Standalone callers must supply a runtime manifest version.
export const SNAPSHOT_FIELDS = [
  "schemaVersion",
  "capturedAt",
  "frameId",
  "imageWidth",
  "imageHeight",
  "coordSpace",
  "mirrored",
  "targetLetterId",
  "sourceType",
  "codeVersion",
  "rulesVersion",
  "handedness",
  "landmarks",
];

const FORBIDDEN = new Set([
  "expectedVerdict",
  "pass",
  "decision",
  "practiceStatus",
  "conf",
  "t",
]);

function isFiniteNum(n) {
  return typeof n === "number" && Number.isFinite(n);
}

function handednessOf(raw) {
  if (raw == null) return { category: "Unknown" };
  if (typeof raw === "string") {
    return { category: raw || "Unknown" };
  }
  const category =
    raw.category ||
    raw.categoryName ||
    raw.displayName ||
    "Unknown";
  const out = { category: category || "Unknown" };
  if (isFiniteNum(raw.score)) out.score = raw.score;
  return out;
}

export function createSnapshot(input = {}) {
  const width = input.imageWidth ?? input.width;
  const height = input.imageHeight ?? input.height;
  if (!isFiniteNum(width) || !isFiniteNum(height) || width <= 0 || height <= 0) {
    return { ok: false, reason: "missing_size", snapshot: null };
  }
  const lm = input.landmarks;
  if (!Array.isArray(lm) || lm.length !== 21 || lm.some(p => !p || !isFiniteNum(p.x) || !isFiniteNum(p.y) || (p.z != null && !isFiniteNum(p.z)))) {
    return { ok: false, reason: "landmarks", snapshot: null };
  }
  const capturedAt = input.capturedAt === undefined ? Date.now() : input.capturedAt;
  const frameId = input.frameId === undefined ? 0 : input.frameId;
  if (!isFiniteNum(capturedAt) || capturedAt < 0 || !Number.isSafeInteger(frameId) || frameId < 0) {
    return { ok: false, reason: "invalid_time", snapshot: null };
  }
  if (input.coordSpace != null && input.coordSpace !== "image_normalized") {
    return { ok: false, reason: "unsupported_coord_space", snapshot: null };
  }
  const snapshot = {
    schemaVersion: SCHEMA_VERSION,
    capturedAt,
    frameId,
    imageWidth: width,
    imageHeight: height,
    coordSpace: input.coordSpace || "image_normalized",
    mirrored: Boolean(input.mirrored),
    targetLetterId: input.targetLetterId || "",
    sourceType: input.sourceType || "camera",
    codeVersion: input.codeVersion || CODE_VERSION,
    rulesVersion: input.rulesVersion || "",
    handedness: handednessOf(input.handedness),
    landmarks: lm.map((p) => ({
      x: p.x,
      y: p.y,
      ...(p.z != null ? { z: p.z } : {}),
    })),
  };
  return { ok: true, reason: "ok", snapshot };
}

export function serializeSnapshot(snapshot) {
  if (!snapshot) return null;
  const out = {};
  for (const key of SNAPSHOT_FIELDS) {
    if (snapshot[key] !== undefined) out[key] = snapshot[key];
  }
  for (const key of Object.keys(out)) {
    if (FORBIDDEN.has(key)) delete out[key];
  }
  return out;
}

export function canExportSnapshot(snapshot, ctx = {}) {
  if (!snapshot) return false;
  if (ctx.handCount != null && ctx.handCount !== 1) return false;
  if (ctx.hasHand === false) return false;
  if (ctx.qualityOk === false) return false;
  if (ctx.stale === true) return false;
  if (ctx.active === false) return false;
  if (ctx.currentLetterId != null && ctx.currentLetterId !== snapshot.targetLetterId) return false;
  const nowMs = ctx.nowMs === undefined ? Date.now() : ctx.nowMs;
  if (!isFiniteNum(snapshot.capturedAt) || !isFiniteNum(nowMs)) return false;
  const age = nowMs - snapshot.capturedAt;
  if (age < 0 || age > MAX_GAP_MS) return false;
  if (snapshot.schemaVersion !== SCHEMA_VERSION || snapshot.coordSpace !== "image_normalized") return false;
  if (!Number.isSafeInteger(snapshot.frameId) || snapshot.frameId < 0) return false;
  return createSnapshot(snapshot).ok;
}
