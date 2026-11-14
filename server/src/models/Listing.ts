import mongoose, { Schema } from "mongoose";

const ListingSchema = new Schema({
  farmer_id: { type: Schema.Types.ObjectId, ref: "User" },
  farmerName: { type: String, required: true },
  cropType: { type: String, required: true },
  quantity: { type: String },
  price: { type: String },
  location: { type: String },
  phone: { type: String },
  verified: { type: Boolean, default: false },
  verified_at: { type: Date },
  verified_by: { type: String },
  status: {
    type: String,
    enum: ["active", "sold", "expired", "removed"],
    default: "active",
  },
  sold_at: { type: Date },
  description: { type: String, default: "" },
  images: [{ type: String }],
  harvest_date: { type: Date },
  district: { type: String },
  gn_division: { type: String },
  view_count: { type: Number, default: 0 },
  inquiry_count: { type: Number, default: 0 },
  date: { type: Date, default: Date.now },
});

ListingSchema.index({ farmer_id: 1, status: 1 });
ListingSchema.index({ status: 1, date: -1 });

export const Listing = mongoose.model("Listing", ListingSchema);
