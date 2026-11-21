// Earth Diary — main application.

import { initLang, getLang, setLang, t, applyI18n, fmtDate, fmtBytes, fmtKm, pick } from './i18n.js';
import { db, newId } from './db.js';
import { CHARACTERS, CHARACTER_IDS, PALETTE, pinSVG, pinName } from './pins.js';
import * as geo from './geo.js';
import { prepareFile, thumbURL, fullURL, primeThumb, forgetMedia, fmtDuration, fileKind, readExif } from './media.js';
import { exportBackup, importBackup, downloadBlob } from './backup.js';
import { initMonetization, mountSlot, mountSlots, feedEvery, adsAreLive, affiliateLinks, supportLink, setBackupNudge } from './ads.js';
import { createSamples } from './samples.js';
import { $, $$, esc, debounce, throttle, todayISO, toast, openModal, topModal, confirmDialog } from './kit.js';
import { makeShareCard } from './sharecard.js';

const CFG = window.ED_CONFIG || {};
const params = new URLSearchParams(location.search);
const isDesktop = () => window.matchMedia('(min-width: 900px)').matches;
const MOODS = ['😍', '🥰', '😋', '🤩', '😌', '🥹', '😂', '😴', '😢', '🥶'];
const BLANK_STYLE = {
  version: 8, name: 'blank', sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#BFE3F7' } }]
};

/* ====================================================================== */
/* state                                                                   */
/* ====================================================================== */

const DEFAULT_SETTINGS = {
  style: CFG.map?.defaultStyle || 'liberty', journey: false, countries: true, motion: true, globe: true, shrink: true,
  lastPin: { char: 'cat', color: null }, sidebarOpen: true
};
function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('ed-settings') || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings() { try { localStorage.setItem('ed-settings', JSON.stringify(settings)); } catch {} }
let settings = loadSettings();

const state = {
  memories: [], byId: new Map(), selectedId: null,
  filter: { q: '', year: null }, placing: false, tab: 'timeline', sheetOpen: false, limit: 120
};
let map = null;
let popup = null;
let popupAbort = null;
let draft = null;                     // { memory, isNew, newFiles, removed:Set, marker, abort, dirty }
let countriesData = null;
let styleReady = false;
let usingBlank = params.get('style') === 'blank';
const pinMarkers = new Map();         // id -> { marker, el, onMap }
let clusterMarkers = [];
let pendingFiles = null;               // photos waiting for the user to pick a spot
let replay = null;

const titleOf = (m) => m.title || m.place?.name || t('detail.untitled');
const sortMemories = (list) => list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
function setMemories(list) {
  state.memories = sortMemories(list);
  state.byId = new Map(state.memories.map((m) => [m.id, m]));
}
function upsertMemory(m) {
  const i = state.memories.findIndex((x) => x.id === m.id);
  if (i >= 0) state.memories[i] = m; else state.memories.push(m);
  setMemories(state.memories);
}
function filteredMemories() {
  const { q, year } = state.filter;
  const needle = q.trim().toLowerCase();
  const tag = needle.startsWith('#') ? needle.slice(1) : null;
  return state.memories.filter((m) => {
    if (year && !(m.date || '').startsWith(String(year))) return false;
    if (!needle) return true;
    if (tag !== null) return (m.tags || []).some((x) => x.toLowerCase().includes(tag));
    const hay = [m.title, m.text, m.place?.name, m.place?.city, m.place?.country, (m.tags || []).join(' ')].join(' ').toLowerCase();
    return hay.includes(needle);
  });
}
const hashCode = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

/* ====================================================================== */
/* map                                                                     */
/* ====================================================================== */

function styleFor(key) {
  if (usingBlank) return BLANK_STYLE;
  return CFG.map?.styles?.[key] || CFG.map?.styles?.liberty || BLANK_STYLE;
}

function viewPadding() {
  if (!isDesktop()) {
    // on phones the editor is a bottom sheet, so keep the pin in the strip of map above it
    const editing = drawer()?.dataset.kind === 'editor';
    return { top: 76, bottom: editing ? Math.round(window.innerHeight * 0.62) : 96, left: 24, right: 24 };
  }
  return {
    top: 84, bottom: 48,
    left: settings.sidebarOpen ? 388 : 48,
    right: document.body.classList.contains('drawer-open') ? 452 : 48
  };
}

function initMap() {
  const hasHash = /map=/.test(location.hash);
  map = new maplibregl.Map({
    container: 'map', style: styleFor(settings.style),
    center: [12, 22], zoom: isDesktop() ? 1.9 : 1.1, minZoom: 0.6, maxZoom: 20,
    hash: 'map', attributionControl: false, maxPitch: 60, fadeDuration: 150
  });
  window.__edMap = map;
  try { map.setPadding(viewPadding()); } catch {}
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
  const locate = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false, showAccuracyCircle: false });
  map.addControl(locate, 'bottom-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 110 }), 'bottom-left');
  map.touchZoomRotate.disableRotation();

  map.on('style.load', () => {
    styleReady = true;
    try { map.setProjection({ type: settings.globe ? 'globe' : 'mercator' }); } catch {}
    try {
      map.setSky({ 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] });
    } catch {}
    boostPOIs();
    addOverlayLayers();
  });

  // If the tile host is unreachable, fall back to a plain globe so pins still work.
  map.on('error', (e) => {
    if (styleReady || usingBlank) return;
    const msg = String(e?.error?.message || '');
    if (e?.sourceId && !/style/i.test(msg)) return;
    usingBlank = true;
    toast(t('toast.tiles'), { kind: 'warn', ms: 6000 });
    map.setStyle(BLANK_STYLE);
  });

  map.on('click', onMapClick);
  map.on('contextmenu', (e) => { e.preventDefault?.(); startDraft(e.lngLat, poiAt(e.point)); });
  let pressTimer = null;                                    // long-press on touch screens
  map.on('touchstart', (e) => {
    clearTimeout(pressTimer);
    if (e.points.length !== 1) return;
    const { lngLat, point } = e;
    pressTimer = setTimeout(() => { navigator.vibrate?.(12); startDraft(lngLat, poiAt(point)); }, 620);
  });
  for (const ev of ['touchend', 'touchcancel', 'touchmove', 'move']) map.on(ev, () => clearTimeout(pressTimer));

  const recluster = throttle(renderMarkers, 140);
  map.on('zoom', recluster);
  map.on('moveend', renderMarkers);
  // The globe <-> flat transition finishes a frame or two after a jump, so pins
  // placed during the jump can be stale. Re-place them once the map settles.
  const settle = () => { renderMarkers(); nudgeMarkers(); };
  map.on('idle', settle);
  map.on('projectiontransition', () => requestAnimationFrame(settle));
  map.on('moveend', () => requestAnimationFrame(() => requestAnimationFrame(settle)));
  map.on('mousemove', throttle((e) => {
    if (state.placing) return;
    map.getCanvas().style.cursor = e.point && poiAt(e.point) ? 'pointer' : '';
  }, 120));

  map.once('load', () => {
    if (!hasHash && state.memories.length) fitToMemories(state.memories, { animate: false, maxZoom: 4.5 });
    if (!hasHash && !state.memories.length) startIdleSpin();
    loadCountries();
  });
}

// An empty globe turns slowly until the visitor touches anything.
function startIdleSpin() {
  if (!settings.motion || !settings.globe || usingBlank || navigator.webdriver) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const events = ['pointerdown', 'wheel', 'keydown', 'touchstart'];
  let spinning = true;
  const stop = (e) => {
    if (!spinning) return;
    if (e?.target?.closest?.('.modal-backdrop')) return;      // closing the welcome card does not count
    spinning = false;
    events.forEach((ev) => window.removeEventListener(ev, stop, true));
    try { map.stop(); } catch {}
  };
  events.forEach((ev) => window.addEventListener(ev, stop, { capture: true, passive: true }));
  setTimeout(stop, 90000);
  const step = () => {
    if (!spinning) return;
    if (state.memories.length || map.getZoom() > 3.2) { stop(); return; }
    const c = map.getCenter();
    map.easeTo({ center: [c.lng + 10, c.lat], duration: 2200, easing: (x) => x });
  };
  map.on('moveend', () => { if (spinning) requestAnimationFrame(step); });
  step();
}

// Show cafés, restaurants and shops one zoom level earlier than the stock style.
function boostPOIs() {
  if (usingBlank) return;
  try {
    for (const layer of map.getStyle().layers || []) {
      if (layer['source-layer'] === 'poi' && layer.minzoom && layer.minzoom >= 15) {
        map.setLayerZoomRange(layer.id, layer.minzoom - 1, layer.maxzoom || 24);
      }
    }
  } catch {}
}

function firstSymbolLayerId() {
  try { return (map.getStyle().layers || []).find((l) => l.type === 'symbol')?.id; } catch { return undefined; }
}

function visitedCodes() {
  return [...new Set(state.memories.map((m) => m.place?.countryCode).filter(Boolean))];
}

function addOverlayLayers() {
  if (!map || !styleReady) return;
  const before = firstSymbolLayerId();
  if (countriesData && !map.getSource('countries')) {
    map.addSource('countries', { type: 'geojson', data: countriesData });
    if (usingBlank) {
      map.addLayer({ id: 'countries-land', type: 'fill', source: 'countries', paint: { 'fill-color': '#FBF1DF' } });
      map.addLayer({ id: 'countries-land-line', type: 'line', source: 'countries', paint: { 'line-color': '#E0CDAE', 'line-width': 0.8 } });
    }
    map.addLayer({
      id: 'countries-visited', type: 'fill', source: 'countries', filter: ['in', ['get', 'iso'], ['literal', []]],
      paint: { 'fill-color': '#FF8FA3', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.34, 3, 0.26, 5, 0.1, 6.2, 0] }
    }, before);
    map.addLayer({
      id: 'countries-visited-line', type: 'line', source: 'countries', filter: ['in', ['get', 'iso'], ['literal', []]],
      paint: { 'line-color': '#FF6B8A', 'line-width': 1.4, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.9, 3.5, 0.6, 5.5, 0] }
    }, before);
  }
  if (!map.getSource('journey')) {
    map.addSource('journey', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'journey-line', type: 'line', source: 'journey',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#FF7A6B', 'line-width': 2.6, 'line-dasharray': [0.6, 2.2], 'line-opacity': 0.9 }
    });
  }
  refreshOverlays();
}

