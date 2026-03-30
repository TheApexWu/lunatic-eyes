# Lunatic Eyes: Technical Documentation

## 1. Problem Statement

Sustained attention on screens is deteriorating. The average knowledge worker context-switches every 3 minutes (Mark et al., 2014). Existing tools address this with content blocking (Cold Turkey, Freedom) or time boxing (Pomodoro). None of them use the body's own signals.

Lunatic Eyes inverts the surveillance model: instead of an employer monitoring a worker, the user monitors themselves. A webcam reads eye behavior in real time, classifies attention states, and intervenes with graduated responses when focus degrades. All processing is client-side. No data leaves the browser.

The core hypothesis: webcam-based gaze and blink metrics, despite lower accuracy than research-grade eye trackers, contain enough signal to classify attention states and drive behavioral interventions.

## 2. System Architecture

```
WEBCAM (640x480, getUserMedia)
  |
  v
MediaPipe Face Mesh (478 landmarks + 10 iris, ~30fps)
  |
  +---> GazeTracker (lib/gaze.ts)
  |       |
  |       +---> Iris ratio extraction (both eyes, outer-corner referenced)
  |       +---> 1-Euro filter (adaptive smoothing, replaces dual-EMA)
  |       +---> 5-point calibration (personalizes iris-to-screen mapping)
  |       +---> Screen coordinate estimation
  |
  +---> Head pose estimation (yaw + pitch from landmark geometry)
  |
  +---> Blink detection (Eye Aspect Ratio, threshold 0.25)
  |
  v
AttentionEngine (lib/attention.ts, 1-second intervals)
  |
  +---> Rolling window metrics (5s window, 60s baseline)
  |       - Gaze variance (spatial scatter of fixation points)
  |       - Fixation duration (time spent within 50px radius)
  |       - Saccade amplitude (distance between consecutive fixations)
  |       - Blink rate (blinks/min, 30s window)
  |       - Head on-screen ratio (yaw/pitch thresholds)
  |
  +---> Baseline normalization (adaptive z-score, exponential decay)
  |
  +---> Normalized sub-scores (0-100)
  |       - Gaze Stability (inverted variance, baseline-relative)
  |       - Engagement Depth (K-coefficient inspired, fixation/saccade ratio)
  |       - Screen Presence (head pose on-screen ratio)
  |       - Alertness (blink rate relative to personal baseline)
  |
  +---> Composite Focus Score (weighted sum: 35/30/25/10)
  |
  +---> State classifier --> LOCKED-IN | DRIFTING | GLAZED | AWAY
  |       (debounced: 6s/10s/2s/3s thresholds)
  |
  v
Intervention Pipeline (app/page.tsx)
  |
  +---> 10s non-focused: NUDGE (grayscale drain, toast notification)
  +---> 30s non-focused: WARNING (full grayscale + blur + vignette, tab closing)
  +---> 60s non-focused: FORCE CLOSE (break overlay with 4-7-8 breathing)
  |
  v
Dashboard (components/Dashboard.tsx)
  Focus Score, sub-score bars, gaze heatmap, timelines
  Session summary, behavioral assessment
  Data export (JSON + CSV)
```

## 3. Gaze Estimation Method

### 3.1 Iris-to-Screen Mapping

MediaPipe Face Mesh provides 10 iris landmarks (5 per eye: center + 4 cardinal points). We compute horizontal and vertical iris ratios relative to eye geometry:

- **Horizontal ratio (rx)**: Position of iris center between outer and inner eye corners. Both eyes are measured from the outer corner (landmarks 33 and 362) to ensure consistent directional sign.
- **Vertical ratio (ry)**: Position of iris center between top and bottom eyelid.

The two eyes' ratios are combined using a weighted average, with weights proportional to eye openness (larger opening = more reliable estimate).

### 3.2 Calibration

A 5-point calibration procedure (center + four corners) maps the observed iris ratio range to screen coordinates. The user looks at each red dot while the system records iris ratios, establishing per-user min/max bounds. Gaze position is then linearly interpolated within this range.

The X axis is mirrored (looking left = screen right when facing camera). Soft clamping allows slight extrapolation beyond calibration bounds.

### 3.3 1-Euro Filter

Raw iris ratios are noisy. We use the 1-Euro filter (Casiez et al., 2012) for adaptive smoothing:

- When the eye is still, the filter applies aggressive smoothing (low cutoff frequency), reducing jitter.
- When the eye moves, the filter reduces smoothing (high cutoff frequency), preserving responsiveness.

This replaced a dual EMA cascade that introduced ~470ms of lag during fast saccades. The 1-Euro filter achieves sub-50ms latency while maintaining comparable jitter reduction during fixations.

Parameters: frequency=30Hz, minCutoff=1.5, beta=0.01, dCutoff=1.0.

### 3.4 Accuracy

Webcam-based gaze estimation achieves approximately 130px accuracy (Papoutsaki et al., 2016; Semmelmann & Weigelt, 2018). This is insufficient for word-level tracking but adequate for:
- Quadrant-level attention detection
- On-screen vs. off-screen classification
- Fixation vs. saccade discrimination
- Gaze variance as a proxy for cognitive engagement

