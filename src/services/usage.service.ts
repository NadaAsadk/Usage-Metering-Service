import { getUtcMonthStart } from "../utils/date";
import * as usageRepository from "../repositories/usage.repository";

export class UsageServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "UsageServiceError";
  }
}

export async function getAccountUsage(accountId: number) {
  const periodStart = getUtcMonthStart(new Date());
  const plan = await usageRepository.getAccountPlan(accountId);

  if (!plan) {
    throw new UsageServiceError("Account plan or plan rules are missing", 404);
  }
  const counter = await usageRepository.getAccountCounter(
    accountId,
    periodStart,
  );

  const consumed = counter?.consumedUnits ?? 0;
  const remaining = Math.max(0, plan.monthlyAllowance - consumed);

  return {
    periodStart,
    plan: {
      id: plan.id,
      name: plan.name,
      monthlyAllowance: plan.monthlyAllowance,
      maxUnitsPerRequest: plan.maxUnitsPerRequest,
    },
    usage: {
      consumed,
      limit: plan.monthlyAllowance,
      remaining,
      overLimit: consumed > plan.monthlyAllowance,
    },
  };
}

export async function getUserUsage(accountId: number, userId: number) {
  const periodStart = getUtcMonthStart(new Date());
  const plan = await usageRepository.getUserPlan(accountId, userId);

  if (!plan) {
    throw new UsageServiceError("User plan or plan rules are missing", 404);
  }
  const counter = await usageRepository.getUserCounter(
    accountId,
    userId,
    periodStart,
  );

  const consumed = counter?.consumedUnits ?? 0;
  const remaining = Math.max(0, plan.monthlyAllowance - consumed);

  return {
    periodStart,
    plan: {
      id: plan.planId,
      name: plan.planName,
      monthlyAllowance: plan.monthlyAllowance,
      maxUnitsPerRequest: plan.maxUnitsPerRequest,
    },
    usage: {
      consumed,
      limit: plan.monthlyAllowance,
      remaining,
      overLimit: consumed > plan.monthlyAllowance,
    },
  };
}
