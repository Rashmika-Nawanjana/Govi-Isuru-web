import { loadEnv } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Dev-only: mount Elysia behind Vite. Not loaded during `vite build`. */
export async function createApiMiddleware() {
  const env = loadEnv("development", rootDir, "");
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  const { app } = await import("../server/src/app.ts");

  return async (req, res, next) => {
    try {
      const host =
        (typeof req.headers.host === "string" && req.headers.host) ||
        "localhost:3000";
      const url = new URL(req.url || "/", `http://${host}`);
      if (!url.pathname.startsWith("/api") && url.pathname !== "/health") {
        next();
        return;
      }

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value)
          headers.set(key, Array.isArray(value) ? value.join(",") : value);
      }

      const method = req.method || "GET";
      let body;
      if (method !== "GET" && method !== "HEAD") {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        body = Buffer.concat(chunks);
      }

      const request = new Request(url, {
        method,
        headers,
        body: body && body.length ? new Uint8Array(body) : undefined,
      });

      const response = await app.handle(request);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() === "set-cookie" && res.appendHeader) {
          res.appendHeader(key, value);
        } else {
          res.setHeader(key, value);
        }
      });
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      next(err);
    }
  };
}
