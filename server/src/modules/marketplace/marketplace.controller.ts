import { Elysia, t } from "elysia";
import { Feedback } from "../../models/Feedback";
import { Listing } from "../../models/Listing";
import { User } from "../../models/User";
import { authPlugin, requireAuth } from "../../plugins/auth";
import {
  REPUTATION_CONFIG,
  getFarmerFeedbacks,
  getReputationBreakdown,
  getTopFarmers,
  onListingSold,
  onListingVerified,
  submitFeedback,
} from "./reputation.service";

export const marketplaceController = new Elysia({ prefix: "/api" })
  .use(authPlugin)
  .get("/listings", async ({ query }) => {
    const filter: Record<string, unknown> = {
      status: (query as { status?: string }).status || "active",
    };
    if ((query as { district?: string }).district) {
      filter.district = (query as { district?: string }).district;
    }
    if ((query as { cropType?: string }).cropType) {
      filter.cropType = (query as { cropType?: string }).cropType;
    }
    // Original API returned a bare array — keep that shape for UI parity
    const listings = await Listing.find(filter)
      .populate("farmer_id", "username reputation_score is_verified_farmer total_sales")
      .sort({ date: -1 })
      .limit(100);
    return listings;
  })
  .get("/listings/:id", async ({ params, set }) => {
    const listing = await Listing.findByIdAndUpdate(
      params.id,
      { $inc: { view_count: 1 } },
      { new: true }
    );
    if (!listing) {
      set.status = 404;
      return { error: "Not found" };
    }
    return { listing };
  })
  .post("/listings", async ({ body, user, set }) => {
    try {
      const auth = requireAuth(user);
      const listing = await Listing.create({
        ...(body as object),
        farmer_id: auth.id,
        farmerName:
          (body as { farmerName?: string }).farmerName ||
          auth.fullName ||
          auth.username,
        district: (body as { district?: string }).district || auth.district,
        gn_division:
          (body as { gn_division?: string }).gn_division || auth.gnDivision,
        phone: (body as { phone?: string }).phone || auth.phone,
      });
      return { listing };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 400;
      return { error: err.message };
    }
  })
  .patch("/listings/:id", async ({ params, body, user, set }) => {
    try {
      const auth = requireAuth(user);
      const listing = await Listing.findById(params.id);
      if (!listing) {
        set.status = 404;
        return { error: "Not found" };
      }
      if (
        listing.farmer_id?.toString() !== auth.id &&
        !["admin", "moderator"].includes(auth.role)
      ) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      Object.assign(listing, body);
      await listing.save();
      return { listing };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 400;
      return { error: err.message };
    }
  })
  .delete("/listings/:id", async ({ params, user, set }) => {
    try {
      const auth = requireAuth(user);
      const listing = await Listing.findById(params.id);
      if (!listing) {
        set.status = 404;
        return { error: "Not found" };
      }
      if (
        listing.farmer_id?.toString() !== auth.id &&
        !["admin", "moderator"].includes(auth.role)
      ) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      listing.status = "removed";
      await listing.save();
      return { msg: "Removed" };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 400;
      return { error: err.message };
    }
  })
  .get("/saved-listings", async ({ user, set }) => {
    try {
      const auth = requireAuth(user);
      const doc = await User.findById(auth.id).populate("savedListings");
      return { listings: doc?.savedListings || [], success: true };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 401;
      return { error: err.message };
    }
  })
  .post("/saved-listings/toggle/:id", async ({ params, user, set }) => {
    try {
      const auth = requireAuth(user);
      const doc = await User.findById(auth.id);
      if (!doc) {
        set.status = 404;
        return { error: "User not found" };
      }
      const saved = (doc.savedListings || []).map(String);
      const isSaved = saved.includes(params.id);
      if (isSaved) {
        await User.findByIdAndUpdate(auth.id, {
          $pull: { savedListings: params.id },
        });
      } else {
        await User.findByIdAndUpdate(auth.id, {
          $addToSet: { savedListings: params.id },
        });
      }
      return { success: true, isSaved: !isSaved };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 401;
      return { error: err.message };
    }
  })
  .post("/saved-listings/:id", async ({ params, user, set }) => {
    try {
      const auth = requireAuth(user);
      await User.findByIdAndUpdate(auth.id, {
        $addToSet: { savedListings: params.id },
      });
      return { msg: "Saved" };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 401;
      return { error: err.message };
    }
  })
  .delete("/saved-listings/:id", async ({ params, user, set }) => {
    try {
      const auth = requireAuth(user);
      await User.findByIdAndUpdate(auth.id, {
        $pull: { savedListings: params.id },
      });
      return { msg: "Removed from saved" };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 401;
      return { error: err.message };
    }
  })
  .post("/reputation/feedback", async ({ body, user, set }) => {
    try {
      const data = body as {
        listing_id?: string;
        farmer_id?: string;
        buyer_name?: string;
        buyer_phone?: string;
        rating?: number;
        comment?: string;
      };
      if (!data.listing_id || !data.buyer_name || data.rating == null) {
        set.status = 400;
        return {
          error: "listing_id, buyer_name, and rating are required",
        };
      }
      if (data.rating < 1 || data.rating > 5) {
        set.status = 400;
        return { error: "Rating must be between 1 and 5" };
      }
      const feedback = await submitFeedback({
        listing_id: data.listing_id,
        farmer_id: data.farmer_id,
        buyer_id: user?.id,
        buyer_name: data.buyer_name,
        buyer_phone: data.buyer_phone,
        rating: data.rating,
        comment: data.comment,
      });
      set.status = 201;
      return {
        success: true,
        message: "Feedback submitted successfully",
        feedback: {
          id: feedback._id,
          rating: feedback.rating,
          comment: feedback.comment,
        },
      };
    } catch (e) {
      const err = e as Error;
      if (err.message.includes("already submitted")) {
        set.status = 400;
        return { error: err.message };
      }
      set.status = 500;
      return { error: "Failed to submit feedback" };
    }
  })
  .get(
    "/reputation/farmer/:farmerId/feedbacks",
    async ({ params, query, set }) => {
      try {
        const limit = parseInt(
          (query as { limit?: string }).limit || "10",
          10
        );
        const feedbacks = await getFarmerFeedbacks(params.farmerId, limit);
        return { success: true, count: feedbacks.length, feedbacks };
      } catch (e) {
        set.status = 500;
        return { error: "Failed to get feedbacks" };
      }
    },
    { params: t.Object({ farmerId: t.String() }) }
  )
  .get(
    "/reputation/farmer/:farmerId",
    async ({ params, set }) => {
      try {
        const reputation = await getReputationBreakdown(params.farmerId);
        return { success: true, reputation };
      } catch (e) {
        set.status = 500;
        return { error: "Failed to get reputation" };
      }
    },
    { params: t.Object({ farmerId: t.String() }) }
  )
  .get(
    "/reputation/listing/:listingId/feedbacks",
    async ({ params, query, set }) => {
      try {
        const limit = parseInt(
          (query as { limit?: string }).limit || "20",
          10
        );
        const feedbacks = await Feedback.find({ listing_id: params.listingId })
          .populate("listing_id", "cropType quantity price")
          .sort({ created_at: -1 })
          .limit(limit);
        return { success: true, count: feedbacks.length, feedbacks };
      } catch (e) {
        set.status = 500;
        return { error: "Failed to get feedbacks" };
      }
    },
    { params: t.Object({ listingId: t.String() }) }
  )
  .get("/reputation/top-farmers", async ({ query }) => {
    const limit = parseInt((query as { limit?: string }).limit || "10", 10);
    const farmers = await getTopFarmers(limit);
    return { success: true, count: farmers.length, farmers };
  })
  .put(
    "/reputation/listing/:listingId/sold",
    async ({ params, user, set }) => {
      try {
        requireAuth(user);
        if (!params.listingId || params.listingId === "undefined") {
          set.status = 400;
          return { error: "Invalid listing ID" };
        }
        const listing = await onListingSold(params.listingId);
        return {
          success: true,
          message: "Listing marked as sold",
          listing: {
            id: listing._id,
            status: listing.status,
            sold_at: listing.sold_at,
          },
        };
      } catch (e) {
        const err = e as Error;
        set.status = 500;
        return { error: err.message || "Failed to update listing" };
      }
    },
    { params: t.Object({ listingId: t.String() }) }
  )
  .put(
    "/reputation/listing/:listingId/verify",
    async ({ params, user, set }) => {
      try {
        const auth = requireAuth(user);
        const listing = await onListingVerified(
          params.listingId,
          auth.username || "admin"
        );
        return {
          success: true,
          message: "Listing verified",
          listing: {
            id: listing._id,
            verified: listing.verified,
            verified_at: listing.verified_at,
          },
        };
      } catch (e) {
        set.status = 500;
        return { error: "Failed to verify listing" };
      }
    },
    { params: t.Object({ listingId: t.String() }) }
  )
  .get("/reputation/config", () => ({
    success: true,
    explanation: {
      en: "Reputation score is calculated using successful sales (40%), verified listings (30%), and buyer feedback (30%). New farmers start at 3.0 (neutral).",
      si: "කීර්තිමත් ලකුණු ගණනය කරනු ලබන්නේ සාර්ථක විකුණුම් (40%), සත්‍යාපිත ලැයිස්තුගත කිරීම් (30%), සහ ගැනුම්කරුවන්ගේ ප්‍රතිපෝෂණය (30%) භාවිතයෙනි. නව ගොවීන් 3.0 (මධ්‍යස්ථ) වලින් ආරම්භ කරයි.",
    },
    config: {
      weights: REPUTATION_CONFIG.weights,
      normalization: REPUTATION_CONFIG.normalization,
      scoreRange: {
        min: REPUTATION_CONFIG.minScore,
        max: REPUTATION_CONFIG.maxScore,
        default: REPUTATION_CONFIG.defaultScore,
      },
    },
  }))
  .get("/reputation/stats", async ({ set }) => {
    try {
      const [totalFarmers, totalFeedbacks, totalVerifiedListings, totalSales] =
        await Promise.all([
          User.countDocuments({ total_sales: { $gt: 0 } }),
          Feedback.countDocuments(),
          Listing.countDocuments({ verified: true }),
          Listing.countDocuments({ status: "sold" }),
        ]);
      const avgReputation = await User.aggregate([
        { $match: { total_sales: { $gt: 0 } } },
        { $group: { _id: null, avg: { $avg: "$reputation_score" } } },
      ]);
      return {
        success: true,
        stats: {
          totalFarmers,
          totalFeedbacks,
          totalVerifiedListings,
          totalSales,
          averageReputation:
            avgReputation[0]?.avg?.toFixed(1) || "3.0",
        },
      };
    } catch (e) {
      set.status = 500;
      return { error: "Failed to get stats" };
    }
  });
