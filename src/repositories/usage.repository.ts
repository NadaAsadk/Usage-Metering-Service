import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { accounts, planRules, plans, usageCounters, users } from "../db/schema";

export async function getAccountPlan(accountId: number) {
  const [plan] = await db
    .select({
      id: plans.id,
      name: plans.name,
      monthlyAllowance: planRules.monthlyAllowance,
      maxUnitsPerRequest: planRules.maxUnitsPerRequest,
    })
    .from(accounts)
    .innerJoin(plans, eq(accounts.planId, plans.id))
    .innerJoin(planRules, eq(plans.id, planRules.planId))
    .where(eq(accounts.id, accountId))
    .limit(1);
  return plan ?? null;
}

export async function getUserPlan(accountId: number, userId: number) {
  const [plan] = await db
    .select({
      id: users.id,
      externalUserId: users.externalUserId,
      accountId: users.accountId,
      planId: plans.id,
      planName: plans.name,
      monthlyAllowance: planRules.monthlyAllowance,
      maxUnitsPerRequest: planRules.maxUnitsPerRequest,
    })
    .from(users)
    .innerJoin(plans, eq(users.planId, plans.id))
    .innerJoin(planRules, eq(plans.id, planRules.planId))
    .where(and(eq(users.id, userId), eq(users.accountId, accountId)))
    .limit(1);
  return plan ?? null;
}

export async function getAccountCounter(
  accountId: number,
  periodStart: string,
) {
  const [counter] = await db
    .select({ consumedUnits: usageCounters.consumedUnits })
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.accountId, accountId),
        isNull(usageCounters.userId),
        eq(usageCounters.periodStart, periodStart),
      ),
    )
    .limit(1);
  return counter ?? null;
}
export async function getUserCounter(
  accountId: number,
  userId: number,
  periodStart: string,
) {
  const [counter] = await db
    .select({ consumedUnits: usageCounters.consumedUnits })
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.accountId, accountId),
        eq(usageCounters.userId, userId),
        eq(usageCounters.periodStart, periodStart),
      ),
    )
    .limit(1);
  return counter ?? null;
}
