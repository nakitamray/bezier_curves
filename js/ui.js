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
  // a second button next to the fold arrow that makes the whole card smaller
  const shrink = document.createElement('button');
  shrink.className = 'shrink';
  shrink.setAttribute('aria-label', 'make smaller');
  shrink.title = 'smaller / bigger';
  shrink.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  fold.before(shrink);
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

  // scale toward whichever screen edge the card lives on, so it stays tucked in its corner
  const setOrigin = () => {
    const r = card.getBoundingClientRect();
    const right = r.left + r.width / 2 > window.innerWidth / 2;
    const bottom = card.style.bottom && card.style.bottom !== 'auto';
    card.style.transformOrigin = `${bottom ? 'bottom' : 'top'} ${right ? 'right' : 'left'}`;
  };

  if (saved.folded) card.classList.add('folded');
  if (saved.compact && !isSmall()) card.classList.add('compact');
  if (saved.x !== undefined && !isSmall()) place(saved.x, saved.y);
  if (saved.w && !isSmall()) card.style.width = saved.w;
  if (saved.h && !isSmall()) card.style.height = saved.h;
  setOrigin();

  const save = () => store(key, {
    folded: card.classList.contains('folded'),
    compact: card.classList.contains('compact'),
    x: card.style.left ? parseFloat(card.style.left) : undefined,
    y: card.style.top ? parseFloat(card.style.top) : undefined,
    w: card.style.width || undefined,
    h: card.style.height || undefined
  });

  shrink.addEventListener('click', e => {
    e.stopPropagation();
    setOrigin();
    card.classList.toggle('compact');
    save();
    setTimeout(cardsMoved, 50);
  });

  // remember the size when someone drags the corner
  let resizeTimer = null;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (card.style.width || card.style.height) {
        save();
        cardsMoved();
      }
    }, 300);
  }).observe(card);

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
    setOrigin();
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
    card.classList.remove('folded', 'compact');
    store(`card:${PAGE}:${card.dataset.card}`, {});
  });
  cardsMoved();
}

// how much of the screen the cards in this panel cover on each side, so plots can fit around them
function cardInsets(panel) {
  const ins = { left: 0, right: 0, top: 64, bottom: 58 };
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
  if (W - ins.left - ins.right < W * 0.35) return { left: 0, right: 0, top: 64, bottom: 58 };
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
  if (btn) btn.textContent = hidden ? 'show cards' : 'hide cards';
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

// ---------- help: the "?" in the corner ----------
// each page has a <div class="help" id="help"> with what you can do on it

(() => {
  const panel = document.getElementById('help');
  if (!panel) return;
  const btn = document.createElement('button');
  btn.className = 'help-btn';
  btn.textContent = '?';
  btn.title = 'how to use this page';
  (document.querySelector('.topbar') || document.body).appendChild(btn);

  const set = open => {
    panel.hidden = !open;
    btn.classList.toggle('open', open);
    btn.textContent = open ? '×' : '?';
  };
  btn.addEventListener('click', e => {
    e.stopPropagation();
    set(panel.hidden);
  });
  document.addEventListener('pointerdown', e => {
    if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) set(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === '?' && !e.target.matches('input[type="text"]')) set(panel.hidden);
  });

  set(false);
})();

// ---------- loader: shown once when someone first arrives ----------

