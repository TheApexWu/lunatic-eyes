// Attention states: focused, drifting, glazed, away (renamed from "distracted")
export type AttentionState = "locked-in" | "drifting" | "glazed" | "away";

export interface GazePoint {
  x: number;
  y: number;
  timestamp: number;
}

// New metric interface: human-readable, normalized 0-100
export interface AttentionMetrics {
  focusScore: number;         // composite 0-100
  gazeStability: number;      // 0-100 (inverted variance, higher = better)
  engagementDepth: number;    // 0-100 (fixation quality / K-coefficient)
  screenPresence: number;     // 0-100 (head on-screen ratio)
  alertness: number;          // 0-100 (blink rate relative to baseline)
  // Raw values for internal use
  rawFixationDuration: number;
  rawBlinkRate: number;       // blinks per minute (properly normalized)
  rawGazeVariance: number;    // px, windowed
  rawSaccadeAmplitude: number; // px avg distance between fixations
  headPose: { pitch: number; yaw: number };
  // Session stats
  onScreenRatio: number;      // 0-1
  focusStreak: number;        // current streak in ms
  distractionEvents: number;  // count of off-screen >2s events
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const GAZE_BUFFER_MAX = 1800;  // ~60s at 30fps
const METRIC_WINDOW_MS = 5000; // 5-second rolling window for metrics
const BASELINE_WINDOW_MS = 60000; // 60-second rolling baseline
const WARMUP_MS = 15000;       // 15s warmup (collect baseline)
const FIXATION_RADIUS = 50;    // px
const OFF_SCREEN_THRESHOLD_MS = 2000; // 2s = "away"
const HEAD_YAW_THRESHOLD = 20;  // degrees
const HEAD_PITCH_THRESHOLD = 15; // degrees

// Debounce: how long a state must persist before it's "real"
const DEBOUNCE = {
  drifting: 6000,   // 6s before declaring drifting
  glazed: 10000,    // 10s before declaring glazed
  away: 2000,       // 2s off-screen = immediate
  recovery: 3000,   // 3s to recover to focused
};

// Focus score weights
const WEIGHTS = {
  gazeStability: 0.35,
  engagementDepth: 0.30,
  screenPresence: 0.25,
  alertness: 0.10,
};

// ---------------------------------------------------------------------------
// Baseline tracker: rolling stats for normalization
// ---------------------------------------------------------------------------
interface BaselineStats {
  fixationDuration: { sum: number; sumSq: number; count: number };
  gazeVariance: { sum: number; sumSq: number; count: number };
  saccadeAmplitude: { sum: number; sumSq: number; count: number };
  blinkRate: { sum: number; sumSq: number; count: number };
}

function emptyBaseline(): BaselineStats {
  return {
    fixationDuration: { sum: 0, sumSq: 0, count: 0 },
    gazeVariance: { sum: 0, sumSq: 0, count: 0 },
    saccadeAmplitude: { sum: 0, sumSq: 0, count: 0 },
    blinkRate: { sum: 0, sumSq: 0, count: 0 },
  };
}

function baselineMean(stat: { sum: number; count: number }): number {
  return stat.count > 0 ? stat.sum / stat.count : 0;
}

function baselineStd(stat: { sum: number; sumSq: number; count: number }): number {
  if (stat.count < 2) return 1;
  const mean = stat.sum / stat.count;
  const variance = stat.sumSq / stat.count - mean * mean;
  return Math.sqrt(Math.max(0, variance)) || 1;
}

// ---------------------------------------------------------------------------
// AttentionEngine
// ---------------------------------------------------------------------------
export class AttentionEngine {
  private gazeBuffer: GazePoint[] = [];
  private blinkTimestamps: number[] = [];
  private sessionStart: number = 0;
  private baseline: BaselineStats = emptyBaseline();

  // Fixation tracking
  private fixationCenter: GazePoint | null = null;
  private fixationStart: number = 0;
  private fixations: { x: number; y: number; duration: number; end: number }[] = [];

