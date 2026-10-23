# EPUB DOMPurify Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the EPUB reader's bypassable HTML filter with locally bundled DOMPurify and an explicit, reviewable allow-list while retaining book CSS.

**Architecture:** `reader/epub-sanitizer.js` owns the policy and returns a sanitized Document; `reader/reader.js` only extracts archived CSS, calls that boundary, rewrites surviving images to archive blob URLs, and imports safe nodes. The DOMPurify distribution is pinned and loaded locally before the sanitizer and reader.

**Tech Stack:** Browser JavaScript, DOMPurify, Node tests with a browser-compatible DOM, Chrome smoke test.

**Spec:** `docs/superpowers/specs/2026-10-23-epub-dompurify-design.md`

## Global Constraints

- Keep archived stylesheets, inline `<style>`, inline `style` attributes, and the Book's own style switch.
- Preserve working SVG covers and Origami reader attributes/interactions.
- Do not change iframe sandbox, CSP, or any native bridge in this stage.
- Never bypass DOMPurify URI checks or set `SAFE_FOR_XML: false`.
- Keep security policy out of the already-large `reader/reader.js`.

## Review Focus

- XHTML with CDATA and the HTML fallback: both must sanitize without losing chapter text (Task 1 test).
- Encoded control characters in URL attributes: must not yield an executable URL (Task 1 test).
- Root/body attributes: harmless `dir`, `lang`, and `class` survive; handlers and unlisted `data-*` do not (Task 1 test).
- SVG image `xlink:href`: a local cover survives and is rewritten to a blob URL (Task 2 test).
- Visual-Meta JSON script: its text stays readable, but no book `script` reaches the iframe (Task 2 test).

---

### Task 1: Local sanitizer and focused policy

**Files:**
- Create: `lib/purify.min.js` (copy from the exact pinned npm package)
- Create: `reader/epub-sanitizer.js`
- Create: `test/epub-sanitizer.test.js`
- Modify: `package.json`, `package-lock.json`, `eslint.config.mjs`, `.prettierignore`

**Interfaces:**
- Consumes: `globalThis.DOMPurify` from `lib/purify.min.js`.
- Produces: `globalThis.OrigamiEpubSanitizer.sanitizeDocument(source: Document): Document`.

- [ ] **Step 1: Write failing sanitizer tests.** Assert harmless EPUB text/links and required Origami attributes survive; `java&#x09;script:`, direct `javascript:`, event handlers, scripts, frames, unsafe root/body attributes, and unlisted `data-*` do not. Include XHTML CDATA, malformed-XHTML HTML fallback, SVG image, and retained inline `style`.
- [ ] **Step 2: Run `node test/epub-sanitizer.test.js`.** Expected: fail because `OrigamiEpubSanitizer` is absent.
- [ ] **Step 3: Pin DOMPurify to an exact current release; copy its minified browser build into `lib/`; implement `sanitizeDocument`.** Normalize CDATA, replace only `#visual-meta-payload` with text in a safe prose element, sanitize the whole document with explicit `ALLOWED_TAGS`/`ALLOWED_ATTR`, `ALLOW_DATA_ATTR: false`, and `RETURN_DOM: true`; keep DOMPurify's default URI and XML safety checks. Treat missing DOMPurify as an error, never as an unsafe fallback.
- [ ] **Step 4: Run `node test/epub-sanitizer.test.js`.** Expected: pass.
- [ ] **Step 5: Commit Task 1 files.**

### Task 2: Reader integration and EPUB regressions

**Files:**
- Modify: `reader/reader.html`, `reader/reader.js`, `test/reader-one-page.test.js`, `package.json`

**Interfaces:**
- Consumes: `OrigamiEpubSanitizer.sanitizeDocument(source)` from Task 1.
- Produces: book content imported into the existing iframe only from the sanitized Document.

- [ ] **Step 1: Write failing renderer tests.** Assert a malicious second spine cannot add executable URLs/scripts/handlers, valid Origami data and internal links survive, root/body attributes come from the sanitized document, SVG cover reaches a blob URL, Visual-Meta appears as text, and book CSS plus its switch still work.
- [ ] **Step 2: Run `npm run test:reader`.** Expected: fail on at least one new security assertion.
- [ ] **Step 3: Load local DOMPurify and `epub-sanitizer.js` before `reader.js`; replace the manual filtering block with one sanitizer call.** Keep CSS extraction before sanitization, then use only sanitized root/body for attribute copying and image rewriting. Do not leave unresolved image URLs active. Update the Visual-Meta style selector for its safe text element.
- [ ] **Step 4: Run `npm run test:reader` and `npm run check`.** Expected: tests and formatting/lint pass; record any pre-existing warning.
- [ ] **Step 5: Smoke-test the bundled extension in Chrome with the checked-in Origami EPUB and an SVG-cover EPUB if available.** Expected: book, cover, CSS, and Origami interactions render; no book script executes.
- [ ] **Step 6: Commit Task 2 files.**
