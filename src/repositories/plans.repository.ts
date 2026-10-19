import { and, asc, eq, or } from "drizzle-orm";
import { db } from "../db";
import { planRules, plans } from "../db/schema";

const planFields = {
  id: plans.id,
  name: plans.name,
  scope: plans.scope,
  isPredefined: plans.isPredefined,
  monthlyAllowance: planRules.monthlyAllowance,
  maxUnitsPerRequest: planRules.maxUnitsPerRequest,
  createdAt: plans.createdAt,
};
export async function findAllPlans(accountId?: number) {
  const visibilityFilter =
    accountId === undefined
      ? eq(plans.isPredefined, true)
      : or(eq(plans.isPredefined, true), eq(plans.ownerAccountId, accountId));
  return db
    .select(planFields)
    .from(plans)
    .innerJoin(planRules, eq(plans.id, planRules.planId))
    .where(visibilityFilter)
    .orderBy(asc(plans.scope), asc(plans.id));
}

export async function findPlanById(id: number, accountId?: number) {
  const visibilityFilter =
    accountId === undefined
      ? eq(plans.isPredefined, true)
      : or(eq(plans.isPredefined, true), eq(plans.ownerAccountId, accountId));
  const [plan] = await db
    .select(planFields)
    .from(plans)
    .innerJoin(planRules, eq(plans.id, planRules.planId))
    .where(and(eq(plans.id, id), visibilityFilter))
    .limit(1);

  return plan ?? null;
}

export async function findPlanByNameAndScope(
  name: string,
  scope: "account" | "user",
  accountId: number,
) {
  const [plan] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(
      and(
        eq(plans.name, name),
        eq(plans.scope, scope),
        or(eq(plans.isPredefined, true), eq(plans.ownerAccountId, accountId)),
      ),
    )
    .limit(1);

  return plan ?? null;
}

export async function createCustomPlan(data: {
  name: string;
  scope: "account" | "user";
  monthlyAllowance: number;
  maxUnitsPerRequest: number;
  accountId: number;
}) {
  return db.transaction(async (tx) => {
    const [plan] = await tx
      .insert(plans)
      .values({
        name: data.name,
        scope: data.scope,
        isPredefined: false,
        ownerAccountId: data.accountId,
      })
      .returning();
    const [rule] = await tx
      .insert(planRules)
      .values({
        planId: plan.id,
        monthlyAllowance: data.monthlyAllowance,
        maxUnitsPerRequest: data.maxUnitsPerRequest,
      })
      .returning();
    return { ...plan, ...rule };
  });
}

export async function updateCustomPlan(
  id: number,
  accountId: number,
  changes: {
    name?: string;
    monthlyAllowance?: number;
    maxUnitsPerRequest?: number;
  },
) {
  return db.transaction(async (tx) => {
    const [ownedPlan] = await tx
      .select({ id: plans.id })
      .from(plans)
      .where(
        and(
          eq(plans.id, id),
          eq(plans.ownerAccountId, accountId),
          eq(plans.isPredefined, false),
        ),
      )
      .for("update")
      .limit(1);
      
    if (!ownedPlan) return null;
    if (changes.name !== undefined) {
      await tx
        .update(plans)
        .set({ name: changes.name })
        .where(eq(plans.id, id));
    }

    const ruleChanges: {
      monthlyAllowance?: number;
      maxUnitsPerRequest?: number;
    } = {};

    if (changes.monthlyAllowance !== undefined) {
      ruleChanges.monthlyAllowance = changes.monthlyAllowance;
    }

    if (changes.maxUnitsPerRequest !== undefined) {
      ruleChanges.maxUnitsPerRequest = changes.maxUnitsPerRequest;
    }

    if (Object.keys(ruleChanges).length > 0) {
      await tx
        .update(planRules)
        .set(ruleChanges)
        .where(eq(planRules.planId, id));
    }

    const [plan] = await tx
      .select(planFields)
      .from(plans)
      .innerJoin(planRules, eq(plans.id, planRules.planId))
      .where(eq(plans.id, id))
      .limit(1);

    return plan ?? null;
  });
}

export async function findPlanForUpdate(id: number) {
  const [plan] = await db
    .select({
      id: plans.id,
      isPredefined: plans.isPredefined,
      ownerAccountId: plans.ownerAccountId,
    })
    .from(plans)
    .where(eq(plans.id, id))
    .limit(1);

  return plan ?? null;
}
