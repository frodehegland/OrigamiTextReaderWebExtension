const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");

async function main() {
  const page = new JSDOM(fs.readFileSync("reader/reader.html", "utf8"), {
    runScripts: "outside-only",
    url: "https://reader.example/",
  });
  const { window } = page;
  window.matchMedia = () => ({ matches: false });
  window.URL.createObjectURL = () => "blob:book-image";
  window.URL.revokeObjectURL = () => {};
  window.OrigamiLibrary = {};

  for (const script of [
    "lib/fflate.min.js",
    "lib/origami-epub.js",
    "lib/purify.min.js",
    "reader/epub-sanitizer.js",
  ]) {
    window.eval(fs.readFileSync(script, "utf8"));
  }

  const book = await window.OrigamiEPUB.open(
    fs.readFileSync("test/sample-origami.epub"),
  );
  const firstPath = "content/chapter1.xhtml";
  const secondPath = "content/chapter2.xhtml";
  book.files.set(
    firstPath,
    new TextEncoder().encode(
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><h2 id="c1">Chapter 1</h2><p id="same">First match</p></body></html>',
    ),
  );
  book.files.set(
    secondPath,
    new TextEncoder().encode(
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><h2 id="c2">Chapter 2</h2><p id="same">Second match</p></body></html>',
    ),
  );
  book.spine = [firstPath, secondPath].map((path, index) => ({
    id: `chapter-${index + 1}`,
    href: path.split("/").pop(),
    path,
    mediaType: "application/xhtml+xml",
    properties: [],
  }));
  book.toc = window.OrigamiEPUB.parseNav(
    '<html xmlns="http://www.w3.org/1999/xhtml"><body><nav><ol><li><a href="chapter2.xhtml">Chapter 2 start</a></li><li><a href="chapter2.xhtml#c2">Chapter 2 heading</a></li><li><a href="chapter2.xhtml#same">Chapter 2 duplicate ID</a></li></ol></nav></body></html>',
    "content/nav.xhtml",
  );

  const frame = window.document.getElementById("frame");
  let scrolledTo = null;
  frame.contentWindow.scrollTo = () => {
    scrolledTo = "top of book";
  };
  frame.contentWindow.HTMLElement.prototype.scrollIntoView = function () {
    scrolledTo = this;
  };

  const readerSource = fs.readFileSync("reader/reader.js", "utf8");
  const bootAt = readerSource.indexOf("  boot().catch(");
  assert.ok(bootAt > 0);
  window.eval(
    readerSource.slice(0, bootAt) +
      "  globalThis.readerTest = { renderBook, state };\n})();",
  );
  window.readerTest.state.book = book;
  window.readerTest.renderBook();

  const doc = frame.contentDocument;
  const links = Array.from(window.document.querySelectorAll("#toc a"));
  assert.equal(doc.getElementById("c2").parentNode, doc.body);

  links[0].click();
  assert.equal(
    scrolledTo,
    doc.getElementById("c2"),
    "path-only TOC entry should open its spine",
  );

  scrolledTo = null;
  links[1].click();
  assert.equal(
    scrolledTo,
    doc.getElementById("c2"),
    "fragment should open the second spine",
  );

  scrolledTo = null;
  links[2].click();
  assert.equal(
    scrolledTo,
    doc.querySelectorAll('[id="same"]')[1],
    "duplicate ID should resolve inside the linked spine",
  );

  window.close();
  console.log("TOC navigation respects the spine path without DOM wrappers.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
