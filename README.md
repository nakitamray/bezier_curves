# Bezier Curve Tool

An interactive tool for visualizing Bézier curves and the linear algebra behind them. Drag the control points around and watch the curve, the de Casteljau construction, and the matrix form all update live.

This is the first piece of a bigger visual math playground. Next up: 3D surfaces from Calc 3 and linear transformations.

## Features

- **Drag control points** and the curve updates in real time (works with mouse and touch)
- **t slider + play button** to sweep a point along the curve (space bar toggles play)
- **de Casteljau construction** draws every level of repeated linear interpolation at the current t
- **Tangent vector B′(t)**, computed from the last two de Casteljau points: B′(t) = n(b₁ − b₀)
- **Convex hull** of the control points (the curve always stays inside it)
- **Matrix form** `B(t) = T · M · P` with the actual numbers for the current curve
- **Bernstein basis plot** showing how much weight each control point gets at t
- **Degree elevation**: the + button adds a control point *without* changing the curve
- Double-click empty space to add a point, double-click a point to remove it

## The math

A degree-n Bézier curve with control points P₀ … Pₙ is

```
B(t) = Σ C(n,i) (1−t)^(n−i) t^i · Pᵢ ,   0 ≤ t ≤ 1
```

Expanding the Bernstein polynomials into powers of t turns it into a matrix product:

```
B(t) = [1  t  t²  …  tⁿ] · M · P
```

where `P` is the (n+1)×2 matrix of control points and `M` is the characteristic matrix with entries

```
M[j][i] = (−1)^(j−i) · C(n,i) · C(n−i, j−i)    for i ≤ j, else 0
```

For a cubic, that's the familiar

```
 1   0   0   0
-3   3   0   0
 3  -6   3   0
-1   3  -3   1
```

## Running it

No build step. Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server
```

then go to http://localhost:8000.

## Project layout

```
index.html     page layout
style.css      styles
js/math.js     bezier math (bernstein, matrix form, de casteljau, convex hull)
js/bezier.js   canvas drawing + interaction
```
