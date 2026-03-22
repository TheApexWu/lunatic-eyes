import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

interface InterventionRequest {
  action: "close_app" | "nudge" | "screenshot" | "openclaw_message";
  target?: string;
  metrics?: Record<string, number>;
}

function sanitize(input: string): string {
  return input.replace(/[^a-zA-Z0-9 .,!?:;()\-'/]/g, "");
}

export async function POST(req: NextRequest) {
  const body: InterventionRequest = await req.json();

  switch (body.action) {
    case "close_app": {
      if (!body.target) {
        return NextResponse.json({ error: "target required" }, { status: 400 });
      }
      const appName = sanitize(body.target);
      try {
        await execFileAsync("peekaboo", ["app", "quit", appName]);
        return NextResponse.json({ ok: true, action: "closed", target: appName });
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
    }

    case "nudge": {
      const message = sanitize(body.target || "Your attention is drifting. Refocus.");
      try {
        await execFileAsync("openclaw", [
          "agent",
          "--message",
          `Send me a notification: ${message}`,
          "--session",
          "agent:main:main",
        ]);
        return NextResponse.json({ ok: true, action: "nudge" });
      } catch (err: any) {
        try {
          await execFileAsync("osascript", [
            "-e",
            `display notification "${message}" with title "Lunatic Eyes"`,
          ]);
          return NextResponse.json({ ok: true, action: "nudge", fallback: "osascript" });
        } catch (fallbackErr: any) {
          return NextResponse.json(
            { error: "nudge failed", detail: fallbackErr.message },
            { status: 500 },
          );
        }
      }
    }

    case "screenshot": {
      try {
        const { stdout } = await execFileAsync("peekaboo", ["image", "--json"]);
        return NextResponse.json({ ok: true, data: stdout });
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
    }

    case "openclaw_message": {
      const summary = sanitize(body.target || "No summary provided");
      try {
        const { stdout } = await execFileAsync("openclaw", [
          "agent",
          "--message",
          summary,
          "--session",
          "agent:main:main",
          "--json",
        ]);
        return NextResponse.json({ ok: true, response: stdout });
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
    }

    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}
