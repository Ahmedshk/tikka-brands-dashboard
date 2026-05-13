import mongoose from "mongoose";
import { UserModel } from "../models/user.model.js";

type LeanRole = {
  locationAccess?: string;
  locationIds?: Array<{ toString(): string }>;
} | null;

function userHasLocationAccess(
  user: {
    locationOverrides?: mongoose.Types.ObjectId[];
    locationRemovals?: mongoose.Types.ObjectId[];
  },
  role: LeanRole,
  locationId: string,
): boolean {
  const removals = new Set((user.locationRemovals ?? []).map(String));
  if (removals.has(locationId)) return false;

  if (!role) return true;
  if (role.locationAccess !== "specific" || !role.locationIds?.length) {
    return true;
  }

  const allowed = new Set(role.locationIds.map((id) => id.toString()));
  for (const ov of user.locationOverrides ?? []) {
    allowed.add(String(ov));
  }
  for (const rm of user.locationRemovals ?? []) {
    allowed.delete(String(rm));
  }
  return allowed.has(locationId);
}

/** Active users with the given role who may access the event location (role + overrides − removals). */
type LeanUserForLocation = {
  _id: mongoose.Types.ObjectId;
  locationOverrides?: mongoose.Types.ObjectId[];
  locationRemovals?: mongoose.Types.ObjectId[];
  roleId: unknown;
};

export async function listUserIdsForRoleAtLocation(
  roleId: string,
  locationId: string,
): Promise<string[]> {
  if (!mongoose.Types.ObjectId.isValid(roleId)) return [];

  const users = await UserModel.find({
    roleId,
    isActive: true,
    $or: [{ isTerminated: false }, { isTerminated: { $exists: false } }],
  })
    .select("_id locationOverrides locationRemovals roleId")
    .populate("roleId", "locationAccess locationIds")
    .lean<LeanUserForLocation[]>();

  const out: string[] = [];
  for (const u of users) {
    const role = u.roleId as LeanRole;
    const userSlice: {
      locationOverrides?: mongoose.Types.ObjectId[];
      locationRemovals?: mongoose.Types.ObjectId[];
    } = {};
    if (u.locationOverrides != null) userSlice.locationOverrides = u.locationOverrides;
    if (u.locationRemovals != null) userSlice.locationRemovals = u.locationRemovals;
    if (userHasLocationAccess(userSlice, role, locationId)) {
      out.push(String(u._id));
    }
  }
  return out;
}
