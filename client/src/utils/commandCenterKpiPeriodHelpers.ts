export type CommandCenterKPIPeriod =
  | "today"
  | "yesterday"
  | "weekToDate"
  | "monthToDate"
  | "lastWeek";

export const COMMAND_CENTER_KPI_PERIOD_OPTIONS: {
  value: CommandCenterKPIPeriod;
  label: string;
}[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "weekToDate", label: "Week to date" },
  { value: "lastWeek", label: "Last week" },
  { value: "monthToDate", label: "Month to date" },
];

export function commandCenterKpiPeriodLabel(
  period: CommandCenterKPIPeriod,
): string {
  switch (period) {
    case "today":
      return "Today";
    case "yesterday":
      return "Yesterday";
    case "weekToDate":
      return "Week to date";
    case "monthToDate":
      return "Month to date";
    case "lastWeek":
      return "Last week";
    default: {
      const _exhaustive: never = period;
      return _exhaustive;
    }
  }
}
