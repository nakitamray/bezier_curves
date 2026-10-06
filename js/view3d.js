// tiny 3d renderer on a 2d canvas
// everything gets projected, sorted back to front (painter's algorithm) and drawn
// z is up. drag to rotate, scroll to zoom

class View3D {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.home = { yaw: opts.yaw ?? -0.75, pitch: opts.pitch ?? 0.5 };
    this.zoom = opts.zoom ?? 1;
    this.size = opts.size ?? 7; // roughly how many world units fit across
    this.dist = opts.dist ?? 22;
    this.center = opts.center || { x: 0, y: 0, z: 0 }; // the point the camera looks at
    this.pan = { x: 0, y: 0 }; // screen-space offset in world units
    this.light = normalize({ x: -0.35, y: 0.55, z: 0.75 }); // in camera space, so shading follows you
    this.items = [];
    this.setAngles(this.home.yaw, this.home.pitch);

    // pages can hook into dragging: pick(pos) returns true to take over the drag
    this.pick = opts.pick || null;
    this.drag = opts.drag || null;
    this.release = opts.release || null;

    this.view = setupCanvas(canvas, () => this.draw());
    this.ctx = this.view.ctx;
    this.bindMouse();
  }

  // rotation matrix from a turn around z and a tilt, used for the starting view
  setAngles(yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    // rows: screen right, screen up, toward the viewer
    this.R = [
      [cy, -sy, 0],
      [sy * sp, cy * sp, cp],
      [-sy * cp, -cy * cp, sp]
    ];
  }

  // turn the whole scene around a screen axis. this is what lets it spin any direction
  rotate(axis, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const R = this.R;
    const rot = axis === 'x'
      ? [[1, 0, 0], [0, c, -s], [0, s, c]]
      : [[c, 0, s], [0, 1, 0], [-s, 0, c]];
    this.R = rot.map(row => [0, 1, 2].map(j => row[0] * R[0][j] + row[1] * R[1][j] + row[2] * R[2][j]));
    // keep it a clean rotation (tiny errors pile up after lots of dragging)
    const [a, b] = this.R;
    const na = normalize({ x: a[0], y: a[1], z: a[2] });
    const d = na.x * b[0] + na.y * b[1] + na.z * b[2];
    const nb = normalize({ x: b[0] - d * na.x, y: b[1] - d * na.y, z: b[2] - d * na.z });
    const nc = { x: na.y * nb.z - na.z * nb.y, y: na.z * nb.x - na.x * nb.z, z: na.x * nb.y - na.y * nb.x };
    this.R = [[na.x, na.y, na.z], [nb.x, nb.y, nb.z], [nc.x, nc.y, nc.z]];
  }

  scale() {
    return (Math.min(this.view.width, this.view.height) / this.size) * this.zoom;
  }

  // how many pixels the screen moves when z goes up by one (for dragging points vertically)
  pixelsPerZ() {
    return this.R[1][2] * this.scale();
  }

  resetView() {
    this.setAngles(this.home.yaw, this.home.pitch);
    this.pan = { x: 0, y: 0 };
    this.zoom = 1;
    this.draw();
  }

  bindMouse() {
    const c = this.canvas;
    let last = null;
    let mode = null;
    c.style.cursor = 'grab';
    c.addEventListener('contextmenu', e => e.preventDefault());

    c.addEventListener('pointerdown', e => {
      const pos = pointerPos(c, e);
      if (e.button === 2 || e.shiftKey) mode = 'pan';
      else if (this.pick && this.pick(pos)) mode = 'custom';
      else mode = 'rotate';
      last = pos;
      c.setPointerCapture(e.pointerId);
      c.style.cursor = mode === 'custom' ? 'ns-resize' : mode === 'pan' ? 'move' : 'grabbing';
    });

    c.addEventListener('pointermove', e => {
      if (!last) return;
      const pos = pointerPos(c, e);
      const dx = pos.x - last.x;
      const dy = pos.y - last.y;
      last = pos;
      if (mode === 'custom') {
        this.drag && this.drag(dx, dy, pos);
      } else if (mode === 'pan') {
        const k = this.scale();
        this.pan.x += dx / k;
        this.pan.y -= dy / k;
        this.draw();
      } else {
        this.rotate('y', dx * 0.009);
        this.rotate('x', dy * 0.009);
        this.draw();
      }
    });

    const up = e => {
      if (!last) return;
      last = null;
      if (mode === 'custom' && this.release) this.release();
      mode = null;
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
      c.style.cursor = 'grab';
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('dblclick', () => this.resetView());

    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoom = clamp(this.zoom * Math.exp(-e.deltaY * 0.001), 0.3, 4);
      this.draw();
    }, { passive: false });
  }

  // world -> screen. returns {x, y, depth}
  project(q) {
    const px = q.x - this.center.x, py = q.y - this.center.y, pz = q.z - this.center.z;
    const R = this.R;
    const X = R[0][0] * px + R[0][1] * py + R[0][2] * pz + this.pan.x;
    const Y = R[1][0] * px + R[1][1] * py + R[1][2] * pz + this.pan.y;
    const Z = R[2][0] * px + R[2][1] * py + R[2][2] * pz;
    const depth = this.dist - Z;
    const k = this.dist / Math.max(depth, 0.5);
    const scale = this.scale();
    return {
      x: this.view.width / 2 + X * scale * k,
      y: this.view.height / 2 - Y * scale * k,
      depth
    };
  }

  clear() {
    this.items = [];
  }

  // a flat polygon. color is [r, g, b]. shade dims it by the angle to the light
  poly(pts, color, opts = {}) {
    this.items.push({ kind: 'poly', pts, color, alpha: opts.alpha ?? 1, stroke: opts.stroke, shade: opts.shade !== false, lineWidth: opts.lineWidth || 0.5 });
  }

  // lines get cut into pieces so the depth sorting works out
  line(a, b, color, width = 1, opts = {}) {
    const pieces = opts.pieces || 1;
    for (let i = 0; i < pieces; i++) {
      const t0 = i / pieces, t1 = (i + 1) / pieces;
      this.items.push({
        kind: 'line',
        a: mix(a, b, t0),
        b: mix(a, b, t1),
        color,
        width,
        dash: opts.dash,
        top: opts.top,
        bias: opts.bias || 0
      });
    }
  }

  polyline(points, color, width = 1, opts = {}) {
    for (let i = 0; i < points.length - 1; i++) {
      if (points[i] && points[i + 1]) this.line(points[i], points[i + 1], color, width, opts);
    }
  }

  point(p, r, fill, opts = {}) {
    this.items.push({ kind: 'point', p, r, fill, stroke: opts.stroke, top: opts.top, bias: opts.bias ?? 0.05 });
  }

  label(p, text, color, opts = {}) {
    this.items.push({ kind: 'text', p, text, color, top: opts.top !== false, font: opts.font, dx: opts.dx || 0, dy: opts.dy || 0 });
  }

  arrow(from, vec, color, width = 2, opts = {}) {
    const to = { x: from.x + vec.x, y: from.y + vec.y, z: from.z + vec.z };
    this.line(from, to, color, width, { pieces: 4, top: opts.top });
    this.items.push({ kind: 'head', a: from, b: to, color, top: opts.top });
  }

  // grid of quads from a function (u, v) -> {x, y, z}
  surface(fn, u0, u1, v0, v1, nu, nv, colorFn, opts = {}) {
    const grid = [];
    for (let i = 0; i <= nu; i++) {
      const row = [];
      for (let j = 0; j <= nv; j++) {
        row.push(fn(u0 + ((u1 - u0) * i) / nu, v0 + ((v1 - v0) * j) / nv));
      }
      grid.push(row);
    }
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const q = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
        if (q.some(p => !p || !isFinite(p.z))) continue;
        const c = colorFn(q);
        if (!c) continue;
        this.poly(q, c, opts);
      }
    }
    return grid;
  }

  // the 8 corners of a cell -> 6 faces
  hexahedron(c, color, opts = {}) {
    const faces = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
    faces.forEach(f => this.poly(f.map(i => c[i]), color, opts));
  }

  // axes that keep going in both directions and fade out into the distance, with unit ticks near the origin
  infiniteAxes(opts = {}) {
    const L = opts.length || 60;
    const names = opts.names || ['x', 'y', 'z'];
    const labelAt = opts.labelAt || 4.5;
    const dirs = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }];
    const at = (d, t) => ({ x: d.x * t, y: d.y * t, z: d.z * t });
    dirs.forEach((d, i) => {
      // short pieces near the origin (so depth sorting works), longer ones far away
      const marks = [];
      for (let t = -L; t < -8; t += 4) marks.push(t);
      for (let t = -8; t < 8; t += 0.5) marks.push(t);
      for (let t = 8; t <= L; t += 4) marks.push(t);
      for (let k = 0; k < marks.length - 1; k++) {
        const t0 = marks[k], t1 = marks[k + 1];
        const mid = Math.abs((t0 + t1) / 2);
        const alpha = 0.55 * Math.max(0, 1 - mid / L) * (mid < 6 ? 1 : 0.75);
        if (alpha < 0.02) continue;
        this.items.push({ kind: 'line', a: at(d, t0), b: at(d, t1), color: `rgba(239, 230, 207, ${alpha.toFixed(3)})`, width: 1.2, bias: 0.02 });
      }
      // ticks every unit, numbers on the even ones
      const other = dirs[(i + 1) % 3];
      for (let t = -6; t <= 6; t++) {
        if (t === 0) continue;
        const p = at(d, t);
        const q = { x: p.x + other.x * 0.08, y: p.y + other.y * 0.08, z: p.z + other.z * 0.08 };
        const r = { x: p.x - other.x * 0.08, y: p.y - other.y * 0.08, z: p.z - other.z * 0.08 };
        this.items.push({ kind: 'line', a: q, b: r, color: 'rgba(239, 230, 207, 0.5)', width: 1, bias: 0.02 });
        if (t % 2 === 0 && opts.numbers !== false) {
          this.items.push({ kind: 'text', p, text: String(t), color: 'rgba(239, 230, 207, 0.45)', top: false, font: '10px "Space Mono", monospace', dx: 4, dy: 8, bias: 0.02 });
        }
      }
      this.label(at(d, labelAt), names[i], COLORS.yellow, { dx: 6, dy: -6, font: '700 14px Syne, sans-serif' });
      this.label(at(d, -labelAt), '−' + names[i], 'rgba(239, 230, 207, 0.35)', { dx: 6, dy: -6, font: '600 12px Syne, sans-serif' });
    });
  }

  axes(len = 3, opts = {}) {
    const color = opts.color || 'rgba(239, 230, 207, 0.4)';
    const names = opts.names || ['x', 'y', 'z'];
    const o = { x: 0, y: 0, z: 0 };
    const ends = [{ x: len, y: 0, z: 0 }, { x: 0, y: len, z: 0 }, { x: 0, y: 0, z: len }];
    ends.forEach((e, i) => {
      this.line(o, e, color, 1, { pieces: 8 });
      this.label(e, names[i], COLORS.cream, { dx: 6, dy: -4 });
    });
  }

  draw() {
    const ctx = this.ctx;
    this.view.begin();

    const proj = p => this.project(p);
    const list = [];
    for (const it of this.items) {
      if (it.kind === 'poly') {
        const s = it.pts.map(proj);
        it.s = s;
        it.depth = s.reduce((a, p) => a + p.depth, 0) / s.length;
      } else if (it.kind === 'line' || it.kind === 'head') {
        it.sa = proj(it.a);
        it.sb = proj(it.b);
        it.depth = (it.sa.depth + it.sb.depth) / 2 - (it.bias || 0);
      } else {
        it.s = proj(it.p);
        it.depth = it.s.depth - (it.bias || 0);
      }
      list.push(it);
    }
    const back = list.filter(i => !i.top).sort((a, b) => b.depth - a.depth);
    const front = list.filter(i => i.top).sort((a, b) => b.depth - a.depth);

    for (const it of back.concat(front)) this.drawItem(ctx, it);
  }

  drawItem(ctx, it) {
    if ((it.kind === 'line' || it.kind === 'head') && (it.sa.depth < 1 || it.sb.depth < 1)) return;
    if ((it.kind === 'point' || it.kind === 'text') && it.s.depth < 1) return;
    if (it.kind === 'poly') {
      let [r, g, b] = it.color;
      if (it.shade) {
        const n = normal(it.pts);
        const R = this.R;
        const nv = { x: R[0][0] * n.x + R[0][1] * n.y + R[0][2] * n.z, y: R[1][0] * n.x + R[1][1] * n.y + R[1][2] * n.z, z: R[2][0] * n.x + R[2][1] * n.y + R[2][2] * n.z };
        const k = 0.42 + 0.58 * Math.abs(dot3(nv, this.light));
        r *= k; g *= k; b *= k;
      }
      const fill = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${it.alpha})`;
      ctx.beginPath();
      ctx.moveTo(it.s[0].x, it.s[0].y);
      for (let i = 1; i < it.s.length; i++) ctx.lineTo(it.s[i].x, it.s[i].y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = it.stroke || fill; // stroking with the fill hides the seams between quads
      ctx.lineWidth = it.stroke ? it.lineWidth : 0.6;
      ctx.stroke();
    } else if (it.kind === 'line') {
      ctx.strokeStyle = it.color;
      ctx.lineWidth = it.width;
      ctx.setLineDash(it.dash || []);
      ctx.beginPath();
      ctx.moveTo(it.sa.x, it.sa.y);
      ctx.lineTo(it.sb.x, it.sb.y);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (it.kind === 'head') {
      const a = it.sa, b = it.sb;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const h = 9;
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - h * Math.cos(ang - 0.4), b.y - h * Math.sin(ang - 0.4));
      ctx.lineTo(b.x - h * Math.cos(ang + 0.4), b.y - h * Math.sin(ang + 0.4));
      ctx.closePath();
      ctx.fill();
    } else if (it.kind === 'point') {
      ctx.beginPath();
      ctx.arc(it.s.x, it.s.y, it.r, 0, Math.PI * 2);
      ctx.fillStyle = it.fill;
      ctx.fill();
      if (it.stroke) {
        ctx.strokeStyle = it.stroke;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else if (it.kind === 'text') {
      ctx.fillStyle = it.color;
      ctx.font = it.font || '500 13px Sora, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.text, it.s.x + it.dx, it.s.y + it.dy);
    }
  }
}

function mix(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function dot3(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalize(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function normal(pts) {
  const a = pts[0], b = pts[1], c = pts[pts.length - 1];
  const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  return normalize({ x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x });
}

// height -> color, dark grey through cream to yellow
function rampColor(t) {
  t = clamp(t, 0, 1);
  const stops = [[70, 68, 64], [150, 142, 124], [239, 230, 207], [233, 196, 106]];
  const s = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(s));
  const f = s - i;
  return stops[i].map((c, k) => c + (stops[i + 1][k] - c) * f);
}
