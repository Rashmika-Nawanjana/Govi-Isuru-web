import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const webRoot = path.resolve(rootDir, "web");
const sharedEntry = path.resolve(rootDir, "shared/src/index.ts");
const apiMiddlewareUrl = pathToFileURL(
  path.resolve(__dirname, "vite-api-middleware.mjs")
).href;

// Built at runtime so Vite's config bundler does not see a bare "@govi/shared" import
const sharedAliasName = "@" + "govi/shared";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, rootDir, "");
  const port = Number(env.PORT || 3000);

  return {
    root: webRoot,
    envDir: rootDir,
    publicDir: path.resolve(webRoot, "public"),
    resolve: {
      alias: {
        [sharedAliasName]: sharedEntry,
      },
      dedupe: ["react", "react-dom"],
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
      fs: { allow: [rootDir] },
    },
    preview: { port },
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
      // Dev-only API bridge. Dynamic import uses an absolute file URL so the
      // Vite config bundler (Node on Vercel) never pulls in server → @govi/shared.
      command === "serve" && {
        name: "govi-elysia-api",
        async configureServer(server) {
          const { createApiMiddleware } = await import(apiMiddlewareUrl);
          server.middlewares.use(await createApiMiddleware());
        },
      },
    ].filter(Boolean),
  };
});
