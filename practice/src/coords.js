/** 等尺度坐标变换。只做 x*width / y*height，不复制 angleDeg。 */

export function toEqualScalePoint(p, width, height) {
  if (!p) return p;
  const out = { x: p.x * width, y: p.y * height };
  if (p.z != null) out.z = p.z;
  return out;
}

export function toEqualScale(lm, width, height) {
  if (!lm) return lm;
  return lm.map((p) => toEqualScalePoint(p, width, height));
}

export function geometrySize(geom) {
  const width = geom?.width ?? geom?.imageWidth;
  const height = geom?.height ?? geom?.imageHeight;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

/** Omitted coordSpace means image_normalized, never a synthetic unit fallback. */
export function geometryError(geom) {
  const space = geom?.coordSpace ?? "image_normalized";
  if (space === "equal_scale_unit") return null; // Explicit synthetic geometry channel only.
  if (space !== "image_normalized") return "unsupported_coord_space";
  return geometrySize(geom) ? null : "missing_size";
}

export function toGeometryPoints(lm, geom) {
  if (!lm || geometryError(geom)) return null;
  if (geom?.coordSpace === "equal_scale_unit") return lm;
  const size = geometrySize(geom);
  return toEqualScale(lm, size.width, size.height);
}
