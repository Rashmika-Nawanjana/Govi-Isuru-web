import mongoose, { Schema } from "mongoose";

const WhatsAppLinkCodeSchema = new Schema({
  code: { type: String, required: true, unique: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

WhatsAppLinkCodeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 600 });

export const WhatsAppLinkCode = mongoose.model(
  "WhatsAppLinkCode",
  WhatsAppLinkCodeSchema
);