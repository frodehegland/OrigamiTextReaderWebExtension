const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { DOMParser, parseHTML } = require("linkedom");
const fflate = require("fflate");

async function main() {
  const page = parseHTML(fs.readFileSync("reader/reader.html", "utf8"));
  const frame = page.document.getElementById("frame");
  frame.contentDocument = parseHTML(
    "<html><head></head><body></body></html>",
  ).document;
  frame.contentWindow = {
    addEventListener() {},
    scrollTo() {
      assert.equal(
        frame.style.visibility,
        "hidden",
        "hide the page until restored",
      );
    },
  };

  const context = {
    Blob,
    DOMParser,
    NodeFilter: { SHOW_CDATA_SECTION: 8, SHOW_ELEMENT: 1 },
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    clearTimeout: () => {},
    console,
    crypto: globalThis.crypto,
    document: page.document,
    fflate,
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    location: { search: "", hash: "" },
    setTimeout: () => 0,
    window: page.window,
  };
  context.globalThis = context;
  context.self = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("lib/origami-epub.js", "utf8"), context);
  context.OrigamiLibrary = {
    async save() {},
    async getPosition() {
      return null;
    },
  };

  const book = await context.OrigamiEPUB.open(
    fs.readFileSync("test/sample-origami.epub"),
  );
  const firstPath = book.spine[0].path;
  const firstContent = book
    .text(firstPath)
    .replace("<html xmlns=", '<html dir="rtl" class="book-root" xmlns=')
    .replace("<body>", '<body lang="ar" data-book-body="first">');
  book.files.set(firstPath, new TextEncoder().encode(firstContent));

  const secondPath = "content/chapters/second.xhtml";
  book.files.set(
    "content/chapters/second.css",
    new TextEncoder().encode(".second-chapter { color: rebeccapurple; }"),
  );
  book.files.set(
    secondPath,
    new TextEncoder().encode(
      '<html xmlns="http://www.w3.org/1999/xhtml"><head><link rel="stylesheet" href="second.css"/><style media="print">#second { display: none; }</style></head><body><h2 id="second" class="second-chapter" onclick="alert(1)">Second spine chapter</h2><p>End of whole book</p><img src="../images/fold.png"/><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="../images/fold.png"/></svg><script>alert(1)</script></body></html>',
    ),
  );
  book.spine.push({
    id: "second",
    href: "second.xhtml",
    path: secondPath,
    mediaType: "application/xhtml+xml",
    properties: [],
  });

  const readerSource = fs.readFileSync("reader/reader.js", "utf8");
  const bootAt = readerSource.indexOf("  boot().catch(");
  assert.ok(bootAt > 0, "reader test could not locate boot call");
  const readerWithoutBoot =
    readerSource.slice(0, bootAt) +
    "  globalThis.readerTest = { renderBook, openBytes, state };\n})();";
  vm.runInContext(readerWithoutBoot, context);
  context.readerTest.state.book = book;
  context.readerTest.state.prefs.bookCSS = false;
  context.readerTest.renderBook();

  const body = frame.contentDocument.body;
  assert.equal(
    frame.contentDocument.documentElement.getAttribute("dir"),
    "rtl",
  );
  assert.equal(
    frame.contentDocument.documentElement.getAttribute("class"),
    "book-root",
  );
  assert.equal(body.getAttribute("lang"), "ar");
  assert.equal(body.getAttribute("data-book-body"), "first");
  assert.ok(
    frame.contentDocument
      .getElementById("ot-book-css")
      .textContent.includes(".second-chapter"),
    "the second spine stylesheet should be loaded",
  );
  assert.ok(
    frame.contentDocument.head.querySelector('style[media="print"]'),
    "inline style media should be preserved",
  );
  assert.ok(
    Array.from(frame.contentDocument.querySelectorAll(".ot-book-css")).every(
      (style) => style.disabled,
    ),
    "the book CSS switch should disable linked and inline styles",
  );
  const readerStyle = frame.contentDocument.getElementById("ot-reader-css");
  const coverRule = Array.from(readerStyle.sheet.cssRules).find(
    (rule) => rule.selectorText === ".x-ebookmaker-cover",
  );
  assert.equal(
    coverRule?.style.getPropertyValue("background-color"),
    "transparent",
    "reader CSS should remove the EPUB cover backdrop",
  );
  assert.ok(body.textContent.includes("Folding the Page"));
  assert.ok(body.textContent.includes("Second spine chapter"));
  assert.ok(body.textContent.includes("End of whole book"));
  assert.ok(
    body.querySelector("#second").parentNode === body,
    "spine content should be appended without an extra wrapper",
  );
  assert.ok(
    body.textContent.indexOf("Folding the Page") <
      body.textContent.indexOf("Second spine chapter"),
    "spine items should appear in reading order",
  );
  const secondImage = body.querySelector("#second + p + img");
  assert.ok(secondImage.getAttribute("src").startsWith("blob:"));
  const svgImage = body.querySelector("svg image");
  assert.ok(
    svgImage.getAttribute("xlink:href")?.startsWith("blob:"),
    "SVG xlink:href image should load from the EPUB archive",
  );
  assert.equal(body.querySelector("#second").hasAttribute("onclick"), false);
  assert.ok(
    !body.querySelector('script:not([type="application/json"])'),
    "book scripts must not enter the iframe",
  );
  assert.ok(
    !page.document.getElementById("chapter-nav"),
    "chapter buttons should be removed",
  );
  context.readerTest.state.book = null;
  context.readerTest.state.iwin = null;
  await context.readerTest.openBytes(
    fs.readFileSync("test/sample-origami.epub"),
    "sample.epub",
  );
  assert.notEqual(frame.style.visibility, "hidden");
  console.log("Multi-spine EPUB renders on one page in reading order.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
