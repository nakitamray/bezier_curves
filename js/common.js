// shared stuff for every page: colors, canvas setup, katex, a small 2d plot,
// and an expression parser so people can type their own functions

const COLORS = {
  bg: '#1d1d1d',
  panel: '#252525',
  line: '#383838',
  grid: 'rgba(239, 230, 207, 0.06)',
  axis: 'rgba(239, 230, 207, 0.28)',
  axisText: 'rgba(239, 230, 207, 0.45)',
  cream: '#efe6cf',
  creamDim: 'rgba(239, 230, 207, 0.35)',
  white: '#fafafa',
  yellow: '#e9c46a',
  yellowBright: '#f5d36b',
  yellowDim: 'rgba(233, 196, 106, 0.25)',
  muted: '#9d978a'
};

// used when several things need telling apart but should still feel like one palette
const TONES = ['#e9c46a', '#efe6cf', '#c4a35a', '#fafafa', '#d9b26f', '#b5ad9c', '#f2dd9b', '#8f897d'];

const HL = '#f5d36b'; // highlight color inside equations

function fmt(v, digits = 2) {
  if (!isFinite(v)) return v > 0 ? '∞' : v < 0 ? '-∞' : '—';
  const s = v.toFixed(digits);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
}

// trims trailing zeros, for numbers that go inside equations
function num(v, digits = 2) {
  let s = fmt(v, digits);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function tex(el, src, display = false) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (!el) return;
  if (window.katex) {
    katex.render(src, el, { throwOnError: false, displayMode: display });
  } else {
    el.textContent = src;
  }
}

function hl(s, on = true) {
  return on ? `\\textcolor{${HL}}{${s}}` : s;
}

// ---------- canvas ----------

function setupCanvas(canvas, onResize) {
  const ctx = canvas.getContext('2d');
  const view = { ctx, width: 0, height: 0, dpr: 1 };
  let ready = false;
  const resize = () => {
    view.dpr = window.devicePixelRatio || 1;
    view.width = canvas.clientWidth;
    view.height = canvas.clientHeight;
    canvas.width = Math.round(view.width * view.dpr);
    canvas.height = Math.round(view.height * view.dpr);
    if (onResize && ready) onResize();
  };
  new ResizeObserver(resize).observe(canvas);
  view.begin = () => {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
  };
  resize();
  ready = true; // the observer fires once on its own, after the page script has set things up
  return view;
}

