import { NavigationConfig } from "../types/navigation.types";
import { UserRole } from "../types";

// Import icons as React components
import CommandCenterIcon from "@assets/icons/command_center.svg?react";
import SalesAndLaborIcon from "@assets/icons/sales_and_labor.svg?react";
import InventoryFoodCostIcon from "@assets/icons/inventory_and_food_cost.svg?react";
import TeamHrIcon from "@assets/icons/team_and_hr.svg?react";
import CalendarEventsIcon from "@assets/icons/calendar_and_events.svg?react";
import AdminSettingsIcon from "@assets/icons/admin_and_settings.svg?react";
import OperationsIcon from "@assets/icons/operations.svg?react";

export const navigationConfig: NavigationConfig = [
  {
    label: "Command Center",
    path: "/dashboard/command-center",
    icon: CommandCenterIcon,
    allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
  },
  {
    label: "Sales & Labor",
    icon: SalesAndLaborIcon,
    allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
    children: [
      {
        label: "Sales & Labor Detail",
        path: "/dashboard/sales-labor-detail",
        allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
      },
      {
        label: "Sales Trend Reports",
        path: "/dashboard/sales-trend-reports",
        allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
      },
    ],
  },
  {
    label: "Operations",
    icon: OperationsIcon,
    allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
    children: [
      {
        label: "Kitchen Performance",
        path: "/dashboard/kitchen-performance",
        allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
      },
      {
        label: "Activity Log",
        path: "/dashboard/activity-log",
        allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
      },
      {
        label: "Ratings & Reviews",
        path: "/dashboard/ratings-and-reviews",
        allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
      },
    ],
  },
  {
    label: "Inventory & Food Cost",
    path: "/dashboard/inventory-food-cost",
    icon: InventoryFoodCostIcon,
    allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
  },
  {
    label: "Team & HR",
    icon: TeamHrIcon,
    allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
    children: [
      {
        label: "Training Management",
        path: "/dashboard/training-management",
        allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
      },
      {
        label: "Reviews Management",
        path: "/dashboard/reviews-management",
        allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
      },
      {
        label: "Disciplinary Management",
        path: "/dashboard/disciplinary-management",
        allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
      },
    ],
  },
  {
    label: "Calendar & Events",
    path: "/dashboard/calendar-events",
    icon: CalendarEventsIcon,
    allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
  },
  {
    label: "Admin & Settings",
    icon: AdminSettingsIcon,
    allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
    hasSeparator: true,
    children: [
      {
        label: "User Management",
        path: "/dashboard/user-management",
        allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
      },
      {
        label: "RBAC Management",
        path: "/dashboard/rbac-management",
        allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
      },
      {
        label: "Goal Setting",
        path: "/dashboard/goal-setting",
        allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
      },
      {
        label: "Location Management",
        path: "/dashboard/location-management",
        allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
      },
      {
        label: "Training Settings",
        path: "/dashboard/training-settings",
        allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
      },
      {
        label: "Review Settings",
        path: "/dashboard/review-settings",
        allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
      },
      {
        label: "Disciplinary Settings",
        path: "/dashboard/disciplinary-settings",
        allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
      },
      {
        label: "Events & Notifications",
        path: "/dashboard/events-notifications-settings",
        allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
      },
      {
        label: "Alerts & Notifications",
        path: "/dashboard/alerts-notifications-settings",
        allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
      },
      {
        label: "Data sync",
        path: "/dashboard/data-sync-settings",
        allowedRoles: Object.values(UserRole), // Placeholder: allow all roles
      },
    ],
  },
];
