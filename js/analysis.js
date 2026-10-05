// real analysis page: epsilon-delta, sequences, riemann sums, uniform convergence

function compileOrShow(src, vars, inputId, errorId) {
  const input = document.getElementById(inputId);
  try {
    const c = compileExpr(src, vars);
    input.classList.remove('bad');
    document.getElementById(errorId).textContent = '';
    return c;
  } catch (e) {
    input.classList.add('bad');
    document.getElementById(errorId).textContent = e.message;
    return null;
  }
}

// ===================================================================
// epsilon - delta
// ===================================================================

const limitMode = (() => {
  const el = id => document.getElementById(id);
  const presets = [
    { name: 'x²', expr: 'x^2', a: 1.5 },
    { name: 'A hole: (x² − 1)/(x − 1)', expr: '(x^2 - 1)/(x - 1)', a: 1 },
    { name: 'sin(x)/x', expr: 'sin(x)/x', a: 0 },
    { name: 'x·sin(1/x)', expr: 'x*sin(1/x)', a: 0 },
    { name: 'A jump: floor(x)', expr: 'floor(x)', a: 1 },
    { name: '1/x near 0.5', expr: '1/x', a: 0.5 },
    { name: 'Custom', expr: null }
  ];

  let plot, sa, se, sl;
  let compiled = null;
  let lastChanged = null;

  const f = x => compiled.fn({ x });

  // two sided limit, or null if the two sides disagree
  function actualLimit(a) {
    const side = s => {
      const v1 = f(a + s * 1e-6), v2 = f(a + s * 1e-7);
      return Math.abs(v1 - v2) < 1e-3 ? v2 : NaN;
    };
    const left = side(-1), right = side(1);
    const ok = isFinite(left) && isFinite(right) && Math.abs(left - right) < 1e-3;
    return { left, right, L: ok ? (left + right) / 2 : null };
  }

  // biggest delta that works, found by walking outwards from a
  function findDelta(a, L, eps) {
    const R = 3;
    const steps = 4000;
    let prev = 0;
    for (let k = 1; k <= steps; k++) {
      const r = R * Math.pow(k / steps, 3) + 1e-7;
      for (const x of [a - r, a + r]) {
        const y = f(x);
        if (!isFinite(y) || Math.abs(y - L) >= eps) return { delta: prev, bad: { x, y } };
      }
      prev = r;
    }
    return { delta: R, bad: null };
  }

  function draw() {
    const a = sa.value, eps = se.value, L = sl.value;
    const { delta, bad } = findDelta(a, L, eps);

    if (el('limitZoom').checked) {
      const h = Math.max(eps * 3, 0.05);
      plot.bounds = { xmin: a - h * 1.3, xmax: a + h * 1.3, ymin: L - h, ymax: L + h };
    } else {
      plot.bounds = { xmin: a - 4, xmax: a + 4, ymin: L - 3, ymax: L + 3 };
    }
    const v = plot.visible();

    plot.begin();
    plot.grid();

    // the epsilon band
    plot.rect(v.xmin, L - eps, v.xmax, L + eps, 'rgba(233, 196, 106, 0.12)');
    plot.line(v.xmin, L + eps, v.xmax, L + eps, 'rgba(233, 196, 106, 0.6)', 1, [5, 4]);
    plot.line(v.xmin, L - eps, v.xmax, L - eps, 'rgba(233, 196, 106, 0.6)', 1, [5, 4]);

    // the delta band
    if (delta > 0) {
      plot.rect(a - delta, v.ymin, a + delta, v.ymax, 'rgba(239, 230, 207, 0.08)');
      plot.line(a - delta, v.ymin, a - delta, v.ymax, COLORS.creamDim, 1, [5, 4]);
      plot.line(a + delta, v.ymin, a + delta, v.ymax, COLORS.creamDim, 1, [5, 4]);
    }

    plot.graph(f, 'rgba(250, 250, 250, 0.55)', 2);
    if (delta > 0) plot.graph(f, COLORS.yellowBright, 2.5, a - delta, a + delta);

    plot.line(a, v.ymin, a, v.ymax, 'rgba(239, 230, 207, 0.2)', 1);
    plot.dot(a, L, 5, COLORS.bg, COLORS.white, 2);
    const fa = f(a);
    if (isFinite(fa) && Math.abs(fa - L) > 1e-9) plot.dot(a, fa, 4, COLORS.white);

    if (bad && delta < 3) {
      const s = plot.toScreen(bad.x, clamp(bad.y, v.ymin, v.ymax));
      const ctx = plot.ctx;
      ctx.strokeStyle = COLORS.white;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x - 5, s.y - 5); ctx.lineTo(s.x + 5, s.y + 5);
      ctx.moveTo(s.x + 5, s.y - 5); ctx.lineTo(s.x - 5, s.y + 5);
      ctx.stroke();
    }

    plot.text('L + ε', v.xmax, L + eps, COLORS.yellow, 'right', 'bottom', '12px "IBM Plex Mono", monospace');
    plot.text('L − ε', v.xmax, L - eps, COLORS.yellow, 'right', 'top', '12px "IBM Plex Mono", monospace');

    el('limitReadout').innerHTML = `ε = <b>${fmt(eps)}</b> &nbsp; δ = <b>${delta >= 3 ? 'anything' : fmt(delta, 4)}</b>`;
    return { delta, bad };
  }

  function equations(delta) {
    const a = sa.value, eps = se.value, L = sl.value;
    const E = lastChanged === 'eps', A = lastChanged === 'a', G = lastChanged === 'L';
    tex('limitDef',
      `\\lim_{x \\to a} f(x) = L \\iff \\forall\\, \\varepsilon > 0\\ \\exists\\, \\delta > 0 :\\ 0 < |x - a| < \\delta \\implies |f(x) - L| < \\varepsilon`, true);

    tex('limitNow',
      `\\begin{gathered} ${hl(`\\varepsilon = ${fmt(eps)}`, E)},\\quad a = ${hl(fmt(a), A)},\\quad L = ${hl(fmt(L, 3), G)} \\\\[4pt]` +
      `0 < |x - ${fmt(a)}| < ${delta > 0 ? fmt(Math.min(delta, 3), 4) : '\\,?'} \\implies |f(x) - ${fmt(L, 3)}| < ${fmt(eps)} \\end{gathered}`, true);

    const act = actualLimit(a);
    let msg;
    if (delta <= 0) {
      msg = act.L === null
        ? `<strong>No δ works.</strong> From the left f heads to ${fmt(act.left, 3)}, from the right to ${fmt(act.right, 3)}. No single L can be within a small ε of both, so the limit does not exist.`
        : `<strong>No δ works.</strong> Points right next to a already miss the band, so L = ${fmt(L, 3)} is not the limit. The actual limit is ${fmt(act.L, 3)}.`;
    } else if (act.L !== null && Math.abs(act.L - L) < 0.01) {
      msg = `<strong>δ = ${fmt(Math.min(delta, 3), 4)} works.</strong> Shrink ε and δ shrinks too, but it never hits zero. That is why the limit is ${fmt(act.L, 3)}.`;
    } else {
      msg = `<strong>This ε is beaten, but try a smaller one.</strong> L = ${fmt(L, 3)} is not quite the limit, so once ε is small enough no δ will work.`;
    }
    el('limitVerdict').innerHTML = msg;

    let rows = '<tr><th>ε</th><th style="text-align:right">largest δ</th></tr>';
    for (const e of [1, 0.5, 0.1, 0.05, 0.01, 0.001]) {
      const d = findDelta(a, L, e).delta;
      rows += `<tr class="row${Math.abs(e - eps) < 1e-9 ? ' active' : ''}"><td class="n" style="text-align:left">${e}</td><td class="n">${d <= 0 ? 'none' : d >= 3 ? 'anything' : fmt(d, 5)}</td></tr>`;
    }
    el('limitTable').innerHTML = rows;
  }

  function update() {
    if (!compiled) return;
    const { delta } = draw();
    equations(delta);
  }

  function snap() {
    const act = actualLimit(sa.value);
    sl.value = act.L !== null ? act.L : (isFinite(act.right) ? act.right : 0);
  }

  function loadPreset(i) {
    const p = presets[i];
    if (!p.expr) return;
    el('limitExpr').value = p.expr;
    compiled = compileOrShow(p.expr, ['x'], 'limitExpr', 'limitError');
    sa.value = p.a;
    snap();
  }

  function init() {
    plot = new Plot2D(el('limitCanvas'), { xmin: -3, xmax: 3, ymin: -2, ymax: 2 }, { equal: false, onResize: update });
    sa = slider('limitA', () => { lastChanged = 'a'; snap(); update(); });
    se = slider('limitEps', () => { lastChanged = 'eps'; update(); });
    sl = slider('limitL', () => { lastChanged = 'L'; update(); }, 2);
    const sel = el('limitPreset');
    presets.forEach((p, i) => sel.add(new Option(p.name, i)));
    sel.addEventListener('change', () => { lastChanged = null; loadPreset(+sel.value); update(); });
    el('limitExpr').addEventListener('input', e => {
      sel.value = presets.length - 1;
      const c = compileOrShow(e.target.value, ['x'], 'limitExpr', 'limitError');
      if (c) { compiled = c; snap(); update(); }
    });
    el('limitSnap').addEventListener('click', () => { snap(); lastChanged = 'L'; update(); });
    el('limitZoom').addEventListener('change', update);
    loadPreset(0);
    update();
  }

  return { init };
})();

