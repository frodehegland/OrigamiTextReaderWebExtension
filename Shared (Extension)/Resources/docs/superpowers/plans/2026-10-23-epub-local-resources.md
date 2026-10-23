# EPUB Local Resources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent automatic network requests from EPUB content without disabling packaged book CSS and images.

**Architecture:** A frame-policy utility establishes the browser-level deny rule before untrusted parsing. A separate EPUB resource utility resolves and rewrites CSS and image references against archive bytes. `reader.js` coordinates these utilities and keeps its existing rendering/interaction flow.

**Tech Stack:** Browser JavaScript, CSP, DOMPurify, Node/JSDOM unit tests, local Chrome headless network test.

**Spec:** `docs/superpowers/specs/2026-10-23-epub-local-resources-design.md`

## Global Constraints

- All implicit resources from the book stay local; explicit EPUB URL import and user-clicked external links remain possible.
- Keep book CSS, relative archive images/fonts/stylesheets, and the Book's own style switch.
- Keep Chrome/Safari support and the existing iframe event model; no origin-isolation change.
- Do not add a runtime dependency or commit work.

## Review Focus

- HTML fallback parser may request `<img>` before sanitization; browser test must cover it (Task 1).
- CSS imports and `url()` can occur in linked CSS, inline `<style>`, and `style` attributes; tests cover each source (Task 2).
- CSS escapes or unsupported syntax must not escape CSP even when not rewritten (Task 3).
- Relative imports resolve from their own stylesheet paths and cycles do not loop (Task 2).
- Explicit URL import and packaged cover images must still work (Task 3).

---

### Task 1: Browser-level resource boundary

**Files:**
- Create: `reader/frame-policy.js`, `test/frame-policy.test.js`
- Modify: `reader/reader.html`, `reader/reader.js`, `package.json`

**Interfaces:**
- Produces: `OrigamiFramePolicy.install(doc: Document): void`, called before book HTML parsing/insertion.
- Parent CSP permits bundled reader assets and explicit EPUB URL fetch; frame CSP permits only local blob images/fonts and inline/book blob CSS, with scripts and connections denied.

- [x] Write a failing browser regression: an HTML-fallback EPUB with external `<img>`/CSS causes a request to a local tracking server before the fix.
- [x] Run it and record the expected request.
- [x] Add the parent and frame policies, place them before untrusted parsing, and use the protected frame parser where necessary.
- [x] Run the browser regression: zero automatic tracker requests.

### Task 2: EPUB-only resource rewriting

**Files:**
- Create: `reader/epub-resources.js`, `test/epub-resources.test.js`
- Modify: `reader/reader.html`, `reader/reader.js`, `package.json`

**Interfaces:**
- Produces: `OrigamiEpubResources.create(book, blobURLs)` with methods for a package-only image URL, linked/inline CSS text, and a `style` attribute. All created blob URLs are collected for the existing lifecycle cleanup.

- [x] Write failing tests with hand-checked archive paths and expected local `blob:` references; include external and missing URLs, nested CSS imports, and a cycle.
- [x] Run focused tests to confirm they fail on absent behavior.
- [x] Implement a small CSS URL/import rewriter. Rewrite recognized relative references only when archive bytes exist; leave unknown/external references blocked by CSP.
- [x] Integrate it for image elements, linked stylesheets, `<style>` elements, and `style` attributes; preserve the CSS toggle.
- [x] Run focused tests, then all reader tests.

### Task 3: Browser verification and documentation

**Files:**
- Create or modify: `test/reader-network.test.js`
- Modify: `package.json`, `README.md`, `reader/reader.html`

**Interfaces:**
- Browser test asserts tracker request count, local asset rendering, and explicit URL import behavior.

- [x] Test absolute/obfuscated image and CSS URLs, local CSS resources, and user-initiated EPUB import in a real Chrome session.
- [x] Clarify the offline promise in documentation/UI, distinguishing stored data from explicit network actions.
- [x] Run `npm run check`, the browser regression, and `git diff --check`; record any existing warnings and Safari test gap.
