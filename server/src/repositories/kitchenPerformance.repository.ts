import { Types } from "mongoose";
import {
  KitchenPerformanceModel,
  type KitchenPerformanceRawTicketSubdocument,
  type KitchenPerformanceRowSubdocument,
} from "../models/kitchenPerformance.model.js";

export class KitchenPerformanceRepository {
  async upsertByLocationAndDate(
    locationId: string,
    reportDate: string,
    rows: KitchenPerformanceRowSubdocument[],
    rawTickets: KitchenPerformanceRawTicketSubdocument[],
    uploadedBy: string,
  ) {
    return KitchenPerformanceModel.findOneAndUpdate(
      { locationId: new Types.ObjectId(locationId), reportDate },
      {
        $set: {
          rows,
          rawTickets,
          uploadedBy: new Types.ObjectId(uploadedBy),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  }

  async findByLocationAndDate(locationId: string, reportDate: string) {
    return KitchenPerformanceModel.findOne({
      locationId: new Types.ObjectId(locationId),
      reportDate,
    }).lean();
  }

  async findByLocationAndDateRange(locationId: string, startDate: string, endDate: string) {
    return KitchenPerformanceModel.find({
      locationId: new Types.ObjectId(locationId),
      reportDate: { $gte: startDate, $lte: endDate },
    })
      .sort({ reportDate: 1 })
      .lean();
  }
}
