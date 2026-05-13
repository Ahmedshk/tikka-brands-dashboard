import mongoose from "mongoose";
import { LocationModel } from "../models/location.model.js";
import { locationIdFromNotificationData } from "./notificationLocationData.util.js";

export async function enrichNotificationsWithLocationLabels(
  notifications: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const idSet = new Set<string>();
  for (const n of notifications) {
    const lid = locationIdFromNotificationData(n.data);
    if (lid && mongoose.isValidObjectId(lid)) idSet.add(lid);
  }
  if (idSet.size === 0) {
    return notifications;
  }
  const ids = [...idSet].map((id) => new mongoose.Types.ObjectId(id));
  const locations = await LocationModel.find({ _id: { $in: ids } })
    .select("storeName")
    .lean();
  const storeNameById = new Map<string, string>();
  for (const loc of locations) {
    const name = typeof loc.storeName === "string" ? loc.storeName.trim() : "";
    if (name) storeNameById.set(String(loc._id), name);
  }
  return notifications.map((n) => {
    const lid = locationIdFromNotificationData(n.data);
    const locationLabel = lid ? storeNameById.get(lid) : undefined;
    if (!locationLabel) return n;
    return { ...n, locationLabel };
  });
}
