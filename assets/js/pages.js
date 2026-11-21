// Earth Diary — script for the content pages: draws a few pins and mounts ad slots.
import { initLang } from './i18n.js';
import { pinSVG } from './pins.js';
import { initMonetization, mountSlots } from './ads.js';

initLang();
document.querySelectorAll('[data-pins]').forEach((el) => {
  el.innerHTML = el.dataset.pins.split(',').map((spec) => {
    const [char, color] = spec.trim().split(':');
    return pinSVG({ char, color: color || null });
  }).join('');
});
initMonetization();
mountSlots();
