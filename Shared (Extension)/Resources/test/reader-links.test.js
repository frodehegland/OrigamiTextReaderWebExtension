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
    "reader/frame-policy.js",
    "reader/epub-resources.js",
  ]) {
    window.eval(fs.readFileSync(script, "utf8"));
  }

  const book = await window.OrigamiEPUB.open(
    fs.readFileSync("test/sample-origami.epub"),
  );
  const firstPath = "content/chapters/chapter1.xhtml";
  const secondPath = "content/chapter2.xhtml";
  book.files.set(
    firstPath,
    new TextEncoder().encode(
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><main><h2>First chapter</h2><p id="same">First match</p><a id="to-second-id" href="../chapter2.xhtml#same">Second ID</a><a id="to-second-start" href="../chapter2.xhtml">Second start</a></main></body></html>',
    ),
  );
  book.files.set(
    secondPath,
    new TextEncoder().encode(
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><main><h2>Second chapter</h2><p id="same">Second match</p><a id="to-own-id" href="#same">Own ID</a></main></body></html>',
    ),
  );
  book.spine = [firstPath, secondPath].map((path, index) => ({
    id: `chapter-${index + 1}`,
    href: path.split("/").pop(),
    path,
    mediaType: "application/xhtml+xml",
    properties: [],
  }));

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
  const matches = doc.querySelectorAll('[id="same"]');
  const secondRoot = doc.querySelectorAll("main")[1];
  assert.equal(secondRoot.parentNode, doc.body);

  function click(id) {
    scrolledTo = null;
    const event = new frame.contentWindow.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    doc.getElementById(id).dispatchEvent(event);
    assert.equal(
      event.defaultPrevented,
      true,
      "book links must not navigate the frame",
    );
    return scrolledTo;
  }

  assert.equal(
    click("to-second-id"),
    matches[1],
    "relative link must use its target spine",
  );
  assert.equal(
    click("to-second-start"),
    secondRoot,
    "path-only link must open the target spine",
  );
  assert.equal(
    click("to-own-id"),
    matches[1],
    "fragment-only link must stay in its source spine",
  );

  window.close();
  console.log(
    "In-book links navigate by spine path without reloading the frame.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
