import mongoose, { Schema } from "mongoose";

const InternalNoteSchema = new Schema({
  targetType: {
    type: String,
    enum: ["disease_report", "farmer", "location", "alert"],
    required: true,
  },
  targetId: { type: Schema.Types.ObjectId, required: true },
  farmerUsername: { type: String, default: null },
  gnDivision: { type: String, default: null },
  district: { type: String, default: null },
  noteType: {
    type: String,
    enum: ["general", "warning", "flag", "follow_up", "coordination", "abuse_report"],
    default: "general",
  },
  content: { type: String, required: true },
  flags: { type: [String], default: [] },
  visibility: {
    type: String,
    enum: ["all_officers", "district_only", "admin_only"],
    default: "all_officers",
  },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdByUsername: { type: String, required: true },
  createdByDistrict: { type: String, default: null },
  isActive: { type: Boolean, default: true },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: String, default: null },
  expiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

InternalNoteSchema.index({ district: 1, isActive: 1 });
InternalNoteSchema.index({ targetType: 1, targetId: 1 });

export const InternalNote = mongoose.model("InternalNote", InternalNoteSchema);