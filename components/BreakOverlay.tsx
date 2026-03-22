"use client";

import type { AttentionMetrics, GazePoint } from "@/lib/attention";

interface BreakOverlayProps {
  metrics: AttentionMetrics | null;
  gazeHistory: GazePoint[];
  onDismiss: () => void;
}

export default function BreakOverlay({
  metrics,
  gazeHistory,
  onDismiss,
}: BreakOverlayProps) {
  const sessionDuration = gazeHistory.length > 0
    ? ((gazeHistory[gazeHistory.length - 1].timestamp - gazeHistory[0].timestamp) / 1000).toFixed(0)
    : "0";

  return (
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
      <div className="max-w-lg text-center space-y-8 p-8">
        <div className="flex justify-center">
          <div className="w-24 h-24 rounded-full border-4 border-crimson flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-crimson gaze-dot" />
          </div>
        </div>

        <h1 className="text-4xl font-bold text-crimson tracking-tight">
          BREAK
        </h1>

        <p className="text-zinc-400 text-lg">
          Your attention drifted for too long. Take a moment.
        </p>

        {metrics && (
          <div className="grid grid-cols-2 gap-4 text-left">
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <div className="text-xs text-zinc-500 uppercase">Session</div>
              <div className="text-xl font-bold text-zinc-200">{sessionDuration}s</div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <div className="text-xs text-zinc-500 uppercase">Blink Rate</div>
              <div className="text-xl font-bold text-zinc-200">
                {metrics.blinkRate.toFixed(0)}/min
              </div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <div className="text-xs text-zinc-500 uppercase">Gaze Points</div>
              <div className="text-xl font-bold text-zinc-200">
                {gazeHistory.length}
              </div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <div className="text-xs text-zinc-500 uppercase">Saccade Speed</div>
              <div className="text-xl font-bold text-zinc-200">
                {metrics.saccadeSpeed.toFixed(0)}px/s
              </div>
            </div>
          </div>
        )}

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
