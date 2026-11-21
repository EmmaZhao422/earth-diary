// Earth Diary — original pin characters, drawn as inline SVG.
// Every character shares one teardrop body so they read as a family.

const INK = '#4a3b5c';
const BODY = 'M32 77 C31 77 9 52 9 30 A23 23 0 1 1 55 30 C55 52 33 77 32 77 Z';
const HEART = 'M32 77 C12 58 4 44 4 27 A14.5 14.5 0 0 1 32 19 A14.5 14.5 0 0 1 60 27 C60 44 52 58 32 77 Z';

export const PALETTE = [
  '#FFD9A0', '#FFB5A7', '#FF8FA3', '#F7C8FF', '#C9B6FF',
  '#A9D6FF', '#9EE6CF', '#C8EE9A', '#FFE680', '#FFFFFF'
];

let uid = 0;

const eyes = (y = 30, dx = 8, rx = 2.6, ry = 3.2) => `
  <g class="pin-eyes">
    <ellipse cx="${32 - dx}" cy="${y}" rx="${rx}" ry="${ry}" fill="${INK}"/>
    <ellipse cx="${32 + dx}" cy="${y}" rx="${rx}" ry="${ry}" fill="${INK}"/>
    <circle cx="${32 - dx + 0.9}" cy="${y - 1.2}" r="0.9" fill="#fff"/>
    <circle cx="${32 + dx + 0.9}" cy="${y - 1.2}" r="0.9" fill="#fff"/>
  </g>`;
const blush = (y = 36, dx = 13.5) => `
  <ellipse cx="${32 - dx}" cy="${y}" rx="3.6" ry="2.2" fill="#FF8FA3" opacity=".7"/>
  <ellipse cx="${32 + dx}" cy="${y}" rx="3.6" ry="2.2" fill="#FF8FA3" opacity=".7"/>`;
const mouthW = (y = 35.5) => `<path d="M29 ${y} Q30.5 ${y + 2.6} 32 ${y} Q33.5 ${y + 2.6} 35 ${y}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
const mouthSmile = (y = 35.5, w = 2.6) => `<path d="M${32 - w} ${y} Q32 ${y + 3.2} ${32 + w} ${y}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`;
const S = `stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"`;
const body = (fill, d = BODY) => `<path d="${d}" fill="${fill}" ${S}/>`;
const shine = `<path d="M17 20 Q20 12 28 10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>`;

