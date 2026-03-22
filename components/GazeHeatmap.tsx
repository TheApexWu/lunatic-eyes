"use client";

import { useRef, useEffect } from "react";
import type { GazePoint } from "@/lib/attention";

interface GazeHeatmapProps {
  gazeHistory: GazePoint[];
  width: number;
  height: number;
}

export default function GazeHeatmap({
  gazeHistory,
  width,
  height,
}: GazeHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || gazeHistory.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    const gridW = 20;
    const gridH = 15;
    const cellW = width / gridW;
    const cellH = height / gridH;
    const grid = new Float32Array(gridW * gridH);

    const maxX = Math.max(...gazeHistory.map((p) => p.x), 1);
    const maxY = Math.max(...gazeHistory.map((p) => p.y), 1);

    for (const point of gazeHistory) {
      const gx = Math.min(Math.floor((point.x / maxX) * gridW), gridW - 1);
      const gy = Math.min(Math.floor((point.y / maxY) * gridH), gridH - 1);
      grid[gy * gridW + gx]++;
    }

    let maxDensity = 0;
    for (const d of grid) {
      if (d > maxDensity) maxDensity = d;
    }

    if (maxDensity === 0) return;

    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const density = grid[y * gridW + x] / maxDensity;
        if (density > 0.01) {
          ctx.fillStyle = `rgba(220, 20, 60, ${density * 0.6})`;
          ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
        }
      }
    }

    ctx.filter = "blur(8px)";
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = "none";
  }, [gazeHistory, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="rounded-xl"
    />
  );
}
