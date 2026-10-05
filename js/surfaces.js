// 3d surfaces page: graphs of f(x, y), bezier patches, triple integrals

const CREAM = [239, 230, 207];
const YELLOW = [233, 196, 106];

// ===================================================================
// graphs z = f(x, y)
// ===================================================================

const graphMode = (() => {
  const presets = [
    { name: 'Paraboloid', expr: 'a*x^2 + b*y^2', a: 0.4, b: 0.4 },
    { name: 'Saddle', expr: 'a*x^2 - b*y^2', a: 0.4, b: 0.4 },
    { name: 'Ripple', expr: 'a*cos(b*sqrt(x^2 + y^2))', a: 1, b: 2 },
    { name: 'Bump', expr: 'a*exp(-b*(x^2 + y^2))', a: 2.5, b: 0.6 },
    { name: 'Egg crate', expr: 'a*sin(b*x)*cos(b*y)', a: 1, b: 1.2 },
    { name: 'Monkey saddle', expr: 'a*(x^3 - 3x*y^2)', a: 0.15, b: 0 },
    { name: 'Two hills', expr: 'a*exp(-(x - 1)^2 - y^2) + b*exp(-(x + 1)^2 - y^2)', a: 2, b: -1.5 },
    { name: 'Custom', expr: null }
  ];

  const N = 40;
  const DOMAIN = 3;
  const ZCLIP = 4;

  const el = id => document.getElementById(id);
  const toggles = {
    plane: el('showPlane'),
    traces: el('showTraces'),
    contours: el('showContours'),
    gradient: el('showGradient'),
    mesh: el('showMesh')
  };

  let view = null;
  let compiled = null;
  let lastChanged = null;
  let sliders = {};

  function f(x, y) {
    return compiled.fn({ x, y, a: sliders.a.value, b: sliders.b.value });
  }

  function derivatives(x, y) {
    const h = 1e-4;
    const h2 = 1e-3;
    const f0 = f(x, y);
    return {
      f0,
      fx: (f(x + h, y) - f(x - h, y)) / (2 * h),
      fy: (f(x, y + h) - f(x, y - h)) / (2 * h),
      fxx: (f(x + h2, y) - 2 * f0 + f(x - h2, y)) / (h2 * h2),
      fyy: (f(x, y + h2) - 2 * f0 + f(x, y - h2)) / (h2 * h2),
      fxy: (f(x + h2, y + h2) - f(x + h2, y - h2) - f(x - h2, y + h2) + f(x - h2, y - h2)) / (4 * h2 * h2)
    };
  }

  function setExpr(src) {
    try {
      compiled = compileExpr(src, ['x', 'y', 'a', 'b']);
      const test = f(0.3, 0.7);
      if (typeof test !== 'number') throw new Error('not a number');
      el('graphExpr').classList.remove('bad');
      el('graphError').textContent = '';
      return true;
    } catch (err) {
      el('graphExpr').classList.add('bad');
      el('graphError').textContent = err.message;
      return false;
    }
  }

  // level curves with marching squares, returns a list of segments in (x, y)
  function contours(grid, levels) {
    const segs = [];
    const step = (2 * DOMAIN) / N;
    for (const L of levels) {
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const z = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
          if (z.some(v => !isFinite(v))) continue;
          const x0 = -DOMAIN + i * step, y0 = -DOMAIN + j * step;
          const corners = [[x0, y0], [x0 + step, y0], [x0 + step, y0 + step], [x0, y0 + step]];
          const pts = [];
          for (let e = 0; e < 4; e++) {
            const a = z[e], b = z[(e + 1) % 4];
            if ((a < L) !== (b < L)) {
              const t = (L - a) / (b - a);
              const ca = corners[e], cb = corners[(e + 1) % 4];
              pts.push({ x: ca[0] + (cb[0] - ca[0]) * t, y: ca[1] + (cb[1] - ca[1]) * t });
            }
          }
          if (pts.length >= 2) segs.push([pts[0], pts[1]]);
          if (pts.length === 4) segs.push([pts[2], pts[3]]);
        }
      }
    }
    return segs;
  }

  function build() {
    const x0 = sliders.x0.value, y0 = sliders.y0.value, theta = sliders.theta.value;
    const step = (2 * DOMAIN) / N;

    // heights on the grid
    const grid = [];
    let zlo = Infinity, zhi = -Infinity;
    for (let i = 0; i <= N; i++) {
      const row = [];
      for (let j = 0; j <= N; j++) {
        let z = f(-DOMAIN + i * step, -DOMAIN + j * step);
        if (!isFinite(z)) z = NaN;
        else { zlo = Math.min(zlo, clamp(z, -ZCLIP, ZCLIP)); zhi = Math.max(zhi, clamp(z, -ZCLIP, ZCLIP)); }
        row.push(z);
      }
      grid.push(row);
    }
    if (!isFinite(zlo)) { zlo = -1; zhi = 1; }
    if (zhi - zlo < 1e-6) { zlo -= 0.5; zhi += 0.5; }
    const floor = Math.min(zlo, 0) - 0.8;

    view.clear();

    // floor square
    const c = [[-DOMAIN, -DOMAIN], [DOMAIN, -DOMAIN], [DOMAIN, DOMAIN], [-DOMAIN, DOMAIN]].map(([x, y]) => ({ x, y, z: floor }));
    for (let k = 0; k < 4; k++) view.line(c[k], c[(k + 1) % 4], 'rgba(239, 230, 207, 0.25)', 1, { pieces: 6 });
    view.label({ x: DOMAIN + 0.3, y: 0, z: floor }, 'x', COLORS.cream);
    view.label({ x: 0, y: DOMAIN + 0.3, z: floor }, 'y', COLORS.cream);
    view.line({ x: 0, y: 0, z: floor }, { x: 0, y: 0, z: zhi + 0.6 }, 'rgba(239, 230, 207, 0.25)', 1, { pieces: 8 });
    view.label({ x: 0, y: 0, z: zhi + 0.7 }, 'z', COLORS.cream);

    // the surface
    const mesh = toggles.mesh.checked;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const zs = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
        if (zs.some(z => !isFinite(z))) continue;
        const xa = -DOMAIN + i * step, ya = -DOMAIN + j * step;
        const q = [
          { x: xa, y: ya, z: zs[0] }, { x: xa + step, y: ya, z: zs[1] },
          { x: xa + step, y: ya + step, z: zs[2] }, { x: xa, y: ya + step, z: zs[3] }
        ];
        // cut the quad off at the top and bottom so steep surfaces get a clean edge
        const clipped = clipZ(clipZ(q, ZCLIP, 1), -ZCLIP, -1);
        if (clipped.length < 3) continue;
        const avg = clipped.reduce((s, p) => s + p.z, 0) / clipped.length;
        const color = rampColor(0.15 + 0.85 * (avg - zlo) / (zhi - zlo));
        view.poly(clipped, color, mesh ? { stroke: 'rgba(29, 29, 29, 0.6)' } : {});
      }
    }

    const d = derivatives(x0, y0);
    const P = { x: x0, y: y0, z: d.f0 };

    if (toggles.contours.checked) {
      const levels = [];
      for (let k = 1; k < 12; k++) levels.push(zlo + ((zhi - zlo) * k) / 12);
      for (const [a, b] of contours(grid, levels)) {
        view.line({ x: a.x, y: a.y, z: floor }, { x: b.x, y: b.y, z: floor }, 'rgba(239, 230, 207, 0.35)', 1);
      }
      // the level curve through the point
      for (const [a, b] of contours(grid, [d.f0])) {
        view.line({ x: a.x, y: a.y, z: floor }, { x: b.x, y: b.y, z: floor }, COLORS.yellow, 1.8);
      }
    }

    if (toggles.traces.checked) {
      const tx = [], ty = [];
      for (let s = 0; s <= 120; s++) {
        const u = -DOMAIN + (2 * DOMAIN * s) / 120;
        const zx = f(u, y0), zy = f(x0, u);
        tx.push(isFinite(zx) && Math.abs(zx) <= ZCLIP ? { x: u, y: y0, z: zx } : null);
        ty.push(isFinite(zy) && Math.abs(zy) <= ZCLIP ? { x: x0, y: u, z: zy } : null);
      }
      view.polyline(tx, COLORS.white, 2, { bias: 0.08 });
      view.polyline(ty, COLORS.white, 2, { bias: 0.08 });
      // tangent lines along the traces, their slopes are f_x and f_y
      const L = 0.9;
      view.line({ x: x0 - L, y: y0, z: d.f0 - L * d.fx }, { x: x0 + L, y: y0, z: d.f0 + L * d.fx }, COLORS.yellow, 2, { pieces: 4, top: true });
      view.line({ x: x0, y: y0 - L, z: d.f0 - L * d.fy }, { x: x0, y: y0 + L, z: d.f0 + L * d.fy }, COLORS.yellow, 2, { pieces: 4, top: true });
    }

    if (toggles.plane.checked) {
      const s = 1.1, m = 4;
      for (let i = 0; i < m; i++) {
        for (let j = 0; j < m; j++) {
          const quad = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, b]) => {
            const dx = -s + (2 * s * a) / m, dy = -s + (2 * s * b) / m;
            return { x: x0 + dx, y: y0 + dy, z: d.f0 + d.fx * dx + d.fy * dy };
          });
          view.poly(quad, YELLOW, { alpha: 0.38, shade: false, stroke: 'rgba(233, 196, 106, 0.5)' });
        }
      }
    }

    // the point and its shadow on the floor
    view.line(P, { x: x0, y: y0, z: floor }, 'rgba(239, 230, 207, 0.5)', 1, { dash: [3, 3], pieces: 6 });
    view.point({ x: x0, y: y0, z: floor }, 3, COLORS.cream);
    view.point(P, 5, COLORS.yellow, { stroke: '#1d1d1d', top: true });

    if (toggles.gradient.checked) {
      const g = Math.hypot(d.fx, d.fy);
      const k = g > 1.6 ? 1.6 / g : 1;
      const base = { x: x0, y: y0, z: floor };
      view.arrow(base, { x: d.fx * k, y: d.fy * k, z: 0 }, COLORS.yellow, 2.5);
      view.label({ x: x0 + d.fx * k, y: y0 + d.fy * k, z: floor }, '∇f', COLORS.yellow, { dx: 6 });
      view.arrow(base, { x: Math.cos(theta), y: Math.sin(theta), z: 0 }, COLORS.white, 1.5);
      view.label({ x: x0 + Math.cos(theta), y: y0 + Math.sin(theta), z: floor }, 'u', COLORS.white, { dx: 6 });
    }

    view.draw();
    equations(d);
  }

  // keeps the part of a polygon with z below c (side 1) or above c (side -1)
  function clipZ(poly, c, side) {
    const inside = p => side * (c - p.z) >= 0;
    const out = [];
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length];
      if (inside(a)) out.push(a);
      if (inside(a) !== inside(b)) out.push(mix(a, b, (c - a.z) / (b.z - a.z)));
    }
    return out;
  }

  function signed(v, digits = 2) {
    return v < 0 ? `- ${fmt(-v, digits)}` : `+ ${fmt(v, digits)}`;
  }

  function shift(name, v) {
    // (x - 1.00) or (x + 1.00)
    return `(${name} ${signed(-v)})`;
  }

  function equations(d) {
    const a = sliders.a.value, b = sliders.b.value;
    const x0 = sliders.x0.value, y0 = sliders.y0.value, theta = sliders.theta.value;
    const pt = lastChanged === 'x0' || lastChanged === 'y0';
    const P = hl(`(${fmt(x0)}, ${fmt(y0)})`, pt);

    tex('graphFormula', `f(x, y) = ${toTex(compiled.tree, { a, b }, lastChanged)}`, true);

    tex('graphPartials',
      `f_x${P} = ${fmt(d.fx)} \\qquad f_y${P} = ${fmt(d.fy)}`, true);
    tex('graphGradient',
      `\\nabla f = \\langle f_x, f_y \\rangle = \\langle ${fmt(d.fx)}, ${fmt(d.fy)} \\rangle, \\quad \\lVert \\nabla f \\rVert = ${fmt(Math.hypot(d.fx, d.fy))}`, true);

    tex('graphPlane',
      `\\begin{aligned} z &= f(x_0, y_0) + f_x\\,(x - x_0) + f_y\\,(y - y_0) \\\\ ` +
      `z &= ${fmt(d.f0)} ${signed(d.fx)}\\,${hl(shift('x', x0), pt)} ${signed(d.fy)}\\,${hl(shift('y', y0), pt)} \\end{aligned}`, true);

    const ux = Math.cos(theta), uy = Math.sin(theta);
    const th = lastChanged === 'theta';
    tex('graphDirectional',
      `D_{\\mathbf u} f = \\nabla f \\cdot \\mathbf u = \\langle ${fmt(d.fx)}, ${fmt(d.fy)} \\rangle \\cdot ${hl(`\\langle ${fmt(ux)}, ${fmt(uy)} \\rangle`, th)} = ${fmt(d.fx * ux + d.fy * uy)}`, true);

    const D = d.fxx * d.fyy - d.fxy * d.fxy;
    tex('graphHessian',
      `H = \\begin{bmatrix} f_{xx} & f_{xy} \\\\ f_{xy} & f_{yy} \\end{bmatrix} = \\begin{bmatrix} ${fmt(d.fxx)} & ${fmt(d.fxy)} \\\\ ${fmt(d.fxy)} & ${fmt(d.fyy)} \\end{bmatrix}, \\quad D = \\det H = ${fmt(D)}`, true);

    const g = Math.hypot(d.fx, d.fy);
    let msg;
    if (g > 0.03) {
      msg = `∇f is not zero here, so this is not a critical point. <button class="btn" id="findCritical" style="margin-left:6px">find one nearby</button>`;
    } else if (D > 1e-6 && d.fxx > 0) {
      msg = '<strong>Local minimum.</strong> ∇f = 0, D > 0 and f<sub>xx</sub> > 0.';
    } else if (D > 1e-6 && d.fxx < 0) {
      msg = '<strong>Local maximum.</strong> ∇f = 0, D > 0 and f<sub>xx</sub> < 0.';
    } else if (D < -1e-6) {
      msg = '<strong>Saddle point.</strong> ∇f = 0 and D < 0.';
    } else {
      msg = '<strong>Critical point, but D = 0</strong>, so the test can’t tell.';
    }
    el('graphClassify').innerHTML = msg;
    const btn = el('findCritical');
    if (btn) btn.addEventListener('click', findCritical);
  }

  // newton's method on grad f = 0
  function findCritical() {
    let x = sliders.x0.value, y = sliders.y0.value;
    for (let k = 0; k < 40; k++) {
      const d = derivatives(x, y);
      const det = d.fxx * d.fyy - d.fxy * d.fxy;
      if (Math.abs(det) < 1e-9) break;
      const dx = (d.fyy * d.fx - d.fxy * d.fy) / det;
      const dy = (-d.fxy * d.fx + d.fxx * d.fy) / det;
      x -= clamp(dx, -0.5, 0.5);
      y -= clamp(dy, -0.5, 0.5);
      if (Math.hypot(dx, dy) < 1e-7) break;
    }
    if (!isFinite(x) || !isFinite(y) || Math.abs(x) > DOMAIN || Math.abs(y) > DOMAIN) {
      el('graphClassify').innerHTML = 'Newton’s method ran off the edge from here. Try moving the point first.';
      return;
    }
    sliders.x0.value = x;
    sliders.y0.value = y;
    lastChanged = 'x0';
    build();
  }

  function loadPreset(i) {
    const p = presets[i];
    if (!p.expr) return;
    el('graphExpr').value = p.expr;
    sliders.a.value = p.a;
    sliders.b.value = p.b;
    setExpr(p.expr);
  }

  function init() {
    view = new View3D(el('graphCanvas'), { size: 9.5, yaw: -0.65, pitch: 0.55 });
    const select = el('graphPreset');
    presets.forEach((p, i) => select.add(new Option(p.name, i)));

    const changed = key => () => { lastChanged = key; build(); };
    sliders.a = slider('paramA', changed('a'));
    sliders.b = slider('paramB', changed('b'));
    sliders.x0 = slider('pointX', changed('x0'));
    sliders.y0 = slider('pointY', changed('y0'));
    sliders.theta = slider('dirAngle', changed('theta'));

    select.addEventListener('change', () => {
      lastChanged = null;
      loadPreset(+select.value);
      build();
    });
    el('graphExpr').addEventListener('input', e => {
      select.value = presets.length - 1;
      if (setExpr(e.target.value)) build();
    });
    Object.values(toggles).forEach(t => t.addEventListener('change', build));

    loadPreset(0);
    build();
  }

  return { init };
})();

