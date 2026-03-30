"use client";

import { useState, useEffect } from "react";
import type { AttentionMetrics, GazePoint } from "@/lib/attention";

interface BreakOverlayProps {
  metrics: AttentionMetrics | null;
  gazeHistory: GazePoint[];
  sessionIntent?: string | null;
  agentMessage?: string;
  onDismiss: () => void;
}

// Breathing exercise: 4-7-8 pattern
function BreathingCircle() {
  const [phase, setPhase] = useState<"inhale" | "hold" | "exhale">("inhale");
  const [timer, setTimer] = useState(4);

  useEffect(() => {
    const durations = { inhale: 4, hold: 7, exhale: 8 };
    const nextPhase = { inhale: "hold" as const, hold: "exhale" as const, exhale: "inhale" as const };

    const interval = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          const next = nextPhase[phase];
          setPhase(next);
          return durations[next];
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [phase]);

  const scale = phase === "inhale" ? "scale-125" : phase === "hold" ? "scale-125" : "scale-75";
  const label = phase === "inhale" ? "Breathe in" : phase === "hold" ? "Hold" : "Breathe out";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`w-20 h-20 rounded-full border-2 border-crimson/50 flex items-center justify-center transition-transform duration-1000 ${scale}`}>
        <div className="w-8 h-8 rounded-full bg-crimson/30 animate-pulse" />
      </div>
      <div className="text-zinc-500 text-xs uppercase tracking-wider">{label} ({timer})</div>
    </div>
  );
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

  // Diagnosis based on new metric system
  let diagnosis = "Your gaze pattern indicates sustained inattention.";
  if (metrics) {
    if (metrics.gazeStability > 80 && metrics.engagementDepth < 30) {
      diagnosis = "Screen glazing detected. Your eyes were locked in place without cognitive engagement. The stare without the processing.";
    } else if (metrics.gazeStability < 30) {
      diagnosis = "Gaze scatter detected. Your eyes were jumping across the screen without settling into any content.";
    } else if (metrics.alertness < 30) {
      diagnosis = "Fatigue detected. Your blink patterns shifted toward drowsiness. Your eyes need rest.";
    } else if (metrics.screenPresence < 60) {
      diagnosis = "You were frequently looking away from the screen. Sustained off-screen time triggered this intervention.";
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
      <div className="max-w-lg text-center space-y-8 p-8">
        {/* Breathing exercise replaces static icon */}
        <BreathingCircle />

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
            <div className="text-xs text-crimson uppercase tracking-wider mb-2">Assessment</div>
            <p className="text-zinc-200 text-sm leading-relaxed">{agentMessage}</p>
          </div>
        )}

        <p className="text-zinc-400 text-sm leading-relaxed">
          {diagnosis}
        </p>

        {/* New metric display: normalized scores, not raw values */}
        {metrics && (
          <div className="grid grid-cols-2 gap-3 text-left">
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
              <div className="text-xs text-zinc-500 uppercase">Session</div>
              <div className="text-xl font-bold text-zinc-200">
                {minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`}
              </div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
              <div className="text-xs text-zinc-500 uppercase">Focus Score</div>
              <div className={`text-xl font-bold ${
                metrics.focusScore >= 70 ? "text-green-400" :
                metrics.focusScore >= 40 ? "text-yellow-400" :
                "text-crimson"
              }`}>
                {metrics.focusScore}/100
              </div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
              <div className="text-xs text-zinc-500 uppercase">Gaze Stability</div>
              <div className="text-xl font-bold text-zinc-200">
                {metrics.gazeStability}%
              </div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
              <div className="text-xs text-zinc-500 uppercase">Alertness</div>
              <div className="text-xl font-bold text-zinc-200">
                {metrics.alertness}%
              </div>
            </div>
          </div>
        )}

        <div className="text-zinc-600 text-xs">
          Blocked apps closed. Complete one breath cycle, then refocus.
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
