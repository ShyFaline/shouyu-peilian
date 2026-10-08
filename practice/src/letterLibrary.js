/** 字母库分组与展示元信息。只读取 practiceStatus，不升格、不改判定。 */

export const GROUP_META = {
  practice: {
    id: "practice",
    title: "可跟练",
    note: "先看示范，再试着摆出手型。打开摄像头后，可以获得静态手型提示。",
  },
  review: {
    id: "review",
    title: "待核对",
    note: "这些字母暂不判定对错，可以查看示范，但不作为过关依据。",
  },
  demo: {
    id: "demo",
    title: "仅示范",
    note: "这些字母目前只提供外形示范，不开放跟练判定。",
  },
};

const PRACTICEABLE = new Set(["pose_practice", "accepted_practice"]);

export function isPracticeable(letter) {
  return PRACTICEABLE.has(letter?.practiceStatus);
}

export function groupIdForStatus(practiceStatus) {
  if (PRACTICEABLE.has(practiceStatus)) return "practice";
  if (practiceStatus === "demo_only") return "demo";
  return "review";
}

export function groupIdForLetter(letter) {
  return groupIdForStatus(letter?.practiceStatus);
}

export function groupLetters(letters = []) {
  const groups = { practice: [], review: [], demo: [] };
  for (const letter of letters) {
    groups[groupIdForLetter(letter)].push(letter);
  }
  return groups;
}

export function isStaticOnlyLetter(letter) {
  return letter?.id === "GF0021.J" || letter?.id === "GF0021.Z";
}

export function capabilityLabel(letter) {
  const group = groupIdForLetter(letter);
  if (group === "practice") {
    return isStaticOnlyLetter(letter) ? "可跟练静态姿态，只核静态部分" : "可跟练静态姿态";
  }
  if (group === "demo") return "仅示范，不判定";
  return "待核对，暂不判定";
}

export function capabilityNote(letter) {
  const group = groupIdForLetter(letter);
  if (group === "practice") {
    if (isStaticOnlyLetter(letter)) {
      return "本版可跟练静态近似手型，完整规范指式待核对，不作为完整规范通过依据。";
    }
    return "可跟练静态姿态。打开摄像头后，系统会对照当前手型给出提示。";
  }
  if (group === "demo") {
    return "仅示范。目前只提供外形对照，不作为过关依据。";
  }
  return "待核对，暂不判定。";
}

export function letterAriaLabel(letter) {
  const name = letter?.title || letter?.label || letter?.id || "字母";
  return `${name}，${capabilityLabel(letter)}`;
}

export const CONFUSION_CLUSTERS = [
  {
    ids: ["GF0021.M", "GF0021.N", "GF0021.S"],
    note: "M、N、S 手型接近。目前规则还不能把它们稳定分开，这里的提示只作对照，不作为区分过关依据。",
  },
  {
    ids: ["GF0021.E", "GF0021.EH"],
    note: "E 与 ê 手型接近。目前不把它们的差别作为区分过关依据。",
  },
];

export function confusionCluster(letterId) {
  return CONFUSION_CLUSTERS.find((cluster) => cluster.ids.includes(letterId)) || null;
}
