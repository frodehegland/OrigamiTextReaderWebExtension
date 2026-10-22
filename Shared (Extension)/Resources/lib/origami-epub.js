/* Origami Text EPUB — package reader.
 *
 * Opens any EPUB 3 (unzip → container.xml → OPF → spine) and, when the
 * package has the Origami shape, extracts the Visual-Meta payload.
 * Spec: "The Origami Text EPUB — Full Specification" v1.0 (4 Sept 2026).
 *
 * Classic script: exposes `OrigamiEPUB` on the global. Needs `fflate`,
 * `DOMParser` and `TextDecoder` on the global (browser, or a test shim).
 */
(function (root) {
  "use strict";

  const utf8 = new TextDecoder("utf-8");
  const OPF_NS = "http://www.idpf.org/2007/opf";
  const DC_NS = "http://purl.org/dc/elements/1.1/";
  const CONTAINER_NS = "urn:oasis:names:tc:opendocument:xmlns:container";

  // ---------- path helpers ----------

  function normalizePath(p) {
    const out = [];
    for (const seg of p.split("/")) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") out.pop();
      else out.push(seg);
    }
    return out.join("/");
  }

  function dirOf(p) {
    const i = p.lastIndexOf("/");
    return i < 0 ? "" : p.slice(0, i + 1);
  }

  /** Resolve `href` (possibly with ?query#frag) against the directory of `fromPath`. */
  function resolve(fromPath, href) {
    const clean = href.split("#")[0].split("?")[0];
    let decoded = clean;
    try {
      decoded = decodeURIComponent(clean);
    } catch (_) {
      /* keep raw */
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) return null; // absolute URL, not in package
    if (decoded.startsWith("/")) return normalizePath(decoded);
    return normalizePath(dirOf(fromPath) + decoded);
  }

  function parseXML(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const err = doc.getElementsByTagName("parsererror")[0];
    if (err)
      throw new Error(
        "XML parse error: " + (err.textContent || "").slice(0, 200),
      );
    return doc;
  }

  function byTagNS(node, ns, name) {
    let list = node.getElementsByTagNameNS
      ? node.getElementsByTagNameNS(ns, name)
      : [];
    if (!list || list.length === 0) list = node.getElementsByTagName(name);
    return Array.from(list);
  }

  function textOf(el) {
    return el ? (el.textContent || "").trim() : "";
  }

  // ---------- Visual-Meta extraction ----------

  /** End-anchored extraction from raw XHTML text (spec §8.1). */
  function extractEmbeddedVisualMeta(xhtmlText) {
    if (!xhtmlText) return null;
    const endIdx = xhtmlText.lastIndexOf("@visual-meta-end");
    if (endIdx < 0) return null;
    const startIdx = xhtmlText.lastIndexOf("@visual-meta-start", endIdx);
    if (startIdx < 0) return null;
    const between = xhtmlText.slice(startIdx, endIdx);
    const scriptOpen = between.indexOf("<script");
    if (scriptOpen < 0) return null;
    const bodyStart = between.indexOf(">", scriptOpen);
    const bodyEnd = between.lastIndexOf("</script>");
    if (bodyStart < 0 || bodyEnd < 0) return null;
    let raw = between.slice(bodyStart + 1, bodyEnd);
    // Concatenate CDATA runs (a literal ]]> was split as ]]]]><![CDATA[>).
    raw = raw.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "");
    try {
      return JSON.parse(raw.trim());
    } catch (_) {
      return null;
    }
  }

  /** From a parsed content document: `#visual-meta-payload` text content. */
  function extractVisualMetaFromDOM(doc) {
    const el =
      doc && doc.getElementById
        ? doc.getElementById("visual-meta-payload")
        : null;
    if (!el) return null;
    try {
      return JSON.parse((el.textContent || "").trim());
    } catch (_) {
      return null;
    }
  }

  // ---------- Navigation document ----------

  function parseNav(navText, navPath) {
    let doc;
    try {
      doc = parseXML(navText);
    } catch (_) {
      doc = new DOMParser().parseFromString(navText, "text/html");
    }
    const navs = Array.from(doc.getElementsByTagName("nav"));
    let toc =
      navs.find((n) =>
        (
          n.getAttribute("epub:type") ||
          (n.getAttributeNS &&
            n.getAttributeNS("http://www.idpf.org/2007/ops", "type")) ||
          ""
        ).includes("toc"),
      ) ||
      navs.find((n) => (n.getAttribute("role") || "") === "doc-toc") ||
      navs[0];
    if (!toc) return [];
    const topList =
      Array.from(toc.children || []).find((c) => /^ol$/i.test(c.tagName)) ||
      toc.getElementsByTagName("ol")[0];
    if (!topList) return [];

    function walkList(ol) {
      const items = [];
      for (const li of Array.from(ol.children || [])) {
        if (!/^li$/i.test(li.tagName)) continue;
        const a =
          Array.from(li.children || []).find((c) => /^a$/i.test(c.tagName)) ||
          li.getElementsByTagName("a")[0];
        const span = Array.from(li.children || []).find((c) =>
          /^span$/i.test(c.tagName),
        );
        const href = a ? a.getAttribute("href") || "" : "";
        const entry = {
          text: textOf(a || span || li),
          href,
          path: href ? resolve(navPath, href) : null,
          fragment: href.includes("#")
            ? decodeURIComponent(href.split("#")[1])
            : null,
          children: [],
        };
        const sub = Array.from(li.children || []).find((c) =>
          /^ol$/i.test(c.tagName),
        );
        if (sub) entry.children = walkList(sub);
        items.push(entry);
      }
      return items;
    }
    return walkList(topList);
  }

  // ---------- Package (OPF) ----------

  function parseOPF(opfText, opfPath) {
    const doc = parseXML(opfText);
    const pkg = doc.documentElement;
    const uniqueId = pkg.getAttribute("unique-identifier");
    const metadataEl = byTagNS(pkg, OPF_NS, "metadata")[0] || pkg;

    const metadata = {
      title: "",
      creator: [],
      identifier: "",
      language: "",
      date: "",
      modified: "",
      meta: {},
    };
    for (const el of byTagNS(metadataEl, DC_NS, "title")) {
      if (!metadata.title) metadata.title = textOf(el);
    }
    for (const el of byTagNS(metadataEl, DC_NS, "creator"))
      metadata.creator.push(textOf(el));
    const ids = byTagNS(metadataEl, DC_NS, "identifier");
    const pubId = ids.find((e) => e.getAttribute("id") === uniqueId) || ids[0];
    metadata.identifier = textOf(pubId);
    metadata.language = textOf(byTagNS(metadataEl, DC_NS, "language")[0]);
    metadata.date = textOf(byTagNS(metadataEl, DC_NS, "date")[0]);
    for (const m of byTagNS(metadataEl, OPF_NS, "meta")) {
      const prop = m.getAttribute("property");
      if (!prop) continue;
      (metadata.meta[prop] = metadata.meta[prop] || []).push(textOf(m));
    }
    metadata.modified = (metadata.meta["dcterms:modified"] || [""])[0];

    const manifest = {};
    const manifestEl = byTagNS(pkg, OPF_NS, "manifest")[0];
    for (const item of manifestEl ? byTagNS(manifestEl, OPF_NS, "item") : []) {
      const id = item.getAttribute("id");
      const href = item.getAttribute("href") || "";
      manifest[id] = {
        id,
        href,
        path: resolve(opfPath, href),
        mediaType: item.getAttribute("media-type") || "",
        properties: (item.getAttribute("properties") || "")
          .split(/\s+/)
          .filter(Boolean),
      };
    }

    const spine = [];
    const spineEl = byTagNS(pkg, OPF_NS, "spine")[0];
    for (const ref of spineEl ? byTagNS(spineEl, OPF_NS, "itemref") : []) {
      const item = manifest[ref.getAttribute("idref")];
      if (item && item.path) spine.push(item);
    }
    return { metadata, manifest, spine };
  }

  // ---------- Book ----------

  class Book {
    constructor(files) {
      this.files = files; // Map<path, Uint8Array>
      this.opfPath = null;
      this.metadata = null;
      this.manifest = {};
      this.spine = [];
      this.contentItem = null; // the (first) spine item
      this.navItem = null;
      this.cssItems = [];
      this.visualMeta = null;
      this.visualMetaSource = null; // 'package' | 'embedded' | null
      this.toc = [];
      this.isOrigami = false;
      this.warnings = [];
    }

    has(path) {
      return this.files.has(path);
    }
    bytes(path) {
      return this.files.get(path) || null;
    }
    text(path) {
      const b = this.bytes(path);
      return b ? utf8.decode(b) : null;
    }

    /** Resolve an href relative to a package path; returns a package path or null. */
    resolve(fromPath, href) {
      return resolve(fromPath, href);
    }

    get contentText() {
      return this.contentItem ? this.text(this.contentItem.path) : null;
    }
    get title() {
      return (
        (this.visualMeta &&
          this.visualMeta.document &&
          this.visualMeta.document.title) ||
        (this.metadata && this.metadata.title) ||
        "Untitled"
      );
    }
    get identifier() {
      return (
        (this.metadata && this.metadata.identifier) ||
        (this.visualMeta &&
          this.visualMeta.document &&
          this.visualMeta.document.identifier) ||
        ""
      );
    }
    get origamiId() {
      return (
        (this.visualMeta &&
          this.visualMeta.document &&
          this.visualMeta.document["origami-id"]) ||
        ""
      );
    }
    get authors() {
      const vm =
        this.visualMeta &&
        this.visualMeta.document &&
        this.visualMeta.document.authors;
      if (Array.isArray(vm) && vm.length) return vm.slice();
      return this.metadata ? this.metadata.creator.slice() : [];
    }
    get date() {
      return (
        (this.visualMeta &&
          this.visualMeta.document &&
          this.visualMeta.document.date) ||
        (this.metadata && this.metadata.date) ||
        ""
      );
    }
  }

  async function open(input) {
    const data = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b) {
      throw new Error("Not a ZIP/EPUB file (missing PK signature).");
    }
    const entries = root.fflate.unzipSync(data);
    const files = new Map();
    for (const [name, bytes] of Object.entries(entries)) {
      if (name.endsWith("/")) continue;
      files.set(normalizePath(name), bytes);
    }
    const book = new Book(files);

    const mimetype = book.text("mimetype");
    if (mimetype && mimetype.trim() !== "application/epub+zip") {
      book.warnings.push(
        'mimetype entry is "' +
          mimetype.trim() +
          '", expected application/epub+zip',
      );
    } else if (!mimetype) {
      book.warnings.push("mimetype entry missing");
    }

    // container.xml → OPF path (never assume package.opf)
    const containerText = book.text("META-INF/container.xml");
    if (containerText) {
      try {
        const cdoc = parseXML(containerText);
        const rf = byTagNS(cdoc, CONTAINER_NS, "rootfile")[0];
        if (rf)
          book.opfPath = normalizePath(rf.getAttribute("full-path") || "");
      } catch (e) {
        book.warnings.push("container.xml unreadable: " + e.message);
      }
    }
    if (!book.opfPath || !book.has(book.opfPath)) {
      const guess = Array.from(files.keys()).find((p) =>
        p.toLowerCase().endsWith(".opf"),
      );
      if (!guess)
        throw new Error("No package document (.opf) found in this EPUB.");
      book.warnings.push("container.xml missing or wrong; using " + guess);
      book.opfPath = guess;
    }

    const opf = parseOPF(book.text(book.opfPath), book.opfPath);
    book.metadata = opf.metadata;
    book.manifest = opf.manifest;
    book.spine = opf.spine;
    book.contentItem = opf.spine[0] || null;
    if (!book.contentItem)
      throw new Error("The spine is empty — nothing to read.");

    const items = Object.values(book.manifest);
    book.navItem = items.find((i) => i.properties.includes("nav")) || null;
    book.cssItems = items.filter((i) => i.mediaType === "text/css");

    // Visual-Meta: package copy first, embedded copy second.
    const vmItem =
      items.find(
        (i) =>
          i.mediaType === "application/json" &&
          /visual-meta\.json$/i.test(i.path || ""),
      ) || (book.has("visual-meta.json") ? { path: "visual-meta.json" } : null);
    if (vmItem && book.has(vmItem.path)) {
      try {
        book.visualMeta = JSON.parse(book.text(vmItem.path));
        book.visualMetaSource = "package";
      } catch (e) {
        book.warnings.push("visual-meta.json is not valid JSON: " + e.message);
      }
    }
    if (!book.visualMeta) {
      const vm = extractEmbeddedVisualMeta(book.contentText);
      if (vm) {
        book.visualMeta = vm;
        book.visualMetaSource = "embedded";
      }
    }
    book.isOrigami = !!(book.visualMeta && book.visualMeta["visual-meta"]);
    if (book.isOrigami && book.spine.length !== 1) {
      book.warnings.push(
        "Origami profile expects a single spine item; found " +
          book.spine.length +
          ". Reading the first.",
      );
    }

    if (book.navItem && book.has(book.navItem.path)) {
      try {
        book.toc = parseNav(book.text(book.navItem.path), book.navItem.path);
      } catch (e) {
        book.warnings.push("Navigation document unreadable: " + e.message);
      }
    }
    return book;
  }

  // ---------- Origami link parsing (spec §10.2) ----------

  /** Parse origamitext://open/<id>?q=<quote>#<frag> or https://origamitext.app/o/<id>… */
  function parseOrigamiLink(href) {
    if (!href) return null;
    let m = /^origamitext:\/\/open\/([^?#]+)(?:\?([^#]*))?(?:#(.*))?$/i.exec(
      href,
    );
    let carrier = false;
    if (!m) {
      m =
        /^https?:\/\/origamitext\.app\/o\/([^?#]+)(?:\?([^#]*))?(?:#(.*))?$/i.exec(
          href,
        );
      carrier = true;
    }
    if (!m) return null;
    let id = m[1],
      quote = null,
      fragment = m[3] ? safeDecode(m[3]) : null;
    try {
      id = decodeURIComponent(id);
    } catch (_) {
      /* raw */
    }
    if (m[2]) {
      for (const pair of m[2].split("&")) {
        const [k, v = ""] = pair.split("=");
        if (k === "q") quote = safeDecode(v.replace(/\+/g, " "));
      }
    }
    return { id, quote, fragment, carrier, href };
  }

  function safeDecode(s) {
    try {
      return decodeURIComponent(s);
    } catch (_) {
      return s;
    }
  }

  function buildOrigamiLink(
    id,
    { quote = null, fragment = null, carrier = false } = {},
  ) {
    let url =
      (carrier ? "https://origamitext.app/o/" : "origamitext://open/") +
      encodeURIComponent(id);
    if (quote) url += "?q=" + encodeURIComponent(quote);
    if (fragment) url += "#" + encodeURIComponent(fragment);
    return url;
  }

  /** Deterministic urn:uuid from an origami-id (spec §3). Needs crypto.subtle. */
  async function identifierFromOrigamiId(origamiId) {
    if (!root.crypto || !root.crypto.subtle) return null;
    const bytes = new TextEncoder().encode("origami-text:" + origamiId);
    const hash = new Uint8Array(
      await root.crypto.subtle.digest("SHA-256", bytes),
    );
    const b = hash.slice(0, 16);
    b[6] = (b[6] & 0x0f) | 0x50; // version 5
    b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
    const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    return (
      "urn:uuid:" +
      hex.slice(0, 8) +
      "-" +
      hex.slice(8, 12) +
      "-" +
      hex.slice(12, 16) +
      "-" +
      hex.slice(16, 20) +
      "-" +
      hex.slice(20)
    );
  }

  /** Case-insensitive identity comparison (ids compare case-insensitively, §10.1). */
  function sameId(a, b) {
    return (
      !!a &&
      !!b &&
      String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
    );
  }

  // ---------- Citation helpers ----------

  function parseCSL(json) {
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch (_) {
      return null;
    }
  }

  /** Very small BibTeX field reader for the popover fallback. */
  function parseBibTeX(bib) {
    if (!bib) return null;
    const head = /@(\w+)\s*\{\s*([^,\s]+)\s*,/.exec(bib);
    if (!head) return null;
    const fields = {};
    const re =
      /(\w+)\s*=\s*(\{((?:[^{}]|\{[^{}]*\})*)\}|"([^"]*)"|([^,\n}]+))/g;
    let m;
    while ((m = re.exec(bib))) {
      fields[m[1].toLowerCase()] = (
        m[3] != null ? m[3] : m[4] != null ? m[4] : m[5]
      ).trim();
    }
    return { type: head[1], key: head[2], fields };
  }

  root.OrigamiEPUB = {
    open,
    Book,
    parseOPF,
    parseNav,
    resolve,
    normalizePath,
    extractEmbeddedVisualMeta,
    extractVisualMetaFromDOM,
    parseOrigamiLink,
    buildOrigamiLink,
    identifierFromOrigamiId,
    sameId,
    parseCSL,
    parseBibTeX,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
