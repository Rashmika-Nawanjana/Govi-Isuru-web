import { User } from "../models/User";

export async function deductCredits(userId: string, cost: number) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const currentUser = await User.findById(userId);
  if (!currentUser) {
    const err = new Error("User not found");
    (err as Error & { status: number }).status = 404;
    throw err;
  }

  if (currentUser.credits == null) currentUser.credits = 200;
  if (currentUser.dailyLimit == null) currentUser.dailyLimit = 200;

  if (
    !currentUser.lastCreditReset ||
    currentUser.lastCreditReset < startOfToday
  ) {
    const resetCredits = Math.max(currentUser.credits, currentUser.dailyLimit);
    await User.updateOne(
      { _id: userId },
      { $set: { credits: resetCredits, lastCreditReset: new Date() } }
    );
    currentUser.credits = resetCredits;
  }

  if (currentUser.credits < cost) {
    const err = new Error("Insufficient credits");
    (err as Error & { status: number; body: unknown }).status = 403;
    (err as Error & { body: unknown }).body = {
      error: "Insufficient credits",
      msg: "You have used your daily credit limit. Please upgrade or wait for midnight reset.",
      credits: currentUser.credits,
      cost,
    };
    throw err;
  }

  const updated = await User.findOneAndUpdate(
    { _id: userId, credits: { $gte: cost } },
    { $inc: { credits: -cost } },
    { new: true }
  );

  if (!updated) {
    const err = new Error("Insufficient credits");
    (err as Error & { status: number }).status = 403;
    throw err;
  }

  return updated.credits;
}

export async function refundCredits(userId: string, amount: number) {
  if (!userId || amount <= 0) return;
  await User.updateOne({ _id: userId }, { $inc: { credits: amount } });
}