  // Head pose (set externally per frame)
  private lastHeadPose: { pitch: number; yaw: number } = { pitch: 0, yaw: 0 };
  private headOnScreenSamples: boolean[] = [];

  // State tracking with debounce
  private rawState: AttentionState = "locked-in";
  private rawStateSince: number = 0;
  private confirmedState: AttentionState = "locked-in";
  private confirmedStateSince: number = 0;

  // Session counters
  private focusStreakStart: number = 0;
  private distractionEvents: number = 0;
  private lastOffScreen: number = 0;
  private isOffScreen: boolean = false;

  addGaze(point: GazePoint) {
    if (this.sessionStart === 0) {
      this.sessionStart = point.timestamp;
      this.focusStreakStart = point.timestamp;
      this.confirmedStateSince = point.timestamp;
      this.rawStateSince = point.timestamp;
    }
    this.gazeBuffer.push(point);
    if (this.gazeBuffer.length > GAZE_BUFFER_MAX) {
      this.gazeBuffer.shift();
    }

    // Fixation detection with hysteresis
    if (!this.fixationCenter) {
      this.fixationCenter = point;
      this.fixationStart = point.timestamp;
    } else {
      const dist = Math.hypot(
        point.x - this.fixationCenter.x,
        point.y - this.fixationCenter.y,
      );
      // Only break fixation if movement exceeds threshold AND is sustained
      if (dist > FIXATION_RADIUS) {
        const fixDuration = point.timestamp - this.fixationStart;
        if (fixDuration > 100) { // ignore micro-fixations <100ms
          this.fixations.push({
            x: this.fixationCenter.x,
            y: this.fixationCenter.y,
            duration: fixDuration,
            end: point.timestamp,
          });
          // Trim old fixations (keep last 60s)
          const cutoff = point.timestamp - BASELINE_WINDOW_MS;
          this.fixations = this.fixations.filter(f => f.end > cutoff);
        }
        this.fixationCenter = point;
        this.fixationStart = point.timestamp;
      }
    }
  }

  addBlink(timestamp: number) {
    this.blinkTimestamps.push(timestamp);
    const cutoff = timestamp - BASELINE_WINDOW_MS;
    this.blinkTimestamps = this.blinkTimestamps.filter((t) => t > cutoff);
  }

  setHeadPose(pose: { pitch: number; yaw: number }) {
    this.lastHeadPose = pose;
    const onScreen = Math.abs(pose.yaw) < HEAD_YAW_THRESHOLD &&
                     Math.abs(pose.pitch) < HEAD_PITCH_THRESHOLD;
    this.headOnScreenSamples.push(onScreen);
    if (this.headOnScreenSamples.length > 300) { // ~10s at 30fps
      this.headOnScreenSamples.shift();
    }
  }

  isWarmedUp(): boolean {
    return this.sessionStart > 0 && Date.now() - this.sessionStart > WARMUP_MS;
  }

