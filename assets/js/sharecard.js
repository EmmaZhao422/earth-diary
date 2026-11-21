// Earth Diary — "passport card": a shareable 1080×1350 image of your stats.

import { t, fmtKm } from './i18n.js';
import { pinSVG } from './pins.js';
import { countryName } from './geo.js';

const W = 1080, H = 1350;
const INK = '#4a3b5c';
const FONT_HEAD = 'Fredoka, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif';
const FONT_BODY = 'Nunito, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif';

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function loadSVG(svg) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', '<svg width="216" height="312" '));
  });
}

function drawWorld(g, box, countries, visited, memories) {
  const { x, y, w, h } = box;
  const LAT_TOP = 84, LAT_BOTTOM = -58;
  const px = (lng) => x + ((lng + 180) / 360) * w;
  const py = (lat) => y + ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * h;

  g.save();
  roundRect(g, x, y, w, h, 36);
  g.fillStyle = '#BFE3F7';
  g.fill();
  g.clip();

  if (countries?.features) {
    for (const f of countries.features) {
      const on = visited.has(f.properties.iso);
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      g.beginPath();
      for (const poly of polys) for (const ring of poly) {
        // rings that cross the antimeridian are stored with longitudes past 180; draw them on both edges
        const shifts = ring.some(([lng]) => lng > 180) ? [0, -360] : [0];
        for (const shift of shifts) {
          ring.forEach(([lng, lat], i) => (i ? g.lineTo(px(lng + shift), py(lat)) : g.moveTo(px(lng + shift), py(lat))));
          g.closePath();
        }
      }
      g.fillStyle = on ? '#FF8FA3' : '#FBF1DF';
      g.fill('evenodd');
      g.lineWidth = on ? 1.4 : 0.7;
      g.strokeStyle = on ? '#E8607D' : '#E3D2B5';
      g.stroke();
    }
  }
  for (const m of memories) {
    const cx = px(m.lng), cy = py(Math.max(LAT_BOTTOM, Math.min(LAT_TOP, m.lat)));
    g.beginPath(); g.arc(cx, cy, 8, 0, Math.PI * 2);
    g.fillStyle = '#fff'; g.fill();
    g.beginPath(); g.arc(cx, cy, 5.2, 0, Math.PI * 2);
    g.fillStyle = '#FF5C7A'; g.fill();
  }
  g.restore();
  roundRect(g, x, y, w, h, 36);
  g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
}

export async function makeShareCard({ stats, memories, countries }) {
  try { await Promise.all([document.fonts.load(`600 40px Fredoka`), document.fonts.load(`700 30px Nunito`)]); } catch {}
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#FFF6E9'); bg.addColorStop(1, '#FFE0EA');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.5;
  [['#FFD166', 960, 120, 150], ['#C9B6FF', 90, 1270, 170], ['#9EE6CF', 1010, 1120, 110]].forEach(([col, cx, cy, r]) => {
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = col; g.fill();
  });
  g.globalAlpha = 1;

  // header
  g.fillStyle = INK; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.font = `600 84px ${FONT_HEAD}`;
  g.fillText(t('card.title'), 64, 150);
  const top = memories.slice(0, 3);
  const pins = await Promise.all((top.length ? top.map((m) => m.pin) : [{ char: 'cat' }, { char: 'bunny' }, { char: 'planet' }]).map((p) => loadSVG(pinSVG(p))));
  pins.forEach((img, i) => { if (img) g.drawImage(img, W - 120 - (pins.length - 1 - i) * 92, 44, 104, 150); });

  drawWorld(g, { x: 60, y: 216, w: 960, h: 500 }, countries, new Set(stats.countries.keys()), memories);

  // stats
  const tiles = [
    [stats.countries.size, t('passport.countries'), '#FFB5A7'],
    [stats.cities.size, t('passport.cities'), '#A9D6FF'],
    [stats.total, t('passport.memories'), '#FFE680'],
    [`${stats.continents.size}/7`, t('passport.continents'), '#C8EE9A'],
    [stats.photos + stats.videos, `${t('passport.photos')} + ${t('passport.videos')}`, '#F7C8FF'],
    [fmtKm(stats.km), t('passport.distance'), '#9EE6CF']
  ];
  const tw = 300, th = 176, gap = 30;
  tiles.forEach(([num, label, col], i) => {
    const x = 60 + (i % 3) * (tw + gap), y = 760 + Math.floor(i / 3) * (th + gap);
    roundRect(g, x + 6, y + 8, tw, th, 32); g.fillStyle = INK; g.fill();
    roundRect(g, x, y, tw, th, 32); g.fillStyle = col; g.fill();
    g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
    g.fillStyle = INK; g.textAlign = 'center';
    const text = String(num);
    g.font = `600 ${text.length > 7 ? 54 : 80}px ${FONT_HEAD}`;
    g.fillText(text, x + tw / 2, y + 96);
    g.font = `700 26px ${FONT_BODY}`;
    g.fillText(label, x + tw / 2, y + 142, tw - 24);
  });

  // country names
  const names = [...stats.countries.keys()].map((cc) => countryName(cc));
  g.textAlign = 'left'; g.fillStyle = INK; g.font = `700 30px ${FONT_BODY}`;
  let line = '', y = 1218, lines = 0;
  for (let i = 0; i < names.length && lines < 2; i++) {
    const next = line ? `${line} · ${names[i]}` : names[i];
    if (g.measureText(next).width > W - 128) {
      lines++;
      if (lines === 2) { g.fillText(line + ' …', 64, y); line = ''; break; }
      g.fillText(line, 64, y); y += 44; line = names[i];
    } else line = next;
  }
  if (line && lines < 2) g.fillText(line, 64, y);

  g.textAlign = 'center'; g.font = `600 28px ${FONT_HEAD}`; g.globalAlpha = 0.75;
  g.fillText(`${t('card.footer')} · ${location.host}${location.pathname.replace(/index\.html$/, '')}`, W / 2, H - 36);
  g.globalAlpha = 1;
  return c;
}
