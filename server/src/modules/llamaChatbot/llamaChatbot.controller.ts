import { Elysia } from "elysia";
import { env } from "../../infrastructure/env";
import {
  generateLlamaResponse,
  streamLlamaResponse,
  voiceStatus,
} from "../../services/llamaChatbot.service";

export const llamaChatbotController = new Elysia({
  prefix: "/api/llama-chatbot",
})
  .post("/chat", async ({ body, set }) => {
    const { message, history = [], options = {} } = (body || {}) as {
      message?: string;
      history?: { role: string; content: string }[];
      options?: Record<string, unknown>;
    };

    if (!message?.trim()) {
      set.status = 400;
      return { error: "Message is required and must be a non-empty string" };
    }
    if (!Array.isArray(history)) {
      set.status = 400;
      return { error: "History must be an array" };
    }

    const result = await generateLlamaResponse(message, history, options);
    if (result.success) {
      return {
        answer: result.answer,
        model: result.model,
        source: result.source,
      };
    }
    set.status = 503;
    return { error: result.error, fallback: result.fallback };
  })
  .post("/chat/stream", async ({ body, set }) => {
    const { message, history = [], options = {} } = (body || {}) as {
      message?: string;
      history?: { role: string; content: string }[];
      options?: Record<string, unknown>;
    };

    if (!message?.trim()) {
      set.status = 400;
      return { error: "Message is required and must be a non-empty string" };
    }

    if (!env.geminiApiKey) {
      set.status = 503;
      return { error: "GEMINI_API_KEY not configured" };
    }

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        try {
          for await (const event of streamLlamaResponse(message, history, options)) {
            controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
          }
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
        } catch (err) {
          controller.enqueue(
            enc.encode(
              `data: ${JSON.stringify({ type: "error", content: (err as Error).message })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  })
  .get("/voice/status", () => voiceStatus())
  .post("/voice/tts", async ({ body, set }) => {
    if (!env.geminiApiKey) {
      set.status = 503;
      return { error: "Google TTS is not configured" };
    }
    const { text } = (body || {}) as { text?: string };
    if (!text?.trim()) {
      set.status = 400;
      return { error: "text is required" };
    }
    set.status = 503;
    return {
      error: "Speech synthesis not configured",
      message: "Enable Google Cloud Text-to-Speech for audio replies",
    };
  })
  .post("/voice/stt", async ({ set }) => {
    set.status = 503;
    return {
      error: "Speech recognition not configured",
      message: "Enable Google Cloud Speech-to-Text for voice input",
    };
  })
  .get("/health", () => ({
    configured: Boolean(env.geminiApiKey),
    huggingface: Boolean(process.env.HUGGINGFACE_API_TOKEN),
    google: Boolean(env.geminiApiKey),
    message: env.geminiApiKey
      ? "Chatbot ready with Google Gemini"
      : "No AI credentials configured",
  }));