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

async function mlFetch(path: string, init?: RequestInit) {
  const url = `${env.mlServiceUrl.replace(/\/$/, "")}${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(60_000),
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
};