function pointerPos(canvas, e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// 2d plot with world coordinates. if equal is true one unit is the same in x and y
class Plot2D {
  constructor(canvas, bounds, opts = {}) {
    this.canvas = canvas;
    this.bounds = bounds; // {xmin, xmax, ymin, ymax}
    this.equal = opts.equal !== false;
    this.pad = opts.pad || 0;
    this.onResize = opts.onResize;
    this.view = setupCanvas(canvas, () => this.onResize && this.onResize());
    this.ctx = this.view.ctx;
  }

  get width() { return this.view.width; }
  get height() { return this.view.height; }

  frame() {
    const { xmin, xmax, ymin, ymax } = this.bounds;
    const w = this.width - 2 * this.pad;
    const h = this.height - 2 * this.pad;
    let sx = w / (xmax - xmin);
    let sy = h / (ymax - ymin);
    if (this.equal) sx = sy = Math.min(sx, sy);
    const cx = (xmin + xmax) / 2;
    const cy = (ymin + ymax) / 2;
    return { sx, sy, cx, cy };
  }

  // visible world rectangle (bigger than bounds when equal aspect)
  visible() {
    const f = this.frame();
    return {
      xmin: f.cx - this.width / 2 / f.sx,
      xmax: f.cx + this.width / 2 / f.sx,
      ymin: f.cy - this.height / 2 / f.sy,
      ymax: f.cy + this.height / 2 / f.sy
    };
  }

  toScreen(x, y) {
    const f = this.frame();
    return { x: this.width / 2 + (x - f.cx) * f.sx, y: this.height / 2 - (y - f.cy) * f.sy };
  }

  toWorld(px, py) {
    const f = this.frame();
    return { x: f.cx + (px - this.width / 2) / f.sx, y: f.cy - (py - this.height / 2) / f.sy };
  }

  begin() {
    this.view.begin();
  }

  grid(opts = {}) {
    const ctx = this.ctx;
    const v = this.visible();
    const step = opts.step || niceStep((v.xmax - v.xmin) / 12);
    const ystep = opts.ystep || (this.equal ? step : niceStep((v.ymax - v.ymin) / 8));
    const labelEvery = opts.labelEvery || 2;

    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    for (let x = Math.ceil(v.xmin / step) * step; x <= v.xmax; x += step) {
      const s = this.toScreen(x, 0);
      ctx.moveTo(Math.round(s.x) + 0.5, 0);
      ctx.lineTo(Math.round(s.x) + 0.5, this.height);
    }
    for (let y = Math.ceil(v.ymin / ystep) * ystep; y <= v.ymax; y += ystep) {
      const s = this.toScreen(0, y);
      ctx.moveTo(0, Math.round(s.y) + 0.5);
      ctx.lineTo(this.width, Math.round(s.y) + 0.5);
    }
    ctx.stroke();

    const o = this.toScreen(0, 0);
    const ox = clamp(o.x, 0, this.width);
    const oy = clamp(o.y, 0, this.height);
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(oy) + 0.5);
    ctx.lineTo(this.width, Math.round(oy) + 0.5);
    ctx.moveTo(Math.round(ox) + 0.5, 0);
    ctx.lineTo(Math.round(ox) + 0.5, this.height);
    ctx.stroke();

    if (opts.labels === false) return;
    ctx.fillStyle = COLORS.axisText;
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    let i = 0;
    for (let x = Math.ceil(v.xmin / step) * step; x <= v.xmax; x += step, i++) {
      if (Math.abs(x) < step / 2) continue;
      if (Math.round(x / step) % labelEvery !== 0) continue;
      const s = this.toScreen(x, 0);
      ctx.fillText(num(x, 2), s.x, clamp(oy + 4, 2, this.height - 14));
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let y = Math.ceil(v.ymin / ystep) * ystep; y <= v.ymax; y += ystep) {
      if (Math.abs(y) < ystep / 2) continue;
      if (Math.round(y / ystep) % labelEvery !== 0) continue;
      const s = this.toScreen(0, y);
      ctx.fillText(num(y, 2), clamp(ox - 5, 24, this.width - 4), s.y);
    }
  }

  line(x1, y1, x2, y2, color, width = 1, dash) {
    const a = this.toScreen(x1, y1);
    const b = this.toScreen(x2, y2);
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  path(points, color, width = 1.5, dash) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    let pen = false;
    for (const p of points) {
      if (!p || !isFinite(p.x) || !isFinite(p.y)) { pen = false; continue; }
      const s = this.toScreen(p.x, p.y);
      if (!pen) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
      pen = true;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // graph of y = f(x), breaks the line at jumps / blowups
  graph(f, color, width = 2, x0, x1) {
    const v = this.visible();
    const a = x0 !== undefined ? x0 : v.xmin;
    const b = x1 !== undefined ? x1 : v.xmax;
    const n = Math.max(200, Math.round(this.width));
    const pts = [];
    const span = v.ymax - v.ymin;
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const x = a + ((b - a) * i) / n;
      const y = f(x);
      if (prev !== null && isFinite(y) && Math.abs(y - prev) > span * 0.5) pts.push(null);
      pts.push(isFinite(y) ? { x, y } : null);
      prev = isFinite(y) ? y : null;
    }
    this.path(pts, color, width);
  }

  dot(x, y, r, fill, stroke, strokeWidth = 2) {
    const s = this.toScreen(x, y);
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth; ctx.stroke(); }
  }

  rect(x0, y0, x1, y1, fill, stroke) {
    const a = this.toScreen(x0, y0);
    const b = this.toScreen(x1, y1);
    const ctx = this.ctx;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, h); }
  }

  arrow(x, y, dx, dy, color, width = 1.5, headSize = 7) {
    const a = this.toScreen(x, y);
    const b = this.toScreen(x + dx, y + dy);
    drawArrow(this.ctx, a, b, color, width, headSize);
  }

  text(str, x, y, color, align = 'left', baseline = 'bottom', font) {
    const s = this.toScreen(x, y);
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.font = font || '500 12px "IBM Plex Sans", sans-serif';
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(str, s.x, s.y);
  }
}

function drawArrow(ctx, a, b, color, width = 1.5, headSize = 7) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1) return;
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const head = Math.min(headSize, len * 0.5);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x - Math.cos(ang) * head * 0.6, b.y - Math.sin(ang) * head * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - head * Math.cos(ang - 0.42), b.y - head * Math.sin(ang - 0.42));
  ctx.lineTo(b.x - head * Math.cos(ang + 0.42), b.y - head * Math.sin(ang + 0.42));
  ctx.closePath();
  ctx.fill();
}

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  if (m < 1.5) return p;
  if (m < 3.5) return 2 * p;
  if (m < 7.5) return 5 * p;
  return 10 * p;
}

// ---------- ui helpers ----------

