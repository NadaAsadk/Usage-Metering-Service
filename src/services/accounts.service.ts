import { createHash, randomBytes } from "node:crypto";
import * as accountsRepository from "../repositories/accounts.repository";

export class AccountServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "AccountServiceError";
  }
}

export async function createAccount(name: string, planName: string) {
  const plan = await accountsRepository.findAccountPlan(planName);

  if (!plan) {
    throw new AccountServiceError(
      "Account plan not found",
      400,
      "Choose a valid account plan, such as Starter or Growth.",
    );
  }

  const apiKey = `um_live_${randomBytes(32).toString("hex")}`;
  const apiKeyHash = createHash("sha256").update(apiKey).digest("hex");

  const account = await accountsRepository.createAccount({
    name,
    planId: plan.id,
    apiKeyHash,
  });

  return {
    account,
    plan: {
      name: plan.name,
      monthlyAllowance: plan.monthlyAllowance,
      maxUnitsPerRequest: plan.maxUnitsPerRequest,
    },
    apiKey,
  };
}

export async function changeAccountPlan(accountId: number, planName: string) {
  const plan = await accountsRepository.findAccountPlan(planName);

  if (!plan) {
    throw new AccountServiceError(
      "Account plan not found",
      400,
      "Choose a valid account plan, such as Starter or Growth.",
    );
  }

  const account = await accountsRepository.updateAccountPlan(
    accountId,
    plan.id,
  );

  if (!account) {
    throw new AccountServiceError("Account not found", 404);
  }

  return {
    account,
    plan: {
      name: plan.name,
      monthlyAllowance: plan.monthlyAllowance,
      maxUnitsPerRequest: plan.maxUnitsPerRequest,
    },
  };
}
