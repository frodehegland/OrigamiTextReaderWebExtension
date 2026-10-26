const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { parseHTML } = require("linkedom");

async function main() {
  const page = parseHTML(
    '<html><body><div id="toast" hidden></div><div id="popover" hidden></div><div id="seltool" hidden></div></body></html>',
  );
  const stored = {};
  const browser = {
    runtime: {},
    storage: {
      local: {
        async get(key) {
          return { [key]: stored[key] };
        },
        async set(values) {
          Object.assign(stored, values);
        },
      },
    },
  };
  const context = {
    browser,
    clearTimeout,
    console,
    document: page.document,
    setTimeout,
    window: page.window,
  };
  context.globalThis = context;
  context.self = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("lib/library.js", "utf8"), context);

  const source = fs.readFileSync("reader/reader.js", "utf8");
  const bootAt = source.indexOf("  boot().catch(");
  assert.ok(bootAt > 0, "reader test could not locate boot call");
  vm.runInContext(
    source.slice(0, bootAt) +
      "  globalThis.readerTest = { savePosition, restorePosition, onScroll, closeBook, state };\n})();",
    context,
  );

  const scrollCalls = [];
  const iwin = {
    scrollY: 731,
    requestAnimationFrame(callback) {
      setTimeout(callback, 0);
    },
    removeEventListener() {},
    scrollTo(x, y) {
      const top = typeof x === "object" ? x.top : y;
      const behavior = typeof x === "object" ? x.behavior : "auto";
      this.scrollY = top;
      scrollCalls.push({ top, behavior });
    },
  };
  context.readerTest.state.book = {
    identifier: "book-a",
    origamiId: "",
    title: "Test book",
  };
  context.readerTest.state.iwin = iwin;
  context.readerTest.state.addressed = [];

  context.readerTest.savePosition();
  const position = await context.OrigamiLibrary.getPosition("book-a");
  assert.equal(
    position?.scrollY,
    731,
    "save the actual iframe scroll position",
  );

  iwin.scrollY = 0;
  assert.equal(await context.readerTest.restorePosition(), true);
  assert.equal(iwin.scrollY, 731, "restore the same pixel position");
  assert.deepEqual(
    scrollCalls,
    [{ top: 731, behavior: "instant" }],
    "restoration should jump only once, without animation",
  );

  iwin.scrollY = 912;
  context.readerTest.onScroll();
  context.readerTest.closeBook();
  const lastPosition = await context.OrigamiLibrary.getPosition("book-a");
  assert.equal(
    lastPosition.scrollY,
    912,
    "book switch should save pending scroll",
  );

  context.readerTest.state.book = {
    identifier: "book-b",
    origamiId: "",
    title: "Another book",
  };
  context.readerTest.state.iwin = iwin;
  iwin.scrollY = 0;
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(
    await context.OrigamiLibrary.getPosition("book-b"),
    null,
    "an old timer must not overwrite the next book's position",
  );

  const legacyTarget = page.document.createElement("p");
  legacyTarget.id = "legacy";
  legacyTarget.scrollIntoView = () => {
    iwin.scrollY = 420;
  };
  page.document.body.appendChild(legacyTarget);
  context.matchMedia = () => ({ matches: false });
  context.readerTest.state.idoc = page.document;
  await context.OrigamiLibrary.setPosition("book-b", { id: "legacy" });
  assert.equal(await context.readerTest.restorePosition(), true);
  assert.equal(iwin.scrollY, 420, "old ID-based positions should still work");
  console.log("Reader restores the exact iframe scroll position.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
