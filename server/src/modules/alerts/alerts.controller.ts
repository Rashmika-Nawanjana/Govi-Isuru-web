import { Elysia } from "elysia";
import { CommunityAlert } from "../../models/CommunityAlert";
import { DiseaseReport } from "../../models/DiseaseReport";
import { authPlugin, requireAuth } from "../../plugins/auth";
import * as alertService from "../../services/alertService";

function apiError(e: unknown, set: { status?: number }) {
  const err = e as Error & { status?: number };
  set.status = err.status || 500;
  return { error: err.message || "Server error" };
}

function qStr(query: Record<string, unknown>, key: string) {
  const v = query[key];
  return typeof v === "string" ? v : undefined;
}

export const alertsController = new Elysia({ prefix: "/api/alerts" })
  .use(authPlugin)
  .post("/disease-report", async ({ body, user, set }) => {
    try {
      const data = body as {
        crop?: string;
        disease: string;
        confidence?: number;
        district?: string;
        dsDivision?: string;
        gnDivision: string;
        treatment?: string;
        farmerUsername?: string;
      };

      if (!data.disease || !data.gnDivision) {
        set.status = 400;
        return { error: "Disease and GN Division are required" };
      }

      const { report } = await alertService.saveDiseaseReport({
        farmerId: user?.id || null,
        farmerUsername: data.farmerUsername || user?.username || "Anonymous",
        crop: data.crop || "Rice",
        disease: data.disease,
        confidence: data.confidence || 0,
        district: data.district || "Unknown",
        dsDivision: data.dsDivision || "Unknown",
        gnDivision: data.gnDivision,
        treatment: data.treatment || "",
      });

      set.status = 201;
      return {
        success: true,
        message: "Disease report saved successfully",
        report: {
          id: report._id,
          disease: report.disease,
          location: report.gnDivision,
        },
        alertsTriggered: 0,
        alerts: [],
      };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .get("/active", async ({ query, set }) => {
    try {
      const gnDivision = qStr(query as Record<string, unknown>, "gnDivision");
      const dsDivision = qStr(query as Record<string, unknown>, "dsDivision");
      const district = qStr(query as Record<string, unknown>, "district");

      if (!gnDivision && !dsDivision && !district) {
        set.status = 400;
        return {
          error:
            "At least one location parameter required (gnDivision, dsDivision, or district)",
        };
      }

      const alerts = await alertService.getActiveAlerts(
        gnDivision,
        dsDivision,
        district
      );

      return {
        success: true,
        count: alerts.length,
        alerts: alerts.map((alert) => ({
          id: alert._id,
          crop: alert.crop,
          disease: alert.disease,
          district: alert.district,
          dsDivision: alert.dsDivision,
          gnDivision: alert.gnDivision,
          reportCount: alert.reportCount,
          severity: alert.severity,
          status: alert.status,
          firstReportedAt: alert.firstReportedAt,
          lastUpdatedAt: alert.lastUpdatedAt,
          recommendation: alert.recommendation,
        })),
      };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .get("/notifications", async ({ query, set }) => {
    try {
      const gnDivision = qStr(query as Record<string, unknown>, "gnDivision");
      if (!gnDivision) {
        set.status = 400;
        return { error: "GN Division is required" };
      }

      const limit = Number.parseInt(
        qStr(query as Record<string, unknown>, "limit") || "10",
        10
      );
      const notifications = await alertService.getNotifications(gnDivision, limit);

      return { success: true, count: notifications.length, notifications };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .put("/notifications/:id/read", async ({ params, user, set }) => {
    try {
      requireAuth(user);
      const notification = await alertService.markNotificationRead(params.id);
      if (!notification) {
        set.status = 404;
        return { error: "Notification not found" };
      }
      return { success: true, notification };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .get("/stats", async ({ query, set }) => {
    try {
      const district = qStr(query as Record<string, unknown>, "district");
      const matchQuery: Record<string, unknown> = { status: "active" };
      if (district) matchQuery.district = district;

      const stats = await CommunityAlert.aggregate([
        { $match: matchQuery },
        { $group: { _id: "$severity", count: { $sum: 1 } } },
      ]);

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const totalReports = await DiseaseReport.countDocuments({
        createdAt: { $gte: weekAgo },
      });

      const topDiseases = await DiseaseReport.aggregate([
        { $match: { createdAt: { $gte: weekAgo } } },
        { $group: { _id: "$disease", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]);

      return {
        success: true,
        stats: {
          alertsBySeverity: stats,
          totalReportsThisWeek: totalReports,
          topDiseases,
        },
      };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .get("/history", async ({ query, set }) => {
    try {
      const q = query as Record<string, unknown>;
      const filter: Record<string, unknown> = {};
      if (qStr(q, "gnDivision")) filter.gnDivision = qStr(q, "gnDivision");
      if (qStr(q, "dsDivision")) filter.dsDivision = qStr(q, "dsDivision");
      if (qStr(q, "district")) filter.district = qStr(q, "district");

      const limit = Number.parseInt(qStr(q, "limit") || "20", 10);
      const alerts = await CommunityAlert.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit);

      return { success: true, count: alerts.length, alerts };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .get("/heatmap", async ({ query, set }) => {
    try {
      const q = query as Record<string, unknown>;
      const heatmapData = await alertService.getHeatmapData({
        district: qStr(q, "district"),
        disease: qStr(q, "disease"),
        severity: qStr(q, "severity"),
        days: Number.parseInt(qStr(q, "days") || "30", 10),
      });

      return { success: true, count: heatmapData.length, data: heatmapData };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .get("/timeseries", async ({ query, set }) => {
    try {
      const q = query as Record<string, unknown>;
      const timeSeriesData = await alertService.getTimeSeriesData({
        district: qStr(q, "district"),
        disease: qStr(q, "disease"),
        gnDivision: qStr(q, "gnDivision"),
        days: Number.parseInt(qStr(q, "days") || "30", 10),
      });

      return { success: true, ...timeSeriesData };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .get("/flagged", async ({ query, user, set }) => {
    try {
      requireAuth(user);
      const q = query as Record<string, unknown>;
      const reports = await alertService.getFlaggedReports({
        district: qStr(q, "district"),
        limit: Number.parseInt(qStr(q, "limit") || "50", 10),
      });

      return { success: true, count: reports.length, reports };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .put("/reports/:id/review", async ({ params, body, user, set }) => {
    try {
      const auth = requireAuth(user);
      const { status, flaggedReason } = body as {
        status: string;
        flaggedReason?: string;
      };

      const allowed = [
        "pending",
        "under_review",
        "verified",
        "rejected",
        "flagged",
        "needs_field_visit",
      ];
      if (!allowed.includes(status)) {
        set.status = 400;
        return {
          error:
            "Invalid status. Must be pending, under_review, verified, rejected, flagged, or needs_field_visit",
        };
      }

      const report = await alertService.reviewReport(params.id, {
        status,
        flaggedReason,
        reviewedBy: auth.username || "admin",
      });

      if (!report) {
        set.status = 404;
        return { error: "Report not found" };
      }

      return { success: true, message: `Report ${status}`, report };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .get("/outbreak-summary", async ({ query, set }) => {
    try {
      const q = query as Record<string, unknown>;
      const daysNum = Number.parseInt(qStr(q, "days") || "7", 10);
      const district = qStr(q, "district");
      const gnDivision = qStr(q, "gnDivision");
      const timeWindow = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000);

      const matchQuery: Record<string, unknown> = { createdAt: { $gte: timeWindow } };
      if (district) matchQuery.district = district;
      if (gnDivision) matchQuery.gnDivision = gnDivision;

      const [totalReports, diseaseBreakdownRaw, severityBreakdown, locationBreakdownRaw] =
        await Promise.all([
          DiseaseReport.countDocuments(matchQuery),
          DiseaseReport.aggregate([
            { $match: { ...matchQuery, disease: { $nin: [null, ""] } } },
            { $group: { _id: "$disease", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ]),
          DiseaseReport.aggregate([
            { $match: matchQuery },
            { $group: { _id: "$severity", count: { $sum: 1 } } },
          ]),
          DiseaseReport.aggregate([
            { $match: { ...matchQuery, gnDivision: { $nin: [null, ""] } } },
            {
              $group: {
                _id: "$gnDivision",
                count: { $sum: 1 },
                district: { $first: "$district" },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 20 },
          ]),
        ]);

      let diseaseBreakdown = diseaseBreakdownRaw;
      let locationBreakdown = locationBreakdownRaw;

      if (diseaseBreakdown.length === 0 || locationBreakdown.length === 0) {
        const alertMatchQuery: Record<string, unknown> = {
          status: { $in: ["active", "monitoring"] },
        };
        if (district) alertMatchQuery.district = district;
        if (gnDivision) alertMatchQuery.gnDivision = gnDivision;

        const [alertDiseaseBreakdown, alertLocationBreakdown] = await Promise.all([
          CommunityAlert.aggregate([
            { $match: alertMatchQuery },
            { $group: { _id: "$disease", count: { $sum: "$reportCount" } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ]),
          CommunityAlert.aggregate([
            { $match: alertMatchQuery },
            {
              $group: {
                _id: "$gnDivision",
                count: { $sum: "$reportCount" },
                district: { $first: "$district" },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 20 },
          ]),
        ]);

        if (diseaseBreakdown.length === 0) diseaseBreakdown = alertDiseaseBreakdown;
        if (locationBreakdown.length === 0) locationBreakdown = alertLocationBreakdown;
      }

      const activeAlerts = await CommunityAlert.countDocuments({
        status: "active",
        ...(district ? { district } : {}),
        ...(gnDivision ? { gnDivision } : {}),
      });

      return {
        success: true,
        summary: {
          totalReports,
          activeAlerts,
          affectedLocations: locationBreakdown.length,
          timeRange: `Last ${daysNum} days`,
          diseaseBreakdown: diseaseBreakdown.map((d) => ({
            disease: d._id,
            count: d.count,
          })),
          severityBreakdown: severityBreakdown.map((s) => ({
            severity: s._id,
            count: s.count,
          })),
          diseases: diseaseBreakdown.map((d) => ({ disease: d._id, count: d.count })),
          locations: locationBreakdown.map((l) => ({
            name: l._id,
            gnDivision: l._id,
            district: l.district,
            count: l.count,
          })),
          topLocations: locationBreakdown.map((l) => ({
            gnDivision: l._id,
            district: l.district || l._id,
            count: l.count,
          })),
        },
      };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .get("/nationwide-diseases", async ({ query, set }) => {
    try {
      const q = query as Record<string, unknown>;
      const daysNum = Number.parseInt(qStr(q, "days") || "30", 10);
      const pageNum = Number.parseInt(qStr(q, "page") || "1", 10);
      const limitNum = Math.min(Number.parseInt(qStr(q, "limit") || "50", 10), 100);
      const skip = (pageNum - 1) * limitNum;
      const timeWindow = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000);

      const matchQuery: Record<string, unknown> = {
        verificationStatus: "verified",
        createdAt: { $gte: timeWindow },
        disease: { $nin: ["Healthy", "healthy"] },
      };

      const district = qStr(q, "district");
      const crop = qStr(q, "crop");
      const disease = qStr(q, "disease");
      if (district) matchQuery.district = district;
      if (crop) matchQuery.crop = { $regex: new RegExp(crop, "i") };
      if (disease && disease !== "Healthy" && disease !== "නිරෝගී") {
        matchQuery.disease = { $regex: new RegExp(disease, "i"), $nin: ["Healthy", "healthy"] };
      }

      const [reports, totalCount, districtSummary, diseaseSummary] = await Promise.all([
        DiseaseReport.find(matchQuery)
          .select(
            "crop disease district dsDivision gnDivision severity confidence verificationStatus reviewedBy reviewedAt createdAt coordinates"
          )
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        DiseaseReport.countDocuments(matchQuery),
        DiseaseReport.aggregate([
          { $match: matchQuery },
          {
            $group: {
              _id: "$district",
              count: { $sum: 1 },
              diseases: { $addToSet: "$disease" },
              latestReport: { $max: "$createdAt" },
            },
          },
          { $sort: { count: -1 } },
        ]),
        DiseaseReport.aggregate([
          { $match: matchQuery },
          {
            $group: {
              _id: "$disease",
              count: { $sum: 1 },
              districts: { $addToSet: "$district" },
              avgConfidence: { $avg: "$confidence" },
            },
          },
          { $sort: { count: -1 } },
        ]),
      ]);

      return {
        success: true,
        totalCount,
        page: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        reports: reports.map((r) => ({
          id: r._id,
          crop: r.crop,
          disease: r.disease,
          district: r.district,
          dsDivision: r.dsDivision,
          gnDivision: r.gnDivision,
          severity: r.severity,
          confidence: r.confidence,
          verifiedBy: r.reviewedBy || "Officer",
          verifiedAt: r.reviewedAt,
          reportedAt: r.createdAt,
          coordinates: r.coordinates,
        })),
        districtSummary: districtSummary.map((d) => ({
          district: d._id,
          count: d.count,
          diseases: d.diseases,
          latestReport: d.latestReport,
        })),
        diseaseSummary: diseaseSummary.map((d) => ({
          disease: d._id,
          count: d.count,
          districts: d.districts,
          avgConfidence: Math.round((d.avgConfidence || 0) * 100),
        })),
      };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .put("/:id/resolve", async ({ params, user, set }) => {
    try {
      requireAuth(user);
      const alert = await alertService.resolveAlert(params.id);
      if (!alert) {
        set.status = 404;
        return { error: "Alert not found" };
      }
      return { success: true, message: "Alert resolved", alert };
    } catch (e) {
      return apiError(e, set);
    }
  });