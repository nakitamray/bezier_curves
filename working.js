const canvas = document.getElementById('bezierCanvas');
const ctx = canvas.getContext('2d');
const defaultColor = '#00ff00';
const draggedColor = '#008000';
const lightBlue = '#add8e6';
const redColor = '#ff0000';
const controlVectorColor = '#000000'; // Black color for vectors between control points
const interpolationVectorColor = '#000080'; // Navy color for vectors between interpolation points
const midpointVectorColor = ['#800080', '#FF00FF', '#8A2BE2', '#9932CC', '#9400D3', '#8B008B']; // Purple colors for vectors between midpoints
const vectorWidth = 0.5;
let controlPointsCount = 3; // Set the default number of control points to 3
let controlPoints = [];
let interpolationPoints = [];
let midpointVectors = [];
let drawnMidpoints = []; // Store all drawn midpoints
let isMouseDown = false;
let draggedPoint = null;
let interpolationRatios = new Array(controlPointsCount - 1).fill(0.5);
let currentT = 0.5; // Initialize current t value

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (document.getElementById('toggleConvex').checked) {
    // Check if the convex hull toggle is checked
    ctx.fillStyle = '#FFEFD6'; // Set the fill color to #ffe4b6
    ctx.beginPath();
    ctx.moveTo(controlPoints[0].x, controlPoints[0].y);

    // Draw convex hull by connecting control points
    for (let i = 1; i < controlPoints.length; i++) {
      ctx.lineTo(controlPoints[i].x, controlPoints[i].y);
    }

    ctx.closePath(); // Close the path to complete the shape
    ctx.fill(); // Fill the shape with the specified color
  }

  // Draw vectors connecting control points
  drawVectors(controlPoints, controlVectorColor);

  // Draw control points with labels
  drawLabeledPoints(controlPoints, 'P', defaultColor);

  if (document.getElementById('toggleInterpolation').checked) {
    // Draw interpolation points with labels
    drawLabeledPoints(interpolationPoints, 'I', redColor);
    drawVectors(interpolationPoints, interpolationVectorColor);
    drawMidpoints(midpointVectors, midpointVectorColor[0]);
    drawRecursiveMidpoints(midpointVectors, midpointVectorColor.slice(1), currentT);
    connectPurpleVectors(midpointVectors);
  }

  // Draw Bezier curve
  ctx.strokeStyle = lightBlue;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const bezierPoints = generateBezierPoints(controlPoints);
  ctx.moveTo(bezierPoints[0].x, bezierPoints[0].y);
  for (let i = 1; i < bezierPoints.length; i++) {
    ctx.lineTo(bezierPoints[i].x, bezierPoints[i].y);
  }
  ctx.stroke();

  drawnMidpoints = [];
}

function drawLabeledPoints(points, label, color) {
  points.forEach((point, index) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
    ctx.fill();

    // Draw label
    ctx.fillStyle = '#000000'; // Color for labels
    ctx.font = '12px'; // Font for labels
    ctx.fillText(label + index, point.x + 8, point.y - 8);
  });
}

function drawRecursiveMidpoints(points, colors, t) {
  // Check if there are midpoints to draw
  if (document.getElementById('toggleInterpolation').checked && points.length >= 2) {
    // Calculate midpoints for midpoints based on the given t
    const nextMidpoints = generateMidpointVectorsWithRatio(points, t);
    // Draw midpoints
    drawMidpoints(nextMidpoints, colors[0]);
    // Connect midpoints with lines matching their colors
    drawColoredMidpointLines(nextMidpoints, colors);
    // Recursively draw midpoints for midpoints with the same t
    drawRecursiveMidpoints(nextMidpoints, colors.slice(1), t);
    // Store the drawn midpoints for later use
    drawnMidpoints.push(...nextMidpoints);
  }
}

function generateMidpointVectorsWithRatio(points, t) {
  const midpoints = [];
  for (let i = 0; i < points.length - 1; i++) {
    const x = points[i].x + (points[i + 1].x - points[i].x) * t;
    const y = points[i].y + (points[i + 1].y - points[i].y) * t;
    midpoints.push({ x, y });
  }
  return midpoints;
}

function updateMidpointVectorsWithRatio(t) {
  midpointVectors = generateMidpointVectorsWithRatio(interpolationPoints, t);
}

