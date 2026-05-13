import { Types } from "mongoose";
import {
  DisciplinaryIncidentModel,
  type DisciplinaryIncidentDocument,
} from "../models/disciplinaryIncident.model.js";

export class DisciplinaryIncidentRepository {
  async create(
    data: Record<string, unknown>,
  ): Promise<DisciplinaryIncidentDocument> {
    const doc = await DisciplinaryIncidentModel.create(data);
    return doc.toObject() as unknown as DisciplinaryIncidentDocument;
  }

  async findById(
    id: string,
  ): Promise<DisciplinaryIncidentDocument | null> {
    return DisciplinaryIncidentModel.findById(id)
      .populate("employeeId", "firstName lastName email")
      .populate("reportedBy", "firstName lastName email")
      .populate("locationId", "storeName")
      .lean() as Promise<DisciplinaryIncidentDocument | null>;
  }

  async findByAgreementId(
    agreementId: string,
  ): Promise<DisciplinaryIncidentDocument | null> {
    return DisciplinaryIncidentModel.findOne({ adobeAgreementId: agreementId })
      .lean() as Promise<DisciplinaryIncidentDocument | null>;
  }

  /** Most recent incident still awaiting the manager’s signature (embedded or not). */
  async findLatestPendingManagerForEmployee(
    employeeId: string,
  ): Promise<DisciplinaryIncidentDocument | null> {
    return DisciplinaryIncidentModel.findOne({
      employeeId: new Types.ObjectId(employeeId),
      signingStatus: "pending_manager",
    })
      .sort({ incidentDate: -1 })
      .lean() as Promise<DisciplinaryIncidentDocument | null>;
  }

  async findByEmployeeId(
    employeeId: string,
    options: { page?: number; limit?: number } = {},
  ): Promise<{ incidents: DisciplinaryIncidentDocument[]; total: number }> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;

    const filter = { employeeId: new Types.ObjectId(employeeId) };
    const [incidents, total] = await Promise.all([
      DisciplinaryIncidentModel.find(filter)
        .sort({ incidentDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("reportedBy", "firstName lastName")
        .lean(),
      DisciplinaryIncidentModel.countDocuments(filter),
    ]);

    return {
      incidents: incidents as unknown as DisciplinaryIncidentDocument[],
      total,
    };
  }

  async findActiveByEmployeeId(
    employeeId: string,
    cutoffDate: Date,
  ): Promise<DisciplinaryIncidentDocument[]> {
    return DisciplinaryIncidentModel.find({
      employeeId: new Types.ObjectId(employeeId),
      signingStatus: { $in: ["pending_employee", "completed"] },
      incidentDate: { $gte: cutoffDate },
    })
      .sort({ incidentDate: -1 })
      .lean() as Promise<DisciplinaryIncidentDocument[]>;
  }

  async findSignedDocuments(
    employeeId: string,
  ): Promise<DisciplinaryIncidentDocument[]> {
    return DisciplinaryIncidentModel.find({
      employeeId: new Types.ObjectId(employeeId),
      signingStatus: "completed",
      signedDocumentPublicId: { $exists: true, $ne: null },
    })
      .sort({ incidentDate: -1 })
      .select("signedDocumentPublicId auditTrailPublicId incidentDate totalPoints")
      .lean() as Promise<DisciplinaryIncidentDocument[]>;
  }

  async countPendingSignatures(employeeId: string): Promise<number> {
    return DisciplinaryIncidentModel.countDocuments({
      employeeId: new Types.ObjectId(employeeId),
      signingStatus: { $in: ["pending_manager", "pending_employee"] },
    });
  }

  async updateById(
    id: string,
    data: Record<string, unknown>,
  ): Promise<DisciplinaryIncidentDocument | null> {
    return DisciplinaryIncidentModel.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).lean() as Promise<DisciplinaryIncidentDocument | null>;
  }

  async findIncidentsExpiringInWindow(
    cutoffStart: Date,
    cutoffEnd: Date,
  ): Promise<DisciplinaryIncidentDocument[]> {
    return DisciplinaryIncidentModel.find({
      signingStatus: { $in: ["pending_employee", "completed"] },
      incidentDate: { $gte: cutoffStart, $lt: cutoffEnd },
    })
      .select("employeeId totalPoints incidentDate locationId")
      .lean() as Promise<DisciplinaryIncidentDocument[]>;
  }

  /** Sum rolling-window active points per employee (same rules as findActiveByEmployeeId). */
  async aggregateActivePointsByEmployeeIds(
    employeeIds: string[],
    cutoffDate: Date,
  ): Promise<Map<string, number>> {
    if (employeeIds.length === 0) return new Map();
    const oids = employeeIds.map((id) => new Types.ObjectId(id));
    const rows = await DisciplinaryIncidentModel.aggregate<{
      _id: Types.ObjectId;
      totalPoints: number;
    }>([
      {
        $match: {
          employeeId: { $in: oids },
          signingStatus: { $in: ["pending_employee", "completed"] },
          incidentDate: { $gte: cutoffDate },
        },
      },
      {
        $group: {
          _id: "$employeeId",
          totalPoints: { $sum: "$totalPoints" },
        },
      },
    ]).exec();
    return new Map(
      rows.map((r) => [r._id.toString(), r.totalPoints ?? 0]),
    );
  }

  /** Count pending manager/employee signature incidents per employee. */
  async aggregatePendingSignatureCountsByEmployeeIds(
    employeeIds: string[],
  ): Promise<Map<string, number>> {
    if (employeeIds.length === 0) return new Map();
    const oids = employeeIds.map((id) => new Types.ObjectId(id));
    const rows = await DisciplinaryIncidentModel.aggregate<{
      _id: Types.ObjectId;
      count: number;
    }>([
      {
        $match: {
          employeeId: { $in: oids },
          signingStatus: { $in: ["pending_manager", "pending_employee"] },
        },
      },
      {
        $group: {
          _id: "$employeeId",
          count: { $sum: 1 },
        },
      },
    ]).exec();
    return new Map(rows.map((r) => [r._id.toString(), r.count ?? 0]));
  }

  /** Most recent incidentDate per employee (any status). */
  async aggregateMaxIncidentDateByEmployeeIds(
    employeeIds: string[],
  ): Promise<Map<string, Date>> {
    if (employeeIds.length === 0) return new Map();
    const oids = employeeIds.map((id) => new Types.ObjectId(id));
    const rows = await DisciplinaryIncidentModel.aggregate<{
      _id: Types.ObjectId;
      maxDate: Date;
    }>([
      { $match: { employeeId: { $in: oids } } },
      {
        $group: {
          _id: "$employeeId",
          maxDate: { $max: "$incidentDate" },
        },
      },
    ]).exec();
    const entries: Array<[string, Date]> = [];
    for (const r of rows) {
      if (r.maxDate) entries.push([r._id.toString(), r.maxDate]);
    }
    return new Map(entries);
  }
}
