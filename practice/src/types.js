/** 层间合同。字段与 snapshot schema v2、evaluate() / judge() 返回值一致。禁止另造字段名。 */

/**
 * @typedef {object} Landmark
 * @property {number} x
 * @property {number} y
 * @property {number} [z]
 */

/**
 * schema v2 本机下载的一帧。targetLetterId 是当时选中目标，不是正确答案。
 * 禁止 expectedVerdict / pass / decision / practiceStatus 当标签。
 * @typedef {object} HandFrame
 * @property {2} schemaVersion
 * @property {number} capturedAt
 * @property {number} frameId
 * @property {number} imageWidth
 * @property {number} imageHeight
 * @property {string} coordSpace
 * @property {boolean} mirrored
 * @property {string} targetLetterId
 * @property {string} sourceType
 * @property {string} codeVersion
 * @property {string} rulesVersion
 * @property {{ category: string, score?: number }} handedness
 * @property {Landmark[]} landmarks
 */

/**
 * @typedef {object} Issue
 * @property {string} code
 * @property {string} hint
 * @property {string} [finger]
 */

/**
 * evaluate() 返回值。issues 可切片展示；audit 为完整原因。
 * @typedef {object} PracticeEvent
 * @property {boolean} pass
 * @property {Issue[]} issues
 * @property {Issue[]} audit
 * @property {object} curls
 * @property {string} ruleStatus
 * ruleStatus!=="ok"（no_letter/no_rules/unknown_rule_fields）时 pass 必为 false：
 * 这是状态门阻断，不构成几何判负，统计层不得计入失败样本。
 */

/**
 * @typedef {object} JudgeResult
 * @property {"pass"|"fail"|"undetermined"|"blocked"} decision
 * @property {"pending_review"|"demo_only"|"pose_practice"|"accepted_practice"} practiceStatus
 * @property {Issue[]} issues
 * @property {{ ok: boolean, reason: string }} quality
 * @property {{ frames: number, elapsedMs: number, passFrames: number, maxGapMs: number }} hold
 * hold.passFrames/maxGapMs 为保持门阈值透出（UNVERIFIED 初值），供离线统计读取。
 */

/**
 * DS frozen replay contract (schema remains v2; do not duplicate rules):
 *
 * Coordinates: image_normalized (also the default if omitted by evaluate/judge)
 * requires finite positive width/height or imageWidth/imageHeight. Missing size
 * is rejected: evaluate.pass=false, issue missing_size; judge undetermined.
 * Unknown coordSpace is rejected with unsupported_coord_space. Never guess 1x1.
 * equal_scale_unit is an explicit synthetic-only geometry channel, not a camera
 * schema-v2 coordinate space. x/y and optional z must be finite, 21 points.
 * Geometry uses x*width,y*height; z is retained, not a calibrated depth measure.
 * mirrored means DISPLAY mirror only: raw landmarks are never reflected.
 *
 * Layers:
 * 1 evaluate(letter,lm,geom): single-frame geometry only; pass is NOT acceptance.
 *   {pass,issues (up to 2),audit (all),curls,ruleStatus}.
 * 2 judge(input,hold): quality + content gates + geometry + temporal hold.
 *   {decision,practiceStatus,issues,quality:{ok,reason},hold:{frames,elapsedMs}}.
 *   Use createHold() for a single-frame probe (cannot pass); do not repeat a
 *   still image under invented timestamps to manufacture a sequence.
 * 3 Sequence replay: reuse one hold with observePass/judge and ordered real
 *   videoTime (media seconds) and nowMs (monotonic milliseconds). Timestamps
 *   must be finite/nonnegative/nondecreasing. Duplicate videoTime does not
 *   count and does not refresh age; gap >400ms clears BEFORE duplicate return.
 *   Expired duplicate stays zero until a strictly newer videoTime counts one.
 *   Missing/nonfinite/backwards times fail closed. 400ms allowed, 401ms expired.
 *   Six valid distinct frames opens pass, NOT a required elapsed 400ms hold.
 *   Reset per session/target, quality failure, hidden/visible, mute, stop/error.
 *   Replay must preserve media-frame dedup across invalidation, as app does;
 *   only a new camera session resets the media high-water mark. In no-frame
 *   intervals run the time gate too; a last successful frame is not perpetual.
 *
 * Snapshot time: capturedAt is finite nonnegative epoch milliseconds taken
 * BEFORE detection; frameId is a nonnegative safe integer. Creation defaults
 * only omitted capturedAt/frameId to Date.now()/0. Imported captures must
 * explicitly contain both. canExportSnapshot's nowMs is EPOCH milliseconds
 * (default Date.now), unlike judge nowMs. Age must be 0..400 inclusive plus
 * quality/target/stale gates; app additionally requires active track/visible
 * page and fresh monotonic frame time without relying on RAF. Offline replay
 * uses createSnapshot for structure, NOT the live-export wall-clock gate.
 *
 * codeVersion/rulesVersion: sha256:<hex>, manifest order path+NUL+file SHA+LF;
 * sources in versions.js lists, letters bytes included; helper excluded.
 * App logs the startup manifest; capture the manifest with a frozen workspace.
 * No GF standards identifier or HEAD alone is a rules implementation version.
 * A new export schema or independent evaluator is NOT introduced.
 *
 * Independent labels remain separate from capture JSON. targetLetterId,
 * predictions and practiceStatus are not truth. No labels => no accuracy.
 * Source groups (synthetic/render/video/camera) must not be conflated.
 * Six frames, 400ms, geometry and quality thresholds are UNVERIFIED parameters;
 * no content acceptance, human accuracy or learning benefit is implied.
 */

/**
 * @typedef {object} GeometryContext
 * @property {"image_normalized"|"equal_scale_unit"} [coordSpace]
 * @property {number} [width] Finite positive for image_normalized.
 * @property {number} [height] Finite positive for image_normalized.
 * @property {number} [imageWidth] Alias for width.
 * @property {number} [imageHeight] Alias for height.
 */

/**
 * @typedef {object} JudgeInput
 * @property {object|null} letter
 * @property {Landmark[][]} hands
 * @property {GeometryContext} geom
 * @property {number} videoTime Media seconds, distinct increasing frames.
 * @property {number} nowMs Monotonic milliseconds, NOT epoch capturedAt.
 */
export {};
