import { Elysia } from "elysia";
import mongoose from "mongoose";
import { Alert } from "../../models/Alert";
import { CommunityAlert } from "../../models/CommunityAlert";
import { Notification } from "../../models/Notification";
import { Report } from "../../models/Report";
import { User } from "../../models/User";
import {
  authPlugin,
  requireAuth,
  requireAuthUser,
} from "../../plugins/auth";
import * as alertService from "../../services/alertService";

const AUTO_VERIFY_THRESHOLD = 0.95;
const ADVICE_FEE_CREDITS = Number(process.env.ADVICE_FEE_CREDITS || 40);

function apiError(e: unknown, set: { status?: number }) {
  const err = e as Error & { status?: number };
  set.status = err.status || 500;
  return { success: false, error: err.message, msg: err.message };
}

function forbid(set: { status?: number }, msg: string) {
  set.status = 403;
  return { success: false, msg };
}

async function createInstructorCaseNotifications(report: {
  _id: mongoose.Types.ObjectId;
  ai_prediction?: string;
  title?: string;
  confidence_score?: number;
}) {
  const instructors = await User.find({
    role: "officer",
    isApproved: true,
  }).select("_id");
  if (!instructors.length) return 0;

  await Notification.insertMany(
    instructors.map((officer) => ({
      recipientUserId: officer._id,
      recipientRole: "officer",
      type: "instructor_case",
      reportId: report._id,
      title: {
        en: "New Case Available for Analysis",
        si: "විශ්ලේෂණය සඳහා නව නඩුවක් ඇත",
      },
      message: {
        en: `${report.ai_prediction || report.title} (${Math.round((report.confidence_score || 0) * 100)}% confidence) needs instructor analysis.`,
        si: `${report.ai_prediction || report.title} (${Math.round((report.confidence_score || 0) * 100)}% විශ්වාසය) සඳහා නිලධාරී විශ්ලේෂණය අවශ්‍යයි.`,
      },
      severity: "warning",
    }))
  );
  return instructors.length;
}

async function syncDiseaseReportVerification(
  report: { diseaseReportId?: mongoose.Types.ObjectId },
  reviewerName: string,
  notes?: string
) {
  if (!report.diseaseReportId) return;
  await alertService.reviewReport(report.diseaseReportId.toString(), {
    status: "verified",
    reviewedBy: reviewerName,
    flaggedReason: notes,
  });
}

async function createFarmerAlert(
  report: mongoose.Document & {
    _id: mongoose.Types.ObjectId;
    report_type?: string;
    title?: string;
    description?: string;
    ai_prediction?: string;
    district: string;
    dsDivision: string;
    gnDivision: string;
    severity?: string;
    farmerId: mongoose.Types.ObjectId;
    farmerName?: string;
    farmerPhone?: string;
    verifiedBy?: mongoose.Types.ObjectId;
  }
) {
  const farmers = await User.find({
    role: "farmer",
    gnDivision: report.gnDivision,
    _id: { $ne: report.farmerId },
  }).select("_id");
  const farmerIds = farmers.map((f) => f._id);

  await Alert.create({
    alert_type: report.report_type || "disease",
    title: `Alert: ${report.title} detected in your area`,
    description: report.description,
    reportId: report._id,
    originalProblem: report.ai_prediction,
    district: report.district,
    dsDivision: report.dsDivision,
    gnDivision: report.gnDivision,
    severity: report.severity,
    recommendations: [
      "Monitor your crops closely for similar symptoms",
      `Contact farmer ${report.farmerName} at ${report.farmerPhone} for more details`,
      "Consult with local agricultural extension officer if symptoms detected",
    ],
    targetFarmers: farmerIds,
    publishedBy: report.verifiedBy,
    publishedDate: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    isActive: true,
  });

  await Report.findByIdAndUpdate(report._id, {
    alertSentToFarmers: true,
    alertSentDate: new Date(),
    affectedFarmersCount: farmerIds.length,
  });
}