  // ---------------------------------------------------------------------------
  // Compute metrics from rolling windows
  // ---------------------------------------------------------------------------
  compute(): AttentionMetrics {
    const now = Date.now();

    // Get points in the metric window (last 5 seconds)
    const windowStart = now - METRIC_WINDOW_MS;
    const windowPoints = this.gazeBuffer.filter(p => p.timestamp > windowStart);

    // Raw metrics
    const rawGazeVariance = this.computeGazeVariance(windowPoints);
    const rawFixationDuration = this.fixationCenter
      ? now - this.fixationStart
      : 0;
    const rawBlinkRate = this.computeBlinkRate(now);
    const rawSaccadeAmplitude = this.computeSaccadeAmplitude(now);

    // Update baseline (only after warmup)
    if (this.isWarmedUp()) {
      this.updateBaseline(rawGazeVariance, rawFixationDuration, rawBlinkRate, rawSaccadeAmplitude);
    }

    // Normalized scores (0-100)
    const gazeStability = this.normalizeGazeStability(rawGazeVariance);
    const engagementDepth = this.normalizeEngagement(rawFixationDuration, rawSaccadeAmplitude);
    const screenPresence = this.computeScreenPresence();
    const alertness = this.normalizeAlertness(rawBlinkRate);

    // Composite focus score
    const focusScore = Math.round(Math.min(100, Math.max(0,
      WEIGHTS.gazeStability * gazeStability +
      WEIGHTS.engagementDepth * engagementDepth +
      WEIGHTS.screenPresence * screenPresence +
      WEIGHTS.alertness * alertness
    )));

    // On-screen ratio
    const totalSamples = this.headOnScreenSamples.length;
    const onScreenCount = this.headOnScreenSamples.filter(Boolean).length;
    const onScreenRatio = totalSamples > 0 ? onScreenCount / totalSamples : 1;

    // Focus streak
    const focusStreak = this.confirmedState === "locked-in"
      ? now - this.focusStreakStart
      : 0;

    return {
      focusScore,
      gazeStability: Math.round(gazeStability),
      engagementDepth: Math.round(engagementDepth),
      screenPresence: Math.round(screenPresence),
      alertness: Math.round(alertness),
      rawFixationDuration,
      rawBlinkRate,
      rawGazeVariance,
      rawSaccadeAmplitude,
      headPose: { ...this.lastHeadPose },
      onScreenRatio,
      focusStreak,
      distractionEvents: this.distractionEvents,
    };
  }

  // ---------------------------------------------------------------------------
  // Classification with debounce
  // ---------------------------------------------------------------------------
  classify(metrics: AttentionMetrics): AttentionState {
    if (!this.isWarmedUp()) return "locked-in";

    const now = Date.now();

    // Layer 1: AWAY detection (high confidence, fast trigger)
    const headAway = Math.abs(this.lastHeadPose.yaw) > HEAD_YAW_THRESHOLD + 10 ||
                     Math.abs(this.lastHeadPose.pitch) > HEAD_PITCH_THRESHOLD + 10;
    if (headAway) {
      if (!this.isOffScreen) {
        this.isOffScreen = true;
        this.lastOffScreen = now;
      }
      if (now - this.lastOffScreen > DEBOUNCE.away) {
        this.distractionEvents++;
        this.isOffScreen = false;
        return this.transitionState("away", now);
      }
    } else {
      this.isOffScreen = false;
    }

    // Layer 2: Baseline-relative classification
    const baseFix = baselineMean(this.baseline.fixationDuration);
    const baseVar = baselineMean(this.baseline.gazeVariance);

    // Ratios relative to personal baseline
    const fixRatio = baseFix > 0 ? metrics.rawFixationDuration / baseFix : 1;
    const varRatio = baseVar > 0 ? metrics.rawGazeVariance / baseVar : 1;

    // GLAZED: very long fixations + minimal movement + persists
    const isGlazed = fixRatio > 2.0 &&
                     metrics.rawGazeVariance < baseVar * 0.5 &&
                     metrics.gazeStability > 80; // paradoxically "stable" because eyes are frozen

    // DRIFTING: fixation duration rising + saccade structure degrading
    const isDrifting = fixRatio > 1.3 &&
                       metrics.gazeStability < 50;

    let rawState: AttentionState = "locked-in";
    if (isGlazed) rawState = "glazed";
    else if (isDrifting) rawState = "drifting";

    return this.transitionState(rawState, now);
  }

