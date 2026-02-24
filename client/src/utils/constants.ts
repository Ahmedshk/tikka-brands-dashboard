export enum UserRole {
  OWNER = "Owner",
  DIRECTOR_OF_OPERATIONS = "Director of Operations",
  DISTRICT_MANAGER = "District Manager",
  GENERAL_MANAGER = "General Manager",
  SHIFT_SUPERVISOR = "Shift Supervisor",
  TEAM_MEMBER = "Team Member",
}

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: "/auth/login",
    LOGOUT: "/auth/logout",
    REFRESH: "/auth/refresh",
  },
  HEALTH: "/health",
  LOCATIONS: "/locations",
  LOGOS: "/logos",
  GOALS: "/goals",
  COMMAND_CENTER: {
    KPIS: "/command-center/kpis",
    HOURLY_SALES: "/command-center/hourly-sales",
  },
  SALES_LABOR: {
    KPIS: "/sales-labor/kpis",
    HOURLY_BREAKDOWN: "/sales-labor/hourly-breakdown",
    SALES_TREND: "/sales-labor/sales-trend",
    SALES_TREND_KPI: "/sales-labor/sales-trend-kpi",
    SALES_BY_CATEGORY: "/sales-labor/sales-by-category",
  },
  INVENTORY: {
    KPIS: "/inventory/kpis",
    ORDERS: "/inventory/orders",
  },
  ROLES: "/roles",
} as const;
