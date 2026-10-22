const fs = require("fs");
const vm = require("vm");
const { DOMParser } = require("linkedom");
const fflate = require("fflate");
const ctx = {
  fflate,
  DOMParser,
  TextDecoder,
  TextEncoder,
  crypto: globalThis.crypto,
  console,
};
ctx.globalThis = ctx;
ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("lib/origami-epub.js", "utf8"), ctx);
const O = ctx.OrigamiEPUB;
(async () => {
  const book = await O.open(fs.readFileSync("test/sample-origami.epub"));
  console.log(
    "opf",
    book.opfPath,
    "| content",
    book.contentItem.path,
    "| nav",
    book.navItem && book.navItem.path,
  );
  console.log(
    "title",
    book.title,
    "| authors",
    book.authors,
    "| date",
    book.date,
  );
  console.log(
    "identifier",
    book.identifier,
    "| origami-id",
    book.origamiId,
    "| vm from",
    book.visualMetaSource,
    "| origami?",
    book.isOrigami,
  );
  console.log(
    "toc",
    book.toc.map((t) => t.text + "→" + t.fragment),
  );
  console.log(
    "css",
    book.cssItems.map((c) => c.path),
    "| warnings",
    book.warnings,
  );
  // embedded copy must equal package copy
  const emb = O.extractEmbeddedVisualMeta(book.contentText);
  console.log(
    "embedded == package",
    JSON.stringify(emb) === JSON.stringify(book.visualMeta),
  );
  console.log(
    "derived id matches",
    (await O.identifierFromOrigamiId(book.origamiId)) === book.identifier,
  );
  console.log(
    O.parseOrigamiLink("origamitext://open/f.hegla.093252x?q=stable%20id#2B"),
  );
  console.log(
    O.parseOrigamiLink("https://origamitext.app/o/f.hegla.093252x#p3"),
  );
  console.log(
    O.buildOrigamiLink("f.hegla.093252x", {
      quote: "two identities",
      fragment: "2B",
      carrier: true,
    }),
  );
  console.log(O.parseBibTeX(book.visualMeta.citations[0].bibtex));
  console.log(
    "img resolve",
    book.resolve(book.contentItem.path, "images/fold.png"),
    book.has(book.resolve(book.contentItem.path, "images/fold.png")),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
