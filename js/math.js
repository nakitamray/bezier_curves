// math helpers for bezier curves
// points are plain {x, y} objects in world units (y up)

function binomial(n, k) {
  if (k < 0 || k > n) return 0;
  let coeff = 1;
  for (let i = 1; i <= k; i++) {
    coeff = (coeff * (n - k + i)) / i;
  }
  return coeff;
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// bernstein basis b_{i,n}(t)
function bernstein(n, i, t) {
  return binomial(n, i) * Math.pow(1 - t, n - i) * Math.pow(t, i);
}

// characteristic matrix M so that  B(t) = [1 t t^2 ... t^n] * M * P
// row j = power of t, column i = control point
function bezierMatrix(n) {
  const M = [];
  for (let j = 0; j <= n; j++) {
    const row = [];
    for (let i = 0; i <= n; i++) {
      if (i > j) {
        row.push(0);
      } else {
        const sign = (j - i) % 2 === 0 ? 1 : -1;
        row.push(sign * binomial(n, i) * binomial(n - i, j - i));
      }
    }
    M.push(row);
  }
  return M;
}

function powerRow(n, t) {
  const row = [];
  for (let j = 0; j <= n; j++) row.push(Math.pow(t, j));
  return row;
}

// row vector times matrix
function rowTimesMatrix(row, M) {
  const out = new Array(M[0].length).fill(0);
  for (let j = 0; j < row.length; j++) {
    for (let i = 0; i < M[j].length; i++) {
      out[i] += row[j] * M[j][i];
    }
  }
  return out;
}

// evaluate with the matrix form so the numbers on screen are the ones actually used
function evalBezierMatrix(points, t) {
  const n = points.length - 1;
  const weights = rowTimesMatrix(powerRow(n, t), bezierMatrix(n));
  let x = 0;
  let y = 0;
  for (let i = 0; i <= n; i++) {
    x += weights[i] * points[i].x;
    y += weights[i] * points[i].y;
  }
  return { x, y };
}

// every level of de casteljau's algorithm
// levels[0] = control points, last level = the single point B(t)
function deCasteljau(points, t) {
  const levels = [points];
  let current = points;
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length - 1; i++) {
      next.push(lerp(current[i], current[i + 1], t));
    }
    levels.push(next);
    current = next;
  }
  return levels;
}

// derivative B'(t) = n * (b1 - b0) where b0, b1 are the two points on the second to last level
function tangentAt(points, t) {
  const n = points.length - 1;
  if (n < 1) return { x: 0, y: 0 };
  const levels = deCasteljau(points, t);
  const [a, b] = levels[levels.length - 2];
  return { x: n * (b.x - a.x), y: n * (b.y - a.y) };
}

function sampleCurve(points, t0, t1, steps) {
  const out = [];
  for (let s = 0; s <= steps; s++) {
    const t = t0 + ((t1 - t0) * s) / steps;
    const levels = deCasteljau(points, t);
    out.push(levels[levels.length - 1][0]);
  }
  return out;
}

// andrew's monotone chain
function convexHull(points) {
  const pts = points.map(p => ({ x: p.x, y: p.y })).sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;

  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}
