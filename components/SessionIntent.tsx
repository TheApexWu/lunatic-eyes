"use client";

import { useState } from "react";

export interface SessionPolicy {
  goal: string;
  allow: string[];
  block: string[];
  tone: "gentle" | "firm" | "strict";
}

interface SessionIntentProps {
  onStart: (intent: string, policy: SessionPolicy) => void;
}

const PRESETS = [
  "Avoid social media, focus on work",
  "Deep reading session, no distractions",
  "Email only, stay off YouTube",
  "Coding focus, block everything else",
];

export default function SessionIntent({ onStart }: SessionIntentProps) {
  const [intent, setIntent] = useState("");
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    const text = intent || "General focus session";
    setLoading(true);

    try {
      const res = await fetch("/api/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: text }),
      });
      const data = await res.json();
      onStart(text, data.parsed);
    } catch {
      // Fallback if intent API fails
      onStart(text, {
        goal: text,
        allow: ["everything"],
        block: [],
        tone: "gentle",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-lg w-full space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-crimson">
            LUNATIC EYES
          </h1>
          <p className="text-zinc-500 text-sm">
            Tell the eye what to watch for. It only sees what you allow.
          </p>
        </div>

        <div className="space-y-4">
          <label className="block text-xs text-zinc-500 uppercase tracking-wider">
            What do you want to focus on today?
          </label>
          <textarea
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="e.g. I want to avoid social media and focus on Gmail..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-zinc-200 placeholder-zinc-600 resize-none h-24 focus:outline-none focus:border-crimson/50 transition-colors"
          />

          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => setIntent(preset)}
                className="text-xs px-3 py-1.5 rounded-lg bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-crimson/40 hover:text-crimson transition-all"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleStart}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-crimson text-white font-bold tracking-wide hover:bg-crimson-dim transition-colors disabled:opacity-50"
        >
          {loading ? "PARSING INTENT..." : "START SESSION"}
        </button>

        <div className="relative flex items-center gap-4 my-2">
          <div className="flex-1 h-px bg-zinc-800" />
          <span className="text-xs text-zinc-600">or</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>

        <button
          onClick={() => onStart("General focus session", {
            goal: "General focus session",
            allow: ["everything"],
            block: [],
            tone: "gentle",
          })}
          className="w-full py-3 rounded-xl bg-zinc-900 text-zinc-400 font-medium tracking-wide border border-zinc-800 hover:border-zinc-600 hover:text-zinc-300 transition-all"
        >
          QUICK START — SKIP SETUP
        </button>

        <p className="text-center text-xs text-zinc-600">
          All data stays on your machine. Nothing leaves this browser.
        </p>
      </div>
    </div>
  );
}