// ===================================================================
// bicubic bezier patch
// ===================================================================

const patchMode = (() => {
  const el = id => document.getElementById(id);
  const xs = [-3, -1, 1, 3];
  let Z = [];
  let sel = { i: 1, j: 2 };
  let view = null;
  let su, sv;

  const shapes = {
    hill: () => xs.map((_, i) => xs.map((_, j) => ((i === 1 || i === 2) && (j === 1 || j === 2) ? 3 : 0))),
    saddle: () => xs.map(x => xs.map(y => (x * x - y * y) / 4)),
    wave: () => xs.map((_, i) => xs.map((_, j) => (i % 2 === 0 ? 1.5 : -1.5) * (j === 0 || j === 3 ? 0.4 : 1))),
    flat: () => xs.map(() => xs.map(() => 0)),
    random: () => xs.map(() => xs.map(() => Math.round((Math.random() * 5 - 2.5) * 4) / 4))
  };

  const b3 = (i, t) => bernstein(3, i, t);

  function surfacePoint(u, v) {
    let z = 0;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) z += b3(i, u) * b3(j, v) * Z[i][j];
    return { x: -3 + 6 * u, y: -3 + 6 * v, z };
  }

  function ctrl(i, j) {
    return { x: xs[i], y: xs[j], z: Z[i][j] };
  }

  function build() {
    const u0 = su.value, v0 = sv.value;
    view.clear();

    // floor + axes
    const floor = Math.min(-0.5, ...Z.flat()) - 0.8;
    const c = [[-3, -3], [3, -3], [3, 3], [-3, 3]].map(([x, y]) => ({ x, y, z: floor }));
    for (let k = 0; k < 4; k++) view.line(c[k], c[(k + 1) % 4], 'rgba(239, 230, 207, 0.22)', 1, { pieces: 6 });
    view.label({ x: 3.4, y: -3, z: floor }, 'u →', COLORS.muted);
    view.label({ x: -3, y: 3.4, z: floor }, 'v →', COLORS.muted);

    let zlo = Infinity, zhi = -Infinity;
    const N = 24;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      pts.push([]);
      for (let j = 0; j <= N; j++) {
        const p = surfacePoint(i / N, j / N);
        pts[i].push(p);
        zlo = Math.min(zlo, p.z);
        zhi = Math.max(zhi, p.z);
      }
    }
    if (zhi - zlo < 1e-6) { zlo -= 1; zhi += 1; }
    const mesh = el('patchMesh').checked;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const q = [pts[i][j], pts[i + 1][j], pts[i + 1][j + 1], pts[i][j + 1]];
        const avg = q.reduce((s, p) => s + p.z, 0) / 4;
        view.poly(q, rampColor(0.15 + 0.85 * (avg - zlo) / (zhi - zlo)), mesh ? { stroke: 'rgba(29, 29, 29, 0.6)' } : {});
      }
    }

    if (el('patchNet').checked) {
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          if (i < 3) view.line(ctrl(i, j), ctrl(i + 1, j), 'rgba(239, 230, 207, 0.55)', 1, { pieces: 3, top: true });
          if (j < 3) view.line(ctrl(i, j), ctrl(i, j + 1), 'rgba(239, 230, 207, 0.55)', 1, { pieces: 3, top: true });
        }
      }
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          const on = i === sel.i && j === sel.j;
          view.point(ctrl(i, j), on ? 6 : 4, on ? COLORS.yellowBright : COLORS.cream, { stroke: '#1d1d1d', top: true });
          if (on) view.label(ctrl(i, j), `P${i}${j}`, COLORS.yellowBright, { dx: 9, dy: -8 });
        }
      }
    }

    if (el('patchIso').checked) {
      const cu = [], cv = [];
      for (let s = 0; s <= 80; s++) {
        cu.push(surfacePoint(u0, s / 80));
        cv.push(surfacePoint(s / 80, v0));
      }
      view.polyline(cu, COLORS.yellow, 2.5, { top: true });
      view.polyline(cv, COLORS.white, 2, { top: true });

      // control points of the u = u0 curve
      const Q = curveControls(u0).map((z, j) => ({ x: -3 + 6 * u0, y: xs[j], z }));
      view.polyline(Q, 'rgba(233, 196, 106, 0.7)', 1, { dash: [4, 4], top: true });
      Q.forEach((q, j) => view.point(q, 3.5, j === sel.j ? COLORS.yellowBright : '#1d1d1d', { stroke: COLORS.yellow, top: true }));
    }

    view.point(surfacePoint(u0, v0), 5.5, COLORS.yellow, { stroke: '#1d1d1d', top: true });
    view.draw();
    equations();
  }

  // Q_j = sum_i b_i(u0) Z_ij
  function curveControls(u0) {
    return [0, 1, 2, 3].map(j => [0, 1, 2, 3].reduce((s, i) => s + b3(i, u0) * Z[i][j], 0));
  }

  function equations() {
    const u0 = su.value, v0 = sv.value;
    tex('patchFormula',
      `S(u, v) = \\sum_{i=0}^{3}\\sum_{j=0}^{3} b_i(u)\\, b_j(v)\\, P_{ij}, \\qquad b_i(u) = \\binom{3}{i}(1-u)^{3-i}u^i`, true);

    const M = bezierMatrix(3).map(r => r.join(' & ')).join(' \\\\ ');
    const Zt = Z.map((row, i) => row.map((z, j) => hl(fmt(z, 1), i === sel.i && j === sel.j)).join(' & ')).join(' \\\\ ');
    tex('patchMatrix',
      `\\begin{gathered} z(u, v) = U\\,M\\,Z\\,M^{\\mathsf T} V^{\\mathsf T} \\\\[6pt] ` +
      `M = \\begin{bmatrix} ${M} \\end{bmatrix} \\qquad Z = \\begin{bmatrix} ${Zt} \\end{bmatrix} \\end{gathered}`, true);

    const p = surfacePoint(u0, v0);
    const bu = [0, 1, 2, 3].map(i => fmt(b3(i, u0), 3)).join(' & ');
    const bv = [0, 1, 2, 3].map(j => fmt(b3(j, v0), 3)).join(' \\\\ ');
    tex('patchValue',
      `z(${fmt(u0)}, ${fmt(v0)}) = \\begin{bmatrix} ${bu} \\end{bmatrix} Z \\begin{bmatrix} ${bv} \\end{bmatrix} = ${fmt(p.z, 3)}`, true);

    const Q = curveControls(u0);
    const qs = Q.map((q, j) => hl(fmt(q), j === sel.j)).join(',\\ ');
    tex('patchCurve',
      `Q_j = \\sum_{i=0}^{3} b_i(${fmt(u0)})\\, Z_{ij} \\;\\Rightarrow\\; (Q_0, Q_1, Q_2, Q_3) = (${qs})` +
      `\\\\[6pt] z(${fmt(u0)}, v) = \\sum_{j=0}^{3} b_j(v)\\, Q_j`, true);
  }

  function pick(pos) {
    let best = -1, bestD = 16;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const s = view.project(ctrl(i, j));
        const d = Math.hypot(s.x - pos.x, s.y - pos.y);
        if (d < bestD) { bestD = d; best = i * 4 + j; }
      }
    }
    if (best === -1 || !el('patchNet').checked) return false;
    sel = { i: Math.floor(best / 4), j: best % 4 };
    build();
    return true;
  }

  function drag(dx, dy) {
    const scale = (Math.min(view.view.width, view.view.height) / view.size) * view.zoom;
    Z[sel.i][sel.j] = clamp(Z[sel.i][sel.j] - dy / (scale * Math.cos(view.pitch) || 1), -4, 4);
    build();
  }

  function init() {
    view = new View3D(el('patchCanvas'), { size: 10, yaw: -0.6, pitch: 0.6, pick, drag });
    su = slider('patchU', build);
    sv = slider('patchV', build);
    Z = shapes.hill();
    document.querySelectorAll('[data-patch]').forEach(b => b.addEventListener('click', () => {
      Z = shapes[b.dataset.patch]();
      build();
    }));
    ['patchNet', 'patchIso', 'patchMesh'].forEach(id => el(id).addEventListener('change', build));
    build();
  }

  return { init };
})();

