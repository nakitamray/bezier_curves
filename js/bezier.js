const canvas = document.getElementById('bezierCanvas');
const ctx = canvas.getContext('2d');
const basisCanvas = document.getElementById('basisCanvas');
const basisCtx = basisCanvas.getContext('2d');
const wrap = document.getElementById('canvasWrap');

const MIN_POINTS = 2;
const MAX_POINTS = 8;
const HIT_RADIUS = 14;
const TANGENT_SCALE = 0.25; // B'(t) gets long fast so draw it smaller

const pointColors = ['#ff6b8b', '#ffb86b', '#ffe66b', '#9be86b', '#5ee6c4', '#6bd5ff', '#7c9cff', '#c38bff'];
const levelColors = ['#7c9cff', '#8fa9ff', '#9fb4ff', '#a3c7f0', '#93dce0', '#7fe3cf', '#6fe6c8'];
const colors = {
  grid: 'rgba(138, 147, 173, 0.08)',
  axis: 'rgba(138, 147, 173, 0.35)',
  axisText: 'rgba(138, 147, 173, 0.6)',
  polygon: 'rgba(230, 233, 242, 0.35)',
  hull: 'rgba(124, 156, 255, 0.10)',
  hullEdge: 'rgba(124, 156, 255, 0.45)',
  curve: '#5ee6c4',
  curveFaint: 'rgba(94, 230, 196, 0.25)',
  tangent: '#ffb86b',
  label: '#e6e9f2'
};

const state = {
  points: [],
  t: 0.5,
  playing: false,
  direction: 1,
  dragIndex: -1,
  hoverIndex: -1,
  width: 0,
  height: 0,
  dpr: 1
};

const toggles = {
  construction: document.getElementById('toggleConstruction'),
  tangent: document.getElementById('toggleTangent'),
  convex: document.getElementById('toggleConvex'),
  grid: document.getElementById('toggleGrid')
};

// ---------- coordinates ----------
// world units with the origin in the middle of the canvas and y pointing up

function scale() {
  return Math.min(state.width, state.height) / 12;
}

function toScreen(p) {
  const s = scale();
  return { x: state.width / 2 + p.x * s, y: state.height / 2 - p.y * s };
}

function toWorld(x, y) {
  const s = scale();
  return { x: (x - state.width / 2) / s, y: (state.height / 2 - y) / s };
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

// ---------- drawing ----------

function resize() {
  state.dpr = window.devicePixelRatio || 1;
  state.width = wrap.clientWidth;
  state.height = wrap.clientHeight;
  canvas.width = state.width * state.dpr;
  canvas.height = state.height * state.dpr;

  const bw = basisCanvas.clientWidth;
  const bh = basisCanvas.clientHeight;
  basisCanvas.width = bw * state.dpr;
  basisCanvas.height = bh * state.dpr;

  render();
}

function drawGrid() {
  const s = scale();
  const origin = toScreen({ x: 0, y: 0 });
  const left = Math.floor(-origin.x / s);
  const right = Math.ceil((state.width - origin.x) / s);
  const top = Math.floor(-origin.y / s);
  const bottom = Math.ceil((state.height - origin.y) / s);

  ctx.lineWidth = 1;
  ctx.strokeStyle = colors.grid;
  ctx.beginPath();
  for (let i = left; i <= right; i++) {
    const x = Math.round(origin.x + i * s) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, state.height);
  }
  for (let j = top; j <= bottom; j++) {
    const y = Math.round(origin.y + j * s) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(state.width, y);
  }
  ctx.stroke();

  ctx.strokeStyle = colors.axis;
  ctx.beginPath();
  ctx.moveTo(0, Math.round(origin.y) + 0.5);
  ctx.lineTo(state.width, Math.round(origin.y) + 0.5);
  ctx.moveTo(Math.round(origin.x) + 0.5, 0);
  ctx.lineTo(Math.round(origin.x) + 0.5, state.height);
  ctx.stroke();

  ctx.fillStyle = colors.axisText;
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = left; i <= right; i++) {
    if (i === 0 || i % 2 !== 0) continue;
    ctx.fillText(i, origin.x + i * s, origin.y + 4);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let j = top; j <= bottom; j++) {
    if (j === 0 || j % 2 !== 0) continue;
    ctx.fillText(-j, origin.x - 6, origin.y + j * s);
  }
}

