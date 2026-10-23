const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");

const page = new JSDOM(
  "<!doctype html><html><body><iframe></iframe></body></html>",
  {
    runScripts: "outside-only",
    url: "https://reader.example/",
  },
);
const { window } = page;
if (fs.existsSync("reader/frame-policy.js")) {
  window.eval(fs.readFileSync("reader/frame-policy.js", "utf8"));
}
assert.equal(typeof window.OrigamiFramePolicy?.install, "function");
const frameDocument = window.document.querySelector("iframe").contentDocument;
window.OrigamiFramePolicy.install(frameDocument);

const policy = frameDocument.head.firstElementChild;
assert.equal(policy.httpEquiv, "Content-Security-Policy");
assert.match(policy.content, /default-src 'none'/);
assert.match(policy.content, /connect-src 'none'/);
assert.match(policy.content, /script-src 'none'/);
assert.match(policy.content, /img-src blob:/);
assert.match(policy.content, /style-src 'unsafe-inline' blob:/);

window.close();
console.log("Book frame policy is installed before untrusted content.");
