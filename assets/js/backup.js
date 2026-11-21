// Earth Diary — export / import a full backup as a .zip
// Layout: earth-diary.json (all memories) + media/<id>.<ext> + thumbs/<id>.jpg

import { db } from './db.js';

const FORMAT = 'earth-diary-backup';

const extOf = (item) => {
  const fromName = (item.name || '').includes('.') ? item.name.split('.').pop().toLowerCase() : '';
  if (fromName && fromName.length <= 5) return fromName;
  const sub = (item.mime || '').split('/')[1] || (item.kind === 'video' ? 'mp4' : 'jpg');
  return sub.replace('quicktime', 'mov').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '');
};

export async function exportBackup(memories) {
  const { Zip, ZipPassThrough, ZipDeflate, strToU8 } = window.fflate;
  const chunks = [];
  let fail = null;
  const done = new Promise((resolve, reject) => {
    const zip = new Zip((err, chunk, final) => {
      if (err) { fail = err; reject(err); return; }
      chunks.push(chunk);
      if (final) resolve();
    });
    (async () => {
      try {
        const manifest = {
          format: FORMAT, version: 1, exportedAt: new Date().toISOString(), app: 'Earth Diary',
          memories: memories.map((m) => ({
            ...m,
            media: (m.media || []).map((it) => ({ ...it, file: `media/${it.id}.${extOf(it)}` }))
          }))
        };
        const json = new ZipDeflate('earth-diary.json', { level: 6 });
        zip.add(json);
        json.push(strToU8(JSON.stringify(manifest, null, 1)), true);

        for (const m of manifest.memories) {
          for (const it of m.media) {
            const rec = await db.getMedia(it.id);
            if (rec && rec.blob) {
              const f = new ZipPassThrough(it.file);     // photos/videos are already compressed
              zip.add(f);
              f.push(new Uint8Array(await rec.blob.arrayBuffer()), true);
            }
            const th = await db.getThumb(it.id);
            if (th && th.blob) {
              const f = new ZipPassThrough(`thumbs/${it.id}.jpg`);
              zip.add(f);
              f.push(new Uint8Array(await th.blob.arrayBuffer()), true);
            }
          }
        }
        zip.end();
      } catch (e) { reject(e); }
    })();
  });
  await done;
  if (fail) throw fail;
  return new Blob(chunks, { type: 'application/zip' });
}

// Returns the list of memories that were added or updated.
export async function importBackup(file, existingById) {
  const { unzipSync, strFromU8 } = window.fflate;
  const buf = new Uint8Array(await file.arrayBuffer());
  let manifest, files = {};
  if (buf[0] === 0x7b) {                                   // plain JSON
    manifest = JSON.parse(new TextDecoder().decode(buf));
  } else {
    files = unzipSync(buf);
    if (!files['earth-diary.json']) throw new Error('not a backup');
    manifest = JSON.parse(strFromU8(files['earth-diary.json']));
  }
  if (!manifest || manifest.format !== FORMAT || !Array.isArray(manifest.memories)) throw new Error('not a backup');

  // A backup file can come from anywhere, so only accept well-formed records.
  const okId = (v) => typeof v === 'string' && /^[\w-]{1,80}$/.test(v);
  const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const changed = [];
  for (const raw of manifest.memories) {
    if (!raw || !okId(raw.id) || typeof raw.lat !== 'number' || typeof raw.lng !== 'number') continue;
    if (!isFinite(raw.lat) || !isFinite(raw.lng) || Math.abs(raw.lat) > 90) continue;
    raw.title = text(raw.title, 200); raw.text = text(raw.text, 200000); raw.mood = text(raw.mood, 8);
    raw.date = /^\d{4}-\d{2}-\d{2}$/.test(raw.date || '') ? raw.date : '';
    raw.tags = Array.isArray(raw.tags) ? raw.tags.filter((x) => typeof x === 'string').map((x) => x.slice(0, 60)).slice(0, 12) : [];
    raw.pin = { char: text(raw.pin?.char, 20), color: text(raw.pin?.color, 9) || null };
    if (raw.place && typeof raw.place === 'object') {
      const p = raw.place;
      raw.place = { name: text(p.name, 200), category: text(p.category, 60), city: text(p.city, 120), state: text(p.state, 120), country: text(p.country, 120), countryCode: /^[A-Za-z]{2}$/.test(p.countryCode || '') ? p.countryCode.toUpperCase() : '' };
    } else raw.place = null;
    raw.media = (Array.isArray(raw.media) ? raw.media : []).filter((it) => it && okId(it.id) && ['image', 'video'].includes(it.kind) && typeof it.file === 'string');
    raw.media.forEach((it) => { it.name = text(it.name, 200); it.mime = /^[\w.+-]+\/[\w.+-]+$/.test(it.mime || '') ? it.mime : ''; });
    const prev = existingById.get(raw.id);
    if (prev && (prev.updatedAt || 0) >= (raw.updatedAt || 0)) continue;   // keep the newer local copy
    const media = [];
    for (const it of raw.media || []) {
      const bytes = files[it.file];
      if (bytes) {
        await db.putMedia({ id: it.id, memoryId: raw.id, name: it.name, mime: it.mime, blob: new Blob([bytes], { type: it.mime || '' }) });
        const th = files[`thumbs/${it.id}.jpg`];
        if (th) await db.putThumb({ id: it.id, blob: new Blob([th], { type: 'image/jpeg' }) });
        const { file: _f, ...meta } = it;
        media.push({ ...meta, hasThumb: !!th });
      } else if (prev && (prev.media || []).some((p) => p.id === it.id)) {
        const { file: _f, ...meta } = it;
        media.push(meta);
      }
    }
    const memory = { ...raw, media };
    await db.putMemory(memory);
    changed.push(memory);
  }
  return changed;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
