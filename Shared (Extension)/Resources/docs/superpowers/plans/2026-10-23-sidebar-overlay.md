# Sidebar Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Animate the sidebar as an overlay without resizing or restyling the loaded EPUB.

**Architecture:** CSS positions the sidebar over the full-width stage and animates only its transform. JavaScript applies sidebar state separately from theme preferences so a toggle does not touch the book frame.

**Tech Stack:** Browser JavaScript, CSS, JSDOM tests, headless Chrome regression test.

**Spec:** `docs/superpowers/specs/2026-10-23-sidebar-overlay-design.md`

## Global Constraints

- Keep saved preferences, keyboard control, ARIA state, and reduced-motion behavior.
- Do not change EPUB rendering or add dependencies.
- Do not create commits.

## Review Focus

- Desktop toggle leaves iframe width unchanged.
- Closed overlay does not intercept interaction with the book.
- Mobile keeps the existing overlay behavior.
- `prefers-reduced-motion` still removes the transition.
- Sidebar-only changes do not reapply frame theme styles.

---

### Task 1: Transform-based sidebar overlay

**Files:**

- Modify: `reader/reader.css`
- Modify: `reader/reader.js`
- Modify: `test/reader-one-page.test.js`
- Modify: `test/reader-network.test.js`

**Interfaces:**

- Produces: `applySidePreference(): void`, used by `applyPrefs()` and `toggleSide()`.
- Produces: overlay CSS whose open and closed states preserve the stage width.

- [x] Add a reader test proving `toggleSide()` changes sidebar state without writing frame theme properties; run it and observe the expected failure.
- [x] Add a Chrome assertion proving the iframe width remains unchanged after a sidebar toggle; run it and observe the expected failure.
- [x] Extract `applySidePreference()`, call it from `applyPrefs()` and `toggleSide()`, and expose it only through existing runtime wiring.
- [x] Position `.side` absolutely and replace the `margin-left` transition with `transform`; make the closed panel non-interactive.
- [x] Run focused tests, `npm run check`, `npm run test:network`, and `git diff --check`.
