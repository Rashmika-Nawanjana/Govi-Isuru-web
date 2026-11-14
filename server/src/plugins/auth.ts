import jwt from "jsonwebtoken";
import { Elysia } from "elysia";
import { env } from "../infrastructure/env";
import { User, type UserDoc } from "../models/User";

export type AuthUser = {
  id: string;
  username: string;
  role: string;
  email: string;
  district?: string;
  dsDivision?: string;
  gnDivision?: string;
  fullName?: string;
  phone?: string;
  credits?: number;
};

export type JwtPayload = AuthUser & { profileComplete?: boolean };

export function signAccessToken(user: {
  _id: { toString(): string };
  username: string;
  role: string;
  email: string;
  district?: string;
  dsDivision?: string;
  gnDivision?: string;
  fullName?: string;
  phone?: string;
  profileComplete?: boolean;
}) {
  return jwt.sign(
    {
      id: user._id.toString(),
      username: user.username,
      role: user.role,
      email: user.email,
      district: user.district,
      dsDivision: user.dsDivision,
      gnDivision: user.gnDivision,
      fullName: user.fullName,
      phone: user.phone,
      profileComplete: user.profileComplete,
    } satisfies JwtPayload,
    env.jwtSecret,
    { expiresIn: "7d" }
  );
}

export function signRefreshToken(userId: string) {
  return jwt.sign({ id: userId }, env.refreshSecret, { expiresIn: "30d" });
}

function hasRequiredProfile(user: {
  fullName?: string | null;
  district?: string | null;
  dsDivision?: string | null;
  gnDivision?: string | null;
  role?: string | null;
}) {
  return Boolean(
    user.fullName &&
      user.district &&
      user.dsDivision &&
      user.gnDivision &&
      user.role
  );
}

export function toPublicUser(user: UserDoc & { _id: { toString(): string } }) {
  const profileComplete = hasRequiredProfile(user);
  // Extra details only for first-time Google signup — never for password auth
  const needsGoogleOnboarding = Boolean(user.googleId && !profileComplete);

  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    district: user.district || "",
    dsDivision: user.dsDivision || "",
    gnDivision: user.gnDivision || "",
    phone: user.phone || "",
    credits: user.credits,
    isEmailVerified: user.isEmailVerified,
    profileComplete,
    needsGoogleOnboarding,
    hasGoogle: Boolean(user.googleId),
    isApproved: user.isApproved,
    approvalStatus: user.approvalStatus,
    avatarUrl: user.avatarUrl || "",
  };
}

function extractBearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export const authPlugin = new Elysia({ name: "auth" }).derive(
  { as: "scoped" },
  async ({ request }) => {
    const token = extractBearer(request);
    if (!token) {
      return { user: null as AuthUser | null, token: null as string | null };
    }
    try {
      const decoded = jwt.verify(token, env.jwtSecret) as JwtPayload;
      return {
        user: {
          id: decoded.id,
          username: decoded.username,
          role: decoded.role,
          email: decoded.email,
          district: decoded.district,
          dsDivision: decoded.dsDivision,
          gnDivision: decoded.gnDivision,
          fullName: decoded.fullName,
          phone: decoded.phone,
        } satisfies AuthUser,
        token,
      };
    } catch {
      return { user: null as AuthUser | null, token: null as string | null };
    }
  }
);

export function requireAuth(user: AuthUser | null) {
  if (!user) {
    const err = new Error("Authentication required");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  return user;
}

export function requireOfficer(user: AuthUser | null) {
  const auth = requireAuth(user);
  if (auth.role !== "officer" && auth.role !== "admin") {
    const err = new Error("Officer access required");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  return auth;
}

export async function requireAuthUser(user: AuthUser | null) {
  const auth = requireAuth(user);
  const doc = await User.findById(auth.id);
  if (!doc) {
    const err = new Error("User not found");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  return doc;
}
