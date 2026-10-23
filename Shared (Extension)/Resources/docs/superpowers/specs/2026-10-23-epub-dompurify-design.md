# EPUB HTML sanitization with DOMPurify

## Intent

Replace the reader's hand-written HTML filter, which misses encoded and whitespace-obfuscated `javascript:` URLs, with a maintained sanitizer. This is the first of four security layers; CSP, iframe isolation, and native-bridge hardening are separate follow-up work.

## Goals and boundaries

- Sanitize every EPUB spine document before any book element or attribute is imported into the live reader iframe, including copied `html` and `body` attributes.
- Use an explicit allow-list of EPUB/Origami text, structural, table, image, and necessary SVG elements and attributes. Preserve the Origami attributes consumed by `reader.js`; reject event handlers, executable URLs, frames, forms, and executable book scripts.
- Keep the book's archived stylesheets, inline `<style>` blocks, inline `style` attributes, and the existing Book's own style switch. Preserve working SVG covers.
- Keep Visual-Meta display without importing its JSON `<script>` element; show the already-parsed payload as text.
- Vendor a pinned DOMPurify build locally so the extension does not fetch sanitizer code from a CDN.

This stage does not claim to sanitize CSS or prevent CSS-based network requests. It does not change the iframe sandbox, CSP, or any native bridge. Avoid disabling `SAFE_FOR_XML` or weakening DOMPurify's URI checks.

## Approaches

1. **Selected: DOMPurify with an explicit allow-list.** Small runtime cost per chapter and one local dependency; stricter and reviewable, at the price of maintaining the EPUB/Origami list as real books reveal necessary markup. Runs in the same supported modern Chrome/Safari browsers as the current reader.
2. DOMPurify default allow-list plus a few forbidden tags. Same dependency and browser support, less configuration work, but admits more markup and attributes than this reader requires.
3. Extend the current regex/DOM loop. No new bundle bytes, but encoded URLs and namespace/parser differences make it fragile; rejected for this security fix.

## Design

For each spine item, parse the source inertly, collect only CSS paths present in the EPUB archive plus its inline CSS, then sanitize the document content with DOMPurify before importing it into the iframe. Sanitize root/body attributes too; do not copy any attribute from the unsanitized document. Rewrite retained image and SVG-image references to blob URLs from archive bytes, as the reader already does. Never add back an attribute rejected by DOMPurify unless it is a newly generated, trusted blob URL. Keep the existing chapter ordering and reader event handling.

The allow-list should retain common EPUB prose/heading/list/table markup, anchor links and IDs, images, SVG cover primitives, accessibility attributes used by the book, and only Origami `data-*` attributes read by the reader. Unsupported elements may lose presentation, but their safe text should remain. The sanitizer must run in the browser's DOM implementation; automated tests should include a real-browser path in addition to the current LinkeDOM rendering test where feasible.

## Verification

Add regression cases for `java&#x09;script:` and other executable URL/event-handler vectors, unsafe root/body attributes, nested frames/scripts, valid internal links, Origami interactions, CSS retention, and SVG covers. Run the project checks and manually open the available EPUB fixtures in Chrome and Safari when those browsers are available.

## Remaining builder decisions

Choose the exact pinned DOMPurify release and enumerate the smallest allow-list from the checked-in Origami fixture and supported EPUB examples. Record any book markup that cannot be retained safely rather than silently broadening the policy.
