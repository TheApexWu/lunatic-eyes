# Lunatic Eyes - Demo Script (2 min)

## Setup (before recording)
- `npm run dev -- --webpack` running on localhost:3000
- `openclaw browser start` running
- Open localhost:3000 in OpenClaw browser
- Have twitter.com/x.com ready to type in address bar

## Script

### 0:00 - Hook (10s)
"What if your webcam could watch where your eyes go, and shut down whatever's stealing your attention?"

### 0:10 - Session Intent (15s)
- Type: "I need to focus on my research paper. Block social media."
- Hit ENTER
- System parses intent, shows blocked categories
- "You set a contract with yourself. The eye holds you to it."

### 0:25 - Calibration (20s)
- Click through 5 dots (center, corners). Progress ring fills.
- "Quick calibration. The system learns where your eyes point on screen."
- Can SKIP if calibration is slow for the recording

### 0:45 - Tracking Active (20s)
- Hit START. Webcam feed shows face mesh overlay.
- Read something on screen normally. State shows LOCKED-IN.
- "Right now I'm focused. Blink rate normal, gaze steady, fixation strong."
- Point at dashboard metrics updating in real-time

### 1:05 - Distraction (30s)
- Open new tab, go to x.com
- Browse for ~10 seconds
- Tab closes automatically. Nudge toast appears bottom-right.
- "I opened Twitter. The system detected my attention shifting. OpenClaw closed the tab."
- Open x.com again. Keep browsing.
- Warning banner appears at top.
- "It escalates. First a nudge, then a warning."

### 1:35 - Force Close (15s)
- Keep on blocked site. Full overlay appears: THE EYE INTERVENED
- Shows biometric diagnosis, session goal reminder
- "Full intervention. It shows me my own biometrics. Blink rate dropped, saccade speed spiked. My eyes were jumping, not reading."
- Click "I'm ready to refocus"

### 1:50 - Wrap (10s)
- "Lunatic Eyes. The same eye that surveils you is the one that frees you."
- Show dashboard: focus score, distraction count, session assessment

## Key phrases for judges
- "Self-panopticon" - you set the contract, the eye enforces it
- "OpenClaw browser control" - programmatic tab closing, not just notifications
- "Real biometrics" - blink rate, saccade speed, gaze variance, not fake data
- "Intervention ladder" - nudge, warning, force close. Proportional response.
