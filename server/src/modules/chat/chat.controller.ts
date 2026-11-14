import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText } from "ai";
import { Elysia } from "elysia";
import { env } from "../../infrastructure/env";
import { authPlugin, requireAuth } from "../../plugins/auth";

const SYSTEM = `You are Govi Isuru Assistant — a practical agronomy helper for Sri Lankan farmers.
Answer clearly in the user's language (English, Sinhala, or Tamil). Prefer actionable advice on crops (rice, tea, chili), pests, weather, and markets.
If unsure, say what to check with a local Agricultural Instructor. Never invent pesticide dosages; give ranges and urge label/officer confirmation.`;

export const chatController = new Elysia({ prefix: "/api/chat" })
  .use(authPlugin)
  .post("/", async ({ body, user, set }) => {
    try {
      requireAuth(user);
      if (!env.geminiApiKey) {
        set.status = 503;
        return {
          error: "GEMINI_API_KEY not configured",
          msg: "Set GEMINI_API_KEY to enable AI assistance",
        };
      }

      const messages = (body as { messages?: { role: string; content: string }[] })
        .messages;
      if (!messages?.length) {
        set.status = 400;
        return { error: "messages required" };
      }

      const google = createGoogleGenerativeAI({ apiKey: env.geminiApiKey });
      const result = streamText({
        model: google("gemini-2.0-flash"),
        system: SYSTEM,
        messages: messages.map((m) => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
        })),
      });

      return result.toDataStreamResponse();
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message };
    }
  });
