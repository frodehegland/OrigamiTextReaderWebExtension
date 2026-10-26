/* The only boundary between EPUB markup and the live reader document. */
(function () {
  "use strict";

  const allowedTags = [
    "html",
    "head",
    "body",
    "article",
    "aside",
    "section",
    "main",
    "nav",
    "header",
    "footer",
    "div",
    "span",
    "p",
    "br",
    "hr",
    "blockquote",
    "pre",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "a",
    "em",
    "strong",
    "b",
    "i",
    "u",
    "s",
    "small",
    "sup",
    "sub",
    "code",
    "cite",
    "q",
    "abbr",
    "dfn",
    "time",
    "mark",
    "ol",
    "ul",
    "li",
    "dl",
    "dt",
    "dd",
    "table",
    "caption",
    "colgroup",
    "col",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
    "figure",
    "figcaption",
    "img",
    "svg",
    "g",
    "defs",
    "image",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "text",
    "tspan",
  ];

  const allowedAttributes = [
    "id",
    "class",
    "title",
    "lang",
    "dir",
    "role",
    "hidden",
    "style",
    "href",
    "src",
    "alt",
    "width",
    "height",
    "colspan",
    "rowspan",
    "scope",
    "datetime",
    "cite",
    "aria-controls",
    "aria-describedby",
    "aria-expanded",
    "aria-hidden",
    "aria-label",
    "aria-labelledby",
    "data-id",
    "data-concept",
    "data-citation-id",
    "data-origami-ref",
    "data-bibtex",
    "data-csl-json",
    "xmlns",
    "xmlns:xlink",
    "viewBox",
    "preserveAspectRatio",
    "x",
    "y",
    "x1",
    "y1",
    "x2",
    "y2",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "d",
    "points",
    "fill",
    "stroke",
    "stroke-width",
    "transform",
    "xlink:href",
  ];

  function sanitizeDocument(source) {
    const purifier = globalThis.DOMPurify;
    if (!purifier || typeof purifier.sanitize !== "function") {
      throw new Error("DOMPurify is required to open EPUB content");
    }

    const payload = source.getElementById("visual-meta-payload");
    if (payload && payload.localName.toLowerCase() === "script") {
      const text = source.createElement("pre");
      text.id = "visual-meta-payload";
      text.textContent = payload.textContent;
      payload.replaceWith(text);
    }

    const walker = source.createTreeWalker(
      source,
      NodeFilter.SHOW_CDATA_SECTION,
    );
    const cdataNodes = [];
    while (walker.nextNode()) cdataNodes.push(walker.currentNode);
    for (const node of cdataNodes) {
      node.replaceWith(source.createTextNode(node.nodeValue));
    }

    const cleanRoot = purifier.sanitize(source.documentElement.outerHTML, {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: allowedAttributes,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      WHOLE_DOCUMENT: true,
      RETURN_DOM: true,
    });
    if (cleanRoot.ownerDocument?.documentElement !== cleanRoot) {
      throw new Error("DOMPurify did not return a sanitized document");
    }
    return cleanRoot.ownerDocument;
  }

  globalThis.OrigamiEpubSanitizer = { sanitizeDocument };
})();
