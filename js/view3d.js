// tiny 3d renderer on a 2d canvas
// everything gets projected, sorted back to front (painter's algorithm) and drawn
// z is up. drag to rotate, scroll to zoom

class View3D {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.yaw = opts.yaw ?? -0.75;
    this.pitch = opts.pitch ?? 0.5;
    this.zoom = opts.zoom ?? 1;
    this.size = opts.size ?? 7; // roughly how many world units fit across
    this.dist = opts.dist ?? 22;
    this.center = opts.center || { x: 0, y: 0, z: 0 }; // the point the camera looks at
    this.light = normalize({ x: -0.4, y: -0.6, z: 1 });
    this.items = [];

    // pages can hook into dragging: pick(pos) returns true to take over the drag
    this.pick = opts.pick || null;
    this.drag = opts.drag || null;
    this.release = opts.release || null;

    this.view = setupCanvas(canvas, () => this.draw());
    this.ctx = this.view.ctx;
    this.bindMouse();
  }

  bindMouse() {
    const c = this.canvas;
    let last = null;
    let custom = false;
    c.style.cursor = 'grab';

    c.addEventListener('pointerdown', e => {
      const pos = pointerPos(c, e);
      custom = !!(this.pick && this.pick(pos));
      last = pos;
      c.setPointerCapture(e.pointerId);
      c.style.cursor = custom ? 'ns-resize' : 'grabbing';
    });

    c.addEventListener('pointermove', e => {
      if (!last) return;
      const pos = pointerPos(c, e);
      const dx = pos.x - last.x;
      const dy = pos.y - last.y;
      last = pos;
      if (custom) {
        this.drag && this.drag(dx, dy, pos);
      } else {
        this.yaw -= dx * 0.008;
        this.pitch = clamp(this.pitch + dy * 0.008, -0.2, 1.45);
        this.draw();
      }
    });

    const up = e => {
      if (!last) return;
      last = null;
      if (custom && this.release) this.release();
      custom = false;
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
      c.style.cursor = 'grab';
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);

    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoom = clamp(this.zoom * Math.exp(-e.deltaY * 0.001), 0.4, 3);
      this.draw();
    }, { passive: false });
  }

  // world -> screen. returns {x, y, depth}
  project(q) {
    const p = { x: q.x - this.center.x, y: q.y - this.center.y, z: q.z - this.center.z };
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const x1 = p.x * cy - p.y * sy;
    const y1 = p.x * sy + p.y * cy;
    const up = y1 * sp + p.z * cp;
    const depth = y1 * cp - p.z * sp + this.dist;
    const k = this.dist / depth;
    const scale = (Math.min(this.view.width, this.view.height) / this.size) * this.zoom;
    return {
      x: this.view.width / 2 + x1 * scale * k,
      y: this.view.height / 2 - up * scale * k,
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
    if (it.kind === 'poly') {
      let [r, g, b] = it.color;
      if (it.shade) {
        const n = normal(it.pts);
        const k = 0.45 + 0.55 * Math.abs(dot3(n, this.light));
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
      ctx.font = it.font || '500 13px "IBM Plex Sans", sans-serif';
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
