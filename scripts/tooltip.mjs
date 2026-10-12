// Rich tooltip shared by the sheets: one floating card on the body, filled from data-tooltip-* attributes.
// Opens on pointer hover (short delay), keyboard focus, or a long press on touch; closes on leave, blur or Escape.

const HOVER_DELAY_MS = 250;
const LONG_PRESS_MS = 500;
const HIDE_MS = 120;

let card = null;
let showTimer = null;
let pressTimer = null;
let hideTimer = null;
let activeTarget = null;

function ensureCard() {
  if (card) return card;
  card = document.createElement('div');
  card.className = 'sdrn-tooltip';
  card.setAttribute('role', 'tooltip');
  card.hidden = true;
  document.body.appendChild(card);
  return card;
}

function fill(target) {
  const el = ensureCard();
  el.replaceChildren();
  const kind = target.dataset.tooltipKind || '';
  if (kind) {
    const tag = document.createElement('span');
    tag.className = 'sdrn-tooltip-kind';
    tag.textContent = kind;
    el.appendChild(tag);
  }
  const title = document.createElement('div');
  title.className = 'sdrn-tooltip-title';
  title.textContent = target.dataset.tooltipTitle || '';
  el.appendChild(title);
  const body = document.createElement('div');
  body.className = 'sdrn-tooltip-body';
  body.textContent = target.dataset.tooltipBody || '';
  el.appendChild(body);
  el.id = el.id || 'sdrn-tooltip-' + Math.random().toString(36).slice(2, 8);
  target.setAttribute('aria-describedby', el.id);
}

// Places the card below the target and flips it above when it would leave the viewport; keeps it inside the window edges.
function place(target) {
  const el = ensureCard();
  el.hidden = false;
  const r = target.getBoundingClientRect();
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
  let top = r.bottom + 6;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function show(target) {
  if (!target?.dataset?.tooltipTitle) return;
  clearTimeout(hideTimer);
  activeTarget = target;
  fill(target);
  place(target);
}

function hide() {
  clearTimeout(showTimer);
  clearTimeout(pressTimer);
  if (activeTarget) activeTarget.removeAttribute('aria-describedby');
  activeTarget = null;
  if (card) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      card.hidden = true;
    }, HIDE_MS);
  }
}

// Handlers are bound once on the sheet root and resolve their target with closest(), so re-renders need no rebinding.
const handlers = new WeakMap();

export function attachTooltips(rootEl) {
  if (!rootEl || handlers.has(rootEl)) return;
  const onEnter = (e) => {
    const target = e.target.closest?.('[data-tooltip-title]');
    if (!target || e.pointerType === 'touch') return;
    clearTimeout(showTimer);
    showTimer = setTimeout(() => show(target), HOVER_DELAY_MS);
  };
  const onLeave = (e) => {
    const target = e.target.closest?.('[data-tooltip-title]');
    if (target) hide();
  };
  const onFocus = (e) => {
    const target = e.target.closest?.('[data-tooltip-title]');
    if (target) show(target);
  };
  const onBlur = (e) => {
    if (e.target.closest?.('[data-tooltip-title]')) hide();
  };
  const onPointerDown = (e) => {
    if (e.pointerType !== 'touch') return;
    const target = e.target.closest?.('[data-tooltip-title]');
    if (!target) return;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => show(target), LONG_PRESS_MS);
  };
  const onPointerUp = () => clearTimeout(pressTimer);
  const onKey = (e) => {
    if (e.key === 'Escape') hide();
  };
  rootEl.addEventListener('pointerover', onEnter);
  rootEl.addEventListener('pointerout', onLeave);
  rootEl.addEventListener('focusin', onFocus);
  rootEl.addEventListener('focusout', onBlur);
  rootEl.addEventListener('pointerdown', onPointerDown);
  rootEl.addEventListener('pointerup', onPointerUp);
  rootEl.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('keydown', onKey);
  handlers.set(rootEl, { onEnter, onLeave, onFocus, onBlur, onPointerDown, onPointerUp, onKey });
}

export function detachTooltips(rootEl) {
  const h = handlers.get(rootEl);
  if (!h) return;
  rootEl.removeEventListener('pointerover', h.onEnter);
  rootEl.removeEventListener('pointerout', h.onLeave);
  rootEl.removeEventListener('focusin', h.onFocus);
  rootEl.removeEventListener('focusout', h.onBlur);
  rootEl.removeEventListener('pointerdown', h.onPointerDown);
  rootEl.removeEventListener('pointerup', h.onPointerUp);
  rootEl.removeEventListener('pointercancel', h.onPointerUp);
  document.removeEventListener('keydown', h.onKey);
  handlers.delete(rootEl);
  hide();
}
