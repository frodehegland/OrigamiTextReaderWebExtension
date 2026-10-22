/* Background service worker (Chrome MV3 / Safari Web Extension).
 * Opens the reader on toolbar click, from the link context menu, and on
 * request from the content script when an origami link is activated. */
const api =
  globalThis.browser && globalThis.browser.runtime
    ? globalThis.browser
    : globalThis.chrome;

function readerURL(params) {
  const url = new URL(api.runtime.getURL("reader/reader.html"));
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === "") continue;
    if (k === "fragment") url.hash = encodeURIComponent(v);
    else url.searchParams.set(k, v);
  }
  return url.toString();
}

function openReader(params) {
  return api.tabs.create({ url: readerURL(params) });
}

api.action.onClicked.addListener(() => {
  openReader({});
});

api.runtime.onInstalled.addListener(() => {
  try {
    api.contextMenus.create({
      id: "origami-open-epub-link",
      title: "Open in Origami Reader",
      contexts: ["link"],
      targetUrlPatterns: ["*://*/*.epub", "*://*/*.epub?*", "file:///*.epub"],
    });
  } catch (e) {
    /* menus may already exist */
  }
});

if (api.contextMenus && api.contextMenus.onClicked) {
  api.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === "origami-open-epub-link" && info.linkUrl)
      openReader({ src: info.linkUrl });
  });
}

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "open-reader") {
    openReader(msg.params || {}).then(
      () => sendResponse({ ok: true }),
      (e) => sendResponse({ ok: false, error: String(e) }),
    );
    return true;
  }
  if (msg.type === "reader-url") {
    sendResponse({ url: readerURL(msg.params || {}) });
    return false;
  }
});
