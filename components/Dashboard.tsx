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

interface DashboardProps {
  gazeHistory: GazePoint[];
  metrics: AttentionMetrics | null;
  attentionState: AttentionState;
}

export default function Dashboard({
  gazeHistory,
  metrics,
  attentionState,
}: DashboardProps) {
  const timelineData = useMemo(() => {
    if (gazeHistory.length < 30) return [];

    const data: { time: number; variance: number; speed: number }[] = [];
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
        const dt =
          (window[j].timestamp - window[j - 1].timestamp) / 1000;
        if (dt > 0) totalSpeed += Math.hypot(dx, dy) / dt;
      }

      const elapsed =
        (window[window.length - 1].timestamp - gazeHistory[0].timestamp) /
        1000;

      data.push({
        time: Math.round(elapsed),
        variance: Math.round(variance),
        speed: Math.round(totalSpeed / (window.length - 1)),
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

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-zinc-200">Attention Dashboard</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
            Gaze Heatmap
          </h3>
          <GazeHeatmap gazeHistory={gazeHistory} width={500} height={350} />
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
            Gaze Variance Over Time
          </h3>
          <ResponsiveContainer width="100%" height={350}>
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
                label={{ value: "seconds", fill: "#71717a", fontSize: 11 }}
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

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
            Session Summary
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Current State</span>
              <span
                className={`font-bold ${
                  attentionState === "focused"
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
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Total Gaze Points</span>
              <span className="text-zinc-200 font-mono">
                {gazeHistory.length}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Session Duration</span>
              <span className="text-zinc-200 font-mono">
                {gazeHistory.length > 0
                  ? `${((gazeHistory[gazeHistory.length - 1].timestamp - gazeHistory[0].timestamp) / 1000).toFixed(0)}s`
                  : "0s"}
              </span>
            </div>
            {metrics && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Blink Rate</span>
                  <span className="text-zinc-200 font-mono">
                    {metrics.blinkRate.toFixed(0)}/min
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Saccade Speed</span>
                  <span className="text-zinc-200 font-mono">
                    {metrics.saccadeSpeed.toFixed(0)}px/s
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
