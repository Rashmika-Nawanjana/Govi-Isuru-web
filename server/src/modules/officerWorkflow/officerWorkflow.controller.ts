import { Elysia } from "elysia";
import { authPlugin, requireOfficer } from "../../plugins/auth";
import * as performance from "../../services/officerPerformance.service";
import * as fieldVisit from "../../services/fieldVisit.service";
import * as internalNote from "../../services/internalNote.service";

function officerContext(user: ReturnType<typeof requireOfficer>) {
  return {
    userId: user.id,
    username: user.username,
    district: user.district,
  };
}

export const officerWorkflowController = new Elysia({
  prefix: "/api/officer-workflow",
})
  .use(authPlugin)
  .get("/performance", async ({ user, query, set }) => {
    try {
      const auth = requireOfficer(user);
      const days = parseInt(String(query.days || "30"), 10) || 30;
      const data = await performance.getOfficerPerformance(auth.id, { days });
      return { success: true, performance: data };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message || "Failed to fetch performance data" };
    }
  })
  .get("/performance/monthly", async ({ user, set }) => {
    try {
      const auth = requireOfficer(user);
      const comparison = await performance.getMonthlyComparison(auth.id);
      return { success: true, comparison };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message || "Failed to fetch monthly comparison" };
    }
  })
  .get("/leaderboard", async ({ user, query, set }) => {
    try {
      requireOfficer(user);
      const days = parseInt(String(query.days || "30"), 10) || 30;
      const limit = parseInt(String(query.limit || "10"), 10) || 10;
      const leaderboard = await performance.getOfficerLeaderboard({ days, limit });
      return { success: true, leaderboard };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message || "Failed to fetch leaderboard" };
    }
  })
  .post("/field-visits", async ({ user, body, set }) => {
    try {
      const auth = requireOfficer(user);
      const b = body as {
        reportId?: string;
        purpose?: string;
        instructions?: string;
        priority?: string;
        scheduledDate?: string;
        scheduledTime?: string;
      };
      if (!b.reportId) {
        set.status = 400;
        return { error: "Report ID is required" };
      }
      const visit = await fieldVisit.createFieldVisit(
        b.reportId,
        { userId: auth.id, username: auth.username },
        b
      );
      set.status = 201;
      return { success: true, message: "Field visit scheduled", visit };
    } catch (e) {
      const err = e as Error;
      console.error("create field visit", err);
      set.status = err.message.includes("not found") ? 404 : 500;
      return { error: err.message || "Failed to create field visit" };
    }
  })
  .get("/field-visits", async ({ user, query, set }) => {
    try {
      const auth = requireOfficer(user);
      const result = await fieldVisit.getFieldVisits({
        district: auth.district,
        status: query.status as string | undefined,
        priority: query.priority as string | undefined,
        limit: parseInt(String(query.limit || "50"), 10) || 50,
        offset: parseInt(String(query.offset || "0"), 10) || 0,
      });
      return { success: true, ...result };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message || "Failed to fetch field visits" };
    }
  })
  .get("/field-visits/:id", async ({ user, params, set }) => {
    try {
      requireOfficer(user);
      const visit = await fieldVisit.getFieldVisitById(params.id);
      if (!visit) {
        set.status = 404;
        return { error: "Field visit not found" };
      }
      return { success: true, visit };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message || "Failed to fetch field visit" };
    }
  })
  .put("/field-visits/:id/status", async ({ user, params, body, set }) => {
    try {
      const auth = requireOfficer(user);
      const { status } = body as { status?: string };
      const valid = ["scheduled", "in_progress", "completed", "cancelled", "postponed"];
      if (!status || !valid.includes(status)) {
        set.status = 400;
        return { error: "Invalid status" };
      }
      const visit = await fieldVisit.updateFieldVisitStatus(params.id, status, {
        username: auth.username,
      });
      return { success: true, message: `Field visit status updated to ${status}`, visit };
    } catch (e) {
      const err = e as Error;
      set.status = err.message.includes("not found") ? 404 : 500;
      return { error: err.message || "Failed to update status" };
    }
  })
  .post("/field-visits/:id/notes", async ({ user, params, body, set }) => {
    try {
      const auth = requireOfficer(user);
      const { note } = body as { note?: string };
      if (!note) {
        set.status = 400;
        return { error: "Note content is required" };
      }
      const visit = await fieldVisit.addVisitNote(params.id, note, auth.username);
      return { success: true, message: "Note added", visit };
    } catch (e) {
      const err = e as Error;
      set.status = err.message.includes("not found") ? 404 : 500;
      return { error: err.message || "Failed to add note" };
    }
  })
  .post("/field-visits/:id/photos", async ({ user, params, body, set }) => {
    try {
      const auth = requireOfficer(user);
      const { url, caption } = body as { url?: string; caption?: string };
      if (!url) {
        set.status = 400;
        return { error: "Photo URL is required" };
      }
      const visit = await fieldVisit.addVisitPhoto(
        params.id,
        { url, caption },
        auth.username
      );
      return { success: true, message: "Photo added", visit };
    } catch (e) {
      const err = e as Error;
      set.status = err.message.includes("not found") ? 404 : 500;
      return { error: err.message || "Failed to add photo" };
    }
  })
  .put("/field-visits/:id/findings", async ({ user, params, body, set }) => {
    try {
      const auth = requireOfficer(user);
      const visit = await fieldVisit.updateVisitFindings(
        params.id,
        body as Record<string, unknown>,
        { userId: auth.id, username: auth.username }
      );
      return { success: true, message: "Findings updated", visit };
    } catch (e) {
      const err = e as Error;
      set.status = err.message.includes("not found") ? 404 : 500;
      return { error: err.message || "Failed to update findings" };
    }
  })
  .get("/field-visit-stats", async ({ user, set }) => {
    try {
      const auth = requireOfficer(user);
      const stats = await fieldVisit.getFieldVisitStats(auth.district);
      return { success: true, stats };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message || "Failed to fetch stats" };
    }
  })
  .post("/internal-notes", async ({ user, body, set }) => {
    try {
      const auth = requireOfficer(user);
      const b = body as {
        targetType?: string;
        targetId?: string;
        noteType?: string;
        content?: string;
        flags?: string[];
        visibility?: string;
        farmerUsername?: string;
        gnDivision?: string;
        district?: string;
      };
      if (!b.targetType || !b.targetId || !b.content) {
        set.status = 400;
        return { error: "Target type, target ID, and content are required" };
      }
      const note = await internalNote.createNote(b, officerContext(auth));
      set.status = 201;
      return { success: true, message: "Internal note created", note };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message || "Failed to create note" };
    }
  })
  .get("/internal-notes/target/:type/:id", async ({ user, params, set }) => {
    try {
      const auth = requireOfficer(user);
      const notes = await internalNote.getNotesForTarget(params.type, params.id, {
        userId: auth.id,
        district: auth.district,
      });
      return { success: true, notes };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message || "Failed to fetch notes" };
    }
  })
  .get("/internal-notes/farmer/:username", async ({ user, params, set }) => {
    try {
      const auth = requireOfficer(user);
      const notes = await internalNote.getNotesForFarmer(params.username, {
        userId: auth.id,
        district: auth.district,
      });
      return { success: true, notes };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message || "Failed to fetch farmer notes" };
    }
  })
  .get("/flagged-entities", async ({ user, query, set }) => {
    try {
      const auth = requireOfficer(user);
      const entities = await internalNote.getFlaggedEntities({
        district: auth.district,
        flagType: query.flagType as string | undefined,
        limit: parseInt(String(query.limit || "50"), 10) || 50,
      });
      return { success: true, entities };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message || "Failed to fetch flagged entities" };
    }
  })
  .post("/internal-notes/flag", async ({ user, body, set }) => {
    try {
      const auth = requireOfficer(user);
      const b = body as {
        targetType?: string;
        targetId?: string;
        flag?: string;
        reason?: string;
        farmerUsername?: string;
        gnDivision?: string;
        district?: string;
      };
      if (!b.targetType || !b.targetId || !b.flag) {
        set.status = 400;
        return { error: "Target type, target ID, and flag are required" };
      }
      const note = await internalNote.addFlag(
        b.targetType,
        b.targetId,
        b.flag,
        officerContext(auth),
        b
      );
      return { success: true, message: "Flag added", note };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message || "Failed to add flag" };
    }
  })
  .delete("/internal-notes/:id/flag/:flag", async ({ user, params, set }) => {
    try {
      const auth = requireOfficer(user);
      const note = await internalNote.removeFlag(params.id, params.flag, {
        username: auth.username,
      });
      return { success: true, message: "Flag removed", note };
    } catch (e) {
      const err = e as Error;
      set.status = err.message.includes("not found") ? 404 : 500;
      return { error: err.message || "Failed to remove flag" };
    }
  })
  .put("/internal-notes/:id/resolve", async ({ user, params, set }) => {
    try {
      const auth = requireOfficer(user);
      const note = await internalNote.resolveNote(params.id, { username: auth.username });
      return { success: true, message: "Note resolved", note };
    } catch (e) {
      const err = e as Error;
      set.status = err.message.includes("not found") ? 404 : 500;
      return { error: err.message || "Failed to resolve note" };
    }
  })
  .get("/internal-notes/stats", async ({ user, set }) => {
    try {
      const auth = requireOfficer(user);
      const stats = await internalNote.getNoteStats(auth.district);
      return { success: true, stats };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message || "Failed to fetch stats" };
    }
  });