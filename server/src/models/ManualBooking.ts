import mongoose, { Schema } from "mongoose";

const InstructorSlotSchema = new Schema({
  instructorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  instructorName: { type: String, required: true },
  district: { type: String, required: true, index: true },
  dsDivision: { type: String, default: null },
  gnDivision: { type: String, default: null },
  startAt: { type: Date, required: true, index: true },
  endAt: { type: Date, required: true },
  mode: {
    type: String,
    enum: ["in_person", "phone", "video"],
    default: "in_person",
  },
  locationText: { type: String, default: null },
  notes: { type: String, default: "" },
  status: {
    type: String,
    enum: ["open", "reserved", "closed", "cancelled"],
    default: "open",
    index: true,
  },
  reservedByBookingId: {
    type: Schema.Types.ObjectId,
    ref: "ManualBooking",
    default: null,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const InstructorSlot = mongoose.model(
  "InstructorSlot",
  InstructorSlotSchema
);

const ManualBookingSchema = new Schema({
  farmerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  farmerName: { type: String, required: true },
  instructorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  instructorName: { type: String, required: true },
  slotId: {
    type: Schema.Types.ObjectId,
    ref: "InstructorSlot",
    required: true,
    unique: true,
  },
  scheduledStartAt: { type: Date, required: true },
  scheduledEndAt: { type: Date, required: true },
  mode: {
    type: String,
    enum: ["in_person", "phone", "video"],
    default: "in_person",
  },
  locationText: { type: String, default: null },
  topic: { type: String, required: true },
  description: { type: String, default: "" },
  status: {
    type: String,
    enum: ["pending", "accepted", "rejected", "cancelled", "completed"],
    default: "pending",
    index: true,
  },
  instructorResponseNote: { type: String, default: "" },
  adviceText: { type: String, default: "" },
  feeCredits: { type: Number, default: 40 },
  paymentStatus: {
    type: String,
    enum: ["not_charged", "charged"],
    default: "not_charged",
  },
  chargedAt: { type: Date },
  videoRoomUrl: { type: String, default: null },
  videoRoomName: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

export const ManualBooking = mongoose.model(
  "ManualBooking",
  ManualBookingSchema
);
