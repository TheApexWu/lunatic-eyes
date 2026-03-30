# Lunatic Eyes - Pitch Script

## Solo presenter: Amadeus

## FORMAT: 3 min pitch, feedback from Anthony, then 2 min refined pitch

---

## PRE-SHOW (arrive by 6:15)

- Deck loaded, demo video embedded (NOT live demo)
- Backup: app running on localhost:3000 in case Anthony asks to see it live
- `npm run dev -- --webpack` backgrounded just in case

---

## FIRST PITCH (3 minutes)

### OPEN: THE MOMENT (30s)

You're three hours into a research session. You feel productive. Then you check your screen time report and realize 40 minutes of that was Twitter. Your eyes were open the whole time. You weren't reading. You were glazing.

Every focus app on the market gives you a timer or a URL blocker. Something you can dismiss with one click. They assume you'll police yourself. But the problem isn't that you choose to get distracted. The problem is you don't even notice it happening.

### THE PRODUCT (30s)

Lunatic Eyes watches your eyes through your webcam. Not your screen time. Not your browser history. Your actual eyes.

You start a session by telling it what you're here to do. "Focus on research. No social media." Then it watches. It gives you a Focus Score from 0 to 100, broken down into four signals: how stable your gaze is, how deeply you're engaging with content, whether you're actually looking at the screen, and whether your blink patterns indicate alertness or fatigue.

When your Focus Score drops and stays down, the screen itself starts to drain. Color fades out. Your periphery darkens. If you keep drifting, it closes the tab and takes over your screen with a forced break showing you exactly what happened.

### DEMO (show video, 45s)

[Play embedded recording. Narrate over it:]

Here's a session. I type my intent: "Deep work on research paper. No social media." The system parses that into a blocking policy and starts tracking.

Watch the sidebar. Focus Score at 82, all four sub-scores green. State reads FOCUSED. This is what locked-in attention looks like through a webcam.

Now I open Twitter. Watch the screen. The color starts draining out. Grayscale creeping in from the edges, a dark vignette closing around the content. That's the nudge. Ten seconds of sustained drift. A toast appears: "Your attention is drifting."

I stay on Twitter. The screen goes fully gray, blurs slightly. Warning banner. Blocked tabs close automatically. I keep going. Full intervention. Black screen, breathing exercise, my biometric breakdown: Focus Score 23, Gaze Stability at 12, Engagement bottomed out. The system doesn't punish you. It shows you the truth about what your body was doing.

### WHY THIS WORKS (30s)

Two things make this different from every focus tool you've used.

First, it reads physiology, not URLs. You can be on an allowed site and still be glazing. You can be on a blocked site reading something important. The biometric layer captures what screen time can't.

Second, the intervention is graduated and physical. Not a notification you swipe away. Your screen literally loses its color. It's designed to feel wrong before you consciously register what's happening. By the time you notice the grayscale, you've already started to refocus.

### CLOSE (15s)

All face processing is client-side. No webcam frames leave the browser. The only external call is an AI parsing your typed intent as text.

The name comes from the Latin "luna." The moon. The thing that watches you whether you look at it or not.

Lunatic Eyes. Thank you.

---

## REFINED PITCH (2 minutes, after Anthony's feedback)

[Adjust based on what Anthony flags. Likely cuts:]
- If he says "too much tech": cut the sub-score breakdown, just say "Focus Score" and "four biometric signals"
- If he says "what's the market": add "Screen time is a $1.2B category. Every app in it tracks URLs. None of them track the user."
- If he says "what's next": add "Next: external camera support for clinical-grade tracking, persistent analytics across sessions, and adaptive baselines that learn your attention patterns over time."
- If he says "show me": have localhost:3000 ready, pre-calibrated

### BACKUP 2-MIN VERSION (pre-written tight cut)

You're three hours into a research session. You feel productive. Then you check screen time: 40 minutes was Twitter. You didn't choose to get distracted. You didn't notice.

Lunatic Eyes watches your eyes through your webcam. You set a session intent: what you're here to do, what to block. It gives you a real-time Focus Score built from four biometric signals: gaze stability, engagement depth, screen presence, and alertness.

When your score drops, the screen drains to grayscale. Your periphery darkens. If you keep drifting, blocked tabs close and it forces a break showing your biometric breakdown.

[Point to key moment in video]

This isn't screen time tracking. It's physiology. And the intervention isn't a notification you dismiss. Your screen physically changes. It's designed to feel wrong before you consciously notice.

