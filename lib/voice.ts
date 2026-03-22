export type VoiceCommand = "watch" | "stop" | "report" | "block";

export interface VoiceConfig {
  wakeWord: string;
  similarityThreshold: number;
  onCommand: (command: VoiceCommand) => void;
  onListening: (active: boolean) => void;
}

export interface SpeakerProfile {
  embedding: Float32Array;
  enrolledAt: number;
}

export function parseCommand(transcript: string): VoiceCommand | null {
  const lower = transcript.toLowerCase();

  if (lower.includes("watch")) return "watch";
  if (lower.includes("stop") || lower.includes("pause")) return "stop";
  if (lower.includes("report") || lower.includes("dashboard")) return "report";
  if (lower.includes("block")) return "block";

  return null;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function createVoiceActivation(config: VoiceConfig) {
  let listening = false;
  let recognition: any = null;
  let enrolledProfile: SpeakerProfile | null = null;

  const start = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      console.warn("Speech recognition not supported in this browser");
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      const last = event.results[event.results.length - 1];
      if (!last.isFinal) return;

      const transcript = last[0].transcript;

      if (transcript.toLowerCase().includes(config.wakeWord.toLowerCase())) {
        const command = parseCommand(transcript);
        if (command) {
          config.onCommand(command);
        }
      }
    };

    recognition.onstart = () => {
      listening = true;
      config.onListening(true);
    };

    recognition.onend = () => {
      if (listening) {
        recognition?.start();
      }
      config.onListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error("Voice recognition error:", event.error);
      if (event.error !== "no-speech") {
        listening = false;
        config.onListening(false);
      }
    };

    recognition.start();
  };

  const stop = () => {
    listening = false;
    recognition?.stop();
    recognition = null;
    config.onListening(false);
  };

  const enroll = async (): Promise<SpeakerProfile> => {
    const profile: SpeakerProfile = {
      embedding: new Float32Array(128).fill(0),
      enrolledAt: Date.now(),
    };
    enrolledProfile = profile;
    return profile;
  };

  return { start, stop, enroll, isListening: () => listening };
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
