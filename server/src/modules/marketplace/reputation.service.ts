import { Feedback } from "../../models/Feedback";
import { Listing } from "../../models/Listing";
import { User } from "../../models/User";

export const REPUTATION_CONFIG = {
  weights: { sales: 0.4, verified: 0.3, feedback: 0.3 },
  normalization: { salesMax: 10, verifiedMax: 10 },
  minScore: 1.0,
  maxScore: 5.0,
  defaultScore: 3.0,
};

function normalizeScore(count: number, max: number) {
  return Math.min(count / max, 1) * 5;
}

function calculateAverageRating(
  feedbacks: Array<{ rating: number }>
): number {
  if (!feedbacks.length) return REPUTATION_CONFIG.defaultScore;
  return feedbacks.reduce((acc, fb) => acc + fb.rating, 0) / feedbacks.length;
}

export async function calculateReputation(farmerId: string) {
  const farmer = await User.findById(farmerId);
  if (!farmer) throw new Error("Farmer not found");

  const feedbacks = await Feedback.find({ farmer_id: farmerId });
  const totalSales = await Listing.countDocuments({
    farmer_id: farmerId,
    status: "sold",
  });
  const verifiedListings = await Listing.countDocuments({
    farmer_id: farmerId,
    verified: true,
  });

  const salesScore = normalizeScore(
    totalSales,
    REPUTATION_CONFIG.normalization.salesMax
  );
  const verifiedScore = normalizeScore(
    verifiedListings,
    REPUTATION_CONFIG.normalization.verifiedMax
  );
  const feedbackScore = calculateAverageRating(feedbacks);

  const { weights } = REPUTATION_CONFIG;
  let finalScore =
    salesScore * weights.sales +
    verifiedScore * weights.verified +
    feedbackScore * weights.feedback;

  finalScore = Math.max(
    REPUTATION_CONFIG.minScore,
    Math.min(finalScore, REPUTATION_CONFIG.maxScore)
  );

  farmer.reputation_score = Math.round(finalScore * 10) / 10;
  farmer.total_sales = totalSales;
  farmer.verified_listings = verifiedListings;
  farmer.total_feedbacks = feedbacks.length;
  await farmer.save();

  return {
    farmerId: farmer._id,
    username: farmer.username,
    reputation_score: farmer.reputation_score,
    breakdown: {
      sales: {
        count: totalSales,
        score: Math.round(salesScore * 10) / 10,
        weight: `${weights.sales * 100}%`,
        maxForFullScore: REPUTATION_CONFIG.normalization.salesMax,
      },
      verified: {
        count: verifiedListings,
        score: Math.round(verifiedScore * 10) / 10,
        weight: `${weights.verified * 100}%`,
        maxForFullScore: REPUTATION_CONFIG.normalization.verifiedMax,
      },
      feedback: {
        count: feedbacks.length,
        averageRating: Math.round(feedbackScore * 10) / 10,
        weight: `${weights.feedback * 100}%`,
      },
    },
    is_verified_farmer: farmer.is_verified_farmer,
  };
}

export async function getReputationBreakdown(farmerId: string) {
  return calculateReputation(farmerId);
}

export async function onListingSold(listingId: string) {
  const listing = await Listing.findById(listingId);
  if (!listing) throw new Error("Listing not found");

  listing.status = "sold";
  listing.sold_at = new Date();
  await listing.save();

  if (listing.farmer_id) {
    await calculateReputation(listing.farmer_id.toString());
  }

  return listing;
}

export async function onListingVerified(
  listingId: string,
  adminUsername: string
) {
  const listing = await Listing.findById(listingId);
  if (!listing) throw new Error("Listing not found");

  listing.verified = true;
  listing.verified_at = new Date();
  listing.verified_by = adminUsername;
  await listing.save();

  if (listing.farmer_id) {
    await calculateReputation(listing.farmer_id.toString());
  }

  return listing;
}

export async function submitFeedback(feedbackData: {
  listing_id: string;
  farmer_id?: string;
  buyer_id?: string;
  buyer_name: string;
  buyer_phone?: string;
  rating: number;
  comment?: string;
}) {
  const { listing_id, farmer_id, buyer_name, buyer_phone, rating, comment } =
    feedbackData;

  if (feedbackData.buyer_id) {
    const existing = await Feedback.findOne({
      listing_id,
      buyer_id: feedbackData.buyer_id,
    });
    if (existing) {
      throw new Error("You have already submitted feedback for this listing");
    }
  }

  const listing = await Listing.findById(listing_id);
  if (!listing) throw new Error("Listing not found");

  if (
    feedbackData.buyer_id &&
    listing.farmer_id &&
    String(listing.farmer_id) === String(feedbackData.buyer_id)
  ) {
    throw new Error("You cannot rate your own listing");
  }

  const feedback = await Feedback.create({
    listing_id,
    farmer_id: farmer_id || listing.farmer_id,
    buyer_id: feedbackData.buyer_id,
    buyer_name,
    buyer_phone,
    rating,
    comment,
    is_verified_purchase: listing.status === "sold",
  });

  const resolvedFarmerId = farmer_id || listing.farmer_id;
  if (resolvedFarmerId) {
    await calculateReputation(resolvedFarmerId.toString());
  }

  return feedback;
}

export async function getFarmerFeedbacks(farmerId: string, limit = 10) {
  return Feedback.find({ farmer_id: farmerId })
    .populate("listing_id", "cropType quantity price")
    .sort({ created_at: -1 })
    .limit(limit);
}

export async function getTopFarmers(limit = 10) {
  return User.find({ total_sales: { $gt: 0 } })
    .select(
      "username district gnDivision reputation_score total_sales verified_listings total_feedbacks is_verified_farmer"
    )
    .sort({ reputation_score: -1 })
    .limit(limit);
}