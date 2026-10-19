import type { Request, Response, NextFunction } from "express";
import {
  createAccountSchema,
  patchAccountPlanSchema,
} from "../validators/accounts.validator";
import * as accountsService from "../services/accounts.service";

export async function createAccount(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const parsed = createAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.issues,
    });
    return;
  }
  try {
    const { name, planName } = parsed.data;
    const result = await accountsService.createAccount(name, planName);
    res.status(201).json({
      message: "Account created successfully",
      account: result.account,
      plan: result.plan,
      apiKey: result.apiKey,
      warning: "Save this API key now. It will not be returned again.",
    });
  } catch (error) {
    next(error);
  }
}

export async function changeAccountPlan(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const account = req.account!;

  const parsed = patchAccountPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.issues,
    });
    return;
  }

  try {
    const { planName } = parsed.data;
    const result = await accountsService.changeAccountPlan(
      account.id,
      planName,
    );
    res.status(200).json({
      message: "Account plan updated successfully",
      account: result.account,
      plan: result.plan,
    });
  } catch (error) {
    next(error);
  }
}
