import { CREDIT_COSTS } from "@govi/shared";
import { Elysia } from "elysia";
import { env } from "../../infrastructure/env";
import {
  InstructorSlot,
  ManualBooking,
} from "../../models/ManualBooking";
import { Notification } from "../../models/Notification";
import { User } from "../../models/User";
import { authPlugin, requireAuth } from "../../plugins/auth";
import { deductCredits } from "../../plugins/credits";

const FEE = CREDIT_COSTS.BOOKING;

function oidOk(id?: string) {
  return /^[a-f\d]{24}$/i.test(id || "");
}

async function createDailyRoom(name: string) {
  if (!env.dailyApiKey) return null;
  const res = await fetch("https://api.daily.co/v1/rooms", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.dailyApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: name.slice(0, 40),
      properties: { exp: Math.floor(Date.now() / 1000) + 60 * 60 * 4 },
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { url?: string; name?: string };
  return data;
}

/** Matches original Express paths under /api/manual-bookings */
export const consultationController = new Elysia({
  prefix: "/api/manual-bookings",
})
  .use(authPlugin)
  .get("/instructors", async ({ user, set }) => {
    try {
      const auth = requireAuth(user);
      const me = await User.findById(auth.id);
      if (!me) {
        set.status = 404;
        return { success: false, msg: "User not found" };
      }
      const query: Record<string, unknown> = {
        role: "officer",
        isApproved: true,
      };
      if (me.role === "farmer") query.district = me.district;
      const instructors = await User.find(query)
        .select(
          "_id fullName username district dsDivision gnDivision designation officerId"
        )
        .sort({ fullName: 1, username: 1 });
      return { success: true, instructors };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { success: false, msg: err.message };
    }
  })
  .get("/instructors/:instructorId/slots", async ({ user, params, set }) => {
    try {
      requireAuth(user);
      if (!oidOk(params.instructorId)) {
        set.status = 400;
        return { success: false, msg: "Invalid instructor id" };
      }
      const now = new Date();
      const slots = await InstructorSlot.find({
        instructorId: params.instructorId,
        status: "open",
        endAt: { $gt: now },
      }).sort({ startAt: 1 });
      return { success: true, slots, serverTime: now.toISOString() };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { success: false, msg: err.message };
    }
  })
  .post("/slots", async ({ user, body, set }) => {
    try {
      const auth = requireAuth(user);
      const me = await User.findById(auth.id);
      if (!me || me.role !== "officer") {
        set.status = 403;
        return {
          success: false,
          msg: "Only agricultural instructors can create slots",
        };
      }
      const { startAt, endAt, mode, locationText, notes } = body as {
        startAt?: string;
        endAt?: string;
        mode?: string;
        locationText?: string;
        notes?: string;
      };
      if (!startAt || !endAt) {
        set.status = 400;
        return { success: false, msg: "startAt and endAt are required" };
      }
      const parsedStartAt = new Date(startAt);
      const parsedEndAt = new Date(endAt);
      if (parsedEndAt <= parsedStartAt) {
        set.status = 400;
        return { success: false, msg: "endAt must be after startAt" };
      }
      const overlapping = await InstructorSlot.findOne({
        instructorId: me._id,
        status: { $in: ["open", "reserved"] },
        startAt: { $lt: parsedEndAt },
        endAt: { $gt: parsedStartAt },
      });
      if (overlapping) {
        set.status = 409;
        return { success: false, msg: "Slot overlaps an existing active slot" };
      }
      const slot = await InstructorSlot.create({
        instructorId: me._id,
        instructorName: me.fullName || me.username,
        district: me.district,
        dsDivision: me.dsDivision,
        gnDivision: me.gnDivision,
        startAt: parsedStartAt,
        endAt: parsedEndAt,
        mode: ["in_person", "phone", "video"].includes(mode || "")
          ? mode
          : "in_person",
        locationText: locationText || "",
        notes: notes || "",
        status: "open",
      });
      set.status = 201;
      return { success: true, slot };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { success: false, msg: err.message };
    }
  })
  .get("/slots/mine", async ({ user, query, set }) => {
    try {
      const auth = requireAuth(user);
      const me = await User.findById(auth.id);
      if (!me || me.role !== "officer") {
        set.status = 403;
        return { success: false, msg: "Only agricultural instructors can view own slots" };
      }
      const filter: Record<string, unknown> = { instructorId: me._id };
      const statusFilter = (query as { status?: string }).status;
      if (statusFilter && statusFilter !== "all") filter.status = statusFilter;
      const slots = await InstructorSlot.find(filter).sort({ startAt: 1 });
      return { success: true, slots };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { success: false, msg: err.message };
    }
  })
  .delete("/slots/:slotId", async ({ user, params, set }) => {
    try {
      const auth = requireAuth(user);
      const me = await User.findById(auth.id);
      if (!me || me.role !== "officer") {
        set.status = 403;
        return { success: false, msg: "Only agricultural instructors can remove slots" };
      }
      const slot = await InstructorSlot.findOne({
        _id: params.slotId,
        instructorId: me._id,
      });
      if (!slot) {
        set.status = 404;
        return { success: false, msg: "Slot not found" };
      }
      if (slot.status !== "open") {
        set.status = 409;
        return { success: false, msg: "Only open slots can be removed" };
      }
      await slot.deleteOne();
      return { success: true, msg: "Slot removed" };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { success: false, msg: err.message };
    }
  })
  .post("/bookings", async ({ user, body, set }) => {
    try {
      const auth = requireAuth(user);
      const me = await User.findById(auth.id);
      if (!me || me.role !== "farmer") {
        set.status = 403;
        return { success: false, msg: "Only farmers can create manual bookings" };
      }
      const { slotId, topic, description } = body as {
        slotId?: string;
        topic?: string;
        description?: string;
      };
      if (!oidOk(slotId)) {
        set.status = 400;
        return { success: false, msg: "Valid slotId is required" };
      }
      if (!topic?.trim()) {
        set.status = 400;
        return { success: false, msg: "Booking topic is required" };
      }
      const slot = await InstructorSlot.findById(slotId);
      if (!slot || slot.status !== "open") {
        set.status = 409;
        return { success: false, msg: "This slot is no longer available" };
      }
      const booking = await ManualBooking.create({
        farmerId: me._id,
        farmerName: me.fullName || me.username,
        instructorId: slot.instructorId,
        instructorName: slot.instructorName,
        slotId: slot._id,
        scheduledStartAt: slot.startAt,
        scheduledEndAt: slot.endAt,
        mode: slot.mode,
        locationText: slot.locationText,
        topic: topic.trim(),
        description: description || "",
        feeCredits: FEE,
        status: "pending",
      });
      slot.status = "reserved";
      slot.reservedByBookingId = booking._id;
      await slot.save();
      set.status = 201;
      return { success: true, booking };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { success: false, msg: err.message };
    }
  })
  .get("/bookings/farmer/mine", async ({ user, set }) => {
    try {
      const auth = requireAuth(user);
      const bookings = await ManualBooking.find({ farmerId: auth.id })
        .sort({ createdAt: -1 })
        .lean();
      return { success: true, bookings };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { success: false, msg: err.message };
    }
  })
  .get("/bookings/instructor/mine", async ({ user, query, set }) => {
    try {
      const auth = requireAuth(user);
      const filter: Record<string, unknown> = { instructorId: auth.id };
      const statusFilter = (query as { status?: string }).status;
      if (statusFilter && statusFilter !== "all") filter.status = statusFilter;
      const bookings = await ManualBooking.find(filter)
        .sort({ scheduledStartAt: 1 })
        .lean();
      return { success: true, bookings };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { success: false, msg: err.message };
    }
  })
  .put("/bookings/:bookingId/respond", async ({ user, params, body, set }) => {
    try {
      const auth = requireAuth(user);
      const { action, note } = body as { action?: string; note?: string };
      if (!["accept", "reject"].includes(action || "")) {
        set.status = 400;
        return { success: false, msg: "Action must be accept or reject" };
      }
      const booking = await ManualBooking.findOne({
        _id: params.bookingId,
        instructorId: auth.id,
      });
      if (!booking) {
        set.status = 404;
        return { success: false, msg: "Booking not found" };
      }
      const slot = await InstructorSlot.findById(booking.slotId);
      if (action === "accept") {
        booking.status = "accepted";
        booking.instructorResponseNote = note || "";
        if (slot) slot.status = "reserved";
      } else {
        booking.status = "rejected";
        booking.instructorResponseNote = note || "";
        if (slot) {
          slot.status = "open";
          slot.reservedByBookingId = null;
        }
      }
      await booking.save();
      if (slot) await slot.save();
      return { success: true, booking };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { success: false, msg: err.message };
    }
  })
  .put("/bookings/:bookingId/complete", async ({ user, params, body, set }) => {
    try {
      const auth = requireAuth(user);
      const booking = await ManualBooking.findOne({
        _id: params.bookingId,
        instructorId: auth.id,
      });
      if (!booking) {
        set.status = 404;
        return { success: false, msg: "Booking not found" };
      }
      if (booking.status !== "accepted") {
        set.status = 409;
        return { success: false, msg: "Only accepted bookings can be completed" };
      }
      const fee = Math.max(0, Number(booking.feeCredits || FEE));
      if (booking.paymentStatus !== "charged") {
        await deductCredits(String(booking.farmerId), fee);
        booking.paymentStatus = "charged";
        booking.chargedAt = new Date();
      }
      booking.status = "completed";
      booking.adviceText =
        (body as { adviceText?: string }).adviceText || booking.adviceText;
      await booking.save();
      const slot = await InstructorSlot.findById(booking.slotId);
      if (slot) {
        slot.status = "closed";
        await slot.save();
      }
      return { success: true, booking, chargedCredits: fee };
    } catch (e) {
      const err = e as Error & { status?: number; body?: unknown };
      set.status = err.status || 500;
      return err.body || { success: false, msg: err.message };
    }
  })
  .put("/bookings/:bookingId/cancel", async ({ user, params, set }) => {
    try {
      const auth = requireAuth(user);
      const booking = await ManualBooking.findOne({
        _id: params.bookingId,
        farmerId: auth.id,
      });
      if (!booking) {
        set.status = 404;
        return { success: false, msg: "Booking not found" };
      }
      if (!["pending", "accepted"].includes(booking.status)) {
        set.status = 409;
        return { success: false, msg: "This booking cannot be cancelled" };
      }
      booking.status = "cancelled";
      await booking.save();
      const slot = await InstructorSlot.findById(booking.slotId);
      if (slot) {
        slot.status = "open";
        slot.reservedByBookingId = null;
        await slot.save();
      }
      return { success: true, booking };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { success: false, msg: err.message };
    }
  })
  .get("/notifications/farmer", async ({ user, set }) => {
    try {
      const auth = requireAuth(user);
      const notifications = await Notification.find({
        recipientUserId: auth.id,
        recipientRole: "farmer",
        type: "system",
      })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean();
      const unreadCount = notifications.filter((n) => !n.read).length;
      return {
        success: true,
        notifications,
        unreadCount,
        count: notifications.length,
      };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { success: false, msg: err.message };
    }
  })
  .put("/notifications/farmer/:id/read", async ({ user, params, set }) => {
    try {
      const auth = requireAuth(user);
      const notification = await Notification.findOneAndUpdate(
        {
          _id: params.id,
          recipientUserId: auth.id,
          recipientRole: "farmer",
        },
        { $set: { read: true } },
        { new: true }
      );
      if (!notification) {
        set.status = 404;
        return { success: false, msg: "Notification not found" };
      }
      return { success: true, notification };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { success: false, msg: err.message };
    }
  })
  .post("/bookings/:bookingId/video-session", async ({ user, params, set }) => {
    try {
      const auth = requireAuth(user);
      const booking = await ManualBooking.findById(params.bookingId);
      if (!booking) {
        set.status = 404;
        return { success: false, msg: "Booking not found" };
      }
      const uid = auth.id;
      if (
        String(booking.farmerId) !== uid &&
        String(booking.instructorId) !== uid
      ) {
        set.status = 403;
        return { success: false, msg: "Not allowed" };
      }
      if (booking.mode !== "video" || booking.status !== "accepted") {
        set.status = 400;
        return {
          success: false,
          msg: "Video call only for accepted video bookings",
        };
      }
      let roomUrl = booking.videoRoomUrl;
      if (!roomUrl) {
        const room = await createDailyRoom(`govi-${booking._id}`);
        if (!room?.url) {
          set.status = 503;
          return {
            success: false,
            msg: "Video rooms not configured (set DAILY_API_KEY)",
          };
        }
        roomUrl = room.url;
        booking.videoRoomUrl = roomUrl;
        booking.videoRoomName = room.name || null;
        await booking.save();
      }
      return { success: true, url: roomUrl, roomUrl, booking };
    } catch (e) {
      const err = e as Error & { status?: number };
      set.status = err.status || 500;
      return { success: false, msg: err.message };
    }
  });

/** Keep short aliases used by earlier migration UI */
export const consultationAliases = new Elysia({ prefix: "/api" })
  .use(authPlugin)
  .get("/instructors", async ({ request }) => {
    const url = new URL(request.url);
    return fetch(
      new Request(
        `${url.origin}/api/manual-bookings/instructors`,
        request
      )
    ).then((r) => r.json());
  })
  .get("/bookings", async ({ request }) => {
    const url = new URL(request.url);
    return fetch(
      new Request(
        `${url.origin}/api/manual-bookings/bookings/farmer/mine`,
        request
      )
    ).then((r) => r.json());
  });