// ===================================================================
// sequences
// ===================================================================

const seqMode = (() => {
  const el = id => document.getElementById(id);
  const presets = [
    { name: '1/n', expr: '1/n' },
    { name: '(−1)ⁿ/n', expr: '(-1)^n/n' },
    { name: '(1 + 1/n)ⁿ → e', expr: '(1 + 1/n)^n' },
    { name: 'n/(n + 1)', expr: 'n/(n + 1)' },
    { name: 'sin(n)/n', expr: 'sin(n)/n' },
    { name: '√(n+1) − √n', expr: 'sqrt(n + 1) - sqrt(n)' },
    { name: 'n^(1/n)', expr: 'n^(1/n)' },
    { name: '(−1)ⁿ (diverges)', expr: '(-1)^n' },
    { name: 'Custom', expr: null }
  ];

  let plot, se, sc;
  let compiled = null;
  let lastChanged = null;

  const a = n => compiled.fn({ n });

  function limit() {
    const x = a(1e6), y = a(1e6 + 1), z = a(1e7);
    if (!isFinite(x) || Math.abs(x - y) > 1e-4 || Math.abs(x - z) > 1e-3) return null;
    return z;
  }

  function findN(L, eps) {
    let last = 0;
    for (let n = 1; n <= 20000; n++) {
      if (!(Math.abs(a(n) - L) < eps)) last = n;
    }
    return last >= 20000 ? null : last + 1;
  }

  function draw() {
    const count = sc.value, eps = se.value;
    const L = limit();
    const N = L === null ? null : findN(L, eps);

    let lo = Infinity, hi = -Infinity;
    for (let n = 1; n <= count; n++) {
      const v = a(n);
      if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    }
    if (L !== null) { lo = Math.min(lo, L - eps); hi = Math.max(hi, L + eps); }
    const pad = (hi - lo) * 0.12 || 1;
    plot.bounds = { xmin: -count * 0.04, xmax: count * 1.04, ymin: lo - pad, ymax: hi + pad };
    const v = plot.visible();

    plot.begin();
    plot.grid({ step: niceStep(count / 8), ystep: niceStep((hi - lo + 2 * pad) / 6), labelEvery: 1 });

    if (L !== null) {
      plot.rect(v.xmin, L - eps, v.xmax, L + eps, 'rgba(233, 196, 106, 0.12)');
      plot.line(v.xmin, L + eps, v.xmax, L + eps, 'rgba(233, 196, 106, 0.6)', 1, [5, 4]);
      plot.line(v.xmin, L - eps, v.xmax, L - eps, 'rgba(233, 196, 106, 0.6)', 1, [5, 4]);
      plot.line(v.xmin, L, v.xmax, L, COLORS.creamDim, 1);
    }
    if (N !== null && N <= count) {
      plot.line(N - 0.5, v.ymin, N - 0.5, v.ymax, COLORS.white, 1, [3, 3]);
      const top = plot.toWorld(0, 40).y;
      plot.text(` N = ${N}`, N - 0.5, top, COLORS.white, 'left', 'top', '12px "IBM Plex Mono", monospace');
    }

    const r = count > 120 ? 2 : 3;
    for (let n = 1; n <= count; n++) {
      const y = a(n);
      if (!isFinite(y)) continue;
      const inside = L !== null && N !== null && n >= N;
      plot.line(n, L !== null ? L : 0, n, y, inside ? 'rgba(233, 196, 106, 0.25)' : 'rgba(239, 230, 207, 0.12)', 1);
      plot.dot(n, y, r, inside ? COLORS.yellow : COLORS.cream);
    }

    el('seqReadout').innerHTML = L === null ? 'no limit' : `L = <b>${num(L, 4)}</b> &nbsp; N = <b>${N === null ? '—' : N}</b>`;
    return { L, N };
  }

  function equations(L, N) {
    const eps = se.value;
    const E = lastChanged === 'eps';
    tex('seqFormula', `a_n = ${toTex(compiled.tree)}, \\qquad \\lim_{n \\to \\infty} a_n = ${L === null ? '\\text{doesn’t exist}' : num(L, 4)}`, true);

    tex('seqDef',
      `\\forall\\, ${hl('\\varepsilon', E)} > 0\\ \\exists\\, N :\\ n \\ge N \\implies |a_n - L| < ${hl('\\varepsilon', E)}` +
      (L !== null && N !== null ? `\\\\[6pt] ${hl(`\\varepsilon = ${fmt(eps, 3)}`, E)} \\;\\Rightarrow\\; N = ${N}` : ''), true);

    let msg;
    if (L === null) {
      msg = '<strong>This sequence doesn’t converge.</strong> It keeps jumping between values, so no band of width 2ε around a single number can hold it forever.';
    } else if (N === null) {
      msg = '<strong>Very slow.</strong> It converges, but it takes more than 20,000 terms to stay within this ε.';
    } else {
      msg = `<strong>From term ${N} on</strong>, every aₙ is within ${num(eps, 3)} of ${num(L, 4)}.`;
    }
    el('seqVerdict').innerHTML = msg;

    let rows = '<tr><th>ε</th><th style="text-align:right">N</th></tr>';
    if (L !== null) {
      for (const e of [0.5, 0.1, 0.05, 0.01, 0.005, 0.001]) {
        const n = findN(L, e);
        rows += `<tr class="row${Math.abs(e - eps) < 1e-9 ? ' active' : ''}"><td class="n" style="text-align:left">${e}</td><td class="n">${n === null ? '> 20000' : n}</td></tr>`;
      }
    }
    el('seqTable').innerHTML = rows;
  }

  function update() {
    if (!compiled) return;
    const { L, N } = draw();
    equations(L, N);
  }

  function loadPreset(i) {
    const p = presets[i];
    if (!p.expr) return;
    el('seqExpr').value = p.expr;
    compiled = compileOrShow(p.expr, ['n'], 'seqExpr', 'seqError');
  }

  function init() {
    plot = new Plot2D(el('seqCanvas'), { xmin: 0, xmax: 60, ymin: -1, ymax: 1 }, { equal: false, onResize: update });
    se = slider('seqEps', () => { lastChanged = 'eps'; update(); }, 3);
    sc = slider('seqCount', update, 0);
    const sel = el('seqPreset');
    presets.forEach((p, i) => sel.add(new Option(p.name, i)));
    sel.addEventListener('change', () => { lastChanged = null; loadPreset(+sel.value); update(); });
    el('seqExpr').addEventListener('input', e => {
      sel.value = presets.length - 1;
      const c = compileOrShow(e.target.value, ['n'], 'seqExpr', 'seqError');
      if (c) { compiled = c; update(); }
    });
    loadPreset(0);
    update();
  }

  return { init };
})();

