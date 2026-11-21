// Earth Diary — local storage layer (IndexedDB, with an in-memory fallback).
// Stores: memories (the pins + diary), media (original photo/video blobs),
// thumbs (small preview images), kv (settings).

const DB_NAME = 'earth-diary';
const DB_VERSION = 1;
const STORES = ['memories', 'media', 'thumbs', 'kv'];

let dbPromise = null;
let memoryMode = false;
const mem = { memories: new Map(), media: new Map(), thumbs: new Map(), kv: new Map() };

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch { memoryMode = true; return resolve(null); }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('memories')) db.createObjectStore('memories', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('media')) {
        const s = db.createObjectStore('media', { keyPath: 'id' });
        s.createIndex('memoryId', 'memoryId');
      }
      if (!db.objectStoreNames.contains('thumbs')) db.createObjectStore('thumbs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => { memoryMode = true; resolve(null); };
    req.onblocked = () => { memoryMode = true; resolve(null); };
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then((db) => {
    if (!db) return fn(null);
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      let out;
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transaction aborted'));
      const r = fn(t);
      if (r && 'onsuccess' in r) r.onsuccess = () => { out = r.result; };
      else out = r;
    });
  });
}

const keyOf = (store) => (store === 'kv' ? 'k' : 'id');

async function put(store, value) {
  if (memoryMode || !(await open())) { mem[store].set(value[keyOf(store)], value); return; }
  return tx(store, 'readwrite', (t) => t.objectStore(store).put(value));
}
async function get(store, key) {
  if (memoryMode || !(await open())) return mem[store].get(key);
  return tx(store, 'readonly', (t) => t.objectStore(store).get(key));
}
async function del(store, key) {
  if (memoryMode || !(await open())) { mem[store].delete(key); return; }
  return tx(store, 'readwrite', (t) => t.objectStore(store).delete(key));
}
async function all(store) {
  if (memoryMode || !(await open())) return [...mem[store].values()];
  return tx(store, 'readonly', (t) => t.objectStore(store).getAll());
}

// Some browsers (Safari in private windows, some embedded WebKit builds) refuse
// to store Blob objects in IndexedDB. For those, keep the raw bytes instead.
async function putBlobRecord(store, rec) {
  try { return await put(store, rec); }
  catch (err) {
    if (!rec.blob || (err && err.name === 'QuotaExceededError')) throw err;
    const { blob, ...rest } = rec;
    return put(store, { ...rest, buf: await blob.arrayBuffer(), type: blob.type || rest.mime || '' });
  }
}
async function getBlobRecord(store, id) {
  const rec = await get(store, id);
  if (rec && !rec.blob && rec.buf) rec.blob = new Blob([rec.buf], { type: rec.type || '' });
  return rec;
}

export const db = {
  async init() { await open(); return !memoryMode; },
  get isMemoryOnly() { return memoryMode; },

  allMemories: () => all('memories'),
  putMemory: (m) => put('memories', m),
  getMemory: (id) => get('memories', id),

  async deleteMemory(m) {
    for (const item of m.media || []) { await del('media', item.id); await del('thumbs', item.id); }
    await del('memories', m.id);
  },

  putMedia: (rec) => putBlobRecord('media', rec),   // { id, memoryId, blob, name, mime }
  getMedia: (id) => getBlobRecord('media', id),
  deleteMedia: async (id) => { await del('media', id); await del('thumbs', id); },
  putThumb: (rec) => putBlobRecord('thumbs', rec),  // { id, blob }
  getThumb: (id) => getBlobRecord('thumbs', id),

  async getKV(k, fallback) { const r = await get('kv', k); return r ? r.v : fallback; },
  setKV: (k, v) => put('kv', { k, v }),

  async wipe() {
    for (const s of ['memories', 'media', 'thumbs']) {
      if (memoryMode || !(await open())) mem[s].clear();
      else await tx(s, 'readwrite', (t) => t.objectStore(s).clear());
    }
  },

  async usage() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        return { used: e.usage || 0, quota: e.quota || 0 };
      }
    } catch {}
    return { used: 0, quota: 0 };
  },

  async persist() {
    try {
      if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
    } catch {}
    return false;
  }
};

export const newId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));

export { STORES };
