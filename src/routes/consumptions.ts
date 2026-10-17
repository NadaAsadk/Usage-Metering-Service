import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";

import { db } from "../db";
import {
  accounts,
  consumptionRequests,
  planRules,
  plans,
  usageCounters,
  users,
} from "../db/schema";

const router = Router();

const consumeSchema = z.object({
  userId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  requestId: z.string().trim().min(1).max(200),
  units: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

function getUtcMonthStart(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-01`;
}

// POST /api/consumptions
router.post("/", async (req, res, next) => {
  try {
    const account = req.account;

    if (!account) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = consumeSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.issues,
      });
      return;
    }
    const { userId, requestId, units } = parsed.data;
    const decision = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM accounts WHERE id = ${account.id} FOR UPDATE`,
      );
      const [previous] = await tx
        .select()
        .from(consumptionRequests)
        .where(
          and(
            eq(consumptionRequests.accountId, account.id),
            eq(consumptionRequests.requestId, requestId),
          ),
        )
        .limit(1);

      if (previous) {
        if (previous.userId !== userId || previous.units !== units) {
          return {
            statusCode: 409,
            body: {
              error: "Idempotency conflict",
              message:
                "This requestId was already used with a different userId or units value.",
            },
          };
        }
        return {
          statusCode: 200,
          body: {
            status: previous.status,
            requestId: previous.requestId,
            units: previous.units,
            rejectionScope: previous.rejectionScope,
            rejectionReason: previous.rejectionReason,
            idempotentReplay: true,
            message: "Returning the original decision; usage was not changed.",
          },
        };
      }
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
        .where(eq(accounts.id, account.id))
        .limit(1);

      if (!accountPlan) {
        throw new Error("Account plan or plan rules are missing.");
      }

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
        .where(and(eq(users.id, userId), eq(users.accountId, account.id)))
        .limit(1);

      if (!userPlan) {
        return {
          statusCode: 404,
          body: {
            error: "User not found",
            message: "The user does not belong to the authenticated account.",
          },
        };
      }
      const accountSnapshot = {
        planId: accountPlan.id,
        name: accountPlan.name,
        scope: accountPlan.scope,
        monthlyAllowance: accountPlan.monthlyAllowance,
        maxUnitsPerRequest: accountPlan.maxUnitsPerRequest,
      };
      const userSnapshot = {
        planId: userPlan.id,
        name: userPlan.name,
        scope: userPlan.scope,
        monthlyAllowance: userPlan.monthlyAllowance,
        maxUnitsPerRequest: userPlan.maxUnitsPerRequest,
      };
      const now = new Date();
      const periodStart = getUtcMonthStart(now);

      const [accountCounter] = await tx
        .select({
          consumedUnits: usageCounters.consumedUnits,
        })
        .from(usageCounters)
        .where(
          and(
            eq(usageCounters.accountId, account.id),
            isNull(usageCounters.userId),
            eq(usageCounters.periodStart, periodStart),
          ),
        )
        .limit(1);
      const [userCounter] = await tx
        .select({
          consumedUnits: usageCounters.consumedUnits,
        })
        .from(usageCounters)
        .where(
          and(
            eq(usageCounters.accountId, account.id),
            eq(usageCounters.userId, userId),
            eq(usageCounters.periodStart, periodStart),
          ),
        )
        .limit(1);

      const accountUsed = accountCounter?.consumedUnits ?? 0;
      const userUsed = userCounter?.consumedUnits ?? 0;

      const reject = async (scope: "account" | "user", reason: string) => {
        const [record] = await tx
          .insert(consumptionRequests)
          .values({
            accountId: account.id,
            userId,
            requestId,
            units,
            status: "rejected",
            rejectionScope: scope,
            rejectionReason: reason,
            accountPlanSnapshot: accountSnapshot,
            userPlanSnapshot: userSnapshot,
            createdAt: now,
          })
          .returning({ id: consumptionRequests.id });

        return {
          statusCode: 200,
          body: {
            status: "rejected",
            requestId,
            consumptionId: record.id,
            units,
            rejectionScope: scope,
            rejectionReason: reason,
            usage: {
              account: {
                consumed: accountUsed,
                limit: accountPlan.monthlyAllowance,
                remaining: Math.max(
                  0,
                  accountPlan.monthlyAllowance - accountUsed,
                ),
              },
              user: {
                consumed: userUsed,
                limit: userPlan.monthlyAllowance,
                remaining: Math.max(0, userPlan.monthlyAllowance - userUsed),
              },
            },
          },
        };
      };

      //REJECTION
      if (units > accountPlan.maxUnitsPerRequest) {
        return reject("account", "ACCOUNT_MAX_UNITS_PER_REQUEST_EXCEEDED");
      }
      if (units > userPlan.maxUnitsPerRequest) {
        return reject("user", "USER_MAX_UNITS_PER_REQUEST_EXCEEDED");
      }
      if (accountUsed + units > accountPlan.monthlyAllowance) {
        return reject("account", "ACCOUNT_MONTHLY_ALLOWANCE_EXCEEDED");
      }
      if (userUsed + units > userPlan.monthlyAllowance) {
        return reject("user", "USER_MONTHLY_ALLOWANCE_EXCEEDED");
      }

      //Acceptance
      const [record] = await tx
        .insert(consumptionRequests)
        .values({
          accountId: account.id,
          userId,
          requestId,
          units,
          status: "accepted",
          rejectionScope: null,
          rejectionReason: null,
          accountPlanSnapshot: accountSnapshot,
          userPlanSnapshot: userSnapshot,
          createdAt: now,
        })
        .returning({ id: consumptionRequests.id });
      if (accountCounter) {
        await tx
          .update(usageCounters)
          .set({ consumedUnits: accountUsed + units, updatedAt: now })
          .where(
            and(
              eq(usageCounters.accountId, account.id),
              isNull(usageCounters.userId),
              eq(usageCounters.periodStart, periodStart),
            ),
          );
      } else {
        await tx.insert(usageCounters).values({
          accountId: account.id,
          userId: null,
          periodStart,
          consumedUnits: units,
          updatedAt: now,
        });
      }
      if (userCounter) {
        await tx
          .update(usageCounters)
          .set({ consumedUnits: userUsed + units, updatedAt: now })
          .where(
            and(
              eq(usageCounters.accountId, account.id),
              eq(usageCounters.userId, userId),
              eq(usageCounters.periodStart, periodStart),
            ),
          );
      } else {
        await tx.insert(usageCounters).values({
          accountId: account.id,
          userId,
          periodStart,
          consumedUnits: units,
          updatedAt: now,
        });
      }
      return {
        statusCode: 200,
        body: {
          status: "accepted",
          requestId,
          consumptionId: record.id,
          units,
          usage: {
            periodStart,
            account: {
              consumed: accountUsed + units,
              limit: accountPlan.monthlyAllowance,
              remaining: accountPlan.monthlyAllowance - accountUsed - units,
            },
            user: {
              consumed: userUsed + units,
              limit: userPlan.monthlyAllowance,
              remaining: userPlan.monthlyAllowance - userUsed - units,
            },
          },
        },
      };
    });

    res.status(decision.statusCode).json(decision.body);
  } catch (error) {
    next(error);
  }
});

