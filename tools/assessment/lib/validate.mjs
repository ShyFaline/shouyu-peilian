/**
 * 采集记录的最小元数据校验。只查「能不能回放」，不判对错、不判标签。
 *
 * 几何尺寸/坐标空间的裁决复用核心 geometryError()，这里不另写一套阈值。
 */
import { geometryError, geomOf } from "./core.mjs";

export const SUPPORTED_SCHEMA_VERSION = 2;
export const SUPPORTED_COORD_SPACES = ["image_normalized", "equal_scale_unit"];
export const LANDMARK_COUNT = 21;

/** 这些字段是「当时的选中目标」或「工具自己的预测」，永远不能当标签。 */
export const PSEUDO_LABEL_FIELDS = [
  "expectedVerdict",
  "expectedIssueCodes",
  "expectedVerdictCode",
  "verdict",
  "pass",
  "decision",
  "practiceStatus",
  "label",
  "truth",
  "groundTruth",
];

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const finite = (v) => typeof v === "number" && Number.isFinite(v);

function checkLandmarks(lm, where, errors) {
  if (lm === undefined || lm === null) {
    errors.push({ code: "missing_landmarks", field: where, detail: "landmarks 缺失" });
    return;
  }
  if (!Array.isArray(lm)) {
    errors.push({ code: "missing_landmarks", field: where, detail: "landmarks 不是数组" });
    return;
  }
  if (lm.length !== LANDMARK_COUNT) {
    errors.push({ code: "landmark_count", field: where, detail: `需要 ${LANDMARK_COUNT} 点，实际 ${lm.length}` });
    return;
  }
  lm.forEach((p, i) => {
    if (!isObj(p)) {
      errors.push({ code: "landmark_shape", field: `${where}[${i}]`, detail: "不是对象" });
      return;
    }
    if (!finite(p.x) || !finite(p.y)) {
      errors.push({ code: "missing_xy", field: `${where}[${i}]`, detail: "x/y 缺失或不是有限数" });
      return;
    }
    if (p.z != null && !finite(p.z)) {
      errors.push({ code: "non_finite_z", field: `${where}[${i}]`, detail: "z 不是有限数" });
    }
  });
}

/**
 * @param {object} record 一条采集记录（单帧或序列）
 * @returns {{ok:boolean, kind:"single"|"sequence"|"unknown", blockers:Array, warnings:Array, meta:object}}
 */
export function validateCapture(record) {
  const blockers = [];
  const warnings = [];
  const meta = {};

  if (!isObj(record)) {
    return { ok: false, kind: "unknown", blockers: [{ code: "not_object", field: "-", detail: "顶层不是对象" }], warnings, meta };
  }

  const kind = Array.isArray(record.frames) ? "sequence" : Array.isArray(record.landmarks) ? "single" : "unknown";
  meta.kind = kind;
  meta.sampleId = typeof record.sampleId === "string" ? record.sampleId : null;
  meta.targetLetterId = typeof record.targetLetterId === "string" ? record.targetLetterId : null;
  meta.sourceType = typeof record.sourceType === "string" ? record.sourceType : "unspecified";

  if (kind === "unknown") {
    blockers.push({ code: "missing_landmarks", field: "-", detail: "既没有 landmarks 也没有 frames" });
    return { ok: false, kind, blockers, warnings, meta };
  }

  if (record.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    blockers.push({
      code: "unsupported_schema_version",
      field: "schemaVersion",
      detail: `当前只认 v${SUPPORTED_SCHEMA_VERSION}，实际 ${JSON.stringify(record.schemaVersion)}`,
    });
  }

  const space = record.coordSpace ?? "image_normalized";
  meta.coordSpace = space;
  if (!SUPPORTED_COORD_SPACES.includes(space)) {
    blockers.push({ code: "unsupported_coord_space", field: "coordSpace", detail: String(space) });
  }

  // 尺寸裁决复用核心。缺尺寸不补、不猜。
  const geomError = geometryError(geomOf(record));
  if (geomError) {
    blockers.push({
      code: geomError,
      field: geomError === "missing_size" ? "imageWidth/imageHeight" : "coordSpace",
      detail: geomError === "missing_size" ? "image_normalized 但没有有限正的宽高；不猜尺寸" : String(space),
    });
  }

  meta.imageWidth = Number.isFinite(record.imageWidth) ? record.imageWidth : null;
  meta.imageHeight = Number.isFinite(record.imageHeight) ? record.imageHeight : null;

  // 伪标签：出现即记录，绝不采信。
  const pseudo = PSEUDO_LABEL_FIELDS.filter((f) => record[f] !== undefined);
  if (pseudo.length) {
    warnings.push({
      code: "pseudo_label_field",
      field: pseudo.join(","),
      detail: "采集记录里出现标签/预测字段，一律忽略，不得当标签",
    });
    meta.pseudoLabelFields = pseudo;
  }

  if (kind === "single") {
    checkLandmarks(record.landmarks, "landmarks", blockers);
  } else {
    if (record.frames.length === 0) {
      blockers.push({ code: "empty_frames", field: "frames", detail: "序列没有任何帧" });
    }
    let noHand = 0;
    record.frames.forEach((fr, i) => {
      // 序列里「这一帧没检测到手」是合法观测，不是损坏：回放成 hand_count 失败即可。
      // 只有 landmarks 存在但畸形（NaN / 点数不对）才算损坏。
      if (fr?.landmarks == null) {
        noHand += 1;
      } else {
        checkLandmarks(fr.landmarks, `frames[${i}].landmarks`, blockers);
      }
      if (!finite(fr?.videoTime) || !finite(fr?.nowMs)) {
        blockers.push({
          code: "missing_timestamps",
          field: `frames[${i}]`,
          detail: "序列回放需要有限 videoTime 与 nowMs，缺失就无法复现保持门",
        });
      }
    });
    if (noHand > 0) {
      warnings.push({
        code: "frames_without_hand",
        field: "frames",
        detail: `${noHand}/${record.frames.length} 帧没有手，按 hand_count 回放，不算损坏`,
      });
      meta.framesWithoutHand = noHand;
    }
  }

  if (!meta.targetLetterId) {
    warnings.push({ code: "missing_target", field: "targetLetterId", detail: "没有目标字母，无法判几何规则" });
  }

  return { ok: blockers.length === 0, kind, blockers, warnings, meta };
}
