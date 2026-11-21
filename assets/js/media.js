// Earth Diary — photo & video handling (thumbnails, object URLs).

import { db, newId } from './db.js';

const THUMB_MAX = 720;

function canvasToBlob(canvas, quality = 0.82) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
}

function drawScaled(source, sw, sh) {
  const scale = Math.min(1, THUMB_MAX / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(source, 0, 0, w, h);
  return canvas;
}

async function imageThumb(blob) {
  let bmp = null;
  try { bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch {}
  if (bmp) {
    const canvas = drawScaled(bmp, bmp.width, bmp.height);
    const out = { w: bmp.width, h: bmp.height, blob: await canvasToBlob(canvas) };
    bmp.close?.();
    return out;
  }
  // Fallback for formats createImageBitmap refuses.
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url;
    });
    const canvas = drawScaled(img, img.naturalWidth, img.naturalHeight);
    return { w: img.naturalWidth, h: img.naturalHeight, blob: await canvasToBlob(canvas) };
  } catch { return { w: 0, h: 0, blob: null }; }
  finally { URL.revokeObjectURL(url); }
}

function videoThumb(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    let done = false;
    const finish = (out) => {
      if (done) return; done = true;
      clearTimeout(timer); v.removeAttribute('src'); v.load?.(); URL.revokeObjectURL(url); resolve(out);
    };
    const timer = setTimeout(() => finish({ w: v.videoWidth || 0, h: v.videoHeight || 0, duration: v.duration || 0, blob: null }), 8000);
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.onloadedmetadata = () => {
      const tAt = Math.min(1, (v.duration || 0) / 3) || 0.01;
      try { v.currentTime = tAt; } catch { finish({ w: 0, h: 0, duration: 0, blob: null }); }
    };
    v.onseeked = async () => {
      try {
        const canvas = drawScaled(v, v.videoWidth, v.videoHeight);
        finish({ w: v.videoWidth, h: v.videoHeight, duration: v.duration || 0, blob: await canvasToBlob(canvas) });
      } catch { finish({ w: v.videoWidth, h: v.videoHeight, duration: v.duration || 0, blob: null }); }
    };
    v.onerror = () => finish({ w: 0, h: 0, duration: 0, blob: null });
    v.src = url;
  });
}

