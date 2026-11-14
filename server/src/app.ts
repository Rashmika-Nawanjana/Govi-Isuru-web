import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { connectDb, isDbConnected } from "./infrastructure/db";
import { env } from "./infrastructure/env";
import { authController } from "./modules/auth/auth.controller";
import { usersController } from "./modules/users/users.controller";
import { creditsController } from "./modules/credits/credits.controller";
import { cropCareController } from "./modules/cropCare/cropCare.controller";
import { alertsController } from "./modules/alerts/alerts.controller";
import { reportsController } from "./modules/reports/reports.controller";
import { marketplaceController } from "./modules/marketplace/marketplace.controller";
import { consultationController } from "./modules/consultation/consultation.controller";
import { newsController } from "./modules/news/news.controller";
import { chatController } from "./modules/chat/chat.controller";
import { chatbotController } from "./modules/chatbot/chatbot.controller";
import { llamaChatbotController } from "./modules/llamaChatbot/llamaChatbot.controller";
import { officerController } from "./modules/officer/officer.controller";
import { officerWorkflowController } from "./modules/officerWorkflow/officerWorkflow.controller";
import { analyticsController } from "./modules/analytics/analytics.controller";
import { whatsappController } from "./modules/whatsapp/whatsapp.controller";
import { adminController } from "./modules/admin/admin.controller";

/** Pure Elysia app (no listen) — used by Vite middleware and production server. */
export const app = new Elysia()
  .onBeforeHandle(async ({ path }) => {
    if (path === "/health" || !path.startsWith("/api")) return;
    // Public endpoints that do not need Mongo
    if (
      path.startsWith("/api/auth/google/config") ||
      path.startsWith("/api/news") ||
      path.startsWith("/api/weather")
    ) {
      return;
    }
    if (!isDbConnected()) {
      try {
        await connectDb();
      } catch (err) {
        console.error("[db] connection failed", (err as Error).message);
        // Auth/data routes will error naturally if models cannot run
      }
    }
  })
  .use(
    cors({
      origin: env.corsOrigin,
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  )
  .get("/health", () => ({ ok: true, db: isDbConnected() }))
  .use(authController)
  .use(usersController)
  .use(creditsController)
  .use(cropCareController)
  .use(alertsController)
  .use(reportsController)
  .use(marketplaceController)
  .use(consultationController)
  .use(newsController)
  .use(chatController)
  .use(chatbotController)
  .use(llamaChatbotController)
  .use(officerController)
  .use(officerWorkflowController)
  .use(analyticsController)
  .use(whatsappController)
  .use(adminController)
  // Marketplace extras expected by original UI
  .get("/api/price-trends", () => [
    { month: "Jan", Rice: 210, Chili: 850, Tomato: 1100 },
    { month: "Feb", Rice: 225, Chili: 920, Tomato: 1150 },
    { month: "Mar", Rice: 240, Chili: 780, Tomato: 1050 },
    { month: "Apr", Rice: 215, Chili: 810, Tomato: 1200 },
    { month: "May", Rice: 230, Chili: 890, Tomato: 1250 },
    { month: "Jun", Rice: 255, Chili: 950, Tomato: 1300 },
  ])
  .get("/api/market-prices", () => [
    { district: "Dambulla", Rice: 220, Chili: 800, Carrot: 450 },
    { district: "Thambutthegama", Rice: 215, Chili: 780, Carrot: 420 },
    { district: "Keppetipola", Rice: 230, Chili: 850, Carrot: 380 },
    { district: "Colombo (Manning)", Rice: 250, Chili: 950, Carrot: 550 },
    { district: "Kandy", Rice: 245, Chili: 920, Carrot: 520 },
  ])
  .onError(({ error, set, request }) => {
    const err = error as Error & { status?: number; code?: string };
    if (err.status) set.status = err.status;
    const path = new URL(request.url).pathname;
    console.error("[api]", err.message || err.code || "error", path);
    return { error: err.message || "Server error", path };
  });

export type App = typeof app;
