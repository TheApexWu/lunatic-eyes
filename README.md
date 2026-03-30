# Lunatic Eyes

Your webcam watches your eyes. You tell it what you came to do. When you drift, glaze, or doom-scroll, it closes the tab, forces a break, and shows you exactly where your attention went.

A voluntary panopticon. The same eye that surveils you is the one that frees you.

## How It Works

1. **Session Intent.** You declare your goal: "Study for algorithms exam, block social media." An AI parses this into a policy: what's allowed, what's blocked, what tone to use when it catches you.

2. **Calibration.** Five red dots appear on screen. You look at each one. The system maps your iris geometry to screen coordinates, personalizing gaze estimation to your face.

3. **Tracking.** MediaPipe Face Mesh reads 478 facial landmarks + iris positions through your webcam at ~30fps. Client-side attention engine computes fixation duration, blink rate, saccade speed, and gaze variance in real time. No frames leave your browser.

4. **Classification.** Every second, the engine classifies your attention:
   - **LOCKED-IN**: Fixation > 2s, blink rate 10-25/min, gaze variance < 100px. You're reading.
   - **DRIFTING**: Not locked-in, not yet glazed. Your eyes are wandering.
   - **GLAZED**: Blink rate < 10/min, variance < 80px. Eyes open, nobody home. Screen staring.
   - **AWAY**: Head turned beyond yaw/pitch threshold for >2s. Looking off-screen.

5. **Intervention.** When you leave LOCKED-IN, a timer starts:
   - **10s - Nudge**: Screen drains to grayscale. Toast notification with AI-generated message referencing your goal.
   - **30s - Warning**: Full grayscale + blur + vignette. Blocked Chrome tabs close. Warning banner appears.
   - **60s - Force Close**: All blocked tabs close. Full-screen break overlay with 4-7-8 breathing exercise and behavioral assessment. Tracking pauses.

6. **Dashboard.** Focus Score (0-100 composite), Focus Ratio (% of session locked-in), Peak Focus Streak, Distraction Count, gaze heatmap, variance/saccade/focus-score timelines, and a written behavioral assessment of your session.

## Architecture

```
WEBCAM (640x480, getUserMedia)
  |
  v
MediaPipe Face Mesh (CDN, 478 landmarks + 10 iris)
  |
  +---> Calibration (5-point, personalized iris-to-screen mapping)
  |
  +---> 1-Euro filtered gaze coordinates (adaptive cutoff)
  |       |
  |       +---> Browser gaze dot overlay (canvas, crimson)
  |       +---> Native macOS overlay (Swift, /tmp/lunatic-gaze.json, 60fps)
  |       +---> Gaze heatmap accumulator
  |
  +---> Attention Engine (client-side, 1s intervals)
  |       |
  |       +---> Fixation duration (50px radius)
  |       +---> Blink detection (EAR threshold 0.25, edge-triggered)
  |       +---> Saccade amplitude (px, distance between fixations)
  |       +---> Gaze variance (std of x/y positions)
  |       +---> Head pose (yaw/pitch from landmark geometry)
  |       |
  |       +---> State classifier -> LOCKED-IN | DRIFTING | GLAZED | AWAY
  |
  v
Intervention Pipeline (graduated)
  |
  +---> 10s: Nudge (grayscale drain + vignette + AI toast)
  +---> 30s: Warning (full grayscale + blur + tab closing + banner)
  +---> 60s: Force close (break overlay + 4-7-8 breathing + assessment)
  |
  v
Dashboard (Recharts)
  Focus Score, sub-scores, gaze heatmap, timelines
  Session stats, behavioral assessment, data export (JSON/CSV)
```

## Session Intent Pipeline

User types: "I want to study for my algorithms exam. Block twitter and reddit."

`/api/intent` sends this to Claude, which returns:
```json
{
  "goal": "Study for algorithms exam",
  "allow": ["study materials", "documentation", "textbooks"],
  "block": ["twitter", "reddit"],
  "tone": "firm"
}
```

The block list maps to URL patterns. When intervention fires, AppleScript closes matching Chrome tabs (not the whole browser).

## File Map

