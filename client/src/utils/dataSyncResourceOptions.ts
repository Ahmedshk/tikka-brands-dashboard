import type { IntegrationSyncResource } from "../services/integrationSync.service";

export const DATA_SYNC_RESOURCE_OPTIONS: {
  value: IntegrationSyncResource;
  label: string;
  needsDateRange: boolean;
}[] = [
  { value: "square_payments", label: "Square — payments", needsDateRange: true },
  { value: "square_orders", label: "Square — orders", needsDateRange: true },
  { value: "square_catalog", label: "Square — catalog", needsDateRange: false },
  { value: "square_team_members", label: "Square — team members", needsDateRange: false },
  {
    value: "homebase_timecards",
    label: "Homebase — timecards",
    needsDateRange: true,
  },
  { value: "marketman_valid_count_dates", label: "MarketMan — valid count dates", needsDateRange: false },
  {
    value: "marketman_orders_both",
    label: "MarketMan — orders (sent + delivery)",
    needsDateRange: true,
  },
  {
    value: "marketman_orders_sent",
    label: "MarketMan — orders by sent date",
    needsDateRange: true,
  },
  {
    value: "marketman_orders_delivery",
    label: "MarketMan — orders by delivery date",
    needsDateRange: true,
  },
  {
    value: "google_business_reviews",
    label: "Google Business — reviews",
    needsDateRange: false,
  },
];