  private transitionState(newRaw: AttentionState, now: number): AttentionState {
    // Track raw state changes
    if (newRaw !== this.rawState) {
      this.rawState = newRaw;
      this.rawStateSince = now;
    }

    const rawDuration = now - this.rawStateSince;

    // Debounce logic: require persistence before confirming
    if (newRaw === "locked-in") {
      // Fast recovery
      if (rawDuration > DEBOUNCE.recovery) {
        if (this.confirmedState !== "locked-in") {
          this.confirmedState = "locked-in";
          this.confirmedStateSince = now;
          this.focusStreakStart = now;
        }
      }
    } else if (newRaw === "away") {
      // Away triggers fast
      this.confirmedState = "away";
      this.confirmedStateSince = now;
    } else if (newRaw === "glazed") {
      if (rawDuration > DEBOUNCE.glazed) {
        this.confirmedState = "glazed";
        this.confirmedStateSince = now;
      }
    } else if (newRaw === "drifting") {
      if (rawDuration > DEBOUNCE.drifting) {
        this.confirmedState = "drifting";
        this.confirmedStateSince = now;
      }
    }

    return this.confirmedState;
  }

  // ---------------------------------------------------------------------------
  // Metric computation helpers
  // ---------------------------------------------------------------------------
  private computeGazeVariance(points: GazePoint[]): number {
    if (points.length < 2) return 0;

    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);

    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;

    const varX = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0) / xs.length;
    const varY = ys.reduce((sum, y) => sum + (y - meanY) ** 2, 0) / ys.length;

