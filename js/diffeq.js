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
// slope fields
// ===================================================================

const slopeMode = (() => {
  const el = id => document.getElementById(id);
  const presets = [
    { name: 'Linear', expr: 'a*x - b*y', a: 1, b: 1 },
    { name: 'Exponential growth', expr: 'a*y', a: 0.6, b: 0 },
    { name: 'Logistic', expr: 'a*y*(1 - y/b)', a: 1, b: 2.5 },
    { name: 'Forced', expr: 'sin(a*x) - b*y', a: 1.5, b: 0.5 },
    { name: 'Blow-up', expr: 'a*y^2 - b*x', a: 0.5, b: 0.5 },
    { name: 'Custom', expr: null }
  ];

  let plot, sa, sb, sh;
  let compiled = null;
  let starts = [{ x: -3, y: 1 }];
  let lastChanged = null;
  let curves = [];
  const particles = new Particles(110);

  const f = (x, y) => compiled.fn({ x, y, a: sa.value, b: sb.value });
  const F = (x, y) => [1, f(x, y)];

  function setExpr(src) {
    try {
      compiled = compileExpr(src, ['x', 'y', 'a', 'b']);
      if (typeof f(0.2, 0.3) !== 'number') throw new Error('not a number');
      el('slopeExpr').classList.remove('bad');
      el('slopeError').textContent = '';
      return true;
    } catch (e) {
      el('slopeExpr').classList.add('bad');
      el('slopeError').textContent = e.message;
      return false;
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
    curves = starts.map(s => trajectory(F, s, v, 0.01, 2000));
  }

  function draw() {
    plot.begin();
    plot.grid();
    const v = plot.visible();

    if (el('slopeNull').checked) {
      for (const [a, b] of zeroSet(plot, f)) plot.line(a.x, a.y, b.x, b.y, COLORS.yellow, 1.5, [4, 3]);
    }
    if (el('slopeField').checked) drawField(plot, F, { slope: true, spacing: 26 });
    if (el('slopeFlow').checked) particles.draw(plot);

    curves.forEach((c, i) => plot.path(c, i === curves.length - 1 ? COLORS.white : 'rgba(250, 250, 250, 0.45)', 2));

    if (el('slopeEuler').checked) {
      const { pts } = euler();
      plot.path(pts, COLORS.yellow, 2);
      pts.forEach(p => plot.dot(p.x, p.y, 3, COLORS.yellow));
    }
    starts.forEach((s, i) => plot.dot(s.x, s.y, i === starts.length - 1 ? 5 : 3.5, COLORS.bg, COLORS.white));
  }

  function equations() {
    const a = sa.value, b = sb.value;
    const s = starts[starts.length - 1];
    const ic = lastChanged === 'start';
    tex('slopeFormula',
      `\\frac{dy}{dx} = ${toTex(compiled.tree, { a, b }, lastChanged)}, \\qquad ${hl(`y(${fmt(s.x)}) = ${fmt(s.y)}`, ic)}`, true);

    const h = sh.value;
    const hh = lastChanged === 'h';
    tex('eulerFormula', `y_{n+1} = y_n + ${hl('h', hh)}\\,f(x_n, y_n), \\qquad ${hl(`h = ${fmt(h)}`, hh)}`, true);

    const { pts, target } = euler();
    let rows = '<tr><th>n</th><th style="text-align:right">x<sub>n</sub></th><th style="text-align:right">y<sub>n</sub></th><th style="text-align:right">f(x<sub>n</sub>, y<sub>n</sub>)</th><th style="text-align:right">y<sub>n+1</sub></th></tr>';
    for (let n = 0; n < Math.min(5, pts.length - 1); n++) {
      const p = pts[n];
      rows += `<tr class="row"><td>${n}</td><td class="n">${fmt(p.x)}</td><td class="n">${fmt(p.y, 3)}</td><td class="n">${fmt(f(p.x, p.y), 3)}</td><td class="n">${fmt(pts[n + 1].y, 3)}</td></tr>`;
    }
    if (pts.length > 6) rows += `<tr class="row"><td>…</td><td class="n"></td><td class="n"></td><td class="n"></td><td class="n"></td></tr>`;
    el('eulerTable').innerHTML = rows;

    // accurate value with a tiny rk4 step
    let x = s.x, y = s.y;
    const steps = 600;
    const dx = (target - s.x) / steps;
    for (let i = 0; i < steps && isFinite(y); i++) {
      y = rk4(F, x, y, dx).y;
      x += dx;
    }
    const ye = pts[pts.length - 1].y;
    el('eulerStats').innerHTML =
      `<div><span>steps to x = ${fmt(target)}</span><b>${pts.length - 1}</b></div>` +
      `<div><span>Euler</span><b>${fmt(ye, 3)}</b></div>` +
      `<div><span>true value</span><b>${fmt(y, 3)}</b></div>` +
      `<div><span>error</span><b>${fmt(Math.abs(ye - y), 3)}</b></div>`;

    el('slopeReadout').innerHTML = `start (<b>${fmt(s.x)}</b>, <b>${fmt(s.y)}</b>)`;
  }

  function update() {
    solveCurves();
    particles.reset();
    equations();
    draw();
  }

  function loadPreset(i) {
    const p = presets[i];
    if (!p.expr) return;
    el('slopeExpr').value = p.expr;
    sa.value = p.a;
    sb.value = p.b;
    setExpr(p.expr);
  }

  function init() {
    plot = new Plot2D(el('slopeCanvas'), { xmin: -5, xmax: 5, ymin: -4, ymax: 4 }, { onResize: () => { solveCurves(); draw(); } });
    const changed = k => () => { lastChanged = k; update(); };
    sa = slider('slopeA', changed('a'));
    sb = slider('slopeB', changed('b'));
    sh = slider('slopeH', changed('h'));

    const sel = el('slopePreset');
    presets.forEach((p, i) => sel.add(new Option(p.name, i)));
    sel.addEventListener('change', () => { lastChanged = null; loadPreset(+sel.value); update(); });
    el('slopeExpr').addEventListener('input', e => {
      sel.value = presets.length - 1;
      if (setExpr(e.target.value)) update();
    });
    ['slopeField', 'slopeEuler', 'slopeNull', 'slopeFlow'].forEach(id => el(id).addEventListener('change', draw));
    el('slopeClear').addEventListener('click', () => { starts = [starts[starts.length - 1]]; update(); });

    el('slopeCanvas').addEventListener('click', e => {
      const p = pointerPos(el('slopeCanvas'), e);
      starts.push(plot.toWorld(p.x, p.y));
      if (starts.length > 8) starts.shift();
      lastChanged = 'start';
      update();
    });

    loadPreset(0);
    update();
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
    { name: 'Saddle', m: [1, 1, 2, -1] },
    { name: 'Spiral sink', m: [-0.5, -2, 2, -0.5] },
    { name: 'Spiral source', m: [0.3, -1.5, 1.5, 0.3] },
    { name: 'Center', m: [0, 1, -2, 0] },
    { name: 'Nodal sink', m: [-2, 1, 0.5, -1.5] },
    { name: 'Nodal source', m: [1.5, 0.5, 0.25, 1] },
    { name: 'Star', m: [-1, 0, 0, -1] },
    { name: 'Degenerate node', m: [-1, 1, 0, -1] }
  ];

  let plot, trace;
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

  function draw() {
    plot.begin();
    plot.grid();
    const info = analyze2x2(...A());

    if (el('linearField').checked) drawField(plot, F, { spacing: 32 });
    if (el('linearFlow').checked) particles.draw(plot);

    if (el('linearEigen').checked && info.real) {
      const v = plot.visible();
      const R = Math.hypot(v.xmax - v.xmin, v.ymax - v.ymin);
      const vecs = info.repeated ? [[info.v1, info.l1]] : [[info.v1, info.l1], [info.v2, info.l2]];
      for (const [vec, l] of vecs) {
        plot.line(-vec.x * R, -vec.y * R, vec.x * R, vec.y * R, 'rgba(233, 196, 106, 0.7)', 1.5, [6, 4]);
        const at = { x: vec.x * 3.2, y: vec.y * 3.2 };
        plot.text(`λ = ${fmt(l)}`, at.x, at.y, COLORS.yellow, 'left', 'bottom');
      }
    }

    curves.forEach(c => plot.path(c, COLORS.white, 1.8));
    starts.forEach(p => plot.dot(p.x, p.y, 3.5, COLORS.bg, COLORS.white));
    plot.dot(0, 0, 4, info.stable ? COLORS.yellow : COLORS.bg, COLORS.yellow);
  }

  function drawTrace() {
    const info = analyze2x2(...A());
    trace.begin();
    trace.grid({ labels: false, step: 1, ystep: 1 });
    const ctx = trace.ctx;
    trace.graph(t => (t * t) / 4, COLORS.creamDim, 1.5);
    const label = (str, x, y) => trace.text(str, x, y, COLORS.muted, 'center', 'middle', '11px "IBM Plex Sans", sans-serif');
    label('saddles', 0, -1.8);
    label('spiral sinks', -1.6, 4.6);
    label('spiral sources', 1.6, 4.6);
    label('nodal sinks', -4.6, 1.8);
    label('nodal sources', 4.6, 1.8);
    label('centers ↑', 0.55, 7.6);
    trace.text('τ = trace', trace.visible().xmax - 0.2, 0.15, COLORS.muted, 'right', 'bottom', '11px "IBM Plex Sans", sans-serif');
    trace.text('Δ = det', 0.15, trace.visible().ymax - 0.3, COLORS.muted, 'left', 'top', '11px "IBM Plex Sans", sans-serif');
    const t = clamp(info.tr, -5.8, 5.8), d = clamp(info.det, -2.8, 8.8);
    trace.dot(t, d, 9, COLORS.yellowDim);
    trace.dot(t, d, 5, COLORS.yellow, COLORS.bg);
    ctx.setLineDash([]);
  }

  function equations() {
    const [a, b, c, d] = A();
    const info = analyze2x2(a, b, c, d);
    const L = lastChanged;
    tex('linearFormula',
      `\\begin{bmatrix} x' \\\\ y' \\end{bmatrix} = \\begin{bmatrix} ${hl(fmt(a), L === 'a')} & ${hl(fmt(b), L === 'b')} \\\\ ${hl(fmt(c), L === 'c')} & ${hl(fmt(d), L === 'd')} \\end{bmatrix} \\begin{bmatrix} x \\\\ y \\end{bmatrix}`, true);

    tex('linearChar',
      `\\begin{gathered} \\det(A - \\lambda I) = \\lambda^2 - \\tau\\lambda + \\Delta = 0 \\\\[4pt] \\tau = a + d = ${fmt(info.tr)}, \\qquad \\Delta = ad - bc = ${fmt(info.det)} \\end{gathered}`, true);

    let eig, sol;
    if (!info.real) {
      eig = `\\lambda = \\frac{\\tau \\pm \\sqrt{\\tau^2 - 4\\Delta}}{2} = ${fmt(info.alpha)} \\pm ${fmt(info.beta)}\\,i`;
      sol = `\\mathbf x(t) = e^{${fmt(info.alpha)}t}\\left(c_1 \\cos(${fmt(info.beta)}t)\\,\\mathbf u + c_2 \\sin(${fmt(info.beta)}t)\\,\\mathbf w\\right)`;
    } else if (info.repeated) {
      eig = `\\lambda_1 = \\lambda_2 = ${fmt(info.l1)}, \\qquad \\mathbf v = (${fmt(info.v1.x)}, ${fmt(info.v1.y)})`;
      sol = `\\mathbf x(t) = c_1 e^{${fmt(info.l1)}t}\\mathbf v + c_2 e^{${fmt(info.l1)}t}(t\\,\\mathbf v + \\mathbf w)`;
    } else {
      eig = `\\lambda_1 = ${fmt(info.l1)},\\ \\mathbf v_1 = (${fmt(info.v1.x)}, ${fmt(info.v1.y)}) \\qquad \\lambda_2 = ${fmt(info.l2)},\\ \\mathbf v_2 = (${fmt(info.v2.x)}, ${fmt(info.v2.y)})`;
      sol = `\\mathbf x(t) = c_1 e^{${fmt(info.l1)}t}\\,\\mathbf v_1 + c_2 e^{${fmt(info.l2)}t}\\,\\mathbf v_2`;
    }
    tex('linearEigenvalues', eig, true);
    tex('linearSolution', sol, true);

    const note = typeNotes[info.type] || '';
    el('linearType').innerHTML = `<strong>${info.type[0].toUpperCase() + info.type.slice(1)}.</strong> ${note}`;
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
    plot = new Plot2D(el('linearCanvas'), { xmin: -4, xmax: 4, ymin: -3.5, ymax: 3.5 }, { onResize: draw });
    trace = new Plot2D(el('traceCanvas'), { xmin: -6, xmax: 6, ymin: -3, ymax: 9 }, { equal: false, onResize: drawTrace });
    for (const k of ['a', 'b', 'c', 'd']) {
      s[k] = slider('mat' + k.toUpperCase(), () => { lastChanged = k; el('linearPreset').value = ''; update(); });
    }
    const sel = el('linearPreset');
    sel.add(new Option('—', ''));
    presets.forEach((p, i) => sel.add(new Option(p.name, i)));
    sel.addEventListener('change', () => {
      if (sel.value === '') return;
      setMatrix(presets[+sel.value].m);
      lastChanged = null;
      update();
    });
    ['linearField', 'linearEigen', 'linearFlow'].forEach(id => el(id).addEventListener('change', draw));
    el('linearClear').addEventListener('click', () => { starts = []; update(); });

    el('linearCanvas').addEventListener('click', e => {
      const p = pointerPos(el('linearCanvas'), e);
      starts.push(plot.toWorld(p.x, p.y));
      if (starts.length > 12) starts.shift();
      update();
    });

    // a matrix with any trace and determinant: [[0, 1], [-det, trace]]
    el('traceCanvas').addEventListener('click', e => {
      const p = pointerPos(el('traceCanvas'), e);
      const w = trace.toWorld(p.x, p.y);
      const t = clamp(Math.round(w.x * 20) / 20, -3, 3);
      const d = clamp(Math.round(w.y * 20) / 20, -3, 3);
      setMatrix([0, 1, -d, t]);
      el('linearPreset').value = '';
      lastChanged = null;
      update();
    });

    sel.value = '1';
    setMatrix(presets[1].m);
    update();
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
    { name: 'Damped pendulum', fx: 'y', fy: '-sin(x) - a*y', a: 0.3, b: 0, box: [-7, 7, -4, 4] },
    { name: 'Predator and prey', fx: 'a*x - x*y', fy: 'x*y - b*y', a: 1, b: 1, box: [-0.5, 4.5, -0.5, 4] },
    { name: 'Van der Pol oscillator', fx: 'y', fy: 'a*(1 - x^2)*y - x', a: 1, b: 0, box: [-4, 4, -4, 4] },
    { name: 'Competing species', fx: 'x*(3 - x - a*y)', fy: 'y*(2 - x - b*y)', a: 2, b: 1, box: [-0.5, 3.5, -0.5, 3] },
    { name: 'Custom', fx: null }
  ];

  let plot, sa, sb;
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
      cx = compileExpr(el('nonlinX').value, ['x', 'y', 'a', 'b']);
      cy = compileExpr(el('nonlinY').value, ['x', 'y', 'a', 'b']);
      F(0.3, 0.2);
      el('nonlinError').textContent = '';
      el('nonlinX').classList.remove('bad');
      el('nonlinY').classList.remove('bad');
      return true;
    } catch (e) {
      el('nonlinError').textContent = e.message;
      el('nonlinX').classList.add('bad');
      el('nonlinY').classList.add('bad');
      return false;
    }
  }

  function draw() {
    plot.begin();
    plot.grid();
    if (el('nonlinField').checked) drawField(plot, F, { spacing: 32 });
    if (el('nonlinFlow').checked) particles.draw(plot);
    if (el('nonlinNull').checked) {
      for (const [a, b] of zeroSet(plot, (x, y) => F(x, y)[0])) plot.line(a.x, a.y, b.x, b.y, COLORS.cream, 1.6);
      for (const [a, b] of zeroSet(plot, (x, y) => F(x, y)[1])) plot.line(a.x, a.y, b.x, b.y, COLORS.yellow, 1.6);
    }
    curves.forEach(c => plot.path(c, COLORS.white, 1.8));
    starts.forEach(p => plot.dot(p.x, p.y, 3.5, COLORS.bg, COLORS.white));
    equilibria.forEach((e, i) => {
      plot.dot(e.x, e.y, 6, e.info.stable ? COLORS.yellow : COLORS.bg, COLORS.yellow, 2);
      plot.text(String.fromCharCode(65 + i), e.x, e.y, COLORS.yellowBright, 'left', 'bottom', '600 12px "IBM Plex Sans", sans-serif');
    });
  }

  function equations() {
    const p = P();
    tex('nonlinFormula',
      `\\begin{cases} x' = ${toTex(cx.tree, p, lastChanged)} \\\\[4pt] y' = ${toTex(cy.tree, p, lastChanged)} \\end{cases}`, true);
    tex('nonlinJacobian',
      `J(x, y) = \\begin{bmatrix} \\partial_x x' & \\partial_y x' \\\\ \\partial_x y' & \\partial_y y' \\end{bmatrix}`, true);

    let rows = '<tr><th></th><th style="text-align:right">point</th><th style="text-align:right">eigenvalues</th><th>type</th></tr>';
    equilibria.forEach((e, i) => {
      const ev = e.info.real
        ? `${fmt(e.info.l1)}, ${fmt(e.info.l2)}`
        : `${fmt(e.info.alpha)} ± ${fmt(e.info.beta)}i`;
      rows += `<tr class="row"><td>${String.fromCharCode(65 + i)}</td><td class="n">(${fmt(e.x)}, ${fmt(e.y)})</td><td class="n">${ev}</td><td>${e.info.type}</td></tr>`;
    });
    if (!equilibria.length) rows += '<tr class="row"><td></td><td colspan="3">no equilibria in view</td></tr>';
    el('nonlinTable').innerHTML = rows;
    el('nonlinReadout').innerHTML = `<b>${equilibria.length}</b> equilibri${equilibria.length === 1 ? 'um' : 'a'} · filled = stable`;
  }

  function update() {
    equilibria = findEquilibria();
    curves = starts.map(s => trajectory(F, s, plot.visible(), 0.01, 3000));
    particles.reset();
    equations();
    draw();
  }

  function loadPreset(i) {
    const p = presets[i];
    if (!p.fx) return;
    el('nonlinX').value = p.fx;
    el('nonlinY').value = p.fy;
    sa.value = p.a;
    sb.value = p.b;
    const [xmin, xmax, ymin, ymax] = p.box;
    plot.bounds = { xmin, xmax, ymin, ymax };
    starts = [];
    compile();
  }

  function init() {
    plot = new Plot2D(el('nonlinCanvas'), { xmin: -4, xmax: 4, ymin: -4, ymax: 4 }, { onResize: () => update() });
    sa = slider('nonlinA', () => { lastChanged = 'a'; update(); });
    sb = slider('nonlinB', () => { lastChanged = 'b'; update(); });
    const sel = el('nonlinPreset');
    presets.forEach((p, i) => sel.add(new Option(p.name, i)));
    sel.addEventListener('change', () => { lastChanged = null; loadPreset(+sel.value); update(); });
    ['nonlinX', 'nonlinY'].forEach(id => el(id).addEventListener('input', () => {
      sel.value = presets.length - 1;
      if (compile()) update();
    }));
    ['nonlinField', 'nonlinNull', 'nonlinFlow'].forEach(id => el(id).addEventListener('change', draw));
    el('nonlinClear').addEventListener('click', () => { starts = []; update(); });
    el('nonlinCanvas').addEventListener('click', e => {
      const p = pointerPos(el('nonlinCanvas'), e);
      starts.push(plot.toWorld(p.x, p.y));
      if (starts.length > 12) starts.shift();
      update();
    });
    loadPreset(0);
    starts = [{ x: -6, y: 3.5 }, { x: 6.5, y: -3 }];
    update();
  }

  function frame() {
    if (!plot || !el('nonlinFlow').checked) return;
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
  if (current && started[current]) modes[current].frame();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
