import mongoose, { Schema } from "mongoose";

const NotificationSchema = new Schema({
  farmerId: { type: Schema.Types.ObjectId, ref: "User" },
  targetDistrict: String,
  targetDsDivision: String,
  targetGnDivision: String,
  recipientUserId: { type: Schema.Types.ObjectId, ref: "User" },
  recipientRole: {
    type: String,
    enum: ["farmer", "officer", "admin", "buyer"],
  },
  type: {
    type: String,
    enum: [
      "disease_alert",
      "weather_warning",
      "market_update",
      "system",
      "instructor_case",
      "advice_update",
    ],
    default: "system",
  },
  title: {
    en: { type: String, required: true },
    si: { type: String, required: true },
  },
  message: {
    en: { type: String, required: true },
    si: { type: String, required: true },
  },
  reportId: { type: Schema.Types.ObjectId, ref: "Report" },
  alertId: { type: Schema.Types.ObjectId, ref: "CommunityAlert" },
  severity: {
    type: String,
    enum: ["info", "warning", "danger"],
    default: "warning",
  },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  },
});

NotificationSchema.index({ targetGnDivision: 1, createdAt: -1 });
NotificationSchema.index({ recipientUserId: 1, read: 1, createdAt: -1 });

export const Notification = mongoose.model("Notification", NotificationSchema);