All processing is client-side. No frames leave the browser. Lunatic Eyes. Thank you.

---

## DEMO VIDEO RECORDING GUIDE

### Setup
1. Clean browser, no bookmarks bar, dark theme
2. App running at localhost:3000
3. Complete calibration before recording
4. Have Twitter/X open in another tab ready to switch to
5. Screen record full screen (QuickTime or OBS)

### Shot list (aim for 60-90 seconds total)

**Shot 1: Intent screen (5s)**
Type: "Deep work on research paper. No social media."
Show the policy parsing (block list populates).

**Shot 2: Focused state (10s)**
Read something on screen. Show sidebar: Focus Score green (70+), all bars green, state = FOCUSED.

**Shot 3: Drift begins (10s)**
Switch to Twitter. Scroll idly. Show Focus Score dropping, bars turning yellow.
Grayscale starts creeping in. Vignette darkens edges.

**Shot 4: Nudge fires (5s)**
Toast appears bottom-right: "Drifting. Your attention is drifting."
Screen at 60% grayscale.

**Shot 5: Warning escalation (5s)**
Screen fully gray + slight blur. Red warning banner across top.
"Blocked tabs closed" message.

**Shot 6: Force close / Break overlay (10s)**
Full black screen. Breathing circle animating. "THE EYE INTERVENED."
Show: Focus Score 23/100, Gaze Stability 12%, Alertness 45%.
Diagnosis text: "Screen glazing detected..."

**Shot 7: Dashboard (10s)**
Scroll to dashboard after dismissing break.
Show: hero focus score, sub-score bars, Focus Score Over Time chart, gaze heatmap.

### Recording tips
- Record in a well-lit room (MediaPipe needs light)
- Don't narrate during recording (narrate live over the video during pitch)
- Exaggerate the drift: look around, scroll fast, let eyes wander
- If grayscale doesn't trigger fast enough, wait. Don't fake it.

---

## Q&A AMMO

**"How accurate is webcam eye tracking?"**
About 2-3 degrees, roughly 130 pixels. Quadrant-level, not word-level. But we're not tracking which word you read. We're tracking patterns: is your gaze stable or scattered? Are your blinks normal or suppressed? Those signals are robust even at low resolution.

**"What if someone looks away?"**
Head pose estimation detects yaw and pitch. If you turn away for more than 2 seconds, the system classifies you as AWAY and starts the intervention ladder.

**"Why not just a Chrome extension?"**
Chrome extensions track URLs. We track physiology. You can stare at a Google Doc for 20 minutes without reading a single word. A URL blocker thinks you're focused. We know you're not.

**"What about false positives?"**
Classification defaults to FOCUSED with a 15-second warmup. States must persist through debounce windows: 6 seconds for drifting, 10 seconds for glazed. Normal reading, looking at your phone for a moment, adjusting in your chair -- none of that triggers intervention.

**"What's the grayscale thing?"**
Graduated intervention. Most focus apps give you a binary: blocked or not. We drain the color from your screen proportionally. At nudge level it's 60% grayscale with a darkened vignette. At warning it's full grayscale with blur. It's designed to create a visceral sense that something is wrong, before you consciously process what changed.

**"Privacy?"**
Zero frames leave the browser. MediaPipe runs entirely client-side via WebAssembly. No telemetry. No cloud processing of video. The only network call is AI parsing your typed session intent as text.

**"What's the business model?"**
[If asked] Freemium. Free for personal use with basic metrics. Pro tier for persistent analytics, custom intervention policies, and session history. Enterprise for workplace attention auditing with consent.

**"Where does this go?"**
[If asked] Three directions. One: external camera and dedicated eye tracker support for clinical-grade accuracy. Two: enterprise (voluntary attention auditing for remote teams, aggregate-only reporting). Three: clinical (ADHD screening, attention deficit quantification for therapists).

**"Team?"**
Built this at the Grayscale hackathon. I'm Amadeus Wu, CS/Data Science from NYU. Architecture, eye tracking pipeline, attention engine, and the biometric classification system are mine.

**"What's the Focus Score?"**
Weighted composite of four signals. Gaze Stability (35%): how scattered vs concentrated your eye movements are. Engagement Depth (30%): fixation duration and saccade structure, inspired by the K-coefficient from attention research. Screen Presence (25%): are you actually looking at the screen. Alertness (10%): blink rate relative to your personal baseline. All normalized to your own patterns after a 15-second warmup.
