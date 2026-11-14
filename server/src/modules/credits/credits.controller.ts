import { Elysia } from "elysia";
import { User } from "../../models/User";
import { authPlugin, requireAuth } from "../../plugins/auth";

export const creditsController = new Elysia({ prefix: "/api/credits" })
  .use(authPlugin)
  .get("/balance", async ({ user, set }) => {
    try {
      const auth = requireAuth(user);
      const doc = await User.findById(auth.id).select(
        "credits dailyLimit lastCreditReset isPremium"
      );
      if (!doc) {
        set.status = 404;
        return { error: "User not found" };
      }
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      let effectiveCredits = doc.credits ?? 200;
      if (!doc.lastCreditReset || doc.lastCreditReset < startOfToday) {
        effectiveCredits = Math.max(effectiveCredits, doc.dailyLimit ?? 200);
      }
      return {
        credits: effectiveCredits,
        dailyLimit: doc.dailyLimit ?? 200,
        isPremium: doc.isPremium ?? false,
      };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 401;
      return { error: err.message };
    }
  })
  .post("/purchase", async ({ user, body, set }) => {
    try {
      const auth = requireAuth(user);
      const amount = Number((body as { amount?: number }).amount) || 100;
      const doc = await User.findByIdAndUpdate(
        auth.id,
        { $inc: { credits: amount } },
        { new: true }
      ).select("credits");
      return { credits: doc?.credits ?? 0, added: amount };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 401;
      return { error: err.message };
    }
  });
