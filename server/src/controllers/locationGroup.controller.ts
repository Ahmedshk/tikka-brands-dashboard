import { Request, Response, NextFunction } from 'express';
import { LocationGroupService } from '../services/locationGroup.service.js';
import { locationListFilterForUser } from '../utils/locationAccessFilter.util.js';
import { BadRequestError } from '../utils/errors.util.js';

const locationGroupService = new LocationGroupService();

/** Express 5 types `req.params` values as `string | string[]`; routes here are single-segment. */
function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

/**
 * Groups for the header location selector.
 *
 * Open to any authenticated user (the navbar needs it), but each group's member
 * ids are narrowed to that user's allow-list minus their removals, and groups
 * left with no accessible members are dropped entirely.
 */
export const getLocationGroups = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const filter = locationListFilterForUser(req.user);
    const groups = await locationGroupService.listForUser(filter);
    res.status(200).json({ success: true, data: { groups } });
  } catch (error) {
    next(error);
  }
};

/**
 * Every group with all members, for the Location Management screen.
 *
 * Unlike `GET /` this is unfiltered, so a newly created (empty) group is
 * visible and its locations can be assigned. Requires location-management.
 */
export const getLocationGroupsForManagement = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const groups = await locationGroupService.listAllWithMembers();
    res.status(200).json({ success: true, data: { groups } });
  } catch (error) {
    next(error);
  }
};

export const getLocationGroup = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const group = await locationGroupService.getById(param(req, 'id'));
    res.status(200).json({ success: true, data: { group } });
  } catch (error) {
    next(error);
  }
};

export const createLocationGroup = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const group = await locationGroupService.create({ name: req.body.name ?? '' });
    res.status(201).json({ success: true, data: { group } });
  } catch (error) {
    next(error);
  }
};

export const updateLocationGroup = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name : undefined;
    const group = await locationGroupService.update(param(req, 'id'), { ...(name != null && { name }) });
    res.status(200).json({ success: true, data: { group } });
  } catch (error) {
    next(error);
  }
};

export const deleteLocationGroup = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await locationGroupService.delete(param(req, 'id'));
    res.status(200).json({ success: true, data: { success: true } });
  } catch (error) {
    next(error);
  }
};

export const reorderLocationGroups = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const groupIds = req.body.groupIds;
    if (!Array.isArray(groupIds)) throw new BadRequestError('groupIds is required');
    await locationGroupService.reorder(groupIds.map(String));
    res.status(200).json({ success: true, data: { success: true } });
  } catch (error) {
    next(error);
  }
};

/** Move a location into a group, or clear its membership with `groupId: null`. */
export const assignLocationToGroup = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const raw = req.body.groupId;
    if (raw != null && typeof raw !== 'string') {
      throw new BadRequestError('groupId must be a string or null');
    }
    await locationGroupService.assignLocation(param(req, 'id'), raw ?? null);
    res.status(200).json({ success: true, data: { success: true } });
  } catch (error) {
    next(error);
  }
};
