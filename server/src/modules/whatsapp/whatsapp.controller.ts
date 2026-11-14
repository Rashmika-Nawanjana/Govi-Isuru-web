import crypto from "node:crypto";
import { Elysia } from "elysia";
import { WhatsAppLink } from "../../models/WhatsAppLink";
import { WhatsAppLinkCode } from "../../models/WhatsAppLinkCode";
import { WhatsAppSession } from "../../models/WhatsAppSession";
import { authPlugin, requireAuthUser } from "../../plugins/auth";

export const whatsappController = new Elysia({ prefix: "/api/whatsapp" })
  .use(authPlugin)
  .post("/link/start", async ({ user, set }) => {
    try {
      const doc = await requireAuthUser(user);
      await WhatsAppLinkCode.deleteMany({ userId: doc._id });
      const code = String(crypto.randomInt(100000, 1000000));
      await WhatsAppLinkCode.create({ code, userId: doc._id });

      return {
        code,
        expiresInSeconds: 600,
        botNumber: process.env.BOT_PHONE_NUMBER || null,
        instructions: `Send "LINK ${code}" to the Govi Isuru WhatsApp number.`,
      };
    } catch (e) {
      const err = e as Error & { status?: number };
      console.error("WhatsApp link/start", err);
      set.status = err.status || 500;
      return { error: err.message || "Failed to create link code" };
    }
  })
  .get("/link/status", async ({ user, set }) => {
    try {
      const auth = await requireAuthUser(user);
      const link = await WhatsAppLink.findOne({ userId: auth._id });
      if (!link) return { linked: false };

      const masked = link.jid.split("@")[0];
      return {
        linked: true,
        maskedNumber: `••••${masked.slice(-4)}`,
        language: link.language,
        notificationsEnabled: link.notificationsEnabled,
        linkedAt: link.linkedAt,
      };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message || "Failed to read link status" };
    }
  })
  .delete("/link", async ({ user, set }) => {
    try {
      const auth = await requireAuthUser(user);
      const link = await WhatsAppLink.findOneAndDelete({ userId: auth._id });
      if (link) await WhatsAppSession.deleteOne({ jid: link.jid });
      return { success: true, unlinked: Boolean(link) };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message || "Failed to unlink" };
    }
  });