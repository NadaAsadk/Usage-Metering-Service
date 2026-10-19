import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { accounts, planRules, plans } from "../db/schema";

export async function findAccountPlan(planName: string) {
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
    .where(and(eq(plans.name, planName), eq(plans.scope, "account")))
    .limit(1);
  return plan ?? null;
}

export async function createAccount(data: {
  name: string;
  planId: number;
  apiKeyHash: string;
}) {
  const [account] = await db.insert(accounts).values(data).returning({
    id: accounts.id,
    name: accounts.name,
    planId: accounts.planId,
    createdAt: accounts.createdAt,
  });
  return account;
}

export async function updateAccountPlan(accountId: number, planId: number) {
  const [account] = await db
    .update(accounts)
    .set({ planId })
    .where(eq(accounts.id, accountId))
    .returning({
      id: accounts.id,
      name: accounts.name,
      planId: accounts.planId,
      createdAt: accounts.createdAt,
    });
  return account ?? null;
}
