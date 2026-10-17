import { Router } from "express";
import { db } from "../db";
import { accounts, planRules, plans, usageCounters, users } from "../db/schema";
import { and, eq, isNull } from "drizzle-orm";

const router = Router();

function getUtcMonthStart(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-01`;
}

// GET /api/usage/account
router.get("/account", async (req, res, next) => {
  try {
    const account = req.account;
    if (!account) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const periodStart = getUtcMonthStart(new Date());
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
      .where(eq(accounts.id, account.id))
      .limit(1);
    if (!plan) {
      res.status(500).json({
        error: "Account plan or plan rules are missing",
      });
      return;
    }
    const [counter] = await db
      .select({ consumedUnits: usageCounters.consumedUnits })
      .from(usageCounters)
      .where(
        and(
          eq(usageCounters.accountId, account.id),
          isNull(usageCounters.userId),
          eq(usageCounters.periodStart, periodStart),
        ),
      )
      .limit(1);
    const consumed = counter?.consumedUnits ?? 0;
    const remaining = Math.max(0, plan.monthlyAllowance - consumed);

    res.status(200).json({
      account: {
        id: account.id,
        name: account.name,
      },
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
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/usage/users/:id
router.get("/users/:id", async (req, res, next) => {
  try {
    const account = req.account;
    const userId = Number(req.params.id);

    if (!account) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    const [user] = await db
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
      .where(and(eq(users.id, userId), eq(users.accountId, account.id)))
      .limit(1);

    if (!user) {
      res.status(404).json({
        error: "User not found",
        message: "The user does not belong to the authenticated account.",
      });
      return;
    }

    const periodStart = getUtcMonthStart(new Date());

    const [counter] = await db
      .select({ consumedUnits: usageCounters.consumedUnits })
      .from(usageCounters)
      .where(
        and(
          eq(usageCounters.accountId, account.id),
          eq(usageCounters.userId, userId),
          eq(usageCounters.periodStart, periodStart),
        ),
      )
      .limit(1);
    const consumed = counter?.consumedUnits ?? 0;
    const remaining = Math.max(0, user.monthlyAllowance - consumed);

    res.status(200).json({
      user: {
        id: user.id,
        externalUserId: user.externalUserId,
      },
      periodStart,
      plan: {
        id: user.planId,
        name: user.planName,
        monthlyAllowance: user.monthlyAllowance,
        maxUnitsPerRequest: user.maxUnitsPerRequest,
      },
      usage: {
        consumed,
        limit: user.monthlyAllowance,
        remaining,
        overLimit: consumed > user.monthlyAllowance,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
