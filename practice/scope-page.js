/** 首页与来源页共用的范围选择脚本：读取/切换范围，并把范围带进跟练页链接。 */

import { readStorage } from "./src/progress.js";
import { mountScopeSwitch } from "./src/scopeSwitch.js";
import { SCOPE_META, resolveScope, writeStoredScope, scopeSearch } from "./src/scope.js";

function main() {
  const storage = readStorage();
  let scope = resolveScope({ search: globalThis.location?.search, storage });

  const noteEl = document.getElementById("scope-note");
  const switchEl = document.getElementById("scope-switch");

  function applyScope() {
    if (noteEl) {
      noteEl.textContent = `${SCOPE_META[scope].note}两个范围共用同一套汉语手指字母与判定规则；切换范围不会清除本机练习记录。`;
    }
    for (const link of document.querySelectorAll("a[data-scope-link]")) {
      const hash = link.hash || "";
      link.href = scopeSearch(link.search || "?", scope) + hash;
    }
  }

  const mounted = switchEl
    ? mountScopeSwitch(switchEl, {
        scope,
        onChange(next) {
          if (next === scope) return;
          scope = next;
          writeStoredScope(storage, scope);
          mounted.update(scope);
          applyScope();
        },
      })
    : null;

  applyScope();
}

main();
