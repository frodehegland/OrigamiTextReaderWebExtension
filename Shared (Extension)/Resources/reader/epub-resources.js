/* Turn URLs inside an EPUB into local blob URLs. CSP blocks syntax we do not handle. */
(function () {
  "use strict";

  const urlRule = /^url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/i;
  const importRule =
    /^@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)|"([^"]*)"|'([^']*)')([^;]*);/i;

  function create(book, blobURLs) {
    const assets = new Map();
    const stylesheets = new Map();
    const resolving = new Set();
    const mediaTypes = new Map(
      Object.values(book.manifest).map((item) => [item.path, item.mediaType]),
    );

    function localPath(fromPath, href) {
      const value = href.trim();
      if (!value || value.startsWith("#") || value.startsWith("//"))
        return null;
      if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
      const path = book.resolve(fromPath, value);
      return path && book.has(path) ? path : null;
    }

    function image(fromPath, href) {
      const path = localPath(fromPath, href);
      if (!path) return null;
      if (assets.has(path)) return assets.get(path);

      const blob = new Blob([book.bytes(path)], {
        type: mediaTypes.get(path) || "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      assets.set(path, url);
      blobURLs.push(url);
      return url;
    }

    function stylesheet(path) {
      if (resolving.has(path)) return null;
      if (stylesheets.has(path)) return stylesheets.get(path);

      resolving.add(path);
      const text = css(path, book.text(path));
      resolving.delete(path);
      const url = URL.createObjectURL(new Blob([text], { type: "text/css" }));
      stylesheets.set(path, url);
      blobURLs.push(url);
      return url;
    }

    function rewrite(fromPath, text, allowImports) {
      let result = "";
      for (let index = 0; index < text.length;) {
        if (text.startsWith("/*", index)) {
          const end = text.indexOf("*/", index + 2);
          const next = end < 0 ? text.length : end + 2;
          result += text.slice(index, next);
          index = next;
          continue;
        }
        if (text[index] === '"' || text[index] === "'") {
          const quote = text[index];
          let next = index + 1;
          while (next < text.length) {
            if (text[next] === "\\") next += 2;
            else if (text[next++] === quote) break;
          }
          result += text.slice(index, next);
          index = next;
          continue;
        }

        const atRule = text[index] === "@";
        const functionStart =
          (text[index] === "u" || text[index] === "U") &&
          (index === 0 || !/[\w-]/.test(text[index - 1]));
        if (!atRule && !functionStart) {
          result += text[index++];
          continue;
        }
        const remaining = text.slice(index);
        const imported = allowImports && importRule.exec(remaining);
        if (imported) {
          const href =
            imported[1] ??
            imported[2] ??
            imported[3] ??
            imported[4] ??
            imported[5];
          const path = localPath(fromPath, href);
          const mediaType = mediaTypes
            .get(path)
            ?.split(";")[0]
            .trim()
            .toLowerCase();
          const isCss =
            path && (mediaType === "text/css" || /\.css$/i.test(path));
          if (isCss) {
            const url = stylesheet(path);
            if (url) result += `@import url("${url}")${imported[6]};`;
          }
          index += imported[0].length;
          continue;
        }

        const urlMatch = urlRule.exec(remaining);
        if (urlMatch) {
          const href = (urlMatch[1] ?? urlMatch[2] ?? urlMatch[3]).trim();
          const url = href.startsWith("#") ? null : image(fromPath, href);
          result += href.startsWith("#")
            ? urlMatch[0]
            : url
              ? `url("${url}")`
              : 'url("about:blank")';
          index += urlMatch[0].length;
          continue;
        }
        result += text[index++];
      }
      return result;
    }

    function style(fromPath, text) {
      return rewrite(fromPath, text, false);
    }

    function css(fromPath, text) {
      return rewrite(fromPath, text, true);
    }

    return { image, css, style };
  }

  globalThis.OrigamiEpubResources = { create };
})();
