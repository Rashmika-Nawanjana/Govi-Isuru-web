import { CommunityAlert } from "../models/CommunityAlert";
import { DiseaseReport } from "../models/DiseaseReport";
import { Notification } from "../models/Notification";
import { User } from "../models/User";

export const ALERT_CONFIG = {
  confidenceThreshold: 0.95,
  trustScoreThreshold: 30,
};

const districtCoordinates: Record<string, { lat: number; lng: number }> = {
  Anuradhapura: { lat: 8.3114, lng: 80.4037 },
  Polonnaruwa: { lat: 7.9403, lng: 81.0188 },
  Colombo: { lat: 6.9271, lng: 79.8612 },
  Gampaha: { lat: 7.0873, lng: 80.0144 },
  Kalutara: { lat: 6.5854, lng: 79.9607 },
  Kandy: { lat: 7.2906, lng: 80.6337 },
  Matale: { lat: 7.4675, lng: 80.6234 },
  "Nuwara Eliya": { lat: 6.9497, lng: 80.7891 },
  Galle: { lat: 6.0535, lng: 80.221 },
  Matara: { lat: 5.9549, lng: 80.555 },
  Hambantota: { lat: 6.1429, lng: 81.1212 },
  Jaffna: { lat: 9.6615, lng: 80.0255 },
  Kilinochchi: { lat: 9.3803, lng: 80.377 },
  Mannar: { lat: 8.9833, lng: 79.9042 },
  Vavuniya: { lat: 8.7514, lng: 80.4997 },
  Mullaitivu: { lat: 9.2671, lng: 80.8142 },
  Trincomalee: { lat: 8.5874, lng: 81.2152 },
  Batticaloa: { lat: 7.731, lng: 81.6747 },
  Ampara: { lat: 7.2975, lng: 81.682 },
  Kurunegala: { lat: 7.4863, lng: 80.3647 },
  Puttalam: { lat: 8.0362, lng: 79.8283 },
  Badulla: { lat: 6.9934, lng: 81.055 },
  Moneragala: { lat: 6.8728, lng: 81.3507 },
  Ratnapura: { lat: 6.6828, lng: 80.4028 },
  Kegalle: { lat: 7.2513, lng: 80.3464 },
};

function getLocationCoordinates(district: string, gnDivision: string) {
  const base = districtCoordinates[district] || { lat: 7.8731, lng: 80.7718 };
  const hash = gnDivision
    ? gnDivision.split("").reduce((a, b) => a + b.charCodeAt(0), 0)
    : 0;
  return {
    lat: base.lat + ((hash % 100) - 50) / 1000,
    lng: base.lng + (((hash * 7) % 100) - 50) / 1000,
  };
}

function determineSeverity(disease: string, confidence: number) {
  if (!disease || disease.toLowerCase().includes("healthy")) return "none";
  if (confidence > 0.7) return "medium";
  return "low";
}

async function calculateTrustScore(reportData: {
  confidence?: number;
  disease?: string;
  farmerId?: string;
}) {
  let score = 50;
  if (reportData.confidence) score += Math.min(reportData.confidence * 25, 25);
  if (reportData.disease?.toLowerCase().includes("healthy")) score -= 20;
  if (reportData.confidence && reportData.confidence < 0.3) score -= 15;
  if (reportData.farmerId) {
    const farmer = await User.findById(reportData.farmerId);
    if (farmer?.reputation_score) {
      score += (farmer.reputation_score / 5) * 25;
    }
  }
  return Math.max(0, Math.min(100, score));
}

function getSeverityLevel(avgSeverity: number) {
  if (avgSeverity >= 3.5) return "critical";
  if (avgSeverity >= 2.5) return "high";
  if (avgSeverity >= 1.5) return "medium";
  if (avgSeverity >= 0.5) return "low";
  return "none";
}

export async function saveDiseaseReport(reportData: {
  farmerId?: string | null;
  farmerUsername?: string;
  crop?: string;
  disease: string;
  confidence?: number;
  district?: string;
  dsDivision?: string;
  gnDivision: string;
  treatment?: string;
  verificationStatus?: string;
}) {
  const confidence = reportData.confidence ?? 0;
  const trustScore = await calculateTrustScore({
    confidence,
    disease: reportData.disease,
    farmerId: reportData.farmerId ?? undefined,
  });
  const coordinates = getLocationCoordinates(
    reportData.district || "Unknown",
    reportData.gnDivision
  );
  const aiConfidenceValid = confidence >= ALERT_CONFIG.confidenceThreshold;
  const verificationStatus =
    reportData.verificationStatus || (aiConfidenceValid ? "verified" : "pending");

  const report = await DiseaseReport.create({
    ...reportData,
    trustScore,
    coordinates,
    aiConfidenceValid,
    severity: determineSeverity(reportData.disease, confidence),
    verificationStatus,
  });
  return { report, alerts: [] as Awaited<ReturnType<typeof CommunityAlert.find>> };
}