function refreshOverlays() {
  if (!map || !styleReady) return;
  try {
    if (map.getLayer('countries-visited')) {
      const codes = settings.countries ? visitedCodes() : [];
      const filter = ['in', ['get', 'iso'], ['literal', codes]];
      map.setFilter('countries-visited', filter);
      map.setFilter('countries-visited-line', filter);
    }
    const src = map.getSource('journey');
    if (src) src.setData(settings.journey ? journeyGeoJSON() : { type: 'FeatureCollection', features: [] });
  } catch {}
}

async function loadCountries() {
  if (countriesData) return countriesData;
  try {
    const res = await fetch('assets/data/countries.json');
    countriesData = await res.json();
    addOverlayLayers();
  } catch {}
  return countriesData;
}

// Great-circle arcs between memories in chronological order.
function journeyGeoJSON() {
  const pts = [...state.memories].reverse().map((m) => [m.lng, m.lat]);
  if (pts.length < 2) return { type: 'FeatureCollection', features: [] };
  const rad = Math.PI / 180;
  const coords = [pts[0].slice()];
  let prevLng = pts[0][0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const p1 = a[1] * rad, l1 = a[0] * rad, p2 = b[1] * rad, l2 = b[0] * rad;
    const d = 2 * Math.asin(Math.min(1, Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2)));
    const n = d < 0.02 ? 1 : Math.min(64, Math.ceil(d / 0.03));
    for (let k = 1; k <= n; k++) {
      const f = k / n;
      let lng, lat;
      if (d < 1e-9) { lng = b[0]; lat = b[1]; }
      else {
        const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
        const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
        const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
        const z = A * Math.sin(p1) + B * Math.sin(p2);
        lat = Math.atan2(z, Math.sqrt(x * x + y * y)) / rad;
        lng = Math.atan2(y, x) / rad;
      }
      while (lng - prevLng > 180) lng -= 360;
      while (lng - prevLng < -180) lng += 360;
      prevLng = lng;
      coords.push([lng, lat]);
    }
  }
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] };
}

function fitToMemories(list, { animate = true, maxZoom = 14 } = {}) {
  if (!list.length || !map) return;
  if (list.length === 1) {
    const m = list[0];
    map[animate && settings.motion ? 'flyTo' : 'jumpTo']({ center: [m.lng, m.lat], zoom: Math.min(maxZoom, 12), padding: viewPadding() });
    return;
  }
  const b = new maplibregl.LngLatBounds();
  list.forEach((m) => b.extend([m.lng, m.lat]));
  map.fitBounds(b, { padding: viewPadding(), maxZoom, animate: animate && settings.motion, duration: 1400 });
}

function flyTo(lng, lat, zoom) {
  const opts = { center: [lng, lat], zoom, padding: viewPadding() };
  if (settings.motion) map.flyTo({ ...opts, speed: 1.5, curve: 1.3, essential: true });
  else map.jumpTo(opts);
}

/* ---------- POI detection ---------- */
const POI_LAYERS = ['poi', 'mountain_peak', 'aerodrome_label', 'place', 'park', 'water_name'];
function poiAt(point) {
  if (!map || usingBlank || !styleReady) return null;
  let feats = [];
  try { feats = map.queryRenderedFeatures([[point.x - 9, point.y - 9], [point.x + 9, point.y + 9]]); } catch { return null; }
  for (const f of feats) {
    const sl = f.sourceLayer;
    if (!POI_LAYERS.includes(sl) || f.layer?.type !== 'symbol') continue;
    const p = f.properties || {};
    const name = (getLang() === 'zh' && (p['name:zh'] || p['name:nonlatin'])) || p['name:latin'] || p.name_en || p.name || p['name:nonlatin'];
    if (!name) continue;
    const snap = ['poi', 'mountain_peak', 'aerodrome_label'].includes(sl) && f.geometry?.type === 'Point';
    return {
      name: String(name), category: p.subclass || p.class || sl, source: sl,
      lng: snap ? f.geometry.coordinates[0] : null, lat: snap ? f.geometry.coordinates[1] : null
    };
  }
  return null;
}

function onMapClick(e) {
  const poi = poiAt(e.point);
  if (state.placing) { startDraft(e.lngLat, poi); return; }
  if (draft) return;                                      // editing: ignore stray clicks
  showSpotPopup(e.lngLat, poi);
}

function closePopup() {
  popupAbort?.abort(); popupAbort = null;
  if (popup) { const p = popup; popup = null; p.remove(); }
}

function showSpotPopup(lngLat, poi, presetPlace) {
  closePopup();
  const at = poi && poi.lng != null ? { lng: poi.lng, lat: poi.lat } : { lng: lngLat.lng, lat: lngLat.lat };
  const el = document.createElement('div');
  el.className = 'spot';
  const coords = `${at.lat.toFixed(4)}, ${at.lng.toFixed(4)}`;
  const paint = (name, sub, emoji) => {
    el.innerHTML = `
      <div class="spot-head"><span class="spot-emoji">${emoji}</span>
        <div><b>${esc(name)}</b><small>${esc(sub)}</small></div></div>
      <button class="btn btn-primary btn-block" data-act="pin"><span aria-hidden="true">📍</span> ${esc(t('spot.pin'))}</button>`;
  };
  let place = presetPlace || (poi ? { name: poi.name, category: poi.category } : null);
  if (place) paint(place.name, [geo.prettyCategory(place.category), geo.placeLine(place)].filter(Boolean).join(' · ') || coords, geo.categoryEmoji(place.category));
  else paint(t('spot.here'), t('spot.looking'), '📍');

  el.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-act="pin"]')) startDraft(at, place ? { ...place, lng: at.lng, lat: at.lat } : null);
  });
  popup = new maplibregl.Popup({ closeButton: false, offset: 12, className: 'spot-popup', maxWidth: '290px', focusAfterOpen: false })
    .setLngLat([at.lng, at.lat]).setDOMContent(el).addTo(map);
  const mine = popup;
  popup.on('close', () => { if (popup === mine) popup = null; });
  try {
    const y = map.project([at.lng, at.lat]).y;
    if (y < 215) map.panBy([0, y - 215], { duration: settings.motion ? 350 : 0 });
  } catch {}

  if (!presetPlace) {
    popupAbort = new AbortController();
    geo.reversePlace(at.lat, at.lng, { signal: popupAbort.signal }).then((found) => {
      if (popup !== mine) return;
      if (!found) { if (!place) paint(t('spot.here'), coords, '📍'); return; }
      if (place) { place = { ...found, name: place.name, category: place.category }; paint(place.name, [geo.prettyCategory(place.category), geo.placeLine(place)].filter(Boolean).join(' · '), geo.categoryEmoji(place.category)); }
      else {
        const far = geo.haversineKm(at, found) > 0.08;      // not standing on the named thing itself
        place = far ? { ...found, name: found.city || found.state || found.country || found.name, category: '' } : found;
        paint(place.name || t('spot.here'), geo.placeLine(place) || coords, far ? '📍' : geo.categoryEmoji(place.category));
      }
    }).catch(() => { if (popup === mine && !place) paint(t('spot.here'), coords, '📍'); });
  }
}

/* ====================================================================== */
/* pins & clusters                                                         */
/* ====================================================================== */

function buildPinEl(m, extraClass = '') {
  const el = document.createElement('div');
  el.className = `pin ${extraClass}`;
  el.dataset.id = m.id;
  el.style.setProperty('--delay', `-${(hashCode(m.id) % 40) / 10}s`);
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.setAttribute('aria-label', titleOf(m));
  el.innerHTML = `<span class="pin-shadow"></span><span class="pin-bob"><span class="pin-art">${pinSVG(m.pin)}</span></span><span class="pin-tip"></span>`;
  $('.pin-tip', el).textContent = titleOf(m);
  return el;
}

function ensurePin(m) {
  let rec = pinMarkers.get(m.id);
  if (rec) return rec;
  const el = buildPinEl(m);
  el.addEventListener('click', (e) => { e.stopPropagation(); selectMemory(m.id); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectMemory(m.id); } });
  el.addEventListener('mouseenter', () => fillPinCard(m.id, el));
  const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, 3], opacityWhenCovered: '0' }).setLngLat([m.lng, m.lat]);
  rec = { marker, el, onMap: false };
  pinMarkers.set(m.id, rec);
  return rec;
}
// Small preview card shown when the mouse rests on a pin (filled lazily).
function fillPinCard(id, el) {
  const m = state.byId.get(id);
  if (!m) return;
  let card = $('.pin-card', el);
  if (!card) { card = document.createElement('span'); card.className = 'pin-card'; el.appendChild(card); }
  const version = `${m.updatedAt}|${getLang()}`;
  if (card.dataset.v === version) return;
  card.dataset.v = version;
  const cover = (m.media || [])[0];
  card.innerHTML = `${cover ? '<i class="pin-card-img"></i>' : ''}<b></b><small></small>`;
  $('b', card).textContent = titleOf(m);
  $('small', card).textContent = [fmtDate(m.date), m.place?.city || m.place?.name].filter(Boolean).join(' · ');
  if (cover) thumbURL(cover.id).then((url) => { const img = $('.pin-card-img', card); if (url && img) img.style.backgroundImage = `url("${url}")`; });
}

function dropPin(id) {
  const rec = pinMarkers.get(id);
  if (rec) { rec.marker.remove(); pinMarkers.delete(id); }
}

function isOccluded(lng, lat) {
  try { return !!map.transform.isLocationOccluded?.(new maplibregl.LngLat(lng, lat)); } catch { return false; }
}

