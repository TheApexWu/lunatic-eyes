import type { AttentionState, AttentionMetrics, GazePoint } from "./attention";

export interface SessionSummary {
  duration: number; // seconds
  focusRatio: number; // 0-100
  meanFocusScore: number;
  transitions: number;
  longestFocusStreak: number; // seconds
  distractionCount: number;
  stateBreakdown: Record<AttentionState, number>; // ms per state
  interventionCounts: { nudge: number; warning: number; force_close: number };
}

export interface SessionExport {
  metadata: {
    exportedAt: string;
    sessionDuration: number;
    gazePointCount: number;
    stateTransitionCount: number;
    calibrationQuality?: string;
  };
  summary: SessionSummary;
  gazeData: {
    timestamp: number;
    x: number;
    y: number;
  }[];
  stateHistory: {
    timestamp: number;
    state: AttentionState;
  }[];
  metricsSnapshot: AttentionMetrics | null;
}

interface StateEntry {
  state: AttentionState;
  timestamp: number;
}

export function computeSessionSummary(
  stateHistory: StateEntry[],
  metrics: AttentionMetrics | null,
  interventionCounts: { nudge: number; warning: number; force_close: number },
): SessionSummary {
  const durations: Record<AttentionState, number> = {
    "locked-in": 0,
    drifting: 0,
    glazed: 0,
    away: 0,
  };
  let transitions = 0;
  let longestFocus = 0;
  let currentFocusStreak = 0;
  let distractionCount = 0;
  let totalDuration = 0;

  if (stateHistory.length >= 2) {
    totalDuration = stateHistory[stateHistory.length - 1].timestamp - stateHistory[0].timestamp;

    for (let i = 1; i < stateHistory.length; i++) {
      const prev = stateHistory[i - 1];
      const curr = stateHistory[i];
      const dt = curr.timestamp - prev.timestamp;

      durations[prev.state] += dt;

      if (curr.state !== prev.state) {
        transitions++;
        if (prev.state === "locked-in") {
          longestFocus = Math.max(longestFocus, currentFocusStreak);
          currentFocusStreak = 0;
        }
        if (curr.state === "away" || curr.state === "glazed") {
          distractionCount++;
        }
      }

      if (curr.state === "locked-in") {
        currentFocusStreak += dt;
      }
    }
    longestFocus = Math.max(longestFocus, currentFocusStreak);
  }

  const focusRatio = totalDuration > 0
    ? Math.round((durations["locked-in"] / totalDuration) * 100)
    : 0;

  return {
    duration: Math.round(totalDuration / 1000),
    focusRatio,
    meanFocusScore: metrics?.focusScore ?? 0,
    transitions,
    longestFocusStreak: Math.round(longestFocus / 1000),
    distractionCount,
    stateBreakdown: durations,
    interventionCounts,
  };
}

export function buildSessionExport(
  gazeHistory: GazePoint[],
  stateHistory: StateEntry[],
  metrics: AttentionMetrics | null,
  interventionCounts: { nudge: number; warning: number; force_close: number },
  calibrationQuality?: string,
): SessionExport {
  const summary = computeSessionSummary(stateHistory, metrics, interventionCounts);

  return {
    metadata: {
      exportedAt: new Date().toISOString(),
      sessionDuration: summary.duration,
      gazePointCount: gazeHistory.length,
      stateTransitionCount: summary.transitions,
      calibrationQuality,
    },
    summary,
    gazeData: gazeHistory.map(p => ({
      timestamp: p.timestamp,
      x: Math.round(p.x),
      y: Math.round(p.y),
    })),
    stateHistory: stateHistory.map(s => ({
      timestamp: s.timestamp,
      state: s.state,
    })),
    metricsSnapshot: metrics,
  };
}

export function exportJSON(data: SessionExport): string {
  return JSON.stringify(data, null, 2);
}

export function exportCSV(data: SessionExport): string {
  const lines: string[] = [];

  // Gaze data CSV
  lines.push("timestamp,x,y");
  for (const point of data.gazeData) {
    lines.push(`${point.timestamp},${point.x},${point.y}`);
  }

  lines.push("");
  lines.push("# State History");
  lines.push("timestamp,state");
  for (const entry of data.stateHistory) {
    lines.push(`${entry.timestamp},${entry.state}`);
  }

  lines.push("");
  lines.push("# Summary");
  lines.push(`duration_seconds,${data.summary.duration}`);
  lines.push(`focus_ratio_pct,${data.summary.focusRatio}`);
  lines.push(`mean_focus_score,${data.summary.meanFocusScore}`);
  lines.push(`state_transitions,${data.summary.transitions}`);
  lines.push(`longest_focus_streak_s,${data.summary.longestFocusStreak}`);
  lines.push(`distraction_count,${data.summary.distractionCount}`);
  lines.push(`nudge_count,${data.summary.interventionCounts.nudge}`);
  lines.push(`warning_count,${data.summary.interventionCounts.warning}`);
  lines.push(`force_close_count,${data.summary.interventionCounts.force_close}`);

  return lines.join("\n");
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
