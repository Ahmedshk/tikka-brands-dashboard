import mongoose from "mongoose";
import { UserModel } from "../models/user.model.js";

/** First names for transactional emails (calendar, alerts, etc.). */
export async function loadFirstNamesByUserId(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const ids = userIds.map((id) => new mongoose.Types.ObjectId(id));
  const users = await UserModel.find({ _id: { $in: ids } }).select("firstName").lean();
  return new Map(
    users.map((u) => {
      const doc = u as { _id: mongoose.Types.ObjectId; firstName?: string };
      return [doc._id.toString(), doc.firstName?.trim() ?? ""];
    }),
  );
}
