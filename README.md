# Govi Isuru Web

Single-server app: **React UI** + **Elysia business logic** on one port. ML stays external.

```
server/   # Elysia MVC (auth, crop care, market, …)
web/      # Vite + React UI
shared/   # Zod schemas / shared types
```

## Run

```bash
cp .env.example .env   # or use the .env copied from Govi-Isuru
bun install
bun run dev            # http://localhost:3000  (UI + /api together)
```

Production:

```bash
bun run build
bun run start          # serves dist/ + API on PORT
```

## Env

Root `.env` only (same origin — leave `VITE_API_URL` empty).  
`AI_SERVICE_URL` / `ML_SERVICE_URL` point at the FastAPI ML host.

## Deploy (Vercel)

One project from this repo root. Set the same env vars in the Vercel dashboard. No Docker.