export async function reviewReport(
  reportId: string,
  reviewData: { status: string; flaggedReason?: string; reviewedBy?: string }
) {
  const report = await DiseaseReport.findById(reportId);
  if (!report) return null;

  const update: Record<string, unknown> = {
    adminReviewed: true,
    reviewedBy: reviewData.reviewedBy,
    reviewedAt: new Date(),
    verificationStatus: reviewData.status,
  };
  if (reviewData.flaggedReason) update.flaggedReason = reviewData.flaggedReason;
  if (reviewData.status === "verified") {
    update.trustScore = Math.min(100, (report.trustScore || 50) + 20);
  } else if (reviewData.status === "rejected") {
    update.trustScore = Math.max(0, (report.trustScore || 50) - 30);
  }

  return DiseaseReport.findByIdAndUpdate(reportId, update, { new: true });
}

export async function getActiveAlerts(
  gnDivision?: string,
  dsDivision?: string,
  district?: string
) {
  const query: Record<string, unknown> = {
    status: { $in: ["active", "monitoring"] },
  };

  if (gnDivision && dsDivision && district) {
    query.$or = [
      { gnDivision },
      { dsDivision, gnDivision: { $exists: true } },
      { district, severity: { $in: ["critical", "high"] } },
    ];
  } else if (dsDivision && district) {
    query.$or = [
      { dsDivision },
      { district, severity: { $in: ["critical", "high"] } },
    ];
  } else if (district) {
    query.district = district;
    query.severity = { $in: ["critical", "high"] };
  }

  return CommunityAlert.find(query).sort({ lastUpdatedAt: -1 });
}

