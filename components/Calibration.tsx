"use client";

import { useState, useRef } from "react";
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
  { x: 0.1, y: 0.1, label: "TOP LEFT" },
  { x: 0.9, y: 0.1, label: "TOP RIGHT" },
  { x: 0.5, y: 0.5, label: "CENTER" },
  { x: 0.1, y: 0.9, label: "BOTTOM LEFT" },
  { x: 0.9, y: 0.9, label: "BOTTOM RIGHT" },
];

const SAMPLES_PER_POINT = 10;

export default function Calibration({ onComplete, faceMeshReady, getLandmarks }: CalibrationProps) {
  const [pointIndex, setPointIndex] = useState(0);
  const [collecting, setCollecting] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [debugInfo, setDebugInfo] = useState("");
  const samplesRef = useRef<{ rx: number; ry: number; px: number; py: number }[]>([]);

  const currentPoint = POINTS[pointIndex];

  const collectBurst = () => {
    const lm = getLandmarks();
    if (!lm) {
      setDebugInfo(`No landmarks (faceMeshReady=${faceMeshReady})`);
      return;
    }
    if (lm.length <= 473) {
      setDebugInfo(`Only ${lm.length} landmarks (need 474+ for iris)`);
      return;
    }

    setCollecting(true);
    setSampleCount(0);
    let count = 0;

    const interval = setInterval(() => {
      const landmarks = getLandmarks();
      if (!landmarks || landmarks.length <= 473) return;

      const ratios = getIrisRatios(landmarks);
      if (!ratios) return;

      samplesRef.current.push({
        rx: ratios.rx,
        ry: ratios.ry,
        px: currentPoint.x,
        py: currentPoint.y,
      });
      count++;
      setSampleCount(count);

      if (count >= SAMPLES_PER_POINT) {
        clearInterval(interval);
        setCollecting(false);
        setSampleCount(0);

        if (pointIndex < POINTS.length - 1) {
          setPointIndex(pointIndex + 1);
        } else {
          finalize();
        }
      }
    }, 60);

    // Safety timeout: if stuck after 3s, force advance
    setTimeout(() => {
      clearInterval(interval);
      setCollecting(false);
      if (count < SAMPLES_PER_POINT) {
        setDebugInfo(`Only got ${count}/${SAMPLES_PER_POINT} samples, advancing anyway`);
        if (pointIndex < POINTS.length - 1) {
          setPointIndex(pointIndex + 1);
        } else {
          finalize();
        }
      }
    }, 3000);
  };

  const finalize = () => {
    const samples = samplesRef.current;
    if (samples.length < 5) {
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

    const padX = (maxRX - minRX) * 0.1;
    const padY = (maxRY - minRY) * 0.1;

    onComplete({
      minRatioX: minRX - padX,
      maxRatioX: maxRX + padX,
      minRatioY: minRY - padY,
      maxRatioY: maxRY + padY,
    });
  };

  const skip = () => {
    onComplete({ minRatioX: 0.3, maxRatioX: 0.7, minRatioY: 0.25, maxRatioY: 0.75 });
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black">
      {/* Target dot - click to collect */}
      <div
        className="absolute transition-all duration-300 cursor-pointer"
        style={{
          left: `${currentPoint.x * 100}%`,
          top: `${currentPoint.y * 100}%`,
          transform: "translate(-50%, -50%)",
        }}
        onClick={collecting ? undefined : collectBurst}
      >
        <div className={`w-10 h-10 rounded-full border-2 border-crimson flex items-center justify-center ${collecting ? "animate-pulse" : "hover:scale-125 transition-transform"}`}>
          <div className={`w-5 h-5 rounded-full ${collecting ? "bg-crimson" : "bg-crimson/60"}`} />
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-12 inset-x-0 text-center">
        <p className="text-zinc-400 text-lg mb-1">
          {collecting
            ? `Sampling... ${sampleCount}/${SAMPLES_PER_POINT}`
            : "CLICK the red dot while looking at it"}
        </p>
        <p className="text-zinc-600 text-sm">
          {currentPoint.label} ({pointIndex + 1}/{POINTS.length})
        </p>
        {debugInfo && (
          <p className="text-yellow-500/70 text-xs mt-2">{debugInfo}</p>
        )}
        <button
          onClick={skip}
          className="mt-4 px-4 py-2 text-sm text-zinc-600 border border-zinc-800 rounded hover:border-zinc-500 hover:text-zinc-300 transition-all"
        >
          SKIP
        </button>
      </div>
    </div>
  );
}
