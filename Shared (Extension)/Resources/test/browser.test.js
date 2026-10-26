const {
  chromium,
} = require("/home/claude/.npm-global/lib/node_modules/playwright");
const path = require("path");
(async () => {
  const ext = path.resolve(__dirname, "..");
  const ctx = await chromium.launchPersistentContext("", {
    headless: true,
    channel: "chromium",
    args: ["--disable-extensions-except=" + ext, "--load-extension=" + ext],
    viewport: { width: 1200, height: 800 },
  });
  let sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
  const id = sw.url().split("/")[2];
  console.log("extension id", id);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      errors.push(m.type() + ": " + m.text());
  });
  await page.goto(`chrome-extension://${id}/reader/reader.html`);
  await page.screenshot({ path: "/home/claude/shot-home.png" });
  await page.setInputFiles(
    "#file-input",
    path.join(__dirname, "sample-origami.epub"),
  );
  await page.waitForSelector('body[data-view="reading"]');
  await page.waitForTimeout(600);
  console.log(
    "title bar:",
    await page.textContent("#doc-title"),
    "|",
    await page.textContent("#doc-by"),
  );
  const f = page.frames().find((fr) => fr !== page.mainFrame());
  console.log(
    "frame body chars",
    await f.evaluate(() => document.body.innerText.length),
  );
  console.log(
    "img loaded",
    await f.evaluate(() => {
      const i = document.querySelector("img");
      return i && i.complete && i.naturalWidth;
    }),
  );
  console.log(
    "vm hidden",
    await f.evaluate(
      () => getComputedStyle(document.getElementById("visual-meta")).display,
    ),
  );
  console.log(
    "cdata payload parses",
    await f.evaluate(() => {
      try {
        return !!JSON.parse(
          document.getElementById("visual-meta-payload").textContent,
        )["visual-meta"];
      } catch (e) {
        return e.message;
      }
    }),
  );
  await page.screenshot({ path: "/home/claude/shot-reading.png" });
  // stretchtext
  await f.click("a.ot-stretchtext");
  console.log(
    "stretch open",
    await f.evaluate(
      () => !document.getElementById("stretch-1").hasAttribute("hidden"),
    ),
    await f.textContent("a.ot-stretchtext"),
  );
  // citation popover
  await f.click('a.citation[href="#ref-3"]');
  await page.waitForSelector("#popover:not([hidden])");
  console.log(
    "citation popover:",
    (await page.textContent("#popover-body"))
      .replace(/\s+/g, " ")
      .slice(0, 200),
  );
  await page.screenshot({ path: "/home/claude/shot-citation.png" });
  await page.keyboard.press("Escape");
  // internal citation
  await f.click('a.citation[href="#ref-2"]');
  await page.waitForSelector("#popover:not([hidden])");
  console.log(
    "internal popover:",
    (await page.textContent("#popover-body"))
      .replace(/\s+/g, " ")
      .slice(0, 220),
  );
  await page.keyboard.press("Escape");
  // note popover
  await f.click('a[role="doc-noteref"]');
  await page.waitForSelector("#popover:not([hidden])");
  console.log(
    "note popover:",
    (await page.textContent("#popover-body"))
      .replace(/\s+/g, " ")
      .slice(0, 120),
  );
  await page.keyboard.press("Escape");
  // concept
  await f.click('dfn[data-concept="Visual-Meta"]');
  await page.waitForSelector("#popover:not([hidden])");
  console.log(
    "concept popover:",
    (await page.textContent("#popover-body"))
      .replace(/\s+/g, " ")
      .slice(0, 120),
  );
  await page.keyboard.press("Escape");
  // toc nav + highlight via origami link into a hidden aside
  await page.evaluate(() => {
    const a = document.createElement("a");
    a.href =
      "origamitext://open/f.hegla.093252x?q=own%20id%20from%20the%20source#p5";
    a.id = "tlink";
    a.textContent = "x";
    document.body.appendChild(a);
  });
  // simulate follow inside the book: call navigate via a link in the frame
  await f.evaluate(() => {
    const a = document.createElement("a");
    a.href =
      "origamitext://open/f.hegla.093252x?q=%C3%B3wn%20id%20from%20the%20source#p5";
    a.id = "inlink";
    a.textContent = "go";
    document.body.appendChild(a);
  });
  await f.click("#inlink");
  await page.waitForTimeout(500);
  console.log(
    "highlight:",
    await f.evaluate(() =>
      Array.from(document.querySelectorAll("mark.ot-q"))
        .map((m) => m.textContent)
        .join("|"),
    ),
  );
  console.log(
    "aside opened for fragment",
    await f.evaluate(
      () => !document.getElementById("stretch-1").hasAttribute("hidden"),
    ),
  );
  await page.screenshot({ path: "/home/claude/shot-highlight.png" });
  // selection → copy to cite
  await f.evaluate(() => {
    const p = document.getElementById("2B");
    const r = document.createRange();
    r.setStart(p.firstChild, 0);
    r.setEnd(p.firstChild, 44);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  });
  await page.waitForSelector("#seltool:not([hidden])", { timeout: 3000 });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.click("#btn-cite");
  await page.waitForTimeout(300);
  console.log("toast:", await page.textContent("#toast"));
  const clip = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const out = {};
    for (const it of items)
      for (const t of it.types) out[t] = await (await it.getType(t)).text();
    return out;
  });
  console.log("clipboard:", clip);
  // position persistence: scroll to section 3, reload, check restore
  await f.evaluate(() => document.getElementById("3").scrollIntoView());
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector("#library-section:not([hidden])");
  console.log(
    "library:",
    (await page.textContent("#library")).replace(/\s+/g, " ").slice(0, 120),
  );
  await page.click(".library__item button.open");
  await page.waitForSelector('body[data-view="reading"]');
  await page.waitForTimeout(700);
  const f2 = page.frames().find((fr) => fr !== page.mainFrame());
  console.log(
    "restored scrollY",
    await f2.evaluate(() => window.scrollY),
    "current toc",
    await page.evaluate(
      () => (document.querySelector(".toc a.is-current") || {}).textContent,
    ),
  );
  // sidebar tabs
  await page.click('[data-tab="concepts"]');
  console.log(
    "concepts:",
    (await page.textContent("#concepts")).replace(/\s+/g, " ").slice(0, 80),
  );
  await page.click('[data-tab="about"]');
  console.log(
    "about:",
    (await page.textContent("#about")).replace(/\s+/g, " ").slice(0, 200),
  );
  // dark theme
  await page.click("#btn-text");
  await page.click('[data-theme="dark"]');
  await page.keyboard.press("Escape");
  await page.click('[data-tab="contents"]');
  await page.screenshot({ path: "/home/claude/shot-dark.png" });
  // link with id param → opens from library
  await page.goto(
    `chrome-extension://${id}/reader/reader.html?id=f.hegla.093252x&q=fold%2C%20not%20an%20attachment#3B`,
  );
  await page.waitForSelector('body[data-view="reading"]');
  await page.waitForTimeout(700);
  const f3 = page.frames().find((fr) => fr !== page.mainFrame());
  console.log(
    "id-link highlight:",
    await f3.evaluate(() =>
      Array.from(document.querySelectorAll("mark.ot-q"))
        .map((m) => m.textContent)
        .join("|"),
    ),
  );
  // content script on a web page
  const http = require("http");
  const srv = http
    .createServer((q, r) => {
      r.setHeader("content-type", "text/html");
      r.end(
        '<p>See <a href="https://origamitext.app/o/f.hegla.093252x?q=stable%20id#2B">Hegland 2026</a>.</p>',
      );
    })
    .listen(8765);
  const web = await ctx.newPage();
  await web.goto("http://127.0.0.1:8765/");
  await web.waitForTimeout(800);
  await web.hover("a");
  await web.waitForTimeout(300);
  console.log(
    "card:",
    (await web.textContent(".origami-link-card")).replace(/\s+/g, " "),
  );
  await web.screenshot({ path: "/home/claude/shot-card.png" });
  srv.close();
  console.log(
    "content script marked link:",
    await web.evaluate(() =>
      document.querySelector("a").getAttribute("data-origami-link"),
    ),
  );
  console.log("errors:", errors);
  await ctx.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