export async function getNotifications(gnDivision: string, limit = 10) {
  return Notification.find({
    targetGnDivision: gnDivision,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .limit(limit);
}

export async function markNotificationRead(notificationId: string) {
  return Notification.findByIdAndUpdate(notificationId, { read: true });
}

export async function resolveAlert(alertId: string) {
  return CommunityAlert.findByIdAndUpdate(alertId, {
    status: "resolved",
    lastUpdatedAt: new Date(),
  });
}

export async function getFlaggedReports(filters: { district?: string; limit?: number }) {
  const query: Record<string, unknown> = {
    $or: [
      { verificationStatus: "flagged" },
      { trustScore: { $lt: ALERT_CONFIG.trustScoreThreshold } },
      {
        adminReviewed: false,
        verificationStatus: "pending",
        trustScore: { $lt: 50 },
      },
    ],
  };
  if (filters.district) query.district = filters.district;
  return DiseaseReport.find(query)
    .sort({ createdAt: -1 })
    .limit(filters.limit || 50);
}

export async function getHeatmapData(filters: {
  district?: string;
  disease?: string;
  severity?: string;
  days?: number;
}) {
  const query: Record<string, unknown> = {
    "coordinates.lat": { $exists: true, $ne: null },
    "coordinates.lng": { $exists: true, $ne: null },
    verificationStatus: "verified",
    createdAt: {
      $gte: new Date(Date.now() - (filters.days || 30) * 24 * 60 * 60 * 1000),
    },
  };
  if (filters.district) query.district = filters.district;
  if (filters.disease && filters.disease !== "all") query.disease = filters.disease;
  if (filters.severity && filters.severity !== "all") query.severity = filters.severity;

  const heatmapData = await DiseaseReport.aggregate([
    { $match: query },
    {
      $group: {
        _id: {
          lat: { $round: ["$coordinates.lat", 2] },
          lng: { $round: ["$coordinates.lng", 2] },
        },
        count: { $sum: 1 },
        diseases: { $addToSet: "$disease" },
        avgSeverity: {
          $avg: {
            $switch: {
              branches: [
                { case: { $eq: ["$severity", "critical"] }, then: 4 },
                { case: { $eq: ["$severity", "high"] }, then: 3 },
                { case: { $eq: ["$severity", "medium"] }, then: 2 },
                { case: { $eq: ["$severity", "low"] }, then: 1 },
              ],
              default: 0,
            },
          },
        },
        avgTrustScore: { $avg: "$trustScore" },
        gnDivisions: { $addToSet: "$gnDivision" },
        district: { $first: "$district" },
      },
    },
    { $sort: { count: -1 } },
  ]);

  if (heatmapData.length === 0) {
    const alertQuery: Record<string, unknown> = {
      status: { $in: ["active", "monitoring"] },
    };
    if (filters.district) alertQuery.district = filters.district;
    if (filters.disease && filters.disease !== "all")
      alertQuery.disease = filters.disease;
    if (filters.severity && filters.severity !== "all")
      alertQuery.severity = filters.severity;

    const alerts = await CommunityAlert.find(alertQuery);
    return alerts.map((alert) => {
      const coords = districtCoordinates[alert.district] || {
        lat: 7.8731,
        lng: 80.7718,
      };
      const offset = (Math.random() - 0.5) * 0.2;
      return {
        lat: coords.lat + offset,
        lng: coords.lng + offset,
        intensity: Math.min(alert.reportCount * 0.2, 1),
        count: alert.reportCount,
        diseases: [alert.disease],
        severity: alert.severity || "medium",
        district: alert.district,
        gnDivisions: [alert.gnDivision],
        trustScore: 75,
      };
    });
  }

  return heatmapData.map(
    (point: {
      _id: { lat: number; lng: number };
      count: number;
      diseases: string[];
      avgSeverity: number;
      district: string;
      gnDivisions: string[];
      avgTrustScore: number;
    }) => ({
      lat: point._id.lat,
      lng: point._id.lng,
      intensity: Math.min(point.count * 0.2, 1),
      count: point.count,
      diseases: point.diseases,
      severity: getSeverityLevel(point.avgSeverity),
      district: point.district,
      gnDivisions: point.gnDivisions,
      trustScore: Math.round(point.avgTrustScore || 50),
    })
  );
}

function detectOutbreaks(
  series: { disease: string; data: { date: string; count: number }[] }[]
) {
  const alerts: Record<string, unknown>[] = [];
  for (const s of series) {
    if (s.data.length < 3) continue;
    const recent = s.data.slice(-3);
    const older = s.data.slice(-6, -3);
    const recentTotal = recent.reduce((sum, d) => sum + d.count, 0);
    const olderTotal = older.reduce((sum, d) => sum + d.count, 0);
    if (olderTotal > 0 && recentTotal > olderTotal * 2) {
      alerts.push({
        disease: s.disease,
        type: "rapid_increase",
        message: `Rapid increase in ${s.disease} reports detected`,
        increase: Math.round((recentTotal / olderTotal - 1) * 100),
        recentCount: recentTotal,
      });
    }
    if (olderTotal === 0 && recentTotal >= 3) {
      alerts.push({
        disease: s.disease,
        type: "new_outbreak",
        message: `New ${s.disease} outbreak detected`,
        recentCount: recentTotal,
      });
    }
  }
  return alerts;
}

export async function getTimeSeriesData(filters: {
  district?: string;
  disease?: string;
  gnDivision?: string;
  days?: number;
}) {
  const matchQuery: Record<string, unknown> = {
    trustScore: { $gte: ALERT_CONFIG.trustScoreThreshold },
    createdAt: {
      $gte: new Date(Date.now() - (filters.days || 30) * 24 * 60 * 60 * 1000),
    },
  };
  if (filters.district) matchQuery.district = filters.district;
  if (filters.disease && filters.disease !== "all") matchQuery.disease = filters.disease;
  if (filters.gnDivision) matchQuery.gnDivision = filters.gnDivision;

  const timeSeriesRaw = await DiseaseReport.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          disease: "$disease",
        },
        count: { $sum: 1 },
        avgConfidence: { $avg: "$confidence" },
      },
    },
    { $sort: { "_id.date": 1 } },
  ]);

  const diseases = [...new Set(timeSeriesRaw.map((r) => r._id.disease))];
  const dates = [...new Set(timeSeriesRaw.map((r) => r._id.date))].sort();

  const series = diseases.map((disease) => {
    const diseaseData = timeSeriesRaw.filter((r) => r._id.disease === disease);
    const data = dates.map((date) => {
      const point = diseaseData.find((d) => d._id.date === date);
      return {
        date,
        count: point ? point.count : 0,
        avgConfidence: point ? Math.round(point.avgConfidence * 100) : 0,
      };
    });
    return {
      disease,
      data,
      total: diseaseData.reduce((sum, d) => sum + d.count, 0),
    };
  });

  return {
    dates,
    series: series.sort((a, b) => b.total - a.total),
    outbreakAlerts: detectOutbreaks(series),
    totalReports: timeSeriesRaw.reduce((sum, r) => sum + r.count, 0),
  };
}