// ===================================================================
// riemann / darboux sums
// ===================================================================

const riemannMode = (() => {
  const el = id => document.getElementById(id);
  const presets = [
    { name: 'x²', expr: 'x^2', a: 0, b: 2 },
    { name: 'sin(x) + 1.5', expr: 'sin(x) + 1.5', a: 0, b: 4 },
    { name: 'Bell curve', expr: 'exp(-x^2)', a: -2, b: 2 },
    { name: '√x', expr: 'sqrt(x)', a: 0, b: 4 },
    { name: 'Cubic', expr: 'x^3 - 2x', a: -1.5, b: 2 },
    { name: 'Custom', expr: null }
  ];

  let plot, gap, sn, sa, sb;
  let compiled = null;
  let lastChanged = null;
  const f = x => compiled.fn({ x });

  const sumType = () => document.querySelector('input[name="sumType"]:checked').value;

  function pieces(a, b, n) {
    const out = [];
    const dx = (b - a) / n;
    for (let i = 0; i < n; i++) {
      const x0 = a + i * dx, x1 = x0 + dx;
      let lo = Infinity, hi = -Infinity;
      const k = 24;
      for (let s = 0; s <= k; s++) {
        const y = f(x0 + (dx * s) / k);
        if (isFinite(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
      }
      out.push({ x0, x1, lo, hi, left: f(x0), right: f(x1), mid: f((x0 + x1) / 2) });
    }
    return out;
  }

  function sums(a, b, n) {
    const p = pieces(a, b, n);
    const dx = (b - a) / n;
    const total = key => p.reduce((s, q) => s + q[key] * dx, 0);
    return { p, L: total('lo'), U: total('hi'), left: total('left'), right: total('right'), mid: total('mid') };
  }

  function integral(a, b) {
    const n = 2000;
    const h = (b - a) / n;
    let s = f(a) + f(b);
    for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
    return (s * h) / 3;
  }

  function draw(S) {
    const a = sa.value, b = sb.value;
    let lo = 0, hi = 0;
    for (let i = 0; i <= 200; i++) {
      const y = f(a + ((b - a) * i) / 200);
      if (isFinite(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
    }
    const padY = (hi - lo) * 0.15 || 1, padX = (b - a) * 0.12 || 1;
    plot.bounds = { xmin: a - padX, xmax: b + padX, ymin: lo - padY, ymax: hi + padY };

    plot.begin();
    plot.grid({ labelEvery: 1, step: niceStep((b - a + 2 * padX) / 8), ystep: niceStep((hi - lo + 2 * padY) / 6) });
    const type = sumType();
    const thin = S.p.length > 60;
    const edge = thin ? null : 'rgba(29, 29, 29, 0.8)';
    for (const q of S.p) {
      if (type === 'darboux') {
        plot.rect(q.x0, 0, q.x1, q.hi, 'rgba(239, 230, 207, 0.16)', edge);
        plot.rect(q.x0, 0, q.x1, q.lo, 'rgba(233, 196, 106, 0.45)', edge);
      } else {
        plot.rect(q.x0, 0, q.x1, q[type], 'rgba(233, 196, 106, 0.4)', edge);
        const x = type === 'left' ? q.x0 : type === 'right' ? q.x1 : (q.x0 + q.x1) / 2;
        if (!thin) plot.dot(x, q[type], 2.5, COLORS.yellowBright);
      }
    }
    plot.graph(f, COLORS.white, 2, a - padX, b + padX);
    plot.line(a, plot.visible().ymin, a, plot.visible().ymax, 'rgba(239, 230, 207, 0.25)', 1, [3, 3]);
    plot.line(b, plot.visible().ymin, b, plot.visible().ymax, 'rgba(239, 230, 207, 0.25)', 1, [3, 3]);

    el('riemannReadout').innerHTML = `n = <b>${S.p.length}</b> &nbsp; Δx = <b>${fmt((b - a) / S.p.length, 3)}</b>`;
  }

  function drawGap() {
    const a = sa.value, b = sb.value;
    const n = sn.value;
    const data = [];
    let max = 0;
    for (let k = 1; k <= 100; k++) {
      const s = sums(a, b, k);
      data.push({ x: k, y: s.U - s.L });
      max = Math.max(max, s.U - s.L);
    }
    gap.bounds = { xmin: -4, xmax: 104, ymin: -max * 0.1, ymax: max * 1.15 || 1 };
    gap.begin();
    gap.line(0, 0, 100, 0, COLORS.axis, 1);
    gap.path(data, COLORS.creamDim, 1.5);
    gap.dot(n, data[n - 1].y, 4.5, COLORS.yellow);
    gap.text('U − L', 1, max * 1.1, COLORS.muted, 'left', 'top', '11px "IBM Plex Sans", sans-serif');
    gap.text('n →', 100, 0, COLORS.muted, 'right', 'bottom', '11px "IBM Plex Sans", sans-serif');
  }

  function equations(S) {
    const a = sa.value, b = sb.value, n = sn.value;
    const I = integral(a, b);
    const N = lastChanged === 'n';
    const type = sumType();
    if (type === 'darboux') {
      tex('riemannDef',
        `\\underbrace{\\sum_{i=1}^{${hl(n, N)}} m_i\\,\\Delta x}_{L = ${fmt(S.L, 4)}} \\;\\le\\; \\int_{${fmt(a)}}^{${fmt(b)}} f(x)\\,dx \\;\\le\\; \\underbrace{\\sum_{i=1}^{${hl(n, N)}} M_i\\,\\Delta x}_{U = ${fmt(S.U, 4)}}`, true);
      el('riemannStats').innerHTML =
        `<div><span>lower L</span><b>${fmt(S.L, 4)}</b></div>` +
        `<div><span>integral</span><b>${fmt(I, 4)}</b></div>` +
        `<div><span>upper U</span><b>${fmt(S.U, 4)}</b></div>` +
        `<div><span>gap U − L</span><b class="${S.U - S.L < 0.01 ? 'yes' : ''}">${fmt(S.U - S.L, 4)}</b></div>`;
    } else {
      const point = { left: 'x_{i-1}', right: 'x_i', mid: '\\tfrac{x_{i-1} + x_i}{2}' }[type];
      tex('riemannDef',
        `\\sum_{i=1}^{${hl(n, N)}} f\\!\\left(${point}\\right)\\Delta x = ${fmt(S[type], 4)} \\;\\approx\\; \\int_{${fmt(a)}}^{${fmt(b)}} f(x)\\,dx = ${fmt(I, 4)}`, true);
      el('riemannStats').innerHTML =
        `<div><span>${type} sum</span><b>${fmt(S[type], 4)}</b></div>` +
        `<div><span>integral</span><b>${fmt(I, 4)}</b></div>` +
        `<div><span>error</span><b>${fmt(Math.abs(S[type] - I), 4)}</b></div>`;
    }
  }

  function update() {
    if (!compiled) return;
    if (sb.value <= sa.value + 0.05) sb.value = sa.value + 0.5;
    const S = sums(sa.value, sb.value, sn.value);
    draw(S);
    drawGap();
    equations(S);
  }

  function loadPreset(i) {
    const p = presets[i];
    if (!p.expr) return;
    el('riemannExpr').value = p.expr;
    compiled = compileOrShow(p.expr, ['x'], 'riemannExpr', 'riemannError');
    sa.value = p.a;
    sb.value = p.b;
  }

  function init() {
    plot = new Plot2D(el('riemannCanvas'), { xmin: -1, xmax: 3, ymin: -1, ymax: 4 }, { equal: false, onResize: update });
    gap = new Plot2D(el('gapCanvas'), { xmin: 0, xmax: 100, ymin: 0, ymax: 1 }, { equal: false, onResize: update });
    sn = slider('riemannN', () => { lastChanged = 'n'; update(); }, 0);
    sa = slider('riemannA', () => { lastChanged = 'a'; update(); });
    sb = slider('riemannB', () => { lastChanged = 'b'; update(); });
    const sel = el('riemannPreset');
    presets.forEach((p, i) => sel.add(new Option(p.name, i)));
    sel.addEventListener('change', () => { loadPreset(+sel.value); update(); });
    el('riemannExpr').addEventListener('input', e => {
      sel.value = presets.length - 1;
      const c = compileOrShow(e.target.value, ['x'], 'riemannExpr', 'riemannError');
      if (c) { compiled = c; update(); }
    });
    document.querySelectorAll('input[name="sumType"]').forEach(r => r.addEventListener('change', update));
    loadPreset(0);
    update();
  }

  return { init };
})();

// ===================================================================
// uniform convergence
// ===================================================================

const uniformMode = (() => {
  const el = id => document.getElementById(id);
  const presets = [
    { name: 'xⁿ on [0, 1]', fn: 'x^n', tex: 'x^n', lim: x => (x < 1 ? 0 : 1), limTex: '\\begin{cases} 0 & 0 \\le x < 1 \\\\ 1 & x = 1 \\end{cases}', box: [0, 1, -0.15, 1.15] },
    { name: 'xⁿ on [0, 0.9]', fn: 'x^n', tex: 'x^n', lim: () => 0, limTex: '0', box: [0, 0.9, -0.15, 1.15] },
    { name: 'sin(nx)/n', fn: 'sin(n*x)/n', tex: '\\frac{\\sin(nx)}{n}', lim: () => 0, limTex: '0', box: [0, 6.283, -1.1, 1.1] },
    { name: 'nx·e^(−nx)', fn: 'n*x*exp(-n*x)', tex: 'nx\\,e^{-nx}', lim: () => 0, limTex: '0', box: [0, 3, -0.1, 0.6] },
    { name: 'x/(1 + nx²)', fn: 'x/(1 + n*x^2)', tex: '\\frac{x}{1 + nx^2}', lim: () => 0, limTex: '0', box: [-2, 2, -0.8, 0.8] },
    { name: '√(x² + 1/n) → |x|', fn: 'sqrt(x^2 + 1/n)', tex: '\\sqrt{x^2 + \\tfrac{1}{n}}', lim: x => Math.abs(x), limTex: '|x|', box: [-1, 1, -0.1, 1.6] },
    { name: 'A moving spike', fn: 'n*x*(1 - x^2)^n', tex: 'nx(1 - x^2)^n', lim: () => 0, limTex: '0', box: [0, 1, -0.2, 3.5] }
  ];

  let plot, sup, sn, se;
  let preset = presets[0];
  let fnc = null;

  const fn = (x, n) => fnc.fn({ x, n });

  function supNorm(n) {
    const [a, b] = preset.box;
    let best = 0, at = a;
    const k = 800;
    const xs = [];
    for (let i = 0; i <= k; i++) xs.push(a + ((b - a) * i) / k);
    // the interesting stuff often piles up at the ends for big n, so look closer there
    for (let e = 1; e <= 8; e += 0.25) {
      xs.push(a + (b - a) * Math.pow(10, -e), b - (b - a) * Math.pow(10, -e));
    }
    for (const x of xs) {
      const d = Math.abs(fn(x, n) - preset.lim(x));
      if (isFinite(d) && d > best) { best = d; at = x; }
    }
    return { value: best, at };
  }

  function draw() {
    const n = sn.value, eps = se.value;
    const [a, b, ylo, yhi] = preset.box;
    const pad = (b - a) * 0.06;
    plot.bounds = { xmin: a - pad, xmax: b + pad, ymin: ylo, ymax: yhi };
    plot.begin();
    plot.grid({ labelEvery: 1, step: niceStep((b - a) / 6), ystep: niceStep((yhi - ylo) / 5) });

    if (el('uniformTube').checked) {
      // tube f +- eps as a filled band, broken at jumps
      const ctx = plot.ctx;
      const k = 300;
      ctx.fillStyle = 'rgba(233, 196, 106, 0.12)';
      for (let i = 0; i < k; i++) {
        const x0 = a + ((b - a) * i) / k, x1 = a + ((b - a) * (i + 1)) / k;
        const y0 = preset.lim(x0), y1 = preset.lim(x1);
        if (Math.abs(y1 - y0) > 0.5) continue;
        const p = [plot.toScreen(x0, y0 + eps), plot.toScreen(x1, y1 + eps), plot.toScreen(x1, y1 - eps), plot.toScreen(x0, y0 - eps)];
        ctx.beginPath();
        ctx.moveTo(p[0].x, p[0].y);
        p.slice(1).forEach(q => ctx.lineTo(q.x, q.y));
        ctx.closePath();
        ctx.fill();
      }
    }

    if (el('uniformTrail').checked) {
      for (let k = 1; k < n; k++) plot.graph(x => fn(x, k), 'rgba(239, 230, 207, 0.14)', 1, a, b);
    }

    // the limit function
    plot.graph(preset.lim, COLORS.white, 2, a, b);
    if (preset.name.startsWith('xⁿ on [0, 1]')) {
      plot.dot(1, 0, 4, COLORS.bg, COLORS.white);
      plot.dot(1, 1, 4, COLORS.white);
    }

    plot.graph(x => fn(x, n), COLORS.yellowBright, 2.5, a, b);

    const s = supNorm(n);
    const y0 = preset.lim(s.at), y1 = fn(s.at, n);
    plot.line(s.at, y0, s.at, y1, COLORS.white, 1.5, [3, 3]);
    plot.text('sup', s.at, (y0 + y1) / 2, COLORS.white, 'left', 'middle', '12px "IBM Plex Mono", monospace');

    el('uniformReadout').innerHTML = `n = <b>${n}</b> &nbsp; sup |fₙ − f| = <b>${fmt(s.value, 3)}</b>`;
    return s;
  }

  function drawSup() {
    const n = sn.value, eps = se.value;
    const data = [];
    let max = eps;
    for (let k = 1; k <= 60; k++) {
      const v = supNorm(k).value;
      data.push({ x: k, y: v });
      max = Math.max(max, v);
    }
    sup.bounds = { xmin: -2, xmax: 62, ymin: -max * 0.1, ymax: max * 1.15 };
    sup.begin();
    sup.line(0, 0, 60, 0, COLORS.axis, 1);
    sup.line(0, eps, 60, eps, 'rgba(233, 196, 106, 0.6)', 1, [5, 4]);
    sup.text('ε', 60, eps, COLORS.yellow, 'right', 'bottom', '12px "IBM Plex Mono", monospace');
    sup.path(data, COLORS.creamDim, 1.5);
    data.forEach(d => sup.dot(d.x, d.y, 1.8, d.y < eps ? COLORS.yellow : COLORS.cream));
    sup.dot(n, data[n - 1].y, 5, COLORS.yellow, COLORS.bg);
    sup.text('n →', 60, 0, COLORS.muted, 'right', 'top', '11px "IBM Plex Sans", sans-serif');
  }

  function equations(s) {
    const n = sn.value, eps = se.value;
    tex('uniformFormula', `f_n(x) = ${preset.tex} \\;\\longrightarrow\\; f(x) = ${preset.limTex}`, true);
    tex('uniformDefs',
      `\\begin{aligned} &\\text{pointwise:} && ${hl('\\forall x')}\\ \\forall \\varepsilon > 0\\ \\exists N:\\ n \\ge N \\Rightarrow |f_n(x) - f(x)| < \\varepsilon \\\\ ` +
      `&\\text{uniform:} && \\forall \\varepsilon > 0\\ \\exists N:\\ n \\ge N \\Rightarrow |f_n(x) - f(x)| < \\varepsilon\\ ${hl('\\forall x')} \\end{aligned}`, true);
    tex('uniformSup', `\\lVert f_{${n}} - f \\rVert_\\infty = \\sup_x |f_{${n}}(x) - f(x)| = ${fmt(s.value, 4)} ${s.value < eps ? '<' : '\\ge'} \\varepsilon = ${fmt(eps)}`, true);

    const far = supNorm(2000).value;
    let msg;
    if (far < 0.02) {
      let N = null;
      for (let k = 1; k <= 2000; k++) if (supNorm(k).value < eps) { N = k; break; }
      msg = `<strong>Uniform.</strong> The biggest gap goes to 0, so for ε = ${fmt(eps)} every f<sub>n</sub> with n ≥ ${N} sits inside the tube.`;
    } else if (far > 2 * supNorm(30).value) {
      msg = `<strong>Pointwise, not uniform.</strong> Every single x goes to 0, yet the spike gets taller as it squeezes toward the edge (about ${fmt(far, 1)} by n = 2000). The functions converge, but not together.`;
    } else {
      msg = `<strong>Pointwise, not uniform.</strong> Each x settles down eventually, but the biggest gap stays near ${fmt(far, 2)} however large n gets. Some part of f<sub>n</sub> always sticks out of a thin tube.`;
    }
    el('uniformVerdict').innerHTML = msg;
  }

  function update() {
    if (!fnc) return;
    const s = draw();
    drawSup();
    equations(s);
  }

  function init() {
    plot = new Plot2D(el('uniformCanvas'), { xmin: 0, xmax: 1, ymin: 0, ymax: 1 }, { equal: false, onResize: update });
    sup = new Plot2D(el('supCanvas'), { xmin: 0, xmax: 60, ymin: 0, ymax: 1 }, { equal: false, onResize: update });
    sn = slider('uniformN', update, 0);
    se = slider('uniformEps', update);
    const sel = el('uniformPreset');
    presets.forEach((p, i) => sel.add(new Option(p.name, i)));
    const load = i => { preset = presets[i]; fnc = compileExpr(preset.fn, ['x', 'n']); };
    sel.addEventListener('change', () => { load(+sel.value); update(); });
    ['uniformTrail', 'uniformTube'].forEach(id => el(id).addEventListener('change', update));
    load(0);
    update();
  }

  return { init };
})();

// ===================================================================

const started = {};
const modes = { limits: limitMode, sequences: seqMode, riemann: riemannMode, uniform: uniformMode };
modeTabs('modes', key => {
  if (!started[key]) {
    started[key] = true;
    requestAnimationFrame(() => modes[key].init());
  }
});
