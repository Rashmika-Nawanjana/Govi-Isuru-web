/** Same-origin by default (one server). Override with VITE_API_URL only if needed. */
const API_URL = (import.meta.env.VITE_API_URL as string) || "";

function getToken() {
  return localStorage.getItem("token");
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    const err = new Error(
      (data as { msg?: string; error?: string })?.msg ||
        (data as { error?: string })?.error ||
        res.statusText
    ) as Error & { status: number; data: unknown };
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data as T;
}

export function googleLoginUrl() {
  return `${API_URL}/api/auth/google`;
}
