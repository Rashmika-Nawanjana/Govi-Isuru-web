/**
 * Vercel serverless entry — exports the Elysia app (no listen).
 * Local prod: use `bun run start` → server/src/index.ts
 */
import { app } from "../server/src/app";
import { connectDb } from "../server/src/infrastructure/db";

connectDb().catch((err) =>
  console.warn("[db] vercel connect failed:", (err as Error).message)
);

export default app;