// wires up a range input with a value label next to it
function slider(id, onInput, digits = 2) {
  const el = document.getElementById(id);
  const out = document.querySelector(`[data-for="${id}"]`);
  const update = () => {
    if (out) out.textContent = fmt(parseFloat(el.value), digits);
    const pct = ((el.value - el.min) / (el.max - el.min)) * 100;
    el.style.setProperty('--fill', pct + '%');
  };
  el.addEventListener('input', () => { update(); onInput(parseFloat(el.value)); });
  update();
  return {
    el,
    get value() { return parseFloat(el.value); },
    set value(v) { el.value = v; update(); }
  };
}

// little segmented tab control inside a page. calls onChange(key)
function modeTabs(containerId, onChange) {
  const root = document.getElementById(containerId);
  const buttons = [...root.querySelectorAll('[data-mode]')];
  const select = key => {
    buttons.forEach(b => b.classList.toggle('active', b.dataset.mode === key));
    document.querySelectorAll('[data-panel]').forEach(p => {
      p.hidden = p.dataset.panel !== key;
    });
    if (location.hash.slice(1) !== key) history.replaceState(null, '', '#' + key);
    onChange(key);
  };
  buttons.forEach(b => b.addEventListener('click', () => select(b.dataset.mode)));
  const start = buttons.find(b => b.dataset.mode === location.hash.slice(1)) || buttons[0];
  select(start.dataset.mode);
  return select;
}

// ---------- expression parser ----------
// turns "a*sin(x)^2 + 3y" into a tree that can be evaluated and printed as latex

const FUNCS = {
  sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan',
  asin: 'Math.asin', acos: 'Math.acos', atan: 'Math.atan',
  sinh: 'Math.sinh', cosh: 'Math.cosh', tanh: 'Math.tanh',
  exp: 'Math.exp', ln: 'Math.log', log: 'Math.log10',
  sqrt: 'Math.sqrt', abs: 'Math.abs', sign: 'Math.sign',
  floor: 'Math.floor', min: 'Math.min', max: 'Math.max'
};
const CONSTS = { pi: Math.PI, e: Math.E };

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      tokens.push({ type: 'num', value: parseFloat(src.slice(i, j)) });
      i = j;
    } else if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z_0-9]/.test(src[j])) j++;
      tokens.push({ type: 'id', value: src.slice(i, j) });
      i = j;
    } else if ('+-*/^(),|'.includes(c)) {
      tokens.push({ type: 'op', value: c });
      i++;
    } else {
      throw new Error(`unexpected "${c}"`);
    }
  }
  return tokens;
}

function parseExpr(src, vars) {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = v => peek() && peek().type === 'op' && peek().value === v;
  const expect = v => {
    if (!isOp(v)) throw new Error(`expected "${v}"`);
    pos++;
  };

  // splits things like "xy" into x*y when both are variables
  function identifier(name) {
    if (vars.includes(name) || name in CONSTS) return name in CONSTS && !vars.includes(name) ? { type: 'const', name } : { type: 'var', name };
    if ([...name].every(ch => vars.includes(ch))) {
      return [...name].map(ch => ({ type: 'var', name: ch })).reduce((a, b) => ({ type: 'bin', op: '*', a, b }));
    }
    throw new Error(`unknown name "${name}"`);
  }

  function atom() {
    const t = peek();
    if (!t) throw new Error('unexpected end');
    if (t.type === 'num') { pos++; return { type: 'num', value: t.value }; }
    if (t.type === 'id') {
      pos++;
      if (t.value in FUNCS && isOp('(')) {
        pos++;
        const args = [expr()];
        while (isOp(',')) { pos++; args.push(expr()); }
        expect(')');
        return { type: 'func', name: t.value, args };
      }
      return identifier(t.value);
    }
    if (isOp('(')) { pos++; const e = expr(); expect(')'); return { type: 'paren', e }; }
    if (isOp('|')) { pos++; const e = expr(); expect('|'); return { type: 'func', name: 'abs', args: [e] }; }
    throw new Error(`unexpected "${t.value}"`);
  }

  function power() {
    const base = atom();
    if (isOp('^')) { pos++; return { type: 'bin', op: '^', a: base, b: unary() }; }
    return base;
  }

  function unary() {
    if (isOp('-')) { pos++; return { type: 'neg', a: unary() }; }
    if (isOp('+')) { pos++; return unary(); }
    return power();
  }

  function term() {
    let left = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = peek().value;
        pos++;
        left = { type: 'bin', op, a: left, b: unary() };
      } else if (peek() && (peek().type === 'num' || peek().type === 'id' || isOp('('))) {
        // implicit multiplication: 2x, 3sin(x), (x+1)(x-1)
        left = { type: 'bin', op: '*', a: left, b: power() };
      } else {
        return left;
      }
    }
  }

  function expr() {
    let left = term();
    while (isOp('+') || isOp('-')) {
      const op = peek().value;
      pos++;
      left = { type: 'bin', op, a: left, b: term() };
    }
    return left;
  }

  const tree = expr();
  if (pos < tokens.length) throw new Error(`unexpected "${tokens[pos].value}"`);
  return tree;
}

