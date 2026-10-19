import * as plansRepository from "../repositories/plans.repository";
export class PlanServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "PlanServiceError";
  }
}
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export async function getAllPlans(accountId?: number) {
  return plansRepository.findAllPlans(accountId);
}

export async function getPlan(id: number, accountId?: number) {
  const plan = await plansRepository.findPlanById(id, accountId);

  if (!plan) {
    throw new PlanServiceError("Plan not found", 404);
  }
  return plan;
}

export async function createPlan(
  accountId: number,
  data: {
    name: string;
    scope: "account" | "user";
    monthlyAllowance: number;
    maxUnitsPerRequest: number;
  },
) {
  const existing = await plansRepository.findPlanByNameAndScope(
    data.name,
    data.scope,
    accountId,
  );
  if (existing) {
    throw new PlanServiceError(
      "Plan already exists",
      409,
      "A plan with this name and scope already exists for this account or is predefined.",
    );
  }
  try {
    return await plansRepository.createCustomPlan({ ...data, accountId });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new PlanServiceError("Plan already exists", 409);
    }

    throw error;
  }
}

export async function updatePlan(
  id: number,
  accountId: number,
  changes: {
    name?: string;
    monthlyAllowance?: number;
    maxUnitsPerRequest?: number;
  },
) {
  const existing = await plansRepository.findPlanForUpdate(id);
  if (!existing) {
    throw new PlanServiceError("Plan not found", 404);
  }
  if (existing.isPredefined) {
    throw new PlanServiceError("Predefined plans cannot be modified.", 403);
  }
  if (existing.ownerAccountId !== accountId) {
    throw new PlanServiceError("Plan not found", 404);
  }
  try {
    const updatedPlan = await plansRepository.updateCustomPlan(
      id,
      accountId,
      changes,
    );

    if (!updatedPlan) {
      throw new PlanServiceError("Plan not found", 404);
    }
    return updatedPlan;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new PlanServiceError("Plan already exists", 409);
    }
    throw error;
  }
}
