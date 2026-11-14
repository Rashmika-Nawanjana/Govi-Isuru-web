import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import {
  LoginSchema,
  ProfileCompletionSchema,
  RegisterSchema,
  type LoginInput,
  type ProfileCompletion,
  type RegisterInput,
} from "@govi/shared";
import { env } from "../../infrastructure/env";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../../infrastructure/email";
import { User } from "../../models/User";
import { Session } from "../../models/Session";
import {
  signAccessToken,
  signRefreshToken,
  toPublicUser,
} from "../../plugins/auth";

function isProfileComplete(data: {
  fullName?: string;
  district?: string;
  dsDivision?: string;
  gnDivision?: string;
  role?: string;
}) {
  return Boolean(
    data.fullName &&
      data.district &&
      data.dsDivision &&
      data.gnDivision &&
      data.role
  );
}

export const authService = {
  async register(raw: RegisterInput) {
    const data = RegisterSchema.parse(raw);
    const exists = await User.findOne({
      $or: [{ email: data.email.toLowerCase() }, { username: data.username }],
    });
    if (exists) {
      const err = new Error("Username or email already in use");
      (err as Error & { status: number }).status = 409;
      throw err;
    }

    const hashed = await bcrypt.hash(data.password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const isOfficer = data.role === "officer";

    const user = await User.create({
      ...data,
      email: data.email.toLowerCase(),
      password: hashed,
      isEmailVerified: false,
      verificationToken,
      verificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      profileComplete: true,
      isApproved: !isOfficer,
      approvalStatus: isOfficer ? "pending" : "approved",
    });

    await sendVerificationEmail(user.email, user.username, verificationToken);

    return {
      msg: "Registration successful. Please verify your email.",
      email: user.email,
      user: toPublicUser(user),
    };
  },

  async login(raw: LoginInput, device?: { userAgent?: string; ip?: string }) {
    const data = LoginSchema.parse(raw);
    const user = await User.findOne({
      $or: [
        { username: data.username },
        { email: data.username.toLowerCase() },
      ],
    });
    if (!user || !user.password) {
      const err = new Error("Invalid credentials");
      (err as Error & { status: number }).status = 401;
      throw err;
    }
    const ok = await bcrypt.compare(data.password, user.password);
    if (!ok) {
      const err = new Error("Invalid credentials");
      (err as Error & { status: number }).status = 401;
      throw err;
    }
    if (!user.isEmailVerified) {
      const err = new Error("Email not verified");
      (err as Error & { status: number; code: string; email: string }).status =
        403;
      (err as Error & { code: string }).code = "EMAIL_NOT_VERIFIED";
      (err as Error & { email: string }).email = user.email;
      throw err;
    }

    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(user._id.toString());
    await Session.create({
      userId: user._id,
      refreshToken,
      deviceInfo: {
        userAgent: device?.userAgent || "",
        ip: device?.ip || "",
      },
    });

    return { token, refreshToken, user: toPublicUser(user) };
  },

  async refreshToken(refreshToken: string) {
    if (!refreshToken) {
      const err = new Error("Refresh token required");
      (err as Error & { status: number }).status = 400;
      throw err;
    }

    let decoded: { id: string };
    try {
      decoded = jwt.verify(refreshToken, env.refreshSecret) as { id: string };
    } catch {
      const err = new Error("Invalid refresh token");
      (err as Error & { status: number }).status = 401;
      throw err;
    }

    const session = await Session.findOne({
      refreshToken,
      userId: decoded.id,
      isActive: true,
    });

    if (!session) {
      const err = new Error("Session expired. Please log in again.");
      (err as Error & { status: number }).status = 401;
      throw err;
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      const err = new Error("User not found");
      (err as Error & { status: number }).status = 401;
      throw err;
    }

    const token = signAccessToken(user);
    const newRefreshToken = signRefreshToken(user._id.toString());

    session.refreshToken = newRefreshToken;
    session.lastActivity = new Date();
    await session.save();

    return {
      token,
      accessToken: token,
      refreshToken: newRefreshToken,
      expiresIn: 900,
    };
  },

  async verifyEmail(token: string) {
    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: new Date() },
    });
    if (!user) {
      const err = new Error("Invalid or expired verification token");
      (err as Error & { status: number }).status = 400;
      throw err;
    }
    user.isEmailVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();
    return { msg: "Email verified" };
  },

  async resendVerification(email: string) {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return { msg: "If that email exists, a link was sent" };
    if (user.isEmailVerified) return { msg: "Email already verified" };
    const verificationToken = crypto.randomBytes(32).toString("hex");
    user.verificationToken = verificationToken;
    user.verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();
    await sendVerificationEmail(user.email, user.username, verificationToken);
    return { msg: "Verification email sent" };
  },

  async forgotPassword(email: string) {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return { msg: "If that email exists, a reset link was sent" };
    const token = crypto.randomBytes(32).toString("hex");
    user.passwordResetToken = token;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    await sendPasswordResetEmail(user.email, token);
    return { msg: "If that email exists, a reset link was sent" };
  },

  async resetPassword(token: string, password: string) {
    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() },
    });
    if (!user) {
      const err = new Error("Invalid or expired reset token");
      (err as Error & { status: number }).status = 400;
      throw err;
    }
    user.password = await bcrypt.hash(password, 10);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    return { msg: "Password updated" };
  },

  async completeProfile(userId: string, raw: ProfileCompletion) {
    const data = ProfileCompletionSchema.parse(raw);
    const user = await User.findById(userId);
    if (!user) {
      const err = new Error("User not found");
      (err as Error & { status: number }).status = 404;
      throw err;
    }

    Object.assign(user, data);
    user.profileComplete = isProfileComplete(user);
    if (data.role === "officer" && user.approvalStatus === "approved") {
      // keep existing approval; new officers from Google start pending if switching
    }
    if (data.role === "officer" && !user.isApproved) {
      user.approvalStatus = "pending";
      user.isApproved = false;
    }
    await user.save();

    const token = signAccessToken(user);
    return { token, user: toPublicUser(user) };
  },

  googleAuthUrl(state: string) {
    if (!env.googleClientId) {
      const err = new Error("Google OAuth is not configured");
      (err as Error & { status: number }).status = 503;
      throw err;
    }
    const params = new URLSearchParams({
      client_id: env.googleClientId,
      redirect_uri: env.googleRedirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "online",
      prompt: "select_account",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },

  async handleGoogleCallback(code: string) {
    if (!env.googleClientId || !env.googleClientSecret) {
      const err = new Error("Google OAuth is not configured");
      (err as Error & { status: number }).status = 503;
      throw err;
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
        redirect_uri: env.googleRedirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      const err = new Error("Google token exchange failed");
      (err as Error & { status: number }).status = 400;
      throw err;
    }
    const tokens = (await tokenRes.json()) as { access_token: string };
    const profileRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    if (!profileRes.ok) {
      const err = new Error("Failed to fetch Google profile");
      (err as Error & { status: number }).status = 400;
      throw err;
    }
    const profile = (await profileRes.json()) as {
      id: string;
      email: string;
      name?: string;
      picture?: string;
      verified_email?: boolean;
    };

    let user = await User.findOne({
      $or: [{ googleId: profile.id }, { email: profile.email.toLowerCase() }],
    });

    if (!user) {
      const base =
        profile.email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) ||
        "farmer";
      let username = base;
      let i = 0;
      while (await User.findOne({ username })) {
        i += 1;
        username = `${base}${i}`;
      }
      user = await User.create({
        username,
        email: profile.email.toLowerCase(),
        fullName: profile.name || "",
        googleId: profile.id,
        avatarUrl: profile.picture || "",
        password: null,
        isEmailVerified: Boolean(profile.verified_email ?? true),
        profileComplete: false,
        role: "farmer",
      });
    } else {
      user.googleId = user.googleId || profile.id;
      user.avatarUrl = user.avatarUrl || profile.picture || "";
      if (!user.fullName && profile.name) user.fullName = profile.name;
      user.isEmailVerified = true;
      user.profileComplete = isProfileComplete(user);
      await user.save();
    }

    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(user._id.toString());
    await Session.create({
      userId: user._id,
      refreshToken,
      deviceInfo: { userAgent: "google-oauth", ip: "" },
    });

    return { token, refreshToken, user: toPublicUser(user) };
  },

  async me(userId: string) {
    const user = await User.findById(userId);
    if (!user) {
      const err = new Error("User not found");
      (err as Error & { status: number }).status = 404;
      throw err;
    }
    return toPublicUser(user);
  },
};
