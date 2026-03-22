"use client";

import { useRef, useEffect, useState } from "react";
import {
  drawFaceMesh,
  drawGazeDot,
  computeEAR,
  computeIrisSize,
  estimateGaze,
  LEFT_EYE,
  RIGHT_EYE,
  type GazeCalibration,
} from "@/lib/gaze";
import { AttentionEngine, type AttentionState, type AttentionMetrics, type GazePoint } from "@/lib/attention";

interface EyeTrackerProps {
  active: boolean;
  showMesh: boolean;
  calibration: GazeCalibration | null;
  onMetricsUpdate: (metrics: AttentionMetrics, state: AttentionState) => void;
  onGazeUpdate: (point: GazePoint) => void;
  onIntervention: (level: "none" | "nudge" | "warning" | "force_close") => void;
  landmarksRef?: React.MutableRefObject<{ x: number; y: number }[] | null>;
}

const EAR_BLINK_THRESHOLD = 0.2;
const INTERVENTION_THRESHOLDS = {
  nudge: 15_000,
  warning: 30_000,
  force_close: 45_000,
};

export default function EyeTracker({
  active,
  showMesh,
  calibration,
  onMetricsUpdate,
  onGazeUpdate,
  onIntervention,
  landmarksRef: externalLandmarksRef,
}: EyeTrackerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gazeCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<AttentionEngine>(new AttentionEngine());
  const faceMeshRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);
  const stateStartRef = useRef<{ state: AttentionState; since: number }>({
    state: "locked-in",
    since: Date.now(),
  });
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showMeshRef = useRef(showMesh);
  const blinkOpenRef = useRef(true);
  const lastGazePostRef = useRef(0);
  const smoothGazeRef = useRef<{ x: number; y: number } | null>(null);
  const SMOOTHING = 0.15; // lower = smoother, higher = more responsive
  const calibrationRef = useRef<GazeCalibration | null>(calibration);
  const onGazeUpdateRef = useRef(onGazeUpdate);
  const onMetricsUpdateRef = useRef(onMetricsUpdate);
  const onInterventionRef = useRef(onIntervention);

  // Keep refs synced
  showMeshRef.current = showMesh;
  calibrationRef.current = calibration;
  onGazeUpdateRef.current = onGazeUpdate;
  onMetricsUpdateRef.current = onMetricsUpdate;
  onInterventionRef.current = onIntervention;

  // Camera init -- gated behind START
  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let stream: MediaStream | null = null;

    async function initCamera() {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Camera permission timeout (15s)")), 15_000)
        );
        stream = await Promise.race([
          navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: "user" },
          }),
          timeoutPromise,
        ]);
        if (cancelled || !videoRef.current) {
          stream?.getTracks().forEach((t) => t.stop());
          return;
        }
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          // play() interrupted by unmount
        }
        if (!cancelled) setCameraReady(true);
      } catch (err: any) {
        if (!cancelled && err?.name !== "AbortError") {
          setError("Camera access denied. Enable webcam permissions and reload.");
          console.error("Camera error:", err);
        }
      }
    }

    initCamera();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      setCameraReady(false);
    };
  }, [active]);

  // MediaPipe FaceMesh init
  useEffect(() => {
    if (!cameraReady) return;

    let cancelled = false;
    let lastMetricsTime = 0;
    const METRICS_INTERVAL = 1000;

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
          // Expose landmarks for calibration component
          if (externalLandmarksRef) externalLandmarksRef.current = landmarks;
          const canvas = canvasRef.current;
          if (!canvas) return;

          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          // Draw mesh if toggled on
          if (showMeshRef.current) {
            drawFaceMesh(ctx, landmarks, canvas.width, canvas.height);
          } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }

          // Blink detection with edge detection
          const leftEAR = computeEAR(landmarks, LEFT_EYE);
          const rightEAR = computeEAR(landmarks, RIGHT_EYE);
          const avgEAR = (leftEAR + rightEAR) / 2;

          if (avgEAR < EAR_BLINK_THRESHOLD) {
            if (blinkOpenRef.current) {
              engineRef.current.addBlink(Date.now());
              blinkOpenRef.current = false;
            }
          } else {
            blinkOpenRef.current = true;
          }

          // Iris size
          const irisSize = computeIrisSize(landmarks, canvas.width, canvas.height);
          engineRef.current.setIrisSize(irisSize);

          // Gaze estimation from iris position (use full screen, not just browser)
          const screenW = typeof window !== "undefined" ? screen.width : 1920;
          const screenH = typeof window !== "undefined" ? screen.height : 1080;
          const gaze = estimateGaze(landmarks, screenW, screenH, calibrationRef.current ?? undefined);

          if (gaze) {
            // EMA smoothing
            if (!smoothGazeRef.current) {
              smoothGazeRef.current = { x: gaze.x, y: gaze.y };
            } else {
              smoothGazeRef.current.x += SMOOTHING * (gaze.x - smoothGazeRef.current.x);
              smoothGazeRef.current.y += SMOOTHING * (gaze.y - smoothGazeRef.current.y);
            }
            const sx = smoothGazeRef.current.x;
            const sy = smoothGazeRef.current.y;

            const point: GazePoint = {
              x: sx,
              y: sy,
              timestamp: Date.now(),
            };
            engineRef.current.addGaze(point);
            onGazeUpdateRef.current(point);

            // Draw gaze dot in browser overlay
            const gazeCanvas = gazeCanvasRef.current;
            if (gazeCanvas) {
              const gctx = gazeCanvas.getContext("2d");
              if (gctx) {
                gctx.clearRect(0, 0, gazeCanvas.width, gazeCanvas.height);
                drawGazeDot(gctx, sx, sy);
              }
            }

            // Send to native overlay (throttled ~15fps)
            const now = Date.now();
            if (now - lastGazePostRef.current > 66) {
              lastGazePostRef.current = now;
              fetch("/api/gaze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ x: sx, y: sy }),
              }).catch(() => {});
            }
          }

          // Compute metrics every second
          const now = Date.now();
          if (now - lastMetricsTime > METRICS_INTERVAL) {
            lastMetricsTime = now;
            const metrics = engineRef.current.compute();
            const state = engineRef.current.classify(metrics);
            onMetricsUpdateRef.current(metrics, state);

            if (state !== stateStartRef.current.state) {
              stateStartRef.current = { state, since: now };
            }

            const duration = now - stateStartRef.current.since;

            // Any non-locked-in state escalates through the full ladder
            if (state !== "locked-in" && duration > INTERVENTION_THRESHOLDS.force_close) {
              onInterventionRef.current("force_close");
            } else if (state !== "locked-in" && duration > INTERVENTION_THRESHOLDS.warning) {
              onInterventionRef.current("warning");
            } else if (state !== "locked-in" && duration > INTERVENTION_THRESHOLDS.nudge) {
              onInterventionRef.current("nudge");
            } else {
              onInterventionRef.current("none");
            }
          }
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
  }, [cameraReady]);

  // Animation loop -- sends video frames to FaceMesh
  useEffect(() => {
    if (!active || !cameraReady) return;

    const loop = async () => {
      const video = videoRef.current;
      const faceMesh = faceMeshRef.current;

      if (video && faceMesh && video.readyState >= 2) {
        await faceMesh.send({ image: video });
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [active, cameraReady]);

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
        autoPlay
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

      {/* Full-screen gaze dot overlay -- always visible */}
      <canvas
        ref={gazeCanvasRef}
        width={typeof window !== "undefined" ? window.innerWidth : 1920}
        height={typeof window !== "undefined" ? window.innerHeight : 1080}
        className="fixed inset-0 pointer-events-none z-40"
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
          <p className="text-zinc-500">
            {active ? "Requesting camera access..." : "Click START to begin"}
          </p>
        </div>
      )}
    </div>
  );
}
