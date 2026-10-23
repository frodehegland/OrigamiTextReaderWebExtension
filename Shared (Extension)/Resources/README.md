# Origami Text Reader — browser extension

Reads Origami Text EPUBs (spec v1.0, 4 Sept 2026) in Chrome and Safari from one
codebase. Any EPUB 3 opens; Origami ones get the extra behaviour.

## What it does

**Reader** (`reader/`) — toolbar button, or right-click any `.epub` link → *Open in Origami Reader*.
- Opens from file, drag-and-drop, a URL, or the local library.
- Resolves the OPF via `container.xml`, renders the spine document in a sandboxed
  iframe (book scripts are blocked), rewrites archived images and CSS resources
  to local blob URLs, and keeps the book's own CSS (switchable off) under a
  reader theme (light / sepia / dark, text size). CSP blocks automatic network
  requests from EPUB content.
- Visual-Meta read from `visual-meta.json`, falling back to the end-anchored
  embedded copy; the `#visual-meta` appendix is hidden behind a *Show Visual-Meta* toggle.
- Stretchtext: `»»` markers toggle `hidden` / `aria-expanded` on click, Enter, Space;
  fragment targets inside a hidden aside expand it first.
- Citations: popover from `data-csl-json` → `data-bibtex` → visible text, with DOI/URL,
  *Copy BibTeX*, *Copy CSL-JSON*, *Go to reference*; internal citations also get
  *Open document* and origamitext:// / origamitext.app links.
- Notes: `doc-noteref` daggers show the note as a popover. Concepts: `<dfn data-concept>`
  shows the definition from Visual-Meta.
- Side panel: Contents (from `nav.html`, with addresses), Concepts, References, About
  (identity, format, accessibility summary, any parse warnings).
- Fragment navigation by `id`, then `data-id`, then case-insensitive.
- `?q=` quote highlighting inside the target paragraph, case- and diacritic-insensitive;
  falls back to the paragraph if the words aren't there.
- Copy to Cite on text selection: HTML `<a href="origamitext://…">(Author, Year)</a>`,
  plain `“Quoted” (Author, Year) [id#fragment]`, and — where the browser allows custom
  clipboard formats — the JSON payload as `web application/x-origami-citation+json`.
  (Browsers can't write Apple pasteboard types, so the JSON flavour uses a web custom format.)
- Reading position remembered per document identity, keyed by `data-id` (address as
  fallback), plus a furthest-read mark. *Copy position* gives an origamitext:// or web link.
- Library: every opened EPUB is kept in IndexedDB so `origamitext://open/<id>` and
  `https://origamitext.app/o/<id>` links resolve by identity (origami-id, `urn:uuid`, or the
  uuid derived from the origami-id per spec §3). Books and reading positions
  stay in this browser; fetching an EPUB by URL or opening an external link
  explicitly contacts that site.

**Carrier links on every page** (`content/`) — hovering an origamitext:// or origamitext.app/o/
link shows a card with id, fragment and quote, *Open in reader* and *Copy address*.

## Install — Chrome

1. `chrome://extensions` → enable *Developer mode* → *Load unpacked* → choose this folder.
2. Click the toolbar icon, or drop an EPUB on the reader page.

## Install — Safari (macOS, and iOS/iPadOS via the same project)

Safari needs the same code wrapped in an Xcode project. One command generates it:

```sh
./make-safari.sh              # runs xcrun safari-web-extension-converter on this folder
```

Then in Xcode: pick your team, run the macOS target, and enable the extension in
Safari → Settings → Extensions. For unsigned local builds, Safari → Settings → Developer →
*Allow unsigned extensions* (per session). The script leaves the generated project in
`../OrigamiTextReader-Safari/`; the extension sources are copied in, so re-run the script
(or copy the changed files) after editing.

Safari notes: the background script runs as a non-persistent service worker (fine here —
it only opens tabs); per-site permission is asked the first time the content script runs on a
site; custom clipboard formats aren't supported, so Copy to Cite writes HTML + plain text there.

## Layout

```
manifest.json            MV3, shared by Chrome and Safari
background.js            toolbar action, context menu, open-reader messages
content/carrier-links.*  hover cards for origami links on web pages
reader/                  the reader page (html/css/js)
lib/origami-epub.js      package + Visual-Meta parser, origami link parse/build, id derivation
lib/library.js           IndexedDB library + reading positions
lib/fflate.min.js        unzip (MIT)
tools/make-fixture.py    builds test/sample-origami.epub, a spec-conformant sample
test/                    parser test (node) and end-to-end test (Playwright)
```

## Not in this build

- Map view, live-table recomputation, and annotation overlays (§11.2 stretch goals).
- Intercepting `.epub` navigations automatically (a `declarativeNetRequest` redirect would
  hijack every EPUB download, so it's a context-menu action instead).
- Any writing/export.
