/* Local library: every EPUB opened in the reader is kept in IndexedDB so
 * origamitext:// and origamitext.app/o/ links can be resolved by identity
 * (dc:identifier or origami-id) without any server. Reading positions live
 * in extension storage keyed by identity.
 *
 * Classic script: exposes `OrigamiLibrary` on the global.
 */
(function (root) {
  'use strict';

  const DB_NAME = 'origami-reader';
  const DB_VERSION = 1;
  const STORE = 'books';
  const api = root.browser && root.browser.storage ? root.browser : root.chrome;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'key' });
          store.createIndex('origamiId', 'origamiIdLower', { unique: false });
          store.createIndex('lastOpened', 'lastOpened', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(db, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      let result;
      try { result = fn(store); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  function keyFor(book) {
    return (book.identifier || book.origamiId || ('file:' + book.title)).toLowerCase();
  }

  /** Save (or refresh) a book. `bytes` is the raw EPUB (Uint8Array/ArrayBuffer). */
  async function save(book, bytes, sourceName) {
    const db = await openDB();
    const record = {
      key: keyFor(book),
      identifier: book.identifier || '',
      origamiId: book.origamiId || '',
      origamiIdLower: (book.origamiId || '').toLowerCase(),
      title: book.title,
      authors: book.authors,
      date: book.date,
      isOrigami: book.isOrigami,
      sourceName: sourceName || '',
      size: bytes.byteLength,
      blob: new Blob([bytes], { type: 'application/epub+zip' }),
      addedAt: Date.now(),
      lastOpened: Date.now()
    };
    await tx(db, 'readwrite', s => {
      const get = s.get(record.key);
      get.onsuccess = () => {
        if (get.result) record.addedAt = get.result.addedAt;
        s.put(record);
      };
    });
    return record.key;
  }

  async function touch(key) {
    const db = await openDB();
    await tx(db, 'readwrite', s => {
      const get = s.get(key);
      get.onsuccess = () => { if (get.result) { get.result.lastOpened = Date.now(); s.put(get.result); } };
    });
  }

  async function list() {
    const db = await openDB();
    const all = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    all.sort((a, b) => b.lastOpened - a.lastOpened);
    return all.map(r => ({ ...r, blob: undefined }));
  }

  async function get(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function remove(key) {
    const db = await openDB();
    await tx(db, 'readwrite', s => s.delete(key));
  }

  /** Resolve an origami identity (origami-id, urn:uuid, or bare uuid) to a record. */
  async function findByIdentity(id) {
    if (!id) return null;
    const needle = String(id).trim().toLowerCase();
    const candidates = new Set([needle]);
    if (!needle.startsWith('urn:uuid:') && /^[0-9a-f-]{36}$/.test(needle)) candidates.add('urn:uuid:' + needle);
    if (root.OrigamiEPUB && root.OrigamiEPUB.identifierFromOrigamiId) {
      const derived = await root.OrigamiEPUB.identifierFromOrigamiId(id);
      if (derived) candidates.add(derived.toLowerCase());
    }
    const all = await list();
    for (const r of all) {
      if (candidates.has(r.key)) return r;
      if (r.origamiIdLower && candidates.has(r.origamiIdLower)) return r;
      if (r.identifier && candidates.has(r.identifier.toLowerCase())) return r;
    }
    return null;
  }

  // ---------- reading positions (extension storage) ----------

  function posKey(identity) { return 'pos:' + String(identity).toLowerCase(); }

  async function getPosition(identity) {
    if (!identity || !api || !api.storage) return null;
    const k = posKey(identity);
    const res = await api.storage.local.get(k);
    return (res && res[k]) || null;
  }

  async function setPosition(identity, pos) {
    if (!identity || !api || !api.storage) return;
    await api.storage.local.set({ [posKey(identity)]: pos });
  }

  async function getPrefs() {
    if (!api || !api.storage) return {};
    const res = await api.storage.local.get('prefs');
    return (res && res.prefs) || {};
  }

  async function setPrefs(prefs) {
    if (!api || !api.storage) return;
    await api.storage.local.set({ prefs });
  }

  root.OrigamiLibrary = { save, touch, list, get, remove, findByIdentity, keyFor, getPosition, setPosition, getPrefs, setPrefs };
})(typeof globalThis !== 'undefined' ? globalThis : self);
