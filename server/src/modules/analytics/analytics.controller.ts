import { Elysia } from "elysia";
import {
  getOutbreakGrowthIndicators,
  getReportingCoverageIndex,
  getSpreadRiskMapping,
} from "../../services/analytics.service";
import { authPlugin, requireOfficer } from "../../plugins/auth";

function parseDays(raw?: string | number, fallback = 7) {
  const n = typeof raw === "string" ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const analyticsController = new Elysia({ prefix: "/api/analytics" })
  .use(authPlugin)
  .get("/growth-indicators", async ({ query, user, set }) => {
    try {
      const days = parseDays(query.days, 7);
      const district =
        (query.district as string | undefined) || user?.district || null;
      const indicators = await getOutbreakGrowthIndicators(district, days);
      return { success: true, ...indicators };
    } catch (e) {
      console.error("growth-indicators", e);
      set.status = 500;
      return { error: "Failed to fetch growth indicators" };
    }
  })
  .get("/spread-risk", async ({ query, user, set }) => {
    try {
      const days = parseDays(query.days, 14);
      const district =
        (query.district as string | undefined) || user?.district || null;
      const riskData = await getSpreadRiskMapping(district, days);
      return { success: true, ...riskData };
    } catch (e) {
      console.error("spread-risk", e);
      set.status = 500;
      return { error: "Failed to fetch spread risk data" };
    }
  })
  .get("/coverage-index", async ({ query, user, set }) => {
    try {
      const auth = requireOfficer(user);
      const days = parseDays(query.days, 30);
      const district = (query.district as string | undefined) || auth.district || null;
      const coverageData = await getReportingCoverageIndex(district, days);
      return { success: true, ...coverageData };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message || "Failed to fetch coverage index" };
    }
  });