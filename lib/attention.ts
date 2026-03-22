export type AttentionState = "focused" | "drifting" | "glazed" | "distracted";

export interface GazePoint {
  x: number;
  y: number;
  timestamp: number;
}

export interface AttentionMetrics {
  fixationDuration: number;
  blinkRate: number;
  saccadeSpeed: number;
  gazeVariance: number;
  pupilDilation: number;
  headPose: { pitch: number; yaw: number };
}

const FIXATION_RADIUS = 50;
const WINDOW_SIZE = 900;

const WARMUP_MS = 30_000;

export class AttentionEngine {
  private gazeBuffer: GazePoint[] = [];
  private blinkTimestamps: number[] = [];
  private lastIrisSize: number = 0;
  private fixationStart: number = 0;
  private fixationCenter: GazePoint | null = null;
  private sessionStart: number = 0;

  addGaze(point: GazePoint) {
    if (this.sessionStart === 0) this.sessionStart = point.timestamp;
    this.gazeBuffer.push(point);
    if (this.gazeBuffer.length > WINDOW_SIZE) {
      this.gazeBuffer.shift();
    }

    if (!this.fixationCenter) {
      this.fixationCenter = point;
      this.fixationStart = point.timestamp;
    } else {
      const dist = Math.hypot(
        point.x - this.fixationCenter.x,
        point.y - this.fixationCenter.y,
      );
      if (dist > FIXATION_RADIUS) {
        this.fixationCenter = point;
        this.fixationStart = point.timestamp;
      }
    }
  }

  addBlink(timestamp: number) {
    this.blinkTimestamps.push(timestamp);
    const cutoff = timestamp - 60_000;
    this.blinkTimestamps = this.blinkTimestamps.filter((t) => t > cutoff);
  }

  setIrisSize(size: number) {
    this.lastIrisSize = size;
  }

  compute(): AttentionMetrics {
    const now = Date.now();
    const points = this.gazeBuffer;

    const fixationDuration = this.fixationCenter
      ? now - this.fixationStart
      : 0;

    const blinkRate = this.blinkTimestamps.length;

    let totalVelocity = 0;
    let velocityCount = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      const dt = (points[i].timestamp - points[i - 1].timestamp) / 1000;
      if (dt > 0) {
        totalVelocity += Math.hypot(dx, dy) / dt;
        velocityCount++;
      }
    }
    const saccadeSpeed = velocityCount > 0 ? totalVelocity / velocityCount : 0;

    const gazeVariance = this.computeGazeVariance(points);

    return {
      fixationDuration,
      blinkRate,
      saccadeSpeed,
      gazeVariance,
      pupilDilation: this.lastIrisSize,
      headPose: { pitch: 0, yaw: 0 },
    };
  }

  private computeGazeVariance(points: GazePoint[]): number {
    if (points.length < 2) return 0;

    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);

    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;

    const varX =
      xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0) / xs.length;
    const varY =
      ys.reduce((sum, y) => sum + (y - meanY) ** 2, 0) / ys.length;

    return Math.sqrt(varX + varY);
  }

  isWarmedUp(): boolean {
    return this.sessionStart > 0 && Date.now() - this.sessionStart > WARMUP_MS;
  }

  classify(metrics: AttentionMetrics): AttentionState {
    // Don't classify during warmup, default to focused
    if (!this.isWarmedUp()) return "focused";

    if (
      metrics.fixationDuration > 2000 &&
      metrics.blinkRate >= 10 &&
      metrics.blinkRate <= 25 &&
      metrics.gazeVariance < 100
    ) {
      return "focused";
    }

    if (metrics.blinkRate < 10 && metrics.gazeVariance < 80) {
      return "glazed";
    }

    if (metrics.saccadeSpeed > 500 && metrics.gazeVariance > 200) {
      return "distracted";
    }

    return "drifting";
  }

  getBuffer(): GazePoint[] {
    return [...this.gazeBuffer];
  }

  clear() {
    this.gazeBuffer = [];
    this.blinkTimestamps = [];
    this.fixationCenter = null;
    this.fixationStart = 0;
    this.sessionStart = 0;
  }
}