function drawConvexHull() {
  const hull = convexHull(state.points).map(toScreen);
  if (hull.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(hull[0].x, hull[0].y);
  for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
  ctx.closePath();
  ctx.fillStyle = colors.hull;
  ctx.fill();
  ctx.setLineDash([2, 4]);
  ctx.strokeStyle = colors.hullEdge;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
}

function strokePath(points, color, width, dash) {
  if (points.length < 2) return;
  ctx.beginPath();
  const first = toScreen(points[0]);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const p = toScreen(points[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.setLineDash(dash || []);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.setLineDash([]);
}

function dot(p, r, fill, stroke) {
  const s = toScreen(p);
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function drawCurve() {
  strokePath(sampleCurve(state.points, 0, 1, 200), colors.curveFaint, 3);

  ctx.save();
  ctx.shadowColor = colors.curve;
  ctx.shadowBlur = 12;
  strokePath(sampleCurve(state.points, 0, state.t, Math.max(2, Math.round(200 * state.t))), colors.curve, 3.5);
  ctx.restore();
}

function drawConstruction(levels) {
  // skip level 0 (the control polygon) and the last level (the point on the curve)
  for (let k = 1; k < levels.length - 1; k++) {
    const color = levelColors[(k - 1) % levelColors.length];
    strokePath(levels[k], color, 1.5);
    levels[k].forEach(p => dot(p, 3.5, color));
  }
}

function drawArrow(from, vec, color) {
  const a = toScreen(from);
  const b = toScreen({ x: from.x + vec.x, y: from.y + vec.y });
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 2) return;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  const head = Math.min(10, len / 2);
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - head * Math.cos(angle - 0.4), b.y - head * Math.sin(angle - 0.4));
  ctx.lineTo(b.x - head * Math.cos(angle + 0.4), b.y - head * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
}

function drawControlPoints() {
  ctx.font = '600 12px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  state.points.forEach((p, i) => {
    const active = i === state.dragIndex || i === state.hoverIndex;
    const color = pointColors[i % pointColors.length];
    if (active) dot(p, 13, color + '33');
    dot(p, active ? 7.5 : 6.5, '#0b0e17', color);

    const s = toScreen(p);
    ctx.fillStyle = color;
    ctx.fillText('P' + i, s.x + 10, s.y - 8);
  });
}

function render() {
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  ctx.clearRect(0, 0, state.width, state.height);

  const levels = deCasteljau(state.points, state.t);
  const point = levels[levels.length - 1][0];
  const tangent = tangentAt(state.points, state.t);

  if (toggles.grid.checked) drawGrid();
  if (toggles.convex.checked) drawConvexHull();

  strokePath(state.points, colors.polygon, 1.5, [6, 6]);
  drawCurve();

  if (toggles.construction.checked) drawConstruction(levels);
  if (toggles.tangent.checked) {
    drawArrow(point, { x: tangent.x * TANGENT_SCALE, y: tangent.y * TANGENT_SCALE }, colors.tangent);
  }

  drawControlPoints();

  // the point on the curve
  dot(point, 11, 'rgba(94, 230, 196, 0.2)');
  dot(point, 6, '#ffffff', colors.curve);
  const s = toScreen(point);
  ctx.fillStyle = colors.label;
  ctx.font = '600 12px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('B(t)', s.x + 10, s.y + 8);

  updateReadout(point, tangent);
  updateMatrices(point);
  drawBasis();
}

// ---------- bernstein basis plot ----------

function drawBasis() {
  const w = basisCanvas.clientWidth;
  const h = basisCanvas.clientHeight;
  const pad = 8;
  const n = state.points.length - 1;
  basisCtx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  basisCtx.clearRect(0, 0, w, h);

  const px = t => pad + t * (w - 2 * pad);
  const py = v => h - pad - v * (h - 2 * pad);

  basisCtx.strokeStyle = colors.grid;
  basisCtx.lineWidth = 1;
  basisCtx.strokeRect(pad, pad, w - 2 * pad, h - 2 * pad);

  for (let i = 0; i <= n; i++) {
    basisCtx.beginPath();
    for (let s = 0; s <= 100; s++) {
      const t = s / 100;
      const x = px(t);
      const y = py(bernstein(n, i, t));
      if (s === 0) basisCtx.moveTo(x, y);
      else basisCtx.lineTo(x, y);
    }
    basisCtx.strokeStyle = pointColors[i % pointColors.length];
    basisCtx.lineWidth = 2;
    basisCtx.stroke();
  }

  const x = px(state.t);
  basisCtx.strokeStyle = 'rgba(230, 233, 242, 0.5)';
  basisCtx.setLineDash([3, 3]);
  basisCtx.beginPath();
  basisCtx.moveTo(x, pad);
  basisCtx.lineTo(x, h - pad);
  basisCtx.stroke();
  basisCtx.setLineDash([]);

  for (let i = 0; i <= n; i++) {
    basisCtx.beginPath();
    basisCtx.arc(x, py(bernstein(n, i, state.t)), 3.5, 0, Math.PI * 2);
    basisCtx.fillStyle = pointColors[i % pointColors.length];
    basisCtx.fill();
  }
}

// ---------- side panel ----------

function fmt(v, digits) {
  const s = v.toFixed(digits);
  return s === '-' + (0).toFixed(digits) ? (0).toFixed(digits) : s;
}

function matrixHtml(rows, cols, cell) {
  let html = `<div class="matrix" style="grid-template-columns: repeat(${cols}, auto)">`;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) html += cell(r, c);
  }
  return html + '</div>';
}

