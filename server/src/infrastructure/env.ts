function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    console.warn(`[env] Missing ${name}`);
  }
  return value ?? "";
}

const port = Number(process.env.PORT || 3000);
const appUrl =
  process.env.APP_URL ||
  process.env.FRONTEND_URL ||
  `http://localhost:${port}`;

export const env = {
  port,
  mongoUri: required("MONGO_URI", "mongodb://127.0.0.1:27017/govi_isuru"),
  jwtSecret: required("JWT_SECRET", "govi_dev_jwt_secret_change_me_32chars"),
  refreshSecret: required(
    "REFRESH_TOKEN_SECRET",
    process.env.JWT_SECRET || "govi_dev_refresh_secret_change_me_32"
  ),
  corsOrigin: required("CORS_ORIGIN", appUrl),
  frontendUrl: required("FRONTEND_URL", appUrl),
  // Prefer ML_SERVICE_URL; fall back to legacy AI_SERVICE_URL from monolith
  mlServiceUrl: required(
    "ML_SERVICE_URL",
    process.env.AI_SERVICE_URL || "http://localhost:8000"
  ),
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI ||
    `${appUrl.replace(/\/$/, "")}/api/auth/google/callback`,
  weatherApiKey: process.env.WEATHER_API_KEY || "",
  newsApiKey: process.env.NEWS_API_KEY || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  dailyApiKey: process.env.DAILY_API_KEY || "",
  smtp: {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || process.env.GMAIL_USER || "",
    pass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || "",
  },
  isProd: process.env.NODE_ENV === "production",
};
