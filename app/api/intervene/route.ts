import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

interface InterventionRequest {
  action: "close_app" | "close_blocked" | "nudge" | "screenshot" | "openclaw_message";
  target?: string;
  blocked?: string[];
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
        await execFileAsync("osascript", [
          "-e",
          `tell application "${appName}" to quit`,
        ]);
        return NextResponse.json({ ok: true, action: "closed", target: appName });
      } catch (err: any) {
        return NextResponse.json({ error: err.message, target: appName }, { status: 500 });
      }
    }

    case "close_blocked": {
      const blocked: string[] = body.blocked || [];
      if (!blocked.length) {
        return NextResponse.json({ ok: true, closed: [] });
      }
      const results: { app: string; ok: boolean; error?: string }[] = [];
      for (const app of blocked) {
        const clean = sanitize(app);
        try {
          await execFileAsync("osascript", [
            "-e",
            `tell application "${clean}" to quit`,
          ]);
          results.push({ app: clean, ok: true });
        } catch (err: any) {
          results.push({ app: clean, ok: false, error: err.message });
        }
      }
      return NextResponse.json({ ok: true, closed: results });
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
