import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface InterventionRequest {
  action: "close_app" | "nudge" | "screenshot" | "openclaw_message";
  target?: string; // app name or message
  metrics?: Record<string, number>;
}

export async function POST(req: NextRequest) {
  const body: InterventionRequest = await req.json();

  switch (body.action) {
    case "close_app": {
      if (!body.target) {
        return NextResponse.json({ error: "target required" }, { status: 400 });
      }
      try {
        await execAsync(`peekaboo app quit "${body.target}"`);
        return NextResponse.json({ ok: true, action: "closed", target: body.target });
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
    }

    case "nudge": {
      // Send a behavioral nudge through OpenClaw
      const message = body.target || "Your attention is drifting. Refocus.";
      try {
        await execAsync(
          `openclaw agent --message ${JSON.stringify(`Send me a notification: ${message}`)} --session agent:main:main 2>&1`
        );
        return NextResponse.json({ ok: true, action: "nudge" });
      } catch (err: any) {
        // Fallback: use osascript notification
        await execAsync(
          `osascript -e 'display notification "${message}" with title "Lunatic Eyes"'`
        );
        return NextResponse.json({ ok: true, action: "nudge", fallback: "osascript" });
      }
    }

    case "screenshot": {
      try {
        const { stdout } = await execAsync("peekaboo image --json");
        return NextResponse.json({ ok: true, data: stdout });
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
    }

    case "openclaw_message": {
      // Send behavioral summary to OpenClaw for analysis
      const summary = body.target || "No summary provided";
      try {
        const { stdout } = await execAsync(
          `openclaw agent --message ${JSON.stringify(summary)} --session agent:main:main --json 2>&1`
        );
        return NextResponse.json({ ok: true, response: stdout });
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
    }

    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}
