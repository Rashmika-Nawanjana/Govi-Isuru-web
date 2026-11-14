import { Elysia } from "elysia";
import { env } from "../../infrastructure/env";

const sampleArticles = [
  {
    title: "Monsoon advisory for paddy farmers",
    description:
      "Configure NEWS_API_KEY for live headlines. Sample advisory shown meanwhile.",
    url: "#",
    urlToImage: null,
    source: { name: "Govi Isuru" },
    publishedAt: new Date().toISOString(),
  },
];

async function fetchNews(q: string, set: { status?: number | string }) {
  if (!env.newsApiKey) {
    return { articles: sampleArticles, source: "sample" };
  }
  const url = new URL("https://newsapi.org/v2/everything");
  url.searchParams.set("q", q);
  url.searchParams.set("language", "en");
  url.searchParams.set("pageSize", "12");
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("apiKey", env.newsApiKey);
  const res = await fetch(url);
  if (!res.ok) {
    set.status = 502;
    return { articles: sampleArticles, error: "Failed to fetch news" };
  }
  const data = (await res.json()) as { articles?: unknown[] };
  return { articles: data.articles || [], source: "newsapi" };
}

export const newsController = new Elysia({ prefix: "/api/news" })
  .get("/", async ({ query, set }) =>
    fetchNews(
      (query as { q?: string }).q || "agriculture OR farming OR rice Sri Lanka",
      set
    )
  )
  .get("/agriculture", async ({ set }) =>
    fetchNews("agriculture OR farming Sri Lanka", set)
  )
  .get("/headlines", async ({ set }) =>
    fetchNews("Sri Lanka agriculture", set)
  )
  .get("/demo", async () => ({ articles: sampleArticles, source: "demo" }))
  .get("/search", async ({ query, set }) =>
    fetchNews((query as { q?: string }).q || "farming", set)
  )
  .post("/click", () => ({ ok: true }))
  .post("/summarize", () => ({
    summary: "Summary unavailable in this migration build.",
  }))
  .get("/vapid-public-key", () => ({
    publicKey: process.env.VAPID_PUBLIC_KEY || "",
  }))
  .post("/subscribe", () => ({ ok: true }))
  .post("/unsubscribe", () => ({ ok: true }))
  .post("/prepare-tts", () => ({ ok: false, msg: "TTS not configured" }))
  .get("/tts-audio", ({ set }) => {
    set.status = 501;
    return { error: "TTS not configured" };
  });
