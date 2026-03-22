"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
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

interface StateEntry {
  state: AttentionState;
  timestamp: number;
}

interface DashboardProps {
  gazeHistory: GazePoint[];
  metrics: AttentionMetrics | null;
  attentionState: AttentionState;
  stateHistory?: StateEntry[];
}

function computeFocusScore(metrics: AttentionMetrics | null, gazeHistory: GazePoint[]): number {
  if (!metrics || gazeHistory.length < 30) return 0;

  // Fixation score: longer fixations = better focus (max ~5000ms)
  const fixScore = Math.min(metrics.fixationDuration / 5000, 1) * 30;

  // Blink rate score: 15-20/min is optimal, penalize extremes
  const blinkOptimal = metrics.blinkRate >= 10 && metrics.blinkRate <= 25;
  const blinkScore = blinkOptimal ? 20 : Math.max(0, 20 - Math.abs(metrics.blinkRate - 17) * 2);

  // Variance score: lower = more focused (inverse, max ~300px)
  const varScore = Math.max(0, 30 - (metrics.gazeVariance / 300) * 30);

  // Saccade score: moderate speed = good (too fast = scanning, too slow = glazing)
  const saccOptimal = metrics.saccadeSpeed >= 50 && metrics.saccadeSpeed <= 300;
  const saccScore = saccOptimal ? 20 : Math.max(0, 20 - Math.abs(metrics.saccadeSpeed - 175) / 20);

  return Math.round(Math.min(100, fixScore + blinkScore + varScore + saccScore));
}

