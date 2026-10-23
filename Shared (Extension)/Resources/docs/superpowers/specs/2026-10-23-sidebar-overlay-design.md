# Sidebar Overlay Design

## Intent

Remove the visible delay when opening or closing the reader sidebar for very large EPUB documents. The panel should remain animated, but its animation must not resize the book iframe or reapply the book theme.

## Goals

- Display the sidebar above the reading area on desktop and mobile.
- Animate only `transform: translateX(...)`.
- Keep the iframe width stable while the panel opens and closes.
- Preserve the saved open/closed preference, keyboard shortcut, ARIA state, and reduced-motion behavior.

## Non-goals

- Do not virtualize or split the book DOM.
- Do not change EPUB rendering, navigation, or scroll-position behavior.
- Do not commit the changes.

## Approaches

- Remove animation: simplest and preserves the expanding reading area, but loses the requested motion.
- Overlay with `transform`: selected because it avoids book relayout during animation and keeps the existing panel UI.
- Virtualize book content: improves performance more broadly, but is disproportionate and risks anchors and saved positions.

## Design

`.layout` becomes the positioning container. `.side` is absolutely positioned over `.stage`, stays at its existing width, and moves off-canvas with `translateX(-100%)` when closed. Its transition changes from `margin-left` to `transform`; the existing reduced-motion rule disables it.

Sidebar preference rendering is extracted from `applyPrefs()`. `toggleSide()` updates only the sidebar state and ARIA attribute, avoiding `applyFrameTheme()` for a sidebar-only change.

## Verification

A real-browser regression checks that toggling the sidebar does not change the iframe width. A reader unit test checks that toggling the sidebar does not touch frame theme styles. Existing reader, formatting, and lint checks must continue to pass.