// GET /api/consumptions
router.get("/", async (req, res, next) => {
  try {
    const account = req.account;

    if (!account) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const rawLimit = req.query.limit;
    const rawOffset = req.query.offset;
    const rawUserId = req.query.userId;
    const rawStatus = req.query.status;

    const limit = rawLimit === undefined ? 20 : Number(rawLimit);
    const offset = rawOffset === undefined ? 0 : Number(rawOffset);

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isInteger(offset) ||
      offset < 0
    ) {
      res.status(400).json({
        error: "Invalid pagination",
        message: "limit must be 1-100 and offset must be zero or greater.",
      });
      return;
    }
    if (
      rawStatus !== undefined &&
      rawStatus !== "accepted" &&
      rawStatus !== "rejected"
    ) {
      res.status(400).json({
        error: "Invalid status",
        message: "status must be accepted or rejected.",
      });
      return;
    }
    const filters = [eq(consumptionRequests.accountId, account.id)];
    if (rawUserId !== undefined) {
      const userId = Number(rawUserId);
      if (!Number.isSafeInteger(userId) || userId <= 0) {
        res.status(400).json({
          error: "Invalid userId",
        });
        return;
      }
      filters.push(eq(consumptionRequests.userId, userId));
    }
    if (rawStatus == "accepted" || rawStatus == "rejected") {
      filters.push(eq(consumptionRequests.status, rawStatus));
    }
    const records = await db
      .select()
      .from(consumptionRequests)
      .where(and(...filters))
      .orderBy(desc(consumptionRequests.createdAt))
      .limit(limit)
      .offset(offset);
    res.status(200).json({
      consumptions: records,
      pagination: { limit, offset, returned: records.length },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
