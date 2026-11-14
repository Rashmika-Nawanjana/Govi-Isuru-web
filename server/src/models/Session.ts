import mongoose, { Schema } from "mongoose";

const SessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  refreshToken: { type: String, required: true, unique: true },
  deviceInfo: {
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },
  },
  isActive: { type: Boolean, default: true },
  lastActivity: { type: Date, default: Date.now },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24 * 30,
  },
});

SessionSchema.index({ userId: 1, isActive: 1 });

export const Session = mongoose.model("Session", SessionSchema);
