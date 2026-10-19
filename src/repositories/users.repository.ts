import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { planRules, plans, users } from "../db/schema";

export async function findUserPlan(planName: string) {
  const [plan] = await db
    .select({
      id: plans.id,
      name: plans.name,
      scope: plans.scope,
      monthlyAllowance: planRules.monthlyAllowance,
      maxUnitsPerRequest: planRules.maxUnitsPerRequest,
    })
    .from(plans)
    .innerJoin(planRules, eq(plans.id, planRules.planId))
    .where(and(eq(plans.name, planName), eq(plans.scope, "user")))
    .limit(1);
  return plan ?? null;
}

export async function findUserByExternalId(
  accountId: number,
  externalUserId: string,
) {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.accountId, accountId),
        eq(users.externalUserId, externalUserId),
      ),
    )
    .limit(1);

  return user ?? null;
}

export async function createUser(data: {
  accountId: number;
  externalUserId: string;
  planId: number;
}) {
  const [user] = await db.insert(users).values(data).returning({
    id: users.id,
    externalUserId: users.externalUserId,
    planId: users.planId,
    createdAt: users.createdAt,
  });

  return user;
}

export async function updateUserPlan(
  accountId: number,
  userId: number,
  planId: number,
) {
  const [user] = await db
    .update(users)
    .set({ planId })
    .where(and(eq(users.id, userId), eq(users.accountId, accountId)))
    .returning({
      id: users.id,
      externalUserId: users.externalUserId,
      accountId: users.accountId,
      planId: users.planId,
    });

  return user ?? null;
}

export async function findUserDetails(accountId: number, userId: number) {
  const [user] = await db
    .select({
      id: users.id,
      externalUserId: users.externalUserId,
      accountId: users.accountId,
      planId: users.planId,
      createdAt: users.createdAt,
      monthlyAllowance: planRules.monthlyAllowance,
      maxUnitsPerRequest: planRules.maxUnitsPerRequest,
    })
    .from(users)
    .innerJoin(plans, eq(users.planId, plans.id))
    .innerJoin(planRules, eq(plans.id, planRules.planId))
    .where(and(eq(users.id, userId), eq(users.accountId, accountId)))
    .limit(1);
  return user ?? null;
}
