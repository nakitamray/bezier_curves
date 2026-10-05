const canvas = document.getElementById('bezierCanvas');
const basisCanvas = document.getElementById('basisCanvas');

const MIN_POINTS = 2;
const MAX_POINTS = 7;
const HIT_RADIUS = 14;
const TANGENT_SCALE = 0.25; // B'(t) gets long fast so draw it smaller

const plot = new Plot2D(canvas, { xmin: -6, xmax: 6, ymin: -4.5, ymax: 4.5 }, { onResize: () => render() });
const basis = new Plot2D(basisCanvas, { xmin: -0.03, xmax: 1.03, ymin: -0.08, ymax: 1.08 }, { equal: false, onResize: () => render() });

const state = {
  points: [],
  t: 0.5,
  playing: false,
  direction: 1,
  dragIndex: -1,
  hoverIndex: -1,
  rowIndex: -1 // hovered row in the bernstein table
};

const toggles = {
  polygon: document.getElementById('togglePolygon'),
  construction: document.getElementById('toggleConstruction'),
  tangent: document.getElementById('toggleTangent'),
  convex: document.getElementById('toggleConvex'),
  grid: document.getElementById('toggleGrid')
};

// whichever point the user is touching right now
function activeIndex() {
  if (state.dragIndex !== -1) return state.dragIndex;
  if (state.hoverIndex !== -1) return state.hoverIndex;
  return state.rowIndex;
}

function pointColor(i) {
  return TONES[i % TONES.length];
}

// ---------- default shapes ----------

function defaultPoints(count) {
  if (count === 4) {
    return [{ x: -4, y: -2 }, { x: -2.5, y: 3 }, { x: 2.5, y: 3 }, { x: 4, y: -2 }];
  }
  const pts = [];
  const n = count - 1;
  for (let i = 0; i <= n; i++) {
    const x = -4.5 + (9 * i) / n;
    let y;
    if (i === 0 || i === n) y = -2;
    else y = i % 2 === 1 ? 3 : -0.5;
    pts.push({ x, y });
  }
  return pts;
}

function randomPoints(count) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const x = -4.5 + (9 * i) / (count - 1) + (Math.random() - 0.5);
    const y = (Math.random() - 0.5) * 7;
    pts.push({ x, y });
  }
  return pts;
}

// raising the degree by one gives the exact same curve with one extra control point
function elevateDegree(points) {
  const n = points.length - 1;
  const out = [points[0]];
  for (let i = 1; i <= n; i++) {
    const a = i / (n + 1);
    out.push({
      x: a * points[i - 1].x + (1 - a) * points[i].x,
      y: a * points[i - 1].y + (1 - a) * points[i].y
    });
  }
  out.push(points[n]);
  return out;
}

// ---------- sandbox drawing ----------

