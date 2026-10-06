// the floating cards, hiding them, and dragging numbers inside equations

const PAGE = location.pathname.split('/').pop().replace('.html', '') || 'index';
const isSmall = () => window.matchMedia('(max-width: 820px)').matches;

function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    return null;
  }
}

// ---------- cards ----------

function setupCard(card) {
  const head = card.querySelector('.card-head');
  const fold = card.querySelector('.fold');
  const key = `card:${PAGE}:${card.dataset.card}`;
  const saved = store(key) || {};
  card.dataset.home = card.getAttribute('style') || '';

  const place = (x, y) => {
    const w = card.offsetWidth, h = Math.min(card.offsetHeight, 60);
    x = clamp(x, 8 - w * 0.6, window.innerWidth - w * 0.4);
    y = clamp(y, 54, window.innerHeight - h);
    card.style.left = x + 'px';
    card.style.top = y + 'px';
    card.style.right = 'auto';
    card.style.bottom = 'auto';
  };

  if (saved.folded) card.classList.add('folded');
  if (saved.x !== undefined && !isSmall()) place(saved.x, saved.y);

  const save = () => store(key, {
    folded: card.classList.contains('folded'),
    x: card.style.left ? parseFloat(card.style.left) : undefined,
    y: card.style.top ? parseFloat(card.style.top) : undefined
  });

  fold.addEventListener('click', e => {
    e.stopPropagation();
    card.classList.toggle('folded');
    save();
    cardsMoved();
  });

  // bring a card to the front when you touch it
  card.addEventListener('pointerdown', () => {
    document.querySelectorAll('.card').forEach(c => (c.style.zIndex = ''));
    card.style.zIndex = 2;
  });

  let start = null;
  head.addEventListener('pointerdown', e => {
    if (isSmall() || e.target.closest('button')) return;
    const r = card.getBoundingClientRect();
    start = { mx: e.clientX, my: e.clientY, x: r.left, y: r.top };
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener('pointermove', e => {
    if (!start) return;
    place(start.x + e.clientX - start.mx, start.y + e.clientY - start.my);
  });
  const end = () => {
    if (!start) return;
    start = null;
    save();
    cardsMoved();
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
  head.addEventListener('dblclick', () => {
    card.classList.toggle('folded');
    save();
  });
}

document.querySelectorAll('.card').forEach(setupCard);

function resetCards() {
  document.querySelectorAll('.card').forEach(card => {
    card.setAttribute('style', card.dataset.home);
    card.classList.remove('folded');
    store(`card:${PAGE}:${card.dataset.card}`, {});
  });
  cardsMoved();
}

// how much of the screen the cards in this panel cover on each side, so plots can fit around them
function cardInsets(panel) {
  const ins = { left: 0, right: 0, top: 64, bottom: 24 };
  if (isSmall()) return { left: 0, right: 0, top: 0, bottom: 0 };
  if (document.body.classList.contains('ui-hidden')) return ins;
  const W = window.innerWidth;
  (panel || document).querySelectorAll('.card').forEach(c => {
    const r = c.getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > window.innerHeight) return;
    if (r.left + r.width / 2 < W / 2) ins.left = Math.max(ins.left, r.right + 12);
    else ins.right = Math.max(ins.right, W - r.left + 12);
  });
  // never squeeze the plot into nothing
  if (W - ins.left - ins.right < W * 0.35) return { left: 0, right: 0, top: 64, bottom: 24 };
  return ins;
}

function cardsMoved() {
  window.dispatchEvent(new Event('cardsmoved'));
}

// ---------- hide everything to just play ----------

function toggleCards(force) {
  const hidden = document.body.classList.toggle('ui-hidden', force);
  setTimeout(cardsMoved, 260);
  const btn = document.getElementById('hideCards');
  if (btn) btn.innerHTML = hidden ? 'show cards <kbd>H</kbd>' : 'hide cards <kbd>H</kbd>';
}

document.addEventListener('keydown', e => {
  const typing = e.target.matches('input[type="text"], textarea, select');
  if (typing) return;
  if (e.key === 'h' || e.key === 'H') toggleCards();
});

const hideBtn = document.getElementById('hideCards');
if (hideBtn) hideBtn.addEventListener('click', () => toggleCards());
const resetBtn = document.getElementById('resetCards');
if (resetBtn) resetBtn.addEventListener('click', resetCards);

// ---------- scrubbing: scrubDrag a number in an equation to change it ----------
// equations mark numbers with \htmlData{scrub=sliderId}{...}. dragging one moves that slider

let scrubDrag = null;

document.addEventListener('pointerdown', e => {
  const target = e.target.closest('[data-scrub]');
  if (!target) return;
  const input = document.getElementById(target.dataset.scrub);
  if (!input) return;
  e.preventDefault();
  scrubDrag = {
    input,
    x: e.clientX,
    start: parseFloat(input.value),
    flip: target.dataset.flip === '1' ? -1 : 1
  };
  document.body.classList.add('scrubbing');
});

window.addEventListener('pointermove', e => {
  if (!scrubDrag) return;
  const { input } = scrubDrag;
  const min = parseFloat(input.min), max = parseFloat(input.max), step = parseFloat(input.step) || 0.01;
  const perPixel = ((max - min) / 320) * (e.shiftKey ? 0.15 : 1);
  let v = scrubDrag.start + scrubDrag.flip * (e.clientX - scrubDrag.x) * perPixel;
  v = clamp(Math.round(v / step) * step, min, max);
  if (v !== parseFloat(input.value)) {
    input.value = v;
    input.dispatchEvent(new Event('input'));
  }
});

window.addEventListener('pointerup', () => {
  if (!scrubDrag) return;
  scrubDrag = null;
  document.body.classList.remove('scrubbing');
});

// ---------- small message at the top ----------

let toastTimer = null;
function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}
