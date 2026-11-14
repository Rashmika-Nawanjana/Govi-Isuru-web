import crypto from "crypto";
import { Elysia } from "elysia";
import { sendVerificationEmail } from "../../infrastructure/email";
import { env } from "../../infrastructure/env";
import { User } from "../../models/User";
import { authPlugin, requireAuth } from "../../plugins/auth";
import { authService } from "./auth.service";

function cookieHeader(token: string) {
  const secure = env.isProd ? "; Secure" : "";
  return `access_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${secure}`;
}

export const authController = new Elysia({ prefix: "/api/auth" })
  .use(authPlugin)
  .post("/register", async ({ body, set }) => {
    try {
      return await authService.register(body as never);
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 400;
      return { error: err.message, msg: err.message };
    }
  })
  .post("/login", async ({ body, request, set }) => {
    try {
      const result = await authService.login(body as never, {
        userAgent: request.headers.get("user-agent") || "",
      });
      set.headers["set-cookie"] = cookieHeader(result.token);
      return result;
    } catch (e) {
      const err = e as Error & { status?: number; code?: string; email?: string };
      set.status = err.status || 401;
      return {
        error: err.message,
        msg: err.message,
        code: err.code,
        email: err.email,
      };
    }
  })
  .get("/me", async ({ user, set }) => {
    try {
      const auth = requireAuth(user);
      return await authService.me(auth.id);
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 401;
      return { error: err.message };
    }
  })
  // Original CRA UserProfile.jsx calls these paths
  .get("/user/profile", async ({ user, set }) => {
    try {
      const auth = requireAuth(user);
      const doc = await User.findById(auth.id);
      if (!doc) {
        set.status = 404;
        return { error: "Failed to fetch profile" };
      }
      const responseData: Record<string, unknown> = {
        fullName: doc.fullName,
        username: doc.username,
        email: doc.email,
        phone: doc.phone || "",
        district: doc.district,
        dsDivision: doc.dsDivision,
        gnDivision: doc.gnDivision,
        role: doc.role,
      };
      if (doc.role === "officer") {
        responseData.officerId = doc.officerId;
        responseData.department = doc.department;
        responseData.designation = doc.designation;
      }
      return responseData;
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: "Failed to fetch profile" };
    }
  })
  .put("/user/profile", async ({ user, body, set }) => {
    try {
      const auth = requireAuth(user);
      const doc = await User.findById(auth.id);
      if (!doc) {
        set.status = 404;
        return { error: "User not found" };
      }

      const payload = body as {
        fullName?: string;
        email?: string;
        phone?: string;
        district?: string;
        dsDivision?: string;
        gnDivision?: string;
        department?: string;
        designation?: string;
      };

      if (!payload.fullName || payload.fullName.length < 2) {
        set.status = 400;
        return { error: "Full name is required" };
      }

      doc.fullName = payload.fullName;
      if (payload.phone !== undefined) doc.phone = payload.phone;
      if (payload.district) doc.district = payload.district;
      if (payload.dsDivision) doc.dsDivision = payload.dsDivision;
      if (payload.gnDivision) doc.gnDivision = payload.gnDivision;

      if (doc.role === "officer") {
        if (payload.department !== undefined) doc.department = payload.department;
        if (payload.designation !== undefined)
          doc.designation = payload.designation;
      }

      let emailChanged = false;
      if (payload.email && payload.email.toLowerCase() !== doc.email) {
        const existing = await User.findOne({
          email: payload.email.toLowerCase(),
        });
        if (existing) {
          set.status = 400;
          return { error: "Email already in use by another account" };
        }
        doc.email = payload.email.toLowerCase();
        doc.isEmailVerified = false;
        doc.verificationToken = crypto.randomBytes(32).toString("hex");
        doc.verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        emailChanged = true;
      }

      await doc.save();

      let msg = "Profile updated successfully";
      if (emailChanged && doc.verificationToken) {
        try {
          await sendVerificationEmail(
            doc.email,
            doc.fullName || doc.username,
            doc.verificationToken
          );
          msg =
            "Profile updated. Please check your email to verify your new address.";
        } catch {
          msg = "Profile updated, but failed to send verification email.";
        }
      }

      return {
        msg,
        emailChanged,
        user: {
          fullName: doc.fullName,
          username: doc.username,
          email: doc.email,
          phone: doc.phone,
          district: doc.district,
          dsDivision: doc.dsDivision,
          gnDivision: doc.gnDivision,
          role: doc.role,
          department: doc.department,
          designation: doc.designation,
        },
      };
    } catch (e) {
      const err = e as Error & { status?: number };
      console.error("Profile update error:", err);
      set.status = err.status || 500;
      return { error: "Failed to update profile" };
    }
  })
  .post("/verify-email", async ({ body, set }) => {
    try {
      return await authService.verifyEmail((body as { token: string }).token);
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 400;
      return { error: err.message, msg: err.message };
    }
  })
  .get("/verify-email/:token", async ({ params, set }) => {
    try {
      await authService.verifyEmail(params.token);
      return {
        success: true,
        msg: "Email verified successfully! You can now log in.",
      };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 400;
      return {
        error: err.message,
        msg: "Invalid or expired verification link. Please request a new one.",
      };
    }
  })
  .post("/refresh-token", async ({ body, set }) => {
    try {
      const { refreshToken } = body as { refreshToken?: string };
      return await authService.refreshToken(refreshToken || "");
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 401;
      return { error: err.message, msg: err.message };
    }
  })
  .get("/validate", async ({ user, set }) => {
    try {
      const auth = requireAuth(user);
      const doc = await User.findById(auth.id);
      if (!doc) {
        set.status = 401;
        return { valid: false };
      }
      return {
        valid: true,
        user: {
          username: doc.username,
          email: doc.email,
          role: doc.role,
        },
      };
    } catch {
      set.status = 401;
      return { valid: false };
    }
  })
  .post("/resend-verification", async ({ body, set }) => {
    return authService.resendVerification((body as { email: string }).email);
  })
  .post("/forgot-password", async ({ body }) => {
    return authService.forgotPassword((body as { email: string }).email);
  })
  .post("/reset-password", async ({ body, set }) => {
    try {
      const { token, password } = body as { token: string; password: string };
      return await authService.resetPassword(token, password);
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 400;
      return { error: err.message, msg: err.message };
    }
  })
  .post("/complete-profile", async ({ user, body, set }) => {
    try {
      const auth = requireAuth(user);
      const result = await authService.completeProfile(auth.id, body as never);
      set.headers["set-cookie"] = cookieHeader(result.token);
      return result;
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 400;
      return { error: err.message, msg: err.message };
    }
  })
  .get("/google", ({ set, query }) => {
    try {
      const state = (query as { state?: string }).state || crypto.randomUUID();
      const url = authService.googleAuthUrl(state);
      set.redirect = url;
      return;
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 503;
      return { error: err.message };
    }
  })
  .get("/google/callback", async ({ query, set }) => {
    try {
      const code = (query as { code?: string }).code;
      if (!code) {
        set.status = 400;
        return { error: "Missing code" };
      }
      const result = await authService.handleGoogleCallback(code);
      const redirect = new URL(
        result.user.needsGoogleOnboarding ? "/complete-profile" : "/",
        env.frontendUrl
      );
      redirect.searchParams.set("token", result.token);
      if (result.refreshToken) {
        redirect.searchParams.set("refreshToken", result.refreshToken);
      }
      set.headers["set-cookie"] = cookieHeader(result.token);
      set.redirect = redirect.toString();
      return;
    } catch (e) {
      const err = e as Error & { status?: number };
      set.redirect = `${env.frontendUrl}/login?error=${encodeURIComponent(err.message)}`;
      return;
    }
  })
  .post("/logout", ({ set }) => {
    const secure = env.isProd ? "; Secure" : "";
    set.headers["set-cookie"] =
      `access_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
    return { msg: "Logged out" };
  })
  .get("/google/config", () => ({
    enabled: Boolean(env.googleClientId),
    clientId: env.googleClientId || null,
  }));