function drawConvexHull() {
  const hull = convexHull(state.points).map(p => plot.toScreen(p.x, p.y));
  if (hull.length < 3) return;
  const ctx = plot.ctx;
  ctx.beginPath();
  ctx.moveTo(hull[0].x, hull[0].y);
  for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(239, 230, 207, 0.05)';
  ctx.fill();
  ctx.setLineDash([2, 4]);
  ctx.strokeStyle = COLORS.creamDim;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawConstruction(levels) {
  // level 0 is the control polygon and the last level is the point on the curve
  for (let k = 1; k < levels.length - 1; k++) {
    const alpha = 0.35 + (0.5 * k) / levels.length;
    const color = `rgba(239, 230, 207, ${alpha})`;
    plot.path(levels[k], color, 1);
    levels[k].forEach(p => plot.dot(p.x, p.y, 3, color));
  }
}

function drawControlPoints() {
  const active = activeIndex();
  state.points.forEach((p, i) => {
    const isActive = i === active;
    if (isActive) plot.dot(p.x, p.y, 13, COLORS.yellowDim);
    plot.dot(p.x, p.y, isActive ? 7 : 6, COLORS.bg, isActive ? COLORS.yellowBright : pointColor(i));
    label('P' + i, p, isActive ? COLORS.yellowBright : pointColor(i), -1);
  });
}

// text next to a point, above (-1) or below (1) it
function label(str, p, color, side) {
  const s = plot.toScreen(p.x, p.y);
  const ctx = plot.ctx;
  ctx.fillStyle = color;
  ctx.font = '500 13px "IBM Plex Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = side < 0 ? 'bottom' : 'top';
  ctx.fillText(str, s.x + 9, s.y + side * 7);
}

function renderSandbox(levels, point, tangent) {
  plot.begin();
  if (toggles.grid.checked) plot.grid({ step: 1 });
  if (toggles.convex.checked) drawConvexHull();
  if (toggles.polygon.checked) plot.path(state.points, COLORS.creamDim, 1, [5, 5]);

  plot.path(sampleCurve(state.points, 0, 1, 200), 'rgba(250, 250, 250, 0.22)', 2.5);
  plot.path(sampleCurve(state.points, 0, state.t, Math.max(2, Math.round(200 * state.t))), COLORS.white, 2.5);

  // while a point is active, show the part of the curve it pulls on the most
  const active = activeIndex();
  if (active !== -1) {
    const n = state.points.length - 1;
    const peak = n === 0 ? 0 : active / n;
    const lo = Math.max(0, peak - 0.25);
    const hi = Math.min(1, peak + 0.25);
    plot.path(sampleCurve(state.points, lo, hi, 80), 'rgba(245, 211, 107, 0.55)', 5);
  }

  if (toggles.construction.checked) drawConstruction(levels);
  if (toggles.tangent.checked) {
    plot.arrow(point.x, point.y, tangent.x * TANGENT_SCALE, tangent.y * TANGENT_SCALE, COLORS.yellow, 2, 9);
  }

  drawControlPoints();

  plot.dot(point.x, point.y, 6, COLORS.yellow, COLORS.bg, 2);
  label('B(t)', point, COLORS.yellow, 1);

  const speed = Math.hypot(tangent.x, tangent.y);
  document.getElementById('readout').innerHTML =
    `B(t) = <b>(${fmt(point.x)}, ${fmt(point.y)})</b> &nbsp; |B′(t)| = <b>${fmt(speed)}</b>`;
}

// ---------- bernstein basis plot ----------

function renderBasis() {
  const n = state.points.length - 1;
  const active = activeIndex();
  basis.begin();
  basis.line(0, 0, 1, 0, COLORS.axis, 1);
  basis.line(0, 1, 1, 1, COLORS.grid, 1);

  for (let i = 0; i <= n; i++) {
    if (i === active) continue;
    const color = active === -1 ? pointColor(i) : 'rgba(239, 230, 207, 0.22)';
    basis.graph(t => bernstein(n, i, t), color, 1.5, 0, 1);
  }
  if (active !== -1) basis.graph(t => bernstein(n, active, t), COLORS.yellowBright, 3, 0, 1);

  basis.line(state.t, -0.05, state.t, 1.05, COLORS.creamDim, 1, [3, 3]);
  for (let i = 0; i <= n; i++) {
    const v = bernstein(n, i, state.t);
    basis.dot(state.t, v, i === active ? 4.5 : 3, i === active ? COLORS.yellowBright : pointColor(i));
  }

  // label each curve near its peak
  for (let i = 0; i <= n; i++) {
    const peak = n === 0 ? 0 : i / n;
    const s = basis.toScreen(peak, bernstein(n, i, peak));
    const ctx = basis.ctx;
    ctx.fillStyle = i === active ? COLORS.yellowBright : COLORS.muted;
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`b${i}`, clamp(s.x, 12, basis.width - 12), Math.max(12, s.y - 4));
  }
}

// ---------- equations ----------

function bernsteinTex(n, i) {
  const c = binomial(n, i);
  const parts = [];
  if (c !== 1) parts.push(String(c));
  if (n - i > 0) parts.push(n - i === 1 ? '(1-t)' : `(1-t)^{${n - i}}`);
  if (i > 0) parts.push(i === 1 ? 't' : `t^{${i}}`);
  return parts.length ? parts.join('') : '1';
}

