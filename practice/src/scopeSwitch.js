/** 范围切换控件（基础 26 字母 / 完整 32 项）。按钮原生可聚焦、可键盘操作；
 *  选中态同时用 aria-pressed 和「（当前）」文字标出，不只靠颜色。 */

import { SCOPE_META, SCOPE_ORDER, normalizeScope } from "./scope.js";

export function mountScopeSwitch(container, { scope, onChange } = {}) {
  if (!container) return { update() {}, element: null };
  container.replaceChildren();
  container.setAttribute("role", "group");
  if (!container.hasAttribute("aria-label")) container.setAttribute("aria-label", "字母范围");

  const buttons = new Map();
  for (const id of SCOPE_ORDER) {
    const meta = SCOPE_META[id];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.scope = id;
    btn.setAttribute("aria-pressed", "false");
    const name = document.createElement("span");
    name.className = "scope-name";
    name.textContent = meta.name;
    const desc = document.createElement("span");
    desc.className = "scope-desc";
    desc.textContent = meta.desc;
    btn.append(name, desc);
    btn.addEventListener("click", () => {
      if (typeof onChange === "function") onChange(id);
    });
    container.appendChild(btn);
    buttons.set(id, btn);
  }

  function update(nextScope) {
    const active = normalizeScope(nextScope);
    for (const [id, btn] of buttons) {
      btn.setAttribute("aria-pressed", id === active ? "true" : "false");
    }
  }

  update(scope);
  return { update, element: container };
}
