type ReportingFilter = {
  member: string;
  operator: string;
  values: string[];
};

function buildLocationFilter(squareLocationId: string): ReportingFilter {
  return {
    member: "KDS.location_id",
    operator: "equals",
    values: [squareLocationId],
  };
}

/** Square Reporting API date filters for KDS.local_date (business day in store TZ). */
export function buildKdsDateFilters(startDate: string, endDate: string): ReportingFilter[] {
  if (startDate === endDate) {
    return [
      {
        member: "KDS.local_date",
        operator: "equals",
        values: [startDate],
      },
    ];
  }
  return [
    {
      member: "KDS.local_date",
      operator: "inDateRange",
      values: [startDate, endDate],
    },
  ];
}

function baseQuery(
  squareLocationId: string,
  startDate: string,
  endDate: string,
): { filters: ReportingFilter[] } {
  return {
    filters: [buildLocationFilter(squareLocationId), ...buildKdsDateFilters(startDate, endDate)],
  };
}

export function buildKdsStationSummaryQuery(
  squareLocationId: string,
  startDate: string,
  endDate: string,
): Record<string, unknown> {
  return {
    ...baseQuery(squareLocationId, startDate, endDate),
    measures: ["KDS.ticket_count", "KDS.avg_ticket_time_seconds"],
    dimensions: ["KDS.device_code_name", "KDS.station_type", "KDS.location_name"],
  };
}

export function buildKdsTicketRowsQuery(
  squareLocationId: string,
  startDate: string,
  endDate: string,
): Record<string, unknown> {
  return {
    ...baseQuery(squareLocationId, startDate, endDate),
    measures: ["KDS.avg_ticket_time_seconds"],
    dimensions: [
      "KDS.device_code_name",
      "KDS.ticket_key",
      "KDS.ticket_name",
      "KDS.order_source",
      "KDS.display_on_kds_at",
      "KDS.time_due",
      "KDS.has_time_due",
      "KDS.actual_completed_at",
      "KDS.line_item_count",
      "KDS.is_late",
    ],
    limit: 10_000,
  };
}

export function buildKdsDeviceKpisQuery(
  squareLocationId: string,
  startDate: string,
  endDate: string,
): Record<string, unknown> {
  return {
    ...baseQuery(squareLocationId, startDate, endDate),
    measures: [
      "KDS.ticket_count",
      "KDS.total_line_items",
      "KDS.avg_ticket_time_seconds",
      "KDS.recall_count",
      "KDS.avg_line_items_per_ticket",
    ],
    dimensions: ["KDS.device_code_name"],
  };
}

export function buildKdsHourlyQuery(
  squareLocationId: string,
  startDate: string,
  endDate: string,
): Record<string, unknown> {
  return {
    ...baseQuery(squareLocationId, startDate, endDate),
    measures: ["KDS.ticket_count"],
    dimensions: ["KDS.device_code_name", "KDS.local_hour"],
  };
}

export function buildKdsItemPerformanceQuery(
  squareLocationId: string,
  startDate: string,
  endDate: string,
): Record<string, unknown> {
  return {
    ...baseQuery(squareLocationId, startDate, endDate),
    measures: [
      "KDS.quantity_sold",
      "KDS.avg_item_time_seconds",
      "KDS.min_item_time_seconds",
      "KDS.max_item_time_seconds",
    ],
    dimensions: ["KDS.device_code_name", "KDS.item_name", "KDS.variation"],
    limit: 10_000,
  };
}

export function buildKdsLineItemsPerTicketQuery(
  squareLocationId: string,
  startDate: string,
  endDate: string,
): Record<string, unknown> {
  return {
    ...baseQuery(squareLocationId, startDate, endDate),
    measures: ["KDS.items_count"],
    dimensions: [
      "KDS.device_code_name",
      "KDS.ticket_key",
      "KDS.order_id",
      "KDS.item_name",
      "KDS.variation",
      "KDS.quantity",
      "KDS.display_on_kds_at",
      "KDS.completed_at",
      "KDS.recalled_at",
    ],
    limit: 10_000,
  };
}

function buildItemSalesDateFilters(startDate: string, endDate: string): ReportingFilter[] {
  if (startDate === endDate) {
    return [
      {
        member: "ItemSales.local_date",
        operator: "equals",
        values: [startDate],
      },
    ];
  }
  return [
    {
      member: "ItemSales.local_date",
      operator: "inDateRange",
      values: [startDate, endDate],
    },
  ];
}

/** ItemSales rows used to attach modifier sub-lines to KDS ticket items (joined by order_id). */
export function buildItemSalesModifiersQuery(
  squareLocationId: string,
  startDate: string,
  endDate: string,
): Record<string, unknown> {
  return {
    filters: [
      {
        member: "ItemSales.location_id",
        operator: "equals",
        values: [squareLocationId],
      },
      ...buildItemSalesDateFilters(startDate, endDate),
    ],
    measures: ["ItemSales.items_sold_count"],
    dimensions: [
      "ItemSales.order_id",
      "ItemSales.item_name",
      "ItemSales.item_variation_name",
      "ItemSales.modifier_name",
    ],
    limit: 10_000,
  };
}