function renderBernstein(point) {
  const n = state.points.length - 1;
  const active = activeIndex();

  tex('bernsteinGeneral', `B(t) = \\sum_{i=0}^{${n}} \\binom{${n}}{i}(1-t)^{${n}-i}\\,t^{i}\\,P_i`, true);

  const terms = [];
  for (let i = 0; i <= n; i++) {
    terms.push(hl(`${bernsteinTex(n, i)}\\,P_{${i}}`, i === active));
  }
  tex('bernsteinExpanded', `B(t) = ${terms.join(' + ')}`, true);

  let rows = '<tr><th>point</th><th>weight b<sub>i</sub>(t)</th><th style="text-align:right">value</th><th style="text-align:right">P<sub>i</sub></th><th style="text-align:right">b<sub>i</sub>P<sub>i</sub></th></tr>';
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const w = bernstein(n, i, state.t);
    const p = state.points[i];
    sum += w;
    rows += `<tr class="row${i === active ? ' active' : ''}" data-i="${i}">
      <td><span class="swatch" style="background:${pointColor(i)}"></span>P${i}</td>
      <td class="k" data-tex="${bernsteinTex(n, i)}"></td>
      <td class="n">${fmt(w, 3)}</td>
      <td class="n">(${fmt(p.x)}, ${fmt(p.y)})</td>
      <td class="n">(${fmt(w * p.x)}, ${fmt(w * p.y)})</td>
    </tr>`;
  }
  rows += `<tr class="total"><td>sum</td><td></td><td class="n">${fmt(sum, 3)}</td><td></td><td class="n">(${fmt(point.x)}, ${fmt(point.y)})</td></tr>`;

  const table = document.getElementById('bernsteinTable');
  table.innerHTML = rows;
  table.querySelectorAll('td.k').forEach(td => tex(td, td.dataset.tex));
}

function renderMatrix(point) {
  const n = state.points.length - 1;
  const active = activeIndex();
  const M = bezierMatrix(n);
  const sup = j => (j === 0 ? '1' : j === 1 ? 't' : `t^{${j}}`);

  const T = Array.from({ length: n + 1 }, (_, j) => sup(j)).join(' & ');
  const Mrows = M.map(row => row.map((v, i) => hl(String(v), i === active)).join(' & ')).join(' \\\\ ');
  const Prows = state.points.map((p, i) => `${hl(fmt(p.x), i === active)} & ${hl(fmt(p.y), i === active)}`).join(' \\\\ ');

  tex('matrixEq',
    `B(t) = \\begin{bmatrix} ${T} \\end{bmatrix}` +
    `\\begin{bmatrix} ${Mrows} \\end{bmatrix}` +
    `\\begin{bmatrix} ${Prows} \\end{bmatrix}`, true);

  const Tnum = powerRow(n, state.t).map(v => num(v, 3)).join(' & ');
  tex('matrixResult',
    `t = ${fmt(state.t)}:\\quad \\begin{bmatrix} ${Tnum} \\end{bmatrix} M P = (${fmt(point.x, 3)},\\ ${fmt(point.y, 3)})`, true);
}

function renderDerivative(tangent) {
  const n = state.points.length - 1;
  tex('derivativeEq',
    `B'(t) = ${n}\\sum_{i=0}^{${n - 1}} b_{i,${n - 1}}(t)\\,(P_{i+1} - P_i) = (${fmt(tangent.x)},\\ ${fmt(tangent.y)})`, true);
}

function render() {
  if (!state.points.length) return;
  const levels = deCasteljau(state.points, state.t);
  const point = levels[levels.length - 1][0];
  const tangent = tangentAt(state.points, state.t);

  renderSandbox(levels, point, tangent);
  renderBasis();
  renderBernstein(point);
  renderMatrix(point);
  renderDerivative(tangent);
}

// ---------- state changes ----------

function syncControls() {
  const count = state.points.length;
  document.getElementById('pointCount').textContent = count;
  document.getElementById('addPoint').disabled = count >= MAX_POINTS;
  document.getElementById('removePoint').disabled = count <= MIN_POINTS;
}

function setT(t) {
  state.t = clamp(t, 0, 1);
  const s = document.getElementById('tSlider');
  s.value = state.t;
  s.style.setProperty('--fill', state.t * 100 + '%');
  document.getElementById('tValue').textContent = state.t.toFixed(2);
  render();
}

function setPoints(points) {
  state.points = points;
  state.hoverIndex = -1;
  state.rowIndex = -1;
  syncControls();
  render();
}

