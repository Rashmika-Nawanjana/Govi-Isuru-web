import { OfficerActionLog } from "../../models/OfficerActionLog";
import { DiseaseReport as Report } from "../../models/DiseaseReport";

export const PRIORITY_CONFIG = {
  emergency: {
    color: "red",
    label: "Emergency",
    labelSi: "හදිසි",
    autoEscalateHours: 2,
  },
  high: {
    color: "orange",
    label: "High Priority",
    labelSi: "ඉහළ ප්‍රමුඛතාව",
    autoEscalateHours: 12,
  },
  medium: {
    color: "yellow",
    label: "Medium",
    labelSi: "මධ්‍යම",
    autoEscalateHours: 48,
  },
  low: {
    color: "blue",
    label: "Low",
    labelSi: "අඩු",
    autoEscalateHours: null as number | null,
  },
  info: {
    color: "gray",
    label: "Info",
    labelSi: "තොරතුරු",
    autoEscalateHours: null as number | null,
  },
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: [
    "under_review",
    "verified",
    "rejected",
    "flagged",
    "needs_field_visit",
  ],
  under_review: ["verified", "rejected", "flagged", "needs_field_visit"],
  flagged: ["under_review", "verified", "rejected", "needs_field_visit"],
  needs_field_visit: ["under_review", "verified", "rejected"],
  verified: [],
  rejected: ["under_review"],
};

type OfficerData = {
  userId: string;
  username: string;
  district?: string;
};

type LogActionData = {
  officerId: string;
  officerUsername: string;
  officerDistrict?: string;
  actionType: string;
  targetType: string;
  targetId: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  reason?: string | null;
  notes?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function logAction(actionData: LogActionData) {
  try {
    const log = await OfficerActionLog.create({
      officerId: actionData.officerId,
      officerUsername: actionData.officerUsername,
      officerDistrict: actionData.officerDistrict || "Unknown",
      actionType: actionData.actionType,
      targetType: actionData.targetType,
      targetId: actionData.targetId,
      previousStatus: actionData.previousStatus ?? null,
      newStatus: actionData.newStatus ?? null,
      reason: actionData.reason ?? null,
      notes: actionData.notes ?? null,
      ipAddress: actionData.ipAddress ?? null,
      userAgent: actionData.userAgent ?? null,
    });
    return log;
  } catch (error) {
    console.error("Error logging officer action:", error);
    return null;
  }
}

export async function updateReportStatus(
  reportId: string,
  newStatus: string,
  officerData: OfficerData,
  options: {
    reason?: string;
    notes?: string;
    priority?: string;
    ipAddress?: string;
    userAgent?: string;
  } = {}
) {
  const report = await Report.findById(reportId);
  if (!report) {
    throw new Error("Report not found");
  }

  const currentStatus = report.verificationStatus;
  const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowedTransitions.includes(newStatus) && currentStatus !== newStatus) {
    throw new Error(
      `Invalid status transition from ${currentStatus} to ${newStatus}`
    );
  }

  report.verificationStatus = newStatus;
  report.adminReviewed = true;
  report.reviewedBy = officerData.username;
  report.reviewedAt = new Date();
  if (options.reason) report.flaggedReason = options.reason;
  if (options.priority) report.priority = options.priority;
  await report.save();

  const actionTypeMap: Record<string, string> = {
    verified: "verify_report",
    rejected: "reject_report",
    flagged: "flag_report",
    needs_field_visit: "request_field_visit",
    under_review: "start_review",
  };

  await logAction({
    officerId: officerData.userId,
    officerUsername: officerData.username,
    officerDistrict: officerData.district,
    actionType: actionTypeMap[newStatus] || "verify_report",
    targetType: "disease_report",
    targetId: reportId,
    previousStatus: currentStatus,
    newStatus,
    reason: options.reason,
    notes: options.notes,
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
  });

  return report;
}

export async function updateReportPriority(
  reportId: string,
  newPriority: string,
  officerData: OfficerData,
  options: { reason?: string; notes?: string } = {}
) {
  const report = await Report.findById(reportId);
  if (!report) {
    throw new Error("Report not found");
  }

  const previousPriority = report.priority;
  report.priority = newPriority;
  if (newPriority === "emergency" && previousPriority !== "emergency") {
    report.escalatedAt = new Date();
    report.escalatedBy = officerData.username;
  }
  await report.save();

  await logAction({
    officerId: officerData.userId,
    officerUsername: officerData.username,
    officerDistrict: officerData.district,
    actionType: "update_priority",
    targetType: "disease_report",
    targetId: reportId,
    previousStatus: previousPriority,
    newStatus: newPriority,
    reason: options.reason,
    notes: options.notes,
  });

  return report;
}

