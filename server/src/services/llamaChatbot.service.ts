import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, streamText } from "ai";
import { env } from "../infrastructure/env";

const SYSTEM = `You are Govi Isuru — a practical agronomy assistant for Sri Lankan farmers.
Answer in the user's language (English, Sinhala, or Tamil). Focus on rice, tea, and chili.`;

type HistoryMsg = { role: string; content: string };

export async function generateLlamaResponse(
  message: string,
  history: HistoryMsg[] = [],
  options: Record<string, unknown> = {}
) {
  if (!env.geminiApiKey) {
    return {
      success: false as const,
      error: "AI not configured",
      fallback: "Set GEMINI_API_KEY to enable the assistant",
    };
  }

  try {
    const google = createGoogleGenerativeAI({ apiKey: env.geminiApiKey });
    const { text } = await generateText({
      model: google("gemini-2.0-flash"),
      system: SYSTEM,
      messages: [
        ...history.slice(-10).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user", content: message },
      ],
      maxTokens: Number(options.max_tokens) || 2048,
      temperature: Number(options.temperature) || 0.6,
    });
    return {
      success: true as const,
      answer: text.trim(),
      model: "gemini-2.0-flash",
      source: "google",
    };
  } catch (err) {
    return {
      success: false as const,
      error: (err as Error).message || "Generation failed",
      fallback: "Try again in a moment",
    };
  }
}

export async function* streamLlamaResponse(
  message: string,
  history: HistoryMsg[] = [],
  options: Record<string, unknown> = {}
) {
  if (!env.geminiApiKey) {
    yield { type: "error", content: "GEMINI_API_KEY not configured" };
    return;
  }

  const google = createGoogleGenerativeAI({ apiKey: env.geminiApiKey });
  const result = streamText({
    model: google("gemini-2.0-flash"),
    system: SYSTEM,
    messages: [
      ...history.slice(-10).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: message },
    ],
    maxTokens: Number(options.max_tokens) || 2048,
    temperature: Number(options.temperature) || 0.6,
  });

  for await (const chunk of result.textStream) {
    if (chunk) yield { type: "token", content: chunk };
  }
  yield { type: "done", model: "gemini-2.0-flash" };
}

export function voiceStatus() {
  const google = Boolean(env.geminiApiKey);
  return {
    googleConfigured: google,
    languages: ["en", "si", "ta"],
    features: {
      duplexVoice: false,
      liveVoice: false,
      stt: google,
      tts: google,
      gemini: google,
    },
    live: {
      path: "/api/llama-chatbot/voice/live",
      inputRate: 16000,
      outputRate: 24000,
      model: "gemini-2.0-flash",
    },
  };
}