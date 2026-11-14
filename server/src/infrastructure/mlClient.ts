import { env } from "./env";

export type CropType = "rice" | "tea" | "chili";

export class MlClientError extends Error {
  constructor(
    message: string,
    public status = 502,
    public details?: unknown
  ) {
    super(message);
    this.name = "MlClientError";
  }
}

/**
 * Single outbound client for the external AI/ML service.
 * Frontend must only call Govi `/api/*` routes; controllers use this client.
 * Point `ML_SERVICE_URL` (and optional `ML_API_KEY`) at a new service later —
 * public API paths stay unchanged.
 */
async function mlFetch(path: string, init?: RequestInit) {
  const url = `${env.mlServiceUrl.replace(/\/$/, "")}${path}`;
  const headers = new Headers(init?.headers || {});
  if (env.mlApiKey && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${env.mlApiKey}`);
  }
  try {
    const res = await fetch(url, {
      ...init,
      headers,
      signal: init?.signal ?? AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new MlClientError(
        `ML service error: ${res.status}`,
        502,
        text.slice(0, 500)
      );
    }
    return res;
  } catch (err) {
    if (err instanceof MlClientError) throw err;
    throw new MlClientError(
      `ML service unreachable at ${env.mlServiceUrl}`,
      502,
      err instanceof Error ? err.message : err
    );
  }
}

export const mlClient = {
  /** Alias kept for readability in AI-facing modules */
  get baseUrl() {
    return env.mlServiceUrl;
  },

  async health() {
    const res = await mlFetch("/health").catch(() => null);
    if (!res) return { ok: false, url: env.mlServiceUrl };
    const data = await res.json().catch(() => ({}));
    return { ok: true, url: env.mlServiceUrl, data };
  },

  async predict(crop: CropType, file: File | Blob, filename = "image.jpg") {
    const form = new FormData();
    form.append("file", file, filename);
    const res = await mlFetch(`/predict/${crop}`, {
      method: "POST",
      body: form,
    });
    return res.json();
  },

  async suitability(payload: Record<string, unknown>) {
    const res = await mlFetch("/suitability/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3_000),
    });
    return res.json();
  },

  /** Generic JSON POST — for future AI endpoints without new public routes. */
  async postJson<T = unknown>(path: string, body: unknown): Promise<T> {
    const res = await mlFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json() as Promise<T>;
  },

  async getJson<T = unknown>(path: string): Promise<T> {
    const res = await mlFetch(path);
    return res.json() as Promise<T>;
  },
};

/** Preferred name going forward; same instance as mlClient. */
export const aiClient = mlClient;
