"use client";

import type { AttentionMetrics, GazePoint } from "@/lib/attention";

interface BreakOverlayProps {
  metrics: AttentionMetrics | null;
  gazeHistory: GazePoint[];
  sessionIntent?: string | null;
  agentMessage?: string;
  onDismiss: () => void;
}

export default function BreakOverlay({
  metrics,
  gazeHistory,
  sessionIntent,
  agentMessage,
  onDismiss,
}: BreakOverlayProps) {
  const sessionDuration = gazeHistory.length > 0
    ? Math.round((gazeHistory[gazeHistory.length - 1].timestamp - gazeHistory[0].timestamp) / 1000)
    : 0;

  const minutes = Math.floor(sessionDuration / 60);
  const seconds = sessionDuration % 60;

  // Compute a quick assessment
  let diagnosis = "Your gaze pattern indicates sustained inattention.";
  if (metrics) {
    if (metrics.blinkRate < 10) {
      diagnosis = "Screen glazing detected. Your blink rate dropped well below normal, indicating passive screen staring without cognitive engagement.";
    } else if (metrics.gazeVariance > 200) {
      diagnosis = "Rapid context-switching detected. Your eyes were jumping across the screen without settling, a pattern consistent with distracted browsing.";
    } else if (metrics.saccadeSpeed > 500) {
      diagnosis = "Scanning behavior detected. High-speed eye movement without fixation suggests you were searching rather than reading.";
    } else if (metrics.blinkRate > 30) {
      diagnosis = "Elevated blink rate suggests fatigue or stress. Your eyes need rest.";
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
      <div className="max-w-lg text-center space-y-8 p-8">
        <div className="flex justify-center">
          <div className="w-24 h-24 rounded-full border-4 border-crimson flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-crimson gaze-dot" />
          </div>
        </div>

        <h1 className="text-4xl font-bold text-crimson tracking-tight">
          THE EYE INTERVENED
        </h1>

        {sessionIntent && (
          <p className="text-zinc-500 text-sm">
            Your goal: &quot;{sessionIntent}&quot;
          </p>
        )}

        {agentMessage && (
          <div className="bg-zinc-900 border border-crimson/30 rounded-lg p-4">
            <div className="text-xs text-crimson uppercase tracking-wider mb-2">OpenClaw Assessment</div>
            <p className="text-zinc-200 text-sm leading-relaxed">{agentMessage}</p>
          </div>
        )}

        <p className="text-zinc-400 text-sm leading-relaxed">
          {diagnosis}
        </p>

        {metrics && (
          <div className="grid grid-cols-2 gap-3 text-left">
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
              <div className="text-xs text-zinc-500 uppercase">Session</div>
              <div className="text-xl font-bold text-zinc-200">
                {minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`}
              </div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
              <div className="text-xs text-zinc-500 uppercase">Blink Rate</div>
              <div className="text-xl font-bold text-zinc-200">
                {metrics.blinkRate.toFixed(0)}/min
              </div>
              <div className="text-xs text-zinc-600">normal: 15-20</div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
              <div className="text-xs text-zinc-500 uppercase">Gaze Variance</div>
              <div className="text-xl font-bold text-zinc-200">
                {metrics.gazeVariance.toFixed(0)}px
              </div>
              <div className="text-xs text-zinc-600">lower = focused</div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
              <div className="text-xs text-zinc-500 uppercase">Saccade Speed</div>
              <div className="text-xl font-bold text-zinc-200">
                {metrics.saccadeSpeed.toFixed(0)}px/s
              </div>
              <div className="text-xs text-zinc-600">normal: 50-300</div>
            </div>
          </div>
        )}

        <div className="text-zinc-600 text-xs">
          Blocked apps have been closed. Take 20 seconds.
        </div>

        <button
          onClick={onDismiss}
          className="px-8 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-300 hover:border-crimson transition-colors font-medium"
        >
          I&apos;m ready to refocus
        </button>
      </div>
    </div>
  );
}
