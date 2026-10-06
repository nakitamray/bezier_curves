// differential equations page: slope fields, linear systems, nonlinear systems

// ---------- shared pieces ----------

function rk4(F, x, y, dt) {
  const [a1, b1] = F(x, y);
  const [a2, b2] = F(x + (dt / 2) * a1, y + (dt / 2) * b1);
  const [a3, b3] = F(x + (dt / 2) * a2, y + (dt / 2) * b2);
  const [a4, b4] = F(x + dt * a3, y + dt * b3);
  return {
    x: x + (dt / 6) * (a1 + 2 * a2 + 2 * a3 + a4),
    y: y + (dt / 6) * (b1 + 2 * b2 + 2 * b3 + b4)
  };
}

// integrate forwards and backwards from a point until it leaves the box (or settles down)
function trajectory(F, start, box, dt = 0.01, maxSteps = 4000) {
  const run = sign => {
    const pts = [];
    let p = start;
    const pad = Math.max(box.xmax - box.xmin, box.ymax - box.ymin) * 0.2;
    for (let i = 0; i < maxSteps; i++) {
      const next = rk4(F, p.x, p.y, sign * dt);
      if (!isFinite(next.x) || !isFinite(next.y)) break;
      if (next.x < box.xmin - pad || next.x > box.xmax + pad || next.y < box.ymin - pad || next.y > box.ymax + pad) break;
      pts.push(next);
      if (Math.hypot(next.x - p.x, next.y - p.y) < 1e-7) break;
      p = next;
    }
    return pts;
  };
  return run(-1).reverse().concat([start], run(1));
}

function drawField(plot, F, opts = {}) {
  const v = plot.visible();
  const spacing = opts.spacing || 30;
  const ctx = plot.ctx;
  const cols = Math.floor(plot.width / spacing);
  const rows = Math.floor(plot.height / spacing);
  const ox = (plot.width - (cols - 1) * spacing) / 2;
  const oy = (plot.height - (rows - 1) * spacing) / 2;
  const L = spacing * 0.36;

  // first pass to find the biggest speed so the faint/bright scale makes sense
  const samples = [];
  let maxMag = 0;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const sx = ox + i * spacing, sy = oy + j * spacing;
      const w = plot.toWorld(sx, sy);
      const [dx, dy] = F(w.x, w.y);
      if (!isFinite(dx) || !isFinite(dy)) continue;
      const mag = Math.hypot(dx, dy);
      maxMag = Math.max(maxMag, mag);
      samples.push({ sx, sy, dx, dy, mag });
    }
  }

  for (const s of samples) {
    if (s.mag < 1e-12) continue;
    // screen direction (y flips)
    const f = plot.frame();
    let ux = s.dx * f.sx, uy = -s.dy * f.sy;
    const l = Math.hypot(ux, uy);
    ux /= l; uy /= l;
    const alpha = opts.slope ? 0.45 : 0.18 + 0.5 * Math.sqrt(s.mag / (maxMag || 1));
    const color = `rgba(239, 230, 207, ${alpha})`;
    if (opts.slope) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(s.sx - ux * L, s.sy - uy * L);
      ctx.lineTo(s.sx + ux * L, s.sy + uy * L);
      ctx.stroke();
    } else {
      drawArrow(ctx, { x: s.sx - ux * L, y: s.sy - uy * L }, { x: s.sx + ux * L, y: s.sy + uy * L }, color, 1.1, 5);
    }
  }
  return v;
}

// zero level set of g on the visible part of the plot
function zeroSet(plot, g, res = 80) {
  const v = plot.visible();
  const nx = res, ny = Math.round(res * (v.ymax - v.ymin) / (v.xmax - v.xmin));
  const dx = (v.xmax - v.xmin) / nx, dy = (v.ymax - v.ymin) / ny;
  const val = [];
  for (let i = 0; i <= nx; i++) {
    val.push([]);
    for (let j = 0; j <= ny; j++) val[i].push(g(v.xmin + i * dx, v.ymin + j * dy));
  }
  const segs = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const z = [val[i][j], val[i + 1][j], val[i + 1][j + 1], val[i][j + 1]];
      if (z.some(q => !isFinite(q))) continue;
      const c = [[0, 0], [1, 0], [1, 1], [0, 1]];
      const pts = [];
      for (let e = 0; e < 4; e++) {
        const a = z[e], b = z[(e + 1) % 4];
        if ((a < 0) !== (b < 0)) {
          // skip sign flips that are really blowups, like tan or 1/x
          if (Math.abs(a - b) > 50 * (dx + dy)) continue;
          const t = a / (a - b);
          const ca = c[e], cb = c[(e + 1) % 4];
          pts.push({
            x: v.xmin + (i + ca[0] + (cb[0] - ca[0]) * t) * dx,
            y: v.ymin + (j + ca[1] + (cb[1] - ca[1]) * t) * dy
          });
        }
      }
      if (pts.length >= 2) segs.push([pts[0], pts[1]]);
      if (pts.length === 4) segs.push([pts[2], pts[3]]);
    }
  }
  return segs;
}

// little particles that drift along the field and leave short trails
class Particles {
  constructor(count = 300) {
    this.count = count;
    this.list = [];
  }

  spawn(v, p = {}) {
    p.x = v.xmin + Math.random() * (v.xmax - v.xmin);
    p.y = v.ymin + Math.random() * (v.ymax - v.ymin);
    p.trail = [];
    p.life = 60 + Math.random() * 120;
    p.age = Math.random() * 40;
    return p;
  }

