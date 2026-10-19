import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  accounts,
  consumptionRequests,
  planRules,
  plans,
  usageCounters,
  users,
} from "../db/schema";
import { PgTransaction } from "drizzle-orm/pg-core";
import { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { ExtractTablesWithRelations } from "drizzle-orm";
import { PlanSnapshot } from "../types/consumptions.type";
import { ConsumptionQuerySchema } from "../validators/consumptions.validator";

type TX = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof import("../db/schema"),
  ExtractTablesWithRelations<typeof import("../db/schema")>
>;
export async function lockAccount(tx: TX, accountId: number) {
  await tx.execute(
    sql`SELECT id FROM accounts WHERE id = ${accountId} FOR UPDATE`,
  );
}

export async function findPreviousConsumption(
  tx: TX,
  accountId: number,
  requestId: string,
) {
  const [previous] = await tx
    .select()
    .from(consumptionRequests)
    .where(
      and(
        eq(consumptionRequests.accountId, accountId),
        eq(consumptionRequests.requestId, requestId),
      ),
    )
    .limit(1);
  return previous;
}

export async function findAccountPlan(tx: TX, accountId: number) {
  const [accountPlan] = await tx
    .select({
      id: plans.id,
      name: plans.name,
      scope: plans.scope,
      monthlyAllowance: planRules.monthlyAllowance,
      maxUnitsPerRequest: planRules.maxUnitsPerRequest,
    })
    .from(accounts)
    .innerJoin(plans, eq(accounts.planId, plans.id))
    .innerJoin(planRules, eq(plans.id, planRules.planId))
    .where(eq(accounts.id, accountId))
    .limit(1);
  return accountPlan;
}

export async function findUserPlan(tx: TX, accountId: number, userId: number) {
  const [userPlan] = await tx
    .select({
      userId: users.id,
      externalUserId: users.externalUserId,
      id: plans.id,
      name: plans.name,
      scope: plans.scope,
      monthlyAllowance: planRules.monthlyAllowance,
      maxUnitsPerRequest: planRules.maxUnitsPerRequest,
    })
    .from(users)
    .innerJoin(plans, eq(users.planId, plans.id))
    .innerJoin(planRules, eq(plans.id, planRules.planId))
    .where(and(eq(users.id, userId), eq(users.accountId, accountId)))
    .limit(1);

  return userPlan;
}

export async function findAccountCounter(
  tx: TX,
  accountId: number,
  periodStart: string,
) {
  const [accountCounter] = await tx
    .select({
      consumedUnits: usageCounters.consumedUnits,
    })
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.accountId, accountId),
        isNull(usageCounters.userId),
        eq(usageCounters.periodStart, periodStart),
      ),
    )
    .limit(1);
  return accountCounter;
}

export async function findUserCounter(
  tx: TX,
  accountId: number,
  userId: number,
  periodStart: string,
) {
  const [userCounter] = await tx
    .select({
      consumedUnits: usageCounters.consumedUnits,
    })
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.accountId, accountId),
        eq(usageCounters.userId, userId),
        eq(usageCounters.periodStart, periodStart),
      ),
    )
    .limit(1);
  return userCounter;
}

export async function createConsumption(
  tx: TX,
  values: {
    accountId: number;
    userId: number;
    requestId: string;
    units: number;
    status: "accepted" | "rejected";
    rejectionScope: "account" | "user" | null;
    rejectionReason: string | null;
    accountPlanSnapshot: PlanSnapshot;
    userPlanSnapshot: PlanSnapshot;
    createdAt: Date;
  },
) {
  const [record] = await tx
    .insert(consumptionRequests)
    .values(values)
    .returning({ id: consumptionRequests.id });

  return record;
}

export async function updateAccountCounter(
  tx: TX,
  accountId: number,
  periodStart: string,
  consumedUnits: number,
  now: Date,
) {
  await tx
    .update(usageCounters)
    .set({ consumedUnits, updatedAt: now })
    .where(
      and(
        eq(usageCounters.accountId, accountId),
        isNull(usageCounters.userId),
        eq(usageCounters.periodStart, periodStart),
      ),
    );
}

export async function createAccountCounter(
  tx: TX,
  accountId: number,
  periodStart: string,
  units: number,
  now: Date,
) {
  await tx.insert(usageCounters).values({
    accountId: accountId,
    userId: null,
    periodStart,
    consumedUnits: units,
    updatedAt: now,
  });
}

export async function updateUserCounter(
  tx: TX,
  accountId: number,
  userId: number,
  periodStart: string,
  consumedUnits: number,
  now: Date,
) {
  await tx
    .update(usageCounters)
    .set({ consumedUnits, updatedAt: now })
    .where(
      and(
        eq(usageCounters.accountId, accountId),
        eq(usageCounters.userId, userId),
        eq(usageCounters.periodStart, periodStart),
      ),
    );
}

export async function createUserCounter(
  tx: TX,
  accountId: number,
  userId: number,
  periodStart: string,
  units: number,
  now: Date,
) {
  await tx.insert(usageCounters).values({
    accountId: accountId,
    userId: userId,
    periodStart,
    consumedUnits: units,
    updatedAt: now,
  });
}

export async function listConsumptions(
  accountId: number,
  filters: ConsumptionQuerySchema,
) {
  const conditions = [eq(consumptionRequests.accountId, accountId)];
  if (filters.userId !== undefined) {
    conditions.push(eq(consumptionRequests.userId, filters.userId));
  }
  if (filters.status == "accepted" || filters.status == "rejected") {
    conditions.push(eq(consumptionRequests.status, filters.status));
  }
  return db
    .select()
    .from(consumptionRequests)
    .where(and(...conditions))
    .orderBy(desc(consumptionRequests.createdAt))
    .limit(filters.limit)
    .offset(filters.offset);
}
