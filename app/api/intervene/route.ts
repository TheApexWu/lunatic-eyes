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

// Try OpenClaw browser tab close first, fall back to AppleScript
async function closeTabsByPattern(patterns: string[]): Promise<{ target: string; ok: boolean; method: string; error?: string }[]> {
  const results: { target: string; ok: boolean; method: string; error?: string }[] = [];

  // OpenClaw browser: close matching PAGE tabs (not service workers)
  try {
    const { stdout } = await execFileAsync("openclaw", ["browser", "tabs", "--json"], { timeout: 5000 });
    const data = JSON.parse(stdout);
    const tabs: { targetId: string; url: string; type: string }[] = data.tabs || [];

    for (const tab of tabs) {
      if (tab.type !== "page") continue;
      const url = (tab.url || "").toLowerCase();
      for (const pattern of patterns) {
        if (url.includes(pattern.toLowerCase())) {
          try {
            await execFileAsync("openclaw", ["browser", "close", tab.targetId, "--json"], { timeout: 5000 });
            results.push({ target: pattern, ok: true, method: "openclaw_browser" });
          } catch (err: any) {
            results.push({ target: pattern, ok: false, method: "openclaw_browser", error: err.message });
          }
          break;
        }
      }
    }
  } catch {
    // OpenClaw browser not running, continue to AppleScript
  }

  // ALWAYS also check user's Chrome (AppleScript)
  const conditions = patterns
    .map(p => `URL of atab contains "${sanitize(p)}"`)
    .join(" or ");
  const script = `
tell application "Google Chrome"
  repeat with aWindow in every window
    set tabList to every tab of aWindow
    repeat with atab in tabList
      try
        if ${conditions} then
          close atab
        end if
      end try
    end repeat
  end repeat
end tell`;
  try {
    await execFileAsync("osascript", ["-e", script]);
    for (const p of patterns) {
      results.push({ target: p, ok: true, method: "applescript_fallback" });
    }
  } catch (err: any) {
    for (const p of patterns) {
      results.push({ target: p, ok: false, method: "applescript_fallback", error: err.message });
    }
  }

  return results;
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

      // Separate URL patterns from native app names
      const urlPatterns: string[] = [];
      const nativeApps: string[] = [];
      for (const item of blocked) {
        if (item.includes(".") || item.startsWith("http")) {
          urlPatterns.push(item);
        } else {
          nativeApps.push(item);
        }
      }

      const results: { target: string; ok: boolean; method: string; error?: string }[] = [];

      // Close browser tabs via OpenClaw (AppleScript fallback)
      if (urlPatterns.length > 0) {
        const tabResults = await closeTabsByPattern(urlPatterns);
        results.push(...tabResults);
      }

      // Quit native apps
      for (const app of nativeApps) {
        const clean = sanitize(app);
        try {
          await execFileAsync("osascript", [
            "-e",
            `tell application "${clean}" to quit`,
          ]);
          results.push({ target: clean, ok: true, method: "native_quit" });
        } catch (err: any) {
          results.push({ target: clean, ok: false, method: "native_quit", error: err.message });
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
          "--session-id",
          "agent:main:main",
        ]);
        return NextResponse.json({ ok: true, action: "nudge" });
      } catch {
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
      // OpenClaw browser screenshot
      try {
        const { stdout } = await execFileAsync("openclaw", ["browser", "screenshot", "--json"], { timeout: 10000 });
        const data = JSON.parse(stdout);
        return NextResponse.json({ ok: true, path: data.path, url: data.url });
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
          "--session-id",
          "agent:main:main",
          "--json",
        ], { timeout: 15000 });
        return NextResponse.json({ ok: true, response: stdout });
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
    }

    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}