  step(plot, F, normalized) {
    const v = plot.visible();
    while (this.list.length < this.count) this.list.push(this.spawn(v));
    const maxStep = (v.xmax - v.xmin) / 300;
    for (const p of this.list) {
      let [dx, dy] = F(p.x, p.y);
      const mag = Math.hypot(dx, dy);
      if (!isFinite(mag)) { this.spawn(v, p); continue; }
      let dt = 0.015;
      if (normalized || mag * dt > maxStep) dt = maxStep / (mag || 1);
      const next = rk4(F, p.x, p.y, dt);
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 12) p.trail.shift();
      p.x = next.x; p.y = next.y;
      p.age++;
      const out = p.x < v.xmin || p.x > v.xmax || p.y < v.ymin || p.y > v.ymax;
      if (out || p.age > p.life || !isFinite(p.x) || mag * dt < maxStep * 0.02 && p.age > 30) this.spawn(v, p);
    }
  }

  draw(plot) {
    const ctx = plot.ctx;
    ctx.lineWidth = 1.4;
    for (const p of this.list) {
      if (p.trail.length < 2) continue;
      const fade = Math.min(1, p.age / 15, (p.life - p.age) / 15);
      ctx.strokeStyle = `rgba(245, 211, 107, ${0.55 * Math.max(0, fade)})`;
      ctx.beginPath();
      const s0 = plot.toScreen(p.trail[0].x, p.trail[0].y);
      ctx.moveTo(s0.x, s0.y);
      for (let i = 1; i < p.trail.length; i++) {
        const s = plot.toScreen(p.trail[i].x, p.trail[i].y);
        ctx.lineTo(s.x, s.y);
      }
      const s = plot.toScreen(p.x, p.y);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }
  }

  reset() {
    this.list = [];
  }
}

// eigenvalues of a 2x2 matrix + what kind of equilibrium it gives
function analyze2x2(a, b, c, d) {
  const tr = a + d;
  const det = a * d - b * c;
  const disc = tr * tr - 4 * det;
  const eps = 1e-6;
  const out = { tr, det, disc };

  if (disc > eps) {
    const s = Math.sqrt(disc);
    out.real = true;
    out.l1 = (tr + s) / 2;
    out.l2 = (tr - s) / 2;
    out.v1 = eigenvector(a, b, c, d, out.l1);
    out.v2 = eigenvector(a, b, c, d, out.l2);
  } else if (disc < -eps) {
    out.real = false;
    out.alpha = tr / 2;
    out.beta = Math.sqrt(-disc) / 2;
  } else {
    out.real = true;
    out.repeated = true;
    out.l1 = out.l2 = tr / 2;
    out.v1 = eigenvector(a, b, c, d, out.l1);
  }

  if (Math.abs(det) < eps) out.type = 'degenerate (a whole line of equilibria)';
  else if (det < 0) out.type = 'saddle';
  else if (!out.real) {
    if (Math.abs(out.alpha) < 1e-3) out.type = 'center';
    else out.type = out.alpha < 0 ? 'spiral sink' : 'spiral source';
  } else if (out.repeated) {
    out.type = (tr < 0 ? 'stable' : 'unstable') + (Math.abs(b) < eps && Math.abs(c) < eps ? ' star' : ' degenerate node');
  } else {
    out.type = tr < 0 ? 'nodal sink' : 'nodal source';
  }
  out.stable = det > eps && tr < -1e-3;
  return out;
}

function eigenvector(a, b, c, d, l) {
  let v;
  if (Math.abs(b) > 1e-9) v = { x: b, y: l - a };
  else if (Math.abs(c) > 1e-9) v = { x: l - d, y: c };
  else v = Math.abs(l - a) < 1e-9 ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const n = Math.hypot(v.x, v.y);
  return { x: v.x / n, y: v.y / n };
}

const typeNotes = {
  'saddle': 'One eigenvalue is positive and one negative. Solutions come in along one eigenvector and leave along the other.',
  'spiral sink': 'Complex eigenvalues with negative real part. Solutions spiral in toward the origin.',
  'spiral source': 'Complex eigenvalues with positive real part. Solutions spiral out.',
  'center': 'Purely imaginary eigenvalues. Solutions go round in closed loops forever.',
  'nodal sink': 'Two negative eigenvalues. Everything flows into the origin, coming in along the slower eigenvector.',
  'nodal source': 'Two positive eigenvalues. Everything flows away from the origin.'
};


// ===================================================================
// the log: every equation you try gets kept
// ===================================================================

const LOG_COLORS = ['#e9c46a', '#8fb7d9', '#d98a7a', '#9fc79a', '#c3a3d9', '#d9b38c', '#e6e6e6'];
const EYE_ON = '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="7" cy="7" r="3" fill="currentColor"/></svg>';
const EYE_OFF = '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

class EquationLog {
  // texOf(data) -> latex. onPick(entry) restores it. onChange() redraws overlays
  constructor(name, listId, clearId, opts) {
    this.key = 'log:' + name;
    this.list = document.getElementById(listId);
    this.opts = opts;
    this.entries = store(this.key) || [];
    this.current = null;
    this.timer = null;
    this.colorIndex = this.entries.length;
    this.counter = this.entries.reduce((m, e) => Math.max(m, e.n || 0), 0);
    this.preview = null;

    // show all / hide all
    const clearBtn = document.getElementById(clearId);
    const allBtn = document.createElement('button');
    allBtn.className = 'btn';
    allBtn.textContent = 'show all';
    clearBtn.before(allBtn);
    allBtn.addEventListener('click', () => {
      const others = this.entries.filter(e => e.id !== this.current);
      const on = others.some(e => !e.show);
      others.forEach(e => (e.show = on));
      allBtn.textContent = on ? 'hide all' : 'show all';
      this.save();
      this.render();
      opts.onChange();
    });

    // hovering an entry previews it on the board
    this.list.addEventListener('mouseover', e => {
      const li = e.target.closest('li[data-id]');
      const id = li && li.dataset.id !== this.current ? li.dataset.id : null;
      if (id !== this.preview) {
        this.preview = id;
        opts.onChange();
      }
    });
    this.list.addEventListener('mouseleave', () => {
      if (this.preview) {
        this.preview = null;
        opts.onChange();
      }
    });

    clearBtn.addEventListener('click', () => {
      this.entries = this.entries.filter(e => e.id === this.current);
      this.save();
      this.render();
      opts.onChange();
    });

    this.list.addEventListener('click', e => {
      const li = e.target.closest('li[data-id]');
      if (!li) return;
      const entry = this.entries.find(x => x.id === li.dataset.id);
      const act = e.target.closest('button') && e.target.closest('button').dataset.act;
      if (act === 'show') {
        entry.show = !entry.show;
        toast(entry.show ? `#${entry.n} is drawn underneath` : `#${entry.n} hidden`);
      } else if (act === 'del') {
        this.entries = this.entries.filter(x => x !== entry);
        if (this.current === entry.id) this.current = null;
      } else {
        this.current = entry.id;
        opts.onPick(entry);
      }
      this.save();
      this.render();
      opts.onChange();
    });
  }

