import { Elysia, t } from "elysia";
import { OfficerActionLog } from "../../models/OfficerActionLog";
import { DiseaseReport } from "../../models/DiseaseReport";
import { Alert } from "../../models/Alert";
import { authPlugin, requireAuth, type AuthUser } from "../../plugins/auth";
import {
  PRIORITY_CONFIG,
  getActionLogs,
  getEscalationCandidates,
  getReportsForReview,
  getVerificationStats,
  logAction,
  updateReportPriority,
  updateReportStatus,
} from "./officer.service";

const OFFICER_ROLES = ["officer", "admin", "moderator"] as const;

function requireOfficer(user: AuthUser | null) {
  const auth = requireAuth(user);
  if (!OFFICER_ROLES.includes(auth.role as (typeof OFFICER_ROLES)[number])) {
    const err = new Error("Officer access required");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  return auth;
}

export const officerController = new Elysia({ prefix: "/api/officer" })
  .use(authPlugin)
  .get("/dashboard", async ({ user, set }) => {
    try {
      const auth = requireOfficer(user);
      const district = auth.district;
      const [pendingReports, activeAlerts, verifiedCount] = await Promise.all([
        DiseaseReport.countDocuments({
          district,
          verificationStatus: { $in: ["pending", "under_review"] },
        }),
        Alert.countDocuments({ district, isActive: true }),
        DiseaseReport.countDocuments({ district, verificationStatus: "verified" }),
      ]);
      return {
        district,
        pendingReports,
        activeAlerts,
        verifiedCount,
      };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 401;
      return { error: err.message };
    }
  })
  .get("/reports/queue", async ({ user, set }) => {
    try {
      const auth = requireOfficer(user);
      const reports = await DiseaseReport.find({
        district: auth.district,
        verificationStatus: {
          $in: ["pending", "under_review", "needs_field_visit"],
        },
      })
        .sort({ createdAt: -1 })
        .limit(50);
      return { reports };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 401;
      return { error: err.message };
    }
  })
  .get("/reports", async ({ user, query, set }) => {
    try {
      const auth = requireOfficer(user);
      const q = query as {
        status?: string;
        priority?: string;
        limit?: string;
      };
      const reports = await getReportsForReview({
        district: auth.district,
        status: q.status,
        priority: q.priority,
        limit: parseInt(q.limit || "100", 10),
      });
      return { success: true, count: reports.length, reports };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 401;
      return { error: err.message };
    }
  })
  .put(
    "/reports/:id/status",
    async ({ user, params, body, request, set }) => {
      try {
        const auth = requireOfficer(user);
        const { status, reason, notes, priority } = body as {
          status: string;
          reason?: string;
          notes?: string;
          priority?: string;
        };
        const validStatuses = [
          "pending",
          "under_review",
          "verified",
          "rejected",
          "flagged",
          "needs_field_visit",
        ];
        if (!validStatuses.includes(status)) {
          set.status = 400;
          return {
            error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
          };
        }
        const report = await updateReportStatus(
          params.id,
          status,
          {
            userId: auth.id,
            username: auth.username,
            district: auth.district,
          },
          {
            reason,
            notes,
            priority,
            ipAddress: request.headers.get("x-forwarded-for") || undefined,
            userAgent: request.headers.get("user-agent") || undefined,
          }
        );
        return {
          success: true,
          message: `Report status updated to ${status}`,
          report,
        };
      } catch (e) {
        const err = e as Error & { status?: number };
        const msg = err.message || "Failed to update report status";
        set.status = msg.includes("not found") ? 404 : 400;
        return { error: msg };
      }
    },
    { params: t.Object({ id: t.String() }) }
  )
  .put(
    "/reports/:id/priority",
    async ({ user, params, body, set }) => {
      try {
        const auth = requireOfficer(user);
        const { priority, reason } = body as {
          priority: string;
          reason?: string;
        };
        const validPriorities = ["info", "low", "medium", "high", "emergency"];
        if (!validPriorities.includes(priority)) {
          set.status = 400;
          return {
            error: `Invalid priority. Must be one of: ${validPriorities.join(", ")}`,
          };
        }
        const report = await updateReportPriority(
          params.id,
          priority,
          {
            userId: auth.id,
            username: auth.username,
            district: auth.district,
          },
          { reason }
        );
        return {
          success: true,
          message: `Report priority updated to ${priority}`,
          report,
        };
      } catch (e) {
        const err = e as Error & { status?: number };
        const msg = err.message || "Failed to update report priority";
        set.status = msg.includes("not found") ? 404 : 400;
        return { error: msg };
      }
    },
    { params: t.Object({ id: t.String() }) }
  )
  .get("/action-logs", async ({ user, query, set }) => {
    try {
      const auth = requireOfficer(user);
      const q = query as {
        targetId?: string;
        actionType?: string;
        days?: string;
        limit?: string;
      };
      const logs = await getActionLogs({
        district: auth.district,
        targetId: q.targetId,
        actionType: q.actionType,
        days: parseInt(q.days || "30", 10),
        limit: parseInt(q.limit || "100", 10),
      });
      return { success: true, count: logs.length, logs };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 401;
      return { error: err.message };
    }
  })
  .get("/stats", async ({ user, set }) => {
    try {
      const auth = requireOfficer(user);
      const stats = await getVerificationStats(auth.district || null);
      return { success: true, stats };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 401;
      return { error: err.message };
    }
  })
  .get("/escalations", async ({ user, set }) => {
    try {
      const auth = requireOfficer(user);
      const escalations = await getEscalationCandidates(auth.district || null);
      return {
        success: true,
        count: escalations.length,
        escalations,
      };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 401;
      return { error: err.message };
    }
  })
  .get(
    "/report/:id/history",
    async ({ user, params, set }) => {
      try {
        requireOfficer(user);
        const logs = await OfficerActionLog.find({
          targetId: params.id,
          targetType: "disease_report",
        })
          .sort({ createdAt: -1 })
          .lean();
        return { success: true, count: logs.length, history: logs };
      } catch (e) {
        const err = e as Error & { status?: number };
        set.status = err.status || 401;
        return { error: err.message };
      }
    },
    { params: t.Object({ id: t.String() }) }
  )
  .post(
    "/reports/:id/note",
    async ({ user, params, body, set }) => {
      try {
        const auth = requireOfficer(user);
        const { note } = body as { note?: string };
        if (!note?.trim()) {
          set.status = 400;
          return { error: "Note content is required" };
        }
        await logAction({
          officerId: auth.id,
          officerUsername: auth.username,
          officerDistrict: auth.district,
          actionType: "add_note",
          targetType: "disease_report",
          targetId: params.id,
          notes: note,
        });
        return { success: true, message: "Note added successfully" };
      } catch (e) {
        const err = e as Error & { status?: number };
        set.status = err.status || 500;
        return { error: err.message || "Failed to add note" };
      }
    },
    { params: t.Object({ id: t.String() }) }
  )
  .get("/priority-config", async ({ user, set }) => {
    try {
      requireOfficer(user);
      return { success: true, config: PRIORITY_CONFIG };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 401;
      return { error: err.message };
    }
  });