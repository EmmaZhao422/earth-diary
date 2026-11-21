// Earth Diary — small DOM helpers: toast, modal, confirm.

import { t } from './i18n.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}
export function throttle(fn, ms) {
  let last = 0, timer;
  return (...args) => {
    const now = Date.now();
    clearTimeout(timer);
    if (now - last >= ms) { last = now; fn(...args); }
    else timer = setTimeout(() => { last = Date.now(); fn(...args); }, ms - (now - last));
  };
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function toast(message, { kind = 'info', ms = 3200 } = {}) {
  const root = $('#toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 350); }, ms);
}

const modalStack = [];

export function openModal({ title = '', html = '', className = '', onClose } = {}) {
  const root = $('#modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      ${title ? `<header class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn modal-x" aria-label="${esc(t('common.close'))}">×</button></header>` : ''}
      <div class="modal-body">${html}</div>
    </div>`;
  const close = (result) => {
    const i = modalStack.indexOf(api);
    if (i < 0) return;
    modalStack.splice(i, 1);
    wrap.classList.add('is-leaving');
    setTimeout(() => wrap.remove(), 180);
    onClose?.(result);
  };
  const api = { el: wrap, body: $('.modal-body', wrap), close };
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  $('.modal-x', wrap)?.addEventListener('click', () => close());
  root.appendChild(wrap);
  modalStack.push(api);
  requestAnimationFrame(() => wrap.classList.add('is-open'));
  return api;
}

export const topModal = () => modalStack[modalStack.length - 1] || null;

export function confirmDialog({ title, body, okLabel, danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({
      title,
      className: 'modal-confirm',
      html: `<p class="confirm-text">${esc(body || '')}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-a="no">${esc(t('common.cancel'))}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-a="yes">${esc(okLabel || t('common.ok'))}</button>
        </div>`,
      onClose: (r) => { if (!answered) { answered = true; resolve(r === true); } }
    });
    m.body.addEventListener('click', (e) => {
      const a = e.target?.dataset?.a;
      if (a) m.close(a === 'yes');
    });
    $('[data-a="yes"]', m.body)?.focus();
  });
}