function drawColoredMidpointLines(points, colors) {
  if (document.getElementById('toggleInterpolation').checked) {
    ctx.lineWidth = vectorWidth;
    for (let i = 0; i < points.length - 1; i++) {
      const color = colors[i % colors.length];
      const startPoint = points[i].midpoint || points[i]; // Use midpoint if available, otherwise use the point itself
      const endPoint = points[i + 1].midpoint || points[i + 1];

      // Connect midpoints with lines matching their colors
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(startPoint.x, startPoint.y);
      ctx.lineTo(endPoint.x, endPoint.y);
      ctx.stroke();

      // Draw a small circle at the midpoint for better visualization
      if (points[i].midpoint) {
        ctx.beginPath();
        ctx.arc(points[i].midpoint.x, points[i].midpoint.y, 2, 0, 2 * Math.PI);
        ctx.fill();
      }

      // Connect midpoints with color #800080 (purple)
      if (color === '#800080') {
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(points[i].x, points[i].y);
        ctx.lineTo(points[i].midpoint.x, points[i].midpoint.y);
        ctx.stroke();
      }
    }
  }
}

function connectPurpleVectors(points) {
  ctx.strokeStyle = '#800080'; // Use the color for #800080 (purple)
  ctx.beginPath();

  for (let i = 0; i < points.length - 1; i++) {
    const startPoint = points[i].midpoint || points[i];
    const endPoint = points[i + 1].midpoint || points[i + 1];

    // Connect midpoints with color #800080 (purple)
    ctx.moveTo(startPoint.x, startPoint.y);
    ctx.lineTo(endPoint.x, endPoint.y);
  }

  ctx.stroke();
}

function drawVectors(points, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = vectorWidth;
  for (let i = 0; i < points.length - 1; i++) {
    ctx.beginPath();
    ctx.moveTo(points[i].x, points[i].y);
    ctx.lineTo(points[i + 1].x, points[i + 1].y);
    ctx.stroke();
  }
}

function drawPoints(points, color) {
  points.forEach((point, index) => {
    ctx.fillStyle = point === draggedPoint ? draggedColor : color;

    // Draw the control points (green dots)
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
    ctx.fill();

    // Label the control points on top of the curve
    if (color === defaultColor) {
      ctx.fillStyle = "#000";
      ctx.font = "12px";
      ctx.textAlign = "center";
      ctx.fillText(`P${index}`, point.x, point.y - 15);
    }
  });
}

function drawMidpoints(points, color) {
  ctx.fillStyle = color;
  points.forEach(point => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3, 0, 2 * Math.PI);
    ctx.fill();
  });
}

function calculateInterpolationRatio(point, startPoint, endPoint) {
  const totalDistance = Math.sqrt((endPoint.x - startPoint.x) ** 2 + (endPoint.y - startPoint.y) ** 2);
  const currentDistance = Math.sqrt((point.x - startPoint.x) ** 2 + (point.y - startPoint.y) ** 2);
  return currentDistance / totalDistance;
}

function updateInterpolationRatios() {
  interpolationRatios = interpolationPoints.map((point, index) => {
    const startPoint = controlPoints[index];
    const endPoint = controlPoints[index + 1];
    return calculateInterpolationRatio(point, startPoint, endPoint);
  });
}

function handleInterpolationPointMove(event, index) {
  if (isMouseDown) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Get the current interpolation point and its corresponding control points
    const currentPoint = interpolationPoints[index];
    const startPoint = controlPoints[index];
    const endPoint = controlPoints[index + 1];

    // Calculate the vector connecting the corresponding control points
    const vectorX = endPoint.x - startPoint.x;
    const vectorY = endPoint.y - startPoint.y;

    // Calculate the dot product of the vector and the mouse movement vector
    const dotProduct = (mouseX - startPoint.x) * vectorX + (mouseY - startPoint.y) * vectorY;

    // Calculate the length of the vector
    const vectorLength = Math.sqrt(vectorX ** 2 + vectorY ** 2);

    // Calculate the ratio of the dot product to the vector length
    let ratio = dotProduct / (vectorLength ** 2);

    // Clamp the ratio to the range [0, 1]
    ratio = Math.max(0, Math.min(1, ratio));

    // Calculate the new position of the interpolation point
    const newX = startPoint.x + ratio * vectorX;
    const newY = startPoint.y + ratio * vectorY;

    // Move the current interpolation point within the bounds of the control points' vector
    currentPoint.x = newX;
    currentPoint.y = newY;

    // Recalculate the shared t value based on the movement of the first interpolation point
    const sharedT = calculateInterpolationRatio(currentPoint, startPoint, endPoint);

    // Update the t value for all interpolation points
    for (let i = 0; i < interpolationPoints.length; i++) {
      const startPoint = controlPoints[i];
      const endPoint = controlPoints[i + 1];
      const newT = sharedT;
      const interpolatedX = startPoint.x + (endPoint.x - startPoint.x) * newT;
      const interpolatedY = startPoint.y + (endPoint.y - startPoint.y) * newT;
      interpolationPoints[i].x = interpolatedX;
      interpolationPoints[i].y = interpolatedY;
    }

    // Update the midpoint vectors with the new t value
    updateMidpointVectorsWithRatio(sharedT);

    // Draw the updated canvas
    draw();

    document.getElementById('tValue').innerText = `t: ${sharedT.toFixed(2)}`;
  }
}

