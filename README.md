# Visual Math

Interactive visualizations for linear algebra, multivariable calculus, differential equations and real analysis. Not a study guide, just a place to play with shapes and watch the math change with them.

Everything runs in the browser with plain HTML, CSS and JavaScript. No build step.

## Pages

**Bézier Curves** (`index.html`)
- drag control points, sweep t, watch the de Casteljau construction
- Bernstein form with a table of weights at the current t
- matrix form `B(t) = T · M · P`
- touching a point highlights its term in every equation, its row in M and P, and its basis curve
- degree elevation, tangent vector, convex hull

**3D Surfaces** (`surfaces.html`)
- graphs `z = f(x, y)`: type your own function or use a preset, then move parameters a and b. Shows partial derivatives as slopes of traces, the gradient, the tangent plane, directional derivatives, level curves and the second derivative test (with a Newton's method button to find critical points)
- Bézier surfaces: a bicubic patch you can sculpt by dragging control points, with the matrix form `z = U M Z Mᵀ Vᵀ` and the "surface made of curves" view
- triple integrals: balls, cylinders, cones, ice cream cones and paraboloids in rectangular, cylindrical and spherical coordinates. The Riemann sum cells are drawn in 3D so you can see how each coordinate system chops up the region

**Differential Equations** (`diffeq.html`)
- slope fields with click-to-solve curves and Euler's method step by step
- linear systems `x' = Ax` with eigenvalues, eigenvectors, the general solution and a clickable trace-determinant map
- nonlinear systems (pendulum, predator-prey, Van der Pol, competing species or your own) with nullclines and automatically found and classified equilibria

**Real Analysis** (`analysis.html`)
- ε–δ limits: pick ε, see the largest δ that works (or why none does)
- sequences: ε–N convergence
- upper/lower Darboux sums and left/right/midpoint Riemann sums
- pointwise vs uniform convergence of function sequences

## Running it

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server
```

and go to http://localhost:8000.

## Layout

```
index.html, surfaces.html, diffeq.html, analysis.html
style.css
js/common.js     shared helpers: 2d plotting, sliders, katex, an expression parser
js/math.js       bezier math (bernstein, matrix form, de casteljau, convex hull)
js/view3d.js     small 3d renderer on a 2d canvas (painter's algorithm)
js/bezier.js     bezier page
js/surfaces.js   3d surfaces page
js/diffeq.js     differential equations page
js/analysis.js   real analysis page
lib/katex/       KaTeX for rendering equations (MIT license)
```

## Typing your own functions

Inputs accept things like `sin(x)*y`, `x^2 - 3xy`, `exp(-(x^2 + y^2))`, `|x|`. Supported functions: sin, cos, tan, asin, acos, atan, sinh, cosh, tanh, exp, ln, log, sqrt, abs, sign, floor, min, max, plus the constants pi and e.
