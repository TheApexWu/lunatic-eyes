export const IRIS_LEFT = [468, 469, 470, 471, 472];
export const IRIS_RIGHT = [473, 474, 475, 476, 477];
// EAR order: outer, top1, top2, inner, bottom2, bottom1
export const LEFT_EYE = [33, 160, 158, 133, 153, 144];
export const RIGHT_EYE = [362, 385, 387, 263, 373, 380];
// Full contour for drawing (separate from EAR computation)
export const LEFT_EYE_CONTOUR = [33, 160, 159, 158, 133, 144, 145, 153];
export const RIGHT_EYE_CONTOUR = [362, 385, 386, 387, 263, 373, 374, 380];
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379,
  378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
  162, 21, 54, 103, 67, 109,
];

export const MESH_COLOR = "#DC143C";
export const IRIS_COLOR = "#FF0000";
export const CONNECTION_COLOR = "rgba(220, 20, 60, 0.4)";

export function computeEAR(
  landmarks: { x: number; y: number }[],
  eyeIndices: number[],
): number {
  if (eyeIndices.length < 6) return 1;

  const p = eyeIndices.map((i) => landmarks[i]);
  if (!p[0] || !p[1] || !p[2] || !p[3] || !p[4] || !p[5]) return 1;

  const v1 = Math.hypot(p[1].x - p[5].x, p[1].y - p[5].y);
  const v2 = Math.hypot(p[2].x - p[4].x, p[2].y - p[4].y);
  const h = Math.hypot(p[0].x - p[3].x, p[0].y - p[3].y);

  if (h === 0) return 1;
  return (v1 + v2) / (2.0 * h);
}

export function computeIrisSize(
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
): number {
  const leftCenter = landmarks[468];
  const leftEdge = landmarks[469];
  const rightCenter = landmarks[473];
  const rightEdge = landmarks[474];

  if (!leftCenter || !leftEdge || !rightCenter || !rightEdge) return 0;

  // Use vertical iris landmarks (top/bottom poles) for true diameter
  const leftTop = landmarks[470];
  const leftBot = landmarks[471];
  const rightTop = landmarks[475];
  const rightBot = landmarks[476];

  if (!leftTop || !leftBot || !rightTop || !rightBot) return 0;

  const leftDiam = Math.hypot(
    (leftTop.x - leftBot.x) * width,
    (leftTop.y - leftBot.y) * height,
  );

  const rightDiam = Math.hypot(
    (rightTop.x - rightBot.x) * width,
    (rightTop.y - rightBot.y) * height,
  );

  return (leftDiam + rightDiam) / 2;
}

export function drawFaceMesh(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number; z?: number }[],
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = MESH_COLOR;
  for (let i = 0; i < Math.min(landmarks.length, 468); i++) {
    const lm = landmarks[i];
    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = CONNECTION_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < FACE_OVAL.length; i++) {
    const idx = FACE_OVAL[i];
    const lm = landmarks[idx];
    if (!lm) continue;
    if (i === 0) {
      ctx.moveTo(lm.x * width, lm.y * height);
    } else {
      ctx.lineTo(lm.x * width, lm.y * height);
    }
  }
  ctx.closePath();
  ctx.stroke();

  drawEyeOutline(ctx, landmarks, LEFT_EYE_CONTOUR, width, height);
  drawEyeOutline(ctx, landmarks, RIGHT_EYE_CONTOUR, width, height);

  ctx.fillStyle = IRIS_COLOR;
  const allIris = [...IRIS_LEFT, ...IRIS_RIGHT];
  for (const idx of allIris) {
    const lm = landmarks[idx];
    if (!lm) continue;
    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEyeOutline(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  indices: number[],
  width: number,
  height: number,
) {
  ctx.strokeStyle = MESH_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < indices.length; i++) {
    const lm = landmarks[indices[i]];
    if (!lm) continue;
    if (i === 0) {
      ctx.moveTo(lm.x * width, lm.y * height);
    } else {
      ctx.lineTo(lm.x * width, lm.y * height);
    }
  }
  ctx.closePath();
  ctx.stroke();
}

export function drawGazeDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, 20);
  gradient.addColorStop(0, "rgba(220, 20, 60, 0.8)");
  gradient.addColorStop(1, "rgba(220, 20, 60, 0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, 20, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = IRIS_COLOR;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = MESH_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.stroke();
}