function renderMarkers() {
  if (!map) return;
  const visible = filteredMemories().filter((m) => !(draft && draft.memory.id === m.id));
  const visibleIds = new Set(visible.map((m) => m.id));
  for (const id of [...pinMarkers.keys()]) if (!state.byId.has(id)) dropPin(id);

  const zoom = map.getZoom();
  const R = zoom >= 16.5 ? 0 : 44;
  const groups = [];
  for (const m of visible) {
    if (isOccluded(m.lng, m.lat)) { groups.push({ hidden: true, items: [m] }); continue; }
    const p = map.project([m.lng, m.lat]);
    let home = null;
    if (R && m.id !== state.selectedId) {
      for (const g of groups) {
        if (g.hidden || g.solo) continue;
        if (Math.abs(g.x - p.x) < R && Math.abs(g.y - p.y) < R) { home = g; break; }
      }
    }
    if (home) home.items.push(m);
    else groups.push({ x: p.x, y: p.y, items: [m], solo: m.id === state.selectedId });
  }

  clusterMarkers.forEach((c) => c.remove());
  clusterMarkers = [];
  const showing = new Set();
  for (const g of groups) {
    if (g.hidden) continue;
    if (g.items.length === 1) { showing.add(g.items[0].id); continue; }
    const el = document.createElement('div');
    el.className = 'cluster';
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.setAttribute('aria-label', `${g.items.length}`);
    el.innerHTML = `<span class="cluster-art a">${pinSVG(g.items[0].pin)}</span><span class="cluster-art b">${pinSVG(g.items[1].pin)}</span><b>${g.items.length}</b>`;
    const lng = g.items.reduce((s, m) => s + m.lng, 0) / g.items.length;
    const lat = g.items.reduce((s, m) => s + m.lat, 0) / g.items.length;
    const open = (e) => {
      e.stopPropagation();
      const b = new maplibregl.LngLatBounds();
      g.items.forEach((m) => b.extend([m.lng, m.lat]));
      const tiny = geo.haversineKm({ lat: b.getSouth(), lng: b.getWest() }, { lat: b.getNorth(), lng: b.getEast() }) < 0.05;
      if (tiny) flyTo(lng, lat, 17.2);
      else map.fitBounds(b, { padding: { ...viewPadding(), top: 140, bottom: 120 }, maxZoom: 16.8, animate: settings.motion, duration: 900 });
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(e); });
    clusterMarkers.push(new maplibregl.Marker({ element: el, anchor: 'center', opacityWhenCovered: '0' }).setLngLat([lng, lat]).addTo(map));
  }

  for (const m of state.memories) {
    const want = visibleIds.has(m.id) && showing.has(m.id);
    const rec = want ? ensurePin(m) : pinMarkers.get(m.id);
    if (!rec) continue;
    if (want && !rec.onMap) { rec.marker.addTo(map); rec.onMap = true; }
    if (!want && rec.onMap) { rec.marker.remove(); rec.onMap = false; }
    rec.el.classList.toggle('is-selected', m.id === state.selectedId);
  }
}

function nudgeMarkers() {
  for (const rec of pinMarkers.values()) if (rec.onMap) rec.marker.setLngLat(rec.marker.getLngLat());
  if (draft) draft.marker.setLngLat(draft.marker.getLngLat());
}

function celebrate(id) {
  const rec = pinMarkers.get(id);
  if (!rec || !settings.motion) return;
  rec.el.classList.add('is-new');
  const burst = document.createElement('span');
  burst.className = 'pin-burst';
  burst.innerHTML = ['✨', '💖', '⭐', '✨', '🌸', '⭐'].map((s, i) => `<i style="--i:${i}">${s}</i>`).join('');
  rec.el.appendChild(burst);
  setTimeout(() => { rec.el.classList.remove('is-new'); burst.remove(); }, 1600);
}

/* ====================================================================== */
/* drawer (detail + editor)                                                */
/* ====================================================================== */

const drawer = () => $('#drawer');
// Keep the map's "safe area" in step with the panels, unless a flight is already under way.
const syncPadding = debounce(() => {
  if (!map || map.isMoving()) return;
  try { map.easeTo({ padding: viewPadding(), duration: settings.motion ? 320 : 0 }); } catch {}
}, 60);
function openDrawer(html, kind) {
  const d = drawer();
  d.innerHTML = html;
  d.dataset.kind = kind;
  d.hidden = false;
  document.body.classList.add('drawer-open');
  applyI18n(d);
  requestAnimationFrame(() => d.classList.add('is-open'));
  syncPadding();
}
function closeDrawer() {
  const d = drawer();
  d.classList.remove('is-open');
  d.hidden = true;
  d.innerHTML = '';
  delete d.dataset.kind;
  document.body.classList.remove('drawer-open');
  syncPadding();
}

/* ---------- detail ---------- */
function selectMemory(id, { fly = true, sparkle = false } = {}) {
  const m = state.byId.get(id);
  if (!m) return;
  if (draft) return;
  if (replay) stopReplay();
  closePopup();
  state.selectedId = id;
  if (!isDesktop()) setSheet(false);
  renderDetail(m);
  renderMarkers();
  highlightCard();
  if (fly) flyTo(m.lng, m.lat, Math.max(map.getZoom(), 13.5));
  if (sparkle) setTimeout(() => celebrate(id), 60);
}
function deselect() {
  state.selectedId = null;
  closeDrawer();
  renderMarkers();
  highlightCard();
}

function placeText(m) {
  const p = m.place;
  if (!p) return `${m.lat.toFixed(4)}, ${m.lng.toFixed(4)}`;
  return [p.name, geo.placeLine(p)].filter(Boolean).join(' · ') || `${m.lat.toFixed(4)}, ${m.lng.toFixed(4)}`;
}

function renderDetail(m) {
  const media = m.media || [];
  const links = affiliateLinks(m.place, m.lat, m.lng);
  const tags = (m.tags || []).map((x) => `<button class="tag" data-tag="${esc(x)}">#${esc(x)}</button>`).join('');
  const html = `
    <div class="drawer-inner detail">
      <div class="detail-hero ${media.length ? 'has-cover' : ''}" id="detail-hero">
        <button class="icon-btn hero-x" data-act="close" data-i18n-label="common.close">×</button>
        <div class="hero-pin">${pinSVG(m.pin)}</div>
      </div>
      <div class="drawer-scroll">
        ${m.sample ? `<span class="badge">${esc(t('detail.sample'))}</span>` : ''}
        <h2 class="detail-title">${esc(titleOf(m))}</h2>
        <p class="detail-meta"><span>📅 ${esc(fmtDate(m.date, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }))}</span>${m.mood ? `<span class="detail-mood">${esc(m.mood)}</span>` : ''}</p>
        <button class="detail-place" data-act="recenter"><span>${geo.categoryEmoji(m.place?.category)}</span><span>${esc(placeText(m))}</span></button>
        ${m.text ? `<div class="detail-text">${esc(m.text)}</div>` : ''}
        ${tags ? `<div class="tags">${tags}</div>` : ''}
        ${media.length ? `<div class="gallery" id="detail-gallery">${media.map((it, i) => `
          <button class="gal-item ${it.kind}" data-i="${i}" aria-label="${esc(it.name)}">
            ${it.kind === 'video' ? `<span class="gal-play">▶</span>${it.duration ? `<span class="gal-dur">${fmtDuration(it.duration)}</span>` : ''}` : ''}
          </button>`).join('')}</div>` : ''}
        <div class="detail-actions">
          <button class="btn btn-soft" data-act="edit">✏️ <span data-i18n="detail.edit"></span></button>
          <button class="btn btn-soft" data-act="share">🔗 <span data-i18n="detail.share"></span></button>
          <a class="btn btn-soft" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${m.lat.toFixed(6)},${m.lng.toFixed(6)}">🧭 <span data-i18n="detail.maps"></span></a>
          <button class="btn btn-soft btn-danger-soft" data-act="delete">🗑️ <span data-i18n="detail.delete"></span></button>
        </div>
        ${links.length ? `<div class="plan"><h3 data-i18n="detail.plan"></h3><div class="plan-links">${links.map((l) => `
          <a href="${esc(l.url)}" target="_blank" rel="sponsored noopener"><span>${l.icon}</span>${esc(l.label)}</a>`).join('')}</div>
          <small data-i18n="detail.sponsored"></small></div>` : ''}
        <div data-ad="detail"></div>
      </div>
    </div>`;
  openDrawer(html, 'detail');
  mountSlots(drawer());

  media.forEach(async (it, i) => {
    const url = it.hasThumb !== false ? await thumbURL(it.id) : null;
    const btn = $(`.gal-item[data-i="${i}"]`, drawer());
    if (btn && url) btn.style.backgroundImage = `url("${url}")`;
    if (i === 0 && url && state.selectedId === m.id) { const hero = $('#detail-hero'); if (hero) hero.style.backgroundImage = `url("${url}")`; }
  });
}

async function deleteMemory(m) {
  const ok = await confirmDialog({ title: t('detail.delete.title'), body: t('detail.delete.body'), okLabel: t('common.delete'), danger: true });
  if (!ok) return;
  await db.deleteMemory(m);
  (m.media || []).forEach((it) => forgetMedia(it.id));
  setMemories(state.memories.filter((x) => x.id !== m.id));
  dropPin(m.id);
  deselect();
  renderAll();
  toast(t('toast.deleted'));
}

// One memory per group of photos taken at the same place on the same day.
async function createBatch(groups) {
  toast(t('batch.working'), { ms: 2500 });
  const made = [];
  try {
    for (const g of groups) {
      const id = newId(), now = Date.now(), media = [];
      for (const item of g) {
        const prepared = await prepareFile(item.file, { shrink: settings.shrink });
        if (!prepared) continue;
        await db.putMedia({ id: prepared.meta.id, memoryId: id, name: prepared.meta.name, mime: prepared.meta.mime, blob: prepared.blob });
        if (prepared.thumb) await db.putThumb({ id: prepared.meta.id, blob: prepared.thumb });
        primeThumb(prepared.meta.id, prepared.thumb);
        media.push(prepared.meta);
      }
      if (!media.length) continue;
      const memory = {
        id, lat: g.reduce((s, i) => s + i.lat, 0) / g.length, lng: g.reduce((s, i) => s + i.lng, 0) / g.length,
        title: '', date: g.find((i) => i.date)?.date || todayISO(), text: '', mood: '', tags: [],
        pin: { ...settings.lastPin }, place: null, media, createdAt: now, updatedAt: now
      };
      await db.putMemory(memory);
      upsertMemory(memory);
      made.push(memory);
    }
  } catch (err) {
    console.error(err);
    toast(t(err && err.name === 'QuotaExceededError' ? 'toast.quota' : 'toast.storage'), { kind: 'warn', ms: 6000 });
  }
  db.persist();
  renderAll();
  if (made.length) {
    fitToMemories(made, { maxZoom: 12 });
    toast(t('batch.done', { n: made.length }), { kind: 'ok', ms: 5000 });
    backfillPlaces();
  }
}

/* ---------- editor ---------- */
function setPlacing(on) {
  state.placing = on;
  document.body.classList.toggle('is-placing', on);
  $('#placing-bar').hidden = !on;
  if (on) { closePopup(); if (!isDesktop()) setSheet(false); }
}

