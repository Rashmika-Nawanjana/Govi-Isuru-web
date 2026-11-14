import mongoose, { Schema } from "mongoose";

const AlertSchema = new Schema({
  alert_type: {
    type: String,
    enum: ["disease", "pest", "weather", "advisory", "warning"],
    required: true,
  },
  title: { type: String, required: true },
  description: { type: String, required: true },
  reportId: { type: Schema.Types.ObjectId, ref: "Report" },
  originalProblem: { type: String },
  district: { type: String, required: true },
  dsDivision: { type: String },
  gnDivision: { type: String, required: true },
  severity: {
    type: String,
    enum: ["low", "medium", "high", "critical"],
    default: "medium",
  },
  recommendations: [{ type: String }],
  treatment: { type: String },
  preventiveMeasures: [{ type: String }],
  targetFarmers: [{ type: Schema.Types.ObjectId, ref: "User" }],
  viewedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  publishedBy: { type: Schema.Types.ObjectId, ref: "User" },
  publishedDate: { type: Date, default: Date.now },
  expiresAt: { type: Date },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

AlertSchema.index({ gnDivision: 1, isActive: 1 });
AlertSchema.index({ district: 1 });

export const Alert = mongoose.model("Alert", AlertSchema);
