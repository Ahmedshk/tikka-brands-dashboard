import { Types } from 'mongoose';
import { TrainingAssignmentRepository } from '../repositories/trainingAssignment.repository.js';
import { RoleRepository } from '../repositories/role.repository.js';
import { TrainingModel } from '../models/training.model.js';
import { UserService } from './user.service.js';
import type { IUser } from '../types/user.types.js';
import type {
  ICreateAssignmentsPayload,
  IUpdateAssignmentPayload,
  IAssignmentListItem,
  IAssignmentDetail,
  IModuleProgressEntry,
  IAssignmentExtraFile,
} from '../types/trainingAssignment.types.js';
import { ValidationError, ForbiddenError } from '../utils/errors.util.js';
import { canManageTrainee, type HierarchyRole } from '../utils/roleHierarchy.util.js';

function toIdStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && '_id' in (v as object))
    return String((v as { _id: unknown })._id);
  return String(v);
}

function buildInitialModuleProgress(moduleCount: number): IModuleProgressEntry[] {
  return Array.from({ length: moduleCount }, () => ({
    completedAt: null,
    status: 'not_started' as const,
  }));
}

export class TrainingAssignmentService {
  private assignmentRepository: TrainingAssignmentRepository;
  private roleRepository: RoleRepository;
  private userService: UserService;

  constructor() {
    this.assignmentRepository = new TrainingAssignmentRepository();
    this.roleRepository = new RoleRepository();
    this.userService = new UserService();
  }

  /** Load roles as HierarchyRole[] for hierarchy checks. */
  private async getHierarchyRoles(): Promise<HierarchyRole[]> {
    const docs = await this.roleRepository.findAll(true);
    return docs.map((r) => {
      const reportsToVal = r.reportsTo;
      const reportsToStr =
        reportsToVal == null
          ? null
          : typeof reportsToVal === 'object' && reportsToVal !== null && '_id' in reportsToVal
            ? String((reportsToVal as { _id: unknown })._id)
            : String(reportsToVal);
      return {
        _id: toIdStr(r._id),
        name: r.name,
        reportsTo: reportsToStr,
        isSystem: r.isSystem,
      };
    });
  }

  /**
   * Throws ForbiddenError if actorUserId is not an ascendant of traineeUserId in the role hierarchy.
   * If actorUserId is null/undefined, skips the check (e.g. unauthenticated or legacy).
   */
  private async assertCanManageTrainee(
    actorUserId: string | undefined,
    traineeUserId: string
  ): Promise<void> {
    if (!actorUserId) return;
    const [actor, trainee, roles] = await Promise.all([
      this.userService.getUserById(actorUserId),
      this.userService.getUserById(traineeUserId),
      this.getHierarchyRoles(),
    ]);
    const actorRoleId = actor?.roleId ? String(actor.roleId) : null;
    const traineeRoleId = trainee?.roleId ? String(trainee.roleId) : null;
    if (!actorRoleId || !traineeRoleId) {
      throw new ForbiddenError('You can only assign or edit training for users who report to your role.');
    }
    if (!canManageTrainee(actorRoleId, traineeRoleId, roles)) {
      throw new ForbiddenError('You can only assign or edit training for users who report to your role.');
    }
  }