export async function getReportsForReview(filters: {
  district?: string;
  status?: string;
  priority?: string;
  limit?: number;
}) {
  const query: Record<string, unknown> = {};

  if (filters.district) query.district = filters.district;
  if (filters.status && filters.status !== "all") {
    query.verificationStatus = filters.status;
  }
  if (filters.priority && filters.priority !== "all") {
    query.priority = filters.priority;
  }
  if (!filters.status) {
    query.verificationStatus = {
      $in: ["pending", "flagged", "under_review", "needs_field_visit"],
    };
  }

  const reports = await Report.find(query)
    .sort({ priority: -1, createdAt: -1 })
    .limit(filters.limit || 100)
    .lean();

  const priorityOrder: Record<string, number> = {
    emergency: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };
  reports.sort((a, b) => {
    const aPriority = priorityOrder[a.priority ?? "medium"] ?? 2;
    const bPriority = priorityOrder[b.priority ?? "medium"] ?? 2;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return reports;
}

export async function getActionLogs(filters: {
  district?: string;
  targetId?: string;
  actionType?: string;
  days?: number;
  limit?: number;
}) {
  const query: Record<string, unknown> = {};

  if (filters.district) query.officerDistrict = filters.district;
  if (filters.targetId) query.targetId = filters.targetId;
  if (filters.actionType) query.actionType = filters.actionType;
  if (filters.days) {
    query.createdAt = {
      $gte: new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000),
    };
  }

  return OfficerActionLog.find(query)
    .sort({ createdAt: -1 })
    .limit(filters.limit || 100)
    .lean();
}

export async function getVerificationStats(district?: string | null) {
  const matchQuery: Record<string, unknown> = {};
  if (district) matchQuery.district = district;

  const statusStats = await Report.aggregate([
    { $match: matchQuery },
    { $group: { _id: "$verificationStatus", count: { $sum: 1 } } },
  ]);

  const priorityStats = await Report.aggregate([
    {
      $match: {
        ...matchQuery,
        verificationStatus: { $nin: ["verified", "rejected"] },
      },
    },
    { $group: { _id: "$priority", count: { $sum: 1 } } },
  ]);

  const pendingCount = await Report.countDocuments({
    ...matchQuery,
    verificationStatus: {
      $in: ["pending", "flagged", "needs_field_visit"],
    },
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const reviewedToday = await Report.countDocuments({
    ...matchQuery,
    reviewedAt: { $gte: todayStart },
    adminReviewed: true,
  });

  return {
    statusBreakdown: statusStats.reduce(
      (acc: Record<string, number>, s: { _id: string; count: number }) => {
        acc[s._id] = s.count;
        return acc;
      },
      {}
    ),
    priorityBreakdown: priorityStats.reduce(
      (acc: Record<string, number>, p: { _id: string; count: number }) => {
        acc[p._id] = p.count;
        return acc;
      },
      {}
    ),
    pendingCount,
    reviewedToday,
    priorityConfig: PRIORITY_CONFIG,
  };
}

export async function getEscalationCandidates(district?: string | null) {
  const now = new Date();
  const candidates: Array<Record<string, unknown>> = [];

  for (const [priority, config] of Object.entries(PRIORITY_CONFIG)) {
    if (config.autoEscalateHours == null) continue;

    const threshold = new Date(
      now.getTime() - config.autoEscalateHours * 60 * 60 * 1000
    );

    const query: Record<string, unknown> = {
      priority,
      verificationStatus: { $in: ["pending", "under_review"] },
      createdAt: { $lte: threshold },
    };
    if (district) query.district = district;

    const reports = await Report.find(query)
      .select("_id disease district gnDivision priority createdAt")
      .lean();

    candidates.push(
      ...reports.map((r) => ({
        ...r,
        hoursOverdue: Math.round(
          (now.getTime() - new Date(r.createdAt).getTime()) /
            (1000 * 60 * 60) -
            config.autoEscalateHours!
        ),
      }))
    );
  }

  return candidates.sort(
    (a, b) => (b.hoursOverdue as number) - (a.hoursOverdue as number)
  );
}