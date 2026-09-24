/** 核心源指纹。报告带上它，才能说明「这一版结果对应哪一版核心」。 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CORE_SOURCES, WORKSPACE_ROOT } from "./core.mjs";

export function coreFingerprint(root = WORKSPACE_ROOT) {
  const files = {};
  const parts = [];
  for (const rel of CORE_SOURCES) {
    try {
      const buf = readFileSync(join(root, rel));
      const hash = createHash("sha256").update(buf).digest("hex").slice(0, 16);
      files[rel] = hash;
      parts.push(`${rel}:${hash}`);
    } catch (e) {
      files[rel] = `MISSING(${e.code ?? "error"})`;
      parts.push(`${rel}:missing`);
    }
  }
  return { files, digest: createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 16) };
}