// ---------- mouse / touch ----------

function hitTest(pos) {
  for (let i = state.points.length - 1; i >= 0; i--) {
    const s = plot.toScreen(state.points[i].x, state.points[i].y);
    if (Math.hypot(s.x - pos.x, s.y - pos.y) <= HIT_RADIUS) return i;
  }
  return -1;
}

canvas.addEventListener('pointerdown', e => {
  const i = hitTest(pointerPos(canvas, e));
  if (i === -1) return;
  state.dragIndex = i;
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = 'grabbing';
  render();
});

canvas.addEventListener('pointermove', e => {
  const pos = pointerPos(canvas, e);
  if (state.dragIndex !== -1) {
    state.points[state.dragIndex] = plot.toWorld(pos.x, pos.y);
    render();
    return;
  }
  const hover = hitTest(pos);
  if (hover !== state.hoverIndex) {
    state.hoverIndex = hover;
    canvas.style.cursor = hover === -1 ? 'crosshair' : 'grab';
    render();
  }
});

function endDrag(e) {
  if (state.dragIndex === -1) return;
  state.dragIndex = -1;
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  canvas.style.cursor = state.hoverIndex === -1 ? 'crosshair' : 'grab';
  render();
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', () => {
  if (state.dragIndex === -1 && state.hoverIndex !== -1) {
    state.hoverIndex = -1;
    render();
  }
});

canvas.addEventListener('dblclick', e => {
  const pos = pointerPos(canvas, e);
  const i = hitTest(pos);
  if (i !== -1) {
    if (state.points.length > MIN_POINTS) setPoints(state.points.filter((_, k) => k !== i));
  } else if (state.points.length < MAX_POINTS) {
    setPoints([...state.points, plot.toWorld(pos.x, pos.y)]);
  }
});

// hovering a row in the table highlights that point everywhere else
const table = document.getElementById('bernsteinTable');
table.addEventListener('mouseover', e => {
  const row = e.target.closest('tr[data-i]');
  const i = row ? parseInt(row.dataset.i, 10) : -1;
  if (i !== state.rowIndex) {
    state.rowIndex = i;
    render();
  }
});
table.addEventListener('mouseleave', () => {
  state.rowIndex = -1;
  render();
});

// ---------- buttons ----------

document.getElementById('addPoint').addEventListener('click', () => {
  if (state.points.length < MAX_POINTS) setPoints(elevateDegree(state.points));
});

document.getElementById('removePoint').addEventListener('click', () => {
  if (state.points.length > MIN_POINTS) setPoints(state.points.slice(0, -1));
});

document.getElementById('resetButton').addEventListener('click', () => setPoints(defaultPoints(state.points.length)));
document.getElementById('randomButton').addEventListener('click', () => setPoints(randomPoints(state.points.length)));

document.getElementById('tSlider').addEventListener('input', e => {
  stopPlaying();
  setT(parseFloat(e.target.value));
});

Object.values(toggles).forEach(t => t.addEventListener('change', render));

// ---------- animation ----------

const playIcon = '<path d="M7 4v16l13-8z"/>';
const pauseIcon = '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';
let lastFrame = 0;

function tick(now) {
  if (!state.playing) return;
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  let t = state.t + state.direction * dt * 0.25;
  if (t >= 1) { t = 1; state.direction = -1; }
  if (t <= 0) { t = 0; state.direction = 1; }
  setT(t);
  requestAnimationFrame(tick);
}

function startPlaying() {
  state.playing = true;
  document.getElementById('playIcon').innerHTML = pauseIcon;
  lastFrame = performance.now();
  requestAnimationFrame(tick);
}

function stopPlaying() {
  state.playing = false;
  document.getElementById('playIcon').innerHTML = playIcon;
}

document.getElementById('playButton').addEventListener('click', () => (state.playing ? stopPlaying() : startPlaying()));

document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.target.tagName === 'INPUT' && e.target.type === 'text') return;
  e.preventDefault();
  state.playing ? stopPlaying() : startPlaying();
});

// ---------- start ----------

canvas.style.cursor = 'crosshair';
state.points = defaultPoints(4);
syncControls();
setT(0.5);