## 4. Attention Classification

### 4.1 Metric Computation

All metrics are computed on rolling windows and normalized to 0-100 scales using personal baselines.

**Gaze Stability** (weight: 35%): Inverted spatial variance of gaze points in a 5-second window. After a 15-second warmup period, scores are z-normalized against a 60-second rolling baseline. Lower variance = higher stability. Paradoxically high stability with low engagement signals "glazing" (eyes frozen, mind disengaged).

**Engagement Depth** (weight: 30%): Inspired by the K-coefficient (Krejtz et al., 2015). Long fixations combined with short saccade amplitudes indicate focal, deep processing. Short fixations with large saccades indicate ambient, scanning behavior. Normalized against personal baseline fixation duration and saccade amplitude.

**Screen Presence** (weight: 25%): Head pose (yaw and pitch) estimated from facial landmark geometry. On-screen ratio over the last 5 seconds. Soft-gated: 100% above 95% presence, drops sharply below 80%.

**Alertness** (weight: 10%): Blink rate relative to personal baseline. Normal blink rate (15-20/min) is baseline. Slight suppression signals heightened attention. Significant elevation signals fatigue. Very low rate may indicate glazing but is not definitive alone.

### 4.2 State Classification

Four states, classified using baseline-relative thresholds:

| State | Trigger | Debounce |
|-------|---------|----------|
| **LOCKED-IN** | Default; fixation and variance within baseline norms | 3s recovery |
| **DRIFTING** | Fixation > 1.3x baseline AND gaze stability < 50 | 6s to confirm |
| **GLAZED** | Fixation > 2x baseline AND variance < 0.5x baseline AND stability > 80 | 10s to confirm |
| **AWAY** | Head yaw > 30 degrees OR pitch > 25 degrees for > 2s | 2s (fast) |

The debounce system prevents state flicker. A raw state must persist for the specified duration before the confirmed state transitions. Recovery to LOCKED-IN requires 3 seconds of sustained focused behavior.

### 4.3 Baseline Adaptation

The baseline tracker uses exponential decay (0.99 factor after 120 samples, roughly 2 minutes). This allows the system to adapt to:
- Individual differences in natural gaze behavior
- Session-level changes (fatigue, caffeine, time of day)
- Calibration drift (small head movements over time)

## 5. Intervention Design

### 5.1 Graduated Response

Interventions escalate based on time spent in a non-focused state:

**Nudge (10s)**: The screen drains to 60% grayscale with a vignette overlay. A toast notification appears with an AI-generated message referencing the user's declared session goal. The message is generated by Claude (via API) with tone matching the user's preference (e.g., "firm", "gentle").

**Warning (30s)**: Full grayscale + 2px blur + heavy vignette. Blocked Chrome tabs are closed via AppleScript. A full-width crimson banner appears: "YOUR EYES ARE GLAZING."

**Force Close (60s)**: All blocked tabs closed. Full-screen black overlay with:
- 4-7-8 breathing exercise (animated circle: 4s inhale, 7s hold, 8s exhale)
- AI-generated behavioral assessment citing the user's biometric data
- Diagnostic message based on which metrics triggered the intervention
- Session metrics display (focus score, gaze stability, alertness)

### 5.2 Design Rationale

The grayscale drain is inspired by the "Grayscale Phone" intervention (Holte & Ferraro, 2023). Removing color reduces the reward signal from stimulating content without blocking access entirely. The graduated approach avoids the "false alarm" problem of binary interventions: a 10-second drift is common and normal. Only sustained disengagement triggers escalation.

The 4-7-8 breathing pattern (Weil, 2015) activates the parasympathetic nervous system, reducing the anxiety/agitation that often accompanies forced breaks.

## 6. Known Limitations

1. **Webcam accuracy (~130px)**: Cannot track reading position within a line of text. Suitable only for quadrant-level classification.

2. **MediaPipe is not designed for gaze**: Face Mesh was built for face tracking, not gaze estimation. Iris landmarks are a secondary output. Accuracy degrades with:
   - Glasses (reflections confuse iris detection)
   - Low lighting (iris landmarks become unstable)
   - Extreme head angles (>30 degrees)
   - Distance from camera (optimal: 40-80cm)

3. **No IR illumination**: Consumer webcams lack infrared illumination, making pupil detection dependent on visible light. Research eye trackers (Tobii, EyeLink) use IR specifically because it provides contrast against the iris regardless of eye color or ambient light.

4. **Single-monitor assumption**: Calibration assumes a single screen directly in front of the user. Multi-monitor setups will produce inaccurate gaze mapping.

5. **Head-gaze conflation**: When users turn their head to look at something, the system may misinterpret head movement as gaze shift. The head pose filter mitigates this for the "away" state but does not fully separate head and eye movements.

6. **Blink detection false positives**: Squinting, facial expressions, and narrow eye shapes can trigger false blink detections. The EAR threshold (0.25) is conservative but not perfect.

7. **No ground truth during use**: The system cannot validate its own classifications in real time. The attention states are heuristic approximations, not ground-truth measurements.

## 7. Comparison to State of the Art

### Research Eye Trackers