// ===================================================================
// triple integrals
// ===================================================================

const tripleMode = (() => {
  const el = id => document.getElementById(id);
  const PI = Math.PI;
  const sq = v => Math.sqrt(Math.max(0, v));

  const systems = {
    cart: {
      name: 'rectangular',
      d: 'dz\\,dy\\,dx',
      jac: () => 1,
      jacTex: '',
      toXYZ: (x, y, z) => ({ x, y, z })
    },
    cyl: {
      name: 'cylindrical',
      d: 'dz\\,dr\\,d\\theta',
      jac: (t, r) => r,
      jacTex: 'r',
      toXYZ: (t, r, z) => ({ x: r * Math.cos(t), y: r * Math.sin(t), z }),
      change: 'x = r\\cos\\theta,\\quad y = r\\sin\\theta,\\quad z = z,\\qquad dV = \\textcolor{HL}{r}\\,dz\\,dr\\,d\\theta'
    },
    sph: {
      name: 'spherical',
      d: 'd\\rho\\,d\\phi\\,d\\theta',
      jac: (t, p, r) => r * r * Math.sin(p),
      jacTex: '\\rho^2\\sin\\phi',
      toXYZ: (t, p, r) => ({ x: r * Math.sin(p) * Math.cos(t), y: r * Math.sin(p) * Math.sin(t), z: r * Math.cos(p) }),
      change: 'x = \\rho\\sin\\phi\\cos\\theta,\\quad y = \\rho\\sin\\phi\\sin\\theta,\\quad z = \\rho\\cos\\phi,\\qquad dV = \\textcolor{HL}{\\rho^2\\sin\\phi}\\,d\\rho\\,d\\phi\\,d\\theta'
    }
  };
  systems.cart.change = 'dV = dz\\,dy\\,dx \\quad \\text{(no stretching, the Jacobian is 1)}';

  // each region: limits in each coordinate system, outermost first
  // lim(R) -> [[lo, hi], q1 => [lo, hi], (q1, q2) => [lo, hi]]
  const regions = {
    ball: {
      center: R => 0,
      name: 'Ball',
      desc: 'x^2 + y^2 + z^2 \\le R^2',
      volume: R => (4 / 3) * PI * R ** 3,
      volumeTex: '\\tfrac{4}{3}\\pi R^3',
      cart: {
        lim: R => [[-R, R], x => [-sq(R * R - x * x), sq(R * R - x * x)], (x, y) => [-sq(R * R - x * x - y * y), sq(R * R - x * x - y * y)]],
        tex: ['-R', 'R', '-\\sqrt{R^2-x^2}', '\\sqrt{R^2-x^2}', '-\\sqrt{R^2-x^2-y^2}', '\\sqrt{R^2-x^2-y^2}']
      },
      cyl: {
        lim: R => [[0, 2 * PI], () => [0, R], (t, r) => [-sq(R * R - r * r), sq(R * R - r * r)]],
        tex: ['0', '2\\pi', '0', 'R', '-\\sqrt{R^2-r^2}', '\\sqrt{R^2-r^2}']
      },
      sph: {
        lim: R => [[0, 2 * PI], () => [0, PI], () => [0, R]],
        tex: ['0', '2\\pi', '0', '\\pi', '0', 'R']
      },
      outline: R => {
        const lines = [];
        for (let k = 0; k < 6; k++) {
          const t = (k * PI) / 6;
          lines.push(circle(s => ({ x: R * Math.cos(s) * Math.cos(t), y: R * Math.cos(s) * Math.sin(t), z: R * Math.sin(s) })));
        }
        for (const z of [-0.5, 0, 0.5]) lines.push(circle(s => ({ x: R * Math.sqrt(1 - z * z) * Math.cos(s), y: R * Math.sqrt(1 - z * z) * Math.sin(s), z: R * z })));
        return lines;
      }
    },
    cylinder: {
      center: R => 1,
      name: 'Cylinder',
      desc: 'x^2 + y^2 \\le R^2,\\ 0 \\le z \\le 2',
      volume: R => PI * R * R * 2,
      volumeTex: '2\\pi R^2',
      cart: {
        lim: R => [[-R, R], x => [-sq(R * R - x * x), sq(R * R - x * x)], () => [0, 2]],
        tex: ['-R', 'R', '-\\sqrt{R^2-x^2}', '\\sqrt{R^2-x^2}', '0', '2']
      },
      cyl: {
        lim: R => [[0, 2 * PI], () => [0, R], () => [0, 2]],
        tex: ['0', '2\\pi', '0', 'R', '0', '2']
      },
      outline: R => {
        const lines = [0, 2].map(z => circle(s => ({ x: R * Math.cos(s), y: R * Math.sin(s), z })));
        for (let k = 0; k < 8; k++) {
          const t = (k * PI) / 4;
          lines.push([{ x: R * Math.cos(t), y: R * Math.sin(t), z: 0 }, { x: R * Math.cos(t), y: R * Math.sin(t), z: 2 }]);
        }
        return lines;
      }
    },
    cone: {
      center: R => R / 2,
      name: 'Cone',
      desc: '\\sqrt{x^2 + y^2} \\le z \\le R',
      volume: R => (PI * R ** 3) / 3,
      volumeTex: '\\tfrac{1}{3}\\pi R^3',
      cart: {
        lim: R => [[-R, R], x => [-sq(R * R - x * x), sq(R * R - x * x)], (x, y) => [Math.hypot(x, y), R]],
        tex: ['-R', 'R', '-\\sqrt{R^2-x^2}', '\\sqrt{R^2-x^2}', '\\sqrt{x^2+y^2}', 'R']
      },
      cyl: {
        lim: R => [[0, 2 * PI], () => [0, R], (t, r) => [r, R]],
        tex: ['0', '2\\pi', '0', 'R', 'r', 'R']
      },
      sph: {
        lim: R => [[0, 2 * PI], () => [0, PI / 4], (t, p) => [0, R / Math.cos(p)]],
        tex: ['0', '2\\pi', '0', '\\pi/4', '0', 'R\\sec\\phi']
      },
      outline: R => {
        const lines = [circle(s => ({ x: R * Math.cos(s), y: R * Math.sin(s), z: R }))];
        for (let k = 0; k < 8; k++) {
          const t = (k * PI) / 4;
          lines.push([{ x: 0, y: 0, z: 0 }, { x: R * Math.cos(t), y: R * Math.sin(t), z: R }]);
        }
        return lines;
      }
    },
    icecream: {
      center: R => R / 2,
      name: 'Ice cream cone',
      desc: '\\sqrt{x^2+y^2} \\le z,\\ x^2+y^2+z^2 \\le R^2',
      volume: R => ((2 * PI) / 3) * R ** 3 * (1 - Math.SQRT1_2),
      volumeTex: '\\tfrac{2\\pi}{3}R^3\\left(1 - \\tfrac{\\sqrt 2}{2}\\right)',
      cart: {
        lim: R => {
          const a = R * Math.SQRT1_2;
          return [[-a, a], x => [-sq(a * a - x * x), sq(a * a - x * x)], (x, y) => [Math.hypot(x, y), sq(R * R - x * x - y * y)]];
        },
        tex: ['-\\tfrac{R}{\\sqrt2}', '\\tfrac{R}{\\sqrt2}', '-\\sqrt{\\tfrac{R^2}{2}-x^2}', '\\sqrt{\\tfrac{R^2}{2}-x^2}', '\\sqrt{x^2+y^2}', '\\sqrt{R^2-x^2-y^2}']
      },
      cyl: {
        lim: R => [[0, 2 * PI], () => [0, R * Math.SQRT1_2], (t, r) => [r, sq(R * R - r * r)]],
        tex: ['0', '2\\pi', '0', '\\tfrac{R}{\\sqrt2}', 'r', '\\sqrt{R^2-r^2}']
      },
      sph: {
        lim: R => [[0, 2 * PI], () => [0, PI / 4], () => [0, R]],
        tex: ['0', '2\\pi', '0', '\\pi/4', '0', 'R']
      },
      outline: R => {
        const a = R * Math.SQRT1_2;
        const lines = [circle(s => ({ x: a * Math.cos(s), y: a * Math.sin(s), z: a }))];
        for (let k = 0; k < 8; k++) {
          const t = (k * PI) / 4;
          lines.push([{ x: 0, y: 0, z: 0 }, { x: a * Math.cos(t), y: a * Math.sin(t), z: a }]);
          const arc = [];
          for (let s = 0; s <= 12; s++) {
            const p = (PI / 4) * (s / 12);
            arc.push({ x: R * Math.sin(p) * Math.cos(t), y: R * Math.sin(p) * Math.sin(t), z: R * Math.cos(p) });
          }
          lines.push(arc);
        }
        return lines;
      }
    },
    paraboloid: {
      center: R => R / 2,
      name: 'Paraboloid bowl',
      desc: 'x^2 + y^2 \\le z \\le R',
      volume: R => (PI * R * R) / 2,
      volumeTex: '\\tfrac{1}{2}\\pi R^2',
      cart: {
        lim: R => [[-Math.sqrt(R), Math.sqrt(R)], x => [-sq(R - x * x), sq(R - x * x)], (x, y) => [x * x + y * y, R]],
        tex: ['-\\sqrt R', '\\sqrt R', '-\\sqrt{R-x^2}', '\\sqrt{R-x^2}', 'x^2+y^2', 'R']
      },
      cyl: {
        lim: R => [[0, 2 * PI], () => [0, Math.sqrt(R)], (t, r) => [r * r, R]],
        tex: ['0', '2\\pi', '0', '\\sqrt R', 'r^2', 'R']
      },
      outline: R => {
        const a = Math.sqrt(R);
        const lines = [circle(s => ({ x: a * Math.cos(s), y: a * Math.sin(s), z: R }))];
        for (let k = 0; k < 8; k++) {
          const t = (k * PI) / 4;
          const arc = [];
          for (let s = 0; s <= 16; s++) {
            const r = (a * s) / 16;
            arc.push({ x: r * Math.cos(t), y: r * Math.sin(t), z: r * r });
          }
          lines.push(arc);
        }
        return lines;
      }
    }
  };

  const funcs = {
    one: { name: 'f = 1 (volume)', fn: () => 1, tex: { cart: '1', cyl: '1', sph: '1' } },
    z: { name: 'f = z', fn: p => p.z, tex: { cart: 'z', cyl: 'z', sph: '\\rho\\cos\\phi' } },
    r2: { name: 'f = x² + y²', fn: p => p.x * p.x + p.y * p.y, tex: { cart: '(x^2+y^2)', cyl: 'r^2', sph: '\\rho^2\\sin^2\\phi' } },
    rho2: { name: 'f = x² + y² + z²', fn: p => p.x * p.x + p.y * p.y + p.z * p.z, tex: { cart: '(x^2+y^2+z^2)', cyl: '(r^2+z^2)', sph: '\\rho^2' } }
  };

  function circle(fn, n = 48) {
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(fn((2 * PI * i) / n));
    return pts;
  }

  let view = null;
  let sN, sR;

  const regionKey = () => el('tripleRegion').value;
  const funcKey = () => el('tripleFunc').value;
  const coordKey = () => document.querySelector('input[name="coords"]:checked').value;

  // point in the region for normalized (a, b, c) in [0, 1]^3, plus the jacobian of that map
  function mapper(region, sysKey, R) {
    const sys = systems[sysKey];
    const [L1, L2, L3] = region[sysKey].lim(R);
    return (a, b, c) => {
      const q1 = L1[0] + a * (L1[1] - L1[0]);
      const [l2, h2] = L2(q1);
      const q2 = l2 + b * (h2 - l2);
      const [l3, h3] = L3(q1, q2);
      const q3 = l3 + c * (h3 - l3);
      return {
        p: sys.toXYZ(q1, q2, q3),
        w: (L1[1] - L1[0]) * (h2 - l2) * (h3 - l3) * sys.jac(q1, q2, q3)
      };
    };
  }

  function riemann(region, sysKey, f, R, n) {
    const map = mapper(region, sysKey, R);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) {
          const m = map((i + 0.5) / n, (j + 0.5) / n, (k + 0.5) / n);
          sum += f(m.p) * m.w;
        }
      }
    }
    return sum / (n * n * n);
  }

  let exactCache = {};
  function exact(region, fKey, R) {
    const key = `${regionKey()}|${fKey}|${R}`;
    if (key in exactCache) return exactCache[key];
    let v;
    if (fKey === 'one') v = region.volume(R);
    else v = riemann(region, region.sph ? 'sph' : 'cyl', funcs[fKey].fn, R, 90);
    exactCache = { [key]: v };
    return v;
  }

  function build() {
    const region = regions[regionKey()];
    let sysKey = coordKey();
    const radios = document.querySelectorAll('input[name="coords"]');
    radios.forEach(r => {
      r.disabled = !region[r.value];
      r.parentElement.style.opacity = r.disabled ? 0.4 : 1;
    });
    if (!region[sysKey]) {
      sysKey = 'cyl';
      document.querySelector('input[value="cyl"]').checked = true;
    }
    const n = sN.value;
    const R = sR.value;
    const func = funcs[funcKey()];
    const map = mapper(region, sysKey, R);
    const cut = el('tripleCut').checked;

    view.center = { x: 0, y: 0, z: region.center(R) };
    view.clear();
    view.axes(3.2);

    // corners of every cell
    const corner = [];
    for (let i = 0; i <= n; i++) {
      corner.push([]);
      for (let j = 0; j <= n; j++) {
        corner[i].push([]);
        for (let k = 0; k <= n; k++) corner[i][j].push(map(i / n, j / n, k / n).p);
      }
    }

    const isCut = (i, j, k) => {
      if (!cut) return false;
      const m = map((i + 0.5) / n, (j + 0.5) / n, (k + 0.5) / n).p;
      return m.x > 1e-9 && m.y < -1e-9;
    };
    const cutFlags = [];
    let fmin = Infinity, fmax = -Infinity;
    const values = [];
    for (let i = 0; i < n; i++) {
      cutFlags.push([]); values.push([]);
      for (let j = 0; j < n; j++) {
        cutFlags[i].push([]); values[i].push([]);
        for (let k = 0; k < n; k++) {
          cutFlags[i][j].push(isCut(i, j, k));
          const v = func.fn(map((i + 0.5) / n, (j + 0.5) / n, (k + 0.5) / n).p);
          values[i][j].push(v);
          fmin = Math.min(fmin, v); fmax = Math.max(fmax, v);
        }
      }
    }
    const hidden = (i, j, k) => i < 0 || j < 0 || k < 0 || i >= n || j >= n || k >= n || cutFlags[i][j][k];

    // faces: corner offsets and which neighbor shares the face
    const faces = [
      { c: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]], nb: [-1, 0, 0] },
      { c: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]], nb: [1, 0, 0] },
      { c: [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]], nb: [0, -1, 0] },
      { c: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], nb: [0, 1, 0] },
      { c: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], nb: [0, 0, -1] },
      { c: [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]], nb: [0, 0, 1] }
    ];
    let cells = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) {
          if (cutFlags[i][j][k]) continue;
          cells++;
          const t = fmax - fmin < 1e-9 ? 0.55 : 0.2 + 0.8 * (values[i][j][k] - fmin) / (fmax - fmin);
          const color = rampColor(t);
          for (const face of faces) {
            if (!hidden(i + face.nb[0], j + face.nb[1], k + face.nb[2])) continue;
            const pts = face.c.map(([a, b, c]) => corner[i + a][j + b][k + c]);
            view.poly(pts, color, { stroke: 'rgba(29, 29, 29, 0.55)', lineWidth: 0.7 });
          }
        }
      }
    }

    if (el('tripleOutline').checked) {
      for (const line of region.outline(R)) view.polyline(line, 'rgba(250, 250, 250, 0.3)', 1, { top: true });
    }

    view.draw();
    equations(region, sysKey, func, R, n, cells);
  }

  function equations(region, sysKey, func, R, n, cells) {
    const sys = systems[sysKey];
    const lim = region[sysKey].tex;
    const ftex = func.tex[sysKey];
    let integrand;
    if (sys.jacTex) {
      const f = ftex === '1' ? '' : ftex.length > 2 && !ftex.startsWith('(') ? `(${ftex})\\,` : ftex + '\\,';
      integrand = f + hl(sys.jacTex);
    }
    else integrand = ftex;

    tex('tripleSetup',
      `\\iiint_E f\\,dV = \\int_{${lim[0]}}^{${lim[1]}}\\int_{${lim[2]}}^{${lim[3]}}\\int_{${lim[4]}}^{${lim[5]}} ${integrand}\\; ${sys.d}` +
      `\\\\[4pt] \\small E:\\ ${region.desc}, \\quad R = ${fmt(R)}`, true);
    tex('tripleChange', sys.change.replace(/textcolor\{HL\}/g, `textcolor{${HL}}`), true);

    const fKey = funcKey();
    const S = riemann(region, sysKey, func.fn, R, n);
    const E = exact(region, fKey, R);
    tex('tripleSum',
      `\\sum_{\\text{cells}} f(\\text{center}) \\cdot \\Delta V \\approx ${fmt(S, 4)}` +
      (fKey === 'one' ? `\\qquad \\text{exact: } ${region.volumeTex} = ${fmt(E, 4)}` : `\\qquad \\text{exact} \\approx ${fmt(E, 4)}`), true);

    const err = Math.abs(S - E) / Math.abs(E || 1);
    el('tripleStats').innerHTML =
      `<div><span>cells</span><b>${n}³ = ${n * n * n}</b></div>` +
      `<div><span>riemann sum</span><b>${fmt(S, 4)}</b></div>` +
      `<div><span>exact</span><b>${fmt(E, 4)}</b></div>` +
      `<div><span>error</span><b class="${err < 0.01 ? 'yes' : ''}">${fmt(err * 100, 2)}%</b></div>`;

    el('tripleReadout').innerHTML = `${systems[sysKey].name} · n = <b>${n}</b> · ${cells} cells shown`;

    let rows = '<tr><th>coordinates</th><th style="text-align:right">sum at n = ' + n + '</th><th style="text-align:right">error</th></tr>';
    for (const key of ['cart', 'cyl', 'sph']) {
      const active = key === sysKey ? ' active' : '';
      if (!region[key]) {
        rows += `<tr class="row"><td>${systems[key].name}</td><td class="n">awkward here</td><td class="n">—</td></tr>`;
        continue;
      }
      const s = riemann(region, key, func.fn, R, n);
      const e = Math.abs(s - E) / Math.abs(E || 1);
      rows += `<tr class="row${active}"><td>${systems[key].name}</td><td class="n">${fmt(s, 4)}</td><td class="n">${fmt(e * 100, 2)}%</td></tr>`;
    }
    el('tripleCompare').innerHTML = rows;
  }

  function init() {
    view = new View3D(el('tripleCanvas'), { size: 6.5, yaw: -0.7, pitch: 0.45 });
    const rs = el('tripleRegion');
    Object.entries(regions).forEach(([k, r]) => rs.add(new Option(r.name, k)));
    const fs = el('tripleFunc');
    Object.entries(funcs).forEach(([k, f]) => fs.add(new Option(f.name, k)));
    sN = slider('tripleN', build, 0);
    sR = slider('tripleSize', build);
    [rs, fs, el('tripleCut'), el('tripleOutline')].forEach(e => e.addEventListener('change', build));
    document.querySelectorAll('input[name="coords"]').forEach(r => r.addEventListener('change', build));
    build();
  }

  return { init };
})();

// ===================================================================

const started = {};
const modes = { graph: graphMode, patch: patchMode, triple: tripleMode };
modeTabs('modes', key => {
  if (!started[key]) {
    started[key] = true;
    // wait a frame so the panel has a size before the canvas reads it
    requestAnimationFrame(() => modes[key].init());
  }
});