(() => {

  let show = true;
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    const reload = nav && nav.type === 'reload';
    const arrived = sessionStorage.getItem('locus-here') === '1';
    show = reload || !arrived;
    sessionStorage.setItem('locus-here', '1');
  } catch (e) { /* no storage, just show it */ }
  if (!show) return;

  const el = document.createElement('div');
  el.className = 'loader';
  el.innerHTML = `
    <canvas></canvas>
    <div class="title">
      <h1>${'LOCUS'.split('').map((c, i) => `<span style="animation-delay: ${0.25 + i * 0.22}s, ${1.4 + i * 0.22}s">${c}</span>`).join('')}</h1>
      <p>DRAWING THE BOARD <span id="loaderCount">000</span></p>
      <div class="bar"><div id="loaderBar"></div></div>
    </div>
    <div class="credit">made by Nakita Ray · lettering: Chaos by Sigrid Liira</div>`;
  document.body.appendChild(el);

  const canvas = el.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const count = el.querySelector('#loaderCount');
  const bar = el.querySelector('#loaderBar');
  const start = performance.now();
  const MIN = 4200;
  let ready = false;
  let finished = false;

  // a few curves that draw themselves: a bezier with its construction, a lissajous, a sine wave
  function frame(now) {
    if (finished) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = w * dpr; canvas.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const t = (now - start) / 1000;
    const k = Math.min(1, (now - start) / MIN);

    // grid
    const step = 48;
    ctx.strokeStyle = 'rgba(239, 230, 207, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = (w / 2) % step; x < w; x += step) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
    for (let y = (h / 2) % step; y < h; y += step) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(239, 230, 207, 0.16)';
    ctx.beginPath();
    ctx.moveTo(0, h / 2 + 0.5); ctx.lineTo(w, h / 2 + 0.5);
    ctx.moveTo(w / 2 + 0.5, 0); ctx.lineTo(w / 2 + 0.5, h);
    ctx.stroke();

    // sine wave sliding along the axis
    ctx.strokeStyle = 'rgba(239, 230, 207, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= w * k; x += 4) {
      const y = h / 2 + Math.sin(x / 70 - t * 2) * 40;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // lissajous around the middle
    const R = Math.min(w, h) * 0.32;
    ctx.strokeStyle = 'rgba(233, 196, 106, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const total = Math.PI * 2 * k;
    for (let s = 0; s <= total; s += 0.01) {
      const x = w / 2 + R * 1.4 * Math.sin(3 * s + t * 0.3);
      const y = h / 2 + R * Math.sin(2 * s);
      s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // a cubic bezier being drawn by de casteljau
    const P = [
      { x: w * 0.18, y: h * 0.78 },
      { x: w * 0.32, y: h * (0.2 + 0.06 * Math.sin(t)) },
      { x: w * 0.68, y: h * (0.2 - 0.06 * Math.sin(t)) },
      { x: w * 0.82, y: h * 0.78 }
    ];
    const u = (Math.sin(t * 1.3 - Math.PI / 2) + 1) / 2;
    const lerp2 = (a, b, s) => ({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s });
    const pt = s => {
      let q = P;
      while (q.length > 1) q = q.slice(1).map((p, i) => lerp2(q[i], p, s));
      return q[0];
    };
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = 'rgba(239, 230, 207, 0.25)';
    ctx.beginPath();
    P.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.setLineDash([]);
    let q = P;
    ctx.strokeStyle = 'rgba(239, 230, 207, 0.35)';
    while (q.length > 2) {
      q = q.slice(1).map((p, i) => lerp2(q[i], p, u));
      ctx.beginPath();
      q.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.strokeStyle = '#e9c46a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let s = 0; s <= u + 1e-6; s += 0.01) {
      const p = pt(Math.min(s, u));
      s === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    P.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#1c1c1b';
      ctx.fill();
      ctx.strokeStyle = 'rgba(239, 230, 207, 0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    const b = pt(u);
    ctx.beginPath();
    ctx.arc(b.x, b.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#e9c46a';
    ctx.fill();

    count.textContent = String(Math.round(k * 100)).padStart(3, '0');
    bar.style.width = k * 100 + '%';
    if (k >= 1 && ready) finish();
    requestAnimationFrame(frame);
  }

  function finish() {
    if (finished) return;
    finished = true;
    el.classList.add('done');
    setTimeout(() => el.remove(), 700);
  }

  if (document.readyState === 'complete') ready = true;
  else window.addEventListener('load', () => (ready = true));
  el.addEventListener('click', () => { ready = true; finish(); }); // impatient people can click through
  requestAnimationFrame(frame);
})();
