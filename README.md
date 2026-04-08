# Lunatic Eyes

Webcam-based attention tracking that runs entirely in your browser. No data leaves your machine.

Won 2nd place at the PMAI Grayscale Hackathon 2026 (Fordham NYC, Track 1: Attention).

## Quick Start

```bash
# One-command setup (installs Node if needed)
bash setup.sh

# Or manually:
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000). Click **Quick Start** to begin tracking immediately.

**Requirements:** macOS, Chrome, Node 20+. That's it.

**Camera access:** Chrome will ask for webcam permission on first run. Grant it. Your webcam feed is processed locally and never leaves the browser.

## What It Does

1. **Calibration.** Five red dots appear on screen. Look at each one. This maps your iris geometry to screen coordinates.

2. **Tracking.** MediaPipe Face Mesh reads 478 facial landmarks through your webcam at ~30fps. A client-side attention engine computes gaze stability, engagement depth, blink rate, and head pose in real time.

3. **Classification.** Every second, the system classifies your attention into one of four states:
   - **LOCKED-IN** -- steady fixation, normal blink rate. You're reading.
   - **DRIFTING** -- eyes wandering, fixation breaking down.
   - **GLAZED** -- eyes open but nobody home. Staring without processing.
   - **AWAY** -- head turned off-screen.

4. **Intervention.** When focus degrades, the system responds gradually:
   - 10s unfocused: screen drains to grayscale
   - 30s: full grayscale + blur + vignette
   - 60s: forced break with 4-7-8 guided breathing

5. **Dashboard.** Focus Score (0-100), sub-score breakdown, gaze heatmap, timeline charts, session statistics, and data export (JSON + CSV).

## Metrics

All metrics are normalized 0-100 using a personal rolling baseline (60s window):

| Metric | What It Measures |
|--------|-----------------|
| **Gaze Stability** | Inverted spatial variance of gaze position. High = steady fixation. |
| **Engagement Depth** | K-coefficient: ratio of long fixations to short saccades. High = deep reading. |
| **Screen Presence** | Head on-screen ratio via yaw/pitch. Detects looking away. |
| **Alertness** | Blink rate relative to your personal baseline. |
| **Focus Score** | Weighted composite: Stability (35%) + Engagement (30%) + Presence (25%) + Alertness (10%). |

## Architecture

```
WEBCAM (30fps)
  |
  v
MediaPipe Face Mesh (478 landmarks + iris)
  |
  +---> 5-point calibration (iris-to-screen mapping)
  +---> 1-Euro filtered gaze coordinates
  +---> Gaze heatmap accumulator
  |
  +---> Attention Engine (1s intervals)
  |       +---> Fixation duration, blink detection, saccade amplitude
  |       +---> Gaze variance, head pose (yaw/pitch)
  |       +---> State classifier -> LOCKED-IN | DRIFTING | GLAZED | AWAY
  |
  v
Intervention Pipeline (graduated: grayscale -> blur -> forced break)
  |
  v
Dashboard (Recharts): scores, heatmap, timelines, JSON/CSV export
```

## For Researchers

Lunatic Eyes can be used as a low-cost attention tracking instrument for naturalistic studies. See [`docs/TECHNICAL.md`](docs/TECHNICAL.md) for the full system architecture, gaze estimation method, attention classification algorithm, known limitations, and comparison to research-grade eye trackers.

**Data export:** The dashboard includes JSON and CSV export. Exported data includes timestamped gaze coordinates, attention state history, all computed metrics, and session summary statistics (focus ratio, state transitions, intervention counts, longest focus streak).

**Calibration quality:** After calibration, the system displays a quality indicator (Good/Fair/Poor) based on within-point consistency and range coverage.

**Known limitations:**
- Gaze accuracy is ~130px (~3-5 degrees). Quadrant-level, not word-level.
- Glasses with reflective lenses degrade iris detection.
- Low lighting reduces tracking confidence.
- The 4-state classifier uses hand-tuned heuristics (HMM upgrade planned).

**References:**
- Papoutsaki et al. 2016, Semmelmann & Weigelt 2018 (webcam gaze validation)
- Soukupova & Cech 2016 (EAR blink detection)
- Kaplan's Attention Restoration Theory

## File Map

```
app/page.tsx                 Main orchestrator
components/
  EyeTracker.tsx             MediaPipe Face Mesh + gaze estimation + attention engine
  Calibration.tsx            5-point calibration
  SessionIntent.tsx          Optional goal-setting (skip with Quick Start)
  Dashboard.tsx              Scores, charts, heatmap, export
  BreakOverlay.tsx           Forced break screen with breathing exercise
  GazeHeatmap.tsx            Canvas gaze density heatmap
lib/
  attention.ts               AttentionEngine: metrics + state classifier
  gaze.ts                    GazeTracker: 1-Euro filter, iris ratios, calibration
  export.ts                  JSON + CSV session export
docs/TECHNICAL.md            Full technical documentation
```

## Privacy

All processing is client-side. No webcam frames leave the browser. No data collection. No cloud. No accounts.

## Advanced Features

These features are optional and require additional setup:

- **Session Intent:** Declare a focus goal (e.g., "block social media") and the system parses it into allow/block rules. Requires an `ANTHROPIC_API_KEY` in `.env.local`. See `.env.example`.
- **Tab Blocking:** When interventions fire, blocked Chrome/Safari tabs close automatically via AppleScript (macOS only).
- **Native Overlay:** A Swift-based gaze dot that floats above all windows. Run with `npm run dev:full`.