  get currentEntry() {
    return this.entries.find(e => e.id === this.current) || null;
  }

  // logs a new equation, or jumps to it if it's already there
  add(data, force = false) {
    const key = this.opts.keyOf(data);
    let entry = force ? null : this.entries.find(e => this.opts.keyOf(e.data) === key);
    if (!entry) {
      entry = {
        n: ++this.counter,
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        data: JSON.parse(JSON.stringify(data)),
        color: LOG_COLORS[this.colorIndex++ % LOG_COLORS.length],
        show: false
      };
      this.entries.unshift(entry);
      // keep it from growing forever
      while (this.entries.length > 40) this.entries.pop();
    } else {
      entry.data = JSON.parse(JSON.stringify(data));
    }
    // the one you just left stays drawn underneath so you can compare, the rest step back
    const old = this.currentEntry;
    this.entries.forEach(e => (e.show = false));
    if (old && old !== entry) old.show = true;
    this.current = entry.id;
    this.save();
    this.render();
    return entry;
  }

  // parameters changed: keep the current entry up to date (a little later, not on every frame)
  update(data) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const entry = this.currentEntry;
      if (!entry) return this.add(data);
      entry.data = JSON.parse(JSON.stringify(data));
      this.save();
      this.render();
    }, 350);
  }

  // log it once things stop changing for a moment
  settle(getData, ms = 900) {
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => this.add(getData()), ms);
  }

  overlays() {
    return this.entries.filter(e => e.id !== this.current && (e.show || e.id === this.preview));
  }

  // dashed curves for an older entry plus its number, so you can tell which is which
  drawOverlay(plot, entry, makeF) {
    const curves = this.curvesFor(entry, plot, makeF);
    const strong = entry.id === this.preview;
    curves.forEach(c => plot.path(c, fade(entry.color, strong ? 1 : 0.8), strong ? 3 : 2, [8, 4]));
    // number tag in the middle of the longest visible curve
    const v = plot.visible();
    let best = null;
    for (const c of curves) {
      const inside = c.filter(p => p.x > v.xmin && p.x < v.xmax && p.y > v.ymin && p.y < v.ymax);
      if (!best || inside.length > best.length) best = inside;
    }
    if (best && best.length) {
      const p = best[Math.floor(best.length * 0.6)];
      plot.dot(p.x, p.y, 10, fade(entry.color, 0.9));
      plot.text(String(entry.n), p.x, p.y, '#1c1c1b', 'center', 'middle', '700 11px "Space Mono", monospace');
    }
  }

  // solution curves for an older entry, worked out once and reused until something changes
  curvesFor(entry, plot, makeF) {
    this.cache = this.cache || {};
    const key = JSON.stringify(entry.data) + JSON.stringify(plot.bounds);
    const hit = this.cache[entry.id];
    if (hit && hit.key === key) return hit.curves;
    let curves = [];
    try {
      const G = makeF(entry.data);
      let starts = entry.data.starts || [];
      if (!starts.length) {
        // nothing was clicked for this one, so start a few curves around the view
        const v = plot.visible();
        const cx = (v.xmin + v.xmax) / 2, cy = (v.ymin + v.ymax) / 2;
        const r = Math.min(v.xmax - v.xmin, v.ymax - v.ymin) / 4;
        starts = [0, 1, 2, 3, 4, 5].map(k => ({ x: cx + r * Math.cos(k * 1.05), y: cy + r * Math.sin(k * 1.05) }));
      }
      curves = starts.map(p => trajectory(G, p, plot.visible(), 0.01, 3000));
    } catch (e) { /* an entry that doesn't parse any more, just skip it */ }
    this.cache[entry.id] = { key, curves };
    return curves;
  }

  save() {
    store(this.key, this.entries);
  }

  render() {
    if (!this.entries.length) {
      this.list.innerHTML = '<li class="log-empty" style="display:block;cursor:default">nothing yet</li>';
      return;
    }
    this.list.innerHTML = this.entries.map(e => `
      <li data-id="${e.id}" class="${e.id === this.current ? 'current' : ''}${e.show || e.id === this.current ? '' : ' hidden-overlay'}">
        <span class="swatch" style="background:${e.color}"></span>
        <span class="num">${e.n || ''}</span>
        <span class="tex"></span>
        ${e.id === this.current
          ? '<span class="now">now</span>'
          : `<button data-act="show" title="draw it underneath">${e.show ? EYE_ON : EYE_OFF}</button>`}
        <button data-act="del" title="remove">×</button>
      </li>`).join('');
    this.list.querySelectorAll('li[data-id]').forEach(li => {
      const e = this.entries.find(x => x.id === li.dataset.id);
      try {
        tex(li.querySelector('.tex'), this.opts.texOf(e.data));
      } catch (err) {
        li.querySelector('.tex').textContent = '?';
      }
    });
  }
}

// translucent version of a hex color
function fade(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function chipRow(id, presets, onPick) {
  const box = document.getElementById(id);
  presets.forEach((p, i) => {
    if (p.hidden) return;
    const b = document.createElement('button');
    b.textContent = p.name;
    b.dataset.i = i;
    box.appendChild(b);
  });
  const mark = i => box.querySelectorAll('button').forEach(b => b.classList.toggle('active', +b.dataset.i === i));
  box.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    mark(+b.dataset.i);
    onPick(+b.dataset.i);
  });
  return mark;
}

// ===================================================================
// slope fields
// ===================================================================