function calculateDistance(point1, point2) {
  return Math.sqrt((point2.x - point1.x) ** 2 + (point2.y - point1.y) ** 2);
}

function calculateTotalDistance(points) {
  let totalDistance = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalDistance += calculateDistance(points[i], points[i + 1]);
  }
  return totalDistance;
}

function stopInterpolationPointMove() {
  document.removeEventListener('mousemove', moveInterpolationPoint);
  document.removeEventListener('mouseup', stopInterpolationPointMove);
}

function calculateInterpolationPoints(points) {
  const interpolationPoints = [];
  for (let i = 1; i < points.length; i++) {
    const x = (points[i - 1].x + points[i].x) / 2;
    const y = (points[i - 1].y + points[i].y) / 2;
    interpolationPoints.push({ x, y });
  }
  return interpolationPoints;
}

function generateMidpointVectors(points) {
  const midpoints = [];
  for (let i = 0; i < points.length - 1; i++) {
    const x = (points[i].x + points[i + 1].x) / 2;
    const y = (points[i].y + points[i + 1].y) / 2;
    midpoints.push({ x, y });
  }
  return midpoints;
}

function updateMidpointVectors() {
  midpointVectors = generateMidpointVectors(interpolationPoints);
}

function generateBezierPoints(points) {
  const tValues = [];
  for (let t = 0; t <= 1; t += 0.01) {
    tValues.push(t);
  }

  const bezierPoints = [];
  for (const t of tValues) {
    let x = 0;
    let y = 0;
    for (let i = 0; i < points.length; i++) {
      const binomialCoefficient = binomial(points.length - 1, i);
      const term = binomialCoefficient * (1 - t) ** (points.length - 1 - i) * t ** i;
      x += term * points[i].x;
      y += term * points[i].y;
    }
    bezierPoints.push({ x, y });
  }

  return bezierPoints;
}

function binomial(n, k) {
  let coeff = 1;
  for (let i = n - k + 1; i <= n; i++) {
    coeff *= i;
  }
  for (let i = 1; i <= k; i++) {
    coeff /= i;
  }
  return coeff;
}

function handleMouseDown(event) {
  const rect = canvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;
  isMouseDown = true;

  draggedPoint = controlPoints.find(point => {
    const distance = Math.sqrt((point.x - mouseX) ** 2 + (point.y - mouseY) ** 2);
    return distance < 10;
 
    return distance < 10;
  });

  if (draggedPoint) {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  } else {
    // Check if the clicked point is an interpolation point
    const interpolationIndex = interpolationPoints.findIndex(point => {
      const distance = Math.sqrt((point.x - mouseX) ** 2 + (point.y - mouseY) ** 2);
      return distance < 10;
    });

    if (interpolationIndex !== -1) {
      document.addEventListener('mousemove', (event) => {
        if (isMouseDown) {
          handleInterpolationPointMove(event, interpolationIndex);
        }
      });
      document.addEventListener('mouseup', () => {
        isMouseDown = false;
      });
    }
  }

  draw();
}

function handleMouseMove(event) {
  const rect = canvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;

  if (draggedPoint) {
    draggedPoint.x = mouseX;
    draggedPoint.y = mouseY;
  }

  // Recalculate interpolation points and midpoint vectors as control points are moved
  interpolationPoints = calculateInterpolationPoints(controlPoints);
  updateMidpointVectorsWithRatio(currentT);

  draw();
}

function handleMouseUp() {
  draggedPoint = null;
  isMouseDown = false;

  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  draw();
}

function updateControlPoints() {
  controlPointsCount = parseInt(document.getElementById('controlPointsInput').value, 10);
  generateDefaultControlPoints();
  drawnMidpoints = []; // Reset drawn midpoints when control points are updated
  draw();
}

function generateDefaultControlPoints() {
  controlPoints = [];
  const radius = Math.min(canvas.width, canvas.height) / 3;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  for (let i = 0; i < controlPointsCount; i++) {
    const angle = (i / controlPointsCount) * 2 * Math.PI;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    controlPoints.push({ x, y });
  }

  interpolationPoints = calculateInterpolationPoints(controlPoints);
  updateMidpointVectorsWithRatio(currentT);
}

canvas.addEventListener('mousedown', handleMouseDown);
document.getElementById('updateControlPointsButton').addEventListener('click', updateControlPoints);

generateDefaultControlPoints();

draw(); // Initial draw
