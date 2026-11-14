import mongoose, { Schema } from "mongoose";

const FeedbackSchema = new Schema({
  listing_id: {
    type: Schema.Types.ObjectId,
    ref: "Listing",
    required: true,
  },
  farmer_id: { type: Schema.Types.ObjectId, ref: "User", required: false },
  buyer_id: { type: Schema.Types.ObjectId, ref: "User", required: false },
  buyer_name: { type: String, required: true },
  buyer_phone: { type: String, default: "" },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: "", maxlength: 500 },
  quality_rating: { type: Number, min: 1, max: 5 },
  price_fairness: { type: Number, min: 1, max: 5 },
  communication: { type: Number, min: 1, max: 5 },
  is_verified_purchase: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
});

FeedbackSchema.index({ listing_id: 1 });
FeedbackSchema.index({ farmer_id: 1, created_at: -1 });

export const Feedback = mongoose.model("Feedback", FeedbackSchema);