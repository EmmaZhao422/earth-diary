// Earth Diary — monetization layer: display ad slots, consent, affiliate links,
// tip link and optional analytics. All driven by assets/js/config.js.

import { t, pick } from './i18n.js';

const CFG = window.ED_CONFIG || {};
const ADS = CFG.ads || {};
const provider = ADS.provider || 'none';
const preview = new URLSearchParams(location.search).get('ads') === 'preview';

const SLOT_SIZES = { sidebar: '300×250', feed: 'fluid in-feed', detail: 'responsive', pages: 'responsive' };
const CONSENT_KEY = 'ed-consent';

let scriptsStarted = false;
let houseTurn = Math.floor(Math.random() * 3);

const readConsent = () => { try { return localStorage.getItem(CONSENT_KEY); } catch { return null; } };
const needsConsent = () => provider !== 'none' || !!CFG.analytics?.ga4;

function gtag() { (window.dataLayer = window.dataLayer || []).push(arguments); }

function loadScript(src, attrs = {}) {
  const s = document.createElement('script');
  s.async = true; s.src = src;
  for (const k in attrs) s.setAttribute(k, attrs[k]);
  document.head.appendChild(s);
  return s;
}

function startScripts(consent) {
  if (scriptsStarted) return;
  scriptsStarted = true;
  const granted = consent === 'granted';

  if (CFG.analytics?.goatcounter) {
    // GoatCounter is cookieless, so it does not wait for consent.
    loadScript('https://gc.zgo.at/count.js', { 'data-goatcounter': `https://${CFG.analytics.goatcounter}.goatcounter.com/count` });
  }
  if (CFG.analytics?.ga4) {
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(CFG.analytics.ga4)}`);
    gtag('js', new Date());
    gtag('config', CFG.analytics.ga4, { anonymize_ip: true });
  }
  if (provider === 'adsense' && ADS.adsense?.client) {
    window.adsbygoogle = window.adsbygoogle || [];
    if (!granted) window.adsbygoogle.requestNonPersonalizedAds = 1;
    loadScript(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADS.adsense.client)}`, { crossorigin: 'anonymous' });
  }
  document.querySelectorAll('[data-ad-pending]').forEach((el) => { el.removeAttribute('data-ad-pending'); fill(el, el.dataset.slot); });
}

function applyConsent(value) {
  const g = value === 'granted' ? 'granted' : 'denied';
  gtag('consent', 'update', { ad_storage: g, ad_user_data: g, ad_personalization: g, analytics_storage: g });
}

function showConsentBanner() {
  const bar = document.createElement('div');
  bar.className = 'consent';
  bar.setAttribute('role', 'dialog');
  bar.innerHTML = `
    <p>${t('consent.text')} <a href="privacy.html">${t('consent.more')}</a></p>
    <div class="consent-actions">
      <button class="btn btn-ghost" data-v="denied">${t('consent.decline')}</button>
      <button class="btn btn-primary" data-v="granted">${t('consent.accept')}</button>
    </div>`;
  bar.addEventListener('click', (e) => {
    const v = e.target?.dataset?.v;
    if (!v) return;
    try { localStorage.setItem(CONSENT_KEY, v); } catch {}
    applyConsent(v);
    bar.remove();
    startScripts(v);
  });
  document.body.appendChild(bar);
}

export function initMonetization() {
  gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', wait_for_update: 500 });
  if (!needsConsent()) { startScripts('denied'); return; }
  const saved = readConsent();
  if (saved) { applyConsent(saved); startScripts(saved); }
  else if (ADS.consentBanner === false) startScripts('denied');   // a certified CMP (e.g. AdSense "Privacy & messaging") handles consent
  else showConsentBanner();
}

function injectHTML(el, html) {
  el.innerHTML = html;
  el.querySelectorAll('script').forEach((old) => {            // scripts set via innerHTML do not run; re-create them
    const s = document.createElement('script');
    for (const a of old.attributes) s.setAttribute(a.name, a.value);
    s.textContent = old.textContent;
    old.replaceWith(s);
  });
}

