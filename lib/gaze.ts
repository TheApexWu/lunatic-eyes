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

// Head pose landmarks for solvePnP-lite (nose tip, chin, eye corners, mouth corners)
export const HEAD_POSE_LANDMARKS = [1, 33, 263, 61, 291, 199];

export const MESH_COLOR = "#DC143C";
export const IRIS_COLOR = "#FF0000";
export const CONNECTION_COLOR = "rgba(220, 20, 60, 0.4)";

// ---------------------------------------------------------------------------
// 1-Euro Filter: low jitter when still, fast response when moving
// ---------------------------------------------------------------------------
export class OneEuroFilter {
  private freq: number;
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xPrev: number | null = null;
  private dxPrev: number = 0;
  private tPrev: number | null = null;

  constructor(freq = 30, minCutoff = 1.5, beta = 0.01, dCutoff = 1.0) {
    this.freq = freq;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(cutoff: number): number {
    const te = 1.0 / this.freq;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }

  filter(x: number, timestamp?: number): number {
    if (this.tPrev !== null && timestamp !== undefined) {
      const dt = timestamp - this.tPrev;
      if (dt > 0) this.freq = 1.0 / dt;
    }
    this.tPrev = timestamp ?? (this.tPrev ?? 0);

    if (this.xPrev === null) {
      this.xPrev = x;
      return x;
    }

    const dx = (x - this.xPrev) * this.freq;
    const edx = this.alpha(this.dCutoff);
    const dxHat = edx * dx + (1 - edx) * this.dxPrev;
    this.dxPrev = dxHat;

    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = this.alpha(cutoff);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;

    return xHat;
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
}

// ---------------------------------------------------------------------------
// GazeTracker: encapsulates all state (no module-level mutables)
// ---------------------------------------------------------------------------
export class GazeTracker {
  private filterRx = new OneEuroFilter(30, 1.5, 0.01);
  private filterRy = new OneEuroFilter(30, 1.5, 0.01);

  reset() {
    this.filterRx.reset();
    this.filterRy.reset();
  }

  getIrisRatios(
    landmarks: { x: number; y: number }[],
  ): { rx: number; ry: number } | null {
    const leftOuter = landmarks[33];
    const leftInner = landmarks[133];
    const rightOuter = landmarks[362];
    const rightInner = landmarks[263];
    const leftIris = landmarks[468];
    const rightIris = landmarks[473];
    const leftTop = landmarks[159];
    const leftBot = landmarks[145];
    const rightTop = landmarks[386];
    const rightBot = landmarks[374];

    if (!leftOuter || !leftInner || !rightOuter || !rightInner ||
        !leftIris || !rightIris || !leftTop || !leftBot || !rightTop || !rightBot) {
      return null;
    }

    // Both eyes: same direction (inner - outer) so ratios have consistent sign
    const leftW = leftInner.x - leftOuter.x;
    const rightW = rightInner.x - rightOuter.x;
    const leftH = leftBot.y - leftTop.y;
    const rightH = rightBot.y - rightTop.y;

    if (Math.abs(leftW) < 0.01 || Math.abs(rightW) < 0.01 ||
        Math.abs(leftH) < 0.005 || Math.abs(rightH) < 0.005) {
      return null;
    }

    // FIXED: both measured from outer corner
    const leftRatioX = (leftIris.x - leftOuter.x) / leftW;
    const rightRatioX = (rightIris.x - rightOuter.x) / rightW;
    const leftRatioY = (leftIris.y - leftTop.y) / leftH;
    const rightRatioY = (rightIris.y - rightTop.y) / rightH;

    // Weight by eye openness (larger opening = more reliable)
    const leftOpen = Math.abs(leftH);
    const rightOpen = Math.abs(rightH);
    const totalOpen = leftOpen + rightOpen;
    const wL = totalOpen > 0 ? leftOpen / totalOpen : 0.5;
    const wR = totalOpen > 0 ? rightOpen / totalOpen : 0.5;

    const rawRx = wL * leftRatioX + wR * rightRatioX;
    const rawRy = wL * leftRatioY + wR * rightRatioY;

    const now = Date.now() / 1000;
    const rx = this.filterRx.filter(rawRx, now);
    const ry = this.filterRy.filter(rawRy, now);

    return { rx, ry };
  }

  estimateGaze(
    landmarks: { x: number; y: number }[],
    screenW: number,
    screenH: number,
    cal?: GazeCalibration,
  ): { x: number; y: number } | null {
    const ratios = this.getIrisRatios(landmarks);
    if (!ratios) return null;

    const c = cal || DEFAULT_CALIBRATION;
    const rangeX = c.maxRatioX - c.minRatioX || 0.001;
    const rangeY = c.maxRatioY - c.minRatioY || 0.001;

    const normalizedX = (ratios.rx - c.minRatioX) / rangeX;
    const normalizedY = (ratios.ry - c.minRatioY) / rangeY;

    // Mirror X (looking left = screen right when facing camera)
    // Soft clamp with sigmoid-like easing instead of hard clamp
    const clampSoft = (v: number) => {
      if (v >= 0 && v <= 1) return v;
      if (v < 0) return 0.05 * v; // allow slight extrapolation
      return 1 + 0.05 * (v - 1);
    };

    const screenX = (1 - Math.max(0, Math.min(1, clampSoft(normalizedX)))) * screenW;
    const screenY = Math.max(0, Math.min(1, clampSoft(normalizedY))) * screenH;

    return { x: screenX, y: screenY };
  }
}

// ---------------------------------------------------------------------------
// Head pose estimation (lightweight, no solvePnP -- uses landmark geometry)
// ---------------------------------------------------------------------------
export function estimateHeadPose(
  landmarks: { x: number; y: number; z?: number }[],
): { pitch: number; yaw: number } {
  // Use nose tip (1), left eye outer (33), right eye outer (263)
  const nose = landmarks[1];
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const chin = landmarks[152];

  if (!nose || !leftEye || !rightEye || !chin) return { pitch: 0, yaw: 0 };

  // Yaw: asymmetry of nose position between eyes
  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeWidth = Math.abs(rightEye.x - leftEye.x);
  if (eyeWidth < 0.01) return { pitch: 0, yaw: 0 };
  // Positive yaw = head turned right (from user's perspective)
  const yawRatio = (nose.x - eyeMidX) / eyeWidth;
  const yaw = yawRatio * 90; // approximate degrees

  // Pitch: nose-to-eye-midpoint vertical offset relative to face height
  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const faceHeight = Math.abs(chin.y - eyeMidY);
  if (faceHeight < 0.01) return { pitch: 0, yaw };
  const pitchRatio = (nose.y - eyeMidY) / faceHeight;
  // Normalize: ~0.6 is neutral, lower = looking up, higher = looking down
  const pitch = (pitchRatio - 0.6) * 120;

  return { pitch, yaw };
}

// ---------------------------------------------------------------------------
// Legacy exports for backward compatibility
// ---------------------------------------------------------------------------
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

// Calibration types
export interface GazeCalibration {
  minRatioX: number;
  maxRatioX: number;
  minRatioY: number;
  maxRatioY: number;
}

export const DEFAULT_CALIBRATION: GazeCalibration = {
  minRatioX: 0.3,
  maxRatioX: 0.7,
  minRatioY: 0.25,
  maxRatioY: 0.75,
};

// Legacy compat: these are no-ops now, GazeTracker manages its own state
export function resetIrisSmoothing() {}
export function getIrisRatios(
  landmarks: { x: number; y: number }[],
): { rx: number; ry: number } | null {
  // Legacy: create ephemeral tracker (for Calibration component)
  const tracker = new GazeTracker();
  return tracker.getIrisRatios(landmarks);
}
export function estimateGaze(
  landmarks: { x: number; y: number }[],
  screenW: number,
  screenH: number,
  cal?: GazeCalibration,
): { x: number; y: number } | null {
  const tracker = new GazeTracker();
  return tracker.estimateGaze(landmarks, screenW, screenH, cal);
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
