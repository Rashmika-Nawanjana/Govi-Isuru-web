import { staticPlugin } from "@elysiajs/static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "./app";
import { connectDb } from "./infrastructure/db";
import { env } from "./infrastructure/env";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const distDir = path.join(rootDir, "dist");

connectDb().catch((err) =>
  console.warn("[db] initial connect failed (will retry):", err.message)
);

const server = app
  .use(
    staticPlugin({
      assets: distDir,
      prefix: "/",
      indexHTML: true,
    })
  )
  .get("/*", async ({ path: reqPath }) => {
    if (reqPath.startsWith("/api") || reqPath === "/health") return;
    const file = Bun.file(path.join(distDir, "index.html"));
    if (await file.exists()) return file;
    return new Response("Build missing. Run: bun run build", { status: 404 });
  })
  .listen(env.port);

console.log(
  `Govi Isuru running at http://${server.server?.hostname}:${server.server?.port}`
);

export default server;
