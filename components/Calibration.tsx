"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface CalibrationData {
  minRatioX: number;
  maxRatioX: number;
  minRatioY: number;
  maxRatioY: number;
}

interface CalibrationProps {
  onComplete: (data: CalibrationData) => void;
  faceMeshReady: boolean;
  getLandmarks: () => { x: number; y: number }[] | null;
}

const POINTS = [
  { x: 0.1, y: 0.1, label: "TOP LEFT" },
  { x: 0.9, y: 0.1, label: "TOP RIGHT" },
  { x: 0.5, y: 0.5, label: "CENTER" },
  { x: 0.1, y: 0.9, label: "BOTTOM LEFT" },
  { x: 0.9, y: 0.9, label: "BOTTOM RIGHT" },
];

const SAMPLES_PER_POINT = 15;
const SAMPLE_INTERVAL = 80; // ms between samples

function computeIrisRatios(landmarks: { x: number; y: number }[]): { rx: number; ry: number } | null {
  const leftOuter = landmarks[33];
  const leftInner = landmarks[133];
  const rightOuter = landmarks[362];
  const rightInner = landmarks[263];
  const leftIris = landmarks[468];
  const rightIris = landmarks[473];
  const leftTop = landmarks[159];
  const leftBot = landmarks[145];
  const rightTop = landmarks[386];
  const rightBot = landmarks[374];

  if (!leftOuter || !leftInner || !rightOuter || !rightInner ||
      !leftIris || !rightIris || !leftTop || !leftBot || !rightTop || !rightBot) {
    return null;
  }

  const leftRatioX = (leftIris.x - leftOuter.x) / (leftInner.x - leftOuter.x || 0.001);
  const rightRatioX = (rightIris.x - rightInner.x) / (rightOuter.x - rightInner.x || 0.001);
  const leftRatioY = (leftIris.y - leftTop.y) / (leftBot.y - leftTop.y || 0.001);
  const rightRatioY = (rightIris.y - rightTop.y) / (rightBot.y - rightTop.y || 0.001);

  return {
    rx: (leftRatioX + rightRatioX) / 2,
    ry: (leftRatioY + rightRatioY) / 2,
  };
}

export default function Calibration({ onComplete, faceMeshReady, getLandmarks }: CalibrationProps) {
  const [pointIndex, setPointIndex] = useState(0);
  const [collecting, setCollecting] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [started, setStarted] = useState(false);
  const samplesRef = useRef<{ rx: number; ry: number; px: number; py: number }[]>([]);
  const collectingRef = useRef(false);
  const sampleCountRef = useRef(0);

  const currentPoint = POINTS[pointIndex];

  const collectSamples = useCallback(() => {
    if (!faceMeshReady) return;
    collectingRef.current = true;
    sampleCountRef.current = 0;
    setCollecting(true);

    const interval = setInterval(() => {
      if (!collectingRef.current) {
        clearInterval(interval);
        return;
      }
      const landmarks = getLandmarks();
      if (!landmarks) return;

      const ratios = computeIrisRatios(landmarks);
      if (!ratios) return;

      samplesRef.current.push({
        rx: ratios.rx,
        ry: ratios.ry,
        px: currentPoint.x,
        py: currentPoint.y,
      });
      sampleCountRef.current++;

      if (sampleCountRef.current >= SAMPLES_PER_POINT) {
        clearInterval(interval);
        collectingRef.current = false;
        setCollecting(false);

        if (pointIndex < POINTS.length - 1) {
          setPointIndex(pointIndex + 1);
        } else {
          finalize();
        }
      }
    }, SAMPLE_INTERVAL);
  }, [faceMeshReady, getLandmarks, pointIndex, currentPoint]);

  const finalize = useCallback(() => {
    const samples = samplesRef.current;
    if (samples.length < 5) {
      // Not enough data, use defaults
      onComplete({ minRatioX: 0.3, maxRatioX: 0.7, minRatioY: 0.25, maxRatioY: 0.75 });
      return;
    }

    // Group by screen region and find ratio extremes
    const leftSamples = samples.filter(s => s.px <= 0.3);
    const rightSamples = samples.filter(s => s.px >= 0.7);
    const topSamples = samples.filter(s => s.py <= 0.3);
    const bottomSamples = samples.filter(s => s.py >= 0.7);

    const median = (arr: number[]) => {
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)] ?? 0.5;
    };

    // When looking left on screen, iris ratio is high (looking toward inner corner)
    // When looking right on screen, iris ratio is low (looking toward outer corner)
    // So minRatioX corresponds to right side of screen, maxRatioX to left side
    const minRX = rightSamples.length > 0 ? median(rightSamples.map(s => s.rx)) : 0.35;
    const maxRX = leftSamples.length > 0 ? median(leftSamples.map(s => s.rx)) : 0.65;
    const minRY = topSamples.length > 0 ? median(topSamples.map(s => s.ry)) : 0.3;
    const maxRY = bottomSamples.length > 0 ? median(bottomSamples.map(s => s.ry)) : 0.7;

    // Add 10% padding to extend beyond calibrated range
    const padX = (maxRX - minRX) * 0.1;
    const padY = (maxRY - minRY) * 0.1;

    onComplete({
      minRatioX: minRX - padX,
      maxRatioX: maxRX + padX,
      minRatioY: minRY - padY,
      maxRatioY: maxRY + padY,
    });
  }, [onComplete]);

  // Initial countdown
  useEffect(() => {
    if (started) return;
    if (countdown <= 0) {
      setStarted(true);
      return;
    }
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, started]);

  // Auto-collect when point changes and started. Wait for landmarks to be available.
  useEffect(() => {
    if (!started || collecting) return;
    let cancelled = false;
    const tryCollect = () => {
      if (cancelled) return;
      const lm = getLandmarks();
      if (lm && lm.length > 473) {
        collectSamples();
      } else {
        // FaceMesh not ready yet, retry
        setTimeout(tryCollect, 200);
      }
    };
    setTimeout(tryCollect, 500); // initial settle delay
    return () => { cancelled = true; };
  }, [started, pointIndex, collecting, collectSamples, getLandmarks]);

  if (!started) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-crimson mb-4">CALIBRATION</h2>
          <p className="text-zinc-400 mb-2">Look at each red dot as it appears</p>
          <p className="text-zinc-500 text-sm mb-6">Keep your head still, move only your eyes</p>
          <div className="text-6xl font-bold text-crimson">{countdown}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black">
      {/* Target dot */}
      <div
        className="absolute transition-all duration-300"
        style={{
          left: `${currentPoint.x * 100}%`,
          top: `${currentPoint.y * 100}%`,
          transform: "translate(-50%, -50%)",
        }}
      >
        <div className={`w-8 h-8 rounded-full border-2 border-crimson flex items-center justify-center ${collecting ? "animate-pulse" : ""}`}>
          <div className={`w-4 h-4 rounded-full ${collecting ? "bg-crimson" : "bg-crimson/50"}`} />
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-8 inset-x-0 text-center">
        <p className="text-zinc-500 text-sm uppercase tracking-wider">
          {collecting
            ? `Sampling... ${Math.min(sampleCountRef.current, SAMPLES_PER_POINT)}/${SAMPLES_PER_POINT}`
            : `Look at the dot: ${currentPoint.label}`}
        </p>
        <p className="text-zinc-600 text-xs mt-1">
          {pointIndex + 1} / {POINTS.length}
        </p>
      </div>
    </div>
  );
}