async function createCommunityAlertFromReport(
  report: {
    ai_prediction?: string;
    title?: string;
    district: string;
    dsDivision: string;
    gnDivision: string;
    severity?: string;
    createdAt?: Date;
  },
  options: { source?: string } = {}
) {
  const disease = report.ai_prediction || report.title || "Unknown Disease";
  if (disease.toLowerCase().includes("healthy")) return;

  let crop = "Unknown";
  if (report.title) {
    const parts = report.title.split(" - ");
    if (parts.length > 1) crop = parts[0].trim();
  }

  const recommendation = {
    en: "Monitor your crops closely. Consult your local agricultural officer immediately.",
    si: `නිලධාරි සත්‍යාපිත: ${report.gnDivision} හි ${crop} බෝග වල ${disease} හඳුනාගෙන ඇත. ඔබේ බෝග සමීපව නිරීක්ෂණය කරන්න.`,
  };

  const existing = await CommunityAlert.findOne({
    disease,
    gnDivision: report.gnDivision,
    status: { $in: ["active", "monitoring"] },
  });

  if (existing) {
    existing.reportCount += 1;
    existing.lastUpdatedAt = new Date();
    if (existing.reportCount >= 21) existing.severity = "critical";
    else if (existing.reportCount >= 11) existing.severity = "high";
    else if (existing.reportCount >= 6) existing.severity = "medium";
    await existing.save();
  } else {
    await CommunityAlert.create({
      crop,
      disease,
      district: report.district,
      dsDivision: report.dsDivision,
      gnDivision: report.gnDivision,
      reportCount: 1,
      severity: report.severity || "medium",
      status: "active",
      firstReportedAt: report.createdAt || new Date(),
      lastUpdatedAt: new Date(),
      recommendation,
    });
  }

  const source = options.source === "ai_auto" ? "AI auto-verified" : "Instructor-verified";
  await Notification.create({
    targetDistrict: report.district,
    targetDsDivision: report.dsDivision,
    targetGnDivision: report.gnDivision,
    type: "disease_alert",
    title: {
      en: `⚠️ ${disease} Alert`,
      si: `⚠️ ${disease} අනතුරු ඇඟවීම`,
    },
    message: {
      en: `${source}: ${disease} detected in ${crop} in ${report.gnDivision}. ${recommendation.en}`,
      si: `${report.gnDivision} හි ${crop} බෝග වල ${disease} හඳුනාගෙන ඇත. ${recommendation.si}`,
    },
    severity: "warning",
  });
}

