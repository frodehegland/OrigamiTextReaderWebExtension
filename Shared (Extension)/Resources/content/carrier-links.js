/* Carrier-link enhancement (spec §11.1).
 * Finds origamitext://open/<id> and https://origamitext.app/o/<id> links on
 * any page, marks them, and shows a citation card on hover/focus with the
 * id, fragment and quote the link carries, plus "Open in reader" and
 * "Copy address". */
(function () {
  'use strict';
  if (window.top !== window) return; // top frame only
  const api = globalThis.browser && globalThis.browser.runtime ? globalThis.browser : globalThis.chrome;
  const O = globalThis.OrigamiEPUB;
  if (!O) return;

  const SEL = 'a[href^="origamitext://open/"], a[href^="https://origamitext.app/o/"], a[href^="http://origamitext.app/o/"]';
  const MARK = 'data-origami-link';
  let card = null, hideTimer = null, current = null;

  function scan(root) {
    const links = (root.querySelectorAll ? root.querySelectorAll(SEL) : []);
    for (const a of links) {
      if (a.hasAttribute(MARK)) continue;
      const parsed = O.parseOrigamiLink(a.getAttribute('href'));
      if (!parsed) continue;
      a.setAttribute(MARK, parsed.carrier ? 'carrier' : 'scheme');
      a.addEventListener('mouseenter', () => show(a, parsed));
      a.addEventListener('focus', () => show(a, parsed));
      a.addEventListener('mouseleave', scheduleHide);
      a.addEventListener('blur', scheduleHide);
    }
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function ensureCard() {
    if (card) return card;
    card = el('div', 'origami-link-card');
    card.setAttribute('role', 'dialog');
    card.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    card.addEventListener('mouseleave', scheduleHide);
    document.documentElement.appendChild(card);
    return card;
  }

  function show(anchor, parsed) {
    clearTimeout(hideTimer);
    current = anchor;
    const c = ensureCard();
    c.textContent = '';
    c.appendChild(el('div', 'origami-link-card__kind', parsed.carrier ? 'Origami citation link' : 'Origami document link'));
    const idRow = el('div', 'origami-link-card__id', parsed.id);
    if (parsed.fragment) idRow.appendChild(el('span', 'origami-link-card__frag', '#' + parsed.fragment));
    c.appendChild(idRow);
    if (parsed.quote) c.appendChild(el('blockquote', 'origami-link-card__quote', parsed.quote));
    const actions = el('div', 'origami-link-card__actions');
    const openBtn = el('button', 'origami-link-card__btn', 'Open in reader');
    openBtn.type = 'button';
    openBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      api.runtime.sendMessage({ type: 'open-reader', params: { id: parsed.id, q: parsed.quote || '', fragment: parsed.fragment || '' } });
      hide();
    });
    const copyBtn = el('button', 'origami-link-card__btn', 'Copy address');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const addr = parsed.id + (parsed.fragment ? '#' + parsed.fragment : '');
      try { await navigator.clipboard.writeText(addr); copyBtn.textContent = 'Copied'; }
      catch (_) { copyBtn.textContent = 'Copy failed'; }
      setTimeout(() => { copyBtn.textContent = 'Copy address'; }, 1200);
    });
    actions.appendChild(openBtn);
    actions.appendChild(copyBtn);
    c.appendChild(actions);
    position(anchor);
    c.classList.add('is-visible');
  }

  function position(anchor) {
    const r = anchor.getBoundingClientRect();
    const c = card;
    c.style.left = '0px'; c.style.top = '0px';
    const w = c.offsetWidth, h = c.offsetHeight;
    let left = r.left + window.scrollX;
    let top = r.bottom + window.scrollY + 6;
    if (left + w > window.scrollX + window.innerWidth - 8) left = window.scrollX + window.innerWidth - w - 8;
    if (r.bottom + h + 6 > window.innerHeight && r.top - h - 6 > 0) top = r.top + window.scrollY - h - 6;
    c.style.left = Math.max(8, left) + 'px';
    c.style.top = top + 'px';
  }

  function scheduleHide() { clearTimeout(hideTimer); hideTimer = setTimeout(hide, 250); }
  function hide() { if (card) card.classList.remove('is-visible'); current = null; }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

  scan(document);
  let pending = null;
  const mo = new MutationObserver((muts) => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n);
    }, 300);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