let lastDraftAt = 0;
async function startDraft(lngLat, poi) {
  if (Date.now() - lastDraftAt < 900) return;           // long-press can fire both touch and contextmenu
  lastDraftAt = Date.now();
  if (replay) stopReplay();
  if (draft) { if (!(await confirmDiscard())) return; discardDraft(); }
  const files = pendingFiles;
  pendingFiles = null;
  setPlacing(false);
  closePopup();
  const at = poi && poi.lng != null ? { lng: poi.lng, lat: poi.lat } : { lng: lngLat.lng, lat: lngLat.lat };
  const now = Date.now();
  const memory = {
    id: newId(), lat: at.lat, lng: at.lng, title: '', date: todayISO(), text: '', mood: '', tags: [],
    pin: { ...settings.lastPin },
    place: poi ? { name: poi.name || '', category: poi.category || '', city: poi.city || '', state: poi.state || '', country: poi.country || '', countryCode: poi.countryCode || '' } : null,
    media: [], createdAt: now, updatedAt: now
  };
  openEditor(memory, true, { nameLocked: !!(poi && poi.name) });
  if (files) addFiles(files);
}

// Photos dropped on the map or picked with "Start from a photo": if one of them
// knows where it was taken, the pin goes there; otherwise the user taps the map.
async function startFromFiles(fileList) {
  const files = [...fileList].filter((f) => fileKind(f));
  if (!files.length) return;
  if (draft) { addFiles(files); return; }
  const infos = [];
  for (const f of files.slice(0, 400)) infos.push({ file: f, ...(await readExif(f)) });
  const located = infos.filter((i) => i.lat != null);
  // Photos from several places or days: offer one pin per place-and-day.
  const groups = new Map();
  for (const i of located) {
    const key = `${i.lat.toFixed(2)}|${i.lng.toFixed(2)}|${i.date || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  }
  if (groups.size > 1) {
    const ok = await confirmDialog({
      title: t('batch.title', { n: groups.size }),
      body: t('batch.body', { photos: located.length, n: groups.size, skipped: files.length - located.length }),
      okLabel: t('batch.ok')
    });
    if (ok) { await createBatch([...groups.values()]); return; }
  }
  const spot = located[0] || null;
  if (spot) {
    pendingFiles = files;
    await startDraft({ lng: spot.lng, lat: spot.lat }, null);
    if (draft) toast(t('toast.exif.placed'), { kind: 'ok' });
  } else {
    pendingFiles = files;
    setPlacing(true);
    toast(t('toast.exif.noloc'), { ms: 5200 });
  }
}

function editMemory(id) {
  const m = state.byId.get(id);
  if (!m) return;
  openEditor(structuredClone(m), false, { nameLocked: true });
}

function openEditor(memory, isNew, { nameLocked = false } = {}) {
  state.selectedId = null;
  draft = { memory, isNew, newFiles: [], removed: new Set(), marker: null, abort: null, dirty: false, nameLocked, busy: 0, initialDate: memory.date, dateTouched: !isNew };

  const el = buildPinEl(memory, 'is-draft');
  draft.marker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, 3], draggable: true })
    .setLngLat([memory.lng, memory.lat]).addTo(map);
  draft.marker.on('dragend', () => {
    const p = draft.marker.getLngLat();
    draft.memory.lng = p.lng; draft.memory.lat = p.lat; draft.dirty = true;
    lookupDraftPlace();
  });
  renderMarkers();

  const charGrid = CHARACTER_IDS.map((c) => `
    <button type="button" class="char-opt" data-char="${c}" title="${esc(pinName(c, getLang()))}" aria-label="${esc(pinName(c, getLang()))}">${pinSVG({ char: c }, { sticker: false })}</button>`).join('');
  const colors = PALETTE.map((c) => `<button type="button" class="color-dot" data-color="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('');
  const moods = MOODS.map((mo) => `<button type="button" class="mood-opt" data-mood="${mo}">${mo}</button>`).join('');

  openDrawer(`
    <form class="drawer-inner editor" id="editor" autocomplete="off">
      <header class="drawer-head">
        <h2 data-i18n="${isNew ? 'editor.new' : 'editor.edit'}"></h2>
        <button type="button" class="icon-btn" data-act="cancel" data-i18n-label="common.close">×</button>
      </header>
      <div class="drawer-scroll">
        <div class="field">
          <span class="label" data-i18n="editor.character"></span>
          <div class="char-grid" id="ed-chars">${charGrid}</div>
          <div class="color-row" id="ed-colors">${colors}</div>
        </div>
        <label class="field"><span class="label" data-i18n="editor.title"></span>
          <input id="ed-title" maxlength="120" data-i18n-ph="editor.title.ph" value="${esc(memory.title)}"></label>
        <div class="field-row">
          <label class="field"><span class="label" data-i18n="editor.date"></span>
            <input id="ed-date" type="date" value="${esc(memory.date)}"></label>
          <div class="field grow"><span class="label" data-i18n="editor.mood"></span>
            <div class="mood-row" id="ed-moods">${moods}</div></div>
        </div>
        <label class="field"><span class="label" data-i18n="editor.place"></span>
          <input id="ed-place" maxlength="140" data-i18n-ph="editor.place.ph" value="${esc(memory.place?.name || '')}">
          <small id="ed-place-sub" class="sub"></small></label>
        <div class="nearby" id="ed-nearby" hidden><span class="label" data-i18n="editor.nearby"></span><div class="chips" id="ed-nearby-chips"></div></div>
        <label class="field"><span class="label" data-i18n="editor.diary"></span>
          <textarea id="ed-text" rows="7" data-i18n-ph="editor.diary.ph">${esc(memory.text)}</textarea></label>
        <div class="field">
          <span class="label" data-i18n="editor.media"></span>
          <div class="media-grid" id="ed-media"></div>
          <small class="sub" data-i18n="editor.media.hint"></small>
          <input id="ed-files" type="file" accept="image/*,video/*" multiple hidden>
        </div>
        <label class="field"><span class="label" data-i18n="editor.tags"></span>
          <input id="ed-tags" data-i18n-ph="editor.tags.ph" value="${esc((memory.tags || []).join(', '))}"></label>
        <p class="hint">☝️ <span data-i18n="editor.move"></span></p>
      </div>
      <footer class="drawer-foot">
        <button type="button" class="btn btn-ghost" data-act="cancel" data-i18n="editor.cancel"></button>
        <button type="submit" class="btn btn-primary grow" id="ed-save" data-i18n="editor.save"></button>
      </footer>
    </form>`, 'editor');

  syncEditorPicks();
  renderEditorMedia();
  updatePlaceSub();
  if (isNew) {
    flyTo(memory.lng, memory.lat, Math.max(map.getZoom(), 15));
    lookupDraftPlace();
    if (isDesktop()) setTimeout(() => $('#ed-title')?.focus(), 350);
  }
}

function syncEditorPicks() {
  if (!draft) return;
  const { pin, mood } = draft.memory;
  $$('#ed-chars .char-opt').forEach((b) => b.classList.toggle('is-on', b.dataset.char === pin.char));
  const tint = CHARACTERS[pin.char]?.tint;
  $('#ed-colors').classList.toggle('is-disabled', !tint);
  const current = pin.color || CHARACTERS[pin.char]?.color;
  $$('#ed-colors .color-dot').forEach((b) => b.classList.toggle('is-on', !!tint && b.dataset.color.toLowerCase() === String(current).toLowerCase()));
  $$('#ed-moods .mood-opt').forEach((b) => b.classList.toggle('is-on', b.dataset.mood === mood));
  const art = $('.pin-art', draft.marker.getElement());
  if (art) art.innerHTML = pinSVG(pin);
}

function updatePlaceSub() {
  const sub = $('#ed-place-sub');
  if (!sub || !draft) return;
  const m = draft.memory;
  sub.textContent = [geo.placeLine(m.place), `${m.lat.toFixed(4)}, ${m.lng.toFixed(4)}`].filter(Boolean).join(' · ');
}

function lookupDraftPlace() {
  if (!draft) return;
  draft.abort?.abort();
  const ctl = (draft.abort = new AbortController());
  const d = draft;
  const { lat, lng } = d.memory;
  updatePlaceSub();
  geo.reversePlace(lat, lng, { signal: ctl.signal }).then((found) => {
    if (draft !== d || !found) return;
    const prev = d.memory.place || {};
    const keepName = d.nameLocked && prev.name;
    const close = geo.haversineKm({ lat, lng }, found) < 0.08;
    d.memory.place = {
      name: keepName ? prev.name : (close ? found.name : (found.city || found.state || found.country || '')),
      category: keepName ? prev.category : (close ? found.category : ''),
      city: found.city, state: found.state, country: found.country, countryCode: found.countryCode
    };
    const input = $('#ed-place');
    if (input && !keepName) input.value = d.memory.place.name || '';
    updatePlaceSub();
  }).catch(() => {});
  geo.nearbyPlaces(lat, lng, { signal: ctl.signal }).then((list) => {
    if (draft !== d) return;
    const box = $('#ed-nearby'), chips = $('#ed-nearby-chips');
    if (!box) return;
    d.nearby = list;
    chips.innerHTML = list.map((p, i) => `<button type="button" class="chip" data-near="${i}">${geo.categoryEmoji(p.category)} ${esc(p.name)}</button>`).join('');
    box.hidden = !list.length;
  }).catch(() => {});
}

function renderEditorMedia() {
  const grid = $('#ed-media');
  if (!grid || !draft) return;
  const existing = (draft.memory.media || []).filter((it) => !draft.removed.has(it.id));
  const items = [...existing, ...draft.newFiles.map((f) => f.meta)];
  grid.innerHTML = items.map((it) => `
    <div class="media-tile ${it.kind}" data-mid="${it.id}">
      ${it.kind === 'video' ? '<span class="gal-play">▶</span>' : ''}
      <button type="button" class="media-x" data-remove="${it.id}" aria-label="${esc(t('common.delete'))}">×</button>
    </div>`).join('') +
    (draft.busy ? '<div class="media-tile is-loading"><span class="spinner"></span></div>' : '') +
    `<button type="button" class="media-add" id="ed-add"><span>＋</span><small>${esc(t('editor.media.add'))}</small></button>`;
  items.forEach(async (it) => {
    const url = await thumbURL(it.id);
    const tile = $(`.media-tile[data-mid="${it.id}"]`, grid);
    if (tile && url) tile.style.backgroundImage = `url("${url}")`;
  });
}

async function addFiles(fileList) {
  if (!draft) return;
  const d = draft;
  const files = [...fileList];
  for (const file of files) {
    if (!fileKind(file)) { toast(t('editor.badfile', { name: file.name }), { kind: 'warn' }); continue; }
    if (file.size > 300 * 1024 * 1024) toast(t('editor.bigfile', { name: file.name, size: fmtBytes(file.size) }), { kind: 'warn', ms: 6000 });
    d.busy++; renderEditorMedia();
    try {
      const prepared = await prepareFile(file, { shrink: settings.shrink });
      if (draft !== d) return;
      if (prepared) {
        primeThumb(prepared.meta.id, prepared.thumb);
        d.newFiles.push(prepared);
        d.dirty = true;
        const taken = prepared.exif?.date;
        const dateInput = $('#ed-date');
        if (taken && !d.dateTouched && dateInput && dateInput.value === d.initialDate && taken !== d.initialDate) {
          d.dateTouched = true;
          d.memory.date = taken;
          dateInput.value = taken;
          toast(t('toast.exif.date', { date: fmtDate(taken) }));
        }
      }
    } catch { toast(t('editor.badfile', { name: file.name }), { kind: 'warn' }); }
    d.busy--; renderEditorMedia();
  }
}

function readEditorForm() {
  const m = draft.memory;
  m.title = $('#ed-title').value.trim();
  m.date = $('#ed-date').value || todayISO();
  m.text = $('#ed-text').value.trim();
  m.tags = [...new Set($('#ed-tags').value.split(/[,，#\n]+/).map((x) => x.trim()).filter(Boolean))].slice(0, 12);
  const name = $('#ed-place').value.trim();
  m.place = { ...(m.place || {}), name };
}

async function saveDraft() {
  if (!draft || draft.saving) return;
  const d = draft;
  d.saving = true;
  const btn = $('#ed-save');
  if (btn) { btn.disabled = true; btn.textContent = t('editor.saving'); }
  try {
    readEditorForm();
    const m = d.memory;
    for (const f of d.newFiles) {
      await db.putMedia({ id: f.meta.id, memoryId: m.id, name: f.meta.name, mime: f.meta.mime, blob: f.blob });
      if (f.thumb) await db.putThumb({ id: f.meta.id, blob: f.thumb });
    }
    m.media = [...(m.media || []).filter((it) => !d.removed.has(it.id)), ...d.newFiles.map((f) => f.meta)];
    for (const id of d.removed) { await db.deleteMedia(id); forgetMedia(id); }
    m.updatedAt = Date.now();
    await db.putMemory(m);

    settings.lastPin = { ...m.pin };
    saveSettings();
    db.persist();
    upsertMemory(m);
    dropPin(m.id);
    d.abort?.abort();
    d.marker.remove();
    draft = null;
    closeDrawer();
    if (state.filter.year && !(m.date || '').startsWith(String(state.filter.year))) state.filter.year = null;
    renderAll();
    selectMemory(m.id, { fly: false, sparkle: d.isNew });
    toast(t(d.isNew ? 'toast.saved' : 'toast.updated'), { kind: 'ok' });
  } catch (err) {
    console.error(err);
    d.saving = false;
    if (btn) { btn.disabled = false; btn.textContent = t('editor.save'); }
    toast(t(err && err.name === 'QuotaExceededError' ? 'toast.quota' : 'toast.storage'), { kind: 'warn', ms: 6000 });
  }
}

function draftIsDirty() {
  if (!draft) return false;
  if (draft.dirty || draft.newFiles.length || draft.removed.size) return true;
  const title = $('#ed-title')?.value.trim() ?? '', text = $('#ed-text')?.value.trim() ?? '';
  return draft.isNew ? !!(title || text) : (title !== draft.memory.title || text !== draft.memory.text);
}
function confirmDiscard() {
  if (!draftIsDirty()) return Promise.resolve(true);
  return confirmDialog({ title: t('editor.discard'), body: t('editor.discard.body'), okLabel: t('common.delete'), danger: true });
}
function discardDraft() {
  if (!draft) return;
  const d = draft;
  d.abort?.abort();
  d.marker.remove();
  d.newFiles.forEach((f) => forgetMedia(f.meta.id));
  draft = null;
  closeDrawer();
  renderMarkers();
  if (!d.isNew && state.byId.has(d.memory.id)) selectMemory(d.memory.id, { fly: false });
}
async function cancelDraft() {
  if (await confirmDiscard()) discardDraft();
}

/* ====================================================================== */
/* sidebar: timeline + passport                                            */
/* ====================================================================== */

function setSheet(open) {
  state.sheetOpen = open;
  document.body.classList.toggle('sheet-open', open);
}
function setSidebar(open) {
  settings.sidebarOpen = open;
  saveSettings();
  document.body.classList.toggle('sidebar-open', open);
  syncPadding();
}

function memoryCard(m) {
  const cover = (m.media || [])[0];
  const place = m.place ? (m.place.city || m.place.name || '') : '';
  const cc = m.place?.countryCode;
  return `
    <button class="mem-card" data-id="${m.id}">
      <span class="mem-thumb" ${cover ? `data-thumb="${cover.id}"` : ''}>${cover ? '' : pinSVG(m.pin, { sticker: false })}
        ${cover ? `<span class="mem-mini">${pinSVG(m.pin)}</span>` : ''}</span>
      <span class="mem-main">
        <b>${esc(titleOf(m))}</b>
        <small>${esc(fmtDate(m.date))}${place ? ` · ${cc ? geo.flagEmoji(cc) + ' ' : ''}${esc(place)}` : ''}</small>
        ${m.text ? `<span class="mem-excerpt">${esc(m.text.slice(0, 110))}</span>` : ''}
        ${(m.media || []).length > 1 ? `<span class="mem-count">📷 ${(m.media || []).length}</span>` : ''}
      </span>
      ${m.mood ? `<span class="mem-mood">${esc(m.mood)}</span>` : ''}
    </button>`;
}

function renderTimeline() {
  const box = $('#timeline');
  $('#count-badge').textContent = state.memories.length;

  const years = [...new Set(state.memories.map((m) => (m.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  $('#year-chips').innerHTML = years.length > 1
    ? [`<button class="chip ${state.filter.year ? '' : 'is-on'}" data-year="">${esc(t('filter.all'))}</button>`,
      ...years.map((y) => `<button class="chip ${String(state.filter.year) === y ? 'is-on' : ''}" data-year="${y}">${y}</button>`)].join('')
    : '';
  $('.filter-row').hidden = state.memories.length < 4;

  if (!state.memories.length) {
    box.innerHTML = `
      <div class="empty">
        <div class="empty-art">${pinSVG({ char: 'cat' })}${pinSVG({ char: 'bunny', color: '#F7C8FF' })}${pinSVG({ char: 'frog' })}</div>
        <h3>${esc(t('timeline.empty.title'))}</h3><p>${esc(t('timeline.empty.body'))}</p>
        <button class="btn btn-primary" data-act="start-placing">＋ ${esc(t('fab.add'))}</button>
        <button class="btn btn-ghost" data-act="samples">${esc(t('welcome.samples'))}</button>
      </div>${adsAreLive() ? '' : '<div data-ad="sidebar"></div>'}`;
    mountSlots(box);
    return;
  }

  const list = filteredMemories();
  let html = '';

  // "On this day" from earlier years.
  const today = todayISO();
  const anniversaries = state.memories.filter((m) => m.date && m.date.slice(5) === today.slice(5) && m.date.slice(0, 4) < today.slice(0, 4));
  if (anniversaries.length && !state.filter.q && !state.filter.year) {
    html += `<div class="onthisday"><h4>🎂 ${esc(t('timeline.onthisday'))}</h4>${anniversaries.slice(0, 3).map((m) => {
      const n = +today.slice(0, 4) - +m.date.slice(0, 4);
      return `<button class="otd" data-id="${m.id}"><b>${esc(titleOf(m))}</b><small>${esc(n === 1 ? t('timeline.yearAgo') : t('timeline.yearsAgo', { n }))}</small></button>`;
    }).join('')}</div>`;
  }

  if (!list.length) html += `<p class="nomatch">${esc(t('timeline.nomatch'))}</p>`;
  let lastYear = null, n = 0;
  const every = feedEvery();
  for (const m of list.slice(0, state.limit)) {
    const y = (m.date || '').slice(0, 4);
    if (y !== lastYear) { html += `<h4 class="year-head">${esc(y || '—')}</h4>`; lastYear = y; }
    html += memoryCard(m);
    n++;
    if (adsAreLive() && n % every === 0 && n < list.length) html += '<div data-ad="feed"></div>';
  }
  if (list.length > state.limit) html += `<button class="btn btn-soft btn-block" data-act="more">${esc(t('timeline.more', { n: list.length - state.limit }))}</button>`;
  if (!adsAreLive()) html += '<div data-ad="sidebar"></div>';
  box.innerHTML = html;
  mountSlots(box);
  $$('[data-thumb]', box).forEach(async (el) => {
    const url = await thumbURL(el.dataset.thumb);
    if (url) el.style.backgroundImage = `url("${url}")`;
  });
  highlightCard();
}

function highlightCard() {
  $$('#timeline .mem-card').forEach((c) => c.classList.toggle('is-on', c.dataset.id === state.selectedId));
}

function computeStats() {
  const ms = state.memories;
  const countries = new Map(), cities = new Set(), continents = new Set();
  let photos = 0, videos = 0, unknown = 0;
  for (const m of ms) {
    const cc = m.place?.countryCode;
    if (cc) {
      countries.set(cc, (countries.get(cc) || 0) + 1);
      const k = geo.continentOf(cc); if (k) continents.add(k);
      if (m.place.city) cities.add(`${cc}|${m.place.city}`);
    } else unknown++;
    for (const it of m.media || []) it.kind === 'video' ? videos++ : photos++;
  }
  const chrono = [...ms].reverse();
  let km = 0;
  for (let i = 1; i < chrono.length; i++) km += geo.haversineKm(chrono[i - 1], chrono[i]);
  return { total: ms.length, countries, cities, continents, photos, videos, unknown, km, first: chrono[0], latest: chrono[chrono.length - 1] };
}

function renderPassport() {
  const box = $('#tab-passport');
  const s = computeStats();
  if (!s.total) {
    box.innerHTML = `<div class="empty"><div class="empty-art">${pinSVG({ char: 'planet' })}</div><p>${esc(t('passport.empty'))}</p></div>`;
    return;
  }
  const pct = Math.round((s.countries.size / 195) * 1000) / 10;
  const tile = (n, label, emoji) => `<div class="stat"><span class="stat-emoji">${emoji}</span><b>${n}</b><small>${esc(label)}</small></div>`;
  const countryRows = [...s.countries.entries()].sort((a, b) => b[1] - a[1]).map(([cc, n]) => `
    <button class="country-row" data-cc="${cc}"><span class="flag">${geo.flagEmoji(cc)}</span><span>${esc(geo.countryName(cc))}</span><em>${n}</em></button>`).join('');
  box.innerHTML = `
    <div class="stat-grid">
      ${tile(s.total, t('passport.memories'), '📍')}
      ${tile(s.countries.size, t('passport.countries'), '🌍')}
      ${tile(s.cities.size, t('passport.cities'), '🏙️')}
      ${tile(`${s.continents.size}<i>/7</i>`, t('passport.continents'), '🧭')}
      ${tile(s.photos, t('passport.photos'), '📷')}
      ${tile(s.videos, t('passport.videos'), '🎬')}
    </div>
    <div class="world-meter">
      <div class="meter"><span style="width:${Math.max(2, Math.min(100, pct))}%"></span></div>
      <p><b>${pct}%</b> ${esc(t('passport.world'))}</p>
    </div>
    <div class="continents">${geo.CONTINENT_KEYS.map((k) => `<span class="continent ${s.continents.has(k) ? 'is-on' : ''}">${esc(geo.continentName(k))}</span>`).join('')}</div>
    <div class="facts">
      <div><small>${esc(t('passport.distance'))}</small><b>${esc(fmtKm(s.km))}</b></div>
      <div><small>${esc(t('passport.first'))}</small><b>${esc(fmtDate(s.first?.date))}</b></div>
      <div><small>${esc(t('passport.latest'))}</small><b>${esc(fmtDate(s.latest?.date))}</b></div>
    </div>
    <label class="switch-row"><span><b>${esc(t('settings.journey'))}</b><small>${esc(t('settings.journey.sub'))}</small></span>
      <input type="checkbox" data-setting="journey" ${settings.journey ? 'checked' : ''}><i></i></label>
    <button class="btn btn-primary btn-block" data-act="card">🪪 ${esc(t('passport.card'))}</button>
    ${s.total > 1 ? `<button class="btn btn-soft btn-block" data-act="replay">▶️ ${esc(t('replay.start'))}</button>` : ''}
    <h4 class="year-head">${esc(t('passport.countrylist'))}</h4>
    <div class="country-list">${countryRows}${s.unknown ? `<div class="country-row is-muted"><span class="flag">🌍</span><span>${esc(t('passport.unknown'))}</span><em>${s.unknown}</em></div>` : ''}</div>`;
}

function setTab(tab) {
  state.tab = tab;
  $$('.tab').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
  $('#tab-timeline').hidden = tab !== 'timeline';
  $('#tab-passport').hidden = tab !== 'passport';
  if (tab === 'passport') renderPassport();
}

// Nudge towards a backup once there is something worth losing and no export in the last 30 days.
function backupIsDue() {
  const own = state.memories.filter((m) => !m.sample).length;
  if (own < 3) return false;
  let last = 0;
  try { last = +localStorage.getItem('ed-last-export') || 0; } catch {}
  return Date.now() - last > 30 * 864e5;
}

function renderAll() {
  setBackupNudge(backupIsDue());
  renderTimeline();
  if (state.tab === 'passport') renderPassport();
  renderMarkers();
  refreshOverlays();
}

/* ====================================================================== */
/* search                                                                  */
/* ====================================================================== */

let searchAbort = null;
let searchItems = [];
let searchIndex = -1;

function closeSearch() {
  const box = $('#search-results');
  box.hidden = true; box.innerHTML = '';
  searchItems = []; searchIndex = -1;
}

function paintSearch(items, note) {
  const box = $('#search-results');
  searchItems = items; searchIndex = -1;
  if (!items.length) { box.innerHTML = `<p class="search-note">${esc(note || t('search.empty'))}</p>`; box.hidden = false; return; }
  box.innerHTML = items.map((it, i) => `
    <button class="search-item" data-i="${i}">
      <span class="search-emoji">${it.memory ? `<span class="search-pin">${pinSVG(it.memory.pin, { sticker: false })}</span>` : it.emoji}</span>
      <span><b>${esc(it.title)}</b><small>${esc(it.sub)}</small></span>
    </button>`).join('');
  box.hidden = false;
}

const runSearch = debounce(async (q) => {
  searchAbort?.abort();
  q = q.trim();
  if (q.length < 2) { closeSearch(); return; }
  const mine = state.memories.filter((m) => [m.title, m.place?.name, m.place?.city].join(' ').toLowerCase().includes(q.toLowerCase()))
    .slice(0, 3).map((m) => ({ memory: m, title: titleOf(m), sub: [fmtDate(m.date), m.place?.city].filter(Boolean).join(' · ') }));
  const coords = geo.parseCoords(q);
  if (coords) {
    paintSearch([...mine, { emoji: '🧭', title: `${coords.lat}, ${coords.lng}`, sub: t('search.coords'), place: { name: '', lat: coords.lat, lng: coords.lng, kind: 'coords' } }]);
    return;
  }
  if (mine.length) paintSearch(mine);
  const ctl = (searchAbort = new AbortController());
  try {
    const c = map.getCenter();
    const places = await geo.searchPlaces(q, { lat: c.lat, lng: c.lng, zoom: map.getZoom(), signal: ctl.signal });
    if (ctl.signal.aborted) return;
    paintSearch([...mine, ...places.map((p) => ({
      place: p, emoji: geo.categoryEmoji(p.category || p.kind), title: p.name,
      sub: [geo.prettyCategory(p.category), p.street && p.street !== p.name ? p.street : '', geo.placeLine(p)].filter(Boolean).join(' · ')
    }))]);
  } catch (err) {
    if (err?.name === 'AbortError') return;
    if (!mine.length) paintSearch([], t('search.error'));
  }
}, 320);

function chooseSearch(i) {
  const it = searchItems[i];
  if (!it) return;
  closeSearch();
  $('#search-input').blur();
  if (it.memory) { selectMemory(it.memory.id); return; }
  const p = it.place;
  const zoomByKind = { country: 4.2, state: 6, county: 8.5, city: 11, district: 13, locality: 13.5, street: 16, house: 17.5, coords: 15 };
  if (p.extent && p.extent.length === 4 && ['country', 'state', 'county', 'city'].includes(p.kind)) {
    const [w, n, e, s] = p.extent;
    map.fitBounds([[w, s], [e, n]], { padding: viewPadding(), maxZoom: 13, animate: settings.motion, duration: 1600 });
  } else flyTo(p.lng, p.lat, zoomByKind[p.kind] || 16.5);
  const show = () => showSpotPopup({ lng: p.lng, lat: p.lat }, null, p.kind === 'coords' ? undefined : p);
  if (settings.motion) map.once('moveend', show); else show();
}

/* ====================================================================== */
/* lightbox                                                                */
/* ====================================================================== */

const lb = { items: [], i: 0 };
async function showLightbox(items, i) {
  lb.items = items; lb.i = i;
  $('#lightbox').hidden = false;
  document.body.classList.add('lb-open');
  await paintLightbox();
}
async function paintLightbox() {
  const it = lb.items[lb.i];
  const stage = $('#lb-stage');
  stage.innerHTML = '<span class="spinner"></span>';
  $('#lb-count').textContent = lb.items.length > 1 ? `${lb.i + 1} / ${lb.items.length}` : '';
  $$('.lb-nav').forEach((b) => { b.hidden = lb.items.length < 2; });
  const url = await fullURL(it.id);
  if (lb.items[lb.i] !== it) return;
  if (!url) { stage.innerHTML = '<p class="lb-missing">🫥</p>'; return; }
  stage.innerHTML = it.kind === 'video'
    ? `<video src="${url}" controls autoplay playsinline></video>`
    : `<img src="${url}" alt="${esc(it.name || '')}">`;
}
function closeLightbox() {
  $('#lb-stage').innerHTML = '';
  $('#lightbox').hidden = true;
  document.body.classList.remove('lb-open');
}
function stepLightbox(d) {
  if (lb.items.length < 2) return;
  lb.i = (lb.i + d + lb.items.length) % lb.items.length;
  paintLightbox();
}

/* ====================================================================== */
/* journey replay                                                          */
/* ====================================================================== */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function arriveAt(m) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; map.off('moveend', finish); resolve(); };
    const target = { center: [m.lng, m.lat], zoom: 6.4, padding: viewPadding() };
    if (!settings.motion) { map.jumpTo(target); return resolve(); }
    map.once('moveend', finish);
    setTimeout(finish, 9000);
    map.flyTo({ ...target, speed: 1.05, curve: 1.5, essential: true });
  });
}

async function startReplay() {
  const list = [...state.memories].reverse();
  if (list.length < 2 || draft || replay) return;
  closePopup(); setPlacing(false);
  if (state.selectedId) deselect();
  if (!isDesktop()) setSheet(false);
  const token = (replay = { journeyWas: settings.journey });
  settings.journey = true;
  refreshOverlays();
  document.body.classList.add('is-replaying');
  $('#replay-bar').hidden = false;
  for (let i = 0; i < list.length && replay === token; i++) {
    const m = list[i];
    $('#replay-title').textContent = titleOf(m);
    $('#replay-sub').textContent = [fmtDate(m.date), m.place?.city || m.place?.name, geo.countryName(m.place?.countryCode)].filter(Boolean).join(' · ');
    $('#replay-count').textContent = `${i + 1} / ${list.length}`;
    const thumb = $('#replay-thumb');
    thumb.style.backgroundImage = '';
    thumb.innerHTML = pinSVG(m.pin, { sticker: false });
    const cover = (m.media || [])[0];
    if (cover) thumbURL(cover.id).then((url) => { if (url && replay === token && $('#replay-title').textContent === titleOf(m)) { thumb.innerHTML = ''; thumb.style.backgroundImage = `url("${url}")`; } });
    await arriveAt(m);
    if (replay !== token) return;
    state.selectedId = m.id;
    renderMarkers();
    highlightCard();
    celebrate(m.id);
    await sleep(settings.motion ? 2600 : 1800);
  }
  if (replay === token) stopReplay();
}

function stopReplay() {
  if (!replay) return;
  const r = replay;
  replay = null;
  settings.journey = r.journeyWas;
  refreshOverlays();
  try { map.stop(); } catch {}
  $('#replay-bar').hidden = true;
  document.body.classList.remove('is-replaying');
  state.selectedId = null;
  renderMarkers();
  highlightCard();
}

/* ====================================================================== */
/* settings, welcome, data                                                 */
/* ====================================================================== */

function updateLangButton() { $('#btn-lang').textContent = getLang() === 'zh' ? 'EN' : '中文'; }

function switchRow(key, label, sub) {
  return `<label class="switch-row"><span><b>${esc(label)}</b><small>${esc(sub)}</small></span>
    <input type="checkbox" data-setting="${key}" ${settings[key] ? 'checked' : ''}><i></i></label>`;
}

async function openSettings() {
  const usage = await db.usage();
  const hasSamples = state.memories.some((m) => m.sample);
  const support = supportLink();
  const styles = Object.keys(CFG.map?.styles || {});
  const m = openModal({
    title: t('settings.title'), className: 'modal-settings',
    html: `
      <section class="set-block">
        <h3>${esc(t('settings.language'))}</h3>
        <div class="seg" data-seg="lang">
          <button data-v="en" class="${getLang() === 'en' ? 'is-on' : ''}">English</button>
          <button data-v="zh" class="${getLang() === 'zh' ? 'is-on' : ''}">中文</button>
        </div>
      </section>
      <section class="set-block">
        <h3>${esc(t('settings.map'))}</h3>
        <div class="seg" data-seg="style">${styles.map((k) => `<button data-v="${k}" class="${settings.style === k ? 'is-on' : ''}">${esc(t('settings.style.' + k))}</button>`).join('')}</div>
        ${switchRow('globe', t('settings.globe'), t('settings.globe.sub'))}
        ${switchRow('countries', t('settings.countries'), t('settings.countries.sub'))}
        ${switchRow('journey', t('settings.journey'), t('settings.journey.sub'))}
        ${switchRow('motion', t('settings.motion'), t('settings.motion.sub'))}
      </section>
      <section class="set-block">
        <h3>${esc(t('settings.data'))}</h3>
        <p class="set-note">${esc(t('settings.data.sub'))}</p>
        <p class="set-usage">💾 ${esc(t('settings.usage', { used: fmtBytes(usage.used) }))}</p>
        ${switchRow('shrink', t('settings.shrink'), t('settings.shrink.sub'))}
        <div class="set-actions">
          <button class="btn btn-primary" data-act="export">⬇️ ${esc(t('settings.export'))}</button>
          <button class="btn btn-soft" data-act="import">⬆️ ${esc(t('settings.import'))}</button>
          <button class="btn btn-soft" data-act="${hasSamples ? 'samples-remove' : 'samples'}">🧸 ${esc(t(hasSamples ? 'settings.samples.remove' : 'settings.samples.add'))}</button>
          <button class="btn btn-soft btn-danger-soft" data-act="wipe">🗑️ ${esc(t('settings.wipe'))}</button>
        </div>
        <input type="file" id="import-file" accept=".zip,.json,application/zip,application/json" hidden>
      </section>
      <footer class="set-foot">
        <a href="about.html">${esc(t('settings.about'))}</a><a href="guide.html">${esc(t('settings.guide'))}</a><a href="ideas.html">${esc(t('settings.ideas'))}</a>
        <a href="privacy.html">${esc(t('settings.privacy'))}</a><a href="terms.html">${esc(t('settings.terms'))}</a>
        <a href="${esc(CFG.repoUrl || '#')}" target="_blank" rel="noopener">GitHub</a>
        ${support ? `<a href="${esc(support.url)}" target="_blank" rel="noopener">🧋 ${esc(support.label)}</a>` : ''}
      </footer>`
  });

  m.body.addEventListener('click', async (e) => {
    const seg = e.target.closest('[data-seg] button');
    if (seg) {
      const kind = seg.parentElement.dataset.seg;
      if (kind === 'lang') { m.close(); changeLang(seg.dataset.v); return; }
      if (kind === 'style') {
        settings.style = seg.dataset.v; saveSettings();
        $$('button', seg.parentElement).forEach((b) => b.classList.toggle('is-on', b === seg));
        if (!usingBlank) { styleReady = false; map.setStyle(styleFor(settings.style)); }
      }
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'export') doExport();
    if (act === 'import') $('#import-file', m.body).click();
    if (act === 'samples') { m.close(); addSamples(); }
    if (act === 'samples-remove') { m.close(); removeSamples(); }
    if (act === 'wipe') {
      const ok = await confirmDialog({ title: t('settings.wipe.title'), body: t('settings.wipe.body'), okLabel: t('settings.wipe'), danger: true });
      if (!ok) return;
      await db.wipe();
      state.memories.forEach((x) => (x.media || []).forEach((it) => forgetMedia(it.id)));
      [...pinMarkers.keys()].forEach(dropPin);
      setMemories([]);
      state.selectedId = null; closeDrawer(); m.close(); renderAll();
    }
  });
  m.body.addEventListener('change', (e) => {
    if (e.target.id === 'import-file' && e.target.files[0]) { doImport(e.target.files[0]); m.close(); }
  });
}

function applySetting(key, value) {
  settings[key] = value;
  saveSettings();
  if (key === 'motion') document.body.classList.toggle('no-motion', !value);
  if (key === 'globe') { try { map.setProjection({ type: value ? 'globe' : 'mercator' }); } catch {} setTimeout(renderMarkers, 400); }
  if (key === 'journey' || key === 'countries') refreshOverlays();
  $$(`input[data-setting="${key}"]`).forEach((i) => { i.checked = value; });
}

function changeLang(next) {
  setLang(next);
  updateLangButton();
  renderAll();
  if (state.selectedId && !draft) renderDetail(state.byId.get(state.selectedId));
  for (const [id, rec] of pinMarkers) { const m = state.byId.get(id); if (m) $('.pin-tip', rec.el).textContent = titleOf(m); }
}

async function doExport() {
  try {
    const blob = await exportBackup(state.memories);
    downloadBlob(blob, `earth-diary-${todayISO()}.zip`);
    try { localStorage.setItem('ed-last-export', String(Date.now())); } catch {}
    setBackupNudge(false);
    renderTimeline();
    toast(t('toast.exported'), { kind: 'ok' });
  } catch (err) { console.error(err); toast(t('toast.storage'), { kind: 'warn' }); }
}
async function doImport(file) {
  try {
    const changed = await importBackup(file, state.byId);
    changed.forEach((m) => { dropPin(m.id); upsertMemory(m); });
    renderAll();
    if (changed.length) fitToMemories(changed, { maxZoom: 6 });
    toast(t('toast.imported', { n: changed.length }), { kind: 'ok' });
  } catch (err) {
    console.error(err);
    toast(t(err && err.name === 'QuotaExceededError' ? 'toast.quota' : 'toast.importfail'), { kind: 'warn', ms: 5000 });
  }
}
async function addSamples() {
  const made = await createSamples();
  made.forEach(upsertMemory);
  renderAll();
  fitToMemories(state.memories, { maxZoom: 3 });
  toast(t('toast.samples'), { kind: 'ok' });
}
async function removeSamples() {
  const samples = state.memories.filter((m) => m.sample);
  for (const m of samples) { await db.deleteMemory(m); (m.media || []).forEach((it) => forgetMedia(it.id)); dropPin(m.id); }
  setMemories(state.memories.filter((m) => !m.sample));
  if (state.selectedId && !state.byId.has(state.selectedId)) deselect();
  renderAll();
  toast(t('toast.samplesRemoved'));
}

function maybeWelcome() {
  let seen = false;
  try { seen = !!localStorage.getItem('ed-welcomed'); } catch {}
  if (seen || state.memories.length || params.has('nowelcome')) return;
  const m = openModal({
    className: 'modal-welcome',
    html: `
      <div class="welcome-art">${pinSVG({ char: 'bunny' })}${pinSVG({ char: 'cat' })}${pinSVG({ char: 'planet' })}${pinSVG({ char: 'frog' })}${pinSVG({ char: 'heart' })}</div>
      <h2>${esc(t('welcome.title'))}</h2>
      <p class="welcome-lead">${esc(t('welcome.body'))}</p>
      <ul class="welcome-list">
        <li><span>🗺️</span>${esc(t('welcome.p1'))}</li>
        <li><span>📍</span>${esc(t('welcome.p2'))}</li>
        <li><span>🪪</span>${esc(t('welcome.p3'))}</li>
      </ul>
      <p class="welcome-private">🔒 ${esc(t('welcome.private'))}</p>
      <div class="modal-actions stack">
        <button class="btn btn-primary btn-lg" data-a="start">${esc(t('welcome.start'))}</button>
        <button class="btn btn-ghost" data-a="samples">${esc(t('welcome.samples'))}</button>
      </div>`,
    onClose: () => { try { localStorage.setItem('ed-welcomed', '1'); } catch {} }
  });
  m.body.addEventListener('click', (e) => {
    const a = e.target?.dataset?.a;
    if (!a) return;
    m.close();
    if (a === 'samples') addSamples();
  });
}

// Fill in country / city for memories saved while offline (one request every 1.5 s).
let backfilling = false;
async function backfillPlaces() {
  if (backfilling) return;
  backfilling = true;
  const todo = state.memories.filter((m) => !m.place?.countryCode && !m.place?.noCountry).slice(0, 40);
  let changed = 0;
  for (const m of todo) {
    await new Promise((r) => setTimeout(r, 1300));
    if (!state.byId.has(m.id) || (draft && draft.memory.id === m.id)) continue;
    try {
      const found = await geo.reversePlace(m.lat, m.lng);
      const prev = m.place || {};
      if (found) {
        const close = geo.haversineKm(m, found) < 0.08;
        m.place = {
          ...prev, name: prev.name || (close ? found.name : '') || found.city || found.state || '',
          category: prev.category || (close ? found.category : ''),
          city: prev.city || found.city, state: found.state, country: found.country, countryCode: found.countryCode
        };
        if (!found.countryCode) m.place.noCountry = true;             // open ocean, Antarctica…
      } else m.place = { ...prev, noCountry: true };
      await db.putMemory(m);
      if (++changed % 5 === 0) renderAll();
    } catch { break; }
  }
  backfilling = false;
  if (changed) {
    renderAll();
    if (state.selectedId && !draft && state.byId.has(state.selectedId)) renderDetail(state.byId.get(state.selectedId));
  }
}

async function openShareCard() {
  await loadCountries();
  const s = computeStats();
  const canvas = await makeShareCard({ stats: s, memories: state.memories, countries: countriesData, lang: getLang() });
  const url = canvas.toDataURL('image/png');
  const m = openModal({
    title: t('passport.card'), className: 'modal-card',
    html: `<img class="card-preview" src="${url}" alt="${esc(t('card.title'))}">
      <div class="modal-actions"><button class="btn btn-primary btn-block" data-a="dl">⬇️ PNG</button></div>`
  });
  m.body.addEventListener('click', (e) => {
    if (e.target?.dataset?.a === 'dl') canvas.toBlob((b) => b && downloadBlob(b, 'my-earth-diary.png'), 'image/png');
  });
}

/* ====================================================================== */
/* events                                                                  */
/* ====================================================================== */

function bindUI() {
  $('#fab-add').addEventListener('click', () => { if (draft) return; if (replay) stopReplay(); if (state.placing) pendingFiles = null; setPlacing(!state.placing); });
  $('#placing-cancel').addEventListener('click', () => { pendingFiles = null; setPlacing(false); });
  $('#placing-photo').addEventListener('click', () => $('#photo-start').click());
  $('#photo-start').addEventListener('change', (e) => { const files = [...e.target.files]; e.target.value = ''; startFromFiles(files); });
  $('#replay-stop').addEventListener('click', stopReplay);

  // drag photos from the desktop straight onto the map
  const dropZone = $('#map-drop');
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  let dragDepth = 0;
  document.addEventListener('dragenter', (e) => { if (!hasFiles(e) || draft) return; dragDepth++; dropZone.hidden = false; });
  document.addEventListener('dragleave', (e) => { if (!hasFiles(e) || draft) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropZone.hidden = true; });
  document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0; dropZone.hidden = true;
    if (!draft) startFromFiles(e.dataTransfer.files);
  });
  $('#placing-here').addEventListener('click', () => {
    if (!navigator.geolocation) { toast(t('toast.geo.denied'), { kind: 'warn' }); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => startDraft({ lng: pos.coords.longitude, lat: pos.coords.latitude }, null),
      () => toast(t('toast.geo.denied'), { kind: 'warn' }),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  });

  $('#btn-lang').addEventListener('click', () => changeLang(getLang() === 'zh' ? 'en' : 'zh'));
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-sidebar').addEventListener('click', () => setSidebar(!settings.sidebarOpen));
  $('#sheet-grip').addEventListener('click', () => setSheet(!state.sheetOpen));
  $$('.tab').forEach((b) => b.addEventListener('click', () => { setTab(b.dataset.tab); if (!isDesktop()) setSheet(true); }));

  // search
  const input = $('#search-input');
  input.addEventListener('input', () => runSearch(input.value));
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) runSearch(input.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!searchItems.length) return;
      e.preventDefault();
      searchIndex = (searchIndex + (e.key === 'ArrowDown' ? 1 : -1) + searchItems.length) % searchItems.length;
      $$('#search-results .search-item').forEach((b, i) => b.classList.toggle('is-on', i === searchIndex));
    } else if (e.key === 'Enter') { e.preventDefault(); chooseSearch(searchIndex >= 0 ? searchIndex : 0); }
    else if (e.key === 'Escape') { closeSearch(); input.blur(); }
  });
  $('#search-results').addEventListener('click', (e) => {
    const b = e.target.closest('.search-item');
    if (b) chooseSearch(+b.dataset.i);
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.search')) closeSearch(); });

  // sidebar
  $('#filter-input').addEventListener('input', debounce((e) => { state.filter.q = e.target.value; state.limit = 120; renderTimeline(); renderMarkers(); }, 160));
  $('#year-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-year]');
    if (!b) return;
    state.filter.year = b.dataset.year || null;
    state.limit = 120;
    renderTimeline(); renderMarkers();
    const list = filteredMemories();
    if (state.filter.year && list.length) fitToMemories(list, { maxZoom: 6 });
  });
  $('#sidebar').addEventListener('click', (e) => {
    const card = e.target.closest('[data-id]');
    if (card) { selectMemory(card.dataset.id); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'start-placing') setPlacing(true);
    if (act === 'samples') addSamples();
    if (act === 'card') openShareCard();
    if (act === 'replay') startReplay();
    if (act === 'more') { state.limit += 120; renderTimeline(); }
    const row = e.target.closest('[data-cc]');
    if (row) fitToMemories(state.memories.filter((m) => m.place?.countryCode === row.dataset.cc), { maxZoom: 9 });
    const house = e.target.closest('[data-house-action]');
    if (house?.dataset.houseAction === 'backup') doExport();
  });
  document.addEventListener('change', (e) => {
    const key = e.target?.dataset?.setting;
    if (key) applySetting(key, e.target.checked);
  });

  // drawer (detail + editor) — delegated
  const d = drawer();
  d.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const kind = d.dataset.kind;
    if (kind === 'detail') {
      const m = state.byId.get(state.selectedId);
      if (!m) return;
      const gal = e.target.closest('.gal-item');
      if (gal) { showLightbox(m.media, +gal.dataset.i); return; }
      if (e.target.closest('#detail-hero') && !act && m.media?.length) { showLightbox(m.media, 0); return; }
      const tag = e.target.closest('[data-tag]');
      if (tag) { state.filter.q = '#' + tag.dataset.tag; $('#filter-input').value = state.filter.q; $('.filter-row').hidden = false; setTab('timeline'); renderTimeline(); renderMarkers(); if (!isDesktop()) setSheet(true); return; }
      if (act === 'close') deselect();
      if (act === 'edit') editMemory(m.id);
      if (act === 'delete') deleteMemory(m);
      if (act === 'recenter') flyTo(m.lng, m.lat, Math.max(map.getZoom(), 15.5));
      if (act === 'share') {
        const url = `${location.origin}${location.pathname}#map=16/${m.lat.toFixed(5)}/${m.lng.toFixed(5)}`;
        try { await navigator.clipboard.writeText(url); toast(t('common.copied'), { kind: 'ok' }); } catch { prompt('', url); }
      }
      const house = e.target.closest('[data-house-action]');
      if (house?.dataset.houseAction === 'backup') doExport();
      return;
    }
    if (kind === 'editor' && draft) {
      if (act === 'cancel') { cancelDraft(); return; }
      const ch = e.target.closest('[data-char]');
      if (ch) { draft.memory.pin = { char: ch.dataset.char, color: CHARACTERS[ch.dataset.char].tint ? draft.memory.pin.color : null }; draft.dirty = true; syncEditorPicks(); return; }
      const col = e.target.closest('[data-color]');
      if (col && CHARACTERS[draft.memory.pin.char]?.tint) { draft.memory.pin.color = col.dataset.color; draft.dirty = true; syncEditorPicks(); return; }
      const mood = e.target.closest('[data-mood]');
      if (mood) { draft.memory.mood = draft.memory.mood === mood.dataset.mood ? '' : mood.dataset.mood; draft.dirty = true; syncEditorPicks(); return; }
      const near = e.target.closest('[data-near]');
      if (near) {
        const p = draft.nearby?.[+near.dataset.near];
        if (!p) return;
        draft.memory.place = { name: p.name, category: p.category, city: p.city, state: p.state, country: p.country, countryCode: p.countryCode };
        draft.memory.lat = p.lat; draft.memory.lng = p.lng;
        draft.marker.setLngLat([p.lng, p.lat]);
        draft.nameLocked = true; draft.dirty = true;
        $('#ed-place').value = p.name;
        updatePlaceSub();
        $$('#ed-nearby-chips .chip').forEach((c) => c.classList.toggle('is-on', c === near));
        return;
      }
      if (e.target.closest('#ed-add')) { $('#ed-files').click(); return; }
      const rm = e.target.closest('[data-remove]');
      if (rm) {
        const id = rm.dataset.remove;
        const i = draft.newFiles.findIndex((f) => f.meta.id === id);
        if (i >= 0) { draft.newFiles.splice(i, 1); forgetMedia(id); } else draft.removed.add(id);
        draft.dirty = true;
        renderEditorMedia();
      }
    }
  });
  d.addEventListener('submit', (e) => { e.preventDefault(); saveDraft(); });
  d.addEventListener('change', (e) => {
    if (e.target.id === 'ed-files') { addFiles(e.target.files); e.target.value = ''; }
  });
  d.addEventListener('input', (e) => {
    if (!draft) return;
    if (e.target.id === 'ed-place') draft.nameLocked = !!e.target.value.trim();
    if (e.target.id === 'ed-date') draft.dateTouched = true;
    if (e.target.id === 'ed-title') { const tip = $('.pin-tip', draft.marker.getElement()); if (tip) tip.textContent = e.target.value || t('editor.new'); }
  });
  for (const ev of ['dragenter', 'dragover']) d.addEventListener(ev, (e) => { if (draft) { e.preventDefault(); d.classList.add('is-drop'); } });
  for (const ev of ['dragleave', 'drop']) d.addEventListener(ev, () => d.classList.remove('is-drop'));
  d.addEventListener('drop', (e) => { if (draft && e.dataTransfer?.files?.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
  document.addEventListener('paste', (e) => {
    if (!draft || !e.clipboardData?.files?.length) return;
    addFiles(e.clipboardData.files);
  });

  // lightbox
  $('#lightbox').addEventListener('click', (e) => {
    const a = e.target.dataset?.lb;
    if (a === 'close' || e.target.id === 'lightbox' || e.target.id === 'lb-stage') closeLightbox();
    if (a === 'prev') stepLightbox(-1);
    if (a === 'next') stepLightbox(1);
  });
  let touchX = null;
  $('#lightbox').addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  $('#lightbox').addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX; touchX = null;
    if (Math.abs(dx) > 50) stepLightbox(dx < 0 ? 1 : -1);
  });

  document.addEventListener('keydown', (e) => {
    const lbOpen = !$('#lightbox').hidden;
    if (lbOpen && e.key === 'ArrowLeft') return stepLightbox(-1);
    if (lbOpen && e.key === 'ArrowRight') return stepLightbox(1);
    if (e.key !== 'Escape') return;
    if (lbOpen) return closeLightbox();
    const modal = topModal();
    if (modal) return modal.close();
    if (replay) return stopReplay();
    if (state.placing) { pendingFiles = null; return setPlacing(false); }
    if (popup) return closePopup();
    if (draft) return cancelDraft();
    if (state.selectedId) return deselect();
  });

  window.addEventListener('beforeunload', (e) => { if (draftIsDirty()) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('resize', debounce(() => renderMarkers(), 200));
}

/* ====================================================================== */
/* boot                                                                    */
/* ====================================================================== */

async function boot() {
  initLang();
  applyI18n();
  updateLangButton();
  document.body.classList.toggle('no-motion', !settings.motion);
  document.body.classList.toggle('sidebar-open', settings.sidebarOpen);

  const durable = await db.init();
  let list = [];
  try { list = await db.allMemories(); } catch {}
  setMemories(list);

  bindUI();
  renderTimeline();
  try { initMap(); }
  catch (err) { console.error(err); map = null; toast(t('toast.webgl'), { kind: 'warn', ms: 12000 }); }
  renderAll();
  initMonetization();
  if (adsAreLive()) { const slot = $('#sidebar-ad'); slot.hidden = false; mountSlot(slot, 'sidebar'); }
  if (!durable) toast(t('toast.storage'), { kind: 'warn', ms: 7000 });
  maybeWelcome();
  setTimeout(backfillPlaces, 4000);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  document.body.classList.add('is-ready');
}

boot();
