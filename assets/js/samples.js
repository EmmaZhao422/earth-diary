// Earth Diary — sample memories so a first-time visitor sees a living map.
// The "photos" are postcards painted on a canvas, so no stock images are needed.

import { db, newId } from './db.js';
import { getLang } from './i18n.js';

const SAMPLES = [
  { lat: 35.65951, lng: 139.70056, char: 'cat', color: '#FFD9A0', date: '2025-03-28', mood: '😋', emoji: '🍜', colors: ['#FFB56B', '#FF6B6B'],
    place: { name: 'Shibuya', city: 'Tokyo', country: 'Japan', countryCode: 'JP', category: 'restaurant' },
    en: { title: 'Midnight ramen after the last train', tags: ['food', 'friends'],
      text: 'We missed the last train on purpose. Eight seats, one cook, steam on the windows. I ordered by pointing and it was the best bowl of my life.\n\nNote to self: always say yes to "one more place".' },
    zh: { title: '错过末班车之后的深夜拉面', tags: ['美食', '朋友'],
      text: '我们是故意错过末班车的。八个座位，一个师傅，玻璃上全是水汽。我靠手指点的菜，结果是这辈子吃过最好的一碗。\n\n提醒自己：别人说“再去一家”，永远答应。' } },
  { lat: 48.86173, lng: 2.28882, char: 'heart', color: '#FF8FA3', date: '2024-07-14', mood: '🥰', emoji: '🎆', colors: ['#5B6CFF', '#FF8FA3'],
    place: { name: 'Trocadéro', city: 'Paris', country: 'France', countryCode: 'FR', category: 'viewpoint' },
    en: { title: 'Fireworks over the tower', tags: ['summer', 'firsts'],
      text: 'Sat on the steps for three hours to keep our spot. When the first firework went up the whole hill went quiet, then everybody cheered at once.' },
    zh: { title: '铁塔上空的烟花', tags: ['夏天', '第一次'],
      text: '为了占位置在台阶上坐了三个小时。第一朵烟花升起来的时候整个山坡都安静了，然后所有人一起欢呼。' } },
  { lat: 40.77403, lng: -73.97087, char: 'bear', color: '#DDB08A', date: '2025-10-19', mood: '😌', emoji: '🍂', colors: ['#F6A04D', '#C8553D'],
    place: { name: 'Bethesda Terrace', city: 'New York', country: 'United States', countryCode: 'US', category: 'park' },
    en: { title: 'A slow Sunday in the park', tags: ['autumn', 'solo'],
      text: 'Coffee, a paperback, and a saxophone player under the arches. Did absolutely nothing for four hours and it was perfect.' },
    zh: { title: '公园里慢吞吞的星期天', tags: ['秋天', '独处'],
      text: '一杯咖啡，一本小说，拱廊下有人吹萨克斯。整整四个小时什么都没干，完美。' } },
  { lat: 63.53207, lng: -19.51137, char: 'penguin', date: '2023-02-11', mood: '🥶', emoji: '🌈', colors: ['#6CC5E8', '#3A4E8C'],
    place: { name: 'Skógafoss', city: 'Skógar', country: 'Iceland', countryCode: 'IS', category: 'waterfall' },
    en: { title: 'Soaked by a waterfall, saw two rainbows', tags: ['nature', 'roadtrip'],
      text: 'The spray froze on my eyelashes. Climbed all 500-something steps and counted them wrong twice. Worth every one.' },
    zh: { title: '被瀑布淋透，看到两道彩虹', tags: ['自然', '自驾'],
      text: '水雾在睫毛上结了冰。爬了五百多级台阶，数错了两次。每一级都值得。' } },
  { lat: 30.73353, lng: 104.14372, char: 'panda', date: '2022-08-06', mood: '🤩', emoji: '🎋', colors: ['#9BE28A', '#3E9B6B'],
    place: { name: 'Chengdu Research Base of Giant Panda Breeding', city: 'Chengdu', country: 'China', countryCode: 'CN', category: 'zoo' },
    en: { title: 'Pandas eat breakfast at 8', tags: ['family', 'animals'],
      text: 'Got there before the gates opened. One cub fell off the platform, looked around to check nobody saw, and climbed back up.' },
    zh: { title: '熊猫八点吃早饭', tags: ['家人', '动物'],
      text: '开门前就到了。一只幼崽从木台上摔下来，左右看看确认没人看见，又爬了回去。' } },
  { lat: -33.96282, lng: 18.40976, char: 'sprout', color: '#9EE6CF', date: '2024-12-30', mood: '🥹', emoji: '⛰️', colors: ['#FFC86B', '#7E57C2'],
    place: { name: 'Table Mountain', city: 'Cape Town', country: 'South Africa', countryCode: 'ZA', category: 'peak' },
    en: { title: 'Last sunset of the year', tags: ['hike', 'milestone'],
      text: 'Hiked up instead of taking the cable car. The city lights came on one neighborhood at a time while the sky was still orange.' },
    zh: { title: '这一年的最后一次日落', tags: ['徒步', '里程碑'],
      text: '没坐缆车，自己爬上去的。天还是橙色的时候，城市的灯一个街区一个街区地亮起来。' } },
  { lat: -33.85678, lng: 151.21530, char: 'planet', color: '#C9B6FF', date: '2023-11-02', mood: '😍', emoji: '⛵', colors: ['#49C5F1', '#2D6CDF'],
    place: { name: 'Sydney Opera House', city: 'Sydney', country: 'Australia', countryCode: 'AU', category: 'arts_centre' },
    en: { title: 'Ferry ride past the sails', tags: ['travel'],
      text: 'Took the cheapest ferry just for the view. Stood at the front the whole way with salt in my hair.' },
    zh: { title: '坐渡轮经过“白帆”', tags: ['旅行'],
      text: '买了最便宜的渡轮票，只为看风景。全程站在船头，头发里都是盐。' } }
];

