import { Elysia } from "elysia";
import { User } from "../../models/User";
import { Listing } from "../../models/Listing";
import { authPlugin, requireAuth, type AuthUser } from "../../plugins/auth";

function requireAdmin(user: AuthUser | null) {
  const auth = requireAuth(user);
  if (auth.role !== "admin") {
    const err = new Error("Admin access required");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  return auth;
}

const userPublic =
  "-password -verificationToken -passwordResetToken -verificationTokenExpires -passwordResetExpires";

export const adminController = new Elysia({ prefix: "/api/admin" })
  .use(authPlugin)
  .get("/stats", async ({ user, set }) => {
    try {
      requireAdmin(user);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [
        totalUsers,
        totalFarmers,
        totalOfficers,
        totalBuyers,
        pendingOfficers,
        flaggedAccounts,
        recentUsers,
        activeListings,
        districtBreakdown,
        roleByDistrict,
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: "farmer" }),
        User.countDocuments({ role: "officer" }),
        User.countDocuments({ role: "buyer" }),
        User.countDocuments({ role: "officer", approvalStatus: "pending" }),
        User.countDocuments({ account_flagged: true }),
        User.countDocuments({ createdAt: { $gte: weekAgo } }),
        Listing.countDocuments({ status: "active" }),
        User.aggregate([
          { $group: { _id: "$district", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
        User.aggregate([
          {
            $group: {
              _id: { district: "$district", role: "$role" },
              count: { $sum: 1 },
            },
          },
          { $sort: { "_id.district": 1 } },
        ]),
      ]);

      return {
        success: true,
        stats: {
          totalUsers,
          totalFarmers,
          totalOfficers,
          totalBuyers,
          pendingOfficers,
          flaggedAccounts,
          recentUsers,
          activeListings,
          listings: activeListings,
          districtBreakdown,
          roleByDistrict,
        },
      };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message };
    }
  })
  .get("/users", async ({ user, query, set }) => {
    try {
      requireAdmin(user);
      const q = query as Record<string, string | undefined>;
      const page = Math.max(1, Number(q.page || 1));
      const limit = Math.min(100, Math.max(1, Number(q.limit || 20)));
      const filter: Record<string, unknown> = {};

      if (q.search) {
        filter.$or = [
          { username: { $regex: q.search, $options: "i" } },
          { fullName: { $regex: q.search, $options: "i" } },
          { email: { $regex: q.search, $options: "i" } },
          { officerId: { $regex: q.search, $options: "i" } },
        ];
      }
      if (q.role && q.role !== "all") filter.role = q.role;
      if (q.district && q.district !== "all") filter.district = q.district;
      if (q.status === "flagged") filter.account_flagged = true;
      else if (q.status === "pending") {
        filter.approvalStatus = "pending";
        filter.role = "officer";
      }

      const sortBy = q.sortBy || "createdAt";
      const sortOrder = q.sortOrder === "asc" ? 1 : -1;
      const skip = (page - 1) * limit;

      const [users, totalCount] = await Promise.all([
        User.find(filter)
          .select(userPublic)
          .sort({ [sortBy]: sortOrder })
          .skip(skip)
          .limit(limit)
          .lean(),
        User.countDocuments(filter),
      ]);

      return {
        success: true,
        users,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit) || 1,
        },
      };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message };
    }
  })
  .get("/users/:id", async ({ user, params, set }) => {
    try {
      requireAdmin(user);
      const doc = await User.findById(params.id).select(userPublic).lean();
      if (!doc) {
        set.status = 404;
        return { error: "User not found" };
      }
      return { success: true, user: doc };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message };
    }
  })
  .put("/users/:id/role", async ({ user, params, body, set }) => {
    try {
      const auth = requireAdmin(user);
      const role = (body as { role?: string }).role;
      const valid = ["farmer", "officer", "buyer", "admin", "moderator"];
      if (!role || !valid.includes(role)) {
        set.status = 400;
        return { error: `Invalid role. Must be one of: ${valid.join(", ")}` };
      }
      if (params.id === auth.id && role !== "admin") {
        set.status = 400;
        return { error: "You cannot remove your own admin role" };
      }
      const doc = await User.findByIdAndUpdate(
        params.id,
        { role },
        { new: true }
      ).select("-password");
      if (!doc) {
        set.status = 404;
        return { error: "User not found" };
      }
      return { success: true, message: `User role updated to ${role}`, user: doc };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message };
    }
  })
  .put("/users/:id/status", async ({ user, params, body, set }) => {
    try {
      requireAdmin(user);
      const flagged = Boolean((body as { flagged?: boolean }).flagged);
      const doc = await User.findByIdAndUpdate(
        params.id,
        { account_flagged: flagged },
        { new: true }
      ).select("-password");
      if (!doc) {
        set.status = 404;
        return { error: "User not found" };
      }
      return {
        success: true,
        message: flagged ? "Account flagged" : "Account unflagged",
        user: doc,
      };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message };
    }
  })
  .put("/users/:id/credits", async ({ user, params, body, set }) => {
    try {
      requireAdmin(user);
      const { credits, dailyLimit, isPremium } = body as {
        credits?: number;
        dailyLimit?: number;
        isPremium?: boolean;
      };
      const update: Record<string, unknown> = {};
      if (credits !== undefined) update.credits = credits;
      if (dailyLimit !== undefined) update.dailyLimit = dailyLimit;
      if (isPremium !== undefined) update.isPremium = isPremium;
      const doc = await User.findByIdAndUpdate(params.id, update, {
        new: true,
      }).select("-password");
      if (!doc) {
        set.status = 404;
        return { error: "User not found" };
      }
      return {
        success: true,
        message: "User credits updated",
        user: {
          _id: doc._id,
          username: doc.username,
          credits: doc.credits,
          dailyLimit: doc.dailyLimit,
          isPremium: doc.isPremium,
        },
      };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message };
    }
  })
  .delete("/users/:id", async ({ user, params, set }) => {
    try {
      const auth = requireAdmin(user);
      if (params.id === auth.id) {
        set.status = 400;
        return { error: "You cannot delete your own account" };
      }
      const doc = await User.findByIdAndDelete(params.id);
      if (!doc) {
        set.status = 404;
        return { error: "User not found" };
      }
      return {
        success: true,
        message: `User ${doc.username} deleted successfully`,
      };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message };
    }
  })
  .get("/pending-officers", async ({ user, set }) => {
    try {
      requireAdmin(user);
      const officers = await User.find({
        role: "officer",
        approvalStatus: "pending",
      })
        .select(userPublic)
        .sort({ createdAt: -1 })
        .lean();
      return { success: true, count: officers.length, officers };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message };
    }
  })
  .put("/officers/:id/approve", async ({ user, params, set }) => {
    try {
      const auth = requireAdmin(user);
      const officer = await User.findOne({ _id: params.id, role: "officer" });
      if (!officer) {
        set.status = 404;
        return { error: "Officer not found" };
      }
      if (officer.approvalStatus === "approved") {
        set.status = 400;
        return { error: "Officer is already approved" };
      }
      officer.isApproved = true;
      officer.approvalStatus = "approved";
      officer.approvedBy = auth.id as never;
      officer.approvedAt = new Date();
      officer.rejectionReason = null;
      await officer.save();
      return {
        success: true,
        message: `Officer ${officer.fullName} has been approved`,
        officer,
      };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message };
    }
  })
  .put("/officers/:id/reject", async ({ user, params, body, set }) => {
    try {
      const auth = requireAdmin(user);
      const reason = String((body as { reason?: string }).reason || "").trim();
      if (!reason) {
        set.status = 400;
        return { error: "Rejection reason is required" };
      }
      const officer = await User.findOne({ _id: params.id, role: "officer" });
      if (!officer) {
        set.status = 404;
        return { error: "Officer not found" };
      }
      officer.isApproved = false;
      officer.approvalStatus = "rejected";
      officer.rejectionReason = reason;
      officer.approvedBy = auth.id as never;
      officer.approvedAt = new Date();
      await officer.save();
      return {
        success: true,
        message: `Officer ${officer.fullName} has been rejected`,
        officer,
      };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message };
    }
  })
  .get("/districts", async ({ user, set }) => {
    try {
      requireAdmin(user);
      const districts = await User.aggregate([
        { $group: { _id: "$district", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]);
      return {
        success: true,
        districts: districts.map((d) => ({ name: d._id, count: d.count })),
      };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { error: err.message };
    }
  });
