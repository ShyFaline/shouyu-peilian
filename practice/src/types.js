/** 层间合同。字段与 app.js 导出 JSON、evaluate() 返回值一致。禁止另造字段名。 */

/**
 * app.js 导出的 landmarks[] 元素。
 * @typedef {object} Landmark
 * @property {number} x
 * @property {number} y
 * @property {number} [z]
 */

/**
 * app.js 本机下载的一帧 HandFrame。landmarks 长度 21。
 * @typedef {object} HandFrame
 * @property {number} t
 * @property {string} handedness
 * @property {Landmark[]} landmarks
 * @property {number} conf
 */

/**
 * evaluate() 返回的 issues[] 元素。
 * @typedef {object} Issue
 * @property {string} code
 * @property {string} hint
 * @property {string} [finger]
 */

/**
 * evaluate() 返回值。
 * @typedef {object} PracticeEvent
 * @property {boolean} pass
 * @property {Issue[]} issues
 * @property {object} curls
 */

export {};
