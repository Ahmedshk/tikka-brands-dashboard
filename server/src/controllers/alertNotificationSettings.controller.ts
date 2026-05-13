import type { Request, Response, NextFunction } from "express";
import { AlertNotificationSettingsService } from "../services/alertNotificationSettings.service.js";
import type {
  IAlertFinancialLaborToggles,
  LowInventoryCadence,
  IAlertReputationHrToggles,
  IAlertRoleBinding,
  IAlertRunSchedule,
} from "../types/alertNotification.types.js";
import { normalizeRoleBindingChannels } from "../utils/calendarRoleBindingChannels.util.js";
import { getAgenda } from "../config/agenda.js";
import { queueAlertReschedule } from "../services/alertAgendaSchedule.service.js";

const service = new AlertNotificationSettingsService();

export async function getAlertNotificationSettings(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const settings = await service.get();
    res.json({ success: true, data: { settings } });
  } catch (err) {
    next(err);
  }
}

export async function updateAlertNotificationSettings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as {
      financialLabor?: Partial<IAlertFinancialLaborToggles>;
      inventorySupplyChain?: Partial<{
        deliveryOverdueNotReceived: boolean;
        run: IAlertRunSchedule;
        lowInventoryEnabled: boolean;
        lowInventoryRun: IAlertRunSchedule;
        lowInventoryCadence: LowInventoryCadence;
      }>;
      reputationHr?: Partial<IAlertReputationHrToggles>;
      roleBindings?: Array<{
        category: IAlertRoleBinding["category"];
        subcategory?: IAlertRoleBinding["subcategory"];
        roleId: string;
        channels: { inApp: boolean; email: boolean; sms: boolean };
      }>;
    };

    const upsertPayload: Parameters<AlertNotificationSettingsService["upsert"]>[0] = {};
    if (body.financialLabor !== undefined) upsertPayload.financialLabor = body.financialLabor;
    if (body.inventorySupplyChain !== undefined) {
      upsertPayload.inventorySupplyChain = body.inventorySupplyChain;
    }
    if (body.reputationHr !== undefined) upsertPayload.reputationHr = body.reputationHr;
    if (body.roleBindings !== undefined) {
      upsertPayload.roleBindings = body.roleBindings.map((b) => ({
        category: b.category,
        ...(b.subcategory != null && String(b.subcategory).trim() !== ""
          ? { subcategory: b.subcategory }
          : {}),
        roleId: b.roleId,
        channels: normalizeRoleBindingChannels(b.channels),
      }));
    }

    const settings = await service.upsert(upsertPayload);

    try {
      const agenda = getAgenda();
      await queueAlertReschedule(agenda);
    } catch {
      // Agenda may not be ready in tests
    }

    res.json({ success: true, data: { settings } });
  } catch (err) {
    next(err);
  }
}
