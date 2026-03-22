# Lunatic Eyes - Live Presentation Script

## Roles
- **Amadeus**: Narration, concept, architecture walkthrough
- **Jack**: Live demo operator (driving the screen)

## Pre-Show Setup
- `npm run dev -- --webpack` on localhost:3000
- `openclaw browser start`
- Chrome/Safari open with no x.com tabs
- Screen share ready

---

## PART 1: THE THESIS (Amadeus, 60s)

> Every productivity tool trusts you to police yourself. They give you a timer, a to-do list, a focus mode you can dismiss with one click. They assume willpower. Willpower doesn't scale.

> Lunatic Eyes inverts the model. You tell the system what you came here to do. Then the system watches your eyes. Not a timer. Not a Chrome extension checking your URL bar. Your actual eyes. Blink rate. Gaze fixation. Saccade velocity. The biometrics of attention.

> When you drift, it doesn't send you a polite notification. It closes the tab. It escalates. And if you keep drifting, it takes over your screen and shows you your own biometric data: proof that you weren't reading, you were glazing.

> This is a voluntary panopticon. You build the prison. The eye enforces it. The same eye that surveils you is the one that frees you.

---

## PART 2: ARCHITECTURE (Amadeus, 45s)

> Three layers.

> **Layer 1: Perception.** MediaPipe Face Mesh reads 478 facial landmarks plus iris geometry through the webcam at 30 frames per second. All client-side. No frames leave the browser. We extract four biometric signals: fixation duration, blink rate via EAR thresholds, saccade speed, and gaze variance. These feed into a client-side attention engine that classifies you every second into one of four states: locked-in, drifting, glazed, or distracted.

> **Layer 2: Policy.** Before tracking starts, you declare a session intent in natural language. Claude parses that into a structured policy: what's allowed, what's blocked, what tone to use when it intervenes. The system doesn't decide what's a distraction. You do.

> **Layer 3: Action.** OpenClaw. When your attention state degrades, OpenClaw's browser API identifies and closes blocked tabs programmatically. Not a notification you can swipe away. The tab is gone. It escalates on a ladder: nudge at 3 seconds, warning at 15, full intervention at 35. The intervention screen shows you your own biometrics alongside a generated behavioral assessment.

> Jack, show them.

---

## PART 3: LIVE DEMO (Jack, 90s)

### Intent (15s)
- Type: "I need to focus on my research paper. Block social media."
- System parses, shows blocked categories
- **Amadeus**: "He just set the contract. The system now knows what to enforce."

### Calibration (10s)
- SKIP calibration (or click through quickly)
- **Amadeus**: "Five-point iris calibration maps where your eyes point on screen. We'll skip it for time."

### Tracking (20s)
- Hit START. Face mesh overlay appears.
- Jack reads something on screen. State: LOCKED-IN.
- **Amadeus**: "Watch the metrics. Blink rate stable. Gaze variance low. Fixation holding. The system classifies this as locked-in. No intervention."

### The Break (30s)
- Jack opens x.com in a new tab
- Within 3 seconds: tab closes. Nudge toast appears.
- **Amadeus**: "He opened Twitter. Three seconds later, OpenClaw closed it. Not a notification. The tab is dead."
- Jack opens x.com again
- Warning banner fires
- **Amadeus**: "He tried again. The system escalates."

### Force Close (15s)
- Full overlay: THE EYE INTERVENED
- Shows biometric breakdown, session goal, behavioral assessment
- **Amadeus**: "Full intervention. The system shows him his own data. Blink rate dropped. Saccade speed spiked. His eyes were jumping, not reading. It's not punishing him. It's showing him the truth about what his body was doing."
- Jack clicks "I'm ready to refocus"

---

## PART 4: WHY IT MATTERS (Amadeus, 30s)

> Three things make this different from every focus app on the market.

> **One.** It uses real biometrics. Not screen time, not URL tracking. Your blink rate, your gaze fixation, your saccade speed. Data you can't fake and can't argue with.

> **Two.** It acts, it doesn't suggest. OpenClaw doesn't ask you to close Twitter. It closes Twitter. The intervention is proportional but non-negotiable.

> **Three.** Privacy by architecture. All face processing happens client-side in the browser. No video frames ever leave the machine. The only external call is Claude parsing your session intent as plain text.

> The name is Lunatic Eyes. From the Latin "luna." The moon. The thing that watches you whether you look at it or not.

> Thank you.

---

## Q&A Prep

**"How accurate is webcam eye tracking?"**
~130px accuracy, quadrant-level. Enough to distinguish reading fixation from scattered browsing. We're not tracking which word you read, we're tracking whether your eyes are stable or jumping. The biometric signals (blink rate, saccade speed) don't depend on pixel-perfect gaze.

**"What if someone just looks away from the screen?"**
MediaPipe loses the face. No landmarks, no classification. The system treats it as drifting. If you're away for 3+ seconds, nudge fires, blocked tabs close.

**"Why not just use a Chrome extension?"**
Chrome extensions track URLs. We track physiology. You can be on an allowed site and still be glazing. You can be on a blocked site and actually reading something important. The biometric layer adds a dimension that URL tracking can't.

**"What's OpenClaw doing exactly?"**
Three roles. First: browser tab control. It lists open tabs, identifies blocked URLs, closes them programmatically. Second: contextual message generation. The nudge and warning text are AI-generated, personalized to your stated goal and current biometrics. Third: it's the local agent runtime. No cloud dependency for the intervention pipeline.

**"What about false positives?"**
Classification is generous toward locked-in by default. Only extreme signals trigger negative states. Glazed requires blink rate under 6/min with low variance. Distracted requires saccade speed over 1000px/s with variance over 500px. Normal reading stays locked-in even with natural eye movement.

**"Privacy concerns?"**
Zero frames leave the browser. MediaPipe runs entirely in-browser via CDN WASM. No telemetry. No cloud processing of video. The only network call is Claude parsing your typed session intent as text. OpenClaw runs locally on the machine.
