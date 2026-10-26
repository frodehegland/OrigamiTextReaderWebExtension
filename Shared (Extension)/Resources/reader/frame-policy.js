/* Restrict the live book frame before any EPUB markup is parsed or inserted. */
(function () {
  "use strict";

  const policy = [
    "default-src 'none'",
    "script-src 'none'",
    "connect-src 'none'",
    "img-src blob:",
    "style-src 'unsafe-inline' blob:",
    "font-src blob:",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");

  function install(doc) {
    const meta = doc.createElement("meta");
    meta.httpEquiv = "Content-Security-Policy";
    meta.content = policy;
    doc.head.prepend(meta);
  }

  globalThis.OrigamiFramePolicy = { install };
})();