```
app/
  page.tsx                   Main orchestrator. State, intervention firing, UI.
  api/
    intervene/route.ts       Closes Chrome tabs (AppleScript), OpenClaw nudges.
    intent/route.ts          Claude parses session intent into allow/block policy.
    gaze/route.ts            Relays browser gaze coords to native macOS overlay.

components/
  EyeTracker.tsx             MediaPipe Face Mesh + iris gaze estimation + attention engine.
  Calibration.tsx            5-point click-to-collect calibration. Personalizes gaze mapping.
  SessionIntent.tsx          Intent gate. User declares goal before tracking starts.
  Dashboard.tsx              Focus Score, state stats, timelines, heatmap, assessment.
  BreakOverlay.tsx           Force-close screen with behavioral diagnosis.
  GazeHeatmap.tsx            Canvas density heatmap of gaze positions.
  VoiceGate.tsx              Web Speech API voice commands.

lib/
  attention.ts               AttentionEngine class. Metrics computation + state classifier.
  gaze.ts                    GazeTracker, 1-Euro filter, iris ratios, EAR, head pose, calibration.
  export.ts                  Session data export (JSON + CSV). Summary statistics.

docs/
  TECHNICAL.md               Technical documentation for researchers.
  FRANCO-PREP.md             Meeting prep notes.

overlay/
  GazeOverlay.swift          Native macOS transparent window. Crimson dot follows gaze.
```

## Stack

| Layer | Tool |
|-------|------|
| Face tracking | MediaPipe Face Mesh (CDN, 478 landmarks + iris refinement) |
| Gaze estimation | Custom iris-to-screen mapping with 5-point calibration |
| Attention metrics | Client-side heuristic engine (fixation, blink, saccade, variance) |
| Session intent | Claude API (intent parsing into allow/block/tone policy) |
| Tab blocking | AppleScript (closes Chrome tabs by URL pattern) |
| Notifications | OpenClaw CLI (fallback: osascript) |
| Native overlay | Swift (transparent NSWindow, reads /tmp/lunatic-gaze.json) |
| Frontend | Next.js 16.2.1 + Tailwind 4 |
| Charts | Recharts 3.8 |

## Setup

```bash
git clone https://github.com/TheApexWu/lunatic-eyes.git
cd lunatic-eyes
npm install
npm run dev -- --webpack
# opens localhost:3000
```

**Requirements:**
- Node 20+
- macOS (AppleScript tab closing, native overlay)
- Chrome (camera access, tab control via AppleScript)
- OpenClaw installed for notifications (optional, falls back to osascript)
- ANTHROPIC_API_KEY in .env.local (for session intent parsing)

## Research

- Foucault's panopticon (voluntary self-surveillance reframe)
- Kaplan's Attention Restoration Theory (directed attention fatigue)
- Commitment devices (Schelling, behavioral economics)
- Webcam gaze validation: Papoutsaki et al. 2016, Semmelmann & Weigelt 2018
- EAR blink detection: Soukupova & Cech 2016
- ~130px webcam gaze accuracy, sufficient for quadrant-level attention classification

## For Researchers

Lunatic Eyes can be used as a low-cost attention tracking instrument for naturalistic studies. See [`docs/TECHNICAL.md`](docs/TECHNICAL.md) for system architecture, gaze estimation method, attention classification details, known limitations, and comparison to research-grade eye trackers.

**Data export:** The dashboard includes JSON and CSV export buttons. Exported data includes timestamped gaze coordinates, attention state history, all computed metrics (focus score, gaze stability, engagement depth, screen presence, alertness), and session summary statistics (focus ratio, state transitions, intervention counts, longest focus streak).

**Calibration quality:** After calibration, the system displays a quality indicator (Good/Fair/Poor) based on within-point consistency and range coverage. Poor calibration warns the researcher to check webcam angle and lighting.

**Validated metrics:** All metrics are normalized 0-100 using personal baselines that adapt over a 60-second rolling window. The four attention states (LOCKED-IN, DRIFTING, GLAZED, AWAY) use debounced classification with baseline-relative thresholds.

## Privacy

All processing is client-side. No webcam frames leave the browser. No data collection. No cloud. OpenClaw runs locally. The only external call is Claude API for intent parsing (text only, no images).

## Hackathon

PMAI Grayscale Hackathon 2026, Fordham NYC. Track 1: Attention.
