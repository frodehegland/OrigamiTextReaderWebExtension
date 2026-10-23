const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");

const page = new JSDOM("<!doctype html><html><body></body></html>", {
  runScripts: "outside-only",
});
const { window } = page;
if (fs.existsSync("lib/purify.min.js")) {
  window.eval(fs.readFileSync("lib/purify.min.js", "utf8"));
}
if (fs.existsSync("reader/epub-sanitizer.js")) {
  window.eval(fs.readFileSync("reader/epub-sanitizer.js", "utf8"));
}
assert.equal(
  typeof window.OrigamiEpubSanitizer?.sanitizeDocument,
  "function",
  "EPUB sanitizer must be available",
);

function clean(markup, type = "application/xhtml+xml") {
  const source = new window.DOMParser().parseFromString(markup, type);
  return window.OrigamiEpubSanitizer.sanitizeDocument(source);
}

const document = clean(
  '<html xmlns="http://www.w3.org/1999/xhtml" dir="rtl" class="book-root" onload="alert(1)"><body lang="ar" onclick="alert(1)" data-evil="yes"><h1 id="chapter" style="color: red">Chapter</h1><a id="safe" href="#chapter" data-citation-id="ref-1">Go</a><a id="encoded" href="java&#x09;script:alert(1)">Bad</a><a id="direct" href="javascript:alert(1)">Bad</a><dfn data-concept="Fold">Fold</dfn><script>alert(1)</script><iframe src="https://example.com/"></iframe></body></html>',
);

assert.equal(document.documentElement.getAttribute("dir"), "rtl");
assert.equal(document.documentElement.getAttribute("class"), "book-root");
assert.equal(document.documentElement.hasAttribute("onload"), false);
assert.equal(document.body.getAttribute("lang"), "ar");
assert.equal(document.body.hasAttribute("onclick"), false);
assert.equal(document.body.hasAttribute("data-evil"), false);
assert.equal(
  document.querySelector("#chapter").getAttribute("style"),
  "color: red",
);
assert.equal(document.querySelector("#safe").getAttribute("href"), "#chapter");
assert.equal(
  document.querySelector("#safe").getAttribute("data-citation-id"),
  "ref-1",
);
assert.equal(
  document.querySelector("dfn").getAttribute("data-concept"),
  "Fold",
);
assert.equal(document.querySelector("#encoded").hasAttribute("href"), false);
assert.equal(document.querySelector("#direct").hasAttribute("href"), false);
assert.equal(document.querySelector("script"), null);
assert.equal(document.querySelector("iframe"), null);

const navigationMarkup =
  '<html xmlns="http://www.w3.org/1999/xhtml"><head><meta http-equiv="refresh" content="3;url=https://evil.example"/><base href="https://evil.example/"/></head><body><form action="https://evil.example/"><button>Submit</button></form><p id="book-text">Keep reading</p></body></html>';
for (const type of ["application/xhtml+xml", "text/html"]) {
  const safeBook = clean(navigationMarkup, type);
  assert.equal(safeBook.querySelector("meta"), null);
  assert.equal(safeBook.querySelector("base"), null);
  assert.equal(safeBook.querySelector("form"), null);
  assert.equal(
    safeBook.querySelector("#book-text").textContent,
    "Keep reading",
  );
}

const accessible = clean(
  '<html xmlns="http://www.w3.org/1999/xhtml"><body><section aria-labelledby="chapter-title" aria-describedby="chapter-summary"><h2 id="chapter-title">Chapter</h2><p id="chapter-summary">Summary</p></section></body></html>',
);
const section = accessible.querySelector("section");
assert.equal(section.getAttribute("aria-labelledby"), "chapter-title");
assert.equal(section.getAttribute("aria-describedby"), "chapter-summary");

const svg = clean(
  '<html xmlns="http://www.w3.org/1999/xhtml"><body><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100"><image xlink:href="../images/cover.jpg" width="100" height="100"/></svg></body></html>',
);
assert.equal(
  svg.querySelector("svg image").getAttribute("xlink:href"),
  "../images/cover.jpg",
);

const visualMeta = clean(
  '<html xmlns="http://www.w3.org/1999/xhtml"><body><section id="visual-meta"><script id="visual-meta-payload" type="application/json"><![CDATA[{"visual-meta":{"title":"Safe"}}]]></script></section></body></html>',
);
assert.equal(visualMeta.querySelector("script"), null);
assert.equal(
  visualMeta.querySelector("#visual-meta-payload").textContent,
  '{"visual-meta":{"title":"Safe"}}',
);

const htmlFallback = clean(
  '<html><body><p id="fallback">Plain <strong>HTML</strong></p><img src="javascript:alert(1)" onerror="alert(1)"></body></html>',
  "text/html",
);
assert.equal(htmlFallback.querySelector("#fallback").textContent, "Plain HTML");
assert.equal(htmlFallback.querySelector("img").hasAttribute("src"), false);
assert.equal(htmlFallback.querySelector("img").hasAttribute("onerror"), false);

console.log(
  "EPUB HTML sanitizer rejects executable markup and retains book content.",
);