function block(name, inner) {
  return `<div class="mat-block"><span class="mat-name">${name}</span>${inner}</div>`;
}

const superscripts = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

function updateMatrices(point) {
  const n = state.points.length - 1;
  const M = bezierMatrix(n);
  const T = powerRow(n, state.t);

  const tLabels = matrixHtml(1, n + 1, (r, c) => {
    const label = c === 0 ? '1' : c === 1 ? 't' : 't' + superscripts[c];
    return `<span>${label}</span>`;
  });

  const mHtml = matrixHtml(n + 1, n + 1, (r, c) => {
    const v = M[r][c];
    const cls = v === 0 ? 'zero' : v < 0 ? 'neg' : '';
    return `<span class="${cls}">${v}</span>`;
  });

  const pHtml = matrixHtml(n + 1, 2, (r, c) => {
    const p = state.points[r];
    const v = c === 0 ? p.x : p.y;
    const style = c === 0 ? ` style="color:${pointColors[r % pointColors.length]}"` : '';
    return `<span${style}>${fmt(v, 2)}</span>`;
  });

  document.getElementById('matrixContent').innerHTML =
    `<div class="equation">${block('T', tLabels)}<span class="dot">·</span>${block('M', mHtml)}<span class="dot">·</span>${block('P', pHtml)}</div>`;

  const tNums = T.map(v => fmt(v, 3)).join(', ');
  document.getElementById('resultContent').innerHTML =
    `T = [${tNums}]<br>B(${fmt(state.t, 2)}) = <b>(${fmt(point.x, 3)}, ${fmt(point.y, 3)})</b>`;
}

function updateReadout(point, tangent) {
  const speed = Math.hypot(tangent.x, tangent.y);
  document.getElementById('readout').innerHTML =
    `B(t) = <b>(${fmt(point.x, 2)}, ${fmt(point.y, 2)})</b> &nbsp; |B′(t)| = <b>${fmt(speed, 2)}</b>`;
}