function postcard(sample, title) {
  const W = 1200, H = 800;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, sample.colors[0]); grad.addColorStop(1, sample.colors[1]);
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.16; g.fillStyle = '#fff';
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    g.arc((i * 263 + 90) % W, (i * 197 + 120) % H, 60 + ((i * 53) % 110), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '300px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.fillText(sample.emoji, W / 2, H / 2 - 40);
  g.fillStyle = 'rgba(255,255,255,.94)';
  g.font = '600 46px Fredoka, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  g.fillText(title.length > 34 ? title.slice(0, 33) + '…' : title, W / 2, H - 110);
  g.font = '500 30px Nunito, "PingFang SC", system-ui, sans-serif';
  g.fillText(`${sample.place.city} · ${sample.place.country}`, W / 2, H - 56);
  return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.86));
}

function shrink(blob) {
  return createImageBitmap(blob).then((bmp) => {
    const c = document.createElement('canvas');
    c.width = 600; c.height = 400;
    c.getContext('2d').drawImage(bmp, 0, 0, 600, 400);
    return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.8));
  }).catch(() => blob);
}

export async function createSamples() {
  const lang = getLang() === 'zh' ? 'zh' : 'en';
  const out = [];
  const now = Date.now();
  for (const s of SAMPLES) {
    const id = newId(), mediaId = newId();
    const copy = s[lang];
    const blob = await postcard(s, copy.title);
    const media = [];
    if (blob) {
      await db.putMedia({ id: mediaId, memoryId: id, name: 'postcard.jpg', mime: 'image/jpeg', blob });
      await db.putThumb({ id: mediaId, blob: await shrink(blob) });
      media.push({ id: mediaId, kind: 'image', name: 'postcard.jpg', size: blob.size, mime: 'image/jpeg', w: 1200, h: 800, duration: 0, hasThumb: true });
    }
    const memory = {
      id, lat: s.lat, lng: s.lng, title: copy.title, date: s.date, text: copy.text, mood: s.mood, tags: copy.tags,
      pin: { char: s.char, color: s.color || null }, place: { ...s.place }, media,
      sample: true, createdAt: now, updatedAt: now
    };
    await db.putMemory(memory);
    out.push(memory);
  }
  return out;
}
