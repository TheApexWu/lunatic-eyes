"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import {
  drawFaceMesh,
  drawGazeDot,
  computeEAR,
  computeIrisSize,
  LEFT_EYE,
  RIGHT_EYE,
} from "@/lib/gaze";
import { AttentionEngine, type AttentionState, type AttentionMetrics, type GazePoint } from "@/lib/attention";

interface EyeTrackerProps {
  active: boolean;
  showMesh: boolean;
  onMetricsUpdate: (metrics: AttentionMetrics, state: AttentionState) => void;
  onGazeUpdate: (point: GazePoint) => void;
  onIntervention: (level: "none" | "nudge" | "warning" | "force_close") => void;
}

const EAR_BLINK_THRESHOLD = 0.2;
const INTERVENTION_THRESHOLDS = {
  nudge: 60_000,
  warning: 120_000,
  force_close: 180_000,
};

export default function EyeTracker({
  active,
  showMesh,
  onMetricsUpdate,
  onGazeUpdate,
  onIntervention,
}: EyeTrackerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gazeCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<AttentionEngine>(new AttentionEngine());
  const faceMeshRef = useRef<any>(null);
  const webgazerRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);
  const stateStartRef = useRef<{ state: AttentionState; since: number }>({
    state: "focused",
    since: Date.now(),
  });
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function initCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch (err) {
        setError("Camera access denied. Enable webcam permissions.");
        console.error("Camera error:", err);
      }
    }

    initCamera();

    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!cameraReady) return;

    let cancelled = false;

    async function initFaceMesh() {
      try {
        if (!(window as any).FaceMesh) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src =
              "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js";
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("MediaPipe CDN load failed"));
            document.head.appendChild(script);
          });
        }

        const FaceMesh = (window as any).FaceMesh;
        if (!FaceMesh) throw new Error("FaceMesh not available on window");

        const faceMesh = new FaceMesh({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        faceMesh.onResults((results: any) => {
          if (cancelled) return;
          if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;

          const landmarks = results.multiFaceLandmarks[0];
          const canvas = canvasRef.current;
          if (!canvas) return;

          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          // Always compute metrics, only draw if showMesh is on
          if (showMesh) {
            drawFaceMesh(ctx, landmarks, canvas.width, canvas.height);
          } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }

          const leftEAR = computeEAR(landmarks, LEFT_EYE);
          const rightEAR = computeEAR(landmarks, RIGHT_EYE);
          const avgEAR = (leftEAR + rightEAR) / 2;

          if (avgEAR < EAR_BLINK_THRESHOLD) {
            engineRef.current.addBlink(Date.now());
          }

          const irisSize = computeIrisSize(landmarks, canvas.width, canvas.height);
          engineRef.current.setIrisSize(irisSize);
        });

        faceMeshRef.current = faceMesh;
      } catch (err) {
        console.error("MediaPipe init error:", err);
        setError("Failed to load face mesh model.");
      }
    }

    initFaceMesh();

    return () => {
      cancelled = true;
    };
  }, [cameraReady, showMesh]);

  useEffect(() => {
    if (!cameraReady || !active) return;

    let cancelled = false;

    async function initWebGazer() {
      try {
        if (!(window as any).webgazer) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src =
              "https://webgazer.cs.brown.edu/webgazer.js";
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("WebGazer CDN load failed"));
            document.head.appendChild(script);
          });
        }

        const webgazer = (window as any).webgazer;
        if (!webgazer) throw new Error("WebGazer not available on window");

        webgazer
          .setGazeListener((data: any) => {
            if (cancelled || !data) return;

            const point: GazePoint = {
              x: data.x,
              y: data.y,
              timestamp: Date.now(),
            };

            engineRef.current.addGaze(point);
            onGazeUpdate(point);

            const gazeCanvas = gazeCanvasRef.current;
            if (gazeCanvas && showMesh) {
              const ctx = gazeCanvas.getContext("2d");
              if (ctx) {
                ctx.clearRect(0, 0, gazeCanvas.width, gazeCanvas.height);
                drawGazeDot(ctx, data.x, data.y);
              }
            }
          })
          .begin();

        webgazer.showVideoPreview(false);
        webgazer.showPredictionPoints(false);

        webgazerRef.current = webgazer;
      } catch (err) {
        console.error("WebGazer init error:", err);
      }
    }

    initWebGazer();

    return () => {
      cancelled = true;
      webgazerRef.current?.end();
      webgazerRef.current = null;
    };
  }, [cameraReady, active, onGazeUpdate, showMesh]);

  useEffect(() => {
    if (!active || !cameraReady) return;

    let lastMetricsTime = 0;
    const METRICS_INTERVAL = 1000;

    const loop = async () => {
      const video = videoRef.current;
      const faceMesh = faceMeshRef.current;

      if (video && faceMesh && video.readyState >= 2) {
        await faceMesh.send({ image: video });
      }

      const now = Date.now();
      if (now - lastMetricsTime > METRICS_INTERVAL) {
        lastMetricsTime = now;
        const metrics = engineRef.current.compute();
        const state = engineRef.current.classify(metrics);
        onMetricsUpdate(metrics, state);

        if (state !== stateStartRef.current.state) {
          stateStartRef.current = { state, since: now };
        }

        const duration = now - stateStartRef.current.since;

        if (state === "glazed" && duration > INTERVENTION_THRESHOLDS.force_close) {
          onIntervention("force_close");
        } else if (
          (state === "distracted" || state === "glazed") &&
          duration > INTERVENTION_THRESHOLDS.warning
        ) {
          onIntervention("warning");
        } else if (state === "drifting" && duration > INTERVENTION_THRESHOLDS.nudge) {
          onIntervention("nudge");
        } else {
          onIntervention("none");
        }
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [active, cameraReady, onMetricsUpdate, onIntervention]);

  if (error) {
    return (
      <div className="w-full aspect-video bg-zinc-950 rounded-xl flex items-center justify-center border border-red-900">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-zinc-800">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
        style={{ transform: "scaleX(-1)" }}
      />

      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        className="absolute inset-0 w-full h-full"
        style={{ transform: "scaleX(-1)", display: showMesh ? "block" : "none" }}
      />

      <canvas
        ref={gazeCanvasRef}
        width={typeof window !== "undefined" ? window.innerWidth : 1920}
        height={typeof window !== "undefined" ? window.innerHeight : 1080}
        className="fixed inset-0 pointer-events-none z-40"
        style={{ display: showMesh ? "block" : "none" }}
      />

      <div className="absolute inset-0 scanline pointer-events-none" />

      <div className="absolute top-3 left-3 flex items-center gap-2">
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            active ? "bg-crimson animate-pulse" : "bg-zinc-600"
          }`}
        />
        <span className="text-xs text-zinc-400 uppercase tracking-wider">
          {active ? "tracking" : "idle"}
        </span>
      </div>

      {!cameraReady && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-zinc-500">Requesting camera access...</p>
        </div>
      )}
    </div>
  );
}