function computeStateStats(stateHistory: StateEntry[]) {
  if (stateHistory.length < 2) return null;

  const totalDuration = stateHistory[stateHistory.length - 1].timestamp - stateHistory[0].timestamp;
  if (totalDuration <= 0) return null;

  const durations: Record<string, number> = { "locked-in": 0, drifting: 0, glazed: 0, distracted: 0 };
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
      if (curr.state === "distracted" || curr.state === "glazed") {
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
  focusScore: number,
  stateStats: ReturnType<typeof computeStateStats>,
  metrics: AttentionMetrics | null,
): string {
  const lines: string[] = [];

  if (focusScore >= 80) {
    lines.push("Strong focus session. Your gaze remained stable with consistent fixation patterns.");
  } else if (focusScore >= 60) {
    lines.push("Moderate focus. Some drift detected but attention recovered.");
  } else if (focusScore >= 40) {
    lines.push("Below average focus. Frequent gaze drift and irregular fixation patterns.");
  } else {
    lines.push("Poor focus session. High gaze variance suggests sustained distraction.");
  }

  if (stateStats) {
    if (stateStats.focusRatio >= 70) {
      lines.push(`Locked in ${stateStats.focusRatio}% of the session.`);
    } else if (stateStats.focusRatio >= 40) {
      lines.push(`Only locked in ${stateStats.focusRatio}% of session time. ${stateStats.distractionCount} distraction episodes detected.`);
    } else {
      lines.push(`Locked in just ${stateStats.focusRatio}% of the time. ${stateStats.distractionCount} distraction episodes across ${stateStats.transitions} state changes.`);
    }

    if (stateStats.longestFocusStreak > 0) {
      lines.push(`Peak focus streak: ${stateStats.longestFocusStreak}s.`);
    }
  }

  if (metrics) {
    if (metrics.blinkRate < 10) {
      lines.push("Low blink rate detected (possible screen glazing or eye fatigue).");
    } else if (metrics.blinkRate > 30) {
      lines.push("Elevated blink rate (possible stress or dry eyes).");
    }

    if (metrics.gazeVariance > 200) {
      lines.push("High gaze scatter indicates rapid context-switching across screen regions.");
    }
  }

  return lines.join(" ");
}

export default function Dashboard({
  gazeHistory,
  metrics,
  attentionState,
  stateHistory = [],
}: DashboardProps) {
  const focusScore = useMemo(() => computeFocusScore(metrics, gazeHistory), [metrics, gazeHistory]);
  const stateStats = useMemo(() => computeStateStats(stateHistory), [stateHistory]);
  const assessment = useMemo(
    () => generateAssessment(focusScore, stateStats, metrics),
    [focusScore, stateStats, metrics],
  );

  const timelineData = useMemo(() => {
    if (gazeHistory.length < 30) return [];

    const data: { time: number; variance: number; speed: number; focusScore: number }[] = [];
    const sampleRate = 30;

    for (let i = sampleRate; i < gazeHistory.length; i += sampleRate) {
      const window = gazeHistory.slice(i - sampleRate, i);
      const xs = window.map((p) => p.x);
      const ys = window.map((p) => p.y);

      const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
      const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
      const variance = Math.sqrt(
        xs.reduce((s, x) => s + (x - meanX) ** 2, 0) / xs.length +
          ys.reduce((s, y) => s + (y - meanY) ** 2, 0) / ys.length,
      );

      let totalSpeed = 0;
      for (let j = 1; j < window.length; j++) {
        const dx = window[j].x - window[j - 1].x;
        const dy = window[j].y - window[j - 1].y;
        const dt = (window[j].timestamp - window[j - 1].timestamp) / 1000;
        if (dt > 0) totalSpeed += Math.hypot(dx, dy) / dt;
      }

      const elapsed = (window[window.length - 1].timestamp - gazeHistory[0].timestamp) / 1000;

      // Window-level focus score approximation
      const varScore = Math.max(0, 30 - (variance / 300) * 30);
      const speedAvg = totalSpeed / (window.length - 1);
      const speedScore = speedAvg >= 50 && speedAvg <= 300 ? 20 : Math.max(0, 20 - Math.abs(speedAvg - 175) / 20);
      const windowScore = Math.round(Math.min(100, varScore + speedScore + 50));

      data.push({
        time: Math.round(elapsed),
        variance: Math.round(variance),
        speed: Math.round(totalSpeed / (window.length - 1)),
        focusScore: windowScore,
      });
    }

    return data;
  }, [gazeHistory]);

  if (gazeHistory.length < 30) {
    return (
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-8 text-center">
        <p className="text-zinc-500">
          Start tracking to see your attention dashboard.
        </p>
      </div>
    );
  }

  const scoreColor =
    focusScore >= 70 ? "text-green-400" :
    focusScore >= 45 ? "text-yellow-400" :
    "text-crimson";

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-zinc-200">Attention Dashboard</h2>

      {/* Top row: Focus Score + State Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Focus Score</div>
          <div className={`text-4xl font-bold ${scoreColor}`}>{focusScore}</div>
          <div className="text-xs text-zinc-600 mt-1">/100</div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Focus Ratio</div>
          <div className="text-4xl font-bold text-zinc-200">
            {stateStats ? `${stateStats.focusRatio}%` : "--"}
          </div>
          <div className="text-xs text-zinc-600 mt-1">time locked-in</div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Peak Streak</div>
          <div className="text-4xl font-bold text-zinc-200">
            {stateStats ? `${stateStats.longestFocusStreak}s` : "--"}
          </div>
          <div className="text-xs text-zinc-600 mt-1">longest focus</div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Distractions</div>
          <div className="text-4xl font-bold text-crimson">
            {stateStats ? stateStats.distractionCount : "--"}
          </div>
          <div className="text-xs text-zinc-600 mt-1">episodes</div>
        </div>
      </div>

      {/* Assessment */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-xs text-crimson uppercase tracking-wider mb-3">Session Assessment</h3>
        <p className="text-zinc-300 text-sm leading-relaxed">{assessment}</p>
      </div>

      {/* Biometric cards */}
      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Fixation</div>
            <div className="text-xl font-bold text-zinc-200">{metrics.fixationDuration.toFixed(0)}ms</div>
            <div className="text-xs text-zinc-600 mt-1">normal: 200-600ms</div>
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Blink Rate</div>
            <div className="text-xl font-bold text-zinc-200">{metrics.blinkRate.toFixed(1)}/min</div>
            <div className="text-xs text-zinc-600 mt-1">normal: 15-20/min</div>
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Gaze Variance</div>
            <div className="text-xl font-bold text-zinc-200">{metrics.gazeVariance.toFixed(0)}px</div>
            <div className="text-xs text-zinc-600 mt-1">lower = more focused</div>
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Saccade Speed</div>
            <div className="text-xl font-bold text-zinc-200">{metrics.saccadeSpeed.toFixed(0)}px/s</div>
            <div className="text-xs text-zinc-600 mt-1">normal: 50-300px/s</div>
          </div>
        </div>
      )}

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

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
            Gaze Variance Over Time
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={timelineData}>
              <defs>
                <linearGradient id="varianceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#DC143C" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#DC143C" stopOpacity={0} />
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
                dataKey="variance"
                stroke="#DC143C"
                fill="url(#varianceGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
            Saccade Speed Over Time
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="time"
                stroke="#52525b"
                tick={{ fill: "#71717a", fontSize: 11 }}
              />
              <YAxis
                stroke="#52525b"
                tick={{ fill: "#71717a", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: "8px",
                  color: "#e4e4e7",
                }}
              />
              <Line
                type="monotone"
                dataKey="speed"
                stroke="#FF0000"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Current state */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
        <div className="flex justify-between items-center">
          <span className="text-zinc-400">Current State</span>
          <span
            className={`text-lg font-bold ${
              attentionState === "locked-in"
                ? "text-green-400"
                : attentionState === "drifting"
                  ? "text-yellow-400"
                  : attentionState === "glazed"
                    ? "text-orange-400"
                    : "text-crimson"
            }`}
          >
            {attentionState.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
}
