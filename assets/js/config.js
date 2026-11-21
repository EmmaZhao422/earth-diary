/*
 * Earth Diary — site configuration.
 * This is the ONLY file you need to edit to turn on ads, affiliate links,
 * tips and analytics. Everything is off until an ID is filled in.
 * See docs/MONETIZATION.md for the step-by-step.
 */
window.ED_CONFIG = {
  siteName: 'Earth Diary',
  repoUrl: 'https://github.com/EmmaZhao422/earth-diary',

  /* ---------- Map ---------- */
  map: {
    // Free vector tiles built from OpenStreetMap (no API key).
    styles: {
      liberty: 'https://tiles.openfreemap.org/styles/liberty',
      bright: 'https://tiles.openfreemap.org/styles/bright',
      positron: 'https://tiles.openfreemap.org/styles/positron'
    },
    defaultStyle: 'liberty',
    // Free OpenStreetMap search (no API key). Please keep requests modest.
    geocoder: 'https://photon.komoot.io'
  },

  /* ---------- Display ads ---------- */
  ads: {
    // 'none'    -> slots show small house cards (tips / support), no third-party code is loaded
    // 'adsense' -> Google AdSense (needs a custom domain + an approved account)
    // 'custom'  -> paste any network's HTML snippet per slot below
    provider: 'none',

    adsense: {
      client: '',            // e.g. 'ca-pub-1234567890123456'
      slots: {
        sidebar: '',         // ad unit id for the box at the bottom of the timeline
        feed: '',            // ad unit id for the card inside the timeline list
        detail: '',          // ad unit id for the box under an opened memory
        pages: ''            // ad unit id for the content pages (about / guide / faq)
      }
    },

    // Used when provider === 'custom'. Each value is an HTML string.
    custom: { sidebar: '', feed: '', detail: '', pages: '' },

    // Show a feed ad after every N memories in the timeline.
    feedEvery: 6
  },

  /* ---------- Affiliate links ("Plan a trip here") ---------- */
  // Shown inside an opened memory and in place search results.
  // Placeholders: {q} place name (url-encoded), {lat}, {lng}, {city}, {country}
  // To earn commission, replace each url with the deep-link template generated
  // in that program's dashboard. Without an ID the links still work, they just
  // do not pay.
  affiliate: {
    enabled: true,
    links: [
      { id: 'stay', icon: '🏨', label: { en: 'Stays nearby', zh: '附近住宿' },
        url: 'https://www.booking.com/searchresults.html?ss={q}' },
      { id: 'do', icon: '🎟️', label: { en: 'Things to do', zh: '当地玩乐' },
        url: 'https://www.getyourguide.com/s/?q={q}' },
      { id: 'eat', icon: '🍜', label: { en: 'Food guide', zh: '美食攻略' },
        url: 'https://www.tripadvisor.com/Search?q={q}' }
    ]
  },

  /* ---------- Tips / donations ---------- */
  support: {
    url: '',                 // e.g. 'https://ko-fi.com/yourname' or 'https://buymeacoffee.com/yourname'
    label: { en: 'Buy me a boba', zh: '请我喝杯奶茶' }
  },

  /* ---------- Analytics (optional, needed to prove traffic to ad networks) ---------- */
  analytics: {
    goatcounter: '',         // e.g. 'earthdiary' -> https://earthdiary.goatcounter.com
    ga4: ''                  // e.g. 'G-XXXXXXXXXX'
  }
};
