// Earth Diary — place search, reverse geocoding and geography helpers.
// Uses the public Photon geocoder (OpenStreetMap data, no API key). Requests
// are debounced and cached so usage stays light, as its fair-use terms ask.

import { getLang } from './i18n.js';

const BASE = (window.ED_CONFIG?.map?.geocoder || 'https://photon.komoot.io').replace(/\/$/, '');
const cache = new Map();

async function getJSON(url, signal) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('geocoder ' + res.status);
  const json = await res.json();
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  cache.set(url, json);
  return json;
}

// Photon's public server knows a handful of languages; fall back to local names.
const photonLang = () => (getLang() === 'zh' ? '' : '&lang=en');

export function featureToPlace(f) {
  const p = f.properties || {};
  const [lng, lat] = f.geometry?.coordinates || [];
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const city = p.city || p.town || p.village || p.locality || (p.type === 'city' ? p.name : '') || p.district || p.county || '';
  return {
    name: p.name || street || '',
    street,
    city,
    state: p.state || '',
    country: p.country || '',
    countryCode: (p.countrycode || '').toUpperCase(),
    category: p.osm_value && p.osm_value !== 'yes' ? p.osm_value : (p.osm_key || ''),
    kind: p.type || '',
    lat, lng,
    extent: p.extent || null
  };
}

export function placeLine(place) {
  if (!place) return '';
  const parts = [];
  if (place.city && place.city !== place.name) parts.push(place.city);
  if (place.state && place.state !== place.city && !place.city) parts.push(place.state);
  const country = place.countryCode ? countryName(place.countryCode) : place.country;
  if (country && country !== place.name) parts.push(country);
  return parts.join(', ');
}

export function parseCoords(q) {
  const m = q.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = +m[1], lng = +m[2];
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export async function searchPlaces(q, { lat, lng, zoom, signal } = {}) {
  const bias = lat != null && zoom > 4 ? `&lat=${lat.toFixed(3)}&lon=${lng.toFixed(3)}&zoom=${Math.round(Math.min(zoom, 16))}` : '';
  const url = `${BASE}/api?q=${encodeURIComponent(q)}&limit=7${bias}${photonLang()}`;
  const json = await getJSON(url, signal);
  return (json.features || []).map(featureToPlace).filter((p) => p.name && p.lat != null);
}

export async function reversePlace(lat, lng, { signal } = {}) {
  const url = `${BASE}/reverse?lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&limit=1${photonLang()}`;
  const json = await getJSON(url, signal);
  const f = (json.features || [])[0];
  return f ? featureToPlace(f) : null;
}

// Named things within ~250 m, so a pin can snap to "that exact restaurant".
export async function nearbyPlaces(lat, lng, { signal } = {}) {
  const url = `${BASE}/reverse?lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&limit=10&radius=0.25${photonLang()}`;
  const json = await getJSON(url, signal);
  const seen = new Set();
  return (json.features || []).map(featureToPlace)
    .filter((p) => p.name && p.kind !== 'street' && !/^\d/.test(p.name) && !seen.has(p.name) && seen.add(p.name))
    .slice(0, 6);
}

/* ---------- geography helpers ---------- */

export function haversineKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

const CONTINENT_CODES = {
  AF: 'DZ AO BJ BW BF BI CM CV CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU YT MA MZ NA NE NG RE RW SH ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW',
  AN: 'AQ BV TF HM GS',
  AS: 'AF AM AZ BH BD BT BN KH CN CY GE HK IN ID IR IQ IL JP JO KZ KW KG LA LB MO MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE',
  EU: 'AX AL AD AT BY BE BA BG HR CZ DK EE FO FI FR DE GI GR GG HU IS IE IM IT JE XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SJ SE CH UA GB VA',
  NA: 'AI AG AW BS BB BZ BM BQ VG CA KY CR CU CW DM DO SV GL GD GP GT HT HN JM MQ MX MS NI PA PR BL KN LC MF PM VC SX TT TC US VI',
  OC: 'AS AU CK FJ PF GU KI MH FM NR NC NZ NU NF MP PW PG PN WS SB TK TO TV UM VU WF',
  SA: 'AR BO BR CL CO EC FK GF GY PY PE SR UY VE'
};
const CONTINENT_OF = {};
for (const [k, list] of Object.entries(CONTINENT_CODES)) list.split(' ').forEach((c) => { CONTINENT_OF[c] = k; });
const CONTINENT_NAMES = {
  en: { AF: 'Africa', AN: 'Antarctica', AS: 'Asia', EU: 'Europe', NA: 'North America', OC: 'Oceania', SA: 'South America' },
  zh: { AF: '非洲', AN: '南极洲', AS: '亚洲', EU: '欧洲', NA: '北美洲', OC: '大洋洲', SA: '南美洲' }
};
export const continentOf = (cc) => CONTINENT_OF[(cc || '').toUpperCase()] || null;
export const continentName = (k) => (CONTINENT_NAMES[getLang()] || CONTINENT_NAMES.en)[k] || k;
export const CONTINENT_KEYS = Object.keys(CONTINENT_CODES);

const displayNames = {};
export function countryName(cc) {
  if (!cc) return '';
  const lang = getLang() === 'zh' ? 'zh-Hans' : 'en';
  try {
    displayNames[lang] ||= new Intl.DisplayNames([lang], { type: 'region' });
    return displayNames[lang].of(cc.toUpperCase()) || cc;
  } catch { return cc; }
}
export function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return '🌍';
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// Friendly emoji for an OpenStreetMap category.
const CATEGORY_EMOJI = [
  [/restaurant|food_court|fast_food|noodle|ramen|sushi/, '🍜'], [/cafe|coffee|tea/, '☕'], [/bar|pub|biergarten|nightclub/, '🍹'],
  [/bakery|pastry|confectionery|ice_cream|dessert/, '🧁'], [/hotel|hostel|guest_house|motel|lodging|apartment/, '🏨'],
  [/museum|gallery|arts/, '🖼️'], [/park|garden|nature_reserve|forest|wood/, '🌳'], [/beach|bay|coastline/, '🏖️'],
  [/peak|mountain|volcano|hill|ridge/, '⛰️'], [/school|university|college|library/, '🎓'], [/hospital|clinic|pharmacy|doctors/, '🏥'],
  [/station|railway|subway|bus|tram|halt/, '🚉'], [/airport|aerodrome/, '✈️'], [/shop|mall|supermarket|marketplace|convenience|clothes|books/, '🛍️'],
  [/cinema|theatre|theater/, '🎬'], [/place_of_worship|temple|church|shrine|mosque|cathedral/, '⛩️'], [/zoo|aquarium|theme_park|attraction|viewpoint/, '🎡'],
  [/stadium|sports|pitch|fitness|swimming/, '🏟️'], [/castle|monument|memorial|ruins|archaeological/, '🏰'], [/lake|river|water|waterfall|spring/, '💧'],
  [/city|town|village|suburb|neighbourhood|locality|district/, '🏙️'], [/country|state|region|county/, '🗺️'], [/house|residential|building/, '🏠']
];
export function categoryEmoji(cat) {
  const c = (cat || '').toLowerCase();
  for (const [re, e] of CATEGORY_EMOJI) if (re.test(c)) return e;
  return '📍';
}
export const prettyCategory = (cat) => (cat || '').replace(/_/g, ' ');
