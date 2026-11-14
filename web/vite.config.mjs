import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.resolve(rootDir, "web");

async function createApiMiddleware() {
  const env = loadEnv("development", rootDir, "");
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  // Imported once at server start — restart `bun run dev` after server route changes
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
      const buf = Buffer.from(await response.arrayBuffer());
      res.end(buf);
    } catch (err) {
      next(err);
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "");
  const port = Number(env.PORT || 3000);

  return {
    root: webRoot,
    envDir: rootDir,
    publicDir: path.resolve(webRoot, "public"),
    resolve: {
      alias: {
        "@govi/shared": path.resolve(rootDir, "shared/src/index.ts"),
      },
    },
    optimizeDeps: {
      esbuildOptions: {
        loader: {
          ".js": "jsx",
        },
      },
      include: ["axios", "recharts", "lucide-react", "@daily-co/daily-js"],
    },
    server: {
      port,
      strictPort: true,
    },
    preview: {
      port,
    },
    build: {
      outDir: path.resolve(rootDir, "dist"),
      emptyOutDir: true,
      chunkSizeWarningLimit: 3000,
    },
    plugins: [
      react({
        include: "**/*.{jsx,tsx,js,ts}",
      }),
      tailwindcss(),
      {
        name: "govi-elysia-api",
        async configureServer(server) {
          const middleware = await createApiMiddleware();
          server.middlewares.use(middleware);
        },
      },
    ],
  };
});
