"use client";

import { useState, useRef, useCallback } from "react";
import { getIrisRatios } from "@/lib/gaze";

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
  { x: 0.5, y: 0.5, label: "CENTER" },
  { x: 0.15, y: 0.15, label: "TOP LEFT" },
  { x: 0.85, y: 0.15, label: "TOP RIGHT" },
  { x: 0.15, y: 0.7, label: "BOTTOM LEFT" },
  { x: 0.85, y: 0.7, label: "BOTTOM RIGHT" },
];

export default function Calibration({ onComplete, faceMeshReady, getLandmarks }: CalibrationProps) {
  const [pointIndex, setPointIndex] = useState(0);
  const [status, setStatus] = useState<"waiting" | "holding" | "done">("waiting");
  const [progress, setProgress] = useState(0);
  const samplesRef = useRef<{ rx: number; ry: number; px: number; py: number }[]>([]);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const currentPoint = POINTS[pointIndex];
  const HOLD_MS = 1200;

  const collectSample = useCallback(() => {
    const lm = getLandmarks();
    if (!lm || lm.length <= 473) return;
    const ratios = getIrisRatios(lm);
    if (!ratios) return;
    samplesRef.current.push({
      rx: ratios.rx,
      ry: ratios.ry,
      px: currentPoint.x,
      py: currentPoint.y,
    });
  }, [getLandmarks, currentPoint]);

  const advance = useCallback(() => {
    if (pointIndex < POINTS.length - 1) {
      setPointIndex(pointIndex + 1);
      setStatus("waiting");
      setProgress(0);
    } else {
      finalize();
    }
  }, [pointIndex]);

  const handleClick = () => {
    if (status === "holding") return;
    setStatus("holding");
    setProgress(0);

    // Collect 15 samples over the hold period (every 80ms)
    const start = Date.now();
    progressTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(elapsed / HOLD_MS, 1));
      collectSample();
    }, 80);

    holdTimerRef.current = setTimeout(() => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      setStatus("done");
      setProgress(1);
      setTimeout(advance, 200);
    }, HOLD_MS);
  };

  const finalize = () => {
    // Reject outliers: discard samples > 2 std devs from mean
    const raw = samplesRef.current;
    const meanRx = raw.reduce((s, r) => s + r.rx, 0) / (raw.length || 1);
    const meanRy = raw.reduce((s, r) => s + r.ry, 0) / (raw.length || 1);
    const stdRx = Math.sqrt(raw.reduce((s, r) => s + (r.rx - meanRx) ** 2, 0) / (raw.length || 1));
    const stdRy = Math.sqrt(raw.reduce((s, r) => s + (r.ry - meanRy) ** 2, 0) / (raw.length || 1));
    const samples = raw.filter(s =>
      Math.abs(s.rx - meanRx) < 2 * (stdRx || 1) &&
      Math.abs(s.ry - meanRy) < 2 * (stdRy || 1)
    );

    if (samples.length < 3) {
      onComplete({ minRatioX: 0.3, maxRatioX: 0.7, minRatioY: 0.25, maxRatioY: 0.75 });
      return;
    }

    const leftSamples = samples.filter(s => s.px <= 0.3);
    const rightSamples = samples.filter(s => s.px >= 0.7);
    const topSamples = samples.filter(s => s.py <= 0.3);
    const bottomSamples = samples.filter(s => s.py >= 0.7);

    const median = (arr: number[]) => {
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)] ?? 0.5;
    };

    const minRX = rightSamples.length > 0 ? median(rightSamples.map(s => s.rx)) : 0.35;
    const maxRX = leftSamples.length > 0 ? median(leftSamples.map(s => s.rx)) : 0.65;
    const minRY = topSamples.length > 0 ? median(topSamples.map(s => s.ry)) : 0.3;
    const maxRY = bottomSamples.length > 0 ? median(bottomSamples.map(s => s.ry)) : 0.7;

    const padX = (maxRX - minRX) * 0.15;
    const padY = (maxRY - minRY) * 0.15;

    onComplete({
      minRatioX: minRX - padX,
      maxRatioX: maxRX + padX,
      minRatioY: minRY - padY,
      maxRatioY: maxRY + padY,
    });
  };

  const skip = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    onComplete({ minRatioX: 0.3, maxRatioX: 0.7, minRatioY: 0.25, maxRatioY: 0.75 });
  };

  const dotSize = 80;
  const strokeWidth = 4;
  const radius = (dotSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
      {/* Target dot */}
      <div
        className="absolute cursor-pointer"
        style={{
          left: `${currentPoint.x * 100}%`,
          top: `${currentPoint.y * 100}%`,
          transform: "translate(-50%, -50%)",
        }}
        onClick={handleClick}
      >
        <svg width={dotSize} height={dotSize} className="block">
          {/* Background ring */}
          <circle
            cx={dotSize / 2}
            cy={dotSize / 2}
            r={radius}
            fill="none"
            stroke="#333"
            strokeWidth={strokeWidth}
          />
          {/* Progress ring */}
          <circle
            cx={dotSize / 2}
            cy={dotSize / 2}
            r={radius}
            fill="none"
            stroke="#dc2626"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            strokeLinecap="round"
            transform={`rotate(-90 ${dotSize / 2} ${dotSize / 2})`}
            style={{ transition: "stroke-dashoffset 30ms linear" }}
          />
          {/* Center dot */}
          <circle
            cx={dotSize / 2}
            cy={dotSize / 2}
            r={status === "holding" ? 18 : 14}
            fill={status === "done" ? "#dc2626" : status === "holding" ? "#dc2626" : "#dc2626aa"}
            style={{ transition: "r 150ms ease" }}
          />
        </svg>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-16 inset-x-0 text-center">
        <p className="text-zinc-400 text-lg tracking-wide">
          {status === "holding"
            ? "Hold still..."
            : status === "done"
            ? "Good"
            : "Look at the dot. Click it."}
        </p>
        <p className="text-zinc-600 text-sm mt-1">
          {currentPoint.label} ({pointIndex + 1}/{POINTS.length})
        </p>
        <button
          onClick={skip}
          className="mt-6 px-5 py-2 text-sm text-zinc-500 border border-zinc-800 rounded hover:border-zinc-500 hover:text-zinc-300 transition-all"
        >
          SKIP CALIBRATION
        </button>
      </div>
    </div>
  );
}
