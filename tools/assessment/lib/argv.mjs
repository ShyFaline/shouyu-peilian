/**
 * 极简 CLI 参数解析。要点：位置参数必须跳过选项取值。
 * `--level geometry <dir>` 里的 geometry 是 --level 的值，不是目录；老写法
 * `argv.find(a => !a.startsWith("--"))` 会把它当目录，然后 ENOENT 崩栈。
 */
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

export const USAGE_EXIT = 2;

/**
 * @param {string[]} argv
 * @param {{options?: string[], flags?: string[]}} spec  options 带取值，flags 是开关
 * @returns {{values: object, positionals: string[], error: string|null}}
 */
export function parseArgs(argv, { options = [], flags = [] } = {}) {
  const optionSet = new Set(options);
  const flagSet = new Set(flags);
  const values = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (optionSet.has(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) return { values, positionals, error: `${a} 缺取值` };
      values[a] = v;
      i++;
      continue;
    }
    if (flagSet.has(a)) {
      values[a] = true;
      continue;
    }
    if (a.startsWith("--")) return { values, positionals, error: `未知选项 ${a}` };
    positionals.push(a);
  }
  return { values, positionals, error: null };
}

/** 取唯一位置参数并确认是存在的目录；不合格返回 {error}，由调用方打印用法。 */
export function singleDir(positionals) {
  if (positionals.length === 0) return { error: "缺 <dir>" };
  if (positionals.length > 1) return { error: `只接受一个 <dir>，收到 ${positionals.length} 个位置参数：${positionals.join(" ")}` };
  const target = resolve(positionals[0]);
  if (!existsSync(target)) return { error: `目录不存在：${positionals[0]}` };
  if (!statSync(target).isDirectory()) return { error: `不是目录：${positionals[0]}` };
  return { target, error: null };
}

/** 统一的用法错误出口：可判读、退出码 2。 */
export function usageError(message, usageLine) {
  console.error(`用法错误: ${message}`);
  console.error(usageLine);
  process.exit(USAGE_EXIT);
}
