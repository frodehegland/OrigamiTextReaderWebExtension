/* Origami Reader — reader page.
 * Levels implemented: open any EPUB (file / drop / URL / library), render the
 * content document in a sandboxed iframe, layer on the Origami behaviours of
 * spec §11.2 (Visual-Meta toggle, stretchtext, citation & note popovers,
 * ToC, fragment navigation by id then data-id, ?q= highlighting, Copy to
 * Cite) and remember reading position per document identity. */
(function () {
  "use strict";

  const api =
    globalThis.browser && globalThis.browser.runtime
      ? globalThis.browser
      : globalThis.chrome;
  const O = globalThis.OrigamiEPUB;
  const L = globalThis.OrigamiLibrary;
  const $ = (id) => document.getElementById(id);

  const ui = {
    body: document.body,
    frame: $("frame"),
    paper: $("paper"),
    home: $("home"),
    drop: $("drop"),
    fileInput: $("file-input"),
    urlForm: $("url-form"),
    urlInput: $("url-input"),
    homeStatus: $("home-status"),
    librarySection: $("library-section"),
    library: $("library"),
    toc: $("toc"),
    concepts: $("concepts"),
    references: $("references"),
    about: $("about"),
    docTitle: $("doc-title"),
    docBy: $("doc-by"),
    popover: $("popover"),
    popoverBody: $("popover-body"),
    seltool: $("seltool"),
    toast: $("toast"),
    side: $("side"),
  };

  const state = {
    book: null,
    bytes: null,
    sourceName: "",
    idoc: null,
    iwin: null,
    blobURLs: [],
    addressed: [],
    prefs: { theme: "light", fontSize: 18, bookCSS: true, side: "open" },
    pending: null, // {id, q, fragment} from a link we could not resolve yet
    saveTimer: null,
    scrollTimer: null,
    furthestIndex: 0,
    popoverAnchor: null,
  };

  // ------------------------------------------------------------------ utils
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function toast(msg, ms = 1600) {
    ui.toast.textContent = msg;
    ui.toast.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => {
      ui.toast.hidden = true;
    }, ms);
  }
  function cssEscape(s) {
    return globalThis.CSS && CSS.escape
      ? CSS.escape(s)
      : String(s).replace(/["\\]/g, "\\$&");
  }
  function fold(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }
  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast(label || "Copied");
    } catch (e) {
      toast("Copy failed: " + e.message, 2600);
    }
  }
  function surname(name) {
    if (!name) return "";
    const n = String(name).trim();
    if (n.includes(",")) return n.split(",")[0].trim();
    const parts = n.split(/\s+/);
    return parts[parts.length - 1];
  }
  function bookYear(book) {
    const d = book.date || "";
    const m = /\d{4}/.exec(d);
    return m ? m[0] : "";
  }
  function bookAuthorLabel(book) {
    const a = book.authors;
    if (!a.length) return "Anon.";
    if (a.length === 1) return surname(a[0]);
    if (a.length === 2) return surname(a[0]) + " & " + surname(a[1]);
    return surname(a[0]) + " et al.";
  }

  // ------------------------------------------------------------------ prefs / theme
  async function loadPrefs() {
    Object.assign(state.prefs, await L.getPrefs());
    applyPrefs();
  }
  function savePrefs() {
    L.setPrefs(state.prefs);
  }
  function applyPrefs() {
    ui.body.classList.remove("theme-light", "theme-sepia", "theme-dark");
    ui.body.classList.add("theme-" + state.prefs.theme);
    ui.body.dataset.side = state.prefs.side;
    $("btn-sidebar").setAttribute(
      "aria-pressed",
      state.prefs.side === "open" ? "true" : "false",
    );
    for (const b of document.querySelectorAll("[data-theme]"))
      b.setAttribute(
        "aria-checked",
        b.dataset.theme === state.prefs.theme ? "true" : "false",
      );
    $("opt-bookcss").checked = !!state.prefs.bookCSS;
    if (state.idoc) applyFrameTheme();
  }
  function themeVars() {
    const cs = getComputedStyle(ui.body);
    return {
      ink: cs.getPropertyValue("--ink").trim(),
      ink2: cs.getPropertyValue("--ink-2").trim(),
      paper: cs.getPropertyValue("--paper").trim(),
      fold: cs.getPropertyValue("--fold").trim(),
      foldSoft: cs.getPropertyValue("--fold-soft").trim(),
      mark: cs.getPropertyValue("--mark").trim(),
      line: cs.getPropertyValue("--line").trim(),
    };
  }
  function applyFrameTheme() {
    const t = themeVars();
    const root = state.idoc.documentElement;
    root.style.setProperty("--ot-ink", t.ink);
    root.style.setProperty("--ot-ink-2", t.ink2);
    root.style.setProperty("--ot-paper", t.paper);
    root.style.setProperty("--ot-fold", t.fold);
    root.style.setProperty("--ot-fold-soft", t.foldSoft);
    root.style.setProperty("--ot-mark", t.mark);
    root.style.setProperty("--ot-line", t.line);
    root.style.setProperty("--ot-size", state.prefs.fontSize + "px");
    const bookCss = state.idoc.getElementById("ot-book-css");
    if (bookCss) bookCss.disabled = !state.prefs.bookCSS;
  }

  /** Reader stylesheet injected into the book. Layered after the book's CSS so theme wins. */
  function readerStyles() {
    return `
html { -webkit-text-size-adjust: 100%; }
body { margin: 0 auto !important; padding: 44px 28px 45vh !important; max-width: 38em; font-size: var(--ot-size) !important;
  line-height: 1.55; color: var(--ot-ink) !important; background: var(--ot-paper) !important; }
body, p, li, td, th, h1, h2, h3, h4, h5, h6, figcaption, blockquote, aside { color: var(--ot-ink) !important; }
.byline { color: var(--ot-ink-2) !important; }
a { color: var(--ot-fold) !important; }
h1, h2, h3, h4 { line-height: 1.25; scroll-margin-top: 20px; }
[id] { scroll-margin-top: 24px; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; }
td, th { border: 1px solid var(--ot-line); padding: 0.3em 0.6em; text-align: left; }
a.citation { text-decoration: none; padding: 0 0.15em; border-radius: 3px; cursor: pointer; }
a.citation:hover, a[role~="doc-noteref"]:hover, dfn[data-concept]:hover { background: var(--ot-fold-soft); }
a[role~="doc-noteref"] { text-decoration: none; cursor: pointer; }
dfn[data-concept] { font-style: normal; border-bottom: 1px dotted var(--ot-fold); cursor: help; }
a.ot-stretchtext { text-decoration: none; margin-left: 0.25em; padding: 0 0.3em; border-radius: 4px; background: var(--ot-fold-soft); cursor: pointer; user-select: none; }
a.ot-stretchtext[aria-expanded="true"] { background: var(--ot-fold); color: var(--ot-paper) !important; }
aside.ot-stretchtext-content { margin: 0.5em 0 0.5em 1em; border-left: 2px solid var(--ot-fold); padding-left: 0.75em; }
aside.ot-stretchtext-content[hidden] { display: none; }
#visual-meta { display: none; font-size: 0.8em; color: var(--ot-ink-2) !important; }
#visual-meta.ot-shown { display: block; }
#visual-meta script { display: block; white-space: pre-wrap; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 0.85em; word-break: break-all; }
.ot-meta-toggle { margin: 3em 0 0; padding-top: 1em; border-top: 1px solid var(--ot-line); }
.ot-meta-toggle button { font: inherit; font-size: 0.85em; color: var(--ot-ink-2); background: transparent; border: 1px solid var(--ot-line); border-radius: 6px; padding: 0.3em 0.8em; cursor: pointer; }
mark.ot-q { background: var(--ot-mark); color: inherit; padding: 0 0.05em; border-radius: 2px; }
.ot-target { animation: ot-flash 1.6s ease-out 1; }
@keyframes ot-flash { 0% { background: var(--ot-fold-soft); } 100% { background: transparent; } }
@media (prefers-reduced-motion: reduce) { .ot-target { animation: none; outline: 2px solid var(--ot-fold); outline-offset: 4px; } }
hr { border: 0; border-top: 1px solid var(--ot-line); }
`;
  }

  // ------------------------------------------------------------------ opening
  function setHomeStatus(msg, isError) {
    ui.homeStatus.textContent = msg || "";
    ui.homeStatus.classList.toggle("is-error", !!isError);
  }

  async function openFile(file) {
    setHomeStatus("Opening " + file.name + "…");
    try {
      await openBytes(new Uint8Array(await file.arrayBuffer()), file.name);
    } catch (e) {
      setHomeStatus(e.message, true);
    }
  }

  async function openURL(url) {
    setHomeStatus("Fetching " + url + "…");
    try {
      const res = await fetch(url);
      if (!res.ok)
        throw new Error(
          "The server answered " + res.status + " for that address.",
        );
      const name =
        decodeURIComponent(url.split("/").pop().split("?")[0]) || "book.epub";
      await openBytes(new Uint8Array(await res.arrayBuffer()), name);
    } catch (e) {
      setHomeStatus(e.message, true);
    }
  }

  async function openFromLibrary(key) {
    const rec = await L.get(key);
    if (!rec) {
      setHomeStatus("That book is no longer in the library.", true);
      return;
    }
    await openBytes(
      new Uint8Array(await rec.blob.arrayBuffer()),
      rec.sourceName,
      {
        fromLibrary: true,
      },
    );
    L.touch(rec.key);
  }

  async function openBytes(bytes, sourceName, opts = {}) {
    const book = await O.open(bytes);
    closeBook();
    state.book = book;
    state.bytes = bytes;
    state.sourceName = sourceName || "";
    try {
      await L.save(book, bytes, sourceName);
    } catch (e) {
      console.warn("library save failed", e);
    }
    renderBook();
    ui.body.dataset.view = "reading";
    document.title = book.title + " — Origami Reader";
    setHomeStatus("");
    await afterRender();
  }

  function closeBook() {
    for (const u of state.blobURLs) URL.revokeObjectURL(u);
    state.blobURLs = [];
    state.addressed = [];
    state.idoc = null;
    state.iwin = null;
    state.furthestIndex = 0;
    hidePopover();
    ui.seltool.hidden = true;
  }

  // ------------------------------------------------------------------ rendering
  function parseContent(text) {
    let doc = new DOMParser().parseFromString(text, "application/xhtml+xml");
    if (doc.getElementsByTagName("parsererror").length) {
      state.book.warnings.push(
        "Content document is not well-formed XHTML; parsed as HTML instead.",
      );
      doc = new DOMParser().parseFromString(text, "text/html");
    }
    return doc;
  }

  function renderBook() {
    const book = state.book;
    const src = parseContent(book.contentText);
    // CDATA sections (the embedded Visual-Meta) cannot live in an HTML document: turn them into text first.
    const cdWalker = src.createTreeWalker(
      src,
      NodeFilter.SHOW_CDATA_SECTION,
      null,
    );
    const cdatas = [];
    let cd;
    while ((cd = cdWalker.nextNode())) cdatas.push(cd);
    for (const c of cdatas)
      c.parentNode.replaceChild(src.createTextNode(c.nodeValue), c);
    // Collect the book's stylesheet links, then drop them from the source so the sandbox never fetches them.
    const styleLinks = Array.from(
      src.querySelectorAll('link[rel~="stylesheet"]'),
    ).map((l) => l.getAttribute("href") || "");
    for (const l of Array.from(
      src.querySelectorAll("link, base, script:not(#visual-meta-payload)"),
    ))
      l.remove();
    const idoc = ui.frame.contentDocument;
    state.idoc = idoc;
    state.iwin = ui.frame.contentWindow;

    // Fresh document
    while (idoc.documentElement) idoc.removeChild(idoc.documentElement);
    idoc.appendChild(idoc.importNode(src.documentElement, true));
    const html = idoc.documentElement;
    let head = html.querySelector("head");
    if (!head) {
      head = idoc.createElement("head");
      html.insertBefore(head, html.firstChild);
    }
    const body =
      html.querySelector("body") ||
      html.appendChild(idoc.createElement("body"));

    // Strip anything the sandbox should not carry. The frame runs with
    // allow-scripts (Safari refuses to fire parent-attached listeners in a
    // script-disabled sandbox — WebKit bug 218086), so nothing executable may
    // survive: no scripts, no nested browsing contexts, no inline handlers,
    // no javascript: URLs; the Visual-Meta payload stays but is forced inert.
    for (const s of Array.from(html.querySelectorAll("script"))) {
      if (s.id !== "visual-meta-payload") s.remove();
    }
    for (const n of Array.from(
      html.querySelectorAll("iframe, frame, embed, object"),
    ))
      n.remove();
    for (const l of Array.from(
      head.querySelectorAll('link[rel~="stylesheet"], base'),
    ))
      l.remove();
    const vmPayload = html.querySelector("script#visual-meta-payload");
    if (vmPayload) vmPayload.setAttribute("type", "application/json");
    const sanitizeWalker = idoc.createTreeWalker(
      html,
      NodeFilter.SHOW_ELEMENT,
      null,
    );
    for (let e = html; e; e = sanitizeWalker.nextNode()) {
      for (const at of Array.from(e.attributes)) {
        if (/^on/i.test(at.name)) e.removeAttribute(at.name);
        else if (
          /^\s*javascript:/i.test(at.value) &&
          /(^|:)(href|src|action|formaction|data)$/i.test(at.name)
        )
          e.removeAttribute(at.name);
      }
    }

    // Book stylesheet(s) referenced by the content document, then reader styles
    const cssText = [];
    for (const href of styleLinks) {
      const p = book.resolve(book.contentItem.path, href);
      if (p && book.has(p)) cssText.push(book.text(p));
    }
    if (!cssText.length)
      for (const c of book.cssItems)
        if (book.has(c.path)) cssText.push(book.text(c.path));
    const bookStyle = idoc.createElement("style");
    bookStyle.id = "ot-book-css";
    bookStyle.textContent = cssText.join("\n");
    head.appendChild(bookStyle);
    const readerStyle = idoc.createElement("style");
    readerStyle.id = "ot-reader-css";
    readerStyle.textContent = readerStyles();
    head.appendChild(readerStyle);

    // Images → blob URLs
    for (const img of Array.from(
      body.querySelectorAll("img[src], image[href]"),
    )) {
      const attr = img.hasAttribute("src") ? "src" : "href";
      const p = book.resolve(
        book.contentItem.path,
        img.getAttribute(attr) || "",
      );
      if (!p) continue;
      const bytes = book.bytes(p);
      if (!bytes) {
        img.setAttribute("data-ot-missing", p);
        continue;
      }
      const item = Object.values(book.manifest).find((i) => i.path === p);
      const url = URL.createObjectURL(
        new Blob([bytes], {
          type: (item && item.mediaType) || "application/octet-stream",
        }),
      );
      state.blobURLs.push(url);
      img.setAttribute(attr, url);
    }

    // Visual-Meta appendix: metadata, not content — hidden behind a toggle
    const vmSection = idoc.getElementById("visual-meta");
    if (vmSection) {
      const wrap = idoc.createElement("div");
      wrap.className = "ot-meta-toggle";
      const btn = idoc.createElement("button");
      btn.type = "button";
      btn.textContent = "Show Visual-Meta";
      btn.setAttribute("aria-expanded", "false");
      btn.addEventListener("click", () => {
        const shown = vmSection.classList.toggle("ot-shown");
        btn.textContent = shown ? "Hide Visual-Meta" : "Show Visual-Meta";
        btn.setAttribute("aria-expanded", shown ? "true" : "false");
      });
      wrap.appendChild(btn);
      vmSection.parentNode.insertBefore(wrap, vmSection);
    }

    // Addressed elements in reading order (main first, then anything else with ids, excluding the appendix)
    state.addressed = Array.from(
      body.querySelectorAll("[data-id], main [id]"),
    ).filter((e) => !e.closest("#visual-meta"));

    applyFrameTheme();
    wireContent(body);
    renderSide();
    ui.docTitle.textContent = book.title;
    ui.docBy.textContent =
      book.authors.join(", ") + (book.date ? " · " + book.date : "");
  }

  // ------------------------------------------------------------------ behaviours inside the book
  function wireContent(body) {
    const idoc = state.idoc;

    body.addEventListener("click", (ev) => {
      const a = ev.target.closest && ev.target.closest("a, dfn[data-concept]");
      if (!a) {
        hidePopover();
        return;
      }

      if (a.matches("a.ot-stretchtext")) {
        ev.preventDefault();
        toggleStretch(a);
        return;
      }
      if (a.matches("a.citation")) {
        ev.preventDefault();
        showCitation(a);
        return;
      }
      if (a.matches('a[role~="doc-noteref"]')) {
        ev.preventDefault();
        showNote(a);
        return;
      }
      if (a.matches("dfn[data-concept]")) {
        ev.preventDefault();
        showConcept(a.getAttribute("data-concept"), a);
        return;
      }

      const href = a.getAttribute("href") || "";
      const olink = O.parseOrigamiLink(href);
      if (olink) {
        ev.preventDefault();
        state.popoverAnchor = a;
        followOrigamiLink(olink);
        return;
      }
      if (href.startsWith("#")) {
        ev.preventDefault();
        navigateTo(decodeURIComponent(href.slice(1)));
        return;
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
        ev.preventDefault();
        window.open(href, "_blank", "noopener");
        return;
      }
      // relative link inside the package: try as fragment on the content doc
      if (href.includes("#")) {
        ev.preventDefault();
        navigateTo(decodeURIComponent(href.split("#")[1]));
      }
    });

    body.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        hidePopover();
        return;
      }
      const a = ev.target.closest && ev.target.closest("a.ot-stretchtext");
      if (a && (ev.key === "Enter" || ev.key === " ")) {
        ev.preventDefault();
        toggleStretch(a);
      }
    });
    idoc.addEventListener("keydown", onGlobalKey);

    // Selection → Copy to Cite toolbar
    idoc.addEventListener("selectionchange", () => {
      clearTimeout(wireContent.selT);
      wireContent.selT = setTimeout(updateSelectionTool, 120);
    });
    idoc.addEventListener("mousedown", () => {
      ui.seltool.hidden = true;
    });

    // Position tracking
    state.iwin.addEventListener("scroll", onScroll, { passive: true });
  }

  function toggleStretch(a) {
    const id =
      a.getAttribute("aria-controls") ||
      (a.getAttribute("href") || "").replace(/^#/, "");
    const aside = id ? state.idoc.getElementById(id) : null;
    if (!aside) return;
    const open = aside.hasAttribute("hidden");
    if (open) aside.removeAttribute("hidden");
    else aside.setAttribute("hidden", "hidden");
    a.setAttribute("aria-expanded", open ? "true" : "false");
    a.textContent = open ? "‹‹" : "»»";
  }

  function findTarget(frag) {
    if (!frag) return null;
    const idoc = state.idoc;
    let el = idoc.getElementById(frag);
    if (!el) {
      try {
        el = idoc.querySelector('[data-id="' + cssEscape(frag) + '"]');
      } catch (_) {
        el = null;
      }
    }
    if (!el) {
      // case-insensitive last resort
      const f = frag.toLowerCase();
      el =
        state.addressed.find(
          (e) =>
            (e.id || "").toLowerCase() === f ||
            (e.getAttribute("data-id") || "").toLowerCase() === f,
        ) || null;
    }
    return el;
  }

  /** Resolve by id, then data-id; expand hidden stretchtext ancestors first; scroll; flash. */
  function navigateTo(
    frag,
    { quote = null, flash = true, behavior = "smooth" } = {},
  ) {
    const el = findTarget(frag);
    if (!el) {
      toast('No element "' + frag + '" in this document', 2200);
      return false;
    }
    let p = el;
    while (p && p !== state.idoc.body) {
      if (p.matches && p.matches("aside.ot-stretchtext-content[hidden]")) {
        const marker = state.idoc.querySelector(
          'a.ot-stretchtext[aria-controls="' +
            cssEscape(p.id) +
            '"], a.ot-stretchtext[href="#' +
            cssEscape(p.id) +
            '"]',
        );
        if (marker) toggleStretch(marker);
        else p.removeAttribute("hidden");
      }
      p = p.parentNode;
    }
    if (el.closest("#visual-meta")) {
      state.idoc.getElementById("visual-meta").classList.add("ot-shown");
    }
    clearHighlights();
    if (quote) highlightQuote(el, quote);
    el.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : behavior,
      block: "start",
    });
    if (flash) {
      el.classList.remove("ot-target");
      void el.offsetWidth;
      el.classList.add("ot-target");
    }
    return true;
  }

  function clearHighlights() {
    for (const m of Array.from(state.idoc.querySelectorAll("mark.ot-q"))) {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    }
  }

  /** Highlight `quote` inside `scope`, case- and diacritic-insensitively. Degrades to the scope itself. */
  function highlightQuote(scope, quote) {
    const walker = state.idoc.createTreeWalker(
      scope,
      NodeFilter.SHOW_TEXT,
      null,
    );
    const nodes = [];
    let full = "";
    const map = []; // map[i] = {node, offsetInNode} per folded char
    let n;
    while ((n = walker.nextNode())) {
      if (n.parentNode.closest("script, style")) continue;
      nodes.push(n);
      const raw = n.nodeValue;
      for (let i = 0; i < raw.length; i++) {
        const f = fold(raw[i]);
        for (let k = 0; k < f.length; k++) {
          full += f[k];
          map.push({ node: n, offset: i });
        }
      }
    }
    const needle = fold(quote).replace(/\s+/g, " ").trim();
    if (!needle) return false;
    const hay = full.replace(/\s+/g, " ");
    // Build index map for collapsed whitespace
    const hayMap = [];
    let last = "";
    for (let i = 0, j = 0; i < full.length; i++) {
      const c = full[i];
      if (/\s/.test(c) && /\s/.test(last)) continue;
      hayMap[j++] = map[i];
      last = c;
    }
    const at = hay.indexOf(needle);
    if (at < 0) return false;
    const start = hayMap[at],
      end = hayMap[at + needle.length - 1];
    if (!start || !end) return false;
    // Wrap per text node
    const inRange = nodes.slice(
      nodes.indexOf(start.node),
      nodes.indexOf(end.node) + 1,
    );
    for (const tn of inRange) {
      const s = tn === start.node ? start.offset : 0;
      const e = tn === end.node ? end.offset + 1 : tn.nodeValue.length;
      if (e <= s) continue;
      const range = state.idoc.createRange();
      range.setStart(tn, s);
      range.setEnd(tn, e);
      const mark = state.idoc.createElement("mark");
      mark.className = "ot-q";
      range.surroundContents(mark);
    }
    return true;
  }

  async function followOrigamiLink(link) {
    const book = state.book;
    if (
      book &&
      (O.sameId(link.id, book.origamiId) ||
        O.sameId(link.id, book.identifier) ||
        O.sameId("urn:uuid:" + link.id, book.identifier))
    ) {
      if (link.fragment) navigateTo(link.fragment, { quote: link.quote });
      else toast("This is the current document");
      return;
    }
    const rec = await L.findByIdentity(link.id);
    if (rec) {
      // In the extension the background script opens a reader tab; on the
      // plain web (no runtime API) open this page again with the params.
      if (api && api.runtime && api.runtime.sendMessage) {
        api.runtime.sendMessage({
          type: "open-reader",
          params: {
            id: link.id,
            q: link.quote || "",
            fragment: link.fragment || "",
          },
        });
      } else {
        const u = new URL(location.pathname, location.href);
        u.searchParams.set("id", link.id);
        if (link.quote) u.searchParams.set("q", link.quote);
        if (link.fragment) u.hash = encodeURIComponent(link.fragment);
        window.open(u.toString(), "_blank", "noopener");
      }
      return;
    }
    showPopover(state.popoverAnchor, buildMissingCard(link));
  }

  function buildMissingCard(link) {
    const box = el("div");
    box.appendChild(
      el("div", "pop__kind", "Origami document not in your library"),
    );
    box.appendChild(
      el(
        "div",
        "pop__addr",
        link.id + (link.fragment ? "#" + link.fragment : ""),
      ),
    );
    if (link.quote) box.appendChild(el("blockquote", "pop__quote", link.quote));
    box.appendChild(
      el(
        "p",
        "pop__meta",
        "Open the EPUB with this identity once and the link will resolve.",
      ),
    );
    const acts = el("div", "pop__actions");
    const b1 = el("button", null, "Copy address");
    b1.type = "button";
    b1.onclick = () =>
      copyText(link.id + (link.fragment ? "#" + link.fragment : ""));
    const b2 = el("button", null, "Open a file");
    b2.type = "button";
    b2.onclick = () => {
      state.pending = { id: link.id, q: link.quote, fragment: link.fragment };
      hidePopover();
      ui.fileInput.click();
    };
    acts.append(b1, b2);
    box.appendChild(acts);
    return box;
  }

  // ------------------------------------------------------------------ popovers
  function showPopover(anchor, content) {
    ui.popoverBody.textContent = "";
    ui.popoverBody.appendChild(content);
    ui.popover.hidden = false;
    positionPopover(anchor);
    const first = ui.popoverBody.querySelector("button, a");
    if (first) first.focus({ preventScroll: true });
  }
  function hidePopover() {
    ui.popover.hidden = true;
  }
  function positionPopover(anchor) {
    const pop = ui.popover;
    let x = 80,
      y = 80;
    if (anchor && anchor.getBoundingClientRect) {
      const fr = ui.frame.getBoundingClientRect();
      const r = anchor.getBoundingClientRect();
      const inFrame = anchor.ownerDocument === state.idoc;
      x = (inFrame ? fr.left : 0) + r.left;
      y = (inFrame ? fr.top : 0) + r.bottom + 8;
      const w = pop.offsetWidth,
        h = pop.offsetHeight;
      if (x + w > window.innerWidth - 8) x = window.innerWidth - w - 8;
      if (y + h > window.innerHeight - 8)
        y = Math.max(8, (inFrame ? fr.top : 0) + r.top - h - 8);
    }
    pop.style.left = Math.max(8, x) + "px";
    pop.style.top = Math.max(8, y) + "px";
  }

  function citationRecord(li, citationId) {
    const vm = state.book.visualMeta;
    const fromVM =
      vm && Array.isArray(vm.citations)
        ? vm.citations.find((c) => O.sameId(c.id, citationId))
        : null;
    const csl = li ? O.parseCSL(li.getAttribute("data-csl-json")) : null;
    const bib = li ? li.getAttribute("data-bibtex") || "" : "";
    const parsedBib = O.parseBibTeX(bib);
    const rec = {
      title: "",
      authors: [],
      year: "",
      venue: "",
      doi: "",
      url: "",
      bibtex: bib || (fromVM && fromVM.bibtex) || "",
      csl: csl || (fromVM && fromVM.csl) || null,
      text: li ? li.textContent.trim() : "",
    };
    const c = rec.csl;
    if (c) {
      rec.title = c.title || "";
      rec.authors = Array.isArray(c.author)
        ? c.author.map(
            (a) => a.literal || [a.given, a.family].filter(Boolean).join(" "),
          )
        : [];
      rec.year =
        c.issued && c.issued["date-parts"] && c.issued["date-parts"][0]
          ? String(c.issued["date-parts"][0][0])
          : "";
      rec.venue = c["container-title"] || "";
      rec.doi = c.DOI || "";
      rec.url = c.URL || "";
    } else if (parsedBib) {
      const f = parsedBib.fields;
      rec.title = f.title || "";
      rec.authors = (f.author || "").split(/\s+and\s+/).filter(Boolean);
      rec.year = f.year || "";
      rec.venue = f.journal || f.booktitle || f.howpublished || "";
      rec.doi = f.doi || "";
      rec.url = f.url || "";
    }
    if (fromVM) {
      rec.title = rec.title || fromVM.name || "";
      rec.year = rec.year || fromVM.year || "";
      rec.venue = rec.venue || fromVM.publication || "";
      rec.doi = rec.doi || fromVM.doi || "";
      if (!rec.authors.length && Array.isArray(fromVM.authors))
        rec.authors = fromVM.authors.slice();
      if (!rec.url && Array.isArray(fromVM.urls))
        rec.url = fromVM.urls.find((u) => /^https?:/i.test(u)) || "";
      rec.abstract = fromVM.abstract || "";
    }
    return rec;
  }

  function showCitation(a) {
    state.popoverAnchor = a;
    const href = a.getAttribute("href") || "";
    const refId = href.startsWith("#")
      ? decodeURIComponent(href.slice(1))
      : null;
    const li = refId ? state.idoc.getElementById(refId) : null;
    const citationId = a.getAttribute("data-citation-id") || "";
    const oref = a.getAttribute("data-origami-ref") || "";
    const rec = citationRecord(li, citationId);

    const box = el("div");
    box.appendChild(
      el(
        "div",
        "pop__kind",
        oref ? "Citation · internal Origami reference" : "Citation",
      ),
    );
    if (rec.title) box.appendChild(el("h3", null, rec.title));
    const metaBits = [rec.authors.join(", "), rec.year, rec.venue]
      .filter(Boolean)
      .join(" · ");
    if (metaBits) box.appendChild(el("p", "pop__meta", metaBits));
    if (!rec.title && rec.text) box.appendChild(el("p", "pop__text", rec.text));
    if (rec.abstract) {
      const ab = el("p", "pop__meta", rec.abstract);
      ab.style.fontSize = "12.5px";
      box.appendChild(ab);
    }
    const links = el("div", "pop__links");
    if (rec.doi) {
      const l = el("a", null, "doi:" + rec.doi);
      l.href = "https://doi.org/" + rec.doi;
      l.target = "_blank";
      l.rel = "noopener";
      links.appendChild(l);
    }
    if (
      rec.url &&
      !O.parseOrigamiLink(rec.url) &&
      !(rec.doi && rec.url.includes(rec.doi))
    ) {
      const l = el("a", null, rec.url.replace(/^https?:\/\//, ""));
      l.href = rec.url;
      l.target = "_blank";
      l.rel = "noopener";
      links.appendChild(l);
    }
    if (links.childNodes.length) box.appendChild(links);

    const acts = el("div", "pop__actions");
    if (rec.bibtex) {
      const b = el("button", null, "Copy BibTeX");
      b.type = "button";
      b.onclick = () => copyText(rec.bibtex, "BibTeX copied");
      acts.appendChild(b);
    }
    if (rec.csl) {
      const b = el("button", null, "Copy CSL-JSON");
      b.type = "button";
      b.onclick = () =>
        copyText(JSON.stringify(rec.csl, null, 2), "CSL-JSON copied");
      acts.appendChild(b);
    }
    if (li) {
      const b = el("button", null, "Go to reference");
      b.type = "button";
      b.onclick = () => {
        hidePopover();
        navigateTo(refId);
      };
      acts.appendChild(b);
    }
    if (oref) {
      const m = /^(?:[a-z]+:)?([^#]+)(?:#(.*))?$/i.exec(oref);
      const id = citationId || (m ? m[1] : "");
      const frag = m && m[2] ? m[2] : null;
      box.appendChild(el("div", "pop__addr", "[" + oref + "]"));
      const b1 = el("button", null, "Open document");
      b1.type = "button";
      b1.onclick = () => followOrigamiLink({ id, fragment: frag, quote: null });
      const b2 = el("button", null, "Copy origamitext link");
      b2.type = "button";
      b2.onclick = () =>
        copyText(O.buildOrigamiLink(id, { fragment: frag }), "Link copied");
      const b3 = el("button", null, "Copy web link");
      b3.type = "button";
      b3.onclick = () =>
        copyText(
          O.buildOrigamiLink(id, { fragment: frag, carrier: true }),
          "Web link copied",
        );
      acts.append(b1, b2, b3);
    }
    box.appendChild(acts);
    showPopover(a, box);
  }

  function showNote(a) {
    state.popoverAnchor = a;
    const href = a.getAttribute("href") || "";
    const frag = href.startsWith("#")
      ? decodeURIComponent(href.slice(1))
      : null;
    const target = frag ? findTarget(frag) : null;
    const box = el("div");
    box.appendChild(
      el(
        "div",
        "pop__kind",
        a.classList.contains("ot-inline-note") ? "Inline note" : "Note",
      ),
    );
    if (target) {
      const clone = target.cloneNode(true);
      for (const x of clone.querySelectorAll("[id]")) x.removeAttribute("id");
      const holder = el("div", "pop__text");
      holder.appendChild(document.importNode(clone, true));
      box.appendChild(holder);
      const acts = el("div", "pop__actions");
      const b = el("button", null, "Go to note");
      b.type = "button";
      b.onclick = () => {
        hidePopover();
        navigateTo(frag);
      };
      acts.appendChild(b);
      box.appendChild(acts);
    } else {
      box.appendChild(
        el(
          "p",
          "pop__meta",
          "The note this mark points at (" +
            (frag || "no target") +
            ") is not in the document.",
        ),
      );
    }
    showPopover(a, box);
  }

  function conceptByName(name) {
    const vm = state.book.visualMeta;
    if (!vm || !Array.isArray(vm.concepts)) return null;
    const f = fold(name);
    return vm.concepts.find((c) => fold(c.name) === f) || null;
  }

  function showConcept(name, anchor) {
    state.popoverAnchor = anchor;
    const c = conceptByName(name);
    const box = el("div");
    box.appendChild(
      el("div", "pop__kind", c && c.tag ? "Concept · " + c.tag : "Concept"),
    );
    box.appendChild(el("h3", null, (c && c.name) || name));
    if (c && c.description)
      box.appendChild(el("p", "pop__text", c.description));
    else
      box.appendChild(
        el(
          "p",
          "pop__meta",
          "No definition is carried in this document's Visual-Meta.",
        ),
      );
    if (c && Array.isArray(c.urls) && c.urls.length) {
      const links = el("div", "pop__links");
      for (const u of c.urls) {
        const l = el("a", null, u.replace(/^https?:\/\//, ""));
        l.href = u;
        l.target = "_blank";
        l.rel = "noopener";
        links.appendChild(l);
      }
      box.appendChild(links);
    }
    if (
      c &&
      Array.isArray(c.citationIdentifiers) &&
      c.citationIdentifiers.length
    ) {
      const acts = el("div", "pop__actions");
      for (const cid of c.citationIdentifiers) {
        const li = state.idoc.querySelector(
          'a.citation[data-citation-id="' + cssEscape(cid) + '"]',
        );
        const b = el(
          "button",
          null,
          "Cited as " + (li ? li.textContent.trim() : cid),
        );
        b.type = "button";
        b.onclick = () => {
          if (li) showCitation(li);
        };
        acts.appendChild(b);
      }
      box.appendChild(acts);
    }
    if (c && c.address) {
      const acts = el("div", "pop__actions");
      const b = el("button", null, "Go to section " + c.address);
      b.type = "button";
      b.onclick = () => {
        hidePopover();
        navigateTo(c.address);
      };
      acts.appendChild(b);
      box.appendChild(acts);
    }
    showPopover(anchor, box);
  }

  // ------------------------------------------------------------------ Copy to Cite (§10.3)
  function currentSelection() {
    const sel = state.iwin && state.iwin.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const text = sel.toString().trim();
    if (!text) return null;
    let node =
      range.startContainer.nodeType === 1
        ? range.startContainer
        : range.startContainer.parentNode;
    if (node.closest("#visual-meta")) return null;
    const host = node.closest("[data-id][id], [id]");
    return {
      sel,
      range,
      text,
      host,
      fragment: host ? host.id || host.getAttribute("data-id") : null,
    };
  }

  function updateSelectionTool() {
    const s = currentSelection();
    if (!s) {
      ui.seltool.hidden = true;
      return;
    }
    const fr = ui.frame.getBoundingClientRect();
    const rects = s.range.getClientRects();
    const r = rects.length
      ? rects[rects.length - 1]
      : s.range.getBoundingClientRect();
    ui.seltool.hidden = false;
    const w = ui.seltool.offsetWidth;
    let x = fr.left + r.right - w / 2,
      y = fr.top + r.bottom + 8;
    x = Math.min(Math.max(8, x), window.innerWidth - w - 8);
    if (y > window.innerHeight - 50) y = fr.top + r.top - 40;
    ui.seltool.style.left = x + "px";
    ui.seltool.style.top = y + "px";
  }

  function citationPayload(s) {
    const book = state.book;
    const to = book.origamiId || book.identifier;
    const author = bookAuthorLabel(book),
      year = bookYear(book);
    const firstSurname = surname(book.authors[0] || "");
    const bibtex =
      "@misc{" +
      (firstSurname
        ? firstSurname.toLowerCase().replace(/[^a-z0-9]/g, "")
        : "doc") +
      (year || "") +
      ",\n" +
      "  author = {" +
      book.authors.join(" and ") +
      "},\n" +
      "  title = {" +
      book.title +
      "},\n" +
      (year ? "  year = {" + year + "},\n" : "") +
      "  howpublished = {" +
      O.buildOrigamiLink(to, { fragment: s.fragment }) +
      "}\n}";
    const link = O.buildOrigamiLink(to, {
      quote: s.text,
      fragment: s.fragment,
    });
    const json = {
      to,
      fragment: s.fragment,
      rel: "cites",
      quotedText: s.text,
      author,
      year,
      bibtex,
      documentTitle: book.title,
      documentFilename: state.sourceName,
      annotation: "",
    };
    const label = "(" + author + (year ? ", " + year : "") + ")";
    const html =
      '<a href="' +
      link.replace(/&/g, "&amp;").replace(/"/g, "&quot;") +
      '">' +
      label.replace(/</g, "&lt;") +
      "</a>";
    const plain =
      "\u201C" +
      s.text +
      "\u201D " +
      label +
      " [" +
      to +
      (s.fragment ? "#" + s.fragment : "") +
      "]";
    return { json, html, plain, link };
  }

  async function copyToCite() {
    const s = currentSelection();
    if (!s) {
      toast("Select some text first");
      return;
    }
    const p = citationPayload(s);
    try {
      const item = {
        "text/html": new Blob([p.html], { type: "text/html" }),
        "text/plain": new Blob([p.plain], { type: "text/plain" }),
      };
      try {
        item["web application/x-origami-citation+json"] = new Blob(
          [JSON.stringify(p.json)],
          {
            type: "web application/x-origami-citation+json",
          },
        );
      } catch (_) {
        /* custom formats unsupported here */
      }
      try {
        await navigator.clipboard.write([new ClipboardItem(item)]);
      } catch (_) {
        delete item["web application/x-origami-citation+json"];
        await navigator.clipboard.write([new ClipboardItem(item)]);
      }
      toast(
        "Copied as citation: " +
          p.plain.slice(0, 60) +
          (p.plain.length > 60 ? "…" : ""),
        2400,
      );
    } catch (e) {
      try {
        await navigator.clipboard.writeText(p.plain);
        toast("Copied (plain text only)");
      } catch (e2) {
        toast("Copy failed: " + e2.message, 2600);
      }
    }
    ui.seltool.hidden = true;
  }

  function copyLinkToSelection() {
    const s = currentSelection();
    if (!s) return;
    const book = state.book;
    const to = book.origamiId || book.identifier;
    copyText(
      O.buildOrigamiLink(to, { quote: s.text, fragment: s.fragment }),
      "Link to here copied",
    );
    ui.seltool.hidden = true;
  }

  // ------------------------------------------------------------------ reading position
  function currentElementIndex() {
    const top = 6;
    for (let i = 0; i < state.addressed.length; i++) {
      const r = state.addressed[i].getBoundingClientRect();
      if (
        r.bottom > top &&
        r.height > 0 &&
        !state.addressed[i].closest("[hidden]")
      )
        return i;
    }
    return state.addressed.length ? state.addressed.length - 1 : -1;
  }

  function onScroll() {
    clearTimeout(state.scrollTimer);
    state.scrollTimer = setTimeout(() => {
      updateCurrentToc();
      savePosition();
    }, 250);
  }

  function savePosition() {
    const book = state.book;
    if (!book) return;
    const key = book.identifier || book.origamiId;
    if (!key) return;
    const i = currentElementIndex();
    if (i < 0) return;
    const e = state.addressed[i];
    state.furthestIndex = Math.max(state.furthestIndex, i);
    const f = state.addressed[state.furthestIndex];
    const pos = {
      dataId: e.getAttribute("data-id") || "",
      id: e.id || "",
      furthestDataId: f.getAttribute("data-id") || "",
      furthestId: f.id || "",
      origamiId: book.origamiId,
      identifier: book.identifier,
      title: book.title,
      updated: new Date().toISOString(),
    };
    L.setPosition(key, pos);
  }

  async function restorePosition() {
    const book = state.book;
    const pos = await L.getPosition(book.identifier || book.origamiId);
    if (!pos) return false;
    const frag = pos.dataId && findTarget(pos.dataId) ? pos.dataId : pos.id;
    if (!frag) return false;
    const fi = state.addressed.findIndex(
      (e) =>
        e.getAttribute("data-id") === pos.furthestDataId ||
        e.id === pos.furthestId,
    );
    if (fi >= 0) state.furthestIndex = fi;
    navigateTo(frag, { flash: false, behavior: "auto" });
    toast("Back where you left off", 1400);
    return true;
  }

  function currentAddress() {
    const i = currentElementIndex();
    if (i < 0) return null;
    const e = state.addressed[i];
    return { id: e.id || "", dataId: e.getAttribute("data-id") || "" };
  }

  function showPositionCard(anchor) {
    const book = state.book;
    if (!book) return;
    const cur = currentAddress();
    const to = book.origamiId || book.identifier;
    const frag = cur ? cur.id || cur.dataId : null;
    const box = el("div");
    box.appendChild(el("div", "pop__kind", "Your reading position"));
    box.appendChild(el("h3", null, book.title));
    box.appendChild(
      el(
        "p",
        "pop__meta",
        (frag ? "At " + frag : "At the start") +
          (cur && cur.dataId && cur.id
            ? " (stable id " + cur.dataId + ")"
            : ""),
      ),
    );
    const scheme = O.buildOrigamiLink(to, { fragment: frag });
    const carrier = O.buildOrigamiLink(to, { fragment: frag, carrier: true });
    box.appendChild(el("div", "pop__addr", scheme));
    const acts = el("div", "pop__actions");
    const b1 = el("button", null, "Copy origamitext link");
    b1.type = "button";
    b1.onclick = () => copyText(scheme, "Link copied");
    const b2 = el("button", null, "Copy web link");
    b2.type = "button";
    b2.onclick = () => copyText(carrier, "Web link copied");
    const b3 = el("button", null, "Copy address");
    b3.type = "button";
    b3.onclick = () =>
      copyText(to + (frag ? "#" + frag : ""), "Address copied");
    acts.append(b1, b2, b3);
    box.appendChild(acts);
    showPopover(anchor, box);
  }

  // ------------------------------------------------------------------ side panel
  function renderSide() {
    const book = state.book,
      vm = book.visualMeta || {};
    // Contents
    ui.toc.textContent = "";
    const addToc = (items, ol) => {
      for (const it of items) {
        const li = el("li");
        const a = el("a");
        a.href = "#";
        a.dataset.frag = it.fragment || "";
        if (it.fragment && /^[0-9]+[A-Z]*$/.test(it.fragment))
          a.appendChild(el("span", "toc__addr", it.fragment));
        a.appendChild(
          document.createTextNode(it.text || it.fragment || "Untitled"),
        );
        a.onclick = (ev) => {
          ev.preventDefault();
          if (it.fragment) navigateTo(it.fragment);
          else state.iwin.scrollTo({ top: 0 });
        };
        li.appendChild(a);
        ol.appendChild(li);
        if (it.children && it.children.length) {
          const sub = el("ol");
          li.appendChild(sub);
          addToc(it.children, sub);
        }
      }
    };
    if (book.toc.length) addToc(book.toc, ui.toc);
    else
      ui.toc.appendChild(
        el("li", "side__empty", "This book has no table of contents."),
      );

    // Concepts
    ui.concepts.textContent = "";
    const concepts = Array.isArray(vm.concepts)
      ? vm.concepts.filter((c) => c.tag !== "heading")
      : [];
    if (!concepts.length)
      ui.concepts.appendChild(
        el(
          "div",
          "side__empty",
          book.isOrigami
            ? "No concepts are defined in this document."
            : "Not an Origami document — no concept glossary.",
        ),
      );
    for (const c of concepts
      .slice()
      .sort((a, b) => fold(a.name).localeCompare(fold(b.name)))) {
      const d = el("div", "concept");
      const name = el("span", "concept__name", c.name);
      name.tabIndex = 0;
      const jump = () => {
        const dfn =
          state.idoc.querySelector("dfn[data-concept]") &&
          Array.from(state.idoc.querySelectorAll("dfn[data-concept]")).find(
            (x) => fold(x.getAttribute("data-concept")) === fold(c.name),
          );
        if (dfn) {
          const host = dfn.closest("[id]");
          if (host) navigateTo(host.id);
          showConcept(c.name, dfn);
        } else showConcept(c.name, name);
      };
      name.onclick = jump;
      name.onkeydown = (e) => {
        if (e.key === "Enter") jump();
      };
      d.appendChild(name);
      if (c.tag && c.tag !== "concept")
        d.appendChild(el("span", "concept__tag", c.tag));
      if (c.description) d.appendChild(el("p", "concept__desc", c.description));
      ui.concepts.appendChild(d);
    }

    // References
    ui.references.textContent = "";
    const refList = state.idoc.querySelectorAll("#references li[id]");
    if (!refList.length)
      ui.references.appendChild(
        el("li", "side__empty", "No references in this document."),
      );
    for (const li of refList) {
      const item = el("li", null, li.textContent.trim());
      item.onclick = () => {
        const a = state.idoc.querySelector(
          'a.citation[href="#' + cssEscape(li.id) + '"]',
        );
        if (a) {
          navigateTo(a.closest("[id]") ? a.closest("[id]").id : li.id);
          showCitation(a);
        } else navigateTo(li.id);
      };
      ui.references.appendChild(item);
    }

    // About
    ui.about.textContent = "";
    const about = el("div", "about");
    const dl = el("dl");
    const row = (k, v, mono) => {
      if (!v) return;
      dl.appendChild(el("dt", null, k));
      const dd = el("dd", mono ? "mono" : null, v);
      dl.appendChild(dd);
    };
    row("Title", book.title);
    row("Authors", book.authors.join(", "));
    row("Date", book.date);
    row("Publication", vm.document && vm.document.publication);
    row("Abstract", vm.document && vm.document.abstract);
    row(
      "Keywords",
      vm.document && Array.isArray(vm.document.keywords)
        ? vm.document.keywords.join(", ")
        : "",
    );
    row("DOI", vm.document && vm.document.doi);
    row("Origami address", book.origamiId, true);
    row("Identifier", book.identifier, true);
    row(
      "Format",
      book.isOrigami
        ? "Origami Text EPUB (Visual-Meta " +
            ((vm["visual-meta"] || {}).version || "?") +
            ", read from " +
            book.visualMetaSource +
            " copy)"
        : "Plain EPUB — no Visual-Meta found",
    );
    row("Generator", vm["visual-meta"] && vm["visual-meta"].generator);
    row("File", state.sourceName);
    if (vm.map && Array.isArray(vm.map.views) && vm.map.views.length)
      row(
        "Map views",
        vm.map.views.map((v) => v.name).join(", ") +
          " (" +
          (vm.map.nodes || []).length +
          " nodes)",
      );
    if (Array.isArray(vm.tables) && vm.tables.length)
      row(
        "Live tables",
        vm.tables.length +
          " with cell values" +
          (vm.tables.some((t) =>
            (t.cells || []).flat().some((c) => c && c.formula),
          )
            ? " and formulas"
            : ""),
      );
    const acc = (book.metadata.meta["schema:accessibilitySummary"] || [])[0];
    row("Accessibility", acc);
    about.appendChild(dl);
    if (book.warnings.length) {
      const w = el("div", "warn");
      w.style.margin = "12px 8px 0";
      w.textContent = book.warnings.join(" ");
      about.appendChild(w);
    }
    ui.about.appendChild(about);
  }

  function updateCurrentToc() {
    const i = currentElementIndex();
    if (i < 0) return;
    // nearest preceding heading with an address
    let curFrag = null;
    for (let k = i; k >= 0; k--) {
      const e = state.addressed[k];
      if (/^h[1-6]$/i.test(e.tagName) && e.id) {
        curFrag = e.id;
        break;
      }
    }
    for (const a of ui.toc.querySelectorAll("a"))
      a.classList.toggle("is-current", !!curFrag && a.dataset.frag === curFrag);
  }

  // ------------------------------------------------------------------ after render: where to go
  async function afterRender() {
    const params = new URLSearchParams(location.search);
    const hashFrag = location.hash
      ? decodeURIComponent(location.hash.slice(1))
      : "";
    const q = params.get("q") || "";
    let target = null;
    if (state.pending) {
      target = state.pending;
      state.pending = null;
    } else if (params.get("id") || hashFrag || q)
      target = { id: params.get("id"), fragment: hashFrag, q };
    // Consume the one-shot navigation parameters so a reload does not repeat them
    if (target) history.replaceState(null, "", location.pathname);

    if (target && target.id) {
      const book = state.book;
      const same =
        O.sameId(target.id, book.origamiId) ||
        O.sameId(target.id, book.identifier) ||
        O.sameId("urn:uuid:" + target.id, book.identifier) ||
        O.sameId(await O.identifierFromOrigamiId(target.id), book.identifier);
      if (!same)
        toast(
          "This file is not the document that link points at (" +
            target.id +
            ")",
          3200,
        );
    }
    if (target && target.fragment) {
      navigateTo(target.fragment, { quote: target.q || null });
    } else if (!(await restorePosition())) {
      state.iwin.scrollTo(0, 0);
    }
    setTimeout(updateCurrentToc, 50);
  }

  // ------------------------------------------------------------------ library UI
  async function renderLibrary() {
    let items = [];
    try {
      items = await L.list();
    } catch (e) {
      console.warn(e);
    }
    ui.library.textContent = "";
    ui.librarySection.hidden = !items.length;
    for (const it of items) {
      const li = el("li", "library__item");
      const open = el("button", "open");
      open.type = "button";
      open.appendChild(el("span", "library__title", it.title));
      const meta = el("span", "library__meta");
      meta.textContent = [it.authors.join(", "), it.date]
        .filter(Boolean)
        .join(" · ");
      if (it.origamiId) {
        meta.appendChild(document.createTextNode(" · "));
        meta.appendChild(el("code", null, it.origamiId));
      }
      if (!it.isOrigami)
        meta.appendChild(document.createTextNode(" · plain EPUB"));
      open.appendChild(meta);
      open.onclick = () => openFromLibrary(it.key);
      const rm = el("button", "remove", "Remove");
      rm.type = "button";
      rm.title = "Remove from library";
      rm.onclick = async () => {
        await L.remove(it.key);
        renderLibrary();
      };
      li.append(open, rm);
      ui.library.appendChild(li);
    }
  }

  // ------------------------------------------------------------------ chrome wiring
  function onGlobalKey(ev) {
    if (ev.key === "Escape") {
      hidePopover();
      ui.seltool.hidden = true;
      closeMenu();
    }
    if (
      (ev.key === "s" || ev.key === "S") &&
      !ev.metaKey &&
      !ev.ctrlKey &&
      !ev.altKey &&
      !(ev.target && /input|textarea/i.test(ev.target.tagName))
    ) {
      toggleSide();
    }
  }
  function toggleSide() {
    state.prefs.side = state.prefs.side === "open" ? "closed" : "open";
    savePrefs();
    applyPrefs();
  }
  function closeMenu() {
    const m = document.querySelector("#menu-text .menu");
    m.hidden = true;
    $("btn-text").setAttribute("aria-expanded", "false");
  }

  function wireChrome() {
    $("btn-sidebar").onclick = toggleSide;
    $("btn-home").onclick = () => {
      ui.body.dataset.view = "home";
      document.title = "Origami Reader";
      renderLibrary();
      hidePopover();
      ui.seltool.hidden = true;
    };
    $("btn-pick").onclick = () => ui.fileInput.click();
    ui.fileInput.onchange = () => {
      if (ui.fileInput.files[0]) openFile(ui.fileInput.files[0]);
      ui.fileInput.value = "";
    };
    ui.urlForm.onsubmit = (ev) => {
      ev.preventDefault();
      const u = ui.urlInput.value.trim();
      if (u) openURL(u);
    };
    $("btn-address").onclick = (ev) => {
      if (state.book) showPositionCard(ev.currentTarget);
      else toast("Open a book first");
    };
    $("btn-cite").onclick = copyToCite;
    $("btn-copy-link").onclick = copyLinkToSelection;

    // Drag & drop anywhere
    for (const t of [ui.drop, ui.paper]) {
      t.addEventListener("dragover", (e) => {
        e.preventDefault();
        ui.drop.classList.add("is-over");
      });
      t.addEventListener("dragleave", () =>
        ui.drop.classList.remove("is-over"),
      );
      t.addEventListener("drop", (e) => {
        e.preventDefault();
        ui.drop.classList.remove("is-over");
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) openFile(f);
      });
    }
    ui.drop.addEventListener("keydown", (e) => {
      if (e.key === "Enter") ui.fileInput.click();
    });

    // Text menu
    const menu = document.querySelector("#menu-text .menu");
    $("btn-text").onclick = () => {
      menu.hidden = !menu.hidden;
      $("btn-text").setAttribute(
        "aria-expanded",
        menu.hidden ? "false" : "true",
      );
    };
    for (const b of menu.querySelectorAll("[data-size]"))
      b.onclick = () => {
        state.prefs.fontSize = Math.min(
          30,
          Math.max(
            13,
            state.prefs.fontSize + (b.dataset.size === "+1" ? 1 : -1),
          ),
        );
        savePrefs();
        applyPrefs();
      };
    for (const b of menu.querySelectorAll("[data-theme]"))
      b.onclick = () => {
        state.prefs.theme = b.dataset.theme;
        savePrefs();
        applyPrefs();
      };
    $("opt-bookcss").onchange = (e) => {
      state.prefs.bookCSS = e.target.checked;
      savePrefs();
      applyPrefs();
    };
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#menu-text")) closeMenu();
      if (!e.target.closest("#popover, #btn-address, .side")) hidePopover();
    });
    document.addEventListener("keydown", onGlobalKey);

    // Side tabs
    for (const t of ui.side.querySelectorAll('[role="tab"]'))
      t.onclick = () => {
        for (const x of ui.side.querySelectorAll('[role="tab"]'))
          x.setAttribute("aria-selected", x === t ? "true" : "false");
        for (const p of ui.side.querySelectorAll('[role="tabpanel"]'))
          p.hidden = p.dataset.panel !== t.dataset.tab;
      };
    window.addEventListener("resize", () => {
      if (!ui.popover.hidden) positionPopover(state.popoverAnchor);
    });
  }

  // ------------------------------------------------------------------ boot
  async function boot() {
    wireChrome();
    await loadPrefs();
    await renderLibrary();
    const params = new URLSearchParams(location.search);
    const src = params.get("src");
    const id = params.get("id");
    if (src) {
      ui.urlInput.value = src;
      await openURL(src);
      return;
    }
    if (id) {
      const rec = await L.findByIdentity(id);
      if (rec) {
        await openFromLibrary(rec.key);
        return;
      }
      state.pending = {
        id,
        q: params.get("q") || "",
        fragment: location.hash
          ? decodeURIComponent(location.hash.slice(1))
          : "",
      };
      setHomeStatus(
        'The document "' +
          id +
          '" is not in your library yet. Open its EPUB and the link will land where it points.',
        true,
      );
    }
  }

  boot().catch((e) => {
    console.error(e);
    setHomeStatus(e.message, true);
  });
})();
