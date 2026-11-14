import mongoose, { Schema } from "mongoose";

/** Farmer AI Doctor case reports (Express `Report` model). */
const ReportSchema = new Schema({
  report_type: {
    type: String,
    enum: ["disease", "pest", "weather", "advisory"],
    required: true,
  },
  farmerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  farmerName: { type: String, required: true },
  farmerPhone: { type: String, required: true },
  district: { type: String, required: true },
  dsDivision: { type: String, required: true },
  gnDivision: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  image_url: { type: String },
  ai_prediction: { type: String },
  confidence_score: { type: Number, min: 0, max: 1 },
  diseaseReportId: { type: Schema.Types.ObjectId, ref: "DiseaseReport" },
  autoVerifiedByAI: { type: Boolean, default: false },
  status: {
    type: String,
    enum: [
      "pending",
      "instructor_pending",
      "claimed",
      "under_review",
      "advice_submitted",
      "verified",
      "rejected",
      "resolved",
    ],
    default: "pending",
  },
  verifiedBy: { type: Schema.Types.ObjectId, ref: "User" },
  verifiedByName: { type: String },
  verificationDate: { type: Date },
  verificationNotes: { type: String },
  assignedInstructorId: { type: Schema.Types.ObjectId, ref: "User" },
  assignedInstructorName: { type: String },
  assignmentStatus: {
    type: String,
    enum: ["unassigned", "claimed", "analysing", "advice_submitted", "closed"],
    default: "unassigned",
  },
  claimedAt: { type: Date },
  analysisStartedAt: { type: Date },
  adviceSubmittedAt: { type: Date },
  adviceText: { type: String },
  adviceFeeCredits: { type: Number, default: 40 },
  paymentStatus: {
    type: String,
    enum: ["not_required", "pending", "completed"],
    default: "not_required",
  },
  paymentCompletedAt: { type: Date },
  alertSentToFarmers: { type: Boolean, default: false },
  alertSentDate: { type: Date },
  affectedFarmersCount: { type: Number, default: 0 },
  severity: {
    type: String,
    enum: ["low", "medium", "high", "critical"],
    default: "medium",
  },
  resolvedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

ReportSchema.index({ gnDivision: 1, status: 1 });
ReportSchema.index({ farmerId: 1 });
ReportSchema.index({ assignmentStatus: 1, confidence_score: -1, createdAt: -1 });
ReportSchema.index({ assignedInstructorId: 1, assignmentStatus: 1, createdAt: -1 });
ReportSchema.set("collection", "diseasereports");

export const Report = mongoose.model("Report", ReportSchema);