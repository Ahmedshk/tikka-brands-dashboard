import mongoose from "mongoose";
import { LocationModel } from "../models/location.model.js";

export function locationIdFromNotificationData(data: unknown): string | null {
  if (data == null || typeof data !== "object") return null;
  const raw = (data as Record<string, unknown>).locationId;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

export async function locationLabelFromNotificationData(
  data: unknown,
): Promise<string | undefined> {
  const lid = locationIdFromNotificationData(data);
  if (!lid || !mongoose.isValidObjectId(lid)) return undefined;
  const loc = await LocationModel.findById(lid).select("storeName").lean();
  const name = typeof loc?.storeName === "string" ? loc.storeName.trim() : "";
  return name || undefined;
}
