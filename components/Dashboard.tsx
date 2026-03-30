"use client";

import { useMemo, useCallback } from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import GazeHeatmap from "./GazeHeatmap";
import type { AttentionMetrics, AttentionState, GazePoint } from "@/lib/attention";
import { buildSessionExport, exportJSON, exportCSV, downloadFile } from "@/lib/export";

interface StateEntry {
  state: AttentionState;
  timestamp: number;
}

interface DashboardProps {
  gazeHistory: GazePoint[];
  metrics: AttentionMetrics | null;
  attentionState: AttentionState;
  stateHistory?: StateEntry[];
  interventionCounts?: { nudge: number; warning: number; force_close: number };
}

// Sub-score progress bar component
function ScoreBar({ label, value, description }: { label: string; value: number; description: string }) {
  const color = value >= 70 ? "bg-green-500" : value >= 40 ? "bg-yellow-500" : "bg-red-500";
  const textColor = value >= 70 ? "text-green-400" : value >= 40 ? "text-yellow-400" : "text-crimson";

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-baseline">
        <span className="text-xs text-zinc-400 uppercase tracking-wider">{label}</span>
        <span className={`text-sm font-bold ${textColor}`}>{value}</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.max(2, value)}%` }}
        />
      </div>
      <p className="text-xs text-zinc-600">{description}</p>
    </div>
  );
}

function computeStateStats(stateHistory: StateEntry[]) {
  if (stateHistory.length < 2) return null;

  const totalDuration = stateHistory[stateHistory.length - 1].timestamp - stateHistory[0].timestamp;
  if (totalDuration <= 0) return null;

  const durations: Record<string, number> = { "locked-in": 0, drifting: 0, glazed: 0, away: 0 };
  let transitions = 0;
  let longestFocus = 0;
  let currentFocusStreak = 0;
  let distractionCount = 0;

  for (let i = 1; i < stateHistory.length; i++) {
    const prev = stateHistory[i - 1];
    const curr = stateHistory[i];
    const dt = curr.timestamp - prev.timestamp;

    durations[prev.state] = (durations[prev.state] || 0) + dt;

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

  const focusRatio = totalDuration > 0 ? (durations["locked-in"] / totalDuration) * 100 : 0;

  return {
    focusRatio: Math.round(focusRatio),
    transitions,
    longestFocusStreak: Math.round(longestFocus / 1000),
    distractionCount,
    totalDuration: Math.round(totalDuration / 1000),
    durations,
  };
}

function generateAssessment(
  metrics: AttentionMetrics | null,
  stateStats: ReturnType<typeof computeStateStats>,
): string {
  if (!metrics) return "";
  const lines: string[] = [];
  const score = metrics.focusScore;

  if (score >= 80) {
    lines.push("Strong focus session. Gaze stable, fixation patterns consistent.");
  } else if (score >= 60) {
    lines.push("Moderate focus. Some drift detected but attention recovered.");
  } else if (score >= 40) {
    lines.push("Below average. Frequent gaze drift, irregular fixation patterns.");
  } else {
    lines.push("Poor focus. High gaze scatter suggests sustained disengagement.");
  }

  if (stateStats) {
    if (stateStats.focusRatio >= 70) {
      lines.push(`Focused ${stateStats.focusRatio}% of the session.`);
    } else if (stateStats.focusRatio >= 40) {
      lines.push(`Only focused ${stateStats.focusRatio}% of the time. ${stateStats.distractionCount} episodes detected.`);
    } else {
      lines.push(`Focused just ${stateStats.focusRatio}%. ${stateStats.distractionCount} episodes across ${stateStats.transitions} state changes.`);
    }

    if (stateStats.longestFocusStreak > 0) {
      lines.push(`Peak streak: ${stateStats.longestFocusStreak}s.`);
    }
  }

  if (metrics.alertness < 40) {
    lines.push("Low alertness detected. Consider taking a break.");
  }

  return lines.join(" ");
}

function formatStreak(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
}

export default function Dashboard({
  gazeHistory,
  metrics,
  attentionState,
  stateHistory = [],
  interventionCounts = { nudge: 0, warning: 0, force_close: 0 },
}: DashboardProps) {
  const stateStats = useMemo(() => computeStateStats(stateHistory), [stateHistory]);
  const assessment = useMemo(
    () => generateAssessment(metrics, stateStats),
    [metrics, stateStats],
  );

  const handleExportJSON = useCallback(() => {
    const data = buildSessionExport(gazeHistory, stateHistory, metrics, interventionCounts);
    const json = exportJSON(data);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadFile(json, `lunatic-eyes-session-${timestamp}.json`, "application/json");
  }, [gazeHistory, stateHistory, metrics, interventionCounts]);

  const handleExportCSV = useCallback(() => {
    const data = buildSessionExport(gazeHistory, stateHistory, metrics, interventionCounts);
    const csv = exportCSV(data);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadFile(csv, `lunatic-eyes-session-${timestamp}.csv`, "text/csv");
  }, [gazeHistory, stateHistory, metrics, interventionCounts]);

  // Timeline data: focus score over time from metrics history
  const timelineData = useMemo(() => {
    if (gazeHistory.length < 30) return [];

    const data: { time: number; focusScore: number; stability: number }[] = [];
    const sampleRate = 30;

    for (let i = sampleRate; i < gazeHistory.length; i += sampleRate) {
      const windowPts = gazeHistory.slice(i - sampleRate, i);
      const xs = windowPts.map((p) => p.x);
      const ys = windowPts.map((p) => p.y);

      const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
      const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
      const variance = Math.sqrt(
        xs.reduce((s, x) => s + (x - meanX) ** 2, 0) / xs.length +
          ys.reduce((s, y) => s + (y - meanY) ** 2, 0) / ys.length,
      );

      const elapsed = (windowPts[windowPts.length - 1].timestamp - gazeHistory[0].timestamp) / 1000;

      // Stability score: inverted variance, normalized
      const stability = Math.max(0, Math.min(100, 100 - (variance / 300) * 100));

      // Use the engine's focus score if available, otherwise approximate
      const focusScore = metrics
        ? Math.round(stability * 0.6 + 40 * (metrics.screenPresence / 100))
        : Math.round(stability);

      data.push({
        time: Math.round(elapsed),
        focusScore: Math.min(100, focusScore),
        stability: Math.round(stability),
      });
    }

    return data;
  }, [gazeHistory, metrics]);

  if (gazeHistory.length < 30) {
    return (
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-8 text-center">
        <p className="text-zinc-500">
          Start tracking to see your attention dashboard.
        </p>
      </div>
    );
  }

  const focusScore = metrics?.focusScore ?? 0;

  const scoreColor =
    focusScore >= 70 ? "text-green-400" :
    focusScore >= 40 ? "text-yellow-400" :
    "text-crimson";

  const scoreBorder =
    focusScore >= 70 ? "border-green-500/30" :
    focusScore >= 40 ? "border-yellow-500/30" :
    "border-crimson/30";

  const stateColor =
    attentionState === "locked-in" ? "text-green-400" :
    attentionState === "drifting" ? "text-yellow-400" :
    attentionState === "glazed" ? "text-orange-400" :
    "text-crimson";

  const stateLabel =
    attentionState === "locked-in" ? "FOCUSED" :
    attentionState === "away" ? "AWAY" :
    attentionState.toUpperCase();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-zinc-200">Attention Dashboard</h2>
        <div className="flex gap-2">
          <button
            onClick={handleExportJSON}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-zinc-400 border border-zinc-700 hover:border-crimson transition-colors"
          >
            Export JSON
          </button>
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-zinc-400 border border-zinc-700 hover:border-crimson transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* LAYER 1: Hero focus score + key stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Big focus score */}
        <div className={`bg-zinc-950 border ${scoreBorder} rounded-xl p-6 text-center col-span-2 lg:col-span-1`}>
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Focus Score</div>
          <div className={`text-5xl font-bold ${scoreColor}`}>{focusScore}</div>
          <div className="text-xs text-zinc-600 mt-1">/100</div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">State</div>
          <div className={`text-2xl font-bold ${stateColor}`}>{stateLabel}</div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">On-Screen</div>
          <div className="text-2xl font-bold text-zinc-200">
            {metrics ? `${Math.round(metrics.onScreenRatio * 100)}%` : "--"}
          </div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Focus Streak</div>
          <div className="text-2xl font-bold text-zinc-200">
            {metrics ? formatStreak(metrics.focusStreak) : "--"}
          </div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Drift Events</div>
          <div className="text-2xl font-bold text-crimson">
            {metrics ? metrics.distractionEvents : "--"}
          </div>
        </div>
      </div>

      {/* LAYER 2: Sub-scores (WHOOP model) */}
      {metrics && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-4">Contributing Factors</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ScoreBar
              label="Gaze Stability"
              value={metrics.gazeStability}
              description={metrics.gazeStability >= 70 ? "Concentrated gaze pattern" : metrics.gazeStability >= 40 ? "Some scatter detected" : "Eyes jumping across screen"}
            />
            <ScoreBar
              label="Engagement Depth"
              value={metrics.engagementDepth}
              description={metrics.engagementDepth >= 70 ? "Deep processing detected" : metrics.engagementDepth >= 40 ? "Surface-level scanning" : "Unfocused browsing"}
            />
            <ScoreBar
              label="Screen Presence"
              value={metrics.screenPresence}
              description={metrics.screenPresence >= 95 ? "Looking at screen" : metrics.screenPresence >= 70 ? "Occasional glances away" : "Frequently looking away"}
            />
            <ScoreBar
              label="Alertness"
              value={metrics.alertness}
              description={metrics.alertness >= 70 ? "Alert and responsive" : metrics.alertness >= 40 ? "Slightly fatigued" : "Signs of fatigue"}
            />
          </div>
        </div>
      )}

      {/* Assessment */}
      {assessment && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-xs text-crimson uppercase tracking-wider mb-3">Session Assessment</h3>
          <p className="text-zinc-300 text-sm leading-relaxed">{assessment}</p>
        </div>
      )}

      {/* LAYER 3: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
            Gaze Heatmap
          </h3>
          <GazeHeatmap gazeHistory={gazeHistory} width={500} height={350} />
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
            Focus Score Over Time
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={timelineData}>
              <defs>
                <linearGradient id="focusGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="time"
                stroke="#52525b"
                tick={{ fill: "#71717a", fontSize: 11 }}
                label={{ value: "seconds", fill: "#71717a", fontSize: 11 }}
              />
              <YAxis
                stroke="#52525b"
                tick={{ fill: "#71717a", fontSize: 11 }}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: "8px",
                  color: "#e4e4e7",
                }}
              />
              <Area
                type="monotone"
                dataKey="focusScore"
                stroke="#22c55e"
                fill="url(#focusGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 lg:col-span-2">
          <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
            Gaze Stability Over Time
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={timelineData}>
              <defs>
                <linearGradient id="stabilityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="time"
                stroke="#52525b"
                tick={{ fill: "#71717a", fontSize: 11 }}
              />
              <YAxis
                stroke="#52525b"
                tick={{ fill: "#71717a", fontSize: 11 }}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: "8px",
                  color: "#e4e4e7",
                }}
              />
              <Area
                type="monotone"
                dataKey="stability"
                stroke="#3b82f6"
                fill="url(#stabilityGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Session stats footer */}
      {stateStats && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-3 gap-4 text-center text-sm">
            <div>
              <div className="text-zinc-500 text-xs uppercase">Focus Ratio</div>
              <div className="text-zinc-200 font-bold">{stateStats.focusRatio}%</div>
            </div>
            <div>
              <div className="text-zinc-500 text-xs uppercase">Peak Streak</div>
              <div className="text-zinc-200 font-bold">{stateStats.longestFocusStreak}s</div>
            </div>
            <div>
              <div className="text-zinc-500 text-xs uppercase">Session</div>
              <div className="text-zinc-200 font-bold">{Math.round(stateStats.totalDuration / 60)}m</div>
            </div>
          </div>
          {(interventionCounts.nudge > 0 || interventionCounts.warning > 0 || interventionCounts.force_close > 0) && (
            <div className="grid grid-cols-3 gap-4 text-center text-sm border-t border-zinc-800 pt-3">
              <div>
                <div className="text-zinc-500 text-xs uppercase">Nudges</div>
                <div className="text-yellow-400 font-bold">{interventionCounts.nudge}</div>
              </div>
              <div>
                <div className="text-zinc-500 text-xs uppercase">Warnings</div>
                <div className="text-orange-400 font-bold">{interventionCounts.warning}</div>
              </div>
              <div>
                <div className="text-zinc-500 text-xs uppercase">Force Closes</div>
                <div className="text-crimson font-bold">{interventionCounts.force_close}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
