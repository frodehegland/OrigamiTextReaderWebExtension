const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");

async function main() {
  const page = new JSDOM("<!doctype html><html><body></body></html>", {
    runScripts: "outside-only",
  });
  const { window } = page;
  window.Blob = Blob;
  const blobs = new Map();
  window.URL.createObjectURL = (blob) => {
    const url = `blob:book-${blobs.size + 1}`;
    blobs.set(url, blob);
    return url;
  };
  window.eval(fs.readFileSync("lib/fflate.min.js", "utf8"));
  window.eval(fs.readFileSync("lib/origami-epub.js", "utf8"));
  if (fs.existsSync("reader/epub-resources.js")) {
    window.eval(fs.readFileSync("reader/epub-resources.js", "utf8"));
  }
  assert.equal(typeof window.OrigamiEpubResources?.create, "function");

  const book = await window.OrigamiEPUB.open(
    fs.readFileSync("test/sample-origami.epub"),
  );
  book.files.set(
    "content/nested.css",
    new TextEncoder().encode('.nested { background: url("images/fold.png") }'),
  );
  book.manifest.localStylesheet = {
    path: "content/named-style",
    mediaType: "text/css; charset=utf-8",
  };
  book.files.set(
    "content/named-style",
    new TextEncoder().encode(".named { color: teal; }"),
  );
  const blobURLs = [];
  const resources = window.OrigamiEpubResources.create(book, blobURLs);

  const image = resources.image("content/paper.html", "images/fold.png");
  assert.match(image, /^blob:book-\d+$/);
  assert.equal(blobs.get(image).type, "image/png");
  assert.equal(
    resources.image("content/paper.html", "https://tracker.test/pixel"),
    null,
  );
  assert.equal(
    resources.image("content/paper.html", "//tracker.test/pixel"),
    null,
  );
  assert.equal(resources.image("content/paper.html", "missing.png"), null);

  const inline = resources.style(
    "content/paper.html",
    'background:url("images/fold.png");filter:url(#fold);border-image:url(https://tracker.test/pixel)',
  );
  assert.ok(inline.includes(`url("${image}")`));
  assert.ok(inline.includes("url(#fold)"));
  assert.equal(inline.includes("tracker.test"), false);

  const css = resources.css(
    "content/style.css",
    '@import "nested.css" screen; @import "https://tracker.test/evil.css"; .cover { background: url(images/fold.png) }',
  );
  const importedURL = css.match(
    /@import url\("(blob:book-\d+)"\) screen;/,
  )?.[1];
  assert.ok(importedURL, "packaged CSS import must become a blob URL");
  assert.equal(css.includes("tracker.test"), false);
  assert.ok(css.includes(`url("${image}")`));
  assert.ok((await blobs.get(importedURL).text()).includes(`url("${image}")`));

  const literalCss =
    '.quote::before { content: "url(foo) @import \'other.css\';"; } /* url(https://tracker.test/comment) @import "other.css"; */ .real { background: url(images/fold.png) }';
  const preserved = resources.css("content/style.css", literalCss);
  assert.ok(
    preserved.includes("content: \"url(foo) @import 'other.css';\""),
    "CSS string literals must not be rewritten",
  );
  assert.ok(
    preserved.includes(
      '/* url(https://tracker.test/comment) @import "other.css"; */',
    ),
    "CSS comments must not be rewritten",
  );
  assert.ok(preserved.includes(`background: url("${image}")`));

  const importedByType = resources.css(
    "content/style.css",
    '@import "named-style";',
  );
  assert.match(importedByType, /@import url\("blob:book-\d+"\);/);

  book.files.set("content/a.css", new TextEncoder().encode('@import "b.css";'));
  book.files.set("content/b.css", new TextEncoder().encode('@import "a.css";'));
  assert.doesNotThrow(() =>
    resources.css("content/a.css", book.text("content/a.css")),
  );
  assert.equal(new Set(blobURLs).size, blobURLs.length, "reuse archive blobs");

  window.close();
  console.log("CSS and images resolve only to packaged EPUB resources.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
