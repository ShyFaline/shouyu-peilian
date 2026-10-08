// Run: node practice/src/scope-page.test.js
// Real page module and scope controls; DOM/anchor boundaries modeled without a browser.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SCOPE_STORAGE_KEY } from "./scope.js";

class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.events = new Map();
  }
  replaceChildren(...children) { this.children = children; }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  hasAttribute(name) { return this.attributes.has(name); }
  addEventListener(name, callback) { this.events.set(name, callback); }
  click() { this.events.get("click")?.(); }
}

class Anchor {
  constructor(href, base) {
    this.base = base;
    this.href = href;
  }
  get href() { return this.url.href; }
  set href(value) { this.url = new URL(value, this.base); }
  get search() { return this.url.search; }
  set search(value) { this.url.search = value; }
  get hash() { return this.url.hash; }
}

function htmlFor(page) {
  return readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
}
function scopedHrefs(page) {
  return [...htmlFor(page).matchAll(/<a\b[^>]*\bdata-scope-link\b[^>]*>/g)]
    .map(([tag]) => tag.match(/\bhref="([^"]+)"/)[1]);
}
function storageFor(scope) {
  const values = new Map(scope ? [[SCOPE_STORAGE_KEY, scope]] : []);
  return {
    get length() { return values.size; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

let bootId = 0;
async function boot(page, { search = "", storage = storageFor(), hrefs = scopedHrefs(page), switchPresent = true } = {}) {
  const base = new URL(`https://example.test/practice/${page}${search}`);
  const links = hrefs.map(href => new Anchor(href, base));
  const originals = links.map(link => new URL(link.href));
  const note = new Element();
  const scopeSwitch = switchPresent ? new Element() : null;
  const document = {
    getElementById: id => id === "scope-note" ? note : id === "scope-switch" ? scopeSwitch : null,
    querySelectorAll: selector => {
      assert.equal(selector, "a[data-scope-link]");
      return links;
    },
    createElement: () => new Element(),
  };
  const saved = new Map(["document", "location", "localStorage"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, { document, location: base, localStorage: storage });
  try {
    await import(`../scope-page.js?test=${++bootId}`);
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
  return {
    links, originals, note, storage,
    select(scope) {
      const button = scopeSwitch.children.find(child => child.dataset.scope === scope);
      assert.ok(button, `scope button ${scope}`);
      const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
      globalThis.document = document;
      try {
        button.click();
      } finally {
        if (previous) Object.defineProperty(globalThis, "document", previous);
        else delete globalThis.document;
      }
      assert.equal(button.attributes.get("aria-pressed"), "true");
    },
  };
}

function assertLinks(harness, scope) {
  for (const [i, link] of harness.links.entries()) {
    const actual = new URL(link.href);
    const original = harness.originals[i];
    assert.equal(actual.origin, original.origin, `origin: ${original.href}`);
    assert.equal(actual.pathname, original.pathname, `path: ${original.href}`);
    assert.equal(actual.hash, original.hash, `hash: ${original.href}`);
    assert.equal(actual.searchParams.get("scope"), scope);
    assert.equal(actual.searchParams.getAll("scope").length, 1);
    const expectedQuery = new URLSearchParams(original.search);
    const actualQuery = new URLSearchParams(actual.search);
    expectedQuery.delete("scope");
    actualQuery.delete("scope");
    assert.deepEqual([...actualQuery], [...expectedQuery], `other query: ${original.href}`);
  }
}

const tests = [];
const test = (name, run) => tests.push([name, run]);
for (const page of ["index.html", "sources.html"]) {
  for (const scope of ["basic", "full"]) {
    test(`${page}: URL ${scope}, preserved learning/test/records paths, switch round trip`, async () => {
      const h = await boot(page, { search: `?scope=${scope}`, storage: storageFor(scope === "basic" ? "full" : "basic") });
      assertLinks(h, scope);
      assert.ok(h.links.length >= 2, "test actual HTML scoped links");
      if (page === "index.html") {
        assert.ok(h.originals.some(url => url.searchParams.get("mode") === "test"));
        assert.ok(h.originals.some(url => url.hash === "#records"));
        assert.ok(h.originals.some(url => url.hash === "#letter-library"));
        assert.ok(h.originals.some(url => !url.search && !url.hash));
      }
      const other = scope === "basic" ? "full" : "basic";
      h.select(other);
      assertLinks(h, other);
      assert.equal(h.storage.getItem(SCOPE_STORAGE_KEY), other);
      h.select(scope);
      assertLinks(h, scope);
      const stable = h.links.map(link => link.href);
      h.select(scope);
      assert.deepEqual(h.links.map(link => link.href), stable);
    });
  }
  test(`${page}: stored basic survives learn-and-return navigation`, async () => {
    const storage = storageFor("basic");
    const first = await boot(page, { storage });
    assertLinks(first, "basic");
    const destination = new URL(first.links[0].href);
    assert.equal(destination.pathname, "/practice/learn.html");
    assert.equal(destination.searchParams.get("scope"), "basic");
    // Follow the existing learn-page return link, then remount with the same storage.
    const returnHref = htmlFor("learn.html").match(new RegExp(`<a\\b[^>]*href="(\\./${page})"`))[1];
    const returnUrl = new URL(returnHref, destination);
    assert.equal(returnUrl.pathname, `/practice/${page}`);
    const returned = await boot(page, { storage, search: returnUrl.search });
    assertLinks(returned, "basic");
    returned.select("full");
    const fullReturn = await boot(page, { storage });
    assertLinks(fullReturn, "full");
  });
}

test("preserve nested/external paths, duplicate other queries and hashes across repeated switches", async () => {
  const h = await boot("index.html", {
    search: "?scope=basic",
    hrefs: [
      "./learn.html?mode=test&tag=a&tag=b&scope=full#records",
      "../nested/learn.html?token=a%2Bb&empty=#letter-library",
      "https://other.test/path/learn.html?mode=test&scope=full&scope=basic#records",
    ],
  });
  assertLinks(h, "basic");
  h.select("full");
  assertLinks(h, "full");
  h.select("basic");
  assertLinks(h, "basic");
});

test("invalid URL scope falls back to stored scope; absent scope defaults full without switch", async () => {
  assertLinks(await boot("sources.html", { search: "?scope=invalid", storage: storageFor("basic") }), "basic");
  assertLinks(await boot("index.html", { switchPresent: false }), "full");
});

let failed = 0;
for (const [name, run] of tests) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}\n${error.stack}`);
  }
}
console.log(`scope-page: ${tests.length - failed}/${tests.length} passed`);
if (failed) process.exitCode = 1;
