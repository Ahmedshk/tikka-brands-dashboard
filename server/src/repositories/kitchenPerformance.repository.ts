import { Types } from "mongoose";
import {
  KitchenPerformanceModel,
  type KitchenPerformanceRowSubdocument,
} from "../models/kitchenPerformance.model.js";

export class KitchenPerformanceRepository {
  async upsertByLocationAndDate(
    locationId: string,
    reportDate: string,
    rows: KitchenPerformanceRowSubdocument[],
    uploadedBy: string,
  ) {
    return KitchenPerformanceModel.findOneAndUpdate(
      { locationId: new Types.ObjectId(locationId), reportDate },
      {
        $set: {
          rows,
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
}