  async createAssignments(
    payload: ICreateAssignmentsPayload,
    assignedBy?: string
  ): Promise<{ created: number; skipped: number }> {
    const { trainingId, userIds } = payload;
    if (!userIds?.length) {
      throw new ValidationError('userIds must be a non-empty array.');
    }
    const training = await TrainingModel.findById(trainingId).lean();
    if (!training) {
      throw new ValidationError('Training not found.');
    }
    for (const uid of userIds) {
      await this.assertCanManageTrainee(assignedBy, uid);
    }

    const existingAssignments = await this.assignmentRepository.findByTrainingAndUsers(
      trainingId,
      userIds,
    );
    const alreadyAssignedUserIds = new Set(
      existingAssignments.map((a) => toIdStr(a.userId)),
    );
    const newUserIds = userIds.filter((uid) => !alreadyAssignedUserIds.has(uid));

    if (newUserIds.length === 0) {
      return { created: 0, skipped: userIds.length };
    }

    const moduleCount = training.modules?.length ?? 0;
    const progress = buildInitialModuleProgress(moduleCount);
    const assignedAt = new Date();
    const assignedByObj = assignedBy ? new Types.ObjectId(assignedBy) : undefined;
    const trainingObjId = new Types.ObjectId(trainingId);

    const toCreate: Array<{
      userId: Types.ObjectId;
      trainingId: Types.ObjectId;
      assignedAt: Date;
      assignedBy?: Types.ObjectId;
      moduleProgress: IModuleProgressEntry[];
    }> = [];
    for (const uid of newUserIds) {
      const user = await this.userService.getUserById(uid);
      if (!user) {
        throw new ValidationError(`User not found: ${uid}`);
      }
      const entry: {
        userId: Types.ObjectId;
        trainingId: Types.ObjectId;
        assignedAt: Date;
        assignedBy?: Types.ObjectId;
        moduleProgress: IModuleProgressEntry[];
      } = {
        userId: new Types.ObjectId(uid),
        trainingId: trainingObjId,
        assignedAt,
        moduleProgress: [...progress],
      };
      if (assignedByObj != null) entry.assignedBy = assignedByObj;
      toCreate.push(entry);
    }
    const created = await this.assignmentRepository.createMany(toCreate);
    return { created: created.length, skipped: alreadyAssignedUserIds.size };
  }

  async listByLocationId(
    locationId: string,
    options?: { search?: string; limit?: number }
  ): Promise<{ list: IAssignmentListItem[]; total: number }> {
    if (!locationId?.trim()) return { list: [], total: 0 };
    const userIds = await this.userService.getUserIdsWithAccessToLocation(
      locationId.trim()
    );
    const assignments = await this.assignmentRepository.findByUserIdIn(
      userIds
    );
    const trainingIds = [
      ...new Set(assignments.map((a) => toIdStr(a.trainingId)).filter(Boolean)),
    ];
    const userIdsFromAssignments = [
      ...new Set(assignments.map((a) => toIdStr(a.userId)).filter(Boolean)),
    ];
    const [trainings, userResults] = await Promise.all([
      TrainingModel.find({ _id: { $in: trainingIds.map((id) => new Types.ObjectId(id)) } })
        .lean()
        .exec(),
      Promise.all(userIdsFromAssignments.map((id) => this.userService.getUserById(id))),
    ]);
    const trainingMap = new Map(
      trainings.map((t) => [toIdStr(t._id), t])
    );
    const userMap = new Map<string, IUser | null>(
      userIdsFromAssignments.map((id, i) => [id, userResults[i] ?? null])
    );
    const list: IAssignmentListItem[] = assignments.map((a) => {
      const userId = toIdStr(a.userId);
      const trainingId = toIdStr(a.trainingId);
      const training = trainingMap.get(trainingId);
      const user = userMap.get(userId);
      const totalModules = training?.modules?.length ?? 0;
      const progress = a.moduleProgress ?? [];
      const completedModules = progress.filter((p) => p.status === 'completed').length;
      const allNotStarted =
        totalModules > 0 &&
        progress.length >= totalModules &&
        progress.every((p) => !p.status || p.status === 'not_started');
      const status =
        totalModules > 0 && completedModules >= totalModules
          ? 'Complete'
          : allNotStarted
            ? 'NotStarted'
            : 'Pending';
      const assignTo = user
        ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
        : '—';
      const role = user?.role ?? '—';
      const moduleDurations = (training?.modules ?? []).map((m) => {
        const d = (m as { duration?: number }).duration;
        return typeof d === 'number' && d >= 1 ? d : 1;
      });
      const moduleProgress = (a.moduleProgress ?? []).map((p) => ({
        completedAt: p.completedAt
          ? p.completedAt instanceof Date
            ? p.completedAt.toISOString()
            : String(p.completedAt)
          : null,
        status: p.status,
      }));
      return {
        _id: toIdStr(a._id),
        userId,
        trainingId,
        assignedAt:
          a.assignedAt instanceof Date
            ? a.assignedAt.toISOString()
            : String(a.assignedAt),
        trainingName: training?.name ?? '—',
        moduleCount: totalModules,
        assignTo,
        role,
        completedModules,
        totalModules,
        status,
        moduleDurations,
        moduleProgress,
      };
    });
    const searchTrim = options?.search?.trim().toLowerCase();
    let filtered = searchTrim
      ? list.filter((item) => item.assignTo.toLowerCase().includes(searchTrim))
      : list;
    const total = filtered.length;
    const limit = options?.limit;
    if (limit != null && limit > 0 && filtered.length > limit) {
      filtered = filtered.slice(0, limit);
    }
    return { list: filtered, total };
  }