| System | Method | Accuracy | Cost | Use Case |
|--------|--------|----------|------|----------|
| **Tobii Pro Spectrum** | IR + corneal reflection | < 0.3 degrees | ~$30,000 | Lab research |
| **EyeLink 1000 Plus** | IR video-based | < 0.25 degrees | ~$25,000 | Psycholinguistics |
| **Pupil Labs Core** | IR + scene camera | ~1 degree | ~$3,500 | Mobile eye tracking |
| **Lunatic Eyes** | Webcam + MediaPipe | ~3-5 degrees | $0 (webcam) | Naturalistic attention |

### Webcam Gaze Estimation Models

| System | Method | Notes |
|--------|--------|-------|
| **WebGazer.js** | Regression on webcam features | Pioneer work, drift-prone |
| **GazeCapture / iTracker** | CNN on eye crops | Requires training data, ~2.5cm error on phone |
| **FAZE** | Few-shot gaze adaptation | SOTA for webcam, needs per-user calibration |
| **L2CS-Net** | Appearance-based, head-pose aware | Good cross-dataset generalization |
| **ETH-XGaze** | Large-scale gaze dataset | Best accuracy for extreme angles |
| **Lunatic Eyes** | Iris ratio + calibration + 1-Euro | Simple, no ML training, ~130px accuracy |

Lunatic Eyes deliberately avoids deep learning for gaze estimation. The iris-ratio approach is less accurate but fully interpretable, requires no training data, runs in the browser, and achieves sufficient accuracy for attention classification (not point-of-regard estimation).

## 8. Research Applications

### 8.1 Naturalistic Attention Studies

Lunatic Eyes runs in a normal browser with a consumer webcam. This enables attention tracking in naturalistic settings (home, office, library) without the artificial environment of a lab. The data export (JSON + CSV) includes timestamped gaze coordinates, attention states, and all computed metrics.

Potential studies:
- Sustained attention duration in naturalistic vs. lab settings
- Attention patterns during different types of screen work (reading, writing, browsing)
- Circadian effects on focus quality (same user, different times of day)

### 8.2 Intervention Effectiveness

The graduated intervention system (grayscale drain, forced breaks) is itself a research instrument:
- Does grayscale drain reduce time-to-refocus compared to no intervention?
- Do forced breaks improve subsequent focus quality?
- How does intervention frequency change over repeated sessions (habituation vs. learning)?

### 8.3 Attention State Validation

The four-state model (locked-in, drifting, glazed, away) can be validated against:
- Self-report (experience sampling during sessions)
- Task performance (accuracy/speed on controlled tasks)
- Physiological measures (EEG, GSR) in controlled settings
- Research-grade eye tracker data (concurrent recording with Tobii/EyeLink)

### 8.4 Screen Time and Digital Wellness

- Relationship between attention quality and subjective well-being
- Effectiveness of voluntary self-surveillance as a behavior change mechanism
- Comparison of self-imposed vs. externally-imposed attention monitoring

## 9. Data Export Format

Sessions can be exported as JSON or CSV from the dashboard.

### JSON Structure

```json
{
  "metadata": {
    "exportedAt": "2026-03-29T18:00:00.000Z",
    "sessionDuration": 1200,
    "gazePointCount": 36000,
    "stateTransitionCount": 15
  },
  "summary": {
    "duration": 1200,
    "focusRatio": 72,
    "meanFocusScore": 68,
    "transitions": 15,
    "longestFocusStreak": 240,
    "distractionCount": 5,
    "stateBreakdown": {
      "locked-in": 864000,
      "drifting": 180000,
      "glazed": 120000,
      "away": 36000
    },
    "interventionCounts": {
      "nudge": 3,
      "warning": 1,
      "force_close": 0
    }
  },
  "gazeData": [
    { "timestamp": 1711720800000, "x": 960, "y": 540 }
  ],
  "stateHistory": [
    { "timestamp": 1711720800000, "state": "locked-in" }
  ],
  "metricsSnapshot": {
    "focusScore": 68,
    "gazeStability": 72,
    "engagementDepth": 65,
    "screenPresence": 88,
    "alertness": 75
  }
}
```

## References

- Casiez, G., Roussel, N., & Vogel, D. (2012). 1 Euro Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems. CHI '12.
- Holte, A.J. & Ferraro, F.R. (2023). Grayscale smartphone use and cognitive outcomes. Computers in Human Behavior.
- Krejtz, K., Duchowski, A.T., et al. (2015). Gaze Transition Entropy. ACM ETRA '15.
- Mark, G., Gudith, D., & Klocke, U. (2008). The cost of interrupted work. CHI '08.
- Papoutsaki, A., Sangkloy, P., Laskey, J., et al. (2016). WebGazer: Scalable Webcam Eye Tracking Using User Interactions. IJCAI.
- Semmelmann, K. & Weigelt, S. (2018). Online webcam-based eye tracking in cognitive science. Behavior Research Methods.
- Soukupova, T. & Cech, J. (2016). Eye Blink Detection Using Facial Landmarks. CVWW.
- Weil, A. (2015). 4-7-8 Breathing technique. drweil.com.