const slopeMode = (() => {
  const el = id => document.getElementById(id);
  const presets = [
    { name: 'linear', expr: 'a*x - b*y', a: 1, b: 1 },
    { name: 'growth', expr: 'a*y', a: 0.6, b: 0 },
    { name: 'logistic', expr: 'a*y*(1 - y/b)', a: 1, b: 2.5 },
    { name: 'forced', expr: 'sin(a*x) - b*y', a: 1.5, b: 0.5 },
    { name: 'blow-up', expr: 'a*y^2 - b*x', a: 0.5, b: 0.5 },
    { name: 'ripples', expr: 'cos(a*x*y) - b*x', a: 0.8, b: 0.2 }
  ];

  let plot, sa, sb, sh, log, mark;
  let compiled = null;
  let starts = [{ x: -3, y: 1 }];
  let lastChanged = null;
  let curves = [];
  const particles = new Particles(120);

  const f = (x, y) => compiled.fn({ x, y, a: sa.value, b: sb.value });
  const F = (x, y) => [1, f(x, y)];
  const data = () => ({ expr: el('slopeExpr').value, a: sa.value, b: sb.value, starts });

  function setExpr(src) {
    const c = compileOr(src);
    if (!c) return false;
    compiled = c;
    return true;
  }

  function compileOr(src) {
    try {
      const c = compileExpr(src, ['x', 'y', 'a', 'b']);
      if (typeof c.fn({ x: 0.2, y: 0.3, a: 1, b: 1 }) !== 'number') throw new Error('not a number');
      el('slopeExpr').classList.remove('bad');
      el('slopeError').textContent = '';
      return c;
    } catch (e) {
      el('slopeExpr').classList.add('bad');
      el('slopeError').textContent = e.message;
      return null;
    }
  }

  function euler() {
    const s = starts[starts.length - 1];
    const h = sh.value;
    const v = plot.visible();
    const target = Math.min(s.x + 3, v.xmax);
    const pts = [{ x: s.x, y: s.y }];
    let x = s.x, y = s.y;
    while (x < target - 1e-9 && pts.length < 400) {
      const step = Math.min(h, target - x);
      y += step * f(x, y);
      x += step;
      if (!isFinite(y)) break;
      pts.push({ x, y });
    }
    return { pts, target };
  }

  function solveCurves() {
    const v = plot.visible();
    curves = starts.map(s => trajectory(F, s, v, 0.01, 3000));
  }

  function draw() {
    plot.begin();
    plot.grid();

    if (el('slopeNull').checked) {
      for (const [a, b] of zeroSet(plot, f)) plot.line(a.x, a.y, b.x, b.y, COLORS.yellow, 1.5, [4, 3]);
    }
    if (el('slopeField').checked) drawField(plot, F, { slope: true, spacing: 28 });
    if (el('slopeFlow').checked) particles.draw(plot);

    for (const entry of log.overlays()) {
      log.drawOverlay(plot, entry, d => {
        const c = compileExpr(d.expr, ['x', 'y', 'a', 'b']);
        return (x, y) => [1, c.fn({ x, y, a: d.a, b: d.b })];
      });
    }

    curves.forEach((c, i) => plot.path(c, i === curves.length - 1 ? COLORS.white : 'rgba(250, 250, 250, 0.5)', 2.5));

    if (el('slopeEuler').checked) {
      const { pts } = euler();
      plot.path(pts, COLORS.yellow, 2);
      pts.forEach(p => plot.dot(p.x, p.y, 3, COLORS.yellow));
    }
    starts.forEach((s, i) => plot.dot(s.x, s.y, i === starts.length - 1 ? 6 : 4, COLORS.bg, COLORS.white, 2));
  }

  function equations() {
    const a = sa.value, b = sb.value;
    const s = starts[starts.length - 1];
    tex('slopeFormula',
      `\\frac{dy}{dx} = ${toTex(compiled.tree, { a, b }, lastChanged, { a: 'slopeA', b: 'slopeB' })}`, true);

    const h = sh.value;
    const hh = lastChanged === 'h';
    tex('eulerFormula',
      `y_{n+1} = y_n + ${hl('h', hh)}\\,f(x_n, y_n), \\quad h = ${hl(scrub('slopeH', fmt(h)), hh)}, \\quad ${hl(`y(${fmt(s.x)}) = ${fmt(s.y)}`, lastChanged === 'start')}`, true);

    const { pts, target } = euler();
    let rows = '<tr><th>n</th><th style="text-align:right">x<sub>n</sub></th><th style="text-align:right">y<sub>n</sub></th><th style="text-align:right">slope</th><th style="text-align:right">y<sub>n+1</sub></th></tr>';
    for (let n = 0; n < Math.min(5, pts.length - 1); n++) {
      const p = pts[n];
      rows += `<tr class="row"><td>${n}</td><td class="n">${fmt(p.x)}</td><td class="n">${fmt(p.y, 3)}</td><td class="n">${fmt(f(p.x, p.y), 3)}</td><td class="n">${fmt(pts[n + 1].y, 3)}</td></tr>`;
    }
    el('eulerTable').innerHTML = rows;

    let x = s.x, y = s.y;
    const steps = 600;
    const dx = (target - s.x) / steps;
    for (let i = 0; i < steps && isFinite(y); i++) {
      y = rk4(F, x, y, dx).y;
      x += dx;
    }
    const ye = pts[pts.length - 1].y;
    el('eulerStats').innerHTML =
      `<div><span>steps</span><b>${pts.length - 1}</b></div>` +
      `<div><span>Euler at ${fmt(target, 1)}</span><b>${fmt(ye, 3)}</b></div>` +
      `<div><span>true value</span><b>${fmt(y, 3)}</b></div>` +
      `<div><span>error</span><b>${fmt(Math.abs(ye - y), 3)}</b></div>`;

    el('slopeReadout').innerHTML = `y′ = ${el('slopeExpr').value} &nbsp; start (<b>${fmt(s.x)}</b>, <b>${fmt(s.y)}</b>)`;
  }

  function update() {
    solveCurves();
    particles.reset();
    equations();
    draw();
  }

  function restore(entry) {
    const d = entry.data;
    el('slopeExpr').value = d.expr;
    sa.value = d.a;
    sb.value = d.b;
    starts = d.starts.length ? d.starts.map(p => ({ ...p })) : [{ x: -3, y: 1 }];
    setExpr(d.expr);
    mark(presets.findIndex(p => p.expr === d.expr));
    lastChanged = null;
    update();
  }

  function commitTyped() {
    const src = el('slopeExpr').value;
    const cur = log.currentEntry;
    if (compiled && (!cur || cur.data.expr !== src)) {
      log.add(data());
      toast('added to the log');
      draw();
    }
  }

  function init() {
    plot = new Plot2D(el('slopeCanvas'), { xmin: -9, xmax: 9, ymin: -6, ymax: 6 }, {
      onResize: () => { solveCurves(); draw(); },
      panZoom: true,
      onView: () => { solveCurves(); draw(); },
      onViewEnd: () => update(),
      probe: w => compiled ? `slope ${fmt(f(w.x, w.y))}` : ''
    });
    const changed = k => () => { lastChanged = k; update(); log.update(data()); };
    sa = slider('slopeA', changed('a'));
    sb = slider('slopeB', changed('b'));
    sh = slider('slopeH', () => { lastChanged = 'h'; equations(); draw(); });

    log = new EquationLog('slope', 'slopeLog', 'slopeLogClear', {
      keyOf: d => d.expr,
      texOf: d => {
        const c = compileExpr(d.expr, ['x', 'y', 'a', 'b']);
        return `y' = ${toTex(c.tree, { a: d.a, b: d.b })}`;
      },
      onPick: restore,
      onChange: draw
    });

    mark = chipRow('slopeChips', presets, i => {
      const p = presets[i];
      el('slopeExpr').value = p.expr;
      sa.value = p.a;
      sb.value = p.b;
      setExpr(p.expr);
      lastChanged = null;
      update();
      log.add(data());
    });

    let typing = null;
    el('slopeExpr').addEventListener('input', e => {
      mark(-1);
      clearTimeout(typing);
      if (setExpr(e.target.value)) {
        update();
        typing = setTimeout(commitTyped, 1200); // logs it once you stop typing
      }
    });
    el('slopeExpr').addEventListener('keydown', e => { if (e.key === 'Enter') commitTyped(); });
    el('slopeExpr').addEventListener('blur', commitTyped);

    ['slopeField', 'slopeEuler', 'slopeNull', 'slopeFlow'].forEach(id => el(id).addEventListener('change', draw));
    el('slopeClear').addEventListener('click', () => { starts = [starts[starts.length - 1]]; update(); log.update(data()); });

    el('slopeCanvas').addEventListener('click', e => {
      if (plot.wasDrag()) return;
      const p = pointerPos(el('slopeCanvas'), e);
      starts.push(plot.toWorld(p.x, p.y));
      if (starts.length > 8) starts.shift();
      lastChanged = 'start';
      update();
      log.update(data());
    });

    const cur = log.entries[0];
    if (cur) {
      log.current = cur.id;
      restore(cur);
    } else {
      mark(0);
      el('slopeExpr').value = presets[0].expr;
      sa.value = presets[0].a;
      sb.value = presets[0].b;
      setExpr(presets[0].expr);
      update();
      log.add(data());
    }
    log.render();
  }

  function frame() {
    if (!plot || !el('slopeFlow').checked) return;
    particles.step(plot, F, true);
    draw();
  }

  return { init, frame };
})();

