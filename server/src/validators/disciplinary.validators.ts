import { z } from "zod";

const policySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1, "Policy title is required"),
  description: z.string().optional().default(""),
  points: z.number().min(0, "Points must be non-negative"),
});

const policySectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Section name is required"),
  order: z.number().min(0),
  policies: z.array(policySchema),
});

const immediateTerminationPolicySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1, "Policy title is required"),
  description: z.string().optional().default(""),
});

const guidelineSchema = z.object({
  id: z.string().min(1),
  pointThreshold: z.number().min(0, "Threshold must be non-negative"),
  action: z.string().min(1, "Action is required"),
});

export const updateDisciplinarySettingsSchema = z.object({
  body: z.object({
    rollingPeriodDays: z.number().int().min(1, "Rolling period must be at least 1 day"),
    pointsToTermination: z.number().int().min(1, "Points to termination must be at least 1"),
    policySections: z.array(policySectionSchema),
    immediateTerminationPolicies: z.array(immediateTerminationPolicySchema),
    disciplineGuidelines: z.array(guidelineSchema),
  }),
});

const appliedPolicySchema = z.object({
  policyId: z.string().min(1),
  sectionId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().default(""),
  points: z.number().min(0),
});

const appliedImmediateTerminationPolicySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().default(""),
});

export const createIncidentSchema = z.object({
  body: z.object({
    employeeId: z.string().min(1, "Employee ID is required"),
    locationId: z.string().min(1, "Location ID is required"),
    appliedPolicies: z.array(appliedPolicySchema).default([]),
    isImmediateTermination: z.boolean().default(false),
    immediateTerminationPolicies: z.array(appliedImmediateTerminationPolicySchema).optional(),
    immediateTerminationPolicy: appliedImmediateTerminationPolicySchema.optional(),
    detailsOfIncident: z.string().min(1, "Details of incident is required"),
    supervisorCommitment: z.string().min(1, "Supervisor commitment is required"),
    supervisorComments: z.string().min(1, "Supervisor comments is required"),
    positiveResults: z.string().optional(),
    negativeConsequences: z.string().optional(),
    incidentDate: z.string().optional(),
  }),
});

export const getEmployeeParamsSchema = z.object({
  params: z.object({
    employeeId: z.string().min(1, "Employee ID is required"),
  }),
});

export const getEmployeesQuerySchema = z.object({
  query: z.object({
    locationId: z.string().min(1, "Location ID is required"),
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
  }),
});

export const getIncidentsQuerySchema = z.object({
  params: z.object({
    employeeId: z.string().min(1, "Employee ID is required"),
  }),
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

export const sendForSignatureParamsSchema = z.object({
  params: z.object({
    employeeId: z.string().min(1, "Employee ID is required"),
  }),
});

export const embeddedSignIncidentParamsSchema = z.object({
  params: z.object({
    incidentId: z.string().min(1, "Incident ID is required"),
  }),
});