function syncControls() {
  const count = state.points.length;
  document.getElementById('pointCount').textContent = count;
  document.getElementById('degreeBadge').textContent = 'degree ' + (count - 1);
  document.getElementById('addPoint').disabled = count >= MAX_POINTS;
  document.getElementById('removePoint').disabled = count <= MIN_POINTS;
}

function setT(t) {
  state.t = Math.max(0, Math.min(1, t));
  const slider = document.getElementById('tSlider');
  slider.value = state.t;
  slider.style.setProperty('--fill', state.t * 100 + '%');
  document.getElementById('tValue').textContent = state.t.toFixed(2);
  render();
}

function setPoints(points) {
  state.points = points;
  state.hoverIndex = -1;
  syncControls();
  render();
}

// ---------- mouse / touch ----------

function eventPos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function hitTest(pos) {
  // go backwards so the point drawn on top wins
  for (let i = state.points.length - 1; i >= 0; i--) {
    const s = toScreen(state.points[i]);
    if (Math.hypot(s.x - pos.x, s.y - pos.y) <= HIT_RADIUS) return i;
  }
  return -1;
}

canvas.addEventListener('pointerdown', e => {
  const index = hitTest(eventPos(e));
  if (index === -1) return;
  state.dragIndex = index;
  canvas.setPointerCapture(e.pointerId);
  canvas.className = 'grabbing';
  render();
});

canvas.addEventListener('pointermove', e => {
  const pos = eventPos(e);
  if (state.dragIndex !== -1) {
    const w = toWorld(pos.x, pos.y);
    state.points[state.dragIndex] = w;
    render();
    return;
  }
  const hover = hitTest(pos);
  if (hover !== state.hoverIndex) {
    state.hoverIndex = hover;
    canvas.className = hover === -1 ? '' : 'grab';
    render();
  }
});

function endDrag(e) {
  if (state.dragIndex === -1) return;
  state.dragIndex = -1;
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  canvas.className = state.hoverIndex === -1 ? '' : 'grab';
  render();
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

canvas.addEventListener('dblclick', e => {
  const pos = eventPos(e);
  const index = hitTest(pos);
  if (index !== -1) {
    if (state.points.length > MIN_POINTS) {
      setPoints(state.points.filter((_, i) => i !== index));
    }
  } else if (state.points.length < MAX_POINTS) {
    setPoints([...state.points, toWorld(pos.x, pos.y)]);
  }
});

// ---------- buttons ----------

document.getElementById('addPoint').addEventListener('click', () => {
  if (state.points.length < MAX_POINTS) setPoints(elevateDegree(state.points));
});

document.getElementById('removePoint').addEventListener('click', () => {
  if (state.points.length > MIN_POINTS) setPoints(state.points.slice(0, -1));
});

document.getElementById('resetButton').addEventListener('click', () => {
  setPoints(defaultPoints(state.points.length));
});

document.getElementById('randomButton').addEventListener('click', () => {
  setPoints(randomPoints(state.points.length));
});

document.getElementById('tSlider').addEventListener('input', e => {
  stopPlaying();
  setT(parseFloat(e.target.value));
});

Object.values(toggles).forEach(toggle => toggle.addEventListener('change', render));

// ---------- animation ----------

const playIcon = '<path d="M8 5v14l11-7z"/>';
const pauseIcon = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';
let lastFrame = 0;

function tick(now) {
  if (!state.playing) return;
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  let t = state.t + state.direction * dt * 0.3;
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

document.getElementById('playButton').addEventListener('click', () => {
  if (state.playing) stopPlaying();
  else startPlaying();
});

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (state.playing) stopPlaying();
    else startPlaying();
  }
});

// ---------- start ----------

state.points = defaultPoints(4);
syncControls();
const observer = new ResizeObserver(resize);
observer.observe(wrap);
observer.observe(basisCanvas);
resize();
setT(0.5);
