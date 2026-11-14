import mongoose, { Schema } from "mongoose";

const OfficerActionLogSchema = new Schema({
  officerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  officerUsername: { type: String, required: true },
  officerDistrict: { type: String, default: "Unknown" },
  actionType: {
    type: String,
    enum: [
      "verify_report",
      "reject_report",
      "flag_report",
      "request_field_visit",
      "start_review",
      "claim_case",
      "start_analysis",
      "submit_advice",
      "resolve_alert",
      "escalate_alert",
      "add_note",
      "update_priority",
    ],
    required: true,
  },
  targetType: {
    type: String,
    enum: ["disease_report", "community_alert", "notification"],
    required: true,
  },
  targetId: { type: Schema.Types.ObjectId, required: true },
  previousStatus: { type: String },
  newStatus: { type: String },
  metadata: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
});

OfficerActionLogSchema.index({ officerId: 1, createdAt: -1 });

export const OfficerActionLog = mongoose.model(
  "OfficerActionLog",
  OfficerActionLogSchema
);