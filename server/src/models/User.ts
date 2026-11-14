import mongoose, { Schema, type InferSchemaType } from "mongoose";

const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true },
    fullName: { type: String, required: true, default: "" },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: false, default: null },
    googleId: { type: String, default: null, index: true },
    avatarUrl: { type: String, default: "" },
    district: { type: String, default: "" },
    dsDivision: { type: String, default: "" },
    gnDivision: { type: String, default: "" },
    phone: { type: String, default: "" },
    profileComplete: { type: Boolean, default: false },

    isEmailVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    verificationTokenExpires: { type: Date },
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },

    role: {
      type: String,
      enum: ["farmer", "officer", "buyer", "admin", "moderator"],
      default: "farmer",
    },
    officerId: { type: String, default: null },
    department: { type: String, default: null },
    designation: { type: String, default: null },

    isApproved: { type: Boolean, default: true },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
    },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },

    credits: { type: Number, default: 200 },
    dailyLimit: { type: Number, default: 200 },
    lastCreditReset: { type: Date, default: Date.now },
    isPremium: { type: Boolean, default: false },

    reputation_score: { type: Number, default: 3.0, min: 1, max: 5 },
    total_sales: { type: Number, default: 0 },
    verified_listings: { type: Number, default: 0 },
    total_feedbacks: { type: Number, default: 0 },
    is_verified_farmer: { type: Boolean, default: false },

    false_report_count: { type: Number, default: 0 },
    account_flagged: { type: Boolean, default: false },
    last_report_at: { type: Date },

    savedListings: [{ type: Schema.Types.ObjectId, ref: "Listing" }],
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

UserSchema.index({ role: 1 });
UserSchema.index({ district: 1, role: 1 });

export type UserDoc = InferSchemaType<typeof UserSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const User = mongoose.model("User", UserSchema);
