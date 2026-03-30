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
    SET_PASSWORD_VALIDATE: "/auth/set-password/validate",
    SET_PASSWORD: "/auth/set-password",
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
    TIMESHEET: "/sales-labor/timesheet",
    SALES_TREND: "/sales-labor/sales-trend",
    SALES_TREND_KPI: "/sales-labor/sales-trend-kpi",
    SALES_BY_CATEGORY: "/sales-labor/sales-by-category",
  },
  INVENTORY: {
    KPIS: "/inventory/kpis",
    VALID_COUNT_DATES: "/inventory/valid-count-dates",
    ORDERS: "/inventory/orders",
  },
  KITCHEN_PERFORMANCE: {
    LIST: "/kitchen-performance",
    IMPORT: "/kitchen-performance/import",
    DETAILS: "/kitchen-performance/details",
  },
  ACTIVITY_LOG: {
    LIST: "/activity-log",
  },
  ROLES: "/roles",
  USERS: "/users",
  TRAININGS: "/trainings",
  NOTIFICATIONS: "/notifications",
  REVIEWS: {
    CYCLES: "/reviews/cycles",
    DASHBOARD: "/reviews/dashboard",
    SETTINGS: "/reviews/settings",
  },
} as const;
