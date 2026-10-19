import { db } from "../db";
import * as consumptionsRepository from "../repositories/consumptions.repository";
import { PlanSnapshot } from "../types/consumptions.type";
import { getUtcMonthStart } from "../utils/date";
import { ConsumptionQuerySchema } from "../validators/consumptions.validator";

export async function consume(
  accountId: number,
  userId: number,
  requestId: string,
  units: number,
) {
  return db.transaction(async (tx) => {
    await consumptionsRepository.lockAccount(tx, accountId);

    const previous = await consumptionsRepository.findPreviousConsumption(
      tx,
      accountId,
      requestId,
    );
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
    const accountPlan = await consumptionsRepository.findAccountPlan(
      tx,
      accountId,
    );

    if (!accountPlan) {
      throw new Error("Account plan or plan rules are missing.");
    }

    const userPlan = await consumptionsRepository.findUserPlan(
      tx,
      accountId,
      userId,
    );

    if (!userPlan) {
      return {
        statusCode: 404,
        body: {
          error: "User not found",
          message: "The user does not belong to the authenticated account.",
        },
      };
    }
    const accountSnapshot: PlanSnapshot = {
      planId: accountPlan.id,
      name: accountPlan.name,
      scope: accountPlan.scope,
      monthlyAllowance: accountPlan.monthlyAllowance,
      maxUnitsPerRequest: accountPlan.maxUnitsPerRequest,
    };
    const userSnapshot: PlanSnapshot = {
      planId: userPlan.id,
      name: userPlan.name,
      scope: userPlan.scope,
      monthlyAllowance: userPlan.monthlyAllowance,
      maxUnitsPerRequest: userPlan.maxUnitsPerRequest,
    };
    const now = new Date();
    const periodStart = getUtcMonthStart(now);

    const accountCounter = await consumptionsRepository.findAccountCounter(
      tx,
      accountId,
      periodStart,
    );
    const userCounter = await consumptionsRepository.findUserCounter(
      tx,
      accountId,
      userId,
      periodStart,
    );
    const accountUsed = accountCounter?.consumedUnits ?? 0;
    const userUsed = userCounter?.consumedUnits ?? 0;

    const reject = async (scope: "account" | "user", reason: string) => {
      const record = await consumptionsRepository.createConsumption(tx, {
        accountId: accountId,
        userId,
        requestId,
        units,
        status: "rejected",
        rejectionScope: scope,
        rejectionReason: reason,
        accountPlanSnapshot: accountSnapshot,
        userPlanSnapshot: userSnapshot,
        createdAt: now,
      });

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
    const record = await consumptionsRepository.createConsumption(tx, {
      accountId: accountId,
      userId,
      requestId,
      units,
      status: "accepted",
      rejectionScope: null,
      rejectionReason: null,
      accountPlanSnapshot: accountSnapshot,
      userPlanSnapshot: userSnapshot,
      createdAt: now,
    });

    if (accountCounter) {
      await consumptionsRepository.updateAccountCounter(
        tx,
        accountId,
        periodStart,
        accountUsed + units,
        now,
      );
    } else {
      await consumptionsRepository.createAccountCounter(
        tx,
        accountId,
        periodStart,
        accountUsed + units,
        now,
      );
    }
    if (userCounter) {
      await consumptionsRepository.updateUserCounter(
        tx,
        accountId,
        userId,
        periodStart,
        userUsed + units,
        now,
      );
    } else {
      await consumptionsRepository.createUserCounter(
        tx,
        accountId,
        userId,
        periodStart,
        userUsed + units,
        now,
      );
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
}

export async function getConsumptions(
  accountId: number,
  filters: ConsumptionQuerySchema,
) {
  const records = await consumptionsRepository.listConsumptions(
    accountId,
    filters,
  );

  return {
    consumptions: records,
    pagination: {
      limit: filters.limit,
      offset: filters.offset,
      returned: records.length,
    },
  };
}
