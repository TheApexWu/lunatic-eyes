# Lunatic Eyes

Self-panopticon. Your webcam watches your eyes. AI maps attention in real-time. When you glaze over, doom-scroll, or lose focus, it intervenes. Closes the app. Forces a break. Shows you where your attention actually went.

The same eye that surveils you is the eye that frees you.

## Architecture

```
WEBCAM
  -> MediaPipe Face Mesh (478 landmarks, iris tracking)
  -> WebGazer.js (gaze x/y prediction)
  -> Attention Engine (client-side heuristic)
      fixation duration, blink rate, saccade speed, gaze variance
      -> classifies: focused | drifting | glazed | distracted
  -> Intervention ladder:
      nudge (60s drifting) -> warning (120s) -> force close (180s)
  -> OpenClaw (local AI agent, conversational nudges)
  -> Peekaboo (macOS app control, force-quit distractions)
  -> Dashboard (gaze heatmap, attention timelines, session summary)
```

All processing is client-side. No webcam frames leave the browser. OpenClaw runs locally. No cloud. No data collection.

## File Map

```
app/
  page.tsx                 # Main page. State, intervention firing, UI layout.
  layout.tsx               # Root layout, fonts, metadata.
  globals.css              # Tailwind + crimson accent vars.
  api/
    intervene/route.ts     # Backend bridge. Shells to OpenClaw + Peekaboo.

components/
  EyeTracker.tsx           # MediaPipe + WebGazer composite. showMesh prop toggles rendering.
                           # Tracking ALWAYS runs. Mesh rendering is optional.
  Dashboard.tsx            # Recharts timelines (variance, saccade speed). Session summary.
  GazeHeatmap.tsx          # Canvas density heatmap of gaze positions.
  BreakOverlay.tsx         # Full-screen forced break with attention report.
  VoiceGate.tsx            # Web Speech API voice activation. Wake word: "lunatic eyes".

lib/
  attention.ts             # AttentionEngine class. Computes all metrics from gaze/landmark data.
  gaze.ts                  # EAR (eye aspect ratio), iris size, face mesh drawing, gaze dot.
  voice.ts                 # Voice activation: wake word matching, command parsing.
```

## Stack

| Layer | Tool |
|-------|------|
| Eye tracking (mesh) | MediaPipe Face Mesh (CDN, 478 landmarks) |
| Eye tracking (gaze) | WebGazer.js (CDN, ~130px accuracy) |
| Attention metrics | Client-side heuristic (lib/attention.ts) |
| Interventions (soft) | OpenClaw (local, ws://127.0.0.1:18789) |
| Interventions (hard) | Peekaboo (macOS CLI, app quit/screenshot) |
| Frontend | Next.js 16.2.1 + Tailwind 4 |
| Charts | Recharts 3.8 |
| Voice | Web Speech API (Chrome only) |

## Setup

```bash
git clone https://github.com/TheApexWu/lunatic-eyes.git
cd lunatic-eyes
npm install
npm run dev
# opens localhost:3000 -- camera access requires localhost
```

**Requirements:**
- Node 20+
- OpenClaw installed + gateway running (`openclaw gateway --force`)
- Peekaboo installed (macOS only)
- Chrome recommended (Web Speech API, best WebGazer support)

## Key Concepts

**Mesh toggle:** Eye tracking always runs for metrics. The red face mesh overlay is toggled separately so it doesn't obstruct the user's view.

**Intervention debounce:** Max one intervention per 30 seconds. Prevents spam.

**Attention states:**
- **focused** - steady gaze, normal blink rate (15-20/min)
- **drifting** - rising variance, gaze wandering
- **glazed** - low blink rate (<10/min), fixed stare, no saccades
- **distracted** - high saccade speed, erratic gaze pattern

## Hackathon

PMAI Grayscale Hackathon 2026. Track 1: Attention.