export const reportsController = new Elysia({ prefix: "/api/reports" })
  .use(authPlugin)
  .post("/submit", async ({ body, user, set }) => {
    try {
      const auth = requireAuth(user);
      if (auth.role !== "farmer") return forbid(set, "Only farmers can submit reports");

      const doc = await requireAuthUser(user);
      const farmerPhone = auth.phone || doc.phone;
      if (!farmerPhone) {
        set.status = 400;
        return {
          success: false,
          msg: "Phone number is required to submit a report. Please update your profile.",
        };
      }
      if (!doc.district || !doc.dsDivision || !doc.gnDivision) {
        set.status = 400;
        return {
          success: false,
          msg: "Location details are required to submit a report. Please update your profile.",
        };
      }

      const {
        title,
        description,
        image_url,
        ai_prediction,
        confidence_score,
        report_type,
      } = body as {
        title: string;
        description: string;
        image_url?: string;
        ai_prediction?: string;
        confidence_score?: number;
        report_type?: string;
      };

      const confidence = Number(confidence_score || 0);
      const isAutoVerified = confidence >= AUTO_VERIFY_THRESHOLD;

      const report = await Report.create({
        report_type: report_type || "disease",
        farmerId: auth.id,
        farmerName: auth.fullName || auth.username || "Farmer",
        farmerPhone,
        district: doc.district,
        dsDivision: doc.dsDivision,
        gnDivision: doc.gnDivision,
        title,
        description,
        image_url,
        ai_prediction,
        confidence_score: confidence,
        autoVerifiedByAI: isAutoVerified,
        status: isAutoVerified ? "verified" : "instructor_pending",
        verificationDate: isAutoVerified ? new Date() : undefined,
        verificationNotes: isAutoVerified
          ? `Auto-verified by AI (>= ${Math.round(AUTO_VERIFY_THRESHOLD * 100)}% confidence).`
          : undefined,
        assignmentStatus: isAutoVerified ? "closed" : "unassigned",
        adviceFeeCredits: ADVICE_FEE_CREDITS,
        paymentStatus: isAutoVerified ? "not_required" : "pending",
      });

      try {
        const diseaseSaveResult = await alertService.saveDiseaseReport({
          farmerId: auth.id,
          farmerUsername: auth.fullName || auth.username || "Farmer",
          crop: (title || "").split(" - ")[0]?.toLowerCase() || "rice",
          disease: ai_prediction || title || "Unknown",
          confidence,
          district: doc.district,
          dsDivision: doc.dsDivision,
          gnDivision: doc.gnDivision,
          treatment: "",
          verificationStatus: isAutoVerified ? "verified" : "pending",
        });
        if (diseaseSaveResult.report?._id) {
          report.diseaseReportId = diseaseSaveResult.report._id;
          await report.save();
        }
      } catch (diseaseErr) {
        console.error("Error creating DiseaseReport entry:", diseaseErr);
      }

      if (isAutoVerified) {
        await createFarmerAlert(report);
        await createCommunityAlertFromReport(report, { source: "ai_auto" });
        await Report.findByIdAndUpdate(report._id, {
          alertSentToFarmers: true,
          alertSentDate: new Date(),
        });
        set.status = 201;
        return {
          success: true,
          workflow: "auto_verified",
          msg: "Report auto-verified and disease alert sent to farmers in your GN division.",
          reportId: report._id,
          confidence,
        };
      }

      const notifiedCount = await createInstructorCaseNotifications(report);
      set.status = 201;
      return {
        success: true,
        workflow: "instructor_required",
        msg: "Report submitted. All registered agricultural instructors have been notified for paid analysis.",
        reportId: report._id,
        confidence,
        notifiedInstructors: notifiedCount,
      };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .get("/pending", async ({ user, set }) => {
    try {
      const auth = requireAuth(user);
      if (auth.role !== "officer") return forbid(set, "Only officers can view pending reports");

      const reports = await Report.find({
        status: "instructor_pending",
        assignmentStatus: "unassigned",
        confidence_score: { $lt: AUTO_VERIFY_THRESHOLD },
      })
        .populate("farmerId", "fullName email")
        .sort({ createdAt: -1 });

      return { success: true, reports, count: reports.length };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .get("/my-reports", async ({ user, set }) => {
    try {
      const auth = requireAuth(user);
      if (auth.role !== "farmer") return forbid(set, "Only farmers can view their own reports");

      const reports = await Report.find({ farmerId: auth.id })
        .select(
          "title description image_url ai_prediction confidence_score status verificationDate verificationNotes gnDivision createdAt autoVerifiedByAI assignedInstructorName assignmentStatus adviceText adviceFeeCredits paymentStatus adviceSubmittedAt"
        )
        .sort({ createdAt: -1 });

      return { success: true, reports, count: reports.length };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .get("/instructor/my-cases", async ({ user, set }) => {
    try {
      const auth = requireAuth(user);
      if (auth.role !== "officer") {
        return forbid(set, "Only agricultural instructors can view cases");
      }

      const reports = await Report.find({
        assignedInstructorId: auth.id,
        assignmentStatus: { $in: ["claimed", "analysing", "advice_submitted"] },
      }).sort({ claimedAt: -1, createdAt: -1 });

      return { success: true, reports, count: reports.length };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .get("/instructor/notifications", async ({ query, user, set }) => {
    try {
      const auth = requireAuth(user);
      if (auth.role !== "officer") {
        return forbid(set, "Only agricultural instructors can view notifications");
      }

      const limit = Math.min(Number((query as { limit?: string }).limit || 20), 100);
      const notifications = await Notification.find({
        recipientUserId: auth.id,
        recipientRole: "officer",
        type: { $in: ["instructor_case", "advice_update", "system"] },
        expiresAt: { $gt: new Date() },
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      const unreadCount = notifications.filter((n) => !n.read).length;
      return {
        success: true,
        notifications,
        unreadCount,
        count: notifications.length,
      };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .put("/instructor/notifications/:id/read", async ({ params, user, set }) => {
    try {
      const auth = requireAuth(user);
      if (auth.role !== "officer") {
        return forbid(set, "Only agricultural instructors can update notifications");
      }

      const notification = await Notification.findOneAndUpdate(
        {
          _id: params.id,
          recipientUserId: auth.id,
          recipientRole: "officer",
        },
        { $set: { read: true } },
        { new: true }
      );

      if (!notification) {
        set.status = 404;
        return { success: false, msg: "Notification not found" };
      }
      return { success: true, notification };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .get("/alerts/my-area", async ({ user, set }) => {
    try {
      const auth = requireAuth(user);
      if (auth.role !== "farmer") return forbid(set, "Only farmers can view alerts");

      const alerts = await Alert.find({
        gnDivision: auth.gnDivision,
        isActive: true,
        expiresAt: { $gt: Date.now() },
      })
        .populate("reportId", "title description ai_prediction")
        .populate("publishedBy", "fullName designation")
        .sort({ publishedDate: -1 });

      for (const alert of alerts) {
        const viewed = alert.viewedBy?.map((id) => id.toString()) || [];
        if (!viewed.includes(auth.id)) {
          alert.viewedBy = [
            ...(alert.viewedBy || []),
            new mongoose.Types.ObjectId(auth.id),
          ];
          await alert.save();
        }
      }

      return { success: true, alerts, count: alerts.length };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .get("/:id", async ({ params, user, set }) => {
    try {
      const auth = requireAuth(user);
      const report = await Report.findById(params.id)
        .populate("farmerId", "fullName email phone")
        .populate("verifiedBy", "fullName designation department");

      if (!report) {
        set.status = 404;
        return { success: false, msg: "Report not found" };
      }

      const ownerId =
        (report.farmerId as { _id?: mongoose.Types.ObjectId })?._id ||
        report.farmerId;
      if (
        ownerId?.toString() !== auth.id &&
        auth.role !== "officer"
      ) {
        return forbid(set, "Unauthorized");
      }

      return { success: true, report };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .put("/:id/verify", async ({ params, body, user, set }) => {
    try {
      const auth = requireAuth(user);
      if (auth.role !== "officer") return forbid(set, "Only officers can verify reports");

      const { status, verificationNotes, severity } = body as {
        status: string;
        verificationNotes?: string;
        severity?: string;
      };

      const report = await Report.findById(params.id);
      if (!report) {
        set.status = 404;
        return { success: false, msg: "Report not found" };
      }

      report.status = status;
      report.verifiedBy = auth.id as unknown as mongoose.Types.ObjectId;
      report.verifiedByName = auth.fullName;
      report.verificationDate = new Date();
      report.verificationNotes = verificationNotes;
      if (severity) report.severity = severity;
      await report.save();

      if (status === "verified") {
        await syncDiseaseReportVerification(
          report,
          auth.fullName || auth.username || "Agricultural Instructor",
          verificationNotes
        );
      }

      return { success: true, msg: `Report ${status} successfully`, report };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .post("/:id/claim", async ({ params, user, set }) => {
    try {
      const auth = requireAuth(user);
      if (auth.role !== "officer") {
        return forbid(set, "Only agricultural instructors can claim cases");
      }

      const report = await Report.findOneAndUpdate(
        {
          _id: params.id,
          status: "instructor_pending",
          assignmentStatus: "unassigned",
          confidence_score: { $lt: AUTO_VERIFY_THRESHOLD },
        },
        {
          $set: {
            assignedInstructorId: auth.id,
            assignedInstructorName: auth.fullName || auth.username,
            assignmentStatus: "claimed",
            claimedAt: new Date(),
            status: "claimed",
          },
        },
        { new: true }
      );

      if (!report) {
        set.status = 409;
        return {
          success: false,
          msg: "Case already claimed by another instructor or unavailable.",
        };
      }

      await Notification.create({
        recipientUserId: report.farmerId,
        recipientRole: "farmer",
        type: "advice_update",
        reportId: report._id,
        title: { en: "Your Case Was Claimed", si: "ඔබේ නඩුව භාරගෙන ඇත" },
        message: {
          en: `${report.assignedInstructorName} accepted your case and will start analysis soon.`,
          si: `${report.assignedInstructorName} ඔබගේ නඩුව භාරගෙන ඇත.`,
        },
        severity: "info",
      });

      return { success: true, msg: "Case claimed successfully", report };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .post("/:id/start-analysis", async ({ params, user, set }) => {
    try {
      const auth = requireAuth(user);
      if (auth.role !== "officer") {
        return forbid(set, "Only agricultural instructors can start analysis");
      }

      const report = await Report.findOneAndUpdate(
        {
          _id: params.id,
          assignedInstructorId: auth.id,
          assignmentStatus: { $in: ["claimed", "analysing"] },
        },
        {
          $set: {
            assignmentStatus: "analysing",
            status: "under_review",
            analysisStartedAt: new Date(),
          },
        },
        { new: true }
      );

      if (!report) {
        set.status = 404;
        return { success: false, msg: "Case not found or not assigned to you" };
      }
      return { success: true, msg: "Analysis started", report };
    } catch (e) {
      return apiError(e, set);
    }
  })
  .post("/:id/submit-advice", async ({ params, body, user, set }) => {
    try {
      const auth = requireAuth(user);
      if (auth.role !== "officer") {
        return forbid(set, "Only agricultural instructors can submit paid advice");
      }

      const { adviceText, verificationNotes } = body as {
        adviceText?: string;
        verificationNotes?: string;
      };
      if (!adviceText?.trim()) {
        set.status = 400;
        return { success: false, msg: "Advice text is required" };
      }

      const report = await Report.findOne({
        _id: params.id,
        assignedInstructorId: auth.id,
        assignmentStatus: { $in: ["claimed", "analysing"] },
      });

      if (!report) {
        set.status = 404;
        return { success: false, msg: "Case not found or not assigned to you" };
      }

      const fee = Number(report.adviceFeeCredits || ADVICE_FEE_CREDITS);
      const farmer = await User.findById(report.farmerId);
      const instructor = await User.findById(auth.id);
      if (!farmer || !instructor) {
        set.status = 404;
        return { success: false, msg: "Farmer or instructor not found" };
      }
      if ((farmer.credits || 0) < fee) {
        set.status = 403;
        return {
          success: false,
          msg: `Farmer has insufficient credits for paid advice (${fee} required).`,
          requiredCredits: fee,
          farmerCredits: farmer.credits || 0,
        };
      }

      farmer.credits = (farmer.credits || 0) - fee;
      instructor.credits = (instructor.credits || 0) + fee;
      await farmer.save();
      await instructor.save();

      report.adviceText = adviceText.trim();
      report.adviceSubmittedAt = new Date();
      report.assignmentStatus = "advice_submitted";
      report.status = "advice_submitted";
      report.paymentStatus = "completed";
      report.paymentCompletedAt = new Date();
      report.verifiedBy = auth.id as unknown as mongoose.Types.ObjectId;
      report.verifiedByName = auth.fullName || auth.username;
      report.verificationDate = new Date();
      report.verificationNotes =
        verificationNotes || "Verified through instructor paid analysis.";
      await report.save();

      await syncDiseaseReportVerification(
        report,
        report.verifiedByName!,
        report.verificationNotes
      );

      await Notification.create({
        recipientUserId: report.farmerId,
        recipientRole: "farmer",
        type: "advice_update",
        reportId: report._id,
        title: { en: "Paid Advice Delivered", si: "ගෙවන උපදෙස් ලබාදී ඇත" },
        message: {
          en: `Your case was completed by ${report.verifiedByName}. ${fee} credits were deducted and advice is ready.`,
          si: `${report.verifiedByName} විසින් ඔබගේ නඩුව සම්පූර්ණ කර ඇත. ${fee} credits අඩු කර ඇත.`,
        },
        severity: "info",
      });

      return {
        success: true,
        msg: "Advice submitted and credits transferred successfully",
        report,
      };
    } catch (e) {
      return apiError(e, set);
    }
  });