/* ---------- EXIF (JPEG only): when and where a photo was taken ---------- */
function parseTiff(v, start) {
  const le = v.getUint16(start) === 0x4949;
  const u16 = (o) => v.getUint16(o, le), u32 = (o) => v.getUint32(o, le);
  const readIFD = (o) => {
    const tags = {};
    if (o + 2 > v.byteLength) return tags;
    const n = u16(o);
    for (let i = 0; i < n; i++) {
      const e = o + 2 + i * 12;
      if (e + 12 > v.byteLength) break;
      tags[u16(e)] = { count: u32(e + 4), valOff: e + 8 };
    }
    return tags;
  };
  const ascii = (tag) => {
    if (!tag) return '';
    const o = tag.count > 4 ? start + u32(tag.valOff) : tag.valOff;
    let s = '';
    for (let i = 0; i < tag.count - 1 && o + i < v.byteLength; i++) s += String.fromCharCode(v.getUint8(o + i));
    return s;
  };
  const rationals = (tag) => {
    if (!tag) return null;
    const o = start + u32(tag.valOff);
    if (o + tag.count * 8 > v.byteLength) return null;
    const out = [];
    for (let i = 0; i < tag.count; i++) { const den = u32(o + i * 8 + 4); out.push(den ? u32(o + i * 8) / den : 0); }
    return out;
  };
  const out = {};
  const ifd0 = readIFD(start + u32(start + 4));
  let stamp = '';
  if (ifd0[0x8769]) { const exif = readIFD(start + u32(ifd0[0x8769].valOff)); stamp = ascii(exif[0x9003]) || ascii(exif[0x9004]); }
  stamp = stamp || ascii(ifd0[0x0132]);
  const m = stamp.match(/^(\d{4}):(\d{2}):(\d{2})/);
  if (m && +m[1] > 1970) out.date = `${m[1]}-${m[2]}-${m[3]}`;
  if (ifd0[0x8825]) {
    const gps = readIFD(start + u32(ifd0[0x8825].valOff));
    const la = rationals(gps[2]), lo = rationals(gps[4]);
    if (la && lo && la.length === 3 && lo.length === 3) {
      let lat = la[0] + la[1] / 60 + la[2] / 3600, lng = lo[0] + lo[1] / 60 + lo[2] / 3600;
      if (ascii(gps[1]) === 'S') lat = -lat;
      if (ascii(gps[3]) === 'W') lng = -lng;
      if (isFinite(lat) && isFinite(lng) && (lat || lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) { out.lat = lat; out.lng = lng; }
    }
  }
  return out;
}

export async function readExif(file) {
  try {
    if (file.type !== 'image/jpeg' && !/\.jpe?g$/i.test(file.name || '')) return {};
    const v = new DataView(await file.slice(0, 512 * 1024).arrayBuffer());
    if (v.getUint16(0) !== 0xffd8) return {};
    let off = 2;
    while (off + 10 < v.byteLength) {
      const marker = v.getUint16(off), size = v.getUint16(off + 2);
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
      off += 2 + size;
    }
  } catch {}
  return {};
}

// Large photos are re-saved at screen resolution so the browser's storage lasts
// (a 12-megapixel phone photo becomes roughly a fifth of its size).
const MAX_SIDE = 2560;
async function shrinkImage(file) {
  if (/gif|svg/i.test(file.type || '') || /\.(gif|svg)$/i.test(file.name || '')) return null;
  let bmp = null;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { return null; }
  const side = Math.max(bmp.width, bmp.height);
  if (side <= MAX_SIDE && file.size < 1.5 * 1024 * 1024) { bmp.close?.(); return null; }
  const scale = Math.min(1, MAX_SIDE / side);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const blob = await canvasToBlob(canvas, 0.86);
  if (!blob || blob.size >= file.size) return null;
  return { blob, w: canvas.width, h: canvas.height };
}

export function fileKind(file) {
  const type = (file.type || '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  const ext = (file.name || '').split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'heif', 'bmp'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'webm', 'm4v', 'mkv', 'avi'].includes(ext)) return 'video';
  return null;
}

// Turn a picked File into a media record + thumbnail (not yet saved).
export async function prepareFile(file, { shrink = false } = {}) {
  const kind = fileKind(file);
  if (!kind) return null;
  const info = kind === 'image' ? await imageThumb(file) : await videoThumb(file);
  const exif = kind === 'image' ? await readExif(file) : {};
  const small = kind === 'image' && shrink ? await shrinkImage(file) : null;
  const name = file.name || kind;
  return {
    exif,
    meta: {
      id: newId(), kind, name: small ? name.replace(/\.[a-z0-9]+$/i, '') + '.jpg' : name,
      size: small ? small.blob.size : file.size, mime: small ? 'image/jpeg' : (file.type || ''),
      w: small ? small.w : (info.w || 0), h: small ? small.h : (info.h || 0), duration: info.duration || 0, hasThumb: !!info.blob
    },
    blob: small ? small.blob : file,
    thumb: info.blob
  };
}

/* ---------- object URL cache ---------- */
const thumbURLs = new Map();
const fullURLs = new Map();

export async function thumbURL(id) {
  if (thumbURLs.has(id)) return thumbURLs.get(id);
  const rec = await db.getThumb(id);
  if (!rec || !rec.blob) return null;
  const url = URL.createObjectURL(rec.blob);
  thumbURLs.set(id, url);
  return url;
}
export function primeThumb(id, blob) {
  if (!blob || thumbURLs.has(id)) return;
  thumbURLs.set(id, URL.createObjectURL(blob));
}
export async function fullURL(id) {
  if (fullURLs.has(id)) return fullURLs.get(id);
  const rec = await db.getMedia(id);
  if (!rec || !rec.blob) return null;
  const url = URL.createObjectURL(rec.blob);
  fullURLs.set(id, url);
  if (fullURLs.size > 12) {                      // keep only a few originals alive
    const [oldId, oldUrl] = fullURLs.entries().next().value;
    URL.revokeObjectURL(oldUrl); fullURLs.delete(oldId);
  }
  return url;
}
export function forgetMedia(id) {
  for (const map of [thumbURLs, fullURLs]) {
    const u = map.get(id);
    if (u) { URL.revokeObjectURL(u); map.delete(id); }
  }
}

export function fmtDuration(sec) {
  if (!sec || !isFinite(sec)) return '';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
