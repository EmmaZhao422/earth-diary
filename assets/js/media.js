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
export async function prepareFile(file) {
  const kind = fileKind(file);
  if (!kind) return null;
  const info = kind === 'image' ? await imageThumb(file) : await videoThumb(file);
  return {
    meta: {
      id: newId(), kind, name: file.name || kind, size: file.size, mime: file.type || '',
      w: info.w || 0, h: info.h || 0, duration: info.duration || 0, hasThumb: !!info.blob
    },
    blob: file,
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