  async getById(id: string, actorUserId?: string): Promise<IAssignmentDetail | null> {
    const assignment = await this.assignmentRepository.findById(id);
    if (!assignment) return null;
    const traineeUserId = toIdStr(assignment.userId);
    await this.assertCanManageTrainee(actorUserId, traineeUserId);
    const [user, training] = await Promise.all([
      this.userService.getUserById(toIdStr(assignment.userId)),
      TrainingModel.findById(assignment.trainingId).lean(),
    ]);
    if (!user || !training) return null;
    const rawAssignment = assignment as typeof assignment & { extraFiles?: IAssignmentExtraFile[] };
    const legacyExtraFiles = rawAssignment.extraFiles;
    const moduleProgress: IModuleProgressEntry[] = (assignment.moduleProgress ?? []).map((p, i) => {
      const entry: IModuleProgressEntry = {
        completedAt: p.completedAt,
        status: p.status,
      };
      if (p.managerNotes != null) entry.managerNotes = p.managerNotes;
      let ef = (p as IModuleProgressEntry & { extraFiles?: IAssignmentExtraFile[] }).extraFiles;
      if (!ef?.length && i === 0 && legacyExtraFiles?.length) {
        ef = legacyExtraFiles;
      }
      if (ef?.length) {
        entry.extraFiles = ef.map((f) => ({
          publicId: f.publicId,
          resourceType: f.resourceType,
          ...(f.filename != null && { filename: f.filename }),
          ...(f.format != null && { format: f.format }),
        }));
      }
      return entry;
    });
    const assignedByStr = assignment.assignedBy
      ? toIdStr(assignment.assignedBy)
      : undefined;
    const detail: IAssignmentDetail = {
      _id: toIdStr(assignment._id),
      userId: toIdStr(assignment.userId),
      trainingId: toIdStr(assignment.trainingId),
      assignedAt:
        assignment.assignedAt instanceof Date
          ? assignment.assignedAt.toISOString()
          : String(assignment.assignedAt),
      moduleProgress,
      user: {
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
        email: user.email,
        role: user.role ?? '—',
      },
      training: {
        name: training.name,
        modules: (training.modules ?? []).map((m) => {
          const mod = m as { name: string; duration?: number; moduleFiles?: typeof m.moduleFiles };
          const duration =
            typeof mod.duration === 'number' && mod.duration >= 1 ? mod.duration : 1;
          return {
            name: mod.name,
            duration,
            moduleFiles: (mod.moduleFiles ?? []).map((f) => {
              const file: { publicId: string; resourceType: 'image' | 'raw'; filename?: string; format?: string } = {
                publicId: f.publicId,
                resourceType: f.resourceType,
              };
              if (f.filename != null) file.filename = f.filename;
              if (f.format != null) file.format = f.format;
              return file;
            }),
          };
        }),
      },
    };
    if (assignedByStr != null) detail.assignedBy = assignedByStr;
    return detail;
  }

  async update(
    id: string,
    payload: IUpdateAssignmentPayload,
    actorUserId?: string
  ): Promise<IAssignmentDetail | null> {
    const assignment = await this.assignmentRepository.findById(id);
    if (!assignment) return null;
    const traineeUserId = toIdStr(assignment.userId);
    await this.assertCanManageTrainee(actorUserId, traineeUserId);
    const updated = await this.assignmentRepository.updateById(id, {
      moduleProgress: payload.moduleProgress,
    });
    if (!updated) return null;
    return this.getById(id, actorUserId);
  }

  async delete(id: string, actorUserId?: string): Promise<boolean> {
    const assignment = await this.assignmentRepository.findById(id);
    if (!assignment) return false;
    const traineeUserId = toIdStr(assignment.userId);
    await this.assertCanManageTrainee(actorUserId, traineeUserId);
    return this.assignmentRepository.deleteById(id);
  }
}
