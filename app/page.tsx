"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import SessionIntent, { type SessionPolicy } from "@/components/SessionIntent";
import Calibration, { type CalibrationData } from "@/components/Calibration";
import Dashboard from "@/components/Dashboard";
import BreakOverlay from "@/components/BreakOverlay";
import type { AttentionState, AttentionMetrics, GazePoint } from "@/lib/attention";
import type { GazeCalibration } from "@/lib/gaze";

const EyeTracker = dynamic(() => import("@/components/EyeTracker"), {
  ssr: false,
  loading: () => (
    <div className="w-full aspect-video bg-zinc-950 rounded-xl flex items-center justify-center border border-zinc-800">
      <p className="text-zinc-600">Loading eye tracker...</p>
    </div>
  ),
});

const VoiceGate = dynamic(() => import("@/components/VoiceGate"), {
  ssr: false,
});

export default function Home() {
  const [sessionIntent, setSessionIntent] = useState<string | null>(null);
  const [sessionPolicy, setSessionPolicy] = useState<SessionPolicy | null>(null);
  const [tracking, setTracking] = useState(false);
  const [showMesh, setShowMesh] = useState(false);
  const [showDot, setShowDot] = useState(true);
  const [attentionState, setAttentionState] = useState<AttentionState>("focused");
  const [metrics, setMetrics] = useState<AttentionMetrics | null>(null);
  const [gazeHistory, setGazeHistory] = useState<GazePoint[]>([]);
  const [showBreak, setShowBreak] = useState(false);
  const [intervention, setIntervention] = useState<"none" | "nudge" | "warning" | "force_close">("none");
  const [voiceReady, setVoiceReady] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [calibration, setCalibration] = useState<GazeCalibration | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const landmarksRef = useRef<{ x: number; y: number }[] | null>(null);
  const lastInterventionRef = useRef<number>(0);
  const sessionStartRef = useRef<number>(0);

  const handleMetricsUpdate = useCallback(
    (newMetrics: AttentionMetrics, state: AttentionState) => {
      setMetrics(newMetrics);
      setAttentionState(state);
    },
    [],
  );

  const handleGazeUpdate = useCallback((point: GazePoint) => {
    setGazeHistory((prev) => {
      const next = [...prev, point];
      if (next.length > 1800) return next.slice(-1800);
      return next;
    });
  }, []);

  const closeBlockedApps = useCallback(async () => {
    if (!sessionPolicy || sessionPolicy.block.length === 0) return;
    // Map policy block categories to actual macOS app names
    const appMap: Record<string, string[]> = {
      twitter: ["Twitter", "X"],
      instagram: ["Instagram"],
      tiktok: ["TikTok"],
      reddit: ["Reddit"],
      facebook: ["Facebook"],
      youtube: ["Google Chrome"], // YouTube lives in browser
      "social media": ["Twitter", "X", "Discord", "Telegram", "WhatsApp"],
      news: ["News"],
      games: [],
      streaming: ["Spotify", "Music"],
      discord: ["Discord"],
      telegram: ["Telegram"],
      whatsapp: ["WhatsApp"],
    };
    const appsToClose = new Set<string>();
    for (const category of sessionPolicy.block) {
      const apps = appMap[category.toLowerCase()] || [category];
      apps.forEach((a) => appsToClose.add(a));
    }
    if (appsToClose.size === 0) return;
    try {
      await fetch("/api/intervene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "close_blocked",
          blocked: Array.from(appsToClose),
        }),
      });
    } catch (err) {
      console.error("Failed to close blocked apps:", err);
    }
  }, [sessionPolicy]);

  const fireIntervention = useCallback(async (level: string, currentMetrics?: AttentionMetrics) => {
    const now = Date.now();
    if (now - lastInterventionRef.current < 30_000) return;
    lastInterventionRef.current = now;

    try {
      const policyCtx = sessionPolicy
        ? `Blocking: ${sessionPolicy.block.join(", ") || "nothing"}. Allowing: ${sessionPolicy.allow.join(", ") || "everything"}. Tone: ${sessionPolicy.tone}.`
        : "";

      if (level === "nudge") {
        await fetch("/api/intervene", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "nudge",
            target: `Goal: ${sessionIntent}. ${policyCtx} Attention drifting. Blink rate: ${currentMetrics?.blinkRate.toFixed(0)}/min. Variance: ${currentMetrics?.gazeVariance.toFixed(0)}px.`,
          }),
        });
      } else if (level === "warning") {
        // Warning level: close blocked apps + send nudge
        await closeBlockedApps();
        await fetch("/api/intervene", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "nudge",
            target: `Goal: ${sessionIntent}. ${policyCtx} Attention distracted 2+ min. Blocked apps closed. Blink rate: ${currentMetrics?.blinkRate.toFixed(0)}/min.`,
          }),
        });
      } else if (level === "force_close") {
        // Force close: close blocked apps + escalate to OpenClaw
        await closeBlockedApps();
        await fetch("/api/intervene", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "openclaw_message",
            target: `Goal: ${sessionIntent}. ${policyCtx} User glazed 3+ min. Blocked apps closed. Blink rate: ${currentMetrics?.blinkRate.toFixed(0)}/min. Saccade: ${currentMetrics?.saccadeSpeed.toFixed(0)}px/s. Force break.`,
          }),
        });
      }
    } catch (err) {
      console.error("Intervention failed:", err);
    }
  }, [sessionIntent, sessionPolicy, closeBlockedApps]);

  const handleIntervention = useCallback(
    (level: "none" | "nudge" | "warning" | "force_close") => {
      setIntervention(level);

      if (level === "nudge") {
        fireIntervention("nudge", metrics ?? undefined);
      }

      if (level === "warning") {
        fireIntervention("warning", metrics ?? undefined);
      }

      if (level === "force_close") {
        fireIntervention("force_close", metrics ?? undefined);
        setShowBreak(true);
        setTracking(false);
      }
    },
    [fireIntervention, metrics],
  );

  const handleVoiceCommand = useCallback(
    (command: string) => {
      switch (command) {
        case "watch":
          setTracking(true);
          break;
        case "stop":
          setTracking(false);
          break;
        case "report":
          document.getElementById("dashboard")?.scrollIntoView({ behavior: "smooth" });
          break;
      }
    },
    [],
  );

  // Session timer
  useEffect(() => {
    if (!tracking) return;
    if (sessionStartRef.current === 0) sessionStartRef.current = Date.now();

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - sessionStartRef.current) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [tracking]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  // Session intent gate: user sets their goal before anything starts
  if (!sessionIntent) {
    return <SessionIntent onStart={(intent, policy) => {
      setSessionIntent(intent);
      setSessionPolicy(policy);
      // Start camera + facemesh but don't track yet -- need calibration first
      setTracking(true);
      setCalibrating(true);
    }} />;
  }

  return (
    <main
      className={`min-h-screen ${intervention === "nudge" ? "nudge-pulse" : ""}`}
    >
      {calibrating && (
        <Calibration
          faceMeshReady={tracking}
          getLandmarks={() => landmarksRef.current}
          onComplete={(data: CalibrationData) => {
            setCalibration(data);
            setCalibrating(false);
          }}
        />
      )}

      {showBreak && (
        <BreakOverlay
          metrics={metrics}
          gazeHistory={gazeHistory}
          onDismiss={() => {
            setShowBreak(false);
            setIntervention("none");
          }}
        />
      )}

      {intervention === "warning" && !showBreak && (
        <div className="fixed top-0 inset-x-0 z-50 bg-crimson/90 text-white text-center py-3 font-bold tracking-wide">
          YOUR EYES ARE GLAZING
        </div>
      )}

      <div className="max-w-7xl mx-auto p-6 space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-crimson">
              LUNATIC EYES
            </h1>
            <p className="text-zinc-500 text-sm mt-1">
              {sessionIntent}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <VoiceGate
              onReady={() => setVoiceReady(true)}
              onCommand={handleVoiceCommand}
            />
            <button
              onClick={() => {
                const next = !showDot;
                setShowDot(next);
                fetch("/api/gaze", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ x: 0, y: 0, visible: next }),
                }).catch(() => {});
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                showDot
                  ? "bg-crimson/20 text-crimson border border-crimson/40"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-700 hover:border-zinc-500"
              }`}
            >
              {showDot ? "DOT ON" : "DOT OFF"}
            </button>
            <button
              onClick={() => setShowMesh(!showMesh)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                showMesh
                  ? "bg-crimson/20 text-crimson border border-crimson/40"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-700 hover:border-zinc-500"
              }`}
            >
              {showMesh ? "MESH ON" : "MESH OFF"}
            </button>
            <button
              onClick={() => setTracking(!tracking)}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                tracking
                  ? "bg-crimson text-white hover:bg-crimson-dim"
                  : "bg-zinc-900 text-zinc-300 border border-zinc-700 hover:border-crimson"
              }`}
            >
              {tracking ? "STOP" : "START"}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <EyeTracker
              active={tracking}
              showMesh={showMesh}
              calibration={calibration}
              landmarksRef={landmarksRef}
              onMetricsUpdate={handleMetricsUpdate}
              onGazeUpdate={handleGazeUpdate}
              onIntervention={handleIntervention}
            />
          </div>

          <div className="space-y-4">
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
                Session Time
              </h3>
              <div className="text-3xl font-bold text-zinc-100 font-mono tracking-wider">
                {formatTime(elapsed)}
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
                Attention State
              </h3>
              <div
                className={`text-2xl font-bold ${
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
              </div>
            </div>

            {metrics && (
              <>
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                  <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
                    Fixation Duration
                  </h3>
                  <div className="text-xl font-bold text-zinc-200">
                    {metrics.fixationDuration.toFixed(0)}ms
                  </div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                  <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
                    Blink Rate
                  </h3>
                  <div className="text-xl font-bold text-zinc-200">
                    {metrics.blinkRate.toFixed(1)}/min
                  </div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                  <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
                    Gaze Variance
                  </h3>
                  <div className="text-xl font-bold text-zinc-200">
                    {metrics.gazeVariance.toFixed(1)}px
                  </div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                  <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
                    Saccade Speed
                  </h3>
                  <div className="text-xl font-bold text-zinc-200">
                    {metrics.saccadeSpeed.toFixed(1)}px/s
                  </div>
                </div>
              </>
            )}

            {sessionPolicy && sessionPolicy.block.length > 0 && (
              <div className="bg-zinc-950 border border-crimson/30 rounded-xl p-4">
                <h3 className="text-xs text-crimson uppercase tracking-wider mb-2">
                  Blocking
                </h3>
                <div className="flex flex-wrap gap-1">
                  {sessionPolicy.block.map((item) => (
                    <span key={item} className="text-xs px-2 py-0.5 rounded bg-crimson/10 text-crimson border border-crimson/20">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {voiceReady && (
              <div className="bg-zinc-950 border border-crimson/30 rounded-xl p-4">
                <h3 className="text-xs text-crimson uppercase tracking-wider mb-1">
                  Voice Active
                </h3>
                <p className="text-zinc-500 text-xs">
                  Say &quot;Lunatic Eyes, watch me&quot;
                </p>
              </div>
            )}
          </div>
        </div>

        <div id="dashboard">
          <Dashboard
            gazeHistory={gazeHistory}
            metrics={metrics}
            attentionState={attentionState}
          />
        </div>
      </div>
    </main>
  );
}
