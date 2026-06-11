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
    ALERTS: "/command-center/alerts",
    ALERTS_HISTORY: "/command-center/alerts/history",
    ALERTS_DISMISS: "/command-center/alerts/dismiss",
  },
  ALERT_NOTIFICATION_SETTINGS: "/alert-notification-settings",
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
  CALENDAR: {
    EVENTS: "/calendar/events",
    EVENT_TYPES: "/calendar/event-types",
    EVENT_TYPES_ALL: "/calendar/event-types/all",
    NOTIFICATION_SETTINGS: "/calendar/notification-settings",
    INTEGRATIONS_GOOGLE_CALENDARS: "/calendar/integrations/google-calendars",
    INTEGRATIONS_GOOGLE_CALENDARS_INFO: "/calendar/integrations/google-calendars/info",
  },
  ROLES: "/roles",
  USERS: "/users",
  PROFILE: "/profile",
  TRAININGS: "/trainings",
  NOTIFICATIONS: "/notifications",
  REVIEWS: {
    CYCLES: "/reviews/cycles",
    DASHBOARD: "/reviews/dashboard",
    SETTINGS: "/reviews/settings",
  },
  INTEGRATION_SYNC: {
    RUN: "/integration-sync/run",
    RUN_ALL_TODAY: "/integration-sync/run-all-today",
    LOGS: "/integration-sync/logs",
    ACTIVE: "/integration-sync/active",
  },
  GOOGLE_BUSINESS: {
    CONNECTION: "/google-business/connection",
    OAUTH_START: "/google-business/oauth/start",
  },
  GOOGLE_BUSINESS_REVIEWS: "/google-business-reviews",
} as const;
