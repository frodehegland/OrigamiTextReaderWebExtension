# EPUB resources must remain local

## Intent

Opening an EPUB must not reveal that the user is reading it through automatic requests embedded in book markup or CSS. The reader may still fetch an EPUB URL when the user explicitly chooses that action, and clicking an external link remains an explicit user action.

## Goals and boundaries

- Book HTML and CSS must not automatically request network resources, including absolute `<img>` URLs, CSS `@import`, and CSS `url()` in linked stylesheets, `<style>`, or `style` attributes.
- Keep the book's CSS switch and ordinary CSS declarations. Resolve relative references only against files present in the EPUB archive, expose them to the frame via local blob URLs, and fail closed for missing or external references.
- Apply CSP before any untrusted resource is parsed or inserted. The parent reader needs its bundled scripts/styles and an explicit user-initiated EPUB URL fetch; the book frame must not have network access or script execution.
- Keep the current Chrome and Safari iframe interaction model; origin isolation is a separate task. Do not broaden extension host permissions or add a native bridge.
- State the explicit URL-import exception in the README and reader UI instead of making an unconditional offline claim.

## Approaches

1. **Selected: CSP plus EPUB-only resource rewriting.** CSP is the browser-enforced backstop; a small resource utility maps ordinary relative CSS/image references to archive bytes and blob URLs. This preserves CSS assets and works in Chrome/Safari, with extra implementation and browser-test effort but no new runtime dependency.
2. Strip every CSS `@import` and `url()`. Smaller code and bundle with broad browser support, but it breaks packaged background images and fonts, so it does not meet the selected behavior.
3. Rewrite URLs without CSP. Similar layout fidelity and less policy setup, but CSS syntax and pre-sanitization parsing leave bypass opportunities; rejected for a privacy boundary.

## Design

Put the parent document policy first in `reader/reader.html`, restricting automatic image/style/font loads while allowing the existing explicit `fetch(url)` path. Install a stricter policy in the book frame before parsing or appending EPUB content. Use the protected frame's parser for the HTML fallback. Keep HTML sanitization in `epub-sanitizer.js`; keep package resource lookup and CSS rewriting in a separate utility, not in `reader.js`. Unknown CSS syntax must never widen the CSP: unsupported resources may fail to render but may not reach a remote host.

## Verification

Add focused tests for external and local image/CSS references, relative imports, inline styles, missing files, and the book-CSS toggle. Use a real Chrome test with a local tracking server to assert zero automatic requests while packaged images/CSS still render, and smoke-test Safari manually where available. Run the full project check. Do not commit automatically.
