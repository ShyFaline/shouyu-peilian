/** 字母库分组与展示元信息。只读取 practiceStatus，不升格、不改判定。 */

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

/** 判定只核静态手型（该字母本身无动态成分，或动态规则未写入 rules.motion）。 */
export function isStaticOnlyLetter(letter) {
  return isPracticeable(letter) && !letter?.rules?.motion;
}

export function capabilityLabel(letter) {
  const group = groupIdForLetter(letter);
  if (group === "practice") {
    return isStaticOnlyLetter(letter) ? "可跟练，只核静态手型" : "可跟练，核手型与动作";
  }
  if (group === "demo") return "仅示范，不判定";
  return "待核对，暂不判定";
}

export function capabilityNote(letter) {
  const group = groupIdForLetter(letter);
  if (group === "practice") {
    if (letter?.rules?.motion) {
      return "可跟练。判定手型与动作；动作方向以规范原图人工对图为准。";
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
    ids: ["GF0021.V", "GF0021.W"],
    note: "V 与 W 接近。V 只伸食指中指两指，W 再加无名指共三指；比错时先数伸了几根手指。",
  },
  {
    ids: ["GF0021.I", "GF0021.Y"],
    note: "I 与 Y 接近。I 只伸小指，Y 是小指和拇指一起伸；比错时先看拇指有没有伸出。",
  },
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