// ===================================================================
// linear systems x' = Ax
// ===================================================================

const linearMode = (() => {
  const el = id => document.getElementById(id);
  const presets = [
    { name: 'saddle', m: [1, 1, 2, -1] },
    { name: 'spiral sink', m: [-0.5, -2, 2, -0.5] },
    { name: 'spiral source', m: [0.3, -1.5, 1.5, 0.3] },
    { name: 'center', m: [0, 1, -2, 0] },
    { name: 'nodal sink', m: [-2, 1, 0.5, -1.5] },
    { name: 'nodal source', m: [1.5, 0.5, 0.25, 1] },
    { name: 'star', m: [-1, 0, 0, -1] },
    { name: 'degenerate', m: [-1, 1, 0, -1] }
  ];

  let plot, trace, log, mark;
  const s = {};
  let starts = [{ x: 2.5, y: 1 }, { x: -2, y: 2.5 }, { x: -1, y: -3 }, { x: 3, y: -2.5 }];
  let curves = [];
  let lastChanged = null;
  const particles = new Particles(320);

  const A = () => [s.a.value, s.b.value, s.c.value, s.d.value];
  const F = (x, y) => {
    const [a, b, c, d] = A();
    return [a * x + b * y, c * x + d * y];
  };
  const data = () => ({ m: A(), starts });
  const matTex = (m, live) => {
    const names = ['a', 'b', 'c', 'd'];
    const cell = i => live ? hl(scrub('mat' + names[i].toUpperCase(), fmt(m[i])), lastChanged === names[i]) : fmt(m[i], 1);
    return `\\begin{bmatrix} ${cell(0)} & ${cell(1)} \\\\ ${cell(2)} & ${cell(3)} \\end{bmatrix}`;
  };

  function draw() {
    plot.begin();
    plot.grid();
    const info = analyze2x2(...A());

    if (el('linearField').checked) drawField(plot, F, { spacing: 34 });
    if (el('linearFlow').checked) particles.draw(plot);

    for (const entry of log.overlays()) {
      log.drawOverlay(plot, entry, d => {
        const [a, b, c, e] = d.m;
        return (x, y) => [a * x + b * y, c * x + e * y];
      });
    }

    if (el('linearEigen').checked && info.real) {
      const v = plot.visible();
      const R = Math.hypot(v.xmax - v.xmin, v.ymax - v.ymin);
      const vecs = info.repeated ? [[info.v1, info.l1]] : [[info.v1, info.l1], [info.v2, info.l2]];
      for (const [vec, l] of vecs) {
        plot.line(-vec.x * R, -vec.y * R, vec.x * R, vec.y * R, 'rgba(233, 196, 106, 0.7)', 1.5, [6, 4]);
        plot.text(`λ = ${fmt(l)}`, vec.x * 3.4, vec.y * 3.4, COLORS.yellow, 'left', 'bottom', '600 13px Sora, sans-serif');
      }
    }

    curves.forEach(c => plot.path(c, COLORS.white, 2));
    starts.forEach(p => plot.dot(p.x, p.y, 4, COLORS.bg, COLORS.white));
    plot.dot(0, 0, 5, info.stable ? COLORS.yellow : COLORS.bg, COLORS.yellow);
  }

  function drawTrace() {
    const info = analyze2x2(...A());
    trace.begin();
    trace.grid({ labels: false, step: 1, ystep: 1 });
    trace.graph(t => (t * t) / 4, COLORS.creamDim, 1.5);
    const label = (str, x, y) => trace.text(str, x, y, COLORS.muted, 'center', 'middle', '11px Sora, sans-serif');
    label('saddles', 0, -1.8);
    label('spiral sinks', -1.6, 4.6);
    label('spiral sources', 1.6, 4.6);
    label('nodal sinks', -4.6, 1.8);
    label('nodal sources', 4.6, 1.8);
    label('centers ↑', 0.55, 7.6);
    for (const entry of log.overlays()) {
      const [a, b, c, d] = entry.data.m;
      trace.dot(clamp(a + d, -5.8, 5.8), clamp(a * d - b * c, -2.8, 8.8), 4, entry.color);
    }
    const t = clamp(info.tr, -5.8, 5.8), d = clamp(info.det, -2.8, 8.8);
    trace.dot(t, d, 10, COLORS.yellowDim);
    trace.dot(t, d, 5, COLORS.yellow, COLORS.bg);
  }

  function equations() {
    const [a, b, c, d] = A();
    const info = analyze2x2(a, b, c, d);
    tex('linearFormula', `\\begin{bmatrix} x' \\\\ y' \\end{bmatrix} = ${matTex([a, b, c, d], true)} \\begin{bmatrix} x \\\\ y \\end{bmatrix}`, true);

    tex('linearChar',
      `\\det(A - \\lambda I) = \\lambda^2 - \\tau\\lambda + \\Delta = 0, \\quad \\tau = ${fmt(info.tr)},\\ \\Delta = ${fmt(info.det)}`, true);

    let eig, sol;
    if (!info.real) {
      eig = `\\lambda = \\tfrac{\\tau \\pm \\sqrt{\\tau^2 - 4\\Delta}}{2} = ${fmt(info.alpha)} \\pm ${fmt(info.beta)}\\,i`;
      sol = `\\mathbf x(t) = e^{${fmt(info.alpha)}t}\\left(c_1 \\cos(${fmt(info.beta)}t)\\,\\mathbf u + c_2 \\sin(${fmt(info.beta)}t)\\,\\mathbf w\\right)`;
    } else if (info.repeated) {
      eig = `\\lambda_1 = \\lambda_2 = ${fmt(info.l1)}, \\quad \\mathbf v = (${fmt(info.v1.x)}, ${fmt(info.v1.y)})`;
      sol = `\\mathbf x(t) = c_1 e^{${fmt(info.l1)}t}\\mathbf v + c_2 e^{${fmt(info.l1)}t}(t\\,\\mathbf v + \\mathbf w)`;
    } else {
      eig = `\\lambda_1 = ${fmt(info.l1)},\\ \\mathbf v_1 = (${fmt(info.v1.x)}, ${fmt(info.v1.y)}) \\quad \\lambda_2 = ${fmt(info.l2)},\\ \\mathbf v_2 = (${fmt(info.v2.x)}, ${fmt(info.v2.y)})`;
      sol = `\\mathbf x(t) = c_1 e^{${fmt(info.l1)}t}\\,\\mathbf v_1 + c_2 e^{${fmt(info.l2)}t}\\,\\mathbf v_2`;
    }
    tex('linearEigenvalues', eig, true);
    tex('linearSolution', sol, true);

    el('linearType').innerHTML = `<strong>${info.type[0].toUpperCase() + info.type.slice(1)}.</strong> ${typeNotes[info.type] || ''}`;
    el('linearReadout').innerHTML = `τ = <b>${fmt(info.tr)}</b> &nbsp; Δ = <b>${fmt(info.det)}</b> &nbsp; ${info.type}`;
  }

  function update() {
    curves = starts.map(p => trajectory(F, p, plot.visible(), 0.01, 3000));
    particles.reset();
    equations();
    draw();
    drawTrace();
  }

  function setMatrix(m) {
    [s.a.value, s.b.value, s.c.value, s.d.value] = m;
  }

  function init() {
    plot = new Plot2D(el('linearCanvas'), { xmin: -6, xmax: 6, ymin: -4.5, ymax: 4.5 }, {
      onResize: draw,
      panZoom: true,
      onView: draw,
      onViewEnd: update,
      probe: w => {
        const [dx, dy] = F(w.x, w.y);
        return `(x′, y′) = (${fmt(dx)}, ${fmt(dy)})`;
      }
    });
    trace = new Plot2D(el('traceCanvas'), { xmin: -6, xmax: 6, ymin: -3, ymax: 9 }, { equal: false, onResize: drawTrace });

    log = new EquationLog('linear', 'linearLog', 'linearLogClear', {
      keyOf: d => d.m.map(v => v.toFixed(2)).join(','),
      texOf: d => `A = \\left[\\begin{smallmatrix} ${fmt(d.m[0], 1)} & ${fmt(d.m[1], 1)} \\\\ ${fmt(d.m[2], 1)} & ${fmt(d.m[3], 1)} \\end{smallmatrix}\\right] \\; \\text{${analyze2x2(...d.m).type}}`,
      onPick: entry => {
        setMatrix(entry.data.m);
        starts = entry.data.starts.map(p => ({ ...p }));
        lastChanged = null;
        mark(-1);
        update();
      },
      onChange: () => { draw(); drawTrace(); }
    });

    for (const k of ['a', 'b', 'c', 'd']) {
      s[k] = slider('mat' + k.toUpperCase(), () => { lastChanged = k; mark(-1); update(); log.settle(data); });
    }
    mark = chipRow('linearChips', presets, i => {
      setMatrix(presets[i].m);
      lastChanged = null;
      update();
      log.add(data());
    });

    ['linearField', 'linearEigen', 'linearFlow'].forEach(id => el(id).addEventListener('change', draw));
    el('linearClear').addEventListener('click', () => { starts = []; update(); log.update(data()); });
    // a fresh copy, so the one before it stays put while you keep editing
    el('linearSave').addEventListener('click', () => {
      log.add(data(), true);
      toast('saved to the log');
      draw();
    });

    el('linearCanvas').addEventListener('click', e => {
      if (plot.wasDrag()) return;
      const p = pointerPos(el('linearCanvas'), e);
      starts.push(plot.toWorld(p.x, p.y));
      if (starts.length > 12) starts.shift();
      update();
      log.update(data());
    });

    // a matrix with any trace and determinant: [[0, 1], [-det, trace]]. drag around the map
    let tracing = false;
    const pickTrace = e => {
      const p = pointerPos(el('traceCanvas'), e);
      const w = trace.toWorld(p.x, p.y);
      setMatrix([0, 1, -clamp(Math.round(w.y * 20) / 20, -3, 3), clamp(Math.round(w.x * 20) / 20, -3, 3)]);
      mark(-1);
      lastChanged = null;
      update();
    };
    el('traceCanvas').addEventListener('pointerdown', e => { tracing = true; el('traceCanvas').setPointerCapture(e.pointerId); pickTrace(e); });
    el('traceCanvas').addEventListener('pointermove', e => { if (tracing) pickTrace(e); });
    el('traceCanvas').addEventListener('pointerup', () => { tracing = false; log.settle(data, 100); });

    const cur = log.entries[0];
    if (cur) {
      log.current = cur.id;
      setMatrix(cur.data.m);
      starts = cur.data.starts.map(p => ({ ...p }));
      mark(-1);
      update();
    } else {
      mark(1);
      setMatrix(presets[1].m);
      update();
      log.add(data());
    }
    log.render();
  }

  function frame() {
    if (!plot || !el('linearFlow').checked) return;
    particles.step(plot, F, false);
    draw();
  }

  return { init, frame };
})();

