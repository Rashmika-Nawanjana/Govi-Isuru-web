import { CREDIT_COSTS } from "@govi/shared";
import { Elysia, t } from "elysia";
import { mlClient, MlClientError } from "../../infrastructure/mlClient";
import { env } from "../../infrastructure/env";
import { authPlugin, requireAuth } from "../../plugins/auth";
import { deductCredits, refundCredits } from "../../plugins/credits";

const yieldData: Record<
  string,
  Record<string, { baseYield: number; variance: number }>
> = {
  Anuradhapura: {
    Maha: { baseYield: 4.5, variance: 0.8 },
    Yala: { baseYield: 3.2, variance: 0.6 },
  },
  Kurunegala: {
    Maha: { baseYield: 4.2, variance: 0.7 },
    Yala: { baseYield: 3.0, variance: 0.5 },
  },
  Polonnaruwa: {
    Maha: { baseYield: 4.8, variance: 0.9 },
    Yala: { baseYield: 3.5, variance: 0.7 },
  },
};

const YIELD_PROFIT_CREDIT_COST = 10;

function sampleYieldPerHa(district: string, season: string) {
  const districtData = yieldData[district] || yieldData.Anuradhapura;
  const seasonData = districtData[season] || districtData.Maha;
  return (
    seasonData.baseYield +
    (Math.random() * seasonData.variance - seasonData.variance / 2)
  );
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function ruleSuitability(body: Record<string, unknown>) {
  const soilPH = Number(body.soilPH ?? 6.0);
  const rainfall = Number(body.rainfall ?? 1200);
  const temperature = Number(body.temperature ?? 28);
  const season = String(body.season || "Maha");

  const score = (crop: string) => {
    const ph = clamp01(1 - Math.abs((soilPH - 6.3) / 1.5));
    const rain = clamp01((rainfall - 900) / 900);
    const temp = clamp01(1 - Math.abs((temperature - 27.5) / 7));
    return Math.round(((ph + rain + temp) / 3) * 100);
  };

  return {
    recommendations: [
      { crop: "Rice", score: score("Rice"), season },
      { crop: "Tea", score: Math.round(score("Tea") * 0.7), season },
      { crop: "Chili", score: Math.round(score("Chili") * 0.85), season },
    ].sort((a, b) => b.score - a.score),
    source: "rules",
  };
}

export const cropCareController = new Elysia({ prefix: "/api" })
  .use(authPlugin)
  .get("/ai/health", async () => mlClient.health())
  .post(
    "/ai/predict/:crop",
    async ({ params, request, user, set }) => {
      try {
        const auth = requireAuth(user);
        const crop = params.crop.toLowerCase();
        if (!["rice", "tea", "chili"].includes(crop)) {
          set.status = 400;
          return { error: "Invalid crop type" };
        }

        await deductCredits(auth.id, CREDIT_COSTS.AI_PREDICT);

        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) {
          await refundCredits(auth.id, CREDIT_COSTS.AI_PREDICT);
          set.status = 400;
          return { error: "No image file provided" };
        }

        try {
          const data = await mlClient.predict(
            crop as "rice" | "tea" | "chili",
            file,
            file.name
          );
          return data;
        } catch (proxyErr) {
          await refundCredits(auth.id, CREDIT_COSTS.AI_PREDICT);
          throw proxyErr;
        }
      } catch (e) {
        const err = e as Error & { status?: number; body?: unknown };
        set.status =
          err instanceof MlClientError
            ? err.status
            : err.status || 500;
        return (
          err.body || {
            error: err.message,
            mlUrl: env.mlServiceUrl,
          }
        );
      }
    },
    { params: t.Object({ crop: t.String() }) }
  )
  .get("/weather/geocode", async ({ query, set }) => {
    if (!env.weatherApiKey) {
      set.status = 500;
      return { error: "WEATHER_API_KEY not set" };
    }
    const q = (query as { query?: string }).query;
    if (!q) {
      set.status = 400;
      return { error: "query is required" };
    }
    const url = new URL("https://api.openweathermap.org/geo/1.0/direct");
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "1");
    url.searchParams.set("appid", env.weatherApiKey);
    const res = await fetch(url);
    if (!res.ok) {
      set.status = 502;
      return { error: "Failed to fetch geocode data" };
    }
    return res.json();
  })
  .get("/weather/current", async ({ query, set }) => {
    if (!env.weatherApiKey) {
      set.status = 500;
      return { error: "WEATHER_API_KEY not set" };
    }
    const { lat, lon, units = "metric" } = query as {
      lat?: string;
      lon?: string;
      units?: string;
    };
    if (!lat || !lon) {
      set.status = 400;
      return { error: "lat and lon are required" };
    }
    const url = new URL("https://api.openweathermap.org/data/2.5/weather");
    url.searchParams.set("lat", lat);
    url.searchParams.set("lon", lon);
    url.searchParams.set("units", units);
    url.searchParams.set("appid", env.weatherApiKey);
    const res = await fetch(url);
    if (!res.ok) {
      set.status = 502;
      return { error: "Failed to fetch current weather" };
    }
    return res.json();
  })
  .get("/weather/forecast", async ({ query, set }) => {
    if (!env.weatherApiKey) {
      set.status = 500;
      return { error: "WEATHER_API_KEY not set" };
    }
    const { lat, lon, units = "metric" } = query as {
      lat?: string;
      lon?: string;
      units?: string;
    };
    if (!lat || !lon) {
      set.status = 400;
      return { error: "lat and lon are required" };
    }
    const url = new URL("https://api.openweathermap.org/data/2.5/forecast");
    url.searchParams.set("lat", lat);
    url.searchParams.set("lon", lon);
    url.searchParams.set("units", units);
    url.searchParams.set("appid", env.weatherApiKey);
    const res = await fetch(url);
    if (!res.ok) {
      set.status = 502;
      return { error: "Failed to fetch forecast" };
    }
    return res.json();
  })
  .get("/yield/predict", async ({ query, user, set }) => {
    try {
      const auth = requireAuth(user);
      await deductCredits(auth.id, CREDIT_COSTS.YIELD);
      const district = String(
        (query as { district?: string }).district || "Anuradhapura"
      );
      const season = String((query as { season?: string }).season || "Maha");
      const year = Number((query as { year?: string }).year || 2026);
      const areaNum = parseFloat(
        String((query as { area_ha?: string }).area_ha || 1)
      );
      const districtData = yieldData[district] || yieldData.Anuradhapura;
      const seasonData = districtData[season] || districtData.Maha;
      const yieldPerHa = sampleYieldPerHa(district, season);
      const totalProductionKg = yieldPerHa * areaNum * 1000;
      const totalProductionTons = yieldPerHa * areaNum;
      return {
        success: true,
        district,
        season,
        year,
        area_ha: areaNum,
        predicted_yield: parseFloat(totalProductionTons.toFixed(2)),
        yield_kg_ha: parseFloat((yieldPerHa * 1000).toFixed(2)),
        total_production_kg: parseFloat(totalProductionKg.toFixed(2)),
        unit: "metric tons",
        confidence: 0.85,
        stability_index: 0.78,
        yield_range: {
          min: parseFloat(
            ((yieldPerHa - seasonData.variance) * 1000).toFixed(2)
          ),
          max: parseFloat(
            ((yieldPerHa + seasonData.variance) * 1000).toFixed(2)
          ),
        },
        factors: {
          rainfall: "Good",
          soil: "Fertile",
          temperature: "Optimal",
        },
      };
    } catch (e) {
      const err = e as Error & { status?: number; body?: unknown };
      set.status = err.status || 500;
      return err.body || { success: false, error: err.message };
    }
  })
  .get("/yield/profit", async ({ query, user, set }) => {
    try {
      const auth = requireAuth(user);
      await deductCredits(auth.id, YIELD_PROFIT_CREDIT_COST);
      const district = String(
        (query as { district?: string }).district || "Anuradhapura"
      );
      const season = String((query as { season?: string }).season || "Maha");
      const year = Number((query as { year?: string }).year || 2026);
      const areaNum = parseFloat(
        String((query as { area_ha?: string }).area_ha || 1)
      );
      const costPerHa = parseFloat(
        String((query as { cost_per_ha?: string }).cost_per_ha || 50000)
      );
      const pricePerKg = parseFloat(
        String((query as { price_per_kg?: string }).price_per_kg || 35)
      );
      const predictedYield = sampleYieldPerHa(district, season) * areaNum;
      const totalCost = costPerHa * areaNum;
      const totalRevenue = predictedYield * 1000 * pricePerKg;
      const profit = totalRevenue - totalCost;
      const roi = (profit / totalCost) * 100 || 0;
      const profitPerHa = profit / areaNum;
      const breakEvenYield = totalCost / (areaNum * pricePerKg);
      return {
        success: true,
        district,
        season,
        year,
        area_ha: areaNum,
        estimated_profit: parseFloat(profit.toFixed(2)),
        revenue: parseFloat(totalRevenue.toFixed(2)),
        total_cost: parseFloat(totalCost.toFixed(2)),
        roi: parseFloat(roi.toFixed(2)),
        profit_per_ha: parseFloat(profitPerHa.toFixed(2)),
        break_even_yield: parseFloat(breakEvenYield.toFixed(2)),
        price_per_kg: pricePerKg,
        cost_per_ha: costPerHa,
      };
    } catch (e) {
      const err = e as Error & { status?: number; body?: unknown };
      set.status = err.status || 500;
      return err.body || { success: false, error: err.message };
    }
  })
  .get("/yield/warning", async ({ query, set }) => {
    try {
      const district = String(
        (query as { district?: string }).district || "Anuradhapura"
      );
      const season = String((query as { season?: string }).season || "Maha");
      const year = Number((query as { year?: string }).year || 2026);
      const warnings = [
        {
          message: "Rice Hispa detected in nearby areas",
          message_si:
            "අახ අසල් ප්‍රදේශවල කුරුමිණ් සනසුන් අනාවරණය කර ඇත",
        },
        {
          message: "Monsoon onset may be delayed by 2-3 days",
          message_si: "අපි ශ්‍රී කාලය දින 2-3 ක් ප්‍රමාද විය හැකිය",
        },
      ];
      const recommendations = [
        {
          en: "Monitor crops closely and consider preventive spraying",
          si: "බෝවන් සමීපව බලා සපයා ගැනීම සඳහා පිඩුවචනීයතාකරණ ඉසිසිප සලකා බලන්න",
        },
        {
          en: "Plan irrigation accordingly based on weather forecast",
          si: "කෙසේ හෝ කාලගුණ පූර්වීකරණ පදනම්ව වාරිමාර්ගයේ සැලසුම් කරන්න",
        },
      ];
      const riskScores: Record<string, Record<string, number>> = {
        Anuradhapura: { Maha: 0.65, Yala: 0.55 },
        Kurunegala: { Maha: 0.6, Yala: 0.5 },
        Polonnaruwa: { Maha: 0.7, Yala: 0.6 },
      };
      const districtRisks = riskScores[district] || riskScores.Anuradhapura;
      const riskScore = districtRisks[season] || districtRisks.Maha;
      let riskLevel = "low";
      if (riskScore >= 0.7) riskLevel = "critical";
      else if (riskScore >= 0.6) riskLevel = "high";
      else if (riskScore >= 0.45) riskLevel = "medium";
      return {
        success: true,
        district,
        season,
        year,
        risk_score: parseFloat(riskScore.toFixed(2)),
        risk_level: riskLevel,
        warnings,
        recommendations,
      };
    } catch (e) {
      const err = e as Error;
      set.status = 500;
      return { success: false, error: err.message };
    }
  })
  .get("/yield/rankings", async ({ query, set }) => {
    try {
      const season = String(
        (query as { season?: string }).season || "Maha"
      );
      const year = Number((query as { year?: string }).year || 2026);
      const rankings = [
        {
          rank: 1,
          district: "Polonnaruwa",
          avg_yield: 4800,
          area_cultured_ha: 45000,
          production_tons: 216000,
          stability: 0.92,
          trend: 0.125,
          overall_score: 95,
        },
        {
          rank: 2,
          district: "Anuradhapura",
          avg_yield: 4500,
          area_cultured_ha: 38000,
          production_tons: 171000,
          stability: 0.88,
          trend: 0.083,
          overall_score: 92,
        },
        {
          rank: 3,
          district: "Kurunegala",
          avg_yield: 4200,
          area_cultured_ha: 35000,
          production_tons: 147000,
          stability: 0.85,
          trend: 0.052,
          overall_score: 88,
        },
        {
          rank: 4,
          district: "Ratnapura",
          avg_yield: 3800,
          area_cultured_ha: 28000,
          production_tons: 106400,
          stability: 0.78,
          trend: 0.031,
          overall_score: 78,
        },
        {
          rank: 5,
          district: "Matara",
          avg_yield: 3500,
          area_cultured_ha: 22000,
          production_tons: 77000,
          stability: 0.72,
          trend: 0.015,
          overall_score: 70,
        },
      ];
      return {
        success: true,
        season,
        year,
        rankings,
        lastUpdated: new Date().toISOString(),
      };
    } catch (e) {
      const err = e as Error;
      set.status = 500;
      return { success: false, error: err.message };
    }
  })
  .get("/yield/trends", async ({ query, set }) => {
    try {
      const district = String(
        (query as { district?: string }).district || "Anuradhapura"
      );
      const season = String((query as { season?: string }).season || "Maha");
      const trends = [
        {
          year: 2022,
          avg_yield_kg_ha: 3800,
          area_ha: 35000,
          total_production_mt: 133,
        },
        {
          year: 2023,
          avg_yield_kg_ha: 4000,
          area_ha: 36000,
          total_production_mt: 144,
        },
        {
          year: 2024,
          avg_yield_kg_ha: 4300,
          area_ha: 37000,
          total_production_mt: 159,
        },
        {
          year: 2025,
          avg_yield_kg_ha: 4500,
          area_ha: 38000,
          total_production_mt: 171,
        },
        {
          year: 2026,
          avg_yield_kg_ha: 4600,
          area_ha: 39000,
          total_production_mt: 179,
        },
      ];
      return {
        success: true,
        district,
        season,
        trends,
        lastUpdated: new Date().toISOString(),
      };
    } catch (e) {
      const err = e as Error;
      set.status = 500;
      return { success: false, error: err.message };
    }
  })
  .post("/suitability/recommend", async ({ body, user, set }) => {
    try {
      const auth = requireAuth(user);
      await deductCredits(auth.id, CREDIT_COSTS.SUITABILITY);
      const payload = {
        district: (body as { district?: string }).district || "",
        season: (body as { season?: string }).season || "Maha",
        soil_ph: Number((body as { soilPH?: number }).soilPH ?? 6.3),
        soil_type: (body as { soilType?: string }).soilType || "Loam",
        drainage: (body as { drainage?: string }).drainage || "Moderate",
        slope: (body as { slope?: string }).slope || "Flat",
        irrigation:
          (body as { irrigation?: boolean }).irrigation !== undefined
            ? Boolean((body as { irrigation?: boolean }).irrigation)
            : true,
        rainfall_mm: Number((body as { rainfall?: number }).rainfall ?? 1100),
        temperature_c: Number(
          (body as { temperature?: number }).temperature ?? 28
        ),
        land_size_ha: Number(
          (body as { landSizeHa?: number }).landSizeHa ?? 1.0
        ),
      };
      try {
        const ml = await mlClient.suitability(payload);
        if (ml?.recommendations) {
          return { recommendations: ml.recommendations, source: "ml", inputs: payload };
        }
      } catch {
        /* fallback */
      }
      return { ...ruleSuitability(body as Record<string, unknown>), inputs: payload };
    } catch (e) {
      const err = e as Error & { status?: number; body?: unknown };
      set.status = err.status || 500;
      return err.body || { error: err.message };
    }
  });
