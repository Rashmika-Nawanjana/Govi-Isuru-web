import { z } from "zod";

export const UserRoleSchema = z.enum([
  "farmer",
  "officer",
  "buyer",
  "admin",
  "moderator",
]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const ProfileCompletionSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().optional().default(""),
  district: z.string().min(1),
  dsDivision: z.string().min(1),
  gnDivision: z.string().min(1),
  role: UserRoleSchema.default("farmer"),
  officerId: z.string().optional(),
  department: z.string().optional(),
  designation: z.string().optional(),
});
export type ProfileCompletion = z.infer<typeof ProfileCompletionSchema>;

export const RegisterSchema = z
  .object({
    username: z.string().min(3).max(32),
    email: z.string().email(),
    password: z
      .string()
      .min(8)
      .regex(/[A-Z]/, "uppercase required")
      .regex(/[a-z]/, "lowercase required")
      .regex(/[0-9]/, "number required")
      .regex(/[!@#$%^&*(),.?\":{}|<>]/, "special char required"),
    fullName: z.string().min(2),
    phone: z.string().optional().default(""),
    district: z.string().min(1),
    dsDivision: z.string().min(1),
    gnDivision: z.string().min(1),
    role: UserRoleSchema.default("farmer"),
    officerId: z.string().optional(),
    department: z.string().optional(),
    designation: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === "officer") {
      if (!data.officerId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["officerId"],
          message: "Officer ID required",
        });
      }
    }
  });
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const PublicUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().email(),
  fullName: z.string(),
  role: UserRoleSchema,
  district: z.string(),
  dsDivision: z.string(),
  gnDivision: z.string(),
  phone: z.string().optional(),
  credits: z.number().optional(),
  isEmailVerified: z.boolean().optional(),
  profileComplete: z.boolean(),
  /** True only for first-time Google users who still need district/role etc. */
  needsGoogleOnboarding: z.boolean().optional(),
  hasGoogle: z.boolean().optional(),
  isApproved: z.boolean().optional(),
  approvalStatus: z.string().optional(),
  avatarUrl: z.string().optional(),
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const CropTypeSchema = z.enum(["rice", "tea", "chili"]);
export type CropType = z.infer<typeof CropTypeSchema>;

export const CREDIT_COSTS = {
  AI_PREDICT: 25,
  YIELD: 20,
  SUITABILITY: 20,
  BOOKING: 40,
} as const;

export const ApiErrorSchema = z.object({
  error: z.string(),
  msg: z.string().optional(),
  code: z.string().optional(),
});