// ===================================================================
// nonlinear systems
// ===================================================================

const nonlinMode = (() => {
  const el = id => document.getElementById(id);
  const presets = [
    { name: 'pendulum', fx: 'y', fy: '-sin(x) - a*y', a: 0.3, b: 0, box: [-8, 8, -5, 5] },
    { name: 'predator & prey', fx: 'a*x - x*y', fy: 'x*y - b*y', a: 1, b: 1, box: [-1, 5, -1, 4] },
    { name: 'Van der Pol', fx: 'y', fy: 'a*(1 - x^2)*y - x', a: 1, b: 0, box: [-5, 5, -4, 4] },
    { name: 'competing species', fx: 'x*(3 - x - a*y)', fy: 'y*(2 - x - b*y)', a: 2, b: 1, box: [-1, 4, -1, 3] },
    { name: 'limit cycle', fx: 'x - y - x*(x^2 + y^2)', fy: 'x + y - y*(x^2 + y^2)', a: 1, b: 1, box: [-3, 3, -2.5, 2.5] }
  ];

  let plot, sa, sb, log, mark;
  let cx = null, cy = null;
  let starts = [];
  let curves = [];
  let equilibria = [];
  const particles = new Particles(320);
  let lastChanged = null;

  const P = () => ({ a: sa.value, b: sb.value });
  const F = (x, y) => {
    const p = P();
    return [cx.fn({ x, y, ...p }), cy.fn({ x, y, ...p })];
  };
  const data = () => ({ fx: el('nonlinX').value, fy: el('nonlinY').value, a: sa.value, b: sb.value, starts, box: plot.bounds });

  function jacobian(x, y) {
    const h = 1e-5;
    const [fx1, fy1] = F(x + h, y), [fx0, fy0] = F(x - h, y);
    const [gx1, gy1] = F(x, y + h), [gx0, gy0] = F(x, y - h);
    return [(fx1 - fx0) / (2 * h), (gx1 - gx0) / (2 * h), (fy1 - fy0) / (2 * h), (gy1 - gy0) / (2 * h)];
  }

  // newton's method from a grid of starting guesses
  function findEquilibria() {
    const v = plot.visible();
    const found = [];
    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j <= 8; j++) {
        let x = v.xmin + ((v.xmax - v.xmin) * i) / 10;
        let y = v.ymin + ((v.ymax - v.ymin) * j) / 8;
        for (let k = 0; k < 40; k++) {
          const [f, g] = F(x, y);
          const [a, b, c, d] = jacobian(x, y);
          const det = a * d - b * c;
          if (!isFinite(det) || Math.abs(det) < 1e-12) break;
          const dx = (d * f - b * g) / det;
          const dy = (-c * f + a * g) / det;
          x -= dx; y -= dy;
          if (Math.hypot(dx, dy) < 1e-10) break;
        }
        const [f, g] = F(x, y);
        if (!isFinite(x) || Math.hypot(f, g) > 1e-7) continue;
        if (x < v.xmin || x > v.xmax || y < v.ymin || y > v.ymax) continue;
        if (found.some(p => Math.hypot(p.x - x, p.y - y) < 1e-4)) continue;
        found.push({ x, y });
      }
    }
    found.sort((p, q) => p.x - q.x || p.y - q.y);
    return found.slice(0, 8).map(p => {
      const J = jacobian(p.x, p.y);
      return { ...p, J, info: analyze2x2(...J) };
    });
  }

  function compile() {
    try {
      const nx = compileExpr(el('nonlinX').value, ['x', 'y', 'a', 'b']);
      const ny = compileExpr(el('nonlinY').value, ['x', 'y', 'a', 'b']);
      nx.fn({ x: 0.3, y: 0.2, a: 1, b: 1 });
      cx = nx; cy = ny;
      el('nonlinError').textContent = '';
      el('nonlinX').classList.remove('bad');
      el('nonlinY').classList.remove('bad');
      return true;
    } catch (e) {
      el('nonlinError').textContent = e.message;
      return false;
    }
  }

  function draw() {
    plot.begin();
    plot.grid();
    if (el('nonlinField').checked) drawField(plot, F, { spacing: 34 });
    if (el('nonlinFlow').checked) particles.draw(plot);
    if (el('nonlinNull').checked) {
      for (const [a, b] of zeroSet(plot, (x, y) => F(x, y)[0])) plot.line(a.x, a.y, b.x, b.y, COLORS.cream, 1.6);
      for (const [a, b] of zeroSet(plot, (x, y) => F(x, y)[1])) plot.line(a.x, a.y, b.x, b.y, COLORS.yellow, 1.6);
    }
    for (const entry of log.overlays()) {
      log.drawOverlay(plot, entry, d => {
        const gx = compileExpr(d.fx, ['x', 'y', 'a', 'b']), gy = compileExpr(d.fy, ['x', 'y', 'a', 'b']);
        return (x, y) => [gx.fn({ x, y, a: d.a, b: d.b }), gy.fn({ x, y, a: d.a, b: d.b })];
      });
    }
    curves.forEach(c => plot.path(c, COLORS.white, 2));
    starts.forEach(p => plot.dot(p.x, p.y, 4, COLORS.bg, COLORS.white));
    equilibria.forEach((e, i) => {
      plot.dot(e.x, e.y, 7, e.info.stable ? COLORS.yellow : COLORS.bg, COLORS.yellow, 2.5);
      plot.text(' ' + String.fromCharCode(65 + i), e.x, e.y, COLORS.yellowBright, 'left', 'bottom', '600 13px Sora, sans-serif');
    });
  }

  function equations() {
    const p = P();
    const sc = { a: 'nonlinA', b: 'nonlinB' };
    tex('nonlinFormula',
      `\\begin{cases} x' = ${toTex(cx.tree, p, lastChanged, sc)} \\\\[4pt] y' = ${toTex(cy.tree, p, lastChanged, sc)} \\end{cases}`, true);
    tex('nonlinJacobian',
      `J = \\begin{bmatrix} \\partial_x x' & \\partial_y x' \\\\ \\partial_x y' & \\partial_y y' \\end{bmatrix}`, true);

    let rows = '<tr><th></th><th style="text-align:right">point</th><th style="text-align:right">eigenvalues</th><th>type</th></tr>';
    equilibria.forEach((e, i) => {
      const ev = e.info.real ? `${fmt(e.info.l1)}, ${fmt(e.info.l2)}` : `${fmt(e.info.alpha)} ± ${fmt(e.info.beta)}i`;
      rows += `<tr class="row"><td>${String.fromCharCode(65 + i)}</td><td class="n">(${fmt(e.x)}, ${fmt(e.y)})</td><td class="n">${ev}</td><td>${e.info.type}</td></tr>`;
    });
    if (!equilibria.length) rows += '<tr class="row"><td></td><td colspan="3">no equilibria in view</td></tr>';
    el('nonlinTable').innerHTML = rows;
    el('nonlinReadout').innerHTML = `<b>${equilibria.length}</b> equilibri${equilibria.length === 1 ? 'um' : 'a'} in view · filled = stable`;
  }

  function update() {
    equilibria = findEquilibria();
    curves = starts.map(s => trajectory(F, s, plot.visible(), 0.01, 3000));
    particles.reset();
    equations();
    draw();
  }

  function restore(d) {
    el('nonlinX').value = d.fx;
    el('nonlinY').value = d.fy;
    sa.value = d.a;
    sb.value = d.b;
    if (d.box) plot.bounds = Array.isArray(d.box)
      ? { xmin: d.box[0], xmax: d.box[1], ymin: d.box[2], ymax: d.box[3] }
      : { ...d.box };
    starts = (d.starts || []).map(p => ({ ...p }));
    compile();
    lastChanged = null;
    update();
  }

  function commitTyped() {
    const cur = log.currentEntry;
    const d = data();
    if (cx && cy && (!cur || cur.data.fx !== d.fx || cur.data.fy !== d.fy)) {
      log.add(d);
      toast('added to the log');
      draw();
    }
  }

  function init() {
    plot = new Plot2D(el('nonlinCanvas'), { xmin: -8, xmax: 8, ymin: -5, ymax: 5 }, {
      onResize: () => update(),
      panZoom: true,
      onView: draw,
      onViewEnd: update,
      probe: w => {
        if (!cx) return '';
        const [dx, dy] = F(w.x, w.y);
        return `(x′, y′) = (${fmt(dx)}, ${fmt(dy)})`;
      }
    });
    sa = slider('nonlinA', () => { lastChanged = 'a'; update(); log.update(data()); });
    sb = slider('nonlinB', () => { lastChanged = 'b'; update(); log.update(data()); });

    log = new EquationLog('nonlinear', 'nonlinLog', 'nonlinLogClear', {
      keyOf: d => d.fx + '|' + d.fy,
      texOf: d => {
        const gx = compileExpr(d.fx, ['x', 'y', 'a', 'b']), gy = compileExpr(d.fy, ['x', 'y', 'a', 'b']);
        return `x' = ${toTex(gx.tree, d)},\\ y' = ${toTex(gy.tree, d)}`;
      },
      onPick: entry => { mark(presets.findIndex(p => p.fx === entry.data.fx && p.fy === entry.data.fy)); restore(entry.data); },
      onChange: draw
    });

    mark = chipRow('nonlinChips', presets, i => {
      const p = presets[i];
      restore({ ...p, starts: [] });
      log.add(data());
    });

    let typing = null;
    ['nonlinX', 'nonlinY'].forEach(id => {
      el(id).addEventListener('input', () => {
        mark(-1);
        clearTimeout(typing);
        if (compile()) {
          update();
          typing = setTimeout(commitTyped, 1200);
        }
      });
      el(id).addEventListener('keydown', e => { if (e.key === 'Enter') commitTyped(); });
      el(id).addEventListener('blur', commitTyped);
    });
    ['nonlinField', 'nonlinNull', 'nonlinFlow'].forEach(id => el(id).addEventListener('change', draw));
    el('nonlinClear').addEventListener('click', () => { starts = []; update(); log.update(data()); });
    el('nonlinCanvas').addEventListener('click', e => {
      if (plot.wasDrag()) return;
      const p = pointerPos(el('nonlinCanvas'), e);
      starts.push(plot.toWorld(p.x, p.y));
      if (starts.length > 12) starts.shift();
      update();
      log.update(data());
    });

    const cur = log.entries[0];
    if (cur) {
      log.current = cur.id;
      mark(presets.findIndex(p => p.fx === cur.data.fx && p.fy === cur.data.fy));
      restore(cur.data);
    } else {
      mark(0);
      restore({ ...presets[0], starts: [{ x: -7, y: 4 }, { x: 7.5, y: -3.5 }] });
      log.add(data());
    }
    log.render();
  }

  function frame() {
    if (!plot || !cx || !el('nonlinFlow').checked) return;
    particles.step(plot, F, false);
    draw();
  }

  return { init, frame };
})();

// ===================================================================

const started = {};
const modes = { slope: slopeMode, linear: linearMode, nonlinear: nonlinMode };
let current = null;

modeTabs('modes', key => {
  current = key;
  if (!started[key]) {
    started[key] = true;
    requestAnimationFrame(() => modes[key].init());
  }
});

function loop() {
  if (current && started[current] && !document.hidden) modes[current].frame();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