function toJs(n) {
  switch (n.type) {
    case 'num': return `(${n.value})`;
    case 'var': return `v.${n.name}`;
    case 'const': return `(${CONSTS[n.name]})`;
    case 'paren': return toJs(n.e);
    case 'neg': return `(-${toJs(n.a)})`;
    case 'func': return `${FUNCS[n.name]}(${n.args.map(toJs).join(',')})`;
    case 'bin': return n.op === '^' ? `Math.pow(${toJs(n.a)},${toJs(n.b)})` : `(${toJs(n.a)}${n.op}${toJs(n.b)})`;
  }
}

// compile("x^2 + a*y", ['x','y','a']) -> f({x, y, a})
function compileExpr(src, vars) {
  const tree = parseExpr(src, vars);
  const fn = new Function('v', `return ${toJs(tree)};`);
  return { tree, fn };
}

// ---------- latex from the tree ----------
// params: values to plug in for letters like a, b. highlight: which param to color

const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, neg: 2, '^': 4 };

function prec(n) {
  if (n.type === 'bin') return PREC[n.op];
  if (n.type === 'neg') return PREC.neg;
  if (n.type === 'num' && n.value < 0) return PREC.neg;
  return 5;
}

function wrap(s) {
  return `\\left(${s}\\right)`;
}

function isNumberish(n, params) {
  return n.type === 'num' || (n.type === 'var' && params && n.name in params) || n.type === 'const';
}

function isNegative(n, params) {
  if (n.type === 'num') return n.value < 0;
  if (n.type === 'var' && params && n.name in params) return params[n.name] < -1e-9;
  if (n.type === 'neg') return true;
  if (n.type === 'bin' && (n.op === '*' || n.op === '/')) return isNegative(n.a, params);
  return false;
}

// the same node with its leading minus taken off
function negated(n, params) {
  if (n.type === 'num') return { type: 'num', value: -n.value };
  if (n.type === 'var') return { ...n, flip: true };
  if (n.type === 'neg') return n.a;
  if (n.type === 'bin') return { ...n, a: negated(n.a, params) };
  return n;
}

function toTex(n, params = {}, highlight = null) {
  const T = m => toTex(m, params, highlight);
  switch (n.type) {
    case 'num': return num(n.value, 3);
    case 'const': return n.name === 'pi' ? '\\pi' : 'e';
    case 'var': {
      if (n.name in params) {
        const v = n.flip ? -params[n.name] : params[n.name];
        return hl(num(v, 2), highlight === n.name);
      }
      return n.name === 'theta' ? '\\theta' : n.name;
    }
    case 'paren': return T(n.e);
    case 'neg': {
      const inner = T(n.a);
      return '-' + (prec(n.a) <= PREC['+'] ? wrap(inner) : inner);
    }
    case 'func': {
      const args = n.args.map(T);
      if (n.name === 'sqrt') return `\\sqrt{${args[0]}}`;
      if (n.name === 'abs') return `\\left|${args[0]}\\right|`;
      if (n.name === 'exp') return `e^{${args[0]}}`;
      const named = ['sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh', 'ln', 'log', 'exp', 'min', 'max'];
      const name = named.includes(n.name) ? `\\${n.name}` : `\\operatorname{${n.name}}`;
      return `${name}${wrap(args.join(', '))}`;
    }
    case 'bin': {
      const { op, a, b } = n;
      if (op === '/') return `\\frac{${T(a)}}{${T(b)}}`;
      if (op === '^') {
        let base = T(a);
        if (prec(a) < 5 || a.type === 'func' || isNegative(a, params)) base = wrap(base);
        return `${base}^{${T(b)}}`;
      }
      if (op === '+' || op === '-') {
        const left = T(a);
        let sign = op;
        let right = b;
        if (isNegative(b, params)) {
          sign = op === '+' ? '-' : '+';
          right = negated(b, params);
        }
        let rs = T(right);
        if (sign === '-' && prec(right) <= PREC['+']) rs = wrap(rs);
        return `${left} ${sign} ${rs}`;
      }
      // multiplication
      let ls = T(a);
      let rs = T(b);
      if (prec(a) < PREC['*']) ls = wrap(ls);
      if (prec(b) <= PREC['*'] || isNegative(b, params)) rs = wrap(rs);
      const juxtapose = !isNumberish(b, params) || (b.type === 'bin' && b.op === '^' && !isNumberish(b.a, params));
      if (isNumberish(a, params) && isNumberish(b, params)) return `${ls} \\cdot ${rs}`;
      return juxtapose ? `${ls}\\,${rs}` : `${ls} \\cdot ${rs}`;
    }
  }
  return '';
}
