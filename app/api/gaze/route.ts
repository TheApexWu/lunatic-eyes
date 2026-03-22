import { NextRequest, NextResponse } from "next/server";
import { writeFileSync } from "fs";

export async function POST(req: NextRequest) {
  const { x, y } = await req.json();
  try {
    writeFileSync("/tmp/lunatic-gaze.json", JSON.stringify({ x, y }));
  } catch {
    // Non-critical, overlay just won't update
  }
  return NextResponse.json({ ok: true });
}
