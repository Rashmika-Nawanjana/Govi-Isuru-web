import { Elysia } from "elysia";
import { handleCropChat } from "../../services/chatbot.service";

export const chatbotController = new Elysia({ prefix: "/api/chatbot" }).post(
  "/chat",
  async ({ body, set }) => {
    const result = handleCropChat(body as Parameters<typeof handleCropChat>[0]);
    set.status = result.status;
    return result.body;
  }
);