function houseCard(name) {
  const cards = [
    { icon: '💾', title: t('house.backup.title'), body: t('house.backup.body'), cta: t('house.backup.cta'), action: 'backup' },
    { icon: '💡', title: t('house.tip.title'), body: t('house.tip.body') },
    { icon: '⭐', title: t('house.star.title'), body: t('house.star.body'), cta: t('house.star.cta'), href: CFG.repoUrl }
  ];
  if (CFG.support?.url) cards.push({ icon: '🧋', title: t('house.star.title'), body: t('house.star.body'), cta: pick(CFG.support.label), href: CFG.support.url });
  const c = cards[(houseTurn++) % cards.length];
  const cta = !c.cta ? '' : c.href
    ? `<a class="house-cta" href="${c.href}" target="_blank" rel="noopener">${c.cta}</a>`
    : `<button class="house-cta" data-house-action="${c.action}">${c.cta}</button>`;
  return `<div class="house house-${name}"><span class="house-icon">${c.icon}</span><div><strong>${c.title}</strong><p>${c.body}</p>${cta}</div></div>`;
}

function fill(el, name) {
  el.classList.add('ad-slot', `ad-slot-${name}`);
  el.dataset.slot = name;

  if (preview) {
    el.innerHTML = `<div class="ad-preview"><span>${t('ad.label')}</span><b>${name}</b><small>${SLOT_SIZES[name] || ''}</small></div>`;
    return;
  }
  if (provider === 'adsense' && ADS.adsense?.client && ADS.adsense.slots?.[name]) {
    if (!scriptsStarted) { el.setAttribute('data-ad-pending', ''); return; }
    el.innerHTML = `<span class="ad-label">${t('ad.label')}</span>
      <ins class="adsbygoogle" style="display:block" data-ad-client="${ADS.adsense.client}" data-ad-slot="${ADS.adsense.slots[name]}"
        ${name === 'feed' ? 'data-ad-format="fluid"' : 'data-ad-format="auto" data-full-width-responsive="true"'}></ins>`;
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch {}
    return;
  }
  if (provider === 'custom' && ADS.custom?.[name]) {
    if (!scriptsStarted) { el.setAttribute('data-ad-pending', ''); return; }
    el.innerHTML = `<span class="ad-label">${t('ad.label')}</span><div class="ad-custom"></div>`;
    injectHTML(el.querySelector('.ad-custom'), ADS.custom[name]);
    return;
  }
  // No ad network configured for this slot: show a small house card inside the
  // app, and nothing at all on the content pages.
  if (name === 'pages') { el.remove(); return; }
  el.innerHTML = houseCard(name);
}

export function mountSlot(el, name) { if (el) fill(el, name); return el; }
export function mountSlots(root = document) {
  root.querySelectorAll('[data-ad]').forEach((el) => fill(el, el.dataset.ad));
}
export const feedEvery = () => Math.max(3, ADS.feedEvery || 6);
export const adsAreLive = () => preview || provider !== 'none';

/* ---------- affiliate links ---------- */
export function affiliateLinks(place, lat, lng) {
  const A = CFG.affiliate;
  if (!A || !A.enabled || !Array.isArray(A.links)) return [];
  const city = place?.city || '';
  const country = place?.country || '';
  const q = [city || place?.name || '', country].filter(Boolean).join(' ').trim();
  if (!q) return [];
  const enc = encodeURIComponent;
  return A.links.map((l) => ({
    id: l.id, icon: l.icon || '🔗', label: pick(l.label),
    url: String(l.url || '')
      .replaceAll('{q}', enc(q)).replaceAll('{city}', enc(city)).replaceAll('{country}', enc(country))
      .replaceAll('{lat}', lat.toFixed(5)).replaceAll('{lng}', lng.toFixed(5))
  })).filter((l) => /^https:\/\//.test(l.url));
}

export function supportLink() {
  return CFG.support?.url ? { url: CFG.support.url, label: pick(CFG.support.label) } : null;
}