    return Math.sqrt(varX + varY);
  }

  private computeBlinkRate(now: number): number {
    // Count blinks in last 30 seconds, normalize to per-minute
    const window = 30000;
    const cutoff = now - window;
    const recentBlinks = this.blinkTimestamps.filter(t => t > cutoff).length;
    const elapsedSec = Math.min(window, now - this.sessionStart) / 1000;
    if (elapsedSec < 1) return 0;
    return (recentBlinks / elapsedSec) * 60;
  }

  private computeSaccadeAmplitude(now: number): number {
    // Average distance between consecutive fixation centers (last 10s)
    const cutoff = now - 10000;
    const recent = this.fixations.filter(f => f.end > cutoff);
    if (recent.length < 2) return 0;

    let totalDist = 0;
    for (let i = 1; i < recent.length; i++) {
      totalDist += Math.hypot(
        recent[i].x - recent[i - 1].x,
        recent[i].y - recent[i - 1].y,
      );
    }
    return totalDist / (recent.length - 1);
  }

  // ---------------------------------------------------------------------------
  // Normalization: raw values -> 0-100 scores
  // ---------------------------------------------------------------------------
  private normalizeGazeStability(rawVariance: number): number {
    // Lower variance = higher stability
    // Use baseline to set scale
    const baseMean = baselineMean(this.baseline.gazeVariance);
    const baseStd = baselineStd(this.baseline.gazeVariance);

    if (baseMean <= 0 || !this.isWarmedUp()) {
      // Pre-baseline: use absolute heuristic (300px = 0, 0 = 100)
      return Math.max(0, Math.min(100, 100 - (rawVariance / 300) * 100));
    }

    // Z-score: how many SDs from baseline mean
    const z = (rawVariance - baseMean) / baseStd;
    // Map: z=-2 -> 100 (very stable), z=0 -> 70 (baseline), z=2 -> 0 (scattered)
    return Math.max(0, Math.min(100, 70 - z * 35));
  }

  private normalizeEngagement(rawFixation: number, rawSaccadeAmplitude: number): number {
    // K-coefficient inspired: focal (long fixation + short saccades) = high engagement
    const baseFix = baselineMean(this.baseline.fixationDuration);
    const baseSacc = baselineMean(this.baseline.saccadeAmplitude);

    if (baseFix <= 0 || !this.isWarmedUp()) {
      // Pre-baseline heuristic
      const fixScore = Math.min(rawFixation / 3000, 1) * 60;
      const saccScore = rawSaccadeAmplitude > 0
        ? Math.max(0, 40 - (rawSaccadeAmplitude / 500) * 40)
        : 20;
      return Math.min(100, fixScore + saccScore);
    }

    // Fixation ratio: longer than baseline = more engaged (up to 2x)
    const fixRatio = Math.min(rawFixation / baseFix, 2);
    const fixScore = fixRatio * 40; // 0-80

    // Saccade amplitude: shorter than baseline = more focal
    const saccRatio = baseSacc > 0 ? rawSaccadeAmplitude / baseSacc : 1;
    const saccScore = Math.max(0, 20 - (saccRatio - 1) * 20); // 0-20

    return Math.max(0, Math.min(100, fixScore + saccScore));
  }

  private computeScreenPresence(): number {
    if (this.headOnScreenSamples.length === 0) return 100;
    // Last 5 seconds of head-on-screen samples
    const recent = this.headOnScreenSamples.slice(-150); // ~5s at 30fps
    const onScreen = recent.filter(Boolean).length;
    const ratio = onScreen / recent.length;

    // Soft gate: 100% on-screen = 100, drops sharply after threshold
    if (ratio > 0.95) return 100;
    if (ratio > 0.80) return 80 + (ratio - 0.80) * (20 / 0.15);
    return ratio * 100;
  }

  private normalizeAlertness(rawBlinkRate: number): number {
    const baseBlink = baselineMean(this.baseline.blinkRate);

    if (baseBlink <= 0 || !this.isWarmedUp()) {
      // Pre-baseline: 15-20 = optimal
      if (rawBlinkRate >= 10 && rawBlinkRate <= 25) return 80;
      return Math.max(0, 80 - Math.abs(rawBlinkRate - 17) * 5);
    }

    // Relative to baseline: slight suppression = alert, elevation = fatigue
    const ratio = rawBlinkRate / baseBlink;
    if (ratio >= 0.7 && ratio <= 1.1) return 90; // slightly below baseline = alert
    if (ratio < 0.7) return 70; // very suppressed (possible glazing, but not definitive)
    // Elevated: fatigue signal
    return Math.max(0, 90 - (ratio - 1.1) * 60);
  }

  // ---------------------------------------------------------------------------
  // Baseline update (rolling)
  // ---------------------------------------------------------------------------
  private updateBaseline(variance: number, fixation: number, blinkRate: number, saccade: number) {
    const update = (stat: { sum: number; sumSq: number; count: number }, val: number) => {
      stat.sum += val;
      stat.sumSq += val * val;
      stat.count++;
      // Decay: exponential forgetting to adapt to session changes
      if (stat.count > 120) { // ~2 minutes of samples
        const decay = 0.99;
        stat.sum *= decay;
        stat.sumSq *= decay;
        stat.count = Math.floor(stat.count * decay);
      }
    };

    if (variance > 0) update(this.baseline.gazeVariance, variance);
    if (fixation > 100) update(this.baseline.fixationDuration, fixation);
    if (blinkRate > 0) update(this.baseline.blinkRate, blinkRate);
    if (saccade > 0) update(this.baseline.saccadeAmplitude, saccade);
  }

  // ---------------------------------------------------------------------------
  // Public accessors
  // ---------------------------------------------------------------------------
  getBuffer(): GazePoint[] {
    return [...this.gazeBuffer];
  }

  getConfirmedState(): AttentionState {
    return this.confirmedState;
  }

  getStateDuration(): number {
    return Date.now() - this.confirmedStateSince;
  }

  clear() {
    this.gazeBuffer = [];
    this.blinkTimestamps = [];
    this.fixationCenter = null;
    this.fixationStart = 0;
    this.fixations = [];
    this.sessionStart = 0;
    this.baseline = emptyBaseline();
    this.headOnScreenSamples = [];
    this.rawState = "locked-in";
    this.rawStateSince = 0;
    this.confirmedState = "locked-in";
    this.confirmedStateSince = 0;
    this.focusStreakStart = 0;
    this.distractionEvents = 0;
    this.isOffScreen = false;
    this.lastOffScreen = 0;
  }
}
