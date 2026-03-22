import { NextRequest, NextResponse } from "next/server";
import { writeFileSync } from "fs";

export async function POST(req: NextRequest) {
  const { x, y, visible } = await req.json();
  try {
    writeFileSync("/tmp/lunatic-gaze.json", JSON.stringify({
      x: x ?? 0,
      y: y ?? 0,
      visible: visible !== false,
    }));
  } catch {
    // Non-critical
  }
  return NextResponse.json({ ok: true });
}
