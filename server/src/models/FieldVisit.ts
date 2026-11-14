import mongoose, { Schema } from "mongoose";

const FieldVisitSchema = new Schema({
  reportId: { type: Schema.Types.ObjectId, ref: "Report", required: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  requestedByUsername: { type: String, required: true },
  assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
  assignedToUsername: { type: String, default: null },
  status: {
    type: String,
    enum: ["scheduled", "in_progress", "completed", "cancelled", "postponed"],
    default: "scheduled",
  },
  priority: {
    type: String,
    enum: ["low", "medium", "high", "urgent"],
    default: "medium",
  },
  district: { type: String, required: true },
  dsDivision: { type: String },
  gnDivision: { type: String, required: true },
  scheduledDate: { type: Date, default: null },
  scheduledTime: { type: String, default: null },
  purpose: { type: String, required: true },
  instructions: { type: String, default: null },
  visitNotes: [
    { note: String, addedBy: String, addedAt: { type: Date, default: Date.now } },
  ],
  photos: [
    {
      url: String,
      caption: String,
      uploadedBy: String,
      uploadedAt: { type: Date, default: Date.now },
    },
  ],
  findings: {
    diseaseConfirmed: { type: Boolean, default: null },
    severity: {
      type: String,
      enum: ["none", "low", "medium", "high", "critical", null],
      default: null,
    },
    affectedArea: { type: String, default: null },
    farmerContacted: { type: Boolean, default: false },
    recommendedActions: { type: String, default: null },
  },
  completedAt: { type: Date, default: null },
  completedBy: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

FieldVisitSchema.pre("save", function () {
  this.updatedAt = new Date();
});

FieldVisitSchema.index({ district: 1, status: 1 });
FieldVisitSchema.index({ reportId: 1 });

export const FieldVisit = mongoose.model("FieldVisit", FieldVisitSchema);