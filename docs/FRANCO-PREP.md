# Franco Meeting Prep

**When:** April 6, 2026, 3:30 PM CST (30 min)
**Who:** Franco's research group, "Data Technologies and natural behavior"
**Format:** Intro/exploration call, not a formal presentation
**Follow-up:** Mariel meeting April 7, 5pm (Outro)

## 2-Minute Pitch

Lunatic Eyes is a webcam-based attention tracker that runs entirely in the browser. It uses MediaPipe Face Mesh to read iris position and blink patterns at 30fps, classifies attention into four states (focused, drifting, glazed, away), and applies graduated interventions when focus degrades: first draining the screen to grayscale, then closing distracting tabs, then forcing a breathing break.

What makes it different from existing screen time tools (Cold Turkey, Freedom, etc.):
- It uses your body's signals, not just timers or content filters
- All processing is client-side. No data leaves the browser. No cloud dependency.
- The attention classification adapts to each user through a rolling personal baseline
- It's a research instrument, not just a consumer app. All data exports to JSON/CSV.

It's a voluntary panopticon. The same eye that surveils you is the one that frees you.

## Demo Plan

**If live demo is possible** (preferred):
1. Open localhost:3000, show the session intent screen
2. Type "Read this research paper, block Twitter and Reddit"
3. Do the 5-point calibration (takes 15 seconds)
4. Show the gaze dot tracking in real-time
5. Deliberately look away for 10 seconds to trigger the nudge (grayscale drain)
6. Show the dashboard: focus score, sub-scores, gaze heatmap
7. Show the JSON export

**If no live demo** (backup):
- Walk through DEMO_SCRIPT.html (interactive demo with screenshots)
- Show the architecture diagram from TECHNICAL.md
- Show a sample JSON export

## Three Research Angles for Franco's Group

### 1. Webcam attention tracking as cheap alternative to Tobii for naturalistic studies

Research-grade eye trackers cost $3k-30k and require lab settings. Lunatic Eyes runs on any laptop with a webcam. The accuracy is lower (~130px vs <10px for Tobii), but for attention classification (not point-of-regard), this may be sufficient.

**Research question:** How does webcam-based attention state classification correlate with research-grade eye tracker data? Can the four-state model (focused/drifting/glazed/away) be validated using concurrent Tobii recordings?

**Why this matters for Franco's group:** If webcam gaze is "good enough" for attention studies, it enables naturalistic data collection at scale. Participants use their own laptops in their own environments. No lab visits needed.

### 2. Intervention effectiveness: does grayscale drain actually reduce distraction?

The graduated intervention system (grayscale drain -> tab closing -> forced break) is inspired by the Grayscale Phone literature but has not been tested in a screen-work context.

**Research question:** Does webcam-triggered grayscale drain reduce time-to-refocus compared to no intervention? Does it reduce total distraction time in a session? Is there a habituation effect over multiple sessions?

**Why this matters:** This is a clean, measurable behavioral intervention. The system logs intervention timing, pre/post metrics, and refocus latency. All exportable.

### 3. Attention state classification: validating the 4-state model against self-report

The four states (locked-in, drifting, glazed, away) are heuristic categories based on gaze variance, fixation duration, saccade structure, and head pose. They have face validity but no formal validation.

**Research question:** Do users' self-reported attention states (via experience sampling) correlate with the system's classifications? Which states are most/least accurately detected?

**Why this matters:** If validated, this creates a labeled attention state dataset collected naturalistically. Could be used to train better classifiers.

## Anticipated Questions

**"How accurate is the gaze tracking?"**
~130px, roughly 3-5 degrees. Good for quadrant-level detection, not word-level. Comparable to WebGazer.js. We compensate with 5-point calibration and 1-Euro filter smoothing.

**"Why not use a deep learning gaze model?"**
We prioritized interpretability and zero training data. The iris-ratio approach is simple, fully transparent, and runs at 30fps in the browser. A future version could integrate FAZE or L2CS-Net for better accuracy.

**"What about glasses?"**
Reflections degrade iris detection. Works okay for most frames but accuracy drops. This is a known limitation we'd want to quantify.

**"Can it run on phone/tablet?"**
Not currently. MediaPipe Face Mesh runs on mobile, but the attention engine and intervention system are desktop-focused. Mobile would require rethinking the intervention model.

**"What data is collected?"**
Nothing leaves the browser. All processing is client-side. The JSON export is user-initiated. No telemetry, no cloud, no accounts.

**"How would we integrate this into a study?"**
Participants run the app locally, complete sessions with controlled tasks, and export JSON at the end. We can add study-specific metadata fields to the export. Concurrent recording with lab equipment is possible for validation studies.

## Key Links

- Repo: github.com/TheApexWu/lunatic-eyes (branch: post-hack)
- Technical doc: docs/TECHNICAL.md
- Demo: DEMO_SCRIPT.html (open locally)

## Notes

- This is an intro call. Listen more than pitch.
- Ask Franco what "natural behavior" research his group is currently doing
- Ask about existing eye tracking infrastructure in the group
- Gauge interest level: is this a "cool, let's keep talking" or a "let's run a pilot study"?
- If interest is high, propose a concrete next step: pilot with 5-10 participants, concurrent Tobii recording
