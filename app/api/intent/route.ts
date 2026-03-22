import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function sanitize(input: string): string {
  return input.replace(/[^a-zA-Z0-9 .,!?:;()\-'/]/g, "");
}

const INTENT_PROMPT = `You are Lunatic Eyes, an attention monitoring system. The user just told you their focus goal for this session. Your job:

1. Parse their intent into ALLOW and BLOCK categories
2. Infer what they mean implicitly (e.g. "focus on work" means block social media, games, news)
3. Return a JSON object with:
   - goal: one-sentence summary of what they want
   - allow: array of app/site categories that are OK
   - block: array of app/site categories to flag
   - tone: how aggressive interventions should be (gentle | firm | strict)

Common inferences:
- "focus on work" -> block: social media, news, games, streaming. allow: email, docs, IDE, slack
- "avoid social media" -> block: twitter, instagram, tiktok, reddit, facebook. allow: everything else
- "deep reading" -> block: everything except the reading material. tone: strict
- "email only" -> allow: gmail, outlook. block: everything else

Respond with ONLY the JSON, no explanation.`;

export async function POST(req: NextRequest) {
  const { intent } = await req.json();
  if (!intent) {
    return NextResponse.json({ error: "intent required" }, { status: 400 });
  }

  const cleanIntent = sanitize(intent);

  try {
    const { stdout } = await execFileAsync("openclaw", [
      "agent",
      "--message",
      `${INTENT_PROMPT}\n\nUser's stated intent: "${cleanIntent}"`,
      "--session",
      "agent:main:main",
      "--json",
    ]);

    // Try to parse the JSON from OpenClaw's response
    let parsed;
    try {
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      parsed = null;
    }

    return NextResponse.json({
      ok: true,
      raw: stdout,
      parsed: parsed || {
        goal: cleanIntent,
        allow: ["everything"],
        block: [],
        tone: "gentle",
      },
    });
  } catch (err: any) {
    // Fallback: basic keyword matching when OpenClaw isn't running
    const lower = cleanIntent.toLowerCase();
    const block: string[] = [];
    const allow: string[] = [];
    let tone: "gentle" | "firm" | "strict" = "gentle";

    if (lower.includes("social media") || lower.includes("avoid")) {
      block.push("twitter", "instagram", "tiktok", "reddit", "facebook", "youtube");
      tone = "firm";
    }
    if (lower.includes("focus") || lower.includes("work") || lower.includes("coding")) {
      allow.push("ide", "terminal", "docs", "email", "slack");
      block.push("social media", "news", "games", "streaming");
      tone = "firm";
    }
    if (lower.includes("deep") || lower.includes("reading") || lower.includes("strict")) {
      tone = "strict";
    }
    if (lower.includes("email")) {
      allow.push("gmail", "outlook");
    }

    return NextResponse.json({
      ok: true,
      parsed: {
        goal: cleanIntent,
        allow: allow.length ? allow : ["everything"],
        block,
        tone,
      },
      fallback: true,
    });
  }
}
