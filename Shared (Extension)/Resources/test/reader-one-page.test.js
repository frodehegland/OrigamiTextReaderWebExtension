const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");

async function main() {
  const page = new JSDOM(fs.readFileSync("reader/reader.html", "utf8"), {
    runScripts: "outside-only",
    url: "https://reader.example/",
  });
  const { window } = page;
  const frame = window.document.getElementById("frame");
  frame.contentWindow.scrollTo = () => {
    assert.equal(
      frame.style.visibility,
      "hidden",
      "hide the page until restored",
    );
  };
  window.URL.createObjectURL = () => "blob:book-image";
  window.URL.revokeObjectURL = () => {};
  window.OrigamiLibrary = {
    async save() {},
    async setPrefs() {},
    async getPosition() {
      return null;
    },
  };
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
  const firstPath = book.spine[0].path;
  const firstContent = book
    .text(firstPath)
    .replace(
      "<html xmlns=",
      '<html dir="rtl" class="book-root" onload="alert(1)" xmlns=',
    )
    .replace(
      "<body>",
      '<body lang="ar" onclick="alert(1)" data-book-body="first">',
    );
  book.files.set(firstPath, new TextEncoder().encode(firstContent));

  const secondPath = "content/chapters/second.xhtml";
  book.files.set(
    "content/chapters/second.css",
    new TextEncoder().encode(
      '@import "nested.css"; .second-chapter { color: rebeccapurple; background-image: url("../images/fold.png"); }',
    ),
  );
  book.files.set(
    "content/chapters/nested.css",
    new TextEncoder().encode(".nested { color: teal; }"),
  );
  book.files.set(
    secondPath,
    new TextEncoder().encode(
      '<html xmlns="http://www.w3.org/1999/xhtml"><head><link rel="stylesheet" href="second.css"/><style media="print">#second { display: none; } .inline { background: url("../images/fold.png"); }</style></head><body><h2 id="second" class="second-chapter" style="background-image: url(../images/fold.png)" onclick="alert(1)">Second spine chapter</h2><p>End of whole book</p><a id="encoded" href="java&#x09;script:alert(1)">Bad link</a><a id="internal" href="#second" data-citation-id="ref-1">Good link</a><img src="../images/fold.png"/><img id="remote" src="https://evil.example/pixel"/><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="../images/fold.png"/><image id="dual" href="https://evil.example/cover" xlink:href="../images/fold.png"/></svg><script>alert(1)</script></body></html>',
    ),
  );
  book.spine.push({
    id: "second",
    href: "second.xhtml",
    path: secondPath,
    mediaType: "application/xhtml+xml",
    properties: [],
  });

  const fallbackPath = "content/chapters/fallback.xhtml";
  const fallbackMarkup = [
    '<html><head><meta http-equiv="refresh" content="3;url=https://evil.example"/><base href="https://evil.example/"/></head>',
    '<body><section id="html-fallback"><p>Malformed HTML</section>',
    '<a id="fallback-link" href="java&#x09;script:alert(1)">Bad link</a>',
    '<a id="network-path" href="//evil.example/phish">Network link</a>',
    '<a id="package-path" href="chapter.xhtml">Package link</a>',
    '<form action="https://evil.example/"><button>Submit</button></form></body></html>',
  ].join("");
  book.files.set(fallbackPath, new TextEncoder().encode(fallbackMarkup));
  book.spine.push({
    id: "fallback",
    href: "fallback.xhtml",
    path: fallbackPath,
    mediaType: "application/xhtml+xml",
    properties: [],
  });

  const readerSource = fs.readFileSync("reader/reader.js", "utf8");
  const bootAt = readerSource.indexOf("  boot().catch(");
  assert.ok(bootAt > 0, "reader test could not locate boot call");
  const readerWithoutBoot =
    readerSource.slice(0, bootAt) +
    "  globalThis.readerTest = { renderBook, openBytes, state, toggleSide };\n})();";
  window.eval(readerWithoutBoot);
  window.readerTest.state.book = book;
  window.readerTest.state.prefs.bookCSS = false;
  window.readerTest.renderBook();

  const body = frame.contentDocument.body;
  assert.equal(
    frame.contentDocument.documentElement.getAttribute("dir"),
    "rtl",
  );
  assert.equal(
    frame.contentDocument.documentElement.getAttribute("class"),
    "book-root",
  );
  assert.equal(
    frame.contentDocument.documentElement.hasAttribute("onload"),
    false,
  );
  assert.equal(body.getAttribute("lang"), "ar");
  assert.equal(body.hasAttribute("onclick"), false);
  assert.equal(body.hasAttribute("data-book-body"), false);
  const secondBookStyle = Array.from(
    frame.contentDocument.querySelectorAll("style.ot-book-css"),
  ).find((style) => style.textContent.includes(".second-chapter"));
  assert.ok(secondBookStyle, "the second spine stylesheet should be loaded");
  assert.ok(
    secondBookStyle.textContent.trim().startsWith('@import url("blob:'),
    "each linked stylesheet must keep its imports before its own rules",
  );
  assert.match(
    secondBookStyle.textContent,
    /@import url\("blob:/,
    "nested packaged CSS should be kept locally",
  );
  assert.match(
    secondBookStyle.textContent,
    /background-image: url\("blob:/,
    "CSS image should use a packaged blob",
  );
  assert.ok(
    frame.contentDocument.head.querySelector('style[media="print"]'),
    "inline style media should be preserved",
  );
  assert.match(
    frame.contentDocument.head.querySelector('style[media="print"]')
      .textContent,
    /background: url\("blob:/,
  );
  assert.match(
    body.querySelector("#second").getAttribute("style"),
    /url\("blob:/,
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
  assert.ok(body.textContent.includes("Malformed HTML"));
  assert.equal(frame.contentDocument.querySelector("base, form"), null);
  assert.equal(
    frame.contentDocument.querySelector('meta[http-equiv="refresh"]'),
    null,
  );
  assert.ok(
    book.warnings.some((warning) => warning.includes("parsed as HTML")),
    "malformed XHTML should use the HTML parser fallback",
  );
  assert.equal(
    body.querySelector("#fallback-link").hasAttribute("href"),
    false,
  );
  for (const id of ["network-path", "package-path"]) {
    const event = new frame.contentWindow.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    body.querySelector(`#${id}`).dispatchEvent(event);
    assert.equal(
      event.defaultPrevented,
      true,
      `${id} must not navigate the frame`,
    );
  }
  assert.ok(
    body.querySelector("#second").parentNode === body,
    "spine content should be appended without an extra wrapper",
  );
  assert.ok(
    body.textContent.indexOf("Folding the Page") <
      body.textContent.indexOf("Second spine chapter"),
    "spine items should appear in reading order",
  );
  const secondImage = body.querySelector("#second ~ img:not(#remote)");
  assert.ok(secondImage.getAttribute("src").startsWith("blob:"));
  const svgImage = body.querySelector("svg image");
  assert.ok(
    svgImage.getAttribute("xlink:href")?.startsWith("blob:"),
    "SVG xlink:href image should load from the EPUB archive",
  );
  const dualImage = body.querySelector("#dual");
  assert.equal(dualImage.hasAttribute("href"), false);
  assert.equal(dualImage.hasAttribute("xlink:href"), false);
  assert.equal(body.querySelector("#second").hasAttribute("onclick"), false);
  assert.equal(body.querySelector("#encoded").hasAttribute("href"), false);
  assert.equal(body.querySelector("#internal").getAttribute("href"), "#second");
  assert.equal(
    body.querySelector("#internal").getAttribute("data-citation-id"),
    "ref-1",
  );
  assert.equal(body.querySelector("#remote").hasAttribute("src"), false);
  assert.equal(body.querySelector("script"), null);
  assert.equal(body.querySelector("#visual-meta-payload").localName, "pre");
  assert.ok(
    !window.document.getElementById("chapter-nav"),
    "chapter buttons should be removed",
  );
  const rootStyle = frame.contentDocument.documentElement.style;
  const setProperty = rootStyle.setProperty.bind(rootStyle);
  let frameThemeWrites = 0;
  rootStyle.setProperty = (...args) => {
    frameThemeWrites += 1;
    return setProperty(...args);
  };
  window.readerTest.toggleSide();
  assert.equal(window.document.body.dataset.side, "closed");
  assert.equal(
    window.document.getElementById("btn-sidebar").getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(
    window.document.getElementById("side").inert,
    true,
    "closed overlay must not receive pointer or keyboard interaction",
  );
  assert.equal(
    frameThemeWrites,
    0,
    "sidebar toggle must not reapply styles to the book frame",
  );
  window.readerTest.state.book = null;
  window.readerTest.state.iwin = null;
  await window.readerTest.openBytes(
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
