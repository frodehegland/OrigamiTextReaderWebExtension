const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { unzipSync, zipSync } = require("fflate");

const root = path.resolve(__dirname, "..");
const chrome =
  process.env.ORIGAMI_CHROME ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function makeBook(tracker) {
  const files = unzipSync(fs.readFileSync("test/sample-origami.epub"));
  const html = new TextDecoder().decode(files["content/paper.html"]);
  files["content/paper.html"] = new TextEncoder().encode(
    html
      .replace(
        "</head>",
        `<link rel="preload" as="fetch" href="${tracker}/preload" /><style>.remote-style { background-image: url("${tracker}/inline-style") } .escaped-style { background-image: u\\72l("${tracker}/escaped-style") } .local-head { background-image: url("images/fold.png") }</style></head>`,
      )
      .replace(
        "<body>",
        `<body><img id="remote-image" src="${tracker}/image"><img id="local-image" src="images/fold.png" /><p id="local-import" class="local-from-import">Local</p><div id="local-inline" style="background-image:url(images/fold.png)">Local</div><div class="remote-style">Inline CSS</div><div class="remote-css">Linked CSS</div><div class="escaped-style">Escaped inline CSS</div><div class="escaped-css">Escaped linked CSS</div><div id="remote-attribute" style="background-image: url('${tracker}/style-attr')">Style attribute</div>`,
      ),
  );
  const css = new TextDecoder().decode(files["content/style.css"]);
  files["content/style.css"] = new TextEncoder().encode(
    `@import "local.css"; @import "${tracker}/import.css";\n${css}\n.remote-css { background-image: url('${tracker}/linked-css') } .escaped-css { background-image: u\\72l('${tracker}/escaped-css') }`,
  );
  const nav = new TextDecoder().decode(files["content/nav.html"]);
  files["content/nav.html"] = new TextEncoder().encode(
    nav.replace("</body>", '<img src="/nav-pixel"></body>'),
  );
  files["content/local.css"] = new TextEncoder().encode(
    ".local-from-import { letter-spacing: 7px; }",
  );
  return Buffer.from(zipSync(files));
}

function runChrome(url, profile) {
  return spawn(chrome, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-crash-reporter",
    "--disable-background-networking",
    "--no-first-run",
    `--user-data-dir=${profile}`,
    url,
  ]);
}

async function main() {
  assert.ok(fs.existsSync(chrome), `Chrome not found: ${chrome}`);
  const requests = [];
  const tracker = http.createServer((request, response) => {
    requests.push(request.url);
    response.writeHead(200, { "content-type": "image/png" });
    response.end();
  });
  const trackerPort = await listen(tracker);
  const book = makeBook(`http://127.0.0.1:${trackerPort}`);
  const appRequests = [];
  let finish;
  const opened = new Promise((resolve) => (finish = resolve));
  const harness = `<!doctype html><html><body data-result="loading">
    <iframe id="reader" src="/reader/reader.html" style="width:1000px;height:700px"></iframe>
    <script>
      const reader = document.getElementById("reader");
      reader.addEventListener("load", () => {
        const doc = reader.contentDocument;
        doc.getElementById("url-input").value = location.origin + "/fixture.epub";
        doc.getElementById("url-form").requestSubmit();
      });
      const check = setInterval(() => {
        const doc = reader.contentDocument;
        if (doc?.body?.dataset.view === "reading") {
          const bookFrame = doc.getElementById("frame");
          const probe = bookFrame.contentDocument.createElement("script");
          probe.src = "/probe.js";
          bookFrame.contentDocument.head.append(probe);
          setTimeout(() => {
            const book = doc.getElementById("frame").contentDocument;
            const widthBeforeToggle = bookFrame.getBoundingClientRect().width;
            const image = book.getElementById("local-image");
            const imported = book.getElementById("local-import");
            const inline = book.getElementById("local-inline");
            const background = (selector) => book.defaultView.getComputedStyle(
              book.querySelector(selector)
            ).backgroundImage;
            const localAssetsWork = image?.naturalWidth > 0 &&
              book.defaultView.getComputedStyle(imported).letterSpacing === "7px" &&
              inline.style.backgroundImage.includes("blob:") &&
              background(".remote-style").includes("about:blank") &&
              background(".remote-css").includes("about:blank") &&
              background("#remote-attribute").includes("about:blank") &&
              background(".escaped-style").includes("/escaped-style") &&
              background(".escaped-css").includes("/escaped-css");
            doc.getElementById("btn-sidebar").click();
            setTimeout(() => {
              const widthAfterToggle = bookFrame.getBoundingClientRect().width;
              const sidebarDoesNotResizeBook =
                Math.abs(widthAfterToggle - widthBeforeToggle) < 0.5;
              const opened = localAssetsWork && sidebarDoesNotResizeBook;
              fetch("/done?status=" + (opened ? "opened" : "missing-assets"));
            }, 250);
          }, 800);
          clearInterval(check);
        } else if (doc?.getElementById("home-status")?.classList.contains("is-error")) {
          fetch("/done?status=error");
          clearInterval(check);
        }
      }, 100);
    </script></body></html>`;
  const app = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    appRequests.push(pathname);
    if (pathname === "/done") {
      finish(
        new URL(request.url, "http://localhost").searchParams.get("status"),
      );
      response.writeHead(200).end();
      return;
    }
    if (pathname === "/probe.js") {
      response.writeHead(200, { "content-type": "text/javascript" });
      response.end('document.body.dataset.scriptRan = "yes";');
      return;
    }
    if (pathname === "/harness") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(harness);
      return;
    }
    if (pathname === "/fixture.epub") {
      response.writeHead(200, { "content-type": "application/epub+zip" });
      response.end(book);
      return;
    }
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root + path.sep)) {
      response.writeHead(404).end();
      return;
    }
    fs.readFile(file, (error, contents) => {
      if (error) {
        response.writeHead(404).end();
        return;
      }
      const type =
        path.extname(file) === ".js"
          ? "text/javascript"
          : path.extname(file) === ".css"
            ? "text/css"
            : "text/html";
      response.writeHead(200, { "content-type": type });
      response.end(contents);
    });
  });
  const appPort = await listen(app);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "origami-network-"));
  let child;
  let timer;

  try {
    child = runChrome(`http://127.0.0.1:${appPort}/harness`, profile);
    let errors = "";
    child.stderr.on("data", (chunk) => (errors += chunk));
    const result = await Promise.race([
      opened,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out: ${appRequests}; ${errors}`)),
          15000,
        );
      }),
    ]);
    assert.equal(result, "opened", `Reader failed: ${appRequests}; ${errors}`);
    assert.equal(
      appRequests.includes("/probe.js"),
      false,
      "book script loaded",
    );
    assert.equal(
      appRequests.includes("/nav-pixel"),
      false,
      "navigation document loaded an image in the parent page",
    );
    assert.deepEqual(requests, [], `EPUB made network requests: ${requests}`);
    console.log("EPUB content made no automatic network requests.");
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null) {
      const stopped = new Promise((resolve) => child.once("close", resolve));
      child.kill();
      await stopped;
    }
    await close(app);
    await close(tracker);
    if (profile.startsWith(fs.realpathSync(os.tmpdir()) + path.sep)) {
      fs.rmSync(profile, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
