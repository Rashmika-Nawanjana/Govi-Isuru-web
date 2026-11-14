import { Elysia } from "elysia";
import { User } from "../../models/User";
import { authPlugin, requireAuth, toPublicUser } from "../../plugins/auth";

export const usersController = new Elysia({ prefix: "/api/users" })
  .use(authPlugin)
  .get("/me", async ({ user, set }) => {
    try {
      const auth = requireAuth(user);
      const doc = await User.findById(auth.id);
      if (!doc) {
        set.status = 404;
        return { error: "Not found" };
      }
      return { user: toPublicUser(doc) };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 401;
      return { error: err.message };
    }
  })
  .patch("/me", async ({ user, body, set }) => {
    try {
      const auth = requireAuth(user);
      const allowed = [
        "fullName",
        "phone",
        "district",
        "dsDivision",
        "gnDivision",
      ] as const;
      const updates: Record<string, string> = {};
      for (const key of allowed) {
        if ((body as Record<string, unknown>)[key] !== undefined) {
          updates[key] = String((body as Record<string, unknown>)[key]);
        }
      }
      const doc = await User.findByIdAndUpdate(
        auth.id,
        { $set: updates },
        { new: true }
      );
      if (!doc) {
        set.status = 404;
        return { error: "Not found" };
      }
      return { user: toPublicUser(doc) };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 400;
      return { error: err.message };
    }
  });
