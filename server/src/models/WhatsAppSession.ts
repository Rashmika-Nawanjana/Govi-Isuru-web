import mongoose, { Schema } from "mongoose";

const WhatsAppSessionSchema = new Schema({
  jid: { type: String, required: true, unique: true, index: true },
  flow: { type: String, default: null },
  step: { type: Number, default: 0 },
  draft: { type: Schema.Types.Mixed, default: {} },
  updatedAt: { type: Date, default: Date.now },
});

WhatsAppSessionSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 1800 });

export const WhatsAppSession = mongoose.model(
  "WhatsAppSession",
  WhatsAppSessionSchema
);