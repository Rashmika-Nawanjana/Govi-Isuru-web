import mongoose, { Schema } from "mongoose";

const WhatsAppLinkSchema = new Schema({
  jid: { type: String, required: true, unique: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  language: { type: String, enum: ["en", "si", "ta"], default: "en" },
  notificationsEnabled: { type: Boolean, default: true },
  linkedAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
});

WhatsAppLinkSchema.index({ userId: 1 });

export const WhatsAppLink = mongoose.model("WhatsAppLink", WhatsAppLinkSchema);