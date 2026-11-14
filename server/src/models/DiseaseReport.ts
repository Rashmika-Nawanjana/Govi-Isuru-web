import mongoose, { Schema } from "mongoose";

type HeatmapFilters = {
  district?: string;
  disease?: string;
  severity?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
};

type TimeSeriesFilters = {
  district?: string;
  disease?: string;
  gnDivision?: string;
  days?: number;
};

const DiseaseReportSchema = new Schema({
  farmerId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: false,
  },
  farmerUsername: { type: String, required: false },
  crop: { type: String, required: true, default: "rice" },
  disease: { type: String, required: true },
  confidence: { type: Number, required: true, min: 0, max: 1 },
  severity: {
    type: String,
    enum: ["none", "low", "medium", "high", "critical"],
    default: "medium",
  },
  district: { type: String, required: true },
  dsDivision: { type: String, required: true },
  gnDivision: { type: String, required: true },
  coordinates: {
    lat: { type: Number },
    lng: { type: Number },
  },
  treatment: { type: String },
  aiConfidenceValid: { type: Boolean, default: true },
  trustScore: { type: Number, default: 50, min: 0, max: 100 },
  verificationStatus: {
    type: String,
    enum: [
      "pending",
      "under_review",
      "verified",
      "rejected",
      "flagged",
      "needs_field_visit",
    ],
    default: "pending",
  },
  priority: {
    type: String,
    enum: ["info", "low", "medium", "high", "emergency"],
    default: "medium",
  },
  escalatedAt: { type: Date, default: null },
  escalatedBy: { type: String, default: null },
  communityConfirmations: { type: Number, default: 0 },
  confirmedBy: [
    {
      reportId: { type: Schema.Types.ObjectId, ref: "DiseaseReport" },
      farmerId: { type: Schema.Types.ObjectId, ref: "User" },
      confirmedAt: { type: Date, default: Date.now },
    },
  ],
  flaggedReason: { type: String, default: null },
  adminReviewed: { type: Boolean, default: false },
  reviewedBy: { type: String, default: null },
  reviewedAt: { type: Date, default: null },
  imageUrl: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
});

DiseaseReportSchema.index({ crop: 1, disease: 1, gnDivision: 1, createdAt: -1 });
DiseaseReportSchema.index({ verificationStatus: 1, createdAt: -1 });
DiseaseReportSchema.index({ trustScore: -1, createdAt: -1 });
DiseaseReportSchema.index({ "coordinates.lat": 1, "coordinates.lng": 1 });
DiseaseReportSchema.index({ district: 1, disease: 1, createdAt: -1 });

DiseaseReportSchema.statics.getVerifiedReportsForHeatmap = async function (
  filters: HeatmapFilters = {}
) {
  const query: Record<string, unknown> = {
    verificationStatus: { $in: ["verified", "pending"] },
    trustScore: { $gte: 30 },
    "coordinates.lat": { $exists: true },
    "coordinates.lng": { $exists: true },
  };

  if (filters.district) query.district = filters.district;
  if (filters.disease) query.disease = filters.disease;
  if (filters.severity) query.severity = filters.severity;
  if (filters.startDate && filters.endDate) {
    query.createdAt = {
      $gte: new Date(filters.startDate),
      $lte: new Date(filters.endDate),
    };
  } else if (filters.days) {
    query.createdAt = {
      $gte: new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000),
    };
  }

  return this.find(query)
    .select(
      "disease severity coordinates district gnDivision trustScore createdAt confidence"
    )
    .sort({ createdAt: -1 })
    .lean();
};

DiseaseReportSchema.statics.getTimeSeriesData = async function (
  filters: TimeSeriesFilters = {}
) {
  const matchQuery: Record<string, unknown> = {};

  if (filters.district) matchQuery.district = filters.district;
  if (filters.disease) matchQuery.disease = filters.disease;
  if (filters.gnDivision) matchQuery.gnDivision = filters.gnDivision;

  const days = filters.days || 30;
  matchQuery.createdAt = {
    $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
  };
  matchQuery.trustScore = { $gte: 30 };

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          disease: "$disease",
        },
        count: { $sum: 1 },
        avgConfidence: { $avg: "$confidence" },
        avgTrustScore: { $avg: "$trustScore" },
      },
    },
    { $sort: { "_id.date": 1 } },
    {
      $group: {
        _id: "$_id.disease",
        data: {
          $push: {
            date: "$_id.date",
            count: "$count",
            avgConfidence: "$avgConfidence",
            avgTrustScore: "$avgTrustScore",
          },
        },
        totalReports: { $sum: "$count" },
      },
    },
  ]);
};

interface DiseaseReportModel
  extends mongoose.Model<mongoose.InferSchemaType<typeof DiseaseReportSchema>> {
  getVerifiedReportsForHeatmap(
    filters?: HeatmapFilters
  ): Promise<unknown[]>;
  getTimeSeriesData(filters?: TimeSeriesFilters): Promise<unknown[]>;
}

export const DiseaseReport = mongoose.model(
  "DiseaseReport",
  DiseaseReportSchema
) as DiseaseReportModel;