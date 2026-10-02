/** 示范区左右手偏好。
 *
 * 规范 GF0021-2019 §5.1：一般用右手表示；用左手表示时方向作相应改变。
 * 右手是正本，左手示范图与旋转帧由右手水平镜像生成。
 * 偏好只影响示范展示，不影响判定（evaluate/judge 不分左右手）。
 */

import { readStorage } from "./progress.js";

export const DEMO_HAND_KEY = "zhijian.demoHand.v1";
export const DEMO_HANDS = ["right", "left"];

export function parseDemoHand(raw) {
  return DEMO_HANDS.includes(raw) ? raw : "right";
}

export function loadDemoHand(storage) {
  try {
    if (!storage) return "right";
    return parseDemoHand(storage.getItem(DEMO_HAND_KEY));
  } catch {
    return "right";
  }
}

export function saveDemoHand(storage, hand) {
  try {
    if (!storage) return false;
    storage.setItem(DEMO_HAND_KEY, parseDemoHand(hand));
    return true;
  } catch {
    return false;
  }
}

/** 字母卡描述文字按右手书写；左手展示时方向词镜像互换。 */
export function swapHowForHand(how, hand) {
  if (hand !== "left" || typeof how !== "string") return how;
  let out = "";
  for (const ch of how) {
    if (ch === "右") out += "左";
    else if (ch === "左") out += "右";
    else out += ch;
  }
  return out;
}

export function createDemoHandStore(storageRef) {
  const storage = readStorage(storageRef);
  return {
    get() { return loadDemoHand(storage); },
    set(hand) {
      const value = parseDemoHand(hand);
      saveDemoHand(storage, value);
      return value;
    },
  };
}
