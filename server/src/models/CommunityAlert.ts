import mongoose, { Schema } from "mongoose";

const CommunityAlertSchema = new Schema({
  crop: { type: String, required: true },
  disease: { type: String, required: true },
  district: { type: String, required: true },
  dsDivision: { type: String, required: true },
  gnDivision: { type: String, required: true },
  reportCount: { type: Number, required: true, min: 1 },
  severity: {
    type: String,
    enum: ["low", "medium", "high", "critical"],
    default: "medium",
  },
  status: {
    type: String,
    enum: ["active", "monitoring", "resolved"],
    default: "active",
  },
  firstReportedAt: { type: Date, default: Date.now },
  lastUpdatedAt: { type: Date, default: Date.now },
  recommendation: {
    en: String,
    si: String,
  },
  createdAt: { type: Date, default: Date.now },
});

CommunityAlertSchema.index({ gnDivision: 1, status: 1, createdAt: -1 });
CommunityAlertSchema.index({ district: 1, status: 1 });

export const CommunityAlert = mongoose.model(
  "CommunityAlert",
  CommunityAlertSchema
);