# Locus

An interactive playground for Bézier curves, multivariable calculus, differential equations and real analysis. Drag things around and watch the math change with them.

A locus is the set of points traced out by a rule. Every board here draws one.

## Features

**Bézier curves**
- Drag control points, or slide along the curve to change t, and watch the de Casteljau construction
- Bernstein form with live weights, and the matrix form `B(t) = T · M · P`
- Touching a point highlights its term in every equation, its row and column in the matrices, and its basis curve
- Degree elevation, tangent vector, convex hull and shape presets

**3D surfaces**
- `z = f(x, y)` with your own function: partial derivatives as slopes of traces, gradient, tangent plane, directional derivative, level curves and the second derivative test
- A ball that rolls downhill and a steepest-ascent path
- Bicubic Bézier patches you sculpt by dragging control points
- Triple integrals over balls, cylinders and cones in rectangular, cylindrical and spherical coordinates, with the Riemann sum cells drawn in 3D

**Differential equations**
- Slope fields with solution curves and Euler's method step by step
- Linear systems `x' = Ax` with eigenvalues, eigenvectors and a trace–determinant map
- Nonlinear systems with nullclines and automatically classified equilibria
- A history of every equation you try, to compare them side by side

**Real analysis**
- ε–δ limits, ε–N sequences, upper and lower sums, and pointwise vs uniform convergence, all draggable

## Controls

| Action | What it does |
| --- | --- |
| Drag on a board | Pan (2D) or spin in any direction (3D) |
| Scroll | Zoom |
| Double-tap | Reset the board |
| Drag a dotted number | Change that value in the equation |
| `?` in the top bar | Everything you can do on the current page |

Cards can be dragged by their title, folded, shrunk or hidden.

## Running locally

There is no build step. Serve the folder with any static file server:

```bash
npm start
# or
python3 -m http.server
```

Then open http://localhost:3000 (or :8000 for Python).

## Project structure

```
index.html        Bézier curves
surfaces.html     3D surfaces
diffeq.html       differential equations
analysis.html     real analysis
css/style.css     all styles
js/common.js      shared helpers: 2D plotting, sliders, KaTeX, expression parser
js/ui.js          cards, help panel, number scrubbing, loader
js/math.js        Bézier math
js/view3d.js      3D renderer on a 2D canvas
js/bezier.js      page scripts, one per page
js/surfaces.js
js/diffeq.js
js/analysis.js
lib/              KaTeX and fonts
assets/           favicon
```

## Built with

HTML, CSS and vanilla JavaScript on the Canvas 2D API. The 3D renderer, plotting and expression parser are written from scratch. Equations are typeset with [KaTeX](https://katex.org).

## Credits

- Loader and logo lettering: **Chaos** by Sigrid Liira (2018), supervised by Ott Metusala, [SUVA Type Foundry](https://www.suva.ee/)
- Dosis by Edgar Tolentino, Pablo Impallari and Igino Marini; Syne; Space Mono (SIL Open Font License)

## Author

Made by **Nakita Ray** · [nakitaray.com](https://nakitaray.com)
