"use client";

import { useEffect, useRef, useState } from "react";
import { createVoiceActivation, type VoiceCommand } from "@/lib/voice";

interface VoiceGateProps {
  onReady: () => void;
  onCommand: (command: string) => void;
}

export default function VoiceGate({ onReady, onCommand }: VoiceGateProps) {
  const [listening, setListening] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const voiceRef = useRef<ReturnType<typeof createVoiceActivation> | null>(null);

  useEffect(() => {
    const voice = createVoiceActivation({
      wakeWord: "lunatic eyes",
      similarityThreshold: 0.75,
      onCommand: (cmd: VoiceCommand) => {
        onCommand(cmd);
      },
      onListening: (active: boolean) => {
        setListening(active);
      },
    });

    voiceRef.current = voice;

    return () => {
      voice.stop();
    };
  }, [onCommand]);

  const handleActivate = async () => {
    if (!voiceRef.current) return;

    if (!enrolled) {
      await voiceRef.current.enroll();
      setEnrolled(true);
    }

    voiceRef.current.start();
    onReady();
  };

  const handleDeactivate = () => {
    voiceRef.current?.stop();
    setListening(false);
  };

  return (
    <button
      onClick={listening ? handleDeactivate : handleActivate}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        listening
          ? "bg-crimson/20 text-crimson border border-crimson/40"
          : "bg-zinc-900 text-zinc-400 border border-zinc-700 hover:border-zinc-500"
      }`}
      title={listening ? "Voice active. Click to deactivate." : "Activate voice control"}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" x2="12" y1="19" y2="22" />
      </svg>
      {listening ? "LISTENING" : "VOICE"}
    </button>
  );
}
