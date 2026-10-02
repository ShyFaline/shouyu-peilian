import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_HAND_KEY,
  parseDemoHand,
  loadDemoHand,
  saveDemoHand,
  swapHowForHand,
  createDemoHandStore,
} from "./demoHand.js";

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

test("parseDemoHand 只认 right/left，其余回退 right", () => {
  assert.equal(parseDemoHand("left"), "left");
  assert.equal(parseDemoHand("right"), "right");
  assert.equal(parseDemoHand("Left"), "right");
  assert.equal(parseDemoHand(""), "right");
  assert.equal(parseDemoHand(null), "right");
  assert.equal(parseDemoHand(undefined), "right");
});

test("load/save 往返与坏值回退", () => {
  const s = makeStorage();
  assert.equal(loadDemoHand(s), "right");
  assert.equal(saveDemoHand(s, "left"), true);
  assert.equal(s.getItem(DEMO_HAND_KEY), "left");
  assert.equal(loadDemoHand(s), "left");
  saveDemoHand(s, "junk");
  assert.equal(loadDemoHand(s), "right");
});

test("loadDemoHand 容忍 storage 抛错与缺失", () => {
  const boom = { getItem() { throw new Error("denied"); } };
  assert.equal(loadDemoHand(boom), "right");
  assert.equal(loadDemoHand(null), "right");
  assert.equal(saveDemoHand(null, "left"), false);
});

test("swapHowForHand 左手时方向词镜像互换", () => {
  const a = "右手伸拇指，指尖朝上，食、中、无名、小指弯曲，指尖抵于掌心，手背向右。";
  assert.equal(
    swapHowForHand(a, "left"),
    "左手伸拇指，指尖朝上，食、中、无名、小指弯曲，指尖抵于掌心，手背向左。"
  );
  const b = "右手拇指向掌心弯曲，食、中、无名、小指并拢直立，掌心向前偏左。";
  assert.equal(
    swapHowForHand(b, "left"),
    "左手拇指向掌心弯曲，食、中、无名、小指并拢直立，掌心向前偏右。"
  );
});

test("swapHowForHand 右手或非法输入不改文案", () => {
  const how = "右手握拳。";
  assert.equal(swapHowForHand(how, "right"), how);
  assert.equal(swapHowForHand(how, "junk"), how);
  assert.equal(swapHowForHand(null, "left"), null);
});

test("createDemoHandStore get/set 与持久化", () => {
  const s = makeStorage({ [DEMO_HAND_KEY]: "left" });
  const store = createDemoHandStore(s);
  assert.equal(store.get(), "left");
  assert.equal(store.set("right"), "right");
  assert.equal(s.getItem(DEMO_HAND_KEY), "right");
  assert.equal(store.set("junk"), "right");
});
