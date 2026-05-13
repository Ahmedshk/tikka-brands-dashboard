import type { IAlertRoleBinding } from "../types/alertNotification.types.js";
import type { SendNotificationOptions } from "../types/notification.types.js";

/** Rows for delivery-overdue alert emails (aligned with Order Tracker card columns). */
export interface DeliveryOverdueOrderEmailRow {
  poNumber: string;
  supplier: string;
  deliveryDate: string;
  status: string;
}

export const MAX_DELIVERY_OVERDUE_ORDERS_IN_EMAIL = 60;

export type AlertEmailSeverityStyle = {
  accentColorHex: string;
  calloutBg: string;
  calloutBorder: string;
  calloutText: string;
  severityLabel: string;
};

export type AlertEmailSendExtras = Pick<
  SendNotificationOptions,
  "emailSubject" | "emailTemplateFile" | "emailTemplateData" | "actionUrl" | "emailButtonText"
>;

export function sliceDeliveryOverdueRowsForEmail(
  alertKind: string,
  data: Record<string, unknown>,
): {
  overdueRowsForEmail: DeliveryOverdueOrderEmailRow[];
  overdueMoreCount: number;
} {
  const isDeliveryOverdueEmail = alertKind === "delivery_overdue";
  const overdueRowsRaw = isDeliveryOverdueEmail
    ? (data.overdueOrderRows as DeliveryOverdueOrderEmailRow[] | undefined)
    : undefined;
  const overdueRowsForEmail =
    Array.isArray(overdueRowsRaw) && overdueRowsRaw.length > 0
      ? overdueRowsRaw.slice(0, MAX_DELIVERY_OVERDUE_ORDERS_IN_EMAIL)
      : [];
  const overdueMoreCount =
    Array.isArray(overdueRowsRaw) && overdueRowsRaw.length > overdueRowsForEmail.length
      ? overdueRowsRaw.length - overdueRowsForEmail.length
      : 0;
  return { overdueRowsForEmail, overdueMoreCount };
}

export function resolveFinancialKpiRowsForEmail(
  category: IAlertRoleBinding["category"],
  data: Record<string, unknown>,
): Array<{ label: string; value: string }> | undefined {
  const financialKpiRowsRaw = data.financialKpiRows;
  if (
    category === "financial_labor" &&
    Array.isArray(financialKpiRowsRaw) &&
    financialKpiRowsRaw.length > 0
  ) {
    return financialKpiRowsRaw as Array<{ label: string; value: string }>;
  }
  return undefined;
}

function lowInventoryTemplateFields(
  data: Record<string, unknown>,
  storeName: string,
): Record<string, unknown> {
  return {
    locationName: typeof data.locationName === "string" ? data.locationName : storeName,
    inventoryName: typeof data.itemName === "string" ? data.itemName : "",
    categoryName: typeof data.categoryName === "string" ? data.categoryName : "",
    uomName: typeof data.uomName === "string" ? data.uomName : "",
    minOnHand: typeof data.minOnHand === "number" ? data.minOnHand : null,
    onHand: typeof data.onHand === "number" ? data.onHand : null,
  };
}

function buildAlertEmailTemplateData(params: {
  title: string;
  message: string;
  categoryLabel: string;
  locationLine: string;
  recipientFirstName: string;
  sevStyles: AlertEmailSeverityStyle;
  detailRows: Array<{ label: string; value: string }>;
  isLowInventoryEmail: boolean;
  data: Record<string, unknown>;
  storeName: string;
  overdueRowsForEmail: DeliveryOverdueOrderEmailRow[];
  overdueMoreCount: number;
  financialKpiRowsForEmail: Array<{ label: string; value: string }> | undefined;
}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    title: params.title,
    calloutLine: params.title,
    summaryMessage: params.message,
    categoryLabel: params.categoryLabel,
    locationLine: params.locationLine,
    severityLabel: params.sevStyles.severityLabel,
    detailRows: params.detailRows,
    firstName: params.recipientFirstName,
    accentColorHex: params.sevStyles.accentColorHex,
    calloutBg: params.sevStyles.calloutBg,
    calloutBorder: params.sevStyles.calloutBorder,
    calloutText: params.sevStyles.calloutText,
  };

  if (params.isLowInventoryEmail) {
    Object.assign(base, lowInventoryTemplateFields(params.data, params.storeName));
  }

  if (params.overdueRowsForEmail.length > 0) {
    base.deliveryOverdueOrders = params.overdueRowsForEmail;
    base.deliveryOverdueMoreCount = params.overdueMoreCount;
  }

  if (params.financialKpiRowsForEmail) {
    base.financialKpiRows = params.financialKpiRowsForEmail;
  }

  return base;
}

function alertEmailTemplateFileForKind(isLowInventoryEmail: boolean): string {
  return isLowInventoryEmail ? "alert-low-inventory-email.ejs" : "alert-notification-email.ejs";
}

export function buildAlertEmailSendExtras(params: {
  wantsEmail: boolean;
  title: string;
  message: string;
  categoryLabel: string;
  locationLine: string;
  recipientFirstName: string;
  sevStyles: AlertEmailSeverityStyle;
  detailRows: Array<{ label: string; value: string }>;
  isLowInventoryEmail: boolean;
  data: Record<string, unknown>;
  storeName: string;
  overdueRowsForEmail: DeliveryOverdueOrderEmailRow[];
  overdueMoreCount: number;
  financialKpiRowsForEmail: Array<{ label: string; value: string }> | undefined;
  emailActionUrl: string;
  emailPrimaryButtonText: string;
}): Partial<AlertEmailSendExtras> {
  if (!params.wantsEmail) {
    return {};
  }

  return {
    emailSubject: params.title,
    emailTemplateFile: alertEmailTemplateFileForKind(params.isLowInventoryEmail),
    emailTemplateData: buildAlertEmailTemplateData({
      title: params.title,
      message: params.message,
      categoryLabel: params.categoryLabel,
      locationLine: params.locationLine,
      recipientFirstName: params.recipientFirstName,
      sevStyles: params.sevStyles,
      detailRows: params.detailRows,
      isLowInventoryEmail: params.isLowInventoryEmail,
      data: params.data,
      storeName: params.storeName,
      overdueRowsForEmail: params.overdueRowsForEmail,
      overdueMoreCount: params.overdueMoreCount,
      financialKpiRowsForEmail: params.financialKpiRowsForEmail,
    }),
    actionUrl: params.emailActionUrl,
    emailButtonText: params.emailPrimaryButtonText,
  };
}