export const CHARACTERS = {
  cat: {
    name: { en: 'Kitty', zh: '小猫' }, color: '#FFD9A0', tint: true,
    draw: (c) => `
      <path d="M13 19 L10.5 0 L27 9 Z" fill="${c}" ${S}/><path d="M51 19 L53.5 0 L37 9 Z" fill="${c}" ${S}/>
      <path d="M15 12.5 L14 5 L21 9 Z" fill="#FF8FA3"/><path d="M49 12.5 L50 5 L43 9 Z" fill="#FF8FA3"/>
      ${body(c)}${shine}${eyes()}${blush()}${mouthW()}
      <path d="M12 31 H5 M12.5 34.5 L6 36.5 M52 31 H59 M51.5 34.5 L58 36.5" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>`
  },
  bear: {
    name: { en: 'Bear', zh: '小熊' }, color: '#DDB08A', tint: true,
    draw: (c) => `
      <circle cx="14" cy="11" r="7.5" fill="${c}" ${S}/><circle cx="50" cy="11" r="7.5" fill="${c}" ${S}/>
      <circle cx="14" cy="11" r="3.4" fill="#fff" opacity=".55"/><circle cx="50" cy="11" r="3.4" fill="#fff" opacity=".55"/>
      ${body(c)}${shine}${eyes(29)}
      <ellipse cx="32" cy="37" rx="8.5" ry="6.2" fill="#fff" opacity=".7"/>
      <ellipse cx="32" cy="34.6" rx="2.5" ry="1.8" fill="${INK}"/>${mouthSmile(37.6, 2.2)}${blush(37, 15)}`
  },
  bunny: {
    name: { en: 'Bunny', zh: '兔兔' }, color: '#FFFFFF', tint: true,
    draw: (c) => `
      <ellipse cx="22" cy="-1" rx="5.6" ry="14" transform="rotate(-9 22 10)" fill="${c}" ${S}/>
      <ellipse cx="42" cy="-1" rx="5.6" ry="14" transform="rotate(9 42 10)" fill="${c}" ${S}/>
      <ellipse cx="22" cy="0" rx="2.3" ry="9" transform="rotate(-9 22 10)" fill="#FFB5C5"/>
      <ellipse cx="42" cy="0" rx="2.3" ry="9" transform="rotate(9 42 10)" fill="#FFB5C5"/>
      ${body(c)}${eyes()}${blush()}
      <path d="M30.6 34 H33.4 L32 35.8 Z" fill="#FF8FA3" stroke="${INK}" stroke-width="1"/>${mouthW(36.4)}`
  },
  frog: {
    name: { en: 'Froggy', zh: '小青蛙' }, color: '#A8E06C',
    draw: (c) => `
      <circle cx="19" cy="10" r="8.8" fill="${c}" ${S}/><circle cx="45" cy="10" r="8.8" fill="${c}" ${S}/>
      ${body(c)}${shine}
      <circle cx="19" cy="10" r="5.4" fill="#fff"/><circle cx="45" cy="10" r="5.4" fill="#fff"/>
      <g class="pin-eyes"><circle cx="20" cy="10.5" r="2.9" fill="${INK}"/><circle cx="44" cy="10.5" r="2.9" fill="${INK}"/>
      <circle cx="21" cy="9.4" r=".9" fill="#fff"/><circle cx="45" cy="9.4" r=".9" fill="#fff"/></g>
      <path d="M21 31 Q32 41 43 31" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>${blush(35, 15)}`
  },
  chick: {
    name: { en: 'Chick', zh: '小鸡' }, color: '#FFE680', tint: true,
    draw: (c) => `
      <path d="M32 8 Q26 -3 33 -6 Q31 0 38 -3 Q35 4 32 8 Z" fill="${c}" ${S}/>
      ${body(c)}${shine}${eyes(29)}${blush(35)}
      <path d="M28.6 33.4 H35.4 L32 38.6 Z" fill="#FF9F43" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`
  },
  fox: {
    name: { en: 'Fox', zh: '小狐狸' }, color: '#FF9F5A',
    draw: (c, id) => `
      <path d="M12 20 L8 -3 L27 9 Z" fill="${c}" ${S}/><path d="M52 20 L56 -3 L37 9 Z" fill="${c}" ${S}/>
      <path d="M13.5 9 L11.5 1.5 L18.5 6 Z" fill="${INK}"/><path d="M50.5 9 L52.5 1.5 L45.5 6 Z" fill="${INK}"/>
      ${body(c)}
      <clipPath id="${id}"><path d="${BODY}"/></clipPath>
      <path clip-path="url(#${id})" d="M6 33 Q20 29 32 39 Q44 29 58 33 V80 H6 Z" fill="#fff"/>
      <path d="${BODY}" fill="none" ${S}/>${shine}${eyes(29)}
      <ellipse cx="32" cy="37.6" rx="2.4" ry="1.7" fill="${INK}"/>${blush(37.5, 14.5)}`
  },
  panda: {
    name: { en: 'Panda', zh: '熊猫' }, color: '#FFFFFF',
    draw: (c) => `
      <circle cx="14" cy="11" r="7.5" fill="${INK}" ${S}/><circle cx="50" cy="11" r="7.5" fill="${INK}" ${S}/>
      ${body(c)}
      <ellipse cx="23.5" cy="30" rx="5.6" ry="6.8" transform="rotate(18 23.5 30)" fill="${INK}"/>
      <ellipse cx="40.5" cy="30" rx="5.6" ry="6.8" transform="rotate(-18 40.5 30)" fill="${INK}"/>
      <g class="pin-eyes"><circle cx="24.2" cy="29.6" r="2.1" fill="#fff"/><circle cx="39.8" cy="29.6" r="2.1" fill="#fff"/></g>
      <ellipse cx="32" cy="36.4" rx="2.3" ry="1.6" fill="${INK}"/>${mouthSmile(38.6, 2)}${blush(39, 14)}`
  },
  penguin: {
    name: { en: 'Penguin', zh: '企鹅' }, color: '#6C7FA8',
    draw: (c) => `
      ${body(c)}
      <path d="M32 21 C26 13 14 19 16 32 C17.5 46 27 60 32 69 C37 60 46.5 46 48 32 C50 19 38 13 32 21 Z" fill="#fff"/>
      ${shine}${eyes(31, 7)}${blush(37, 11.5)}
      <path d="M28.8 35 H35.2 L32 39.6 Z" fill="#FF9F43" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`
  },
  mushroom: {
    name: { en: 'Mushroom', zh: '小蘑菇' }, color: '#FFF3DC',
    draw: (c, id) => `
      ${body(c)}
      <clipPath id="${id}"><path d="${BODY}"/></clipPath>
      <g clip-path="url(#${id})">
        <path d="M4 -20 H60 V21 Q53.5 27 47 21 Q39.5 27 32 21 Q24.5 27 17 21 Q10.5 27 4 21 Z" fill="#FF6B6B"/>
        <circle cx="20" cy="10" r="4.2" fill="#fff"/><circle cx="37" cy="5.5" r="3.2" fill="#fff"/>
        <circle cx="47" cy="15" r="2.6" fill="#fff"/><circle cx="29" cy="17" r="2" fill="#fff"/>
      </g>
      <path d="${BODY}" fill="none" ${S}/>${eyes(33)}${blush(39)}${mouthSmile(38.4, 2.2)}`
  },
  strawberry: {
    name: { en: 'Strawberry', zh: '草莓' }, color: '#FF6B81',
    draw: (c) => `
      ${body(c)}${shine}
      <g fill="#FFE680"><ellipse cx="20" cy="46" rx="1.1" ry="1.8"/><ellipse cx="44" cy="46" rx="1.1" ry="1.8"/>
      <ellipse cx="32" cy="52" rx="1.1" ry="1.8"/><ellipse cx="26" cy="60" rx="1.1" ry="1.8"/><ellipse cx="38" cy="60" rx="1.1" ry="1.8"/>
      <ellipse cx="14" cy="24" rx="1.1" ry="1.8"/><ellipse cx="50" cy="24" rx="1.1" ry="1.8"/></g>
      <g fill="#5FCF80" ${S}>
        <path d="M32 10 Q20 12 15 4 Q25 0 32 10 Z"/><path d="M32 10 Q44 12 49 4 Q39 0 32 10 Z"/>
        <path d="M32 11 Q25 4 32 -5 Q39 4 32 11 Z"/>
      </g>${eyes(31)}${blush(37)}${mouthSmile(36, 2.2)}`
  },
  mochi: {
    name: { en: 'Mochi', zh: '麻薯' }, color: '#FFFFFF', tint: true,
    draw: (c) => `
      ${body(c)}${eyes(30, 8.5, 3, 3.8)}${blush(37, 14)}
      <ellipse cx="32" cy="37" rx="2.2" ry="2.6" fill="${INK}"/><ellipse cx="32" cy="38" rx="1.2" ry="1.2" fill="#FF8FA3"/>`
  },
  sprout: {
    name: { en: 'Sprout', zh: '小芽' }, color: '#9EE6CF', tint: true,
    draw: (c) => `
      <path d="M32 9 V-3" ${S} fill="none"/>
      <path d="M32 -2 Q22 -4 19 -14 Q30 -14 32 -2 Z" fill="#5FCF80" ${S}/>
      <path d="M32 -2 Q42 -4 45 -14 Q34 -14 32 -2 Z" fill="#7BE09A" ${S}/>
      ${body(c)}${shine}${eyes()}${blush()}${mouthSmile()}`
  },
  planet: {
    name: { en: 'Planet', zh: '小星球' }, color: '#C9B6FF', tint: true,
    draw: (c, id) => `
      <ellipse cx="32" cy="34" rx="31" ry="9" transform="rotate(-14 32 34)" fill="none" stroke="${INK}" stroke-width="6.4"/>
      <ellipse cx="32" cy="34" rx="31" ry="9" transform="rotate(-14 32 34)" fill="none" stroke="#FFD166" stroke-width="3"/>
      ${body(c)}${shine}${eyes(27)}${blush(32)}${mouthSmile(31.6, 2.2)}
      <clipPath id="${id}"><rect x="0" y="34" width="64" height="30" transform="rotate(-14 32 34)"/></clipPath>
      <g clip-path="url(#${id})">
        <ellipse cx="32" cy="34" rx="31" ry="9" transform="rotate(-14 32 34)" fill="none" stroke="${INK}" stroke-width="6.4"/>
        <ellipse cx="32" cy="34" rx="31" ry="9" transform="rotate(-14 32 34)" fill="none" stroke="#FFD166" stroke-width="3"/>
      </g>`
  },
  heart: {
    name: { en: 'Heart', zh: '爱心' }, color: '#FF8FA3', tint: true,
    draw: (c) => `
      ${body(c, HEART)}
      <path d="M12 24 Q14 17 21 17" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>
      ${eyes(34)}${blush(40)}${mouthSmile(39.4, 2.2)}`
  }
};

export const CHARACTER_IDS = Object.keys(CHARACTERS);

export function pinSVG(pin = {}, opts = {}) {
  const ch = CHARACTERS[pin.char] || CHARACTERS.cat;
  const color = ch.tint && pin.color ? pin.color : ch.color;
  const id = `pc${++uid}`;
  const outline = pin.char === 'heart' ? HEART : BODY;
  const sticker = opts.sticker === false ? '' :
    `<path d="${outline}" fill="#fff" stroke="#fff" stroke-width="8" stroke-linejoin="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -22 72 104" class="pin-svg" aria-hidden="true">${sticker}${ch.draw(color, id)}</svg>`;
}

export function pinName(char, lang) {
  const ch = CHARACTERS[char] || CHARACTERS.cat;
  return ch.name[lang] || ch.name.en;
}

// Standalone SVG document (used for the favicon / share card).
export function pinDataURL(pin) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(pinSVG(pin));